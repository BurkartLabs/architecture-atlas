// Details for the hardware description simulator plate, part 2: assertions, coverage, waveforms and debug.
ATLAS.details("hdl-simulator", {
  "immediate-assertions": {
    s: "Checks evaluated at the moment a statement executes, like an if with a failure report, used for conditions that must hold at a point in procedural code.",
    d: "An immediate assertion evaluates an expression when control reaches it and reports pass or fail with a severity and message. Deferred forms evaluate in a later region of the same time step so that glitches from intermediate delta cycles do not trigger false failures. They run inside the process that contains them, so cost is the cost of one expression. Hard parts are glitches on combinational signals and the interaction with unknown values, where an unknown condition is neither true nor false.",
    k: ["Immediate checks in procedural code vs temporal assertions: immediate checks are simple and cheap, but can only see the current values, not behavior over time.", "Deferred evaluation vs immediate: deferred suppresses glitch failures, but delays the report relative to the cause."],
    p: ["An assertion on a combinational signal fires on a transient value that settles correctly a delta later.", "A condition that evaluates to unknown takes the else branch and is reported as failure, or silently passes, depending on form."],
    v: "Drive a signal through a glitch within one time step and confirm the deferred assertion stays quiet while the immediate form reports, then hold the bad value at the end of the step and confirm both fire.",
    dep: ["active-region", "four-state-values", "assertion-reporting"]
  },
  "sequence-and-property-compiler": {
    s: "Translates temporal assertions, such as one event followed by another within some cycles, into automata or checker code that the simulator can run alongside the design.",
    d: "Sequences describe patterns over clock ticks with delays, repetition and conjunction; properties combine sequences with implication and quantifiers over time. The compiler rewrites them into finite automata or equivalent procedural checks, resolving the clock, reset disable conditions and sampled-value functions. It must follow the language's formal semantics exactly, including how values are sampled before the clock edge. It is hard because patterns with unbounded repetition can create very many parallel matches, and because the formal definition has subtle corners.",
    k: ["Automaton compilation vs interpretation of the property tree: automata are fast at run time, but compile slowly and grow with delay ranges, while interpretation is flexible but slower.", "Strict formal semantics vs cheap approximations: strict is portable across tools, but costs more evaluation work."],
    p: ["Delay ranges like one to hundreds of cycles expand into very many threads and slow the whole simulation.", "Sampling at the wrong region gives a different answer than the formal definition."],
    v: "Run a property suite with known pass and fail traces from the language's conformance tests, and confirm every trace gets the specified verdict, including edge cases such as disable during a match.",
    dep: ["syntax-tree", "assertion-threads", "type-checker", "four-state-values"]
  },
  "assertion-threads": {
    s: "The runtime instances of an assertion that start at each matching clock tick and track partial matches until each succeeds or fails.",
    d: "A concurrent assertion starts a new attempt every sampled clock tick. Each attempt advances through the automaton as ticks arrive, and ends in pass, fail or vacuous pass when its antecedent never matched. The runtime holds the live attempts in a list and evaluates them at the observed region of each time step, after design values settle. The challenge is the number of simultaneous attempts, since a property with a long window may have hundreds alive, each carrying local variables.",
    k: ["One thread per attempt vs merged states: separate threads keep local variables and exact diagnostics, but merged states bound the cost and lose per-attempt detail.", "Evaluating every cycle vs only on antecedent activity: skipping saves time, but needs a sound way to prove nothing can start."],
    p: ["Vacuous passes counted as real passes inflate confidence in a property whose condition never occurred.", "Attempts that never terminate keep memory growing for the entire run."],
    v: "Count attempts, passes, failures and vacuous passes on a trace where you know the numbers, and confirm they match exactly; then check peak live attempts stay under the expected window size.",
    dep: ["sequence-and-property-compiler", "event-queues", "memory-allocator"]
  },
  "assertion-reporting": {
    s: "The message, severity and control layer for assertion results, including pass counts, failure details, stop-on-error and the ability to turn assertions on or off by scope.",
    d: "When an assertion fails the simulator prints the time, instance path, source location and message, optionally with the values of the signals involved, and can stop the run or just count. Users control assertions by scope and severity, and by phase, for example disabling checks while reset is active or while power is off. The result is also written to a database for regression summary. It is hard to give enough context for diagnosis without drowning the log in thousands of repeated failures after the first.",
    k: ["Stop at first failure vs continue and count: stopping saves time and keeps the failing state, while continuing shows how widespread the problem is.", "Verbose context dumps vs terse messages: context speeds diagnosis, but costs time and log size when failures repeat."],
    p: ["A single root cause produces thousands of identical failure lines that hide a second, independent bug.", "Assertions disabled for a block during bring-up are never turned back on."],
    v: "Force one failure and confirm the report carries time, full hierarchical path, source line and the sampled values; then force a repeat and confirm the summary shows count two without reprinting the context.",
    dep: ["run-logging", "dump-control", "simulation-image"]
  },
  "functional-coverage": {
    s: "Measures whether the tests exercised the behaviors the verification plan lists, expressed as points the engineer defines, not as lines of code.",
    d: "Engineers declare what matters: values of a field, combinations of two fields, sequences of events, states a protocol visited. The simulator samples these when told to and counts how many times each target was hit. A plan links each requirement to coverage items, and closure means every item is hit or explicitly excluded. It is hard because coverage defined too loosely gives false confidence, and defined too tightly creates unreachable targets that must be analyzed one by one.",
    k: ["Coverage from the plan vs coverage from what the design does: plan-driven items reflect requirements, but miss behavior nobody thought to list; implementation-driven items are complete but meaningless to a reviewer.", "Sample on every cycle vs on transaction completion: transaction sampling is cheap and meaningful, but cycle sampling catches intra-transaction states."],
    p: ["A cover point sampled before values settle counts values that never existed.", "One hundred percent coverage reported on a plan that omitted a feature."],
    v: "Run a test that you know exercises exactly three of five planned values and confirm the report shows three hit and two missing, then add the two and see closure.",
    dep: ["cover-groups-and-bins", "monitors", "coverage-database"]
  },
  "cover-groups-and-bins": {
    s: "The language constructs that define sampled variables, group them into ranges or value sets called bins, and cross them to track combinations.",
    d: "A cover group names sampling event and variables. Each variable is divided into bins: explicit values, ranges, transitions between values, or automatically generated ones. Crosses count combinations across variables, with filters to ignore illegal combinations. At each sample the runtime finds the matching bin by value and increments it. The hard part is combinatorial explosion: crossing several wide variables creates millions of bins, which costs memory and makes closure analysis impractical.",
    k: ["Automatic bins vs explicit bins: automatic is quick to write, but yields arbitrary ranges that do not map to requirements, while explicit bins are meaningful but need care.", "Wide crosses vs several small crosses: wide crosses are thorough, but the bin count explodes."],
    p: ["Default auto-binning of a thirty-two-bit field creates a bin count capped by tool defaults, hiding the case that matters.", "Illegal combinations left unfiltered stay forever uncovered and block closure."],
    v: "Sample a cross of two three-valued variables with all nine pairs and confirm nine bins hit; then mark one pair illegal and confirm hitting it raises an error and it leaves the denominator.",
    dep: ["functional-coverage", "four-state-values", "memory-allocator"]
  },
  "code-coverage-instrumentation": {
    s: "Automatic counters inserted into the compiled design that record which lines, branches, conditions and state transitions executed, without the engineer writing anything.",
    d: "At compile time the tool adds a counter to each statement, branch arm, sub-condition and finite-state-machine transition. At run time the counters increment, and at the end they are written to the database. It reveals code that no test reached, including dead code and untested conditions. Costs: extra work on every statement slows simulation, and the instrumented design may be changed by optimizations. Interpreting results is hard because unreached code is sometimes unreachable by design, such as defensive default cases.",
    k: ["Instrument everything vs selected scopes: everything is complete, but slows simulation noticeably, while selected scopes are faster and may miss the module that matters.", "Compile-time instrumentation vs run-time sampling: compile-time is exact, but requires recompilation to change what is measured."],
    p: ["Optimization that merges or removes logic changes what the counters mean between instrumented and normal runs.", "Reports full of unreachable defaults train reviewers to ignore the report."],
    v: "Run a test that you know skips one branch and confirm the report lists exactly that line with zero hits, then add a test that takes it and see the count go up.",
    dep: ["syntax-tree", "native-code-generator", "coverage-database", "design-flattening"]
  },
  "coverage-database": {
    s: "A persistent file store holding the counts for every coverage item from each run, with the design structure needed to interpret them.",
    d: "Each run writes its hit counts, keyed by the stable identity of every item, along with test name, seed and design version. The format must be compact because a large regression produces thousands of files, and must support merge, query and exclusion of items. It also stores the structure so a report can map a bin back to a source line or plan entry. It is hard to keep identities stable when the design changes between runs, since then old data may not map onto new items.",
    k: ["One database per run vs shared database: per run avoids write contention and lock problems, but pushes all cost to the merge step.", "Items identified by name path vs by content hash: paths are readable, but break on renames, while hashes survive renames but are opaque."],
    p: ["Merging runs from different design versions silently misaligns items and reports bogus closure.", "Parallel jobs writing one shared file corrupt it."],
    v: "Write two runs, merge them and confirm each item's merged count equals the sum of the two, and that data from a changed design version is refused or flagged.",
    dep: ["file-and-io-services", "simulation-image"]
  },
  "coverage-merge-and-ranking": {
    s: "Combines results from thousands of runs into one view and ranks tests by how much unique coverage each adds, so redundant tests can be dropped.",
    d: "Merge sums hit counts per item and unions the sets of what was reached. Ranking is a set-cover problem: pick the smallest set of tests that reaches the same total, using a greedy selection ordered by unique contribution and cost in time. The output drives which tests run in the nightly regression. Difficulty: scale, since merging may touch hundreds of gigabytes, and exclusions and waivers that must be applied consistently.",
    k: ["Greedy ranking vs exact set cover: greedy is quick and near-optimal, while exact is infeasible at this scale.", "Weighting by run time vs counting tests: weighting finds cheap suites, but favors short tests that may be less realistic."],
    p: ["Dropping a test that uniquely hit a rare corner because its contribution was counted against a stale waiver list.", "Ranking from one seed overstates what a different seed would give."],
    v: "Take three runs with known, overlapping coverage, rank them and confirm the selected set reaches the same merged total as all three, and that removing a selected test reduces the total.",
    dep: ["coverage-database", "regression-runner"]
  },

  "value-change-recorder": {
    s: "The hook that notes every time a selected signal changes value, with its time, so a waveform can be reconstructed later.",
    d: "When a net or variable in the dump set updates, the recorder appends a record with simulation time, signal identity and new value. Only changes are stored, not every cycle, which keeps files manageable, but a busy design still produces billions of changes. The recorder sits on the hot path of the kernel, so it must be nearly free for signals not being dumped and cheap for those that are. It is hard because the value must be captured after settling, not at an intermediate delta, or the waveform shows glitches that never persisted.",
    k: ["Record every delta vs only at the end of each time step: every delta shows glitch ordering for debugging races, but multiplies the data, while end-of-step is compact and hides them.", "Hooks in the kernel vs recording from a separate callback process: kernel hooks are fast, but couple the dumper to the engine."],
    p: ["Dumping every signal in a full chip run produces a file larger than disk and slows simulation tenfold or more.", "Recording at the wrong region shows a value that no process saw."],
    v: "Dump a simple counter and confirm the file holds exactly one change per increment, at the correct times, and that a signal outside the dump set produces no records and no measurable slowdown.",
    dep: ["event-queues", "dump-control", "waveform-file-writer"]
  },
  "waveform-file-writer": {
    s: "Encodes recorded value changes into a file format, compressing and indexing them so that large traces can be written fast and read in pieces.",
    d: "An open text format lists value changes by time and is easy to produce but large. Binary database formats compress by storing only deltas, group signals into blocks, and add an index by time and by signal so a viewer can jump around. The writer buffers, usually on a separate thread, to avoid stalling the simulation. It is hard to balance write speed, file size and random-access speed, and to flush enough often that a crash or kill leaves a usable file.",
    k: ["Text format vs indexed binary format: text is universal and simple to produce, but huge and slow to open; binary is compact and fast to browse, but needs the vendor reader.", "Write on a separate thread vs inline: a thread hides disk latency, but may lose the last buffer if the process dies."],
    p: ["A killed simulation leaves a truncated file the viewer cannot open, losing the run that failed.", "Writing from an unbuffered path makes a long run I/O bound."],
    v: "Kill a running dump with a signal midway and confirm the viewer still opens everything up to the last flush; then compare file size of the same dump in both formats.",
    dep: ["value-change-recorder", "file-and-io-services", "worker-thread-pool"]
  },
  "dump-control": {
    s: "Controls which signals are recorded and when, by scope, depth, time window and condition, so only the relevant part of a huge design is traced.",
    d: "System tasks and tool commands select scopes and depths, set start and stop times, or toggle dumping on a condition such as an error. Selections apply to the elaborated hierarchy, so patterns must resolve against generated instance names. It can also dump only ports and not internals, or only signals that fan into a failing check. The hard part is that you rarely know in advance which signals will explain a bug, so teams re-run with more signals, which costs another full simulation.",
    k: ["Dump the whole design vs a chosen subset: whole gives complete visibility, but is expensive; a subset is fast, and needs a rerun when you guess wrong.", "Static dump scopes vs triggered dumping: triggers capture only around an event, but miss what led up to it unless a window is kept."],
    p: ["A dump window that starts after the real root cause makes the first run useless.", "Pattern selections that match nothing silently produce an empty file."],
    v: "Select one scope at depth two with a time window, run, and confirm the file has exactly those signals and no records outside the window; an empty match prints a warning.",
    dep: ["hierarchy-elaboration", "value-change-recorder", "system-task-library"]
  },
  "waveform-viewer": {
    s: "A graphical tool that displays signals as traces over time, with search, measurement, grouping and links back to source code.",
    d: "The viewer opens the waveform database and renders selected signals as digital traces, buses with values, and analog-style plots. It supports searching for a value or edge, measuring distances, grouping and radix changes, and following a signal to its source line. It reads only the portion of the file on screen, relying on the index. It is hard because traces are huge: zooming from nanoseconds to milliseconds must stay responsive, and user workflows rely on saved signal lists that must survive design changes.",
    k: ["Load all into memory vs page from an index: loading all is simple, but large files overflow memory, while paging scales and needs an index.", "Standalone viewer vs viewer integrated with the live simulator: standalone works on files anywhere, while integrated lets you stop and inspect state."],
    p: ["Saved signal lists referencing renamed signals show blank rows and a user concludes no activity.", "Different radix or sign interpretation hides a negative number as a large positive."],
    v: "Open a multi-gigabyte trace, jump to a known late event and zoom to a single edge, and confirm the displayed value and time match the writer's log and the view stays interactive.",
    dep: ["waveform-file-writer"]
  },
  "interactive-debugger": {
    s: "A source-level debugger for the design and testbench that shows the hierarchy, current values and the code being executed, and lets the user inspect state while paused.",
    d: "The debugger shows the instance tree, signal values at the current time, and the source of the running process. It connects to the simulator through a control interface and can navigate drivers and loads, and expand classes in the testbench to see object fields. It works for hardware code and for testbench code, which have different mental models: concurrent signals versus a call stack per thread. It is hard because optimization removes or merges signals, so debug builds trade away speed to keep full visibility.",
    k: ["Debug build with full visibility vs optimized build: debug builds show every signal, but run several times slower.", "Debugger as part of the simulator vs a separate process over an API: built in has direct access, but a separate tool can be replaced and can open saved runs."],
    p: ["Debugging an optimized build where a signal was merged makes a value seem missing.", "Inspecting an object from a freed handle returns stale or null data."],
    v: "Pause at a breakpoint in a testbench thread and in a design process; confirm both show correct source line, call or process context and current values that match the waveform at that time.",
    dep: ["simulation-image", "breakpoints-and-stepping", "driver-and-load-tracing"]
  },
  "breakpoints-and-stepping": {
    s: "Pause the simulation at a line, signal change, time or condition, and advance by statement, delta cycle or time step.",
    d: "A breakpoint stops the kernel at a source line, when a signal changes, at a given time, or when a condition holds. Stepping can mean one statement in one process, to the next delta cycle, or to the next time step. The kernel must be able to halt between any two events while keeping its queues consistent, which makes the scheduler loop interruptible. It is hard because processes execute concurrently in model time, so stepping in one does not freeze the others in the way a software debugger would.",
    k: ["Stop all processes vs stop one: all gives a coherent snapshot of time, but one-thread stepping makes the others appear frozen in a way hardware never is.", "Line breakpoints in compiled code vs only at scheduler points: line breakpoints are precise, but need debug information that slows compiled mode."],
    p: ["Stepping one process hides that the real bug is the order in which two processes ran within a delta.", "Conditional breakpoints evaluated on every statement slow the run to a crawl."],
    v: "Set a value-change breakpoint on a signal, run, and confirm the stop time is the same as the waveform change; then step one delta and see only the processes sensitive to that change execute.",
    dep: ["delta-cycle-loop", "process-scheduler", "interpreted-mode"]
  },
  "driver-and-load-tracing": {
    s: "Answers who drives a signal and what it feeds, by following connectivity backward and forward through the elaborated design.",
    d: "From any net, the tool lists its drivers (assignments, outputs of instances, gates) and its loads, and can follow them through hierarchy and across port boundaries. For a wrong value it traces backward until the driver that produced it is found. This uses the net and driver graph built at elaboration plus the current values, and often a time-aware view of which driver was active. It is hard because flattening and optimization change connectivity, so the tool must map back to what the user wrote.",
    k: ["Static connectivity vs value-aware tracing: static is fast and shows structure, but value-aware tracing shows which driver is responsible at this time.", "Trace in the optimized design vs in the original: the optimized is accurate for what ran, but the original is what the user recognizes."],
    p: ["Tracing through a tri-state bus shows all drivers when only one was active, wasting the search.", "A port renamed by optimization is untraceable to the user's original name."],
    v: "Force a wrong value on an internal net from one of three drivers, trace backward from a downstream port, and confirm the tool names that driver and source line and not the other two.",
    dep: ["net-and-driver-graph", "strength-resolution", "interactive-debugger"]
  },
  "checkpoint-and-restore": {
    s: "Saves the complete simulator state at a point in time and later restarts from it, skipping long setup or replaying only the interesting part.",
    d: "The simulator serializes design state, pending events, process states, testbench objects and random streams, and can reload them into a fresh run. Common uses: skip a long boot or reset sequence, branch many tests from one warm state, and restart near a failure. It is hard because the state includes things that are not plain data: suspended threads, open files, foreign-language memory and handles into external models, and all of these must be recreated consistently.",
    k: ["Full-state snapshot vs reconstruct by replaying inputs: snapshots restore fast, but need every component to be serializable, while replay needs only a log but takes as long as the original run.", "Restore to the same binary only vs across versions: same-binary is simple, but across versions needs a stable format."],
    p: ["State held in foreign code is not saved, so the restored run diverges quietly.", "Random seeds not restored mean the post-restore run is not the same test."],
    v: "Checkpoint at time T, run to the end, then restore at T and run again with the same inputs; confirm the waveforms and logs after T are byte-identical.",
    dep: ["event-queues", "random-number-streams", "object-oriented-testbench-runtime", "simulation-image"]
  },
});
