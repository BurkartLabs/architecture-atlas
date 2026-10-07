// Details for the hardware description simulator plate, part 7: runtime services and cross-cutting concerns.
ATLAS.details("hdl-simulator", {
  "memory-allocator": {
    s: "Manages memory for design state, queued events, processes and testbench objects, tuned for very many small allocations and for fast bulk release.",
    d: "A simulator allocates enormous numbers of small objects: events, transactions, strings, process records. A general allocator wastes time and space on them, so the runtime uses pools by size class, arenas that are freed all at once, and per-thread caches. Design state is allocated once at load, in a compact layout, while testbench objects churn constantly. It is hard because memory is often the limit on design size, because fragmentation grows over multi-day runs, and because leaks in user code must be diagnosable.",
    k: ["Pooled size classes vs a general-purpose allocator: pools are fast and compact for known sizes, while a general allocator handles any size and costs time.", "Arena for the design plus individual frees for objects: the arena makes load fast and frees nothing until exit, and per-object frees suit the testbench."],
    p: ["Fragmentation in a long regression slowly raises resident memory until the job is killed.", "Per-thread caches hold freed memory that other threads cannot reuse."],
    v: "Run a ten-hour churn test that creates and releases random-sized objects and plot resident memory; it should flatten after warm-up, with allocator statistics showing the pool occupancy.",
    dep: []
  },
  "worker-thread-pool": {
    s: "A set of operating-system threads used for background work such as waveform writing, parallel evaluation, compilation and coverage processing.",
    d: "The pool starts threads at launch, hands them tasks through queues, and joins them at barriers. The kernel's main loop remains single-threaded for semantics, and side work such as compressing the waveform or compiling modules runs in parallel. In parallel simulation the pool runs partitions and synchronizes each time step. It is hard because shared structures need cheap synchronization, because thread count must respect the machine and the job scheduler limit, and because nondeterminism from races must not leak into results.",
    k: ["Fixed pool sized at startup vs dynamic growth: fixed is predictable and respects farm limits, while dynamic adapts to load and can oversubscribe cores.", "Work stealing vs static assignment: stealing balances uneven tasks, and static is simpler and deterministic."],
    p: ["A pool sized to all cores on a shared machine slows other jobs on the farm.", "A task that touches simulator state from a worker introduces rare crashes."],
    v: "Run with one and with eight workers on the same test and confirm identical outputs; confirm CPU use matches the configured count and does not exceed the farm slot limit.",
    dep: ["memory-allocator"]
  },
  "random-number-streams": {
    s: "Seeded pseudo-random generators that give every thread and object its own reproducible sequence, so a failing random test can be rerun exactly.",
    d: "The tool takes a seed per run, derives a stream per process and per object from it by hashing its hierarchical path and creation order, and draws numbers from each stream independently. Because streams are tied to structure, adding one new random call in one component does not change the numbers another component sees. It is hard because stability is fragile: any change to creation order or thread timing can shift streams, and users expect the same seed to reproduce a failure after small code edits.",
    k: ["Per-object streams derived from path vs one global stream: per-object gives stability when code changes, and one global stream is simple and shifts every number after any change.", "Fixed generator algorithm across versions vs improved algorithms: fixed keeps old seeds meaningful, while improved gives better quality at the price of invalidating logged seeds."],
    p: ["Creating one more object in a component changes the sequence for objects created later.", "Seeding with the clock time makes failures impossible to reproduce unless the seed is logged."],
    v: "Run the same test twice with one seed and confirm identical random values in the log; add an unrelated object elsewhere and confirm the values in the unaffected component are unchanged.",
    dep: []
  },
  "time-precision-units": {
    s: "The scheme of time units and precision per module that lets one design mix coarse and fine delays, rounded onto a single global time resolution.",
    d: "Each module declares a unit, the meaning of a delay number such as one nanosecond, and a precision, the smallest step to which delays are rounded. The simulator picks the global resolution as the finest precision anywhere in the design, and scales every delay to an integer count of it. Delay values are rounded when converted. It is hard because one fine-precision module makes the whole design's time integer large and slows the time wheel, and because rounding differences between modules produce small timing errors that move edges.",
    k: ["Global precision from the finest module vs per-module resolution: global is simple and correct for exchanging events, while per-module needs conversion at every crossing.", "Allow a default unit when undeclared vs require declarations: default is convenient, and undeclared units are a classic source of wrong delays."],
    p: ["An imported model with picosecond precision makes a nanosecond design much slower.", "Two files with different default units give the same delay number different meanings."],
    v: "Elaborate modules with units of one nanosecond and one hundred picoseconds and a delay of one point five, and confirm event times in the log equal the correctly scaled and rounded value.",
    dep: []
  },
  "file-and-io-services": {
    s: "Reading and writing files from the design and testbench: memory initialization, stimulus vectors, logs and results, with buffering and handles.",
    d: "System tasks open files by name, read and write formatted text or binary, and load memory contents from hex or binary files. The runtime manages handles, buffering and flushing, and can read and write several files at once. Paths are resolved relative to the working directory or a search path. It is hard because inputs may be huge, as with a ten-gigabyte memory image, and because a crash may lose buffered output, which is exactly the output needed to debug it.",
    k: ["Buffered output flushed at exit vs flushed every line: buffered is much faster for big logs, and loses the end of a crashed run.", "Memory loading at elaboration vs on demand: at elaboration is simple, and on demand avoids loading gigabytes that a test never touches."],
    p: ["Relative paths resolve against the launch directory, so a test works from one directory and not another.", "A crash loses the unflushed tail of the log that held the cause."],
    v: "Load a memory file with a known pattern and read back a sampled set of addresses; kill the run midway and confirm log content up to the last flush interval is intact.",
    dep: ["memory-allocator"]
  },
  "system-task-library": {
    s: "The built-in functions and tasks called with a dollar prefix: display, finish, time, random, file access, conversions, assertion control and many more.",
    d: "The library defines output formatting with format specifiers, simulation control such as finish and stop, queries of time and design properties, random value functions, and conversions between types. User code can extend the set through the foreign interface. Calls are resolved by name at compile time and run in the process that calls them. It is hard because the set is large and has precise formatting rules that scripts parse, because behavior at end of simulation is subtle, and because vendor extensions create portability traps.",
    k: ["Strict standard task set vs vendor extensions: strict is portable, while extensions are convenient and lock tests to one tool.", "Output at the point of the call vs buffered to the end of the time step: immediate matches code order, and a buffered display avoids interleaving across threads."],
    p: ["Using a vendor-specific task makes a test fail to compile on another tool.", "A display of an unknown value prints a letter where scripts expected a number."],
    v: "Call each formatting specifier with zero, one, unknown and high-impedance values and compare printed text with the standard's examples; confirm finish ends the run with the documented exit code and flushes files.",
    dep: ["file-and-io-services", "random-number-streams", "four-state-values"]
  },
  "plusargs-and-environment": {
    s: "Run-time arguments and environment values the test reads at start, such as test name, seed, verbosity and file paths, so one image runs many tests.",
    d: "The command line carries arguments with a plus prefix that testbench code reads with system functions that test for presence and parse a value. Environment variables supply paths. This lets the regression runner choose a test, seed and options without recompiling. It is hard because arguments are untyped strings, because a typo is accepted and ignored, and because options set in several places, such as defaults, files and the command line, must have a documented precedence.",
    k: ["Run-time arguments vs compile-time defines: run-time avoids rebuilds, but typos fail silently, while defines are checked at compile and force a rebuild.", "Central argument parser with a declared list vs ad hoc reads: central catches unknown arguments and needs maintenance, while ad hoc is quick and unchecked."],
    p: ["A misspelled argument is ignored and the test runs with defaults while appearing normal.", "Quoting differences across shells change the value a test reads."],
    v: "Launch with a known set of arguments and confirm the log echoes each effective value and its source; pass a misspelled name and confirm it is reported as unused.",
    dep: ["system-task-library"]
  },

  "simulation-semantics-fidelity": {
    s: "How exactly the simulator follows the language's scheduling and value rules, which decides whether results match other tools and the hardware.",
    d: "The standard defines regions, ordering guarantees and many deliberately undefined orderings. A simulator may pick any legal order, and users unknowingly depend on one. Every layer is affected: the kernel's queue order, assertion sampling, coverage sampling, race behavior at testbench boundaries, and X handling. Strict fidelity costs performance, since freedom to reorder is what optimizers use. The decision is which behavior is guaranteed, which is allowed to vary, and how users can detect a dependence on the unspecified part.",
    k: ["Deterministic legal order vs randomized legal order: deterministic is stable and hides races, while randomized options expose them and make runs vary.", "Exact semantics in all modes vs relaxed in fast modes: exact is trustworthy, while relaxed gains speed and results differ by mode."],
    p: ["A design that works because one tool's order is lucky fails on migration.", "A fast mode that relaxes semantics is used for signoff by default."],
    v: "Run the conformance suite and a race-detection mode that randomizes legal orders; every standard-defined result must be identical across orderings and all differences must be in undefined constructs.",
    dep: ["active-region", "event-queues", "four-state-values", "unknown-propagation-rules"]
  },
  "determinism-and-reproducibility": {
    s: "Whether the same inputs and seed always produce the same run, down to the waveform, across hosts, thread counts and recompiles.",
    d: "Failures found in a nightly regression must be reproducible in a debug session, often on a different machine with a different mode. That requires deterministic scheduling choices, stable random streams, ordered file reads, and identical results from parallel runs and compiled versus interpreted code. Sources of drift: hash-ordered containers, thread timing, floating-point differences, uninitialized memory in the tool itself and options that change optimization. The decision is to treat reproducibility as a requirement and test for it, not to hope.",
    k: ["Bit-identical results across all configurations vs identical within a configuration: across all is the strongest promise and constrains every optimization, while within one is cheaper and requires rerunning in the original mode.", "Fixed iteration order for internal containers vs fastest order: fixed order makes runs repeatable, and hash-order iteration is faster and varies."],
    p: ["A failure that disappears when debug mode is on cannot be debugged.", "Parallel runs that differ in event order give different logs for the same seed."],
    v: "Run one seed in each supported mode and thread count and compare logs and waveforms; any difference is a bug in the simulator or an unspecified-order dependency in the test.",
    dep: ["random-number-streams", "worker-thread-pool", "native-code-generator", "interpreted-mode", "parallel-partitioner"]
  },
  "accuracy-versus-speed": {
    s: "How much detail is simulated: gate-level timing, register-level events, cycle-based evaluation or transaction-level models, each trading exactness for speed.",
    d: "Orders of magnitude separate the levels: gate-level with timing is slowest, register-level event-driven is faster, cycle-based faster still, and transaction-level models fastest. Teams use each at the stage where its answers matter, and mix them in one run. The decision shapes the kernel choices, value system and which bugs can be found at all: glitches, unknown propagation and timing violations vanish as speed rises. The architecture needs clean seams so abstraction levels can be swapped per block.",
    k: ["One high-fidelity engine for everything vs several engines at different levels: one engine is consistent and slow, while several are fast and need bridges that can disagree.", "Mixed-abstraction runs vs separate runs per level: mixed runs reuse tests across stages, but require adapters and a clear contract on timing."],
    p: ["Signing off on a fast abstraction and finding the bug only in gate-level runs weeks later.", "Mixing levels where the interface timing differs creates false failures."],
    v: "Run one test at each available abstraction level and compare functional results and cycle counts; document which classes of bug each level can and cannot expose, with a planted example of each.",
    dep: ["cycle-based-evaluator", "native-code-generator", "system-level-model-bridge", "gate-level-acceleration", "two-state-optimization"]
  },
  "memory-footprint-at-scale": {
    s: "How memory use grows with design size, instance count, signal tracing, coverage and testbench objects, and what limits the largest design a machine can run.",
    d: "A chip-scale design has billions of nets and gates. Per-object overhead, four-state storage, per-instance copies, waveform buffers, coverage counters and the elaborated graph all add up, and memory commonly limits design size before time does. Choices in every layer matter: shared code between instances, compact value storage, sparse memories, streaming waveform output, and lazy loading. The cross-cutting decision is a per-component memory budget that is measured, not assumed.",
    k: ["Compact representations that cost CPU vs fast wide ones: compact fits bigger designs on the farm, and fast uses more memory per net.", "Share structure between instances vs per-instance copies: sharing saves memory and complicates debug and per-instance forcing."],
    p: ["A job that fits in memory in simulation runs out when coverage and dumping are enabled.", "Elaboration needs several times the memory the run itself needs."],
    v: "Measure resident memory at elaboration, at start and at end for a scaled series of designs, with and without dump and coverage, and confirm growth is linear with the design and within each component's budget.",
    dep: ["memory-allocator", "vector-storage", "simulation-image", "design-flattening", "coverage-database"]
  },
  "parallelism-strategy": {
    s: "Where concurrency is used: across independent runs, across design partitions, or for background tasks, and what ordering guarantees must hold within a run.",
    d: "Simulation semantics are sequential in model time, so parallelism comes from three places: many independent runs on a farm, partitions of one design that synchronize each time step, and helper tasks such as dumping and compilation. Each has different gains and costs, and the cheapest by far is running many tests at once. The decision affects data structures, determinism, licensing and debug: intra-run parallelism pays only for large, regular designs with enough work per time step.",
    k: ["Many parallel runs vs one parallel run: many runs scale linearly with no semantic risk, while one run sped up helps a single long test and has synchronization overhead.", "Partition at hierarchy boundaries vs graph cuts: hierarchy is simple and may be unbalanced, and graph cuts balance well and obscure the structure."],
    p: ["Parallelizing a testbench-heavy simulation with little per-step work makes it slower.", "Licenses charged per core make intra-run parallelism cost more than extra serial runs."],
    v: "Measure throughput of the same test at one through sixteen cores for each approach, report speedup and efficiency, and confirm identical results at every setting.",
    dep: ["parallel-partitioner", "worker-thread-pool", "regression-runner", "job-farm-and-licensing"]
  },
  "standards-conformance": {
    s: "How closely the tool follows the published language standards, and how it handles the older versions, vendor extensions and gaps that real code depends on.",
    d: "The language standards are long and revised every few years, and designs span versions. Conformance affects the lexer's keyword sets, the parser's grammar, the type rules, the scheduling semantics and the standard libraries. Users expect legacy code to keep working and new constructs to be accepted on arrival, and also expect the same answer as other tools. The decision is how to version, how to flag extensions, and how to test: with a conformance suite rather than with the tool's own tests.",
    k: ["Strict standard mode by default vs permissive compatibility: strict is portable, while permissive keeps legacy code running and leaves nonportable code unnoticed.", "Implement new standard features early vs wait for stability: early gives users capability and risks rework when the standard is clarified."],
    p: ["A construct the tool accepts as an extension is relied on, and then blocks migration.", "A partly implemented new feature passes simple tests and fails on combinations."],
    v: "Run a public conformance suite and a corpus of real-world designs; list every failing test by standard section, and confirm each extension is flagged by a warning in strict mode.",
    dep: ["lexer", "parser", "type-checker", "simulation-image"]
  },
});
