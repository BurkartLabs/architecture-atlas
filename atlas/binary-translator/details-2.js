// Details for the binary translator plate, part 2: signals, translation cache, tiering, code coherence.
ATLAS.details("binary-translator", {
  "host-fault-handler": {
    s: "The host-level handler that receives faults and signals raised while translated code runs, and decides whether they belong to the guest or to the translator.",
    d: "The translator installs its own handlers for memory faults, illegal instructions, arithmetic errors and asynchronous signals. On entry it receives host registers and a host instruction address. It first checks whether the address lies in generated code, then whether the fault is one the translator itself relies on, such as a write to a protected code page, and otherwise converts it into a guest event. It is hard because the handler runs on a restricted stack with limited safe operations, and because the faulting code is mid-block with guest state spread over host registers.",
    k: ["Handle on the host signal stack vs switch to a translator stack: the signal stack is available at once; switching allows more work but needs a reliable stack at any fault point.", "Handle internal faults entirely inside vs forward to the guest: internal handling keeps tricks like write protection invisible; forwarding is simpler but exposes translator behavior."],
    p: ["A fault in the translator's own code is mistaken for a guest fault and delivered to the guest as a bogus crash.", "Handlers that take a lock deadlock when the fault interrupted code already holding it."],
    v: "Trigger a null dereference in guest code and confirm the guest receives the expected fault with the correct guest address, while a deliberate write to a tracked code page is handled silently.",
    dep: ["fault-address-mapping","write-protect-trap","guest-context"]
  },
  "fault-address-mapping": {
    s: "Finds the guest instruction that corresponds to a faulting host instruction inside generated code, and the guest state at that instruction.",
    d: "Each translated block records a table linking ranges of host code to guest instruction addresses, and notes where guest registers lived at each point. Given a host address from a fault, the handler finds the block, then the guest instruction, then reconstructs registers from host registers and the context in memory. Some translators recover state by re-running the block's prefix in an interpreter. It is hard because optimization reorders and removes instructions, so the table must be maintained through every pass and stay small.",
    k: ["Store per-instruction maps vs recompute by re-execution: maps are fast to use and cost memory per block; re-execution costs nothing until a fault but needs a trusted slow path.", "Precise state after every instruction vs only at faultable instructions: only at faultable points saves space but constrains where optimizations may move code."],
    p: ["An optimization that hoists a load above an earlier store breaks the map, so a fault is reported at the wrong instruction.", "Maps for evicted blocks are freed while a signal for that block is still pending."],
    v: "For each memory-accessing instruction in a test block, force a fault and confirm the reported guest address and register values equal those from the reference interpreter at that point.",
    dep: ["guest-context","register-mapping","patch-points"]
  },
  "signal-frame-synthesis": {
    s: "Builds the record the guest expects on its stack when a signal arrives: saved registers, flags, vector state and the return path.",
    d: "On delivery the translator writes a frame in the guest's exact layout onto the guest stack: general registers, flags, floating point and vector state, the mask and a pointer to return code. It then sets guest registers to enter the handler. When the handler returns, a return stub restores state from the frame. Handlers may modify the frame to resume elsewhere. It is hard because frames differ by instruction set and options, and because the saved state must be the precise guest state at the interrupted instruction.",
    k: ["Construct the frame in translator code vs let the host build one then convert: constructing is exact and portable; converting reuses host logic but depends on how closely layouts match.", "Return stub in guest memory vs in translator memory: guest memory is what unwinders expect; translator memory is safer from guest tampering."],
    p: ["A frame missing vector state makes handlers that resume after floating point work compute wrong results later.", "Stack space check omitted: delivery near the stack limit corrupts adjacent memory."],
    v: "Deliver a signal to a handler that modifies the saved instruction pointer and a register, return from it, and confirm execution resumes at the new address with the changed register value.",
    dep: ["guest-context","special-registers","address-translation","host-fault-handler"]
  },
  "signal-mask-handling": {
    s: "Maintains the guest's view of which signals are blocked, and maps it to the host mask so delivery stays consistent with translator needs.",
    d: "The guest sets masks and handlers through its own calls, but the translator needs certain host signals for itself, such as for fault handling. The translator keeps a guest mask, applies the intersection to the host, and queues blocked signals itself. Dispositions are stored in a guest table and a single host handler dispatches. It is hard because signal numbers differ between interfaces, because masks change inside handlers and atomic mask-and-wait calls must stay atomic, and because blocking the translator's own signals would break it.",
    k: ["Mirror the guest mask on the host vs keep it only in the translator: mirroring lets the host kernel queue signals; translator-only gives full control but costs extra bookkeeping on every delivery.", "Number translation table vs identical numbering: a table is required where numbers differ; identical numbering is simpler where they match."],
    p: ["Blocking all host signals while a guest handler runs also blocks the translator's fault signal and hangs.", "A pending signal lost between mask change and unblock makes a program wait forever."],
    v: "Block a signal, raise it, confirm it stays pending, unblock it and confirm exactly one delivery, with the signal number and handler arguments equal to those of a native run.",
    dep: ["host-fault-handler","syscall-number-table"]
  },
  "async-signal-safe-points": {
    s: "Defines where in translated code an asynchronous signal may be delivered to the guest, so state is consistent and the translator is not interrupted mid-update.",
    d: "An asynchronous signal can arrive anywhere, including inside the dispatcher or while a block is being linked. The handler records it and delivery occurs at a safe point, such as the start of a block, a system call return or a checked loop back-edge. Long-running translated loops therefore need a check, which can be a flag test or a trick where the handler unlinks chained exits so the next one falls to the dispatcher. It is hard because delay must be bounded and the check must cost almost nothing on the hot path.",
    k: ["Poll a flag in every block vs unlink chains from the handler: polling costs a load and branch per block; unlinking costs nothing until needed but requires safe patching from a signal context.", "Deliver at the next block vs at the precise interrupted instruction: next block is simple and legal for most signals; precise is required only for faults."],
    p: ["A tight loop chained to itself never reaches a safe point, so a signal is delayed indefinitely.", "Patching code from the handler while another thread executes it corrupts instructions."],
    v: "Send a signal to a thread spinning in a self-chained loop and confirm the guest handler runs within a small bounded delay, and that the loop continues correctly afterward.",
    dep: ["block-chaining","dispatcher-loop","patch-points"]
  },
  "guest-unwind-compatibility": {
    s: "Keeps stack unwinding working for the guest's runtime, debuggers and exception handling when frames were created by translated code.",
    d: "Guest exception handling and debuggers walk the stack using tables that describe each guest function's frame. Since guest code runs from translated copies but guest registers and the guest stack are maintained faithfully, unwinding should work unchanged, provided the return addresses on the guest stack are guest addresses and not host ones. Translators that optimize returns must ensure what is stored is correct. It is hard where the translator keeps a separate return stack for speed, and where thunked host libraries create frames with no guest description.",
    k: ["Keep guest return addresses on the guest stack vs store host addresses: guest addresses keep unwinding and stack inspection correct; host addresses make returns faster but need translation at every walk.", "Describe thunk frames to unwinders vs forbid unwinding through them: describing supports exceptions across boundaries; forbidding is simpler but breaks callbacks that throw."],
    p: ["Return addresses rewritten to host addresses make every crash report and exception unwinding fail.", "Stack depth checks written for the guest's frame size overflow when translated code adds frames."],
    v: "Throw an exception through ten nested guest frames, including one through a thunked library call, and confirm the guest catches it at the right frame and a backtrace lists all guest functions.",
    dep: ["return-address-stack","host-library-thunking","guest-context"]
  },
  "block-formation": {
    s: "Chooses where a translation unit starts and ends: usually a straight-line run of guest instructions ending at a branch, a system call or a size limit.",
    d: "Translation begins at a guest address and decodes forward until a control-flow change, a system call, an instruction requiring special handling or a maximum count. Larger units give the optimizer more to work with but may translate code never executed and widen the invalidation target. Some designs extend across unconditional jumps or conditional branches, and record side exits for each. It is hard because the same guest bytes can be entered at different addresses, producing overlapping blocks, and because the choice sets the granularity of every later mechanism.",
    k: ["Basic blocks vs extended regions: basic blocks translate fast and map cleanly onto invalidation; extended regions optimize better but multiply memory and rework when assumptions fail.", "Stop at every conditional branch vs follow the likely path: stopping is simple and exact; following saves dispatches but needs side exits that restore state."],
    p: ["Blocks ending only at a size limit split an instruction pair that flags depend on and force expensive flag materialization.", "Overlapping blocks for the same guest bytes duplicate memory and complicate invalidation."],
    v: "Translate a sample function and list its blocks: confirm start and end addresses match the branch structure, that no block exceeds the limit, and that overlapping entries are tracked together.",
    dep: ["block-boundary-rules","instruction-decoder","ir-builder"]
  },
  "translation-cache": {
    s: "The region of executable memory holding generated host code, with bookkeeping that records which guest block each piece came from.",
    d: "Generated code is appended to one or more large regions. Each entry records guest address, host address, size, translation tier, links in and out, and the guest page range it covers. The cache is shared by threads or kept per thread. Its size bounds memory and sets how much of a program's working set stays translated. It is hard because entries are variable-size, reference each other through patched jumps, and cannot be moved once linked, so reclaiming space means discarding whole regions and everything linked to them.",
    k: ["Single shared cache vs per-thread caches: shared avoids duplicate translation and warms faster but needs synchronized insertion; per-thread is lock-free but multiplies memory.", "One large region vs several smaller ones: large keeps chaining distances small; smaller ones allow finer reclamation and relocation."],
    p: ["A cache sized for small programs thrashes on large ones, spending most of the time retranslating.", "Entries not removed from side tables on eviction leave dangling jumps into reused memory."],
    v: "Run a workload with a working set larger than the cache and confirm translations per second stay bounded, output stays correct, and no entries reference reclaimed memory afterward.",
    dep: ["executable-memory-manager","code-emitter","block-lookup-table"]
  },
  "block-lookup-table": {
    s: "A fast index from guest address to translated block, consulted on every transfer that cannot be linked directly.",
    d: "Most designs use a small direct-mapped table in front of a larger hash table. The small table is probed inline in generated code with a few instructions; misses fall through to the larger table or the translator. Entries must be keyed by guest address plus any translation context, such as processor mode. It is hard because lookups happen at the highest frequency of any runtime operation, so the structure must be tiny and collision-tolerant, while also supporting concurrent update and invalidation without locks.",
    k: ["Direct-mapped inline table vs full hash lookup in the dispatcher: inline is fastest but collisions evict useful entries; full hashing is robust but costs a call.", "Lock-free readers vs locked table: lock-free keeps threads fast but needs careful ordering on updates; locks are simple and contend heavily."],
    p: ["Keying only on address misses mode bits, so a block translated for one mode runs in another.", "Stale entries left after invalidation send execution into code for old guest bytes."],
    v: "Run an indirect-branch-heavy benchmark and confirm the inline hit rate exceeds the expected threshold, then invalidate a block and confirm the next transfer retranslates rather than hitting the old entry.",
    dep: ["translation-cache","smc-block-invalidation"]
  },
  "dispatcher-loop": {
    s: "The central routine that looks up or creates the next translated block and enters it, used whenever execution cannot jump directly.",
    d: "On exit from a block with an unlinked target, control returns to the dispatcher with the next guest address. It checks pending signals, probes the lookup table, translates on a miss, optionally patches the previous block to chain to the new one, and enters the block. It also handles special exits: system calls, exceptions and halts. It is hard because it is the hottest shared code and must be as short as possible, yet it is also the place where thread synchronization, signal checks and cache management meet.",
    k: ["Loop dispatch vs threaded dispatch: a central loop is simple and easy to instrument; threaded dispatch jumps straight to the next block and avoids a branch mispredict but spreads the logic.", "Translate on the same thread vs on a helper thread: same-thread is simple and deterministic; helper threads hide translation latency but complicate state sharing."],
    p: ["Checking signals after entering the block instead of before loses a signal across a long block.", "Missing a barrier between publishing a block and entering it lets another thread run half-written code."],
    v: "Count dispatcher entries during a run and confirm they fall by orders of magnitude once chaining is enabled, with output identical in both modes.",
    dep: ["block-lookup-table","block-formation","async-signal-safe-points","entry-exit-stubs"]
  },
  "block-chaining": {
    s: "Patches the exit of one translated block to jump directly to its successor, skipping the dispatcher for repeated transitions.",
    d: "A block ends with a stub that returns to the dispatcher. When the target is known and translated, the stub is overwritten with a direct jump. Chains turn loops into continuous host code. Chaining is reversible: when a block is invalidated or evicted, every jump into it must be reverted to the stub, so the cache tracks incoming links. It is hard because patching code that other threads are executing must be atomic with respect to instruction fetch, and because link bookkeeping grows with the program.",
    k: ["Chain eagerly at translation vs lazily on first execution: eager reduces dispatcher visits but may link into code that never runs; lazy links only observed paths.", "Patch in place vs indirect jump through a table: in-place is fastest but needs safe code modification; a table adds a load but allows updates by storing one word."],
    p: ["Unlinking only the primary block leaves a second block jumping into reclaimed memory.", "Non-atomic patching of a multi-byte jump lets another thread execute a torn instruction."],
    v: "Chain a hot loop, invalidate its body while another thread runs it, and confirm every incoming link reverts to the dispatcher and execution continues correctly with the new translation.",
    dep: ["patch-points","translation-cache","write-execute-transitions"]
  },
  "indirect-branch-lookup": {
    s: "Handles jumps and calls whose target comes from a register or memory, which cannot be linked ahead of time, with a fast inline probe.",
    d: "Indirect branches carry computed guest addresses: switches, function pointers, returns in some designs. The generated code hashes the target, probes a small cache of recent targets and jumps on a hit, falling back to the dispatcher otherwise. Some translators add inline checks for the most common target, in the manner of an inline cache. It is hard because these branches are frequent in interpreters and object-oriented code, and a slow path of even tens of instructions dominates runtime for those programs.",
    k: ["Shared probe table vs per-site inline cache: a shared table handles many targets uniformly; per-site caches are fastest for monomorphic sites and waste space on others.", "Probe in generated code vs call a helper: inline is faster but bloats every site; a helper keeps code compact but costs a call and return."],
    p: ["A table too small for programs with many targets thrashes and sends most branches to the dispatcher.", "Missing invalidation of site caches makes a branch jump to stale code after unload of a library."],
    v: "Run an interpreter-style workload with a hundred distinct targets and confirm the inline hit rate and a throughput within the expected range of a direct-jump version of the same loop.",
    dep: ["block-lookup-table","dispatcher-loop","helper-call-interface"]
  },
  "return-address-stack": {
    s: "A side stack of predicted return targets so that function returns can jump straight to the translated caller instead of going through a lookup.",
    d: "On a guest call, the translator pushes the return guest address and its translated host address onto a small stack; on a return it pops, compares the actual guest return address with the saved one, and jumps directly on a match. A mismatch falls to the dispatcher. This restores the host processor's own return prediction, which indirect jumps defeat. It is hard because programs break call and return pairing with exceptions, coroutines and stack switching, and the side stack must be kept in step or fall back without losing correctness.",
    k: ["Predict returns with a side stack vs treat them as indirect branches: a side stack makes returns almost free; indirect treatment is always correct and costs a lookup on every return.", "Store host address in guest stack vs keep a parallel stack: parallel keeps guest memory identical to native; in-stack saves work but changes visible contents."],
    p: ["Coroutine switching leaves the side stack out of sync and every return mispredicts silently.", "An overflow on deep recursion wraps and overwrites valid entries without a check."],
    v: "Run deep recursion and a coroutine test and confirm results are correct and that the match rate stays high for normal calls while stack switching triggers fallback without crashes.",
    dep: ["indirect-branch-lookup","guest-context","entry-exit-stubs"]
  },
  "cache-eviction": {
    s: "Reclaims translation cache space when it fills, by discarding blocks and every link into them.",
    d: "Policies range from flushing the whole cache at once, which is simple and needs no link tracking, to evicting regions by age or by tier. Eviction must stop or park all threads that might be inside the region, unlink incoming jumps, drop lookup table entries, and release side data. Flushes cause a burst of retranslation. It is hard because threads can be mid-block anywhere in the region, so reclamation needs a quiescent point, and because evicting hot code just before it is needed again is costly.",
    k: ["Flush all vs evict partially: flush-all is simple and safe but spikes latency; partial eviction smooths cost but needs link tracking and fragmentation handling.", "Evict by age vs by tier cost: age is easy and approximates usefulness; cost-based keeps expensive optimized blocks and requires tracking what each took to produce."],
    p: ["A thread resumed from a signal returns into a block that was evicted while it was handling the signal.", "A flush at the wrong moment, such as inside a long loop, causes repeated flush cycles that look like a hang."],
    v: "Set the cache to a tiny size, run a benchmark and confirm correct output, bounded retranslation, and that no thread executes freed code, checked by filling reclaimed memory with trap bytes.",
    dep: ["translation-cache","block-chaining","block-lookup-table","host-thread-mapping"]
  },
  "interpreter-tier": {
    s: "Executes guest instructions one at a time without generating host code, used for cold code, rare instructions and as a trusted reference path.",
    d: "The interpreter decodes and performs an instruction directly on the guest context, with no translation latency and exact per-instruction state. It runs code until a hotness counter says translation is worthwhile, and handles instructions the translator does not support. It is slow, often tens of times slower than translated code. Its value is precision and simplicity: it is the easiest component to verify and the fallback when the faster paths give up. It is hard to keep its semantics identical to the translated tiers, since they are written separately.",
    k: ["Keep an interpreter vs translate everything at once: an interpreter makes startup cheap and gives a reference; skipping it means one fewer path to maintain but pays translation cost for every cold block.", "Share semantic definitions with the translator vs separate code: sharing keeps behavior in sync; separate paths give independent cross-checking."],
    p: ["Interpreter and translator diverge on an obscure flag result and bugs appear only after a block turns hot.", "Running too long in the interpreter makes startup of large programs feel stalled."],
    v: "Run the conformance suite in interpreter-only mode and in translate-only mode, and confirm identical results for every case, including ones near the hotness threshold.",
    dep: ["instruction-decoder","guest-context","semantics-specification"]
  },
  "baseline-tier": {
    s: "A fast, simple translation of a block with little optimization, used first for code that has become worth translating.",
    d: "The baseline tier decodes a block, builds IR and emits host code with minimal analysis and simple register use. It prioritizes translation speed over runtime speed, and usually inserts counters so hot blocks can be promoted. Code is typically two to five times slower than optimized output but costs a fraction of the time to make. It is hard to balance: too little optimization wastes time in slow code, too much makes startup long, and the tier boundary must preserve exact state so blocks can move between tiers.",
    k: ["Count executions in baseline code vs sample from outside: counters are exact and cost instructions in every block; sampling is free in the hot path but delayed and statistical.", "Single baseline vs several cheap levels: one level is simple; several allow gradual spending at the cost of more interfaces between tiers."],
    p: ["Baseline code that spills every guest register to memory makes startup acceptable and steady state far slower than needed.", "Counters that overflow or reset at the wrong moment promote cold code or never promote hot code."],
    v: "Run a short program and a long benchmark and confirm the short one finishes faster than with full optimization on all code, while the long one reaches within an expected margin of fully optimized speed.",
    dep: ["ir-builder","instruction-selection","hotness-counters"]
  },
  "optimizing-tier": {
    s: "A slower, more thorough translation applied to hot code: more analysis, better register use, and removal of work the guest would have wasted.",
    d: "For blocks or regions that have proven hot, the optimizing tier runs flag liveness, constant folding, dead code removal, load and store optimization and idiom recognition, then allocates registers globally within the region. It produces compact code that keeps guest state in host registers and writes it back only at exits. It may speculate, for example on aligned accesses or on a particular indirect target, and guard each guess. It is hard because every optimization must preserve exact state at every exit and fault point.",
    k: ["Optimize in the background vs inline: background hides latency but needs thread-safe publication and may finish after the code cooled; inline is deterministic and stalls the guest.", "Speculate with guards vs generate fully general code: speculation yields fast common paths with a recovery cost; general code is predictable but slower."],
    p: ["An optimization that assumes no other thread writes memory miscompiles code that relies on a lock-free protocol.", "Too eager promotion spends more time optimizing than it will ever recoup."],
    v: "Compare optimized and baseline output across the conformance suite and fuzzer inputs, and confirm identical architectural state plus a measured speedup on hot loops.",
    dep: ["flag-liveness-analysis","register-allocator","load-store-optimization","deoptimization-fallback"]
  },
  "hotness-counters": {
    s: "Track how often each block or region executes, so the translator promotes code that matters and leaves the rest cheap.",
    d: "Each block carries a small counter incremented in the interpreter, the baseline code or a sampling routine. When it crosses a threshold, the block is queued for a higher tier. Loop back-edge counters promote long-running loops earlier. Thresholds can adapt to cache pressure and available cores. It is hard because counting costs instructions in the code being measured, because thresholds that suit one program waste effort on another, and because counters must be shared safely across threads.",
    k: ["Counter per block vs per entry-point or per function: per block is fine-grained; per function gives larger regions but misses hot loops inside cold functions.", "Fixed thresholds vs adaptive: fixed are predictable; adaptive adjusts to load but makes performance harder to reproduce."],
    p: ["Racy updates from several threads lose counts and delay promotion of obviously hot code.", "A threshold that was tuned on benchmarks keeps interactive programs in slow code too long."],
    v: "Run a program with one hot loop and a thousand cold functions and confirm only the hot loop is promoted, and that promotion happens within the expected number of iterations.",
    dep: ["interpreter-tier","baseline-tier"]
  },
  "region-formation": {
    s: "Combines several hot blocks into one larger unit, such as a trace or loop region, to optimize across block boundaries.",
    d: "Using execution counts and observed successor frequencies, the translator selects a path through hot blocks or a whole loop body and translates it as one unit. Inside it, registers stay in host registers, redundant flag work disappears and branches along the hot path become straight-line code. Cold branches become side exits. It is hard because the choice depends on observed behavior that can change, because side exits must reconstruct exact guest state, and because duplicated code for shared tails multiplies memory.",
    k: ["Traces (one path) vs regions (all paths in a loop): traces are simple and fast on stable paths; regions cope with variable paths but optimize less aggressively.", "Select from recorded counts vs from static structure: recorded counts follow real behavior; static selection is repeatable but may pick cold paths."],
    p: ["A trace built from a phase of the program becomes cold when behavior changes, leaving side exits taken constantly.", "Duplicating code for each path through a diamond blows up the region size."],
    v: "Run a loop with a rare branch and confirm the hot path is one straight-line region with a side exit, and force the rare branch to confirm exact state restoration there.",
    dep: ["block-formation","optimizing-tier","hotness-counters","ir-builder"]
  },
  "deoptimization-fallback": {
    s: "Abandons an optimized or speculative translation and resumes the guest in a safer tier when an assumption proves false or an unsupported case appears.",
    d: "Speculative code checks its assumptions with guards: a value is in range, a page is not write-protected, an address is aligned. On failure it exits to a stub that reconstructs exact guest state and resumes in the baseline or the interpreter, then may mark the optimized block as bad so it is not rebuilt with the same assumption. It is also the path for rarely supported instructions. It is hard because every guard needs full state recovery metadata and because repeated failures can thrash between tiers.",
    k: ["Recompile without the assumption vs permanently interpret the site: recompiling restores speed after learning; interpreting is simple and slow forever.", "Detailed recovery maps vs materializing all state at every guard: maps save runtime work and cost memory; materializing is simple and slows the fast path."],
    p: ["Recovery restores a register from the wrong location, producing a state that fails only later.", "A guard that fails every time turns an optimization into a pessimization with no limit on retries."],
    v: "Force every guard in a test region to fail in turn and confirm guest state after fallback equals the interpreter's at the same point, and that the failing assumption is not reused.",
    dep: ["fault-address-mapping","interpreter-tier","optimizing-tier","guest-context"]
  },
  "persistent-translation-cache": {
    s: "Stores translated code on disk between runs so repeated launches skip translation of code already seen.",
    d: "After translating, the cache writes generated code and its metadata, such as relocations, guest ranges and link information, to a file keyed by program and translator version. At start, matching entries are mapped in and used after validation. It cuts startup cost of large programs from seconds to a fraction. It is hard because generated code often embeds absolute addresses that change per run, so it must be position-independent or have relocations applied, and because files are a security surface: a tampered cache is code execution.",
    k: ["Store generated host code vs store only guest block lists to retranslate quickly: host code starts fastest and depends on the exact translator build; lists are small and portable, with less benefit.", "Per-user cache vs shared cache: shared saves work for everyone and enables poisoning; per-user is safer and warms more slowly."],
    p: ["A cache from an older translator version is loaded and runs code with a changed convention.", "Concurrent runs writing the same file corrupt it and cause rare crashes."],
    v: "Run a program twice and confirm the second launch reaches the same output in measurably less translation time, and that changing the program or the translator build forces a rebuild.",
    dep: ["cache-key-validation","patch-points","executable-memory-manager"]
  },
  "cache-key-validation": {
    s: "Decides whether a stored translation is still valid for the current program, translator build and configuration, and rejects it otherwise.",
    d: "A key combines a content hash of the guest binary or each page, the translator build identifier, the host feature set and options that change code generation. At load, each entry is checked against the key and the integrity of its contents is verified, using a signature or a checksum with restricted file permissions. Mismatch discards the entry. It is hard because partial matches are tempting: a library updated in one page, or a different host with slightly different features, and wrongly accepting them yields code that is silently wrong.",
    k: ["Hash file contents vs file path and timestamp: hashes are exact and cost time on large files; timestamps are cheap and fooled by copies and restores.", "Per-page validation vs whole-file validation: per-page reuses more after small updates but checks more; whole-file is simple and discards everything on any change."],
    p: ["Keying on feature detection at build time rather than run time accepts code using instructions the current host lacks.", "Unauthenticated cache files let any local process plant code the translator will execute."],
    v: "Modify one byte of the guest binary, then run again and confirm the stored translation is rejected and rebuilt, and that flipping a byte inside the stored file is also rejected.",
    dep: ["persistent-translation-cache","host-feature-detection"]
  },
  "static-pre-translation": {
    s: "Translates a whole guest program offline, before it runs, producing host code that can be loaded directly.",
    d: "An offline tool decodes the program from its entry points and symbol tables, follows direct branches, builds IR for every function and writes host code and a table mapping guest to host addresses. At run time, anything it missed, such as computed jumps into unknown code or self-generated code, falls to the dynamic translator. It trades startup time and optimization time for coverage limits. It is hard because finding all code in a binary is undecidable in general, since data and code mix and indirect jumps hide targets.",
    k: ["Static plus dynamic fallback vs dynamic only: static removes startup cost and gives more optimization time; the dynamic fallback must stay and the two must agree.", "Whole-program vs per-function: whole-program can inline and share; per-function is more robust and fails gracefully on code it cannot understand."],
    p: ["Treating data in a code section as instructions produces code that is never reached and sometimes wrong.", "Missing an indirect jump target works in tests and falls to slow dynamic translation in production."],
    v: "Pre-translate a program, run it with dynamic translation disabled for covered code, and confirm all hot paths run from the pre-translated image and misses are reported by address.",
    dep: ["instruction-decoder","ir-builder","persistent-translation-cache","optimizing-tier"]
  },
  "code-page-tracking": {
    s: "Records which guest memory pages contain code that has been translated, so writes to those pages can be detected.",
    d: "Whenever a block is translated, the pages holding its guest bytes are marked in a table, with a list of dependent blocks per page. The table lets the translator find every translation affected by a change to a page, and decide which pages need write monitoring. Pages that also hold frequently written data are expensive. It is hard because blocks can span pages, because pages are shared between processes, and because granularity matters: tracking per page is cheap but invalidates unrelated blocks.",
    k: ["Page granularity vs finer sub-page tracking: pages match hardware protection and are cheap; sub-page ranges avoid spurious invalidation on pages mixing code and data.", "Per-block page lists vs per-page block lists: per-page lists make invalidation fast; per-block lists make eviction fast; many designs keep both."],
    p: ["A block spanning two pages registered with only one misses a write to the second and runs stale code.", "A page holding code and a hot data structure triggers invalidation storms."],
    v: "Translate a block spanning a page boundary, write to each page in turn, and confirm the block is found and invalidated both times through the page table.",
    dep: ["block-formation","translation-cache","permission-mirroring"]
  },
  "write-protect-trap": {
    s: "Marks pages holding translated code as read-only on the host so any guest write to them traps and the translator can react.",
    d: "Once a page contains translated code, the translator removes write permission on the host while keeping the guest's own permission model. A write faults; the handler invalidates affected blocks, restores write permission, lets the write complete, and may re-protect later. Alternatives include inline checks before stores, which cost on every store. It is hard because faults are slow, so pages that mix code and data cause repeated traps, and because the guest believes the page is writable, the translator must hide the protection.",
    k: ["Hardware page protection vs software checks in stores: hardware is free until a write happens and costs thousands of cycles when it does; software costs every store but never traps.", "Unprotect after a write and retranslate vs keep trapping: unprotecting adapts to data pages but must detect when code is stable again."],
    p: ["Protection that is restored too early traps again before the write retires and loops.", "Faults caused by the protection are delivered to the guest as ordinary access errors."],
    v: "Write one byte into a translated page from the guest and confirm exactly one trap, correct invalidation of that block, and that the new instruction runs afterwards.",
    dep: ["host-fault-handler","code-page-tracking","permission-mirroring"]
  },
  "smc-block-invalidation": {
    s: "Discards translated blocks whose guest bytes changed, unlinking them and ensuring no thread executes them again.",
    d: "On a detected write, flush request or unmapping, the translator finds the affected blocks through the page table, removes lookup entries, reverts incoming links and marks the blocks dead. If another thread could be inside, it waits for a safe point or delays reuse of the memory. The next execution retranslates from the new bytes. It is hard because the writing thread may itself be executing the block being invalidated, so the code under its feet changes mid-execution and execution must resume at the next instruction.",
    k: ["Invalidate immediately vs lazily at next entry: immediate is simple and guarantees freshness; lazy is cheaper but must tag every entry with a version.", "Invalidate whole page vs affected blocks only: whole page is fast and over-invalidates; block-level is precise and needs exact byte ranges."],
    p: ["A thread running the invalidated block continues to execute the old translation for a few instructions after the write.", "Invalidating without removing lookup entries lets the dispatcher jump to freed memory."],
    v: "Have the guest overwrite the instruction immediately after a store in the same block and confirm the new instruction executes, not the old one, on both host and reference runs.",
    dep: ["code-page-tracking","block-lookup-table","block-chaining","translation-cache"]
  },
  "guest-cache-flush-handling": {
    s: "Responds to guest instructions or calls that declare code has changed, which on some instruction sets are required for correctness and on others are no-ops.",
    d: "Some guest instruction sets need an explicit flush after code is written; others keep instruction and data views coherent automatically. The translator treats the flush request as a hint to invalidate blocks over the given range, which is cheap and precise, and also supports guests that never flush because their hardware needs no flush. The write-protect path covers those. It is hard because the two mechanisms must agree: a guest that flushes must not be penalized by protection faults, and one that does not must still work.",
    k: ["Trust flush hints and skip page protection vs always protect: trusting is fast and breaks guests from coherent hardware that never flush; always protecting is safe and costs faults.", "Invalidate exactly the range vs the surrounding pages: exact is precise; surrounding pages tolerate sloppy ranges guests sometimes pass."],
    p: ["A flush over a range given as start and length is read as start and end, invalidating the wrong blocks.", "Ignoring flush because protection should catch it, while protection was disabled for speed."],
    v: "Write a new instruction into a buffer, issue the guest's flush, jump to it and confirm the new code runs, repeated for a range that straddles a page boundary.",
    dep: ["smc-block-invalidation","write-protect-trap","syscall-trap"]
  },
  "guest-jit-support": {
    s: "Supports guests that generate machine code at runtime, such as language runtimes, by making fresh code translatable and fast to invalidate.",
    d: "A guest runtime writes instructions into a buffer, flushes, and jumps to it, often rewriting small patches repeatedly. The translator must notice the new code, translate it, and cope with frequent patching of existing code. Typical designs combine write protection with a short-lived interpreter use for brand-new pages, and detect pages that change too often so they stay in the interpreter. It is hard because translating a fragment the runtime will overwrite soon wastes effort, and because the runtime's own address-space tricks must survive.",
    k: ["Interpret volatile pages vs translate promptly: interpreting avoids wasted translation for churning code; prompt translation helps once code stabilizes.", "Treat all executable anonymous memory as volatile vs track change frequency: blanket treatment is easy and slows stable generated code; frequency tracking adapts at a bookkeeping cost."],
    p: ["Each tiny patch invalidates a whole large block, so translated runtime code is retranslated thousands of times.", "Alias mappings of the same memory as writable and executable bypass the page-protection scheme."],
    v: "Run a guest language runtime benchmark and confirm retranslation counts are bounded, output is correct and speed stays within the expected margin of native execution of the same runtime.",
    dep: ["code-page-tracking","guest-cache-flush-handling","interpreter-tier","write-protect-trap"]
  }
});
