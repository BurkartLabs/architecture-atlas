// Details for the fuzzer plate, part 4: execution modes, coverage and feedback, bug oracles.
ATLAS.details("fuzzer", {
  "persistent-mode": {
    s: "Runs many inputs through one long-lived target process, looping inside it, to avoid paying process startup for every execution.",
    d: "The harness marks a loop around the entry point. After each input it resets the minimal state and signals the fuzzer through shared memory, then waits for the next input. Process creation, dynamic loading and initialization happen once. Speed rises by one to two orders of magnitude over starting a process per input. It uses the shared memory channel and state reset. It is hard because every leak, global and cached value persists, and a crash kills the process and the progress inside it.",
    k: ["Loop count per process: more iterations amortize startup better, while fewer limit the build-up of leaked state and reduce the chance of cross-run effects.", "Persistent loop versus fork-per-input: persistent is much faster, fork-per-input guarantees a clean state."],
    p: ["Hidden state makes a crash depend on previous inputs and impossible to reproduce alone.", "A slow memory leak ends the process with out-of-memory long before the loop count and crashes the campaign."],
    v: "Measure executions per second in persistent mode and in process-per-input mode on the same target and confirm the gain, then replay a found crash in a fresh process to confirm it is independent of the loop.",
    dep: ["shared-memory-channel", "state-reset", "fuzz-target-interface"]
  },
  "in-process-mode": {
    s: "Links the fuzzing engine into the target process so the mutation loop and the code under test run as one program with direct function calls.",
    d: "The fuzzer's main loop calls the harness function in the same address space, reading coverage directly from the instrumentation counters. No inter-process communication is needed, which makes runs very fast. A crash handler catches signals, saves the current input and exits. It uses compile-time instrumentation and the harness interface. It is hard because the fuzzer and target share memory, so target bugs can corrupt the engine, and one process cannot easily limit memory or recover from hangs and fatal errors.",
    k: ["Shared address space versus a separate process: shared is fastest and simplest to run, separate is safer against target corruption and handles hangs better.", "Handle crashes in a signal handler versus a supervising parent: a handler is self-contained and fragile, a parent is reliable and adds a process."],
    p: ["Heap corruption in the target damages the fuzzer's own data and its results become wrong.", "A hang inside the target stops the engine, so the watchdog must be in another thread and can act only coarsely."],
    v: "Run a target with a known infinite loop and confirm the engine reports a timeout with the offending input saved, and a target with a planted crash is reported with the saved input in a single run.",
    dep: ["compile-time-instrumentation", "fuzz-target-interface", "timeout-detection"]
  },
  "fork-server": {
    s: "Starts the target once, runs initialization, and then creates each execution by forking a copy, so every run starts from the same warmed-up state.",
    d: "A small stub in the target waits at the start of main for commands from the fuzzer. On request it forks, the child runs one input and exits, and the parent reports the status. Dynamic linking and initialization are paid once, and every execution begins from the same memory image. It uses a pipe channel to the fuzzer and shared memory for coverage. It is hard because fork cost grows with memory size and threads, and targets that start threads before the fork point cannot use it cleanly.",
    k: ["Fork server versus exec each run: fork is several times faster and requires the target to be fork-safe, exec works on anything.", "Fork at program start versus at the harness entry: later forks skip more initialization and need a place to fork that is safe."],
    p: ["Threads created before the fork are absent in the child and the target deadlocks.", "A large address space makes each fork expensive and speed falls with target size."],
    v: "Compare executions per second with the fork server on and off on the same target and confirm the gain, and confirm every child begins with identical global state.",
    dep: ["shared-memory-channel", "process-isolation"]
  },
  "snapshot-fuzzing": {
    s: "Captures the memory and register state of a target at a chosen point and restores it before each input, skipping the work needed to reach that point.",
    d: "A snapshot is taken after initialization or just before parsing, either of a process, a virtual machine or an emulated system. Each run restores only the pages the previous run dirtied, executes the input and records coverage. It suits large systems with expensive startup, such as operating system kernels, firmware and services. It uses the virtualization layer. It is hard because everything the state touches must be capturable, devices and external I/O need modeling, and the snapshot must be taken at a representative moment.",
    k: ["Snapshot restore versus restart: restore skips startup and gets very high speeds, while restart is simple and works everywhere.", "Whole-system snapshot versus process snapshot: whole system covers kernels and devices at larger cost, process snapshots are lighter and only cover user space."],
    p: ["State outside the snapshot, such as a timer or device buffer, leaks between runs.", "A snapshot taken too late skips the code that parses the input and is never fuzzed."],
    v: "Restore the snapshot and run the same input many times and confirm identical coverage each time, then measure restore cost per run against full startup.",
    dep: ["virtualization-layer", "kernel-and-firmware-targets", "state-reset"]
  },
  "emulated-execution": {
    s: "Runs a binary under an emulator or dynamic translator, inserting coverage collection without needing source code or a rebuild.",
    d: "A translator reads machine code blocks, rewrites them to record coverage and executes the result. It can run code for a different processor, or binaries with no source. Emulated I/O and system calls are provided by the emulator. It trades speed for reach: typical slowdowns are several times to tens of times. It supplies feedback in place of compile-time instrumentation. It is hard because translation overhead is large and emulated environments differ from real ones in system calls, devices and timing.",
    k: ["Emulation versus compile-time instrumentation: emulation works with only a binary and costs speed, instrumentation is faster and needs source.", "Full-system versus user-mode emulation: full-system covers devices and kernels at greater cost, user-mode is lighter and covers only application code."],
    p: ["An unimplemented system call or device makes the target exit early and fuzzing looks successful while testing nothing.", "Emulator bugs produce crashes that real hardware would not show."],
    v: "Run a binary under emulation and confirm coverage grows on valid inputs, then run a known bug-triggering input on real hardware and in emulation and confirm the same failure.",
    dep: ["binary-instrumentation", "virtualization-layer", "edge-coverage"]
  },
  "kernel-and-firmware-targets": {
    s: "Fuzzing operating-system kernels, drivers and embedded firmware, where the input arrives through system calls, device interfaces or peripheral emulation.",
    d: "Kernel fuzzing generates sequences of system calls with typed arguments and runs them inside a virtual machine, watching for crashes, hangs and sanitizer reports. Firmware and driver fuzzing models the peripherals the code talks to, feeding fuzzed data where hardware would answer. It uses snapshots, emulation and structure-aware call generation. It is hard because failures corrupt the machine, so the system is restarted often, and because modeling hardware is large work whose gaps cap coverage.",
    k: ["Real hardware versus emulated peripherals: hardware is faithful and slow to scale, emulation scales and misses behavior that was not modeled.", "System call descriptions by hand versus inferred: descriptions give valid, deep calls, inference is cheap and shallow."],
    p: ["A crash hangs the whole virtual machine without a report, and the fuzzer cannot tell a hang from slowness.", "Peripheral models return only well-behaved data and driver error paths remain untested."],
    v: "Plant a defect in a driver, run the campaign in a virtual machine, and confirm a report with the call sequence that triggers it, then confirm the machine is restored and continues.",
    dep: ["snapshot-fuzzing", "api-sequence-fuzzing", "virtualization-layer"]
  },
  "timeout-detection": {
    s: "Detects runs that take too long, kills them and records them, since a hang can be a bug and blocking one worker wastes its time.",
    d: "The engine sets a time limit per execution, typically a multiple of the typical run time, measured with a timer in a watchdog thread or a supervising process. On expiry it kills or interrupts the run and either discards the input or files it as a hang. Limits adapt to observed speed. It uses process control or signals. It is hard because a loose limit wastes time on every hang, and a tight one reports slow but valid inputs as failures, especially on a loaded machine.",
    k: ["Fixed timeouts versus adaptive ones: fixed is predictable, adaptive tracks the target but can creep upward.", "Reporting hangs as bugs versus ignoring: reporting finds algorithmic complexity bugs and produces many false alarms."],
    p: ["A loaded host makes slow inputs time out and reports a flood of nonreproducible hangs.", "Time-outs in the harness's own setup are blamed on inputs."],
    v: "Feed a known infinite loop and a known slow but terminating input, and confirm the first is reported as a hang within the limit and the second completes and is kept.",
    dep: ["process-isolation", "resource-limits"]
  },
  "throughput-accounting": {
    s: "Measures executions per second and where time goes, in the target, the fuzzer and the system, so slowdowns can be found and fixed.",
    d: "The engine counts executions, time spent in the target, in mutation, in coverage evaluation and in syscalls, plus restarts and timeouts. Throughput is the fuzzer's most direct lever on bug finding, so measurement drives harness fixes such as removing logging, avoiding allocations or switching modes. It supplies campaign statistics. It is hard because the measurement itself costs time, and because speed varies with input: slow inputs are often the interesting ones.",
    k: ["Counting all executions versus only useful ones: all is simple, useful-only reveals wasted effort and needs classification.", "Sampling profiler versus exact counters: a profiler finds hot spots with low overhead, exact counters are precise and perturb timing."],
    p: ["A harness that prints for every input spends most of its time on output and is never noticed.", "Average speed hides a few extremely slow inputs that occupy most of the time."],
    v: "Profile one campaign hour and confirm the time breakdown sums to the wall clock, then remove an identified bottleneck and confirm executions per second rises by the predicted amount.",
    dep: ["process-isolation"]
  },
  "compile-time-instrumentation": {
    s: "Compiler-inserted code that records which basic blocks or edges run, giving the fuzzer coverage at low cost and with source-level accuracy.",
    d: "During compilation, a pass inserts a small counter update at each edge or block, writing to a shared array. Other passes can add comparison hooks and sanitizer checks. Everything runs inline with optimizations applied. Overhead is typically tens of percent. It supplies the edge coverage map and comparison feedback. It is hard because it needs source or intermediate code for the whole target, and libraries that are not rebuilt are blind spots in the coverage.",
    k: ["Instrument every edge versus selected functions: every edge gives full feedback and costs more, selecting is faster and misses the rest.", "Inline counters versus callbacks: inline is faster, callbacks let the engine add custom logic and cost a call per edge."],
    p: ["A dependency built without instrumentation hides its code, so inputs that exercise it show no progress.", "Instrumentation after heavy optimization changes edge structure and identities differ between builds."],
    v: "Run the instrumented target on two inputs known to take different branches and confirm the coverage maps differ in the expected edges and are identical on repeat.",
    dep: ["fuzzing-build-config"]
  },
  "binary-instrumentation": {
    s: "Adds coverage collection to a compiled program without source, by rewriting the binary ahead of time or translating it while it runs.",
    d: "Static rewriting disassembles the binary and inserts coverage code at block boundaries, producing a new executable. Dynamic instrumentation does the same at run time inside a translation layer. It works on closed-source programs and libraries. It supplies the same edge map as compile-time instrumentation. It is hard because disassembly is imperfect, rewriting can break code that mixes data and instructions, and run-time translation costs a large slowdown.",
    k: ["Static rewriting versus dynamic translation: static is faster at run time and fragile on complex binaries, dynamic is robust and slower.", "Binary instrumentation versus rebuilding with source: binary gives reach and is slower and lacks type information."],
    p: ["A rewritten binary silently misbehaves where code and data are mixed and results are wrong.", "Self-modifying or packed code escapes the rewriter and coverage is empty."],
    v: "Instrument a binary, run it on its sample inputs and confirm identical outputs to the original, and nonempty coverage that differs between inputs taking different paths.",
    dep: ["edge-coverage"]
  },
  "edge-coverage": {
    s: "The record of control-flow transitions between code blocks, usually stored in a fixed-size array indexed by a hash of the edge.",
    d: "For each executed transition from block A to block B, the instrumentation updates a slot computed from their identities. After a run the array is compared with the global one, and a new set slot means new coverage. Edges capture more than block coverage, since the same blocks in a different order are different. It underlies corpus admission and scheduling. It is hard because the array is small by design for speed, and distinct edges can share a slot, hiding new coverage.",
    k: ["Edge coverage versus block coverage: edges distinguish ordering and cost slightly more, blocks are simpler and miss branch combinations.", "Edge only versus with calling context: context separates the same code reached in different ways and enlarges the map and the corpus."],
    p: ["Hash collisions make a truly new path look old and it is never kept.", "Edge identities change with every build, so stored maps cannot be compared across versions."],
    v: "Run inputs that take a known set of distinct branches and confirm the set of nonzero slots matches the expected count with the collision rate stated for the map size.",
    dep: ["compile-time-instrumentation", "map-sizing-and-collisions"]
  },
  "hit-count-bucketing": {
    s: "Groups the number of times each edge executed into ranges, so loop iteration counts matter but small changes in counts do not look like new behavior.",
    d: "Raw counters are mapped into classes such as one, two, three, four to seven, eight to fifteen and so on before comparison. An input is new if any edge moves into a class not seen before. This detects behavior such as a loop running more times without calling every distinct count novel. It runs after every execution. It is hard because the bucket boundaries are a heuristic: too fine and the corpus explodes with trivial variants, too coarse and loop-related bugs are missed.",
    k: ["Coarse buckets versus raw counts: coarse buckets keep the corpus small, raw counts treat every iteration count as new and bloat it.", "Bucketing every edge versus only loop edges: every edge is simple and uniform, selective bucketing needs control-flow analysis."],
    p: ["Counts that vary with thread timing change buckets between runs and unstable inputs are admitted.", "Saturating counters at 255 hide behavior in loops that run longer."],
    v: "Run inputs that execute a loop one, two, eight and one hundred times and confirm the bucketed maps distinguish ranges as configured and not adjacent small counts.",
    dep: ["edge-coverage"]
  },
  "hardware-trace-coverage": {
    s: "Collects coverage from the processor's own branch tracing facility, avoiding any instrumentation in the target.",
    d: "The processor writes a compressed log of taken branches to a memory buffer. A decoder reconstructs the executed path from the log and the binary and fills the coverage map. No code changes are needed, and the target runs near native speed with the trace on. It supplies feedback for binary-only targets. It is hard because the trace buffer fills quickly, decoding costs time, kernel and virtualization support is required, and the facility differs between processors.",
    k: ["Hardware tracing versus software instrumentation: hardware is nearly free in the target and needs support and decoding time, software works anywhere at higher run cost.", "Tracing only the target's address range versus all code: filtering cuts trace volume and misses library paths."],
    p: ["Trace buffer overflow loses part of the path and coverage is silently incomplete.", "Decoding needs the exact loaded binary, and relocations or self-modifying code give wrong paths."],
    v: "Compare edges from hardware tracing and from software instrumentation on the same inputs and confirm the sets agree except for edges outside the traced range.",
    dep: ["binary-instrumentation", "virtualization-layer"]
  },
  "comparison-feedback": {
    s: "Records the operands of comparisons inside the target, so the fuzzer can see how close an input came to passing a check and which values it needs.",
    d: "Instrumentation at comparisons and string or memory compare calls reports both operands. The engine can score partial matches, such as how many leading bytes of a string matched, and copy the expected constant into the input at the right position. This breaks through magic values and checksums that random mutation almost never satisfies. It feeds dictionary mutation and arithmetic mutation. It is hard because it adds overhead at every comparison, and the value compared is often derived, not directly present in the input.",
    k: ["Replace operands directly versus add them to a dictionary: direct replacement is targeted and needs position tracking, a dictionary is simple and approximate.", "Record every comparison versus selected ones: every one is thorough and slow, a selection is fast and misses some checks."],
    p: ["A comparison against a hashed or transformed value never matches because the needed bytes differ from the operand.", "Instrumenting comparison functions in libraries floods the log with unrelated values."],
    v: "Fuzz a target that requires a 4-byte magic constant with and without comparison feedback and confirm the feedback run passes the check in a small fraction of the time.",
    dep: ["compile-time-instrumentation", "dictionary-store"]
  },
  "dataflow-feedback": {
    s: "Tracks which input bytes influence which operations in the target, so mutation can focus on bytes that matter for a particular condition.",
    d: "Taint tracking labels input bytes and propagates labels through computation, recording which labels reach comparisons, array indexes and allocation sizes. The mutator then targets only those bytes. It speeds discovery of conditions that depend on a few input bytes. It runs as a separate analysis pass or a slower instrumented mode. It is hard because tracking is expensive, loses precision through arithmetic and control dependencies, and labels spread until they mean little.",
    k: ["Precise taint tracking versus approximation by mutation: precise tracking is accurate and slow, approximating by mutating bytes and observing is simpler and noisy.", "Track all data flows versus only to comparisons: all is complete and costly, comparisons only are cheap and sufficient for most uses."],
    p: ["Taint labels spread to the whole input through a checksum, and every byte appears important.", "Implicit flows through branches are not tracked and some input dependence is missed."],
    v: "On a target where one input byte decides a branch, confirm the tracker reports that byte for the branch and no unrelated bytes.",
    dep: ["compile-time-instrumentation", "comparison-feedback"]
  },
  "state-feedback": {
    s: "Feedback based on program state, such as protocol state, variable values or memory shape, to find progress that code coverage does not show.",
    d: "Some targets progress through states that are the same code run many times: a connection state machine, a game level, a graph database. Feedback is collected from chosen variables, from labeled states or from custom annotations placed by the author. New states count as new coverage and keep inputs in the corpus. It complements edge coverage. It is hard because states must be chosen by hand, a state space can be huge and cause corpus explosion, and a poor annotation rewards meaningless variation.",
    k: ["Author-annotated state versus automatic inference: annotated gives meaningful progress and costs expert time, inference is free and noisy.", "Fine state distinctions versus coarse: fine finds subtle states and floods the corpus, coarse keeps it small and misses them."],
    p: ["An annotation includes a counter or timestamp so every input looks new and the corpus grows without bound.", "States chosen by the author miss the actual dimension that matters."],
    v: "Add state feedback to a target with a multistep protocol and confirm the fuzzer reaches later protocol states than with edge coverage alone in the same time.",
    dep: ["edge-coverage", "protocol-state-fuzzing"]
  },
  "map-sizing-and-collisions": {
    s: "The choice of coverage array size and hashing, which trades speed and cache use against the chance that distinct edges share a slot and hide discoveries.",
    d: "The coverage array must fit in cache for speed, typically tens of kilobytes to a few megabytes. Large targets have more edges than slots, so collisions grow with program size. Tools offer a bigger map, collision-aware edge identifiers or per-module maps. It affects edge coverage and global merging. It is hard because collisions are silent: the fuzzer has no sign that an edge was missed, so large programs lose a growing share of coverage without any visible error.",
    k: ["Small cache-friendly map versus large map: small is fast and collides often on large targets, large avoids collisions at a per-run cost.", "Random edge ids versus collision-free assigned ids: random is simple and lossy, assigned ids need global knowledge at build time."],
    p: ["A large target saturates a default map, and coverage appears to plateau because of collisions and not exhaustion.", "Increasing the map size without recomputing stored corpora makes old coverage data meaningless."],
    v: "Estimate collision rate from the count of instrumented edges and the map size, then run with a map several times larger and confirm any extra edges found match the estimate.",
    dep: ["compile-time-instrumentation"]
  },
  "memory-error-sanitizers": {
    s: "Compiler and runtime checks that detect out-of-bounds access, use after free and similar memory errors at the moment they happen, not later.",
    d: "The instrumentation checks each memory access against shadow memory that records which bytes are valid, and the allocator places redzones and delays reuse of freed memory. A violation stops the run with a report including the access, allocation and free stacks. Without it, most memory errors corrupt silently and do not crash. It uses the fuzzing build and reports to crash handling. It is hard because it costs memory and speed, typically a few times, and misses errors inside uninstrumented libraries.",
    k: ["Sanitizers on all fuzzing runs versus a sampled subset: all runs find every error and cost speed, sampling is faster and misses some.", "Detailed allocator with redzones versus plain allocator: redzones find overflows and use more memory, plain is lean and blind."],
    p: ["Uninstrumented dependencies contain the corruption and no report appears until a later crash far away.", "Memory limits are exceeded by shadow memory and reported as target out-of-memory."],
    v: "Run a target with a planted off-by-one write against the fuzzing build and confirm an immediate report naming the access, the allocation site and the offset.",
    dep: ["fuzzing-build-config", "crash-signal-handling"]
  },
  "undefined-behavior-checks": {
    s: "Runtime checks for operations the language leaves undefined, such as signed overflow, bad shifts, misaligned access and invalid enum values.",
    d: "The compiler adds checks that run before risky operations and report a violation, optionally with a recoverable continue, so a fuzzer can collect many findings in one run. These are bugs that may work today and change behavior with a new optimizer. Checks target integer and pointer-related operations and type confusions. They use the same build path as other oracles. They are hard because many reports are benign by intent, so teams must triage which are real, and checks change code size and speed.",
    k: ["Fatal versus recoverable reports: fatal stops at the first issue and is clear, recoverable gathers more but may crash later in a confusing way.", "Enable all checks versus a chosen set: all finds more and flags intentional behavior, a chosen set is quieter and misses some."],
    p: ["Intentional wraparound in hash code is flagged and teams suppress the whole category.", "A report in code that is optimized away on release builds is dismissed although other compilers may exploit it."],
    v: "Run an input that overflows a signed integer in the target and confirm a report with the source line and operands, and that clean inputs produce none.",
    dep: ["fuzzing-build-config", "crash-signal-handling"]
  },
  "uninitialized-memory-detector": {
    s: "Tracks whether each byte has been written before it is read, and reports when uninitialized data influences a decision or leaves the program.",
    d: "A tracker marks memory as undefined when allocated and defined when written, propagating the state through copies and arithmetic. It reports when an undefined value controls a branch, is used as an address or is output. These bugs leak information and cause behavior that varies between runs. It runs in a dedicated build because it needs the whole program instrumented. It is hard because it has a heavy cost, requires every library to be instrumented to avoid false reports, and false positives from padding bytes are common.",
    k: ["Whole-program instrumentation versus partial: whole is accurate and heavy, partial is faster and produces false positives at the boundary.", "Report on branches only versus on any use: branches only is quiet, any use finds more and flags harmless copies."],
    p: ["An uninstrumented library writes memory the tracker thinks is uninitialized and reports false bugs.", "The slow build is skipped, so these bugs are never searched for."],
    v: "Run an input that causes a branch on an uninitialized stack variable and confirm a report naming the variable's allocation and the branch.",
    dep: ["fuzzing-build-config", "crash-signal-handling"]
  },
  "race-and-deadlock-detectors": {
    s: "Instrumentation that watches memory accesses and locking across threads, and reports data races and lock-order cycles found during execution.",
    d: "The detector records, per memory location, which thread accessed it and with which synchronization ordering, and flags accesses from two threads with no ordering where at least one is a write. A lock graph finds cycles that indicate potential deadlock. It reports on schedules that did not actually fail. It runs in a separate build. It is hard because it multiplies runtime and memory several times, and fuzzers explore few thread interleavings, so races appear only when the schedule happens to exercise them.",
    k: ["Happens-before detection versus lockset detection: happens-before has fewer false alarms and misses races not witnessed, lockset reports more potential races and more noise.", "Run with threads in fuzzing versus single-threaded harness: threads find concurrency bugs and hurt determinism and speed."],
    p: ["A race that needs a rare interleaving is not seen in any run and the target is declared clean.", "Detector overhead slows the target so much that executions per second collapse."],
    v: "Run a target with a planted unsynchronized shared write and confirm a report naming both accesses and their stacks, and that correctly locked code reports nothing.",
    dep: ["fuzzing-build-config", "flaky-crash-handling"]
  },
  "crash-signal-handling": {
    s: "Catches fatal signals and aborts, records the failing input and the machine state, and reports the failure to the fuzzer.",
    d: "A handler installed in the target or a supervising process intercepts faults such as invalid memory access, illegal instructions, arithmetic errors and abort calls. It saves the current input, prints the stack and registers, and tells the engine to count the run as a crash. Out-of-process supervisors read the exit status and core information. It is the base oracle that every other oracle reports through. It is hard because handlers run in a broken process, so they must avoid allocation and locks, and one must not be replaced by the target's own handler.",
    k: ["Handler in the target versus supervisor outside: in-process is fast and fragile, outside is robust and requires a context switch per crash.", "Treat any abnormal exit as a crash versus only specific signals: any is thorough and noisy, specific ones are quieter and miss some failures."],
    p: ["The target installs its own handler and swallows the fault, so the crash is never seen.", "The handler allocates memory in a corrupted heap and hangs instead of reporting."],
    v: "Send a known fault-causing input and confirm the engine saves exactly that input, records the signal and a stack, and continues to the next input or restarts.",
    dep: ["process-isolation"]
  },
  "assertions-and-invariants": {
    s: "Checks written into the harness or the target that state what must always be true, turning silent logic errors into visible failures.",
    d: "Assertions in the code, and invariant checks in the harness after each call, verify properties such as a data structure staying sorted, a counter matching a recount or a decoded value matching its re-encoding. Failure aborts the run and is reported like a crash. Fuzzing builds can enable expensive checks that production disables. It uses crash handling to report. It is hard because the fuzzer only finds what the checks can see, and good invariants need domain knowledge and run time.",
    k: ["Expensive internal checks in fuzzing builds versus production parity: expensive checks find deep corruption early, production parity tests the code that ships.", "Check after every call versus at the end: every call locates the cause precisely, the end is cheaper and less informative."],
    p: ["Assertions compiled out of the fuzzing build, so logic errors pass unnoticed.", "A failing invariant in the harness's own bookkeeping is reported as a target bug."],
    v: "Plant a bug that corrupts a data structure invariant without crashing and confirm the invariant check aborts with the check's message at the first corrupting call.",
    dep: ["crash-signal-handling", "stateful-harness"]
  },
  "resource-exhaustion-oracles": {
    s: "Detect inputs that make the target use excessive memory, time or output, which are denial-of-service bugs even though nothing crashes.",
    d: "Limits on address space, allocation size and run time turn extreme resource use into a reportable failure. Allocation hooks reject single allocations above a threshold, and the timeout detector reports inputs that run far longer than average. Findings include huge allocations from unchecked length fields and quadratic algorithms. It uses resource limits and timeout detection. It is hard because thresholds are policy: a legitimate large input and an attack look similar, and false reports are common.",
    k: ["Strict limits versus generous: strict limits find more denial-of-service bugs and flag legitimate large inputs, generous limits are quiet and miss moderate abuse.", "Fail on large allocation versus let it proceed: failing is detected immediately, proceeding shows real behavior and may exhaust the machine."],
    p: ["A threshold set from small seeds flags ordinary large inputs and reports are ignored.", "The out-of-memory killer ends the process with no report and no saved input."],
    v: "Feed an input whose length field requests a multi-gigabyte allocation and confirm a report names the allocation site and requested size and the process survives.",
    dep: ["resource-limits", "timeout-detection"]
  },
  "leak-detection": {
    s: "Finds memory allocated and never freed, at exit or periodically, which matters for services that run for long periods and for fuzzing stability.",
    d: "A leak checker scans memory for reachable pointers at exit or at checkpoints and reports blocks no pointer refers to. In a fuzzing loop, memory growth across iterations is also tracked, since a leak per input eventually exhausts memory. Reports include the allocation stack. It uses the memory sanitizer's allocator and state reset checks. It is hard because intentional caches and lazily freed globals look like leaks, and reports at exit can arrive long after the offending input.",
    k: ["Check every iteration versus at exit: every iteration pinpoints the input and slows the loop, exit checks are cheap and blame nothing in particular.", "Treat leaks as bugs versus suppress known ones: treating them as bugs keeps long-running services healthy, suppression keeps the noise manageable."],
    p: ["A leak in the harness's own code is reported as a target bug.", "Leak detection at exit is disabled by default in some builds and the findings never appear."],
    v: "Run an input that allocates and drops a block on a known path and confirm a report with the allocation stack, and that the same run without that input reports no leak.",
    dep: ["memory-error-sanitizers", "state-reset"]
  },
});
