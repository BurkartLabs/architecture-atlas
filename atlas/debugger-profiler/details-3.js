// Details for the debugger & profiler plate, part 3: sampling, tracing, memory profiling, overhead control.
ATLAS.details("debugger-profiler", {
  "sampling-triggers": {
    s: "The events that cause a sample to be taken: a periodic timer, a counter overflowing after a set number of events, or a software event such as a context switch.",
    d: "A timer trigger fires at a fixed frequency of CPU or wall time, which is simple and portable. A counter trigger fires after a configured number of cycles, retired instructions or misses, so samples land in proportion to that event rather than to time. Software triggers fire on page faults or scheduler events. The frequency is usually adjusted by the kernel so the target rate is met. It is hard because a fixed period can align with periodic program behavior and bias results, and because timer-based sampling cannot see time spent with interrupts disabled.",
    k: ["Time-based versus event-based triggers: time answers where seconds go, events answer where cache misses or branches go, and the two rankings often differ.", "Fixed frequency versus a randomized period: fixed is predictable, randomized avoids lockstep with periodic code at slight complexity."],
    p: ["A sampling frequency that matches a periodic task in the program makes samples always land in the same code.", "Code running with interrupts disabled never receives a timer sample and looks free."],
    v: "Profile a loop alternating two functions of known 3:1 cost with time-based sampling at two coprime rates; confirm both give shares near 75 and 25 percent and agree within the statistical error.",
    dep: ["perf-event-interface", "hardware-counters", "sampling-rate-control"]
  },
  "hardware-counters": {
    s: "Processor registers that count events such as cycles, instructions, branch mispredictions and cache misses, readable directly or programmed to interrupt on overflow.",
    d: "A small number of counters are each programmed with an event code and a mode, then read at the beginning and end of a region, or set to interrupt after N events. Events are defined by the processor model, with a few architectural ones common across models. The kernel virtualizes counters per thread by saving and restoring them at context switches. It is hard because counters differ between processor models, virtual machines may not expose them, and counted events are approximate for some speculative cases.",
    k: ["Counting mode versus sampling mode: counting gives exact totals with almost no cost, sampling attributes events to code but is statistical.", "Architectural events versus model-specific events: architectural events are portable, model-specific ones expose the detail needed for deep tuning and break on other processors."],
    p: ["A virtual machine with no counter support returns zeros, and the profile looks like an idle program.", "Event definitions copied from one processor model count something else on another."],
    v: "Count instructions and cycles over a loop with a known iteration count and instruction mix; confirm the instruction total matches the expected count within a small error and the ratio is stable across runs.",
    dep: ["perf-event-interface", "counter-multiplexing"]
  },
  "counter-multiplexing": {
    s: "Time-shares a small set of hardware counters among more events than there are counters, then scales results to estimate full-run totals.",
    d: "When more events are requested than counters exist, the kernel rotates groups of events onto the counters in turn, recording how long each was active versus enabled. Reported counts are scaled by enabled time divided by running time. Groups can force events to be counted together so ratios make sense. It is hard because scaling assumes behavior is uniform over time, so bursty code gives wrong estimates, and because events in different groups were not measured at the same moments.",
    k: ["Rotating groups versus requiring everything to fit: rotation gives broad coverage, restricting events gives exact counts and fewer choices.", "Scaled estimates versus raw counts: scaling approximates full totals, but hides the sampling error."],
    p: ["Short runs rarely give each group time on the hardware, so scaled values are mostly guess.", "Computing a ratio from events in different groups produces nonsense, such as a miss rate above one."],
    v: "Request eight events on a four-counter processor over a steady loop; confirm each reports a running-to-enabled ratio near one half and scaled totals within a few percent of single-group measurements.",
    dep: ["hardware-counters", "perf-event-interface"]
  },
  "sample-capture": {
    s: "The interrupt handler that records the interrupted instruction address, thread, processor and timestamp, writes them to a buffer and returns quickly.",
    d: "On a timer or counter overflow the processor interrupts the running thread and the handler runs in an interrupt-like context with strict limits: no sleeping, no allocation, short execution. It reads the saved program counter, task identity and a timestamp, optionally the stack, and writes a record into a per-processor ring buffer. User space drains the buffer. It is hard because the handler can fire at any instruction, including inside the kernel with locks held, and because anything it touches, such as user memory, can fault.",
    k: ["Doing minimal work in the handler versus unwinding there: minimal keeps cost low and data raw, unwinding in place saves the stack copy but can fault.", "Non-maskable interrupts versus ordinary interrupts: non-maskable ones can sample interrupt-disabled code, but are the most restricted environment."],
    p: ["A handler that touches paged-out user memory faults inside an interrupt and the sample is lost or the system hangs.", "A slow handler lets interrupts pile up, so most of the run is spent sampling."],
    v: "Sample a spin loop in kernel and user mode for ten seconds at a high rate; confirm sample counts match rate times time within a small loss, with correct thread and processor ids on each record.",
    dep: ["sampling-triggers", "event-ring-buffers", "perf-event-interface"]
  },
  "stack-capture": {
    s: "Records the call chain at each sample, by walking frame pointers in the handler, copying raw stack bytes for later unwinding, or reading special branch hardware.",
    d: "Three methods dominate. Walking frame pointers is cheap but needs code that keeps them. Copying a few kilobytes of the stack plus registers lets unwinding use unwind tables later, at the cost of larger files. Hardware that records recent taken branches provides a short call chain without software. Kernel and user stacks are captured separately and joined. It is hard because each method has blind spots, and the copied stack is truncated for deep recursion.",
    k: ["Frame pointer walk versus stack copy: the walk is compact and requires compiler cooperation, the copy works for any code and multiplies data volume.", "Capturing a fixed stack depth versus the whole stack: a limit bounds cost and truncates deep stacks, which then lose their roots."],
    p: ["A stack copy too small for a deep call chain truncates the root, and totals per top-level function are wrong.", "Frame-pointer walking in libraries built without them yields a short, misleading chain."],
    v: "Profile a program calling through nested functions ten levels deep using each method; confirm all three show the same ten frames when the code is built to support them and differences are explained by known blind spots.",
    dep: ["frame-pointer-unwinding", "unwind-table-interpreter", "sample-capture"]
  },
  "skid-and-precise-events": {
    s: "The delay between an event and the interrupt that reports it, which attributes samples to a later instruction, and the hardware modes that reduce or remove it.",
    d: "A counter overflow interrupt is delivered after instructions already in flight have completed, so the recorded address is several instructions after the one that caused the event. Precise modes record the actual instruction's address by hardware assistance, often through a buffer written by the processor itself, with a defined offset. It is hard because precision varies per event, precise modes have their own restrictions, and without them cost appears on the wrong instruction, especially after stalled loads.",
    k: ["Hardware-assisted precise sampling versus ordinary interrupts: precise attributes to the right instruction, but is limited to some events and costs setup.", "Correcting skid in software by looking backward versus accepting it: correction helps for simple cases but is a heuristic across branches."],
    p: ["A cache miss is blamed on the instruction after the missing load, so the wrong operand gets tuned.", "Enabling a precise mode for an unsupported event silently falls back to imprecise sampling."],
    v: "Sample cache misses from a loop with one known missing load, with and without precise mode; confirm the precise run puts most samples on the load instruction and the other spreads them over following instructions.",
    dep: ["hardware-counters", "perf-event-interface", "sample-attribution"]
  },
  "sample-attribution": {
    s: "Assigns each sample to a process, module, function, line and optionally a request or label, using the address, thread identity and the maps in effect at that time.",
    d: "The raw record has an address and a thread id. Attribution looks up which module covered that address at the sample's time, converts to a module-relative offset, and resolves it to a function and line with symbols. Labels, such as the thread name or a request id set by the program, attach context. It is hard because modules change, code is generated at runtime with no file behind it, and kernel samples need kernel symbols matching the running kernel.",
    k: ["Resolving at record time versus later: record-time resolution gives names immediately but costs in the collection path, later resolution keeps collection cheap and needs good module records.", "Attributing to inlined callees versus the physical function: callee attribution matches the source, physical is exact and less informative."],
    p: ["Samples from just-in-time compiled code attribute to an unknown region and vanish from rankings.", "A module remapped mid-run makes later samples resolve against the old layout."],
    v: "Profile a program that loads a plugin and runs generated code; confirm samples resolve to the plugin's functions with correct names and the generated code appears under its registered names rather than unknown.",
    dep: ["module-map-tracking", "symbol-lookup", "address-normalization"]
  },
  "off-cpu-sampling": {
    s: "Measures time threads spend blocked, on locks, I/O or scheduling delay, by recording stacks at the moment they sleep and wake.",
    d: "CPU sampling shows only running threads, so a service that is slow because it waits shows nothing. Off-CPU profiling hooks the scheduler: at context switch out it saves the stack and time, at switch in it computes the blocked duration and attributes it to that stack. The result is a profile weighted by wait time. It is hard because blocked time includes legitimate idle waiting, the number of events is huge, and the wake-up cause is in another thread's stack.",
    k: ["Tracing every context switch versus sampling blocked threads at intervals: tracing is exact and expensive, sampling is cheap and misses short waits.", "Attributing wait to the waiter versus the waker: the waiter shows where time is lost, the waker shows who caused it."],
    p: ["Idle worker threads waiting for work dominate the profile and bury the real blocking.", "Tracing all context switches on a busy host adds enough overhead to change the wait times being measured."],
    v: "Profile a program that sleeps 100 ms in a lock on one thread; confirm the off-CPU profile attributes about that wait to the lock's call stack while the CPU profile shows almost none.",
    dep: ["kernel-tracing-facility", "stack-capture", "event-ring-buffers"]
  },
  "static-probes": {
    s: "Probe points compiled into a program at chosen places, normally a no-op, that a tracer can enable at run time with near-zero cost while disabled.",
    d: "The compiler or a macro emits a single no-op instruction at each probe site and records its address, name and argument locations in a notes section of the file. A tracer reads the notes, patches the no-op into a trap or jump when enabled, and reads the arguments from the recorded registers or memory. Names are stable across builds, unlike function addresses. It is hard because argument descriptions must stay valid after optimization, and enabling needs a safe way to patch live code.",
    k: ["Static probes versus dynamic probes: static ones have stable names and argument meanings, dynamic ones can go anywhere but break when code changes.", "A no-op patched to a trap versus a conditional branch on a flag: patching has no cost when off, a flag check costs a load and branch on every pass."],
    p: ["A probe's argument location goes stale after the compiler moves the value, and the tracer reads the wrong register.", "Probes in hot loops that are enabled in production add the cost of a trap per iteration."],
    v: "Enable a probe in a function called a million times a second; confirm each call yields one event with correct arguments, and with the probe disabled the loop's timing matches a build without it within noise.",
    dep: ["code-patch-protection", "debug-info-parser", "process-address-map"]
  },
  "dynamic-probes": {
    s: "Probes inserted at run time at an arbitrary function entry, return or instruction, in user programs or the kernel, with no change to the program's files.",
    d: "The tracer finds the address from symbols or debug information, saves the original instruction, and replaces it with a breakpoint or jump to a handler. The handler records chosen arguments, then executes the displaced instruction out of line and returns. Return probes swap the return address to capture exit values and duration. It is hard because code may not be safely patchable at every address, instructions that read the program counter must be rewritten, and recursion or multiple threads must not confuse the saved return state.",
    k: ["Breakpoint-based probes versus jump-based probes: breakpoints work at any instruction but trap on every hit, jumps are faster but need space for a jump.", "Return probes by rewriting the return address versus function-exit instrumentation: rewriting needs no exit knowledge, but can break unwinding and exception handling."],
    p: ["Probing the probing code itself, or code that runs in interrupt context, causes recursive traps and a hang.", "A rewritten return address breaks stack walks, so stacks collected inside the probed function are wrong."],
    v: "Place entry and return probes on a function called recursively across threads; confirm every entry has a matching return with correct arguments and duration, and removing the probes restores original code bytes.",
    dep: ["cross-process-memory", "software-breakpoints", "in-kernel-filters", "symbol-lookup"]
  },
  "function-entry-hooks": {
    s: "Compiler-inserted calls at every function entry and exit, giving complete call and return events for a build made with the option.",
    d: "With the option, the compiler adds a call to a hook function at each function's start and end, passing the function address and call site. The hook runs user code, such as pushing a timestamp and address into a buffer, from which a trace of every call is reconstructed. Selective variants limit instrumentation to listed functions or those over a size. It is hard because the hook itself must not be instrumented, can disturb register allocation and inlining, and slows the program by a large factor in call-heavy code.",
    k: ["Instrumenting every function versus a filtered list: complete traces show everything and cost too much, filters keep the cost reasonable but may miss the cause.", "Hooks written to a buffer versus computing summaries inline: buffers allow arbitrary analysis later, inline summaries use less memory and time."],
    p: ["Instrumenting tiny functions makes them non-inlinable and grows runtime several fold, distorting the profile.", "A hook that calls instrumented code recurses until the stack overflows."],
    v: "Build a program with entry and exit hooks and run a known call tree; confirm the trace has exactly one entry and one exit per call in matching order and call counts equal the tree's, with measured slowdown reported.",
    dep: ["event-ring-buffers", "trace-timestamping", "symbol-lookup"]
  },
  "binary-instrumentation": {
    s: "Rewrites a program's machine code as it loads or runs, inserting analysis code around instructions, blocks or calls, with no source or rebuild.",
    d: "A framework either translates code blocks just in time into a cache with extra instrumentation or patches code in place. Analysis routines are called at chosen points, such as every memory access, branch or allocation. It can build call counts, memory access traces, or race detectors. It is hard because translated code must preserve every behavior including self-modifying code and signals, run with the same stack layout assumptions, and cost often reaches ten or fifty times slowdown.",
    k: ["Just-in-time translation versus static rewriting: translation handles all code including generated, static rewriting is faster when the whole program is known.", "Instrumenting every instruction versus selected regions: full coverage is exact and very slow, regions focus the cost where it matters."],
    p: ["Self-modifying or generated code is not re-translated after it changes, so the instrumented copy runs stale code.", "A slowdown of fifty times changes thread timing enough that the bug being sought never occurs."],
    v: "Instrument every memory access of a program with a known out-of-bounds write; confirm the tool reports it at the right instruction, and that output of the instrumented and uninstrumented runs is otherwise identical.",
    dep: ["code-patch-protection", "process-address-map", "disassembler"]
  },
  "in-kernel-filters": {
    s: "Small verified programs loaded into the kernel that run at probe points, filter and aggregate events in place, and send only summaries to user space.",
    d: "A compiler turns a short script into bytecode. The kernel's verifier checks that it terminates, accesses only allowed memory and calls only permitted helpers, then it is translated and attached to a probe, tracepoint or counter event. The program updates maps, counts by key or histograms, so large event streams reduce to a table read occasionally. It is hard because the verifier restricts program size and loops, programs cannot allocate or sleep, and reading user memory may fault.",
    k: ["In-kernel aggregation versus streaming all events: aggregation cuts data volume by orders of magnitude, streaming keeps every event for later analysis.", "A verified bytecode versus loadable kernel modules: verification makes it safe to load from tools, modules have no limits and can crash the system."],
    p: ["A program rejected by the verifier on a different kernel version leaves the tool failing only on some hosts.", "An unbounded map fills and silently drops new keys, so the histogram has missing tail values."],
    v: "Attach a program counting calls by process to a hot function for a minute; confirm map counts total the true number of calls within the loss indicator, and detaching removes all overhead.",
    dep: ["kernel-tracing-facility", "dynamic-probes", "event-ring-buffers"]
  },
  "event-ring-buffers": {
    s: "Per-processor circular buffers where producers append trace and sample records without locks and a consumer drains them, dropping records on overflow.",
    d: "Each processor has a buffer with a write position advanced by the producer and a read position advanced by the consumer. Records have length headers, and the buffer is mapped into the consumer's address space so reads need no copies. When full, the policy is to overwrite the oldest data or drop new records and count the loss. It is hard because writes can come from interrupt context at any time, records can span the wrap point, and ordering across processors needs timestamps to merge.",
    k: ["Overwrite oldest versus drop newest: overwrite keeps the latest history before a failure, drop keeps the beginning of the run intact.", "Per-processor buffers versus one shared buffer: per-processor avoids contention and needs merging, a shared one gives order and serializes writers."],
    p: ["A consumer that wakes too rarely lets buffers wrap, losing records in exactly the busiest moments.", "A partial record read while the producer is writing it appears as garbage."],
    v: "Generate a known number of events across all processors faster than the consumer reads; confirm delivered plus reported lost equals produced, and records merged by timestamp are in order.",
    dep: ["trace-timestamping", "loss-accounting"]
  },
  "trace-timestamping": {
    s: "Stamps every event with a clock cheap enough to read at each probe and precise enough to order events across processors and, where needed, machines.",
    d: "Probes read a processor's cycle counter or a monotonic clock, converting later to wall time using calibration points. Counters on different processors may be offset or drift, so tools record synchronization events and correct afterward. For several hosts, a network time protocol or a recorded offset aligns them. It is hard because the counter frequency can change, some counters stop in deep sleep, and virtual machines may migrate between hosts with different counters.",
    k: ["Cycle counter versus operating system clock call: the counter costs a few cycles but needs calibration, the call is correct and costs more.", "Correcting clock skew offline versus syncing during collection: offline is cheap and exact for a replay, live syncing helps online analysis."],
    p: ["Counters not synchronized between processors place an event before its cause in the merged timeline.", "A migrated virtual machine jumps its counter and one span appears to last hours."],
    v: "Ping-pong a token between threads pinned to different processors and trace each handoff; confirm that after correction no receive event precedes its send and measured latency is positive and stable.",
    dep: ["event-ring-buffers"]
  },
  "hardware-trace": {
    s: "Processor hardware that logs a compressed record of every branch taken, with timing, to memory without slowing the program noticeably.",
    d: "The hardware emits packets for taken conditional branches, indirect jumps and calls into a trace buffer, with periodic synchronization packets and optional cycle timing. A decoder reads the packets alongside the program's binary, following the code from a known start, to reconstruct the exact instruction path. Overhead is a few percent, but data rates reach gigabytes per second. It is hard because decoding requires the exact binary at the exact address, buffers are small and wrap, and just-in-time code needs its bytes saved.",
    k: ["Full trace versus triggered or filtered trace: full gives complete history and fills memory in seconds, filtering keeps only a region of interest.", "Decoding online versus offline: online gives answers immediately at heavy cost, offline stores raw packets and spends time later."],
    p: ["Decoding with a different binary than the one that ran yields a plausible but false path.", "Trace buffers wrap before the crash is noticed, so the interesting instructions are gone."],
    v: "Trace a short function with a data-dependent branch; decode it with the matching binary and confirm the reconstructed instruction path equals the one taken as shown by a single-step log of the same run.",
    dep: ["perf-event-interface", "disassembler", "debug-info-matching", "event-ring-buffers"]
  },
  "syscall-tracing": {
    s: "Records each system call a process makes, with arguments, results and duration, which shows its interaction with the operating system without any source.",
    d: "A tracer stops the process at each system call entry and exit, or uses a kernel tracepoint, then decodes the call number and arguments into names, flags and strings read from the process memory. Output is a timeline of calls with return values and errors. Summaries count calls and sum time per call. It is hard because the stop-based method slows the process many times over, arguments such as pointers need care to decode, and calls can be interrupted and restarted.",
    k: ["Stopping the process at each call versus kernel tracepoints: stopping needs no privilege beyond tracing and is slow, tracepoints are fast and need more privilege.", "Printing full strings and buffers versus truncating: full data aids diagnosis, but costs memory reads and exposes secrets."],
    p: ["Stop-based tracing inflates a system-call-heavy program so much that timing conclusions are wrong.", "Traced output includes passwords and tokens passed to calls."],
    v: "Trace a program that opens a missing file, reads a file and writes to a socket; confirm each call appears with decoded arguments, the missing-file error code is shown, and per-call time sums to a plausible share.",
    dep: ["process-trace-interface", "kernel-tracing-facility", "cross-process-memory"]
  },
  "allocator-interposition": {
    s: "Replaces or wraps the program's memory allocation functions so every allocation and release is recorded with its size and call stack.",
    d: "A library loaded ahead of the normal one, or a build-time substitution, provides allocation functions that call the real allocator and log the result. Each live allocation is kept in a table mapping address to size and site. Logs are written per thread to avoid locks. It is hard because the wrapper must itself not allocate, cannot see allocations made by custom allocators or direct page mappings, and adds cost to the hottest path in many programs.",
    k: ["Recording every allocation versus sampling by bytes: complete records are exact, sampling bounds overhead and gives estimates.", "Interposing at link time versus at load time: link time is robust and needs rebuilding, load time works on existing binaries and can be bypassed."],
    p: ["Memory taken directly from the operating system by a custom pool never appears, so the profile shows far less than the process uses.", "The wrapper allocates while logging and recurses infinitely."],
    v: "Run a program that allocates a known number of blocks of known sizes from known sites; confirm the table reports exactly those counts, sizes and sites, and that released blocks leave the live set.",
    dep: ["stack-capture", "event-ring-buffers", "process-address-map"]
  },
  "allocation-sampling": {
    s: "Records an allocation's stack only when a running byte counter crosses a randomized threshold, so large allocations are almost always caught and cost stays low.",
    d: "A per-thread counter subtracts each allocation's size from a random budget; when it goes below zero, the allocator takes a stack trace and resets the budget. Each sampled record is weighted by the inverse of its probability, so totals by site estimate true totals without bias. Small, frequent allocations are sampled proportionally less. It is hard because estimates for rare sites have high variance, weighting must be applied everywhere, and frees need to find the sampled records.",
    k: ["Byte-proportional sampling versus count-based: byte sampling is weighted to memory use, count sampling reflects allocation churn.", "Sampling rate in kilobytes versus a low rate: a larger interval reduces overhead and misses small leaks."],
    p: ["Reading raw sampled counts without the weights makes small allocation sites look insignificant, or large ones look rare.", "A site allocating many tiny objects is almost never sampled and its growth is missed."],
    v: "Allocate one gigabyte across a hot small-block site and a cold large-block site; confirm the weighted estimate for each is within a few percent of the truth while the number of stacks recorded is small.",
    dep: ["allocator-interposition", "stack-capture", "overhead-versus-fidelity"]
  },
  "live-heap-profile": {
    s: "A snapshot of memory currently allocated, grouped by allocation site, showing what is held right now rather than what has been allocated over time.",
    d: "From the allocation table, live blocks are grouped by their site stacks and summed by size and count. The same view can be computed as space in use or total bytes allocated since start. Snapshots written periodically show growth. It is hard because live objects belong to sites that are not responsible for retaining them, so the site shows who allocated, not who holds, and because memory held in allocator caches or fragmentation does not appear as live.",
    k: ["Live bytes versus total allocated: live shows what leaks and is held, total shows churn and allocation pressure.", "Grouping by allocation site versus by type: sites are exact and cheap, types are more meaningful when sites are in generic helper code."],
    p: ["A wrapper function allocates everything, so one site accounts for the whole heap and says nothing about who owns it.", "Allocator fragmentation keeps resident memory high while the live profile shows little."],
    v: "Allocate and hold structures of a known size from three sites, release one, and snapshot; confirm the live profile lists two sites with the right bytes and the released one does not appear.",
    dep: ["allocator-interposition", "allocation-sampling", "call-graph-aggregation"]
  },
  "leak-detection": {
    s: "Finds memory that is still allocated but no longer reachable from any pointer, or that grows without bound, and reports where it was allocated.",
    d: "At exit or on request, the detector scans roots, such as stacks, registers and globals, then follows pointers through live blocks, marking everything reachable. Blocks never reached are reported as leaked, with their allocation stacks. A conservative scan treats any value that looks like a pointer as one. The alternative is a growth rule that reports sites whose live bytes rise across snapshots. It is hard because a pointer hidden by arithmetic hides a block, and because a stale value that looks like a pointer keeps a block marked.",
    k: ["Reachability scanning versus growth over time: scanning finds true unreachable memory, growth analysis finds leaks that are still referenced, such as unbounded caches.", "A conservative scan versus a precise one: conservative needs no type information and misses some leaks, precise needs type maps."],
    p: ["A leak held by a stale integer that resembles a pointer is never reported.", "Intentional static data held until exit is reported as a leak and trains people to ignore the output."],
    v: "Run a program that leaks 100 blocks from one site and keeps another 100 reachable through a global; confirm the report lists exactly the 100 leaked blocks with the correct stack and not the others.",
    dep: ["allocator-interposition", "process-address-map", "live-heap-profile"]
  },
  "heap-diffing": {
    s: "Compares two heap snapshots to show which sites gained or lost live memory in the interval, which isolates growth from steady state.",
    d: "Two snapshots of live memory by site are subtracted, and sites are ranked by net growth in bytes or objects. It is used by taking one snapshot after warm-up and another after load or time has passed. Some tools compare object counts by type for managed or typed heaps. It is hard because normal growth, such as caches filling up, looks like a leak, and because sites must match across snapshots despite changing addresses.",
    k: ["Comparing snapshots by site versus by object identity: site comparison is simple and stable, identity gives exact retention paths and is expensive.", "Diffing after a warm-up versus from process start: after warm-up removes startup growth, from start captures the complete history."],
    p: ["Taking the first snapshot before caches warm up reports the caches themselves as the leak.", "Snapshots taken during a burst compare transient memory rather than retained memory."],
    v: "Take snapshots before and after a loop that retains 10 MB at one site and churns 1 GB at another; confirm the diff reports about 10 MB growth at the first and near zero at the second.",
    dep: ["live-heap-profile", "differential-profiles"]
  },
  "cache-locality-analysis": {
    s: "Uses memory access samples and cache event counters to find which data and instructions suffer misses, false sharing and poor spatial or temporal locality.",
    d: "Counter events on loads, misses and cache-line transfers are sampled, ideally with the data address and latency recorded by precise hardware. Samples are grouped by data object or cache line, and lines touched by several processors with writes are flagged as sharing. The output links a miss to a source line and the data structure involved. It is hard because the hardware gives samples of accesses and not all accesses, because data addresses need mapping back to objects, and because results depend on the machine's cache geometry.",
    k: ["Sampling accesses with addresses versus counting miss events: addresses identify data structures, counts are cheaper and say only where.", "Per-line sharing detection versus coarse thread-level statistics: per-line finds false sharing exactly, at large overhead."],
    p: ["Two unrelated hot counters on one cache line cause false sharing that appears as slow code with no visible reason.", "A machine with a different cache size changes the result, so a fix tuned on one machine is wrong on another."],
    v: "Run two threads incrementing adjacent counters, then the same with padding; confirm the tool flags the shared line in the first run and the padded run shows no sharing and a measurable speedup.",
    dep: ["hardware-counters", "skid-and-precise-events", "sample-attribution"]
  },
  "sampling-rate-control": {
    s: "Chooses and adjusts the sampling frequency so the data is dense enough to be useful without letting interrupt cost or data volume grow too large.",
    d: "A default frequency is picked, usually tens to hundreds per second per processor for continuous profiling and thousands for focused sessions. The kernel may throttle when interrupts take too much time, lowering the rate and flagging it. Adaptive schemes lower the rate for idle or heavy periods. Reports can include the achieved rate. It is hard because statistical error depends on the number of samples in the region of interest, not the total, and because throttling happens silently unless counted.",
    k: ["Fixed rate versus adaptive by activity: fixed samples are unbiased and easy to read, adaptive saves cost and requires weighting each sample.", "A high rate for short sessions versus low rate for long: high shows detail in a brief run, low keeps always-on cost small."],
    p: ["Throttling reduces the rate under load, which is when the data matters most, without any visible notice.", "A short run at a low rate gives so few samples that rankings change every time."],
    v: "Run a workload at three target rates and read the sample count and throttle indicators; confirm achieved rates match the targets until the throttle engages, which is then reported in the output.",
    dep: ["sampling-triggers", "perf-event-interface", "loss-accounting"]
  },
  "probe-cost-budget": {
    s: "Estimates and limits the time each probe, hook or handler adds, so total instrumentation cost stays within a stated share of the program's work.",
    d: "Each probe has a measured cost per hit: a trap round trip, a jump to a handler, or a buffer write. Multiplying by the expected hit rate gives its share. A controller can disable probes that exceed a budget, switch hot ones to sampled mode, or reduce the arguments captured. It is hard because hit rates are not known until run time, and cost interacts with cache and scheduling effects that a micro-measurement does not see.",
    k: ["A static budget set before the run versus run-time enforcement: static is simple, run-time enforcement reacts to actual hit rates and complicates the tool.", "Disabling an over-budget probe versus sampling it: disabling is a hard limit that loses data, sampling keeps a statistical view."],
    p: ["A probe on an unexpectedly hot path consumes a large share of the CPU before anyone notices.", "A probe disabled by the budget leaves a gap in the trace that looks like inactivity."],
    v: "Attach probes to functions with known call rates under a five percent budget; confirm the hottest probe is switched to sampling or disabled when its measured share exceeds the budget, and total slowdown stays below it.",
    dep: ["dynamic-probes", "static-probes", "function-entry-hooks"]
  },
  "loss-accounting": {
    s: "Counts every event or sample dropped because of full buffers, throttling or failed stack reads, and reports the number alongside the profile.",
    d: "Each drop site increments a counter: ring buffer overflow, interrupt throttle, stack read fault, symbol failure. The counters are stored in the file header or a side channel and displayed by report tools. Readers then know whether a profile is complete, and by how much it may be biased. It is hard because losses are not uniform, buffers overflow in the busiest moments, and counters themselves must be cheap and safe in interrupt context.",
    k: ["Reporting loss counts versus hiding gaps: counts let readers judge the data, hiding them gives clean-looking results that may be wrong.", "Compensating for loss by scaling versus flagging it: scaling can correct uniform loss, but bursty loss makes scaled numbers misleading."],
    p: ["A profile with ten percent dropped samples is read as complete, and the busiest period is the one missing.", "Failed stack reads are counted as samples with a single frame, flattening the profile."],
    v: "Force overflow by slowing the consumer and run a known event count; confirm the report shows the number lost, that recorded plus lost equals produced, and that the viewer displays a warning above a threshold.",
    dep: ["event-ring-buffers", "sample-capture"]
  },
  "selective-enablement": {
    s: "Restricts collection to chosen processes, threads, time windows, code regions or conditions, so cost is only paid where it is useful.",
    d: "Filters apply at several levels. Collection can be scoped to one process or control group, enabled and disabled by command or signal, or switched by markers inside the program that open and close a region. In-kernel filters drop events before they are written. Conditions such as a latency threshold can start capture only after an anomaly begins. It is hard because filters that run late waste the work already done, and conditions may fire after the interesting moment has passed.",
    k: ["Filtering at the source versus after collection: source filtering saves cost and cannot be undone, post-filtering keeps everything and costs space.", "Static scopes versus triggered capture: static scopes are predictable, triggers catch rare events with the risk of starting too late."],
    p: ["A trigger on a latency threshold starts recording after the slow request has already finished.", "A filter by process name misses short-lived child processes started by the target."],
    v: "Record only one control group on a busy host; confirm samples from other groups are absent, data volume drops in proportion, and a marker-delimited region contains only events inside the markers.",
    dep: ["in-kernel-filters", "perf-event-interface", "overhead-versus-fidelity"]
  },
  "perturbation-checks": {
    s: "Measures how much the tool changed the program, by comparing instrumented against uninstrumented runs, and flags results that the tool itself may have caused.",
    d: "A control run without the tool gives baseline time, throughput or latency distribution. Differences with the tool on show its cost. Further checks vary the sampling rate and watch whether the profile's shape changes, or check that the profiler's own functions appear in the samples. Self-profile data from the tool is reported with the result. It is hard because the effect is nonlinear, with timing-sensitive code changing behavior at some threshold, and baselines themselves vary.",
    k: ["Comparing against an uninstrumented baseline versus trusting a stated overhead: a measured baseline is exact for this workload, a stated number is generic and often wrong.", "Rate sweeps versus a single run: sweeps reveal sensitivity, a single run is cheap and hides it."],
    p: ["A profile taken at an unsustainable rate shows contention that only exists because of the profiler.", "Overhead measured on an idle machine under-reports the cost on a loaded one."],
    v: "Run a latency-sensitive workload ten times without and with the tool at default settings; confirm the report states the measured change in median and tail latency, and that top functions stay in the same order at half the rate.",
    dep: ["sampling-rate-control", "observer-effect", "probe-cost-budget"]
  },
});
