// Details for the JIT compiler plate, part 4: code cache and compilation scheduling.
ATLAS.details("jit-compiler", {
  "code-cache": {
    s: "The managed region of memory where all generated code lives, with a size limit, a lookup from address to code object, and policies for what stays and what goes.",
    d: "It reserves address space up front, usually one or a few large regions so that calls between code can use short relative branches, and commits pages as code is installed. A lookup structure maps any instruction address back to its code object, which the stack walker, the profiler and the collector all need. It tracks total bytes and triggers eviction under pressure. The difficulty is fragmentation and size: code is variable-sized, long-lived and cannot be moved easily because other code points into it.",
    k: ["One contiguous reservation versus growing in separate chunks: short direct branches between all code, but the size limit is fixed at startup.", "Separate regions for tiers or hotness versus one pool: cold baseline code can be evicted without fragmenting optimized code, but needs more tuning and trampolines between regions."],
    p: ["A cache sized for a laptop fills on a server running many modules and starts evicting hot code.", "Failing to look up an address because an entry was removed too early crashes the stack walker."],
    v: "Fill the cache to its limit with a synthetic workload and confirm total code bytes stays below the limit, address lookups work for every live code object, and eviction logs the freed bytes.",
    dep: ["code-allocator","code-objects","executable-memory-protection"]
  },
  "code-objects": {
    s: "The record that wraps one piece of generated code: instructions plus its tables for relocation, safepoints, deoptimization and exceptions, and its identity, tier and state.",
    d: "A code object has a header with the owning function, the tier, flags such as marked-for-deoptimization, and the sizes and offsets of the instruction body and metadata. Metadata includes relocation info, safepoint and stack map tables, handler tables, frame state tables and the source position table. It is referenced from the function, from the registry and from callers. The collector treats it specially, since it is both an object and executable memory. The difficulty is lifetime: callers may point straight into the instructions, so freeing it needs to prove no activation or call remains.",
    k: ["Metadata inline with instructions versus in a separate side table: locality and one allocation, but the executable region mixes data and code.", "Reference counting versus tracing for code lifetime: prompt reclamation of dead code, but needs coordination with the collector for stack references."],
    p: ["Freeing a code object while a thread is still executing in it crashes at a random point.", "A marked-for-deoptimization flag set but not checked on one entry path lets invalid code run."],
    v: "Install a code object, then dump its header and tables from a running process and confirm every offset in the tables lies within the instruction body and matches the compiler's own output.",
    dep: ["relocation-info","stack-maps","frame-states","exception-tables"]
  },
  "code-allocator": {
    s: "Places new code into the cache, finding space, aligning entries, committing memory and tracking free ranges so installed code does not move.",
    d: "On installation, the allocator receives a finished buffer, picks a free range with first-fit or segregated size classes, aligns the entry to the target's preferred boundary, copies the bytes, applies relocations and publishes the address. Freed ranges are coalesced. Allocation must be thread-safe as background threads finish at the same time. It must also avoid fragmenting such that a large function cannot be placed. The difficulty is that code cannot be compacted cheaply, so fragmentation is permanent until eviction clears whole regions.",
    k: ["Size-class free lists versus a bump pointer with whole-region reset: tolerates individual frees, but fragments over time.", "Allocating the code during compilation versus copying a finished buffer: no copy, but the size is not known in advance and failed compiles waste space."],
    p: ["Fragmentation leaves enough total free space but no contiguous range, and installation fails while memory looks free.", "Aligning each entry wastes bytes across thousands of tiny stubs."],
    v: "Install and evict thousands of functions of random sizes and confirm the fragmentation metric stays bounded and no installation fails while the free total exceeds the requested size.",
    dep: ["code-cache","executable-memory-protection","code-objects"]
  },
  "executable-memory-protection": {
    s: "Controls the page permissions of the code cache so that memory is writable while code is installed or patched and executable otherwise, never both.",
    d: "Newly allocated pages are mapped writable, filled, and then switched to read and execute. Patching reverses that for the affected pages or uses a second writable mapping of the same physical memory. Switching permissions is a system call that can force other threads to refresh their address translations. Batching writes and scoped guards reduce the cost. On some platforms, a special mode or a signed-code requirement applies. The difficulty is overhead on patch-heavy workloads and making sure the writable window is never left open.",
    k: ["Toggling permissions around each patch versus a persistent dual mapping: smaller address space cost, but each patch pays a system call.", "Batching patches into one writable window versus patching immediately: far fewer permission changes, but there is a delay before a new target takes effect."],
    p: ["An exception during a patch leaves pages writable and executable.", "Another thread executing code on a page being switched faults and crashes."],
    v: "Install code and patch an inline cache while another thread runs that code in a loop; confirm no crashes occur, the new target takes effect, and the permissions return to read and execute.",
    dep: ["code-cache","icache-coherence"]
  },
  "icache-coherence": {
    s: "The step that makes sure a processor sees freshly written code, by flushing or invalidating its instruction cache and synchronizing other cores before the code runs.",
    d: "On processors with separate instruction and data caches that are not kept coherent, writing code leaves stale instructions in the instruction cache. After writing, the runtime cleans the data cache lines and invalidates the instruction ones for that range, then executes a barrier. Other cores executing the code must also be made to refetch, which for patching a running function requires a cross-core synchronization, often a signal or a system-provided call. Some targets do it in hardware. The difficulty is that failures are intermittent and appear only under particular core timing.",
    k: ["Flushing per patch versus batching flushes per installation: strict and simple, but patch-heavy code spends time flushing.", "Using an atomically patchable instruction form versus synchronizing all cores: patches take effect without a stop, but the code shape is constrained by the target."],
    p: ["Skipping the flush on a target where it matters runs stale instructions occasionally, with crashes that vanish under a debugger.", "A flush over too small a range misses the last bytes of an instruction."],
    v: "Repeatedly patch a call target in a running loop on multiple cores and confirm the program observes only the old or the new target, never a crash or a mixed instruction.",
    dep: ["code-patching","executable-memory-protection"]
  },
  "code-patching": {
    s: "Modifying generated code in place after installation, for inline cache updates, call target changes, deoptimization trampolines and entry-point redirection.",
    d: "Patches are small, aligned writes at recorded offsets: a call's target, a branch displacement, a constant in an instruction, or the first instructions of a function. They must appear atomic to other threads that may be executing nearby, which means single aligned writes of a size the hardware makes indivisible, or a two-step protocol through a temporary trap instruction. Each patch needs a permission change and an instruction cache flush. The difficulty is concurrency: a half-visible patch is an undefined instruction sequence on another thread.",
    k: ["In-place patching versus indirection through a mutable data slot: no cost on the call path and no extra load, but needs permission changes, flushes and atomicity care.", "Patching only at safepoints with all threads stopped versus live: simple and safe, but it costs a pause for each batch."],
    p: ["A non-atomic multi-byte patch seen by another thread mid-write executes a corrupted instruction.", "A patch applied to code that has since been evicted or relocated writes into unrelated memory."],
    v: "Patch call targets continuously while many threads execute through them, and confirm every call reaches either the old or the new target and the run finishes without a fault.",
    dep: ["executable-memory-protection","icache-coherence","relocation-info"]
  },
  "branch-trampolines": {
    s: "Small stubs that extend the reach of short-range branches and calls, by jumping to a nearby stub that then makes the long transfer to the real target.",
    d: "Relative calls and branches often have a limited displacement range. When the code cache is larger than that range, or the target is a runtime function far away, the call goes to a stub placed within reach, which loads the full address and jumps. Stubs are placed in islands interleaved with code, or per region, and shared by target. Patching a call to a far target means retargeting the stub, not the call. The difficulty is placing islands before they are needed, and keeping call sites patchable without a longer instruction sequence.",
    k: ["Interleaved islands versus one trampoline area per region: close to every call site, but fragments the code region.", "All calls via trampolines versus only when out of range: uniform and simple, but adds a jump to every call."],
    p: ["A call to a target moved out of range after a patch encodes a truncated displacement and jumps into the wrong place.", "Exhausting island space in a large region leaves no way to reach distant targets."],
    v: "Place a function and its callee farther apart than the direct branch range and confirm the call goes through a stub and reaches the callee, including after the callee is replaced.",
    dep: ["code-cache","code-patching","assembler"]
  },
  "code-aging": {
    s: "Tracks how long it has been since each code object last ran, so eviction can drop code that has gone cold and keep what is still in use.",
    d: "Each code object has an age that advances at periodic ticks, often at garbage collections, and is reset when the code runs. Resetting can be done by a small preamble that clears the age, or by the collector marking code found on stacks as recently used. Code that exceeds an age threshold is eligible for flushing. The same signal, combined with counter decay, informs tier decisions. The difficulty is cost: a store at every function entry for a rarely needed signal slows hot code, and sampling stack-based use misses code that runs briefly between samples.",
    k: ["An age-clearing preamble versus stack sampling at collection time: precise recency, but an added store on every call.", "Aging by timer versus by collection count: predictable wall-clock behavior, but program phases with no allocation never age code."],
    p: ["Code used only between collections is never seen on a stack and is evicted despite being hot.", "An age counter that saturates makes old and very old code indistinguishable."],
    v: "Run a function, idle through several aging ticks without calling it, and confirm its age counter advances in the debug view, then call it and confirm the age resets.",
    dep: ["code-objects","hotness-decay"]
  },
  "code-eviction": {
    s: "Reclaims code cache space by discarding code that is cold, invalid or low value, and returning the functions to a lower tier so they can be compiled again if needed.",
    d: "When usage passes a high-water mark, or an allocation fails, the cache picks victims by age, tier and size, unlinks them from their functions and from callers, makes sure no stack still runs them, and frees their ranges. Callers that pointed directly to them are repatched to a generic entry or a stub. Evicted functions return to the interpreter or baseline. The difficulty is safety: proving that nothing is executing or about to return into the code, and handling direct calls from other code, which need patching or indirection.",
    k: ["Evicting whole regions at once versus individual objects: easy and leaves no fragmentation, but throws away warm code with the cold.", "Preferring to evict optimized code versus baseline code: reclaims the most memory, but loses the most compile investment."],
    p: ["Evicting code that a thread is suspended inside crashes it on resume.", "Eviction thrashing: code is evicted and recompiled repeatedly because the cache is slightly too small for the working set."],
    v: "Run a workload larger than the cache limit and confirm eviction events appear in the log, memory stays under the limit, no crash occurs, and evicted functions return correct results in lower tiers.",
    dep: ["code-aging","code-cache","code-patching","stack-walking"]
  },
  "persistent-code-cache": {
    s: "Saves compiled code or profile data to disk after a run and loads it on the next start, to cut warmup, at the cost of validating that it still matches.",
    d: "What is stored ranges from bytecode only, through feedback profiles, to machine code with its relocation tables. On load, the engine checks a key made from the source hash, runtime version, target and flags, then rebuilds the code by applying relocations, or recompiles using the stored profile. Machine code is the hardest to persist because it embeds heap addresses and assumptions about shapes. The difficulty is validity: stale or tampered data must be detected, and speculated code needs its dependencies re-established before it can run.",
    k: ["Persisting bytecode and profiles versus machine code: simple, robust and portable, but still pays for compilation on every start.", "Trusting the cache by a version key versus verifying contents: fast to load, but a corrupt or malicious file runs as code."],
    p: ["A cache keyed only on source text keeps loading code compiled for a different flag or version.", "Stored feedback from an old run speculates on types that the new input never produces."],
    v: "Run a program twice and confirm the second start loads cached data, reaches optimized code sooner by a measured margin, and rejects the cache when the engine version or flags change.",
    dep: ["relocation-info","code-objects","dependency-registry"]
  },
  "compilation-queue": {
    s: "The ordered list of pending compile requests that feeds the compiler threads, with entries for function, tier, entry point and the feedback snapshot it was requested with.",
    d: "Tier-up requests enter the queue from the main thread; compile threads take jobs out; finished jobs go to a second list for installation. The queue deduplicates, so a function already pending is not added again, and removes jobs that no longer matter, such as for functions that died or were already optimized. It is bounded to avoid unbounded memory. The difficulty is policy under load: when the queue is long, deciding what to drop or reorder without starving important work.",
    k: ["A bounded queue that drops the oldest versus the newest: oldest favors fresh heat information, newest keeps work that was already waiting a long time.", "A separate queue per tier versus a single shared one: baseline compiles do not wait behind long optimizing ones, but needs thread and priority management."],
    p: ["Duplicate requests for one function compile it twice and waste a thread.", "A queue that only grows lets a stale job install code for a function whose assumptions already changed."],
    v: "Trigger many tier-up requests at once and confirm the queue depth peaks at the configured bound, no function appears twice, and jobs finish in the policy's order.",
    dep: ["tier-up-policy","job-prioritization"]
  },
  "job-prioritization": {
    s: "Ranks queued compiles so that the functions giving the largest speedup per unit of compile time are done first, and stale or low value jobs sink or are dropped.",
    d: "A job's priority comes from its current hotness, which is re-read when it is dequeued, the estimated compile cost from bytecode size, its tier, and whether it is a loop entry that blocks a long-running activation. Recently hot work is preferred over work that was hot long ago. Some systems let a job be promoted while waiting. The difficulty is that benefit is only estimated, and a priority that uses stale counters from request time ranks yesterday's hot code above today's.",
    k: ["Re-reading hotness at dequeue time versus using the value at request time: reflects the current workload, but needs a recomputation for every dequeue.", "Shortest-job-first versus hottest-first: small functions finish fast and help sooner, but a large hot function waits longer than it should."],
    p: ["A job ranked by request-time counters compiles a function that has gone cold.", "Starving large functions behind a continuous stream of small ones leaves the hottest code slow."],
    v: "Queue a cold large function, then a hot small one, then make the first hot; confirm the log shows jobs started in the order the stated ranking function gives.",
    dep: ["compilation-queue","hotness-counters"]
  },
  "background-compile-threads": {
    s: "Worker threads that run the optimizing compiler away from the program's threads, so compilation does not pause execution.",
    d: "A pool of threads takes jobs from the queue, runs the graph pipeline and backend, and puts a finished code buffer on the install list. Thread count balances speed against competing with the program for cores, and may adapt to load or battery state. They run at lower priority and must be able to stop promptly on shutdown or cancellation. The difficulty is isolation: they use a private allocator and handles to heap data rather than ordinary heap references, and everything they read must be safe to read concurrently.",
    k: ["Many compile threads versus one: faster warmup on large machines, but contention with the program and more memory for simultaneous graphs.", "Dedicated threads versus a shared worker pool: predictable latency, but idle cores sit unused when there is no work."],
    p: ["Compile threads that outnumber available cores slow the program they were meant to speed up.", "A compile thread holding a lock the main thread needs stalls the program."],
    v: "Run a warmup benchmark with compile threads on and off and confirm the main thread's longest pause stays within the budget with them on, while time to optimized code drops.",
    dep: ["compilation-queue","concurrent-graph-building","concurrent-heap-reads"]
  },
  "concurrent-graph-building": {
    s: "Splitting the early, heap-dependent part of compilation so that the main thread snapshots what is needed and the background thread builds the graph from the snapshot.",
    d: "Reading bytecode, feedback and object shapes from the heap is not safe against a mutating program. A common design does a short main-thread prologue that copies or references immutable bytecode, takes a feedback snapshot and records the dependencies and handles to the objects it needs, then lets the background thread build, optimize and generate code from those. The snapshot makes the compile deterministic. The difficulty is deciding what to snapshot, since copying too much blocks the main thread and too little forces racy reads.",
    k: ["Copying data into a snapshot versus holding persistent handles to live objects: no races with the program, but copy cost and the snapshot may go stale.", "A short main-thread prologue versus none: simplest background code, but the prologue is a pause proportional to function size."],
    p: ["A snapshot taken before a feedback update compiles with a profile that is already out of date.", "A handle to an object the collector moves or frees, used by the background thread, points at garbage."],
    v: "Compile a function while another thread rapidly mutates its feedback and objects, and confirm the output is consistent with the snapshot and the dependency list invalidates it when the snapshot assumptions were broken.",
    dep: ["background-compile-threads","concurrent-heap-reads","dependency-registry"]
  },
  "concurrent-heap-reads": {
    s: "The discipline that lets compile threads read heap objects safely while the program and collector run, through immutable fields, atomic reads and persistent handles.",
    d: "Only certain data is readable off-thread: bytecode arrays, shapes in a published state, and fields marked as write-once or read with atomic loads. Anything else goes through the snapshot. References that must survive collection are held as persistent handles which the collector updates. A read that finds a shape or field in transition must handle it or abort the compile. The difficulty is auditing: every compiler read of the heap is a potential race, and races produce rare miscompiles rather than crashes.",
    k: ["A fixed allow-list of safe reads versus general access with locks: provable no-race, but every new read needs review.", "Aborting a compile on an unexpected state versus waiting: no stall of the program, but wasted compile work and possible repeated aborts."],
    p: ["A single plain read of a mutable field in the compiler reads a half-written value under load.", "A persistent handle never released leaks an object for the process's life."],
    v: "Run compile stress with thread sanitizer on, with an aggressive mutator, and confirm there are zero reported races and the final outputs equal those from main-thread compilation.",
    dep: ["background-compile-threads","concurrent-graph-building"]
  },
  "compile-install-handshake": {
    s: "The final step in which a finished compile is checked for validity on the main thread and, if its assumptions still hold, installed and made reachable.",
    d: "A completed code buffer waits on a list until the main thread reaches a safe point, then the installer re-verifies the dependencies that the compile registered: if any broke while it was compiling, the code is discarded. Otherwise it allocates space in the code cache, applies relocations, wraps it in a code object, links it to the function and updates entry points. OSR code is stored separately for the loop to find. The difficulty is the race between finishing and invalidation, which must be closed before the code becomes visible.",
    k: ["Installing on the main thread versus on the compile thread: simple consistency with the program's state, but a pause per install.", "Re-checking dependencies at install versus trusting compile-time validity: closes the window where an assumption broke mid-compile, at the cost of a lookup for each dependency."],
    p: ["Installing code whose dependency was invalidated during compilation runs on a broken assumption.", "Linking the function before the code is fully written exposes a half-built entry to other threads."],
    v: "Invalidate a dependency while its job is compiling and confirm the install step discards the result, and the function stays in the lower tier with a log entry saying why.",
    dep: ["dependency-registry","code-allocator","code-objects","background-compile-threads"]
  },
  "compile-budgeting": {
    s: "Limits on total compilation effort per interval, such as time, memory or threads, so that bursts of tier-up requests cannot starve the program or exhaust memory.",
    d: "Budgets cap graph node counts, inlined bytes, compile time per job and the proportion of CPU the compile threads may use. Jobs that exceed a limit are abandoned and the function is marked so it will not retry at the same size. A global budget may slow request admission under load, or in constrained environments disable the top tier altogether. The difficulty is calibration: too tight and hot code stays slow, too loose and a burst of large compiles consumes memory and time.",
    k: ["Per-job limits versus a global rate limit: bounds the worst single compile, but a flood of small jobs can still overwhelm.", "Failing a compile that exceeds its budget versus finishing with fewer optimizations: bounded cost, but the work already spent is lost."],
    p: ["A node limit set for typical functions rejects the large hot function that matters most.", "An abandoned compile that is not recorded gets retried and abandoned forever."],
    v: "Submit a function larger than the node limit and confirm the compile is abandoned with a logged reason, the process memory stays bounded, and the function runs correctly in a lower tier.",
    dep: ["compilation-queue","compile-blacklist","background-compile-threads"]
  },
  "compile-cancellation": {
    s: "Stopping an in-flight or queued compile that is no longer wanted, because its function died, its assumptions broke or the engine is shutting down.",
    d: "Each job has a cancellation flag checked between phases and inside long loops of the compiler. When the main thread learns that a function was invalidated, redefined or collected, it sets the flag; the compile thread notices at its next check and returns, releasing its memory. Shutdown waits for compile threads to reach a safe stopping point. The difficulty is promptness without cost, since checking too rarely delays shutdown and wastes cores, and checking too often slows the compiler.",
    k: ["Cooperative flag checks versus forcible thread stop: safe cleanup of memory and locks, but latency depends on check placement.", "Cancelling on any assumption change versus letting the install step reject: frees threads sooner, but needs a mapping from changes to jobs."],
    p: ["A job that never checks the flag in its longest phase delays process exit by seconds.", "Cancelling a job but leaving its snapshot handles registered leaks heap objects."],
    v: "Start a large compile, invalidate its function, and confirm the thread stops within a bounded time with its memory and handles released, and the process exits promptly on shutdown.",
    dep: ["background-compile-threads","compilation-queue"]
  }
});
