// Details for the hardware description simulator plate, part 3: co-simulation and run management.
ATLAS.details("hdl-simulator", {
  "foreign-language-interface": {
    s: "A standard C-level interface that lets compiled code call into the simulator, read and write signals, and be called from the design or testbench.",
    d: "The interface offers two directions: the testbench calls compiled functions with typed arguments, and compiled code uses a procedural interface to look up objects by name, read and write values, register callbacks on value changes or time, and read the hierarchy. The simulator loads shared libraries at start. It is hard because compiled code runs inside the kernel's address space: a crash or a call at the wrong time corrupts the run, and callbacks must obey the scheduling regions or they create races.",
    k: ["Direct calls with simple data types vs full object access: direct calls are fast and easy, but full access is needed for generic tools and costs more per call.", "In-process libraries vs out-of-process models: in-process is fast, while out-of-process isolates crashes at the cost of messaging overhead."],
    p: ["Compiled code that writes a signal during the wrong region creates a race the testbench cannot see.", "Pointers into simulator memory kept after elaboration changes become invalid."],
    v: "Call a compiled function from a test with every supported argument type and confirm values round trip unchanged, then register a value-change callback and confirm it fires at the same times as the waveform.",
    dep: ["four-state-values", "simulation-image", "event-queues"]
  },
  "software-model-bridge": {
    s: "Connects the simulator to a software model, such as an algorithm or protocol stack written in a general-purpose language, passing transactions in and out.",
    d: "A wrapper converts between simulator values and the model's data structures, calls the model when inputs arrive or a clock ticks, and returns outputs at the right simulated time. It reuses the same model that firmware and architecture teams use, so results are consistent across the project. It is hard because the model has no notion of simulated time: it runs instantly, so the wrapper must decide when its results become visible, and because four-state values must be mapped to two-state data.",
    k: ["Untimed model with the wrapper adding latency vs timed model: untimed is simple and fast, but timing correctness rests on the wrapper, while timed is accurate and costly.", "Pass values by copy vs shared memory: copy is safe, but shared memory is fast for large buffers and needs careful ownership."],
    p: ["Mapping unknown values to zero hides uninitialized signals from the model, so a bug looks fine.", "A model that keeps global state breaks when two instances are created."],
    v: "Run the model standalone and in the bridge on the same input vectors and confirm identical output values, and that results appear in simulation time at the latency the wrapper specifies.",
    dep: ["foreign-language-interface", "time-synchronization", "four-state-values"]
  },
  "system-level-model-bridge": {
    s: "Links a transaction-level system model, used for early architecture work, with detailed design blocks so mixed-abstraction systems run together.",
    d: "A transaction-level model communicates by function calls carrying whole bus transactions, with approximate timing. The bridge, called an adapter or transactor, converts those calls into pin-level activity on the detailed block and back. It lets teams verify one block at signal level inside a fast system model. It is hard because timing semantics differ: the model uses loosely-timed or approximately-timed calls, while the pins demand exact cycles, so the adapter must absorb the difference without breaking ordering.",
    k: ["Adapters per protocol vs generic conversion: per-protocol adapters are correct and efficient, but must be built for each bus.", "Run the system model as one kernel process vs its own scheduler: one process keeps time simple, while a separate scheduler allows model-specific optimization at the cost of synchronization."],
    p: ["Approximate timing at the interface hides back-pressure behavior the real pins would show.", "Transaction ordering changes between the abstract and detailed side."],
    v: "Run the same sequence on the abstract model alone and through the adapter to the detailed block and confirm the functional results match and the cycle counts agree within the model's stated tolerance.",
    dep: ["foreign-language-interface", "bus-functional-models", "time-synchronization"]
  },
  "analog-mixed-signal-bridge": {
    s: "Connects the digital event kernel to an analog solver, converting between logic values and voltages and keeping the two time bases aligned.",
    d: "Digital time advances by events; analog time advances by solver steps that depend on the circuit's behavior. At a boundary, connect modules convert a logic level into a voltage with a driver model, and a voltage into a logic value by a threshold. The solver and kernel exchange time points, and the solver may step back to find an exact crossing. It is hard because accuracy and speed pull apart: tight coupling is accurate and slow, while loose coupling can miss fast edges and produce wrong digital values.",
    k: ["Tight lockstep coupling vs loose exchange at fixed intervals: lockstep catches every crossing, but costs solver steps, while fixed intervals are faster and can miss glitches.", "Real-valued modeling in the digital kernel vs a full solver: real-valued models run at digital speed, but approximate the analog behavior."],
    p: ["Threshold conversion with no hysteresis turns noise on a slow ramp into a burst of false digital edges.", "Digital events scheduled inside a solver step are applied late."],
    v: "Drive a ramp through the boundary and confirm the digital edge appears at the threshold crossing time within the solver tolerance, with no extra edges.",
    dep: ["time-synchronization", "strength-resolution", "real-and-time-types"]
  },
  "processor-model-hosting": {
    s: "Runs a fast instruction-level model of a processor inside the simulation so real software executes against the hardware design, without simulating the processor's gates.",
    d: "The processor model fetches and executes instructions at high speed, and sends memory and device accesses through a bus interface to the simulated hardware. It can run boot code and drivers for tests that would be impractical to write by hand. The model can be paused for debugging software, and it may include a simple timing approximation. It is hard because simulated hardware is thousands of times slower than the model, so the two must be synchronized with a time quantum, and software that polls hardware can stall the whole run.",
    k: ["Instruction-accurate model vs cycle-accurate model: instruction-level is fast enough to boot software, but cycle behavior is approximated; cycle-accurate is faithful and orders of magnitude slower.", "Large time quantum vs small: large quanta run faster, but can reorder hardware and software events visibly."],
    p: ["Software polling a status register burns simulated cycles for hours waiting on a slow peripheral.", "A quantum large enough to skip over an interrupt delivers it at the wrong software instruction."],
    v: "Boot a small program that prints through the simulated device, and confirm the output text and the hardware register accesses in the waveform match the known program trace.",
    dep: ["foreign-language-interface", "bus-functional-models", "time-synchronization"]
  },
  "emulator-bridge": {
    s: "Links the software simulator to a hardware accelerator that runs the design much faster, so part of the system runs in each and a testbench keeps working.",
    d: "An emulator maps the design onto dedicated hardware and runs it at megahertz speeds. The simulator keeps the testbench and any parts not mapped. The bridge passes signals or transactions across, usually at transaction level to keep traffic low, and handles clocks and time between the two. It is hard because a cycle-accurate signal-level link would spend all its time on communication, so the testbench must be restructured so its synchronous parts live in the emulator and its untimed parts stay in the simulator.",
    k: ["Signal-level link vs transaction-level link: signal level supports any testbench and is very slow, while transaction level is fast and requires rewriting the interface components.", "Whole design in the emulator vs partial: whole is fastest, but costs capacity; partial lets part stay flexible, at the price of communication."],
    p: ["A testbench with per-cycle handshakes to the emulator runs no faster than pure simulation.", "Non-synthesizable testbench code placed on the emulator side fails to map."],
    v: "Run the same test in pure simulation and with the bridge and confirm identical scoreboard results; measure cycles per second in each to confirm the speedup.",
    dep: ["ipc-transport", "time-synchronization", "foreign-language-interface"]
  },
  "ipc-transport": {
    s: "The messaging layer that carries values, calls and time updates between the simulator and external processes or machines.",
    d: "Connections use shared memory, pipes or sockets, with a message format for value changes, function calls and control messages. Messages are batched to cut overhead, and a handshake keeps both sides waiting for each other when time must stay aligned. It lets models run in another process, another machine or another vendor's tool. It is hard to keep latency low, since every round trip may cost microseconds and a design needs millions of them, and to survive a peer that crashes or hangs.",
    k: ["Shared memory vs sockets: shared memory is fastest on one machine, while sockets work across machines and add latency.", "Synchronous request-reply vs queued asynchronous messages: synchronous is simple and deterministic, but latency-bound; asynchronous is fast and needs ordering rules."],
    p: ["A peer that hangs freezes the simulation silently with no timeout message.", "Byte order or width differences between hosts corrupt vector values."],
    v: "Send a million messages round trip between two processes, confirm no loss or reordering, record per-message latency, and kill the peer to verify the simulator reports the failure promptly.",
    dep: ["file-and-io-services", "worker-thread-pool"]
  },
  "time-synchronization": {
    s: "Keeps simulated time consistent between the simulator and every connected external model, deciding who may advance and by how much.",
    d: "Each participant has its own time notion. A conservative scheme lets a participant advance only to the earliest time it can be sure no other will send an earlier message; an optimistic scheme advances freely and rolls back on conflict. Practical bridges use a global time quantum or lock-step handshakes at clock edges. The difficulty is the trade-off between performance and causality: any scheme that is too loose reorders cause and effect, and too tight leaves everyone waiting.",
    k: ["Lock-step at every event vs time quantum: lock-step is exact, but spends its effort synchronizing; a quantum is fast and allows a bounded timing error.", "Conservative vs optimistic advance: conservative never needs rollback, but stalls more, while optimistic is faster and requires saving state."],
    p: ["A quantum longer than an interrupt latency makes software see an event before the hardware that causes it.", "Two participants with different time units misalign by a constant factor."],
    v: "Send timestamped messages in both directions at known times and confirm each arrives at the right simulated time under lock-step and under the chosen quantum, with an ordering log showing no inversions.",
    dep: ["time-wheel", "time-precision-units", "ipc-transport"]
  },

  "command-line-and-options": {
    s: "The program's invocation interface: source lists, options, defines and plus-arguments, plus option files that make big builds reproducible.",
    d: "Users pass source files, include paths, preprocessor defines, top module names, timescale defaults, optimization levels and debug switches. Option files hold the long list for a project, and plus-arguments pass values to the running test. Defaults interact: some options change semantics, such as accepted language version or how to treat unknown values. It is hard because there are hundreds of options with subtle effects, and teams copy command lines between projects without understanding them.",
    k: ["One mega-executable with options vs separate compile and run commands: one command is easy to start, while separate steps cache compile results across many runs.", "Strict defaults vs permissive defaults: strict catches errors early, but rejects legacy code that permissive modes accept."],
    p: ["A semantics-changing option copied between projects changes results without anyone noticing.", "Option files with relative paths break when launched from another directory."],
    v: "Run the same project from two different directories using one option file and confirm identical compile logs and results; then print the effective option set and verify it matches intent.",
    dep: ["library-manager", "plusargs-and-environment"]
  },
  "library-manager": {
    s: "Stores compiled design units in named libraries and resolves which unit an instantiation refers to, with versions and search order.",
    d: "Each compiled unit is saved with its dependencies in a library on disk. Libraries map to names, and a search order decides which library supplies a module when several match. Elaboration pulls units from libraries, and recompilation touches only changed ones. It is hard because of consistency: a unit compiled against an old version of a package may be silently stale, and different teams may supply different definitions of a same-named module.",
    k: ["Persistent compiled libraries vs compile everything each run: persistent is fast across runs, but needs invalidation logic; compile-all is simple and slow.", "Single-name global namespace vs per-library namespaces: per-library avoids collisions, but needs configuration to pick one."],
    p: ["A stale compiled package is used with updated source, giving behavior that matches neither version.", "Two libraries supply a module of the same name and the wrong one wins by search order."],
    v: "Change one package, recompile, and confirm every dependent unit is flagged and rebuilt and no others; then instantiate a name defined in two libraries and see the report of which was chosen.",
    dep: ["syntax-tree", "incremental-recompile", "configuration-and-binding"]
  },
  "incremental-recompile": {
    s: "Detects which source units changed and recompiles only those and their dependents, keeping the edit-simulate loop short on large designs.",
    d: "The tool records content hashes and the dependency graph between units: includes, packages, macros and imported definitions. After an edit it computes the affected set, recompiles it, and relinks. Elaboration and code generation may also be incremental, reusing unchanged module images. It is hard because dependencies hide: a macro definition changed in a header affects every file that includes it, and a generated-code step may produce different output for the same input and defeat caching.",
    k: ["Content hashes vs timestamps: hashes are exact and survive checkouts, but cost reading the files, while timestamps are cheap and mislead on touched or copied files.", "Per-unit compile vs per-module elaboration reuse: unit-level is simple, while module-level reuse saves more and needs a stable interface."],
    p: ["An undeclared dependency on a macro file leaves stale objects after an edit.", "Changing a global option reuses incompatible objects built with the old one."],
    v: "Edit a single leaf module and confirm only it and its direct dependents recompile; edit a shared macro header and confirm every including file recompiles; compare resulting simulation with a clean build.",
    dep: ["library-manager", "parser", "preprocessor"]
  },
  "regression-runner": {
    s: "Launches a large set of tests with many seeds, collects pass or fail and coverage, and presents a summary, usually every night.",
    d: "A regression is a list of test names, option sets and seed ranges. The runner expands it into jobs, submits them to a compute farm, retries infrastructure failures, and parses logs for results using a defined pass or fail signature. It merges coverage and tracks trends. The hard part is triage: thousands of failures often have a handful of root causes, so the runner clusters them by error signature, and must separate real failures from tool crashes and license shortages.",
    k: ["Fixed seeds vs fresh seeds each night: fixed seeds make failures reproducible and trendable, while fresh seeds explore more, with each failure recorded for rerun.", "Fail on any error message vs on an explicit result line: error keywords are easy to catch, but explicit results prevent a crashed run being read as a pass."],
    p: ["A run that crashes before printing results is counted as passed when the parser only looks for errors.", "A failure that depends on a seed is lost because the seed was not logged."],
    v: "Seed a deliberate failure into one test, run the regression, and confirm the summary lists that test and seed, groups it with its signature, and a rerun from the logged seed reproduces the failure.",
    dep: ["job-farm-and-licensing", "command-line-and-options", "random-number-streams", "run-logging"]
  },
  "job-farm-and-licensing": {
    s: "Distributes simulation jobs across a pool of machines and obtains the licenses each job needs, queueing when either is scarce.",
    d: "Jobs are submitted to a batch scheduler with memory and time estimates. Commercial tools need license tokens, so the scheduler or runner checks out features before launch, sometimes per feature such as assertion or coverage. Jobs that wait on a license waste a machine slot, so the scheduler matches slots to license supply. The hard part is balance: too many jobs starve interactive debug users of licenses, and memory underestimates cause jobs to be killed late.",
    k: ["Check out a license at job start vs per feature on demand: at start is simple and reliable, but holds features unused, while on demand shares better and risks mid-run failure.", "Pack many small jobs per machine vs one per machine: packing uses cores, but memory contention slows each."],
    p: ["A job killed for exceeding memory after many hours wastes the whole run.", "A license outage reports as hundreds of test failures."],
    v: "Submit more jobs than there are license tokens and confirm excess jobs wait without failing, none run beyond the token count, and all finish when tokens return.",
    dep: ["command-line-and-options", "file-and-io-services"]
  },
  "simulation-profiler": {
    s: "Reports where simulation time and memory go: which modules, processes, assertions and testbench code consume the most.",
    d: "The profiler samples the running simulation or counts events per process, and attributes cost to design units, instances, assertions, coverage and testbench classes. It shows hot spots such as a clock-driven always block that wakes on every edge, or logging at every cycle. Output is a ranked table with source links. It is hard because the cost of a process is not only its code: it includes the events it triggers and the waveform records caused by its signals.",
    k: ["Sampling vs exact counting: sampling has low overhead and can miss short bursts, while counting is exact and perturbs the run.", "Attribute cost by source line vs by instance: line shows what to change, and instance shows which copy of a replicated block is the problem."],
    p: ["Optimizing a hot process that is hot only because of waveform dumping.", "Profiling with debug on shows costs that disappear in a normal run."],
    v: "Add a known busy loop to one module, profile, and confirm that module tops the list with a share close to the added work; remove it and see the share drop.",
    dep: ["process-scheduler", "value-change-recorder", "event-queues"]
  },
  "parallel-partitioner": {
    s: "Splits a design into pieces that run on separate cores or machines, and manages the synchronization needed where pieces share signals.",
    d: "The partitioner divides the netlist so each part has balanced work and few signals crossing the cut. Parts run on separate threads, and at each time step they exchange boundary values and agree on the next time. It works best for gate-level designs with much independent logic; behavioral designs with shared testbench state parallelize poorly. It is hard because synchronization per time step costs more than the saved work when each step does little, and because results must stay identical to the serial run.",
    k: ["Conservative synchronous time steps vs optimistic rollback: conservative is deterministic and simple, but waits at barriers; optimistic scales better and needs state saving.", "Partition by design hierarchy vs by graph cut: hierarchy follows ownership and may be unbalanced, while graph cuts balance but lose structure for debugging."],
    p: ["Fine-grained time steps make barrier cost exceed work and the parallel run is slower than serial.", "Floating-point or ordering differences across partitions change results between runs."],
    v: "Run the same gate-level test serially and on eight partitions and confirm outputs and waveforms match exactly; report the speedup and the fraction of time spent at barriers.",
    dep: ["design-flattening", "net-and-driver-graph", "worker-thread-pool", "time-wheel"]
  },
  "run-logging": {
    s: "Messages printed during a run with severity, time and source, plus controls to filter, redirect and count them.",
    d: "Both the design (through system tasks) and the testbench (through a reporting library) write messages. Each carries severity, a tag, hierarchy and simulation time, and users filter by verbosity and tag. Logs go to the console and files, and regression tools parse them for results. It is hard because logging is costly in a run with millions of messages, because interleaving from concurrent processes must stay readable, and because log format is an interface that scripts depend on.",
    k: ["Verbose logging by default vs quiet by default: verbose makes the first failure diagnosable, but slows runs and fills disks, while quiet requires rerun with more detail.", "Plain text vs structured records: text is human friendly, and structured records are parseable by tools without fragile patterns."],
    p: ["Changing a message wording breaks a regression parser that matched the old text.", "Printing every cycle to a file makes a long run input/output bound."],
    v: "Run a short test at two verbosity levels and confirm the quiet log is a strict subset of the verbose one, every line has a time and severity, and the end summary count equals the number of messages emitted.",
    dep: ["file-and-io-services", "system-task-library"]
  },
});
