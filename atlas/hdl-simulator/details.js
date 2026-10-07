// Details for the hardware description simulator plate, part 1: testbench and methodology.
ATLAS.details("hdl-simulator", {
  "testbench-top": {
    s: "The top-level module that instantiates the design under test, wires it to drivers and monitors, and starts the test. It is the root of the simulation hierarchy.",
    d: "The testbench top instantiates the design, connects its ports through interfaces that bundle related signals, generates clocks and reset, and launches the test program. It is itself an ordinary module, so the simulator elaborates it like the design. The difficulty is separating synthesizable design code from non-synthesizable test code and keeping races out of the boundary: if the test and the design both act on the same clock edge, who sees whose value depends on how the scheduler orders them.",
    k: ["Interfaces bundling signals vs loose port lists: bundles shrink wiring and let drivers be reused, but they hide which signals a component actually touches.", "Program blocks with their own scheduling region vs plain modules: programs avoid races with the design, but add a semantic layer many teams skip."],
    p: ["Driving inputs on the same edge the design samples them creates a race that passes on one simulator and fails on another.", "Test-only constructs leaking into the design hierarchy break synthesis later."],
    v: "Run the same test on two different simulators or with a changed process ordering option and confirm identical outputs and logs. Any difference points to a race at the boundary.",
    dep: ["hierarchy-elaboration", "clock-and-reset-generators", "stimulus-drivers", "monitors"]
  },
  "clock-and-reset-generators": {
    s: "Processes that produce clock edges and reset sequences with defined period, phase and duration, including jitter and multiple unrelated clock domains.",
    d: "A clock generator toggles a signal on a time step; a reset generator holds a signal asserted for a set number of cycles, then releases it, sometimes asynchronously relative to the clock. Multiple domains need independent periods that are not integer ratios, which exercises the time precision rules. The hard part is the edge where reset releases: release close to a clock edge can leave state unknown or metastable in a gate-level model, and the choice of when to release is a testbench decision with design consequences.",
    k: ["Behavioral clock with delay statements vs a clock driven from a scheduled table: delays are easy to read, but accumulated rounding drifts over long runs.", "Synchronous release of reset vs asynchronous release: asynchronous release tests the real hardware path, but is more likely to expose unknown values."],
    p: ["A clock period that is not a multiple of the time precision silently rounds, so two domains slip relative to each other.", "Releasing reset in the same time step as a clock edge makes the result depend on scheduler order."],
    v: "Dump the clocks and confirm each period and the gap between reset release and the next edge match the specification to the precision unit, over one million cycles with no drift.",
    dep: ["time-precision-units", "time-wheel", "process-coroutines"]
  },
  "stimulus-drivers": {
    s: "Testbench components that turn abstract transactions into pin-level signal activity, following a protocol's timing and handshakes.",
    d: "A driver pulls a transaction (an address and data, a packet) from a generator or sequence and wiggles the interface signals over several cycles in the order the protocol requires, waiting on ready signals and back-pressure. It runs as a process suspended on clock edges or events. It is hard because it must be cycle-accurate where the protocol demands, yet flexible enough to inject errors, delays and illegal sequences on purpose.",
    k: ["Cycle-accurate drivers vs transaction-level stubs: accurate drivers find protocol bugs, but are slow to write and to run.", "Driving at the clock edge vs after a small delay: delayed driving avoids races, but changes what the waveform looks like and what gate-level timing sees."],
    p: ["A driver that never injects back-pressure or errors only proves the design works in the easiest case.", "Hard-coded timing in the driver fails when the design's latency legitimately changes."],
    v: "Replay a recorded transaction list through the driver and compare the waveform against the protocol timing diagram, including a stalled-ready case and an injected error response.",
    dep: ["testbench-top", "process-scheduler", "sensitivity-lists"]
  },
  "bus-functional-models": {
    s: "Behavioral models of a standard bus or peripheral that speak its protocol at the signal level, so a test can act as a master or slave without building the real device.",
    d: "A bus functional model offers high-level operations such as read, write or burst, and translates them into correct signal sequences, with timing parameters and error injection. It also acts as a slave, answering requests with programmable latency. It is typically written by a protocol specialist and reused across projects. The difficulty is completeness: real protocols have optional features, ordering rules and corner cases, and a model that omits one hides bugs in the design that would use it.",
    k: ["Vendor-supplied model vs in-house model: purchased models are broadly validated, but opaque and tied to a license; in-house models can be tuned but share the author's misreading of the spec.", "Passive checking built in vs a separate monitor: built-in checks catch errors early, but cannot be reused on a model you did not write."],
    p: ["A model that never produces the protocol's legal-but-rare responses lets the design ship with a latent deadlock.", "A misread spec in the model and the design means both agree and both are wrong."],
    v: "Connect the model back-to-back as master and slave with no design in between and run its own protocol compliance suite, then confirm every optional feature has a covered case.",
    dep: ["stimulus-drivers", "monitors", "foreign-language-interface"]
  },
  "monitors": {
    s: "Passive observers that sample interface signals, rebuild transactions from them and broadcast those transactions to checkers and coverage collectors.",
    d: "A monitor never drives. It samples signals on the right clock edge, recognizes the start and end of a transaction, and builds a transaction object that it publishes to subscribers such as scoreboards and coverage. Because it only observes, the same monitor works whether the interface is driven by a test or by a real neighboring block. Hard parts: sampling at the correct instant to avoid races, recovering from protocol violations without losing sync, and keeping up with high transaction rates.",
    k: ["Sampling on the clock edge vs with a small preponed region: preponed sampling avoids races, but requires language support and consistent use.", "Monitor per interface vs one monitor for a whole subsystem: per interface is reusable, but cross-interface relationships need an extra layer."],
    p: ["A monitor that resynchronizes silently after a protocol error hides the very bug being tested.", "Sampling after the edge sees the new value in one simulator and the old in another."],
    v: "Inject a known illegal sequence and confirm the monitor reports the violation at the right cycle, then replay a good trace and confirm the rebuilt transactions equal what was driven.",
    dep: ["testbench-top", "transaction-ports", "active-region"]
  },
  "scoreboards": {
    s: "Checkers that compare what the design produced against what a reference model predicted, flagging mismatches as failures.",
    d: "A scoreboard receives expected transactions from a reference model and actual transactions from a monitor, and matches them, allowing for reordering, latency and dropped items. The difficulty is matching when outputs can legally appear out of order or later than predicted, and diagnosing a mismatch quickly: it should report both items, the time and the context. It also decides when a test ends, by checking the queues are empty.",
    k: ["In-order comparison vs keyed matching: in-order is simple and fast, but cannot handle designs that reorder, while keyed matching tolerates reordering at the cost of memory and lookup work.", "Checking every item vs sampling: full checks catch everything, but slow long runs."],
    p: ["Leftover expected items at end of test are ignored, so a design that silently drops data passes.", "A scoreboard written from the same misunderstanding as the reference model confirms the wrong behavior."],
    v: "Delete one output transaction and swap two others in a passing test and confirm the scoreboard reports the missing item and, for an in-order design, the reorder, with times attached.",
    dep: ["monitors", "reference-models", "transaction-ports"]
  },
  "reference-models": {
    s: "A separate, usually higher-level model of what the design should compute, used to generate expected results independently of the implementation.",
    d: "The reference model takes the same inputs as the design and computes expected outputs in software, often at the transaction or algorithm level. It may be written natively in the testbench language or called through a foreign interface into a software model that is also used by firmware teams. Independence is the point: if it shares code with the implementation it can share the bug. It is hard to keep timing-agnostic yet comparable, and to stay in step as the design evolves.",
    k: ["Native model in the testbench language vs imported software model: native is easy to debug in the simulator, while an imported one is shared with other teams but adds an interface and a data conversion step.", "Cycle-accurate prediction vs functional prediction: cycle accuracy catches latency bugs, but breaks whenever the micro-architecture changes."],
    p: ["Copying design logic into the reference makes shared mistakes invisible.", "A model that is never updated after a spec change fails every run and gets disabled."],
    v: "Feed the model and the design a directed set of inputs with hand-calculated answers and confirm both match the hand results, then show a seeded design bug causes a scoreboard mismatch.",
    dep: ["foreign-language-interface", "software-model-bridge", "scoreboards"]
  },
  "constrained-random-generator": {
    s: "Produces random stimulus that obeys declared rules about what is legal, so a test can explore many valid cases without writing each by hand.",
    d: "Fields of a transaction are declared random, and constraints state relations between them: ranges, ordering, distributions, implications. At generate time the tool asks the solver for a value assignment that satisfies all constraints, drawn from a seeded stream. Constraints can be turned on and off per test, and layered by subclass. It is hard because constraints interact: tightening one can make the set unsatisfiable, and a skewed distribution may never reach a corner case.",
    k: ["Constrained random vs directed tests: random finds unexpected interactions, but needs coverage to know what it reached; directed is predictable, but only finds what the author imagined.", "Per-object generation vs whole-sequence generation: per-object is simple, but cannot make a value depend on a later one."],
    p: ["Over-constraining makes randomization fail silently when the return value is not checked, so tests run with stale values.", "A default distribution that favors middle values never produces the boundary cases that fail."],
    v: "Generate ten thousand items with a fixed seed and confirm all satisfy constraints, the histogram of each field matches its declared distribution, and rerunning the seed gives the identical list.",
    dep: ["constraint-solver", "random-number-streams", "object-oriented-testbench-runtime"]
  },
  "constraint-solver": {
    s: "The engine that finds values satisfying a set of constraints, balancing speed, solution distribution and handling of ordering and conditional rules.",
    d: "Constraints are translated into a constraint network over bit vectors and solved with techniques from satisfiability and binary decision diagrams, plus heuristics for arithmetic and arrays. The standard also asks for a fair spread across solutions, not just any answer. It must support solve-before ordering, soft constraints, inline constraints and randomization from a given seed. It is hard because worst-case cost explodes with wide multiplications and large arrays, and because the distribution users expect is a language requirement, not an implementation detail.",
    k: ["Uniform sampling over solutions vs first-found solutions: uniform is what users assume and what coverage needs, but much costlier; first-found is fast and heavily skewed.", "Solving the whole object at once vs variable by variable: whole-object is complete, but can be exponential, while stepwise is fast but less fair."],
    p: ["Constraints with wide multipliers can take minutes on a seed and stall a regression with no message.", "Different tools return different but legal solutions for the same seed, which breaks cross-tool reproduction."],
    v: "Solve a battery of constraint sets with known solution counts and confirm each solution appears with roughly equal frequency, and a deliberately unsatisfiable set reports failure instead of hanging.",
    dep: ["random-number-streams", "four-state-values", "vector-storage"]
  },

  "object-oriented-testbench-runtime": {
    s: "Language runtime support for classes, inheritance, virtual methods, dynamic allocation and garbage collection inside a simulator that was built for static hardware.",
    d: "Hardware modules are static: created once during elaboration. Testbenches need objects created and freed at run time, with handles, queues, associative arrays, mailboxes and semaphores. The runtime allocates objects, dispatches virtual calls, collects unreferenced objects and ties them to process scheduling so a thread can block on a mailbox. The difficulty is memory: millions of short-lived transaction objects, and the need to find leaks in a language where users expect automatic cleanup.",
    k: ["Reference counting vs tracing collection: counting frees objects promptly but misses cycles, while tracing handles cycles but adds pauses.", "Shared event scheduler for objects and modules vs a separate one: shared keeps one notion of time, but couples testbench speed to kernel design."],
    p: ["Objects held by a forgotten queue grow memory until a multi-day regression is killed.", "Calling a method on a null handle gives a confusing runtime error far from the cause."],
    v: "Run a test that allocates and drops ten million transaction objects and confirm resident memory stays flat, then deliberately retain a reference and see it reported by the leak check.",
    dep: ["memory-allocator", "process-scheduler", "syntax-tree"]
  },
  "verification-class-library": {
    s: "A standard set of base classes for components, transactions, sequences and reports that testbenches extend, so pieces written by different teams plug together.",
    d: "The library defines base classes for components that form a hierarchy (environment, agent, driver, monitor), for transactions with copy, compare and print methods, and for messaging with severity and verbosity. It adds macros and utilities for field automation. It is built on the object-oriented runtime, not on special simulator code. Its value is convention; its cost is a large amount of code that every simulation compiles and every user must learn.",
    k: ["Heavy field automation macros vs hand-written copy and compare: macros save typing, but hide behavior and slow every simulation, while hand-written methods are verbose but fast.", "Strict component hierarchy vs free composition: hierarchy gives a predictable structure and phasing, but resists unusual topologies."],
    p: ["Compile time grows with the library, so a small test takes minutes to build.", "Version mismatches between the library and the simulator surface as obscure type errors."],
    v: "Compile a minimal environment with one agent against the library, run it, and confirm the printed hierarchy lists every component with its full path and the run ends with a summary of messages by severity.",
    dep: ["object-oriented-testbench-runtime", "factory-and-overrides", "phase-scheduler"]
  },
  "factory-and-overrides": {
    s: "A registry that creates components by type name and lets a test substitute a derived type for any or all instances without editing the environment.",
    d: "Components register their type with a factory. Instead of constructing a class directly, environment code asks the factory for it by type and instance path; the factory consults override tables set by the test and returns the replacement. This lets a test swap in a driver with error injection. The hard part is precedence: instance overrides, type overrides and wildcards can conflict, and the one that wins must be predictable and debuggable.",
    k: ["Factory creation vs direct construction: the factory enables substitution everywhere, but every class must be registered and every call must go through it.", "Instance-path overrides vs type overrides: paths are precise but break when the hierarchy is renamed, while type overrides are broad and risk touching more than intended."],
    p: ["A component built with a direct constructor call silently ignores the override the test set.", "A misspelled path in an override is accepted and does nothing."],
    v: "Set an override for one driver instance and print the factory's resolution table; confirm that instance, and only that instance, runs the derived class in the log.",
    dep: ["verification-class-library", "configuration-database"]
  },
  "configuration-database": {
    s: "A hierarchical store that lets a test set parameters, interface handles and switches that components read by path when they are built.",
    d: "Entries are keyed by a hierarchical scope pattern and a field name, written from the top of the testbench and read by components during construction. It carries things that cannot be passed through constructors: virtual interface handles linking class code to design signals, counts, and mode flags. Lookups use wildcard matching with precedence for the writer higher in the hierarchy. It is hard because ordering and scoping errors fail quietly: a missing entry may just return the default.",
    k: ["Central configuration store vs constructor arguments: the store decouples levels and supports late changes, but makes data flow invisible to a reader.", "Parent-wins precedence vs last-writer-wins: parent-wins gives top-level control, but surprises authors of lower components."],
    p: ["A typo in a field name leaves a component running with defaults and no warning.", "Setting an entry after the component has been built has no effect."],
    v: "Enable the tool's configuration trace, run, and confirm each get matches a prior set with the path and value in the log; then set a deliberately unmatched entry and see it flagged unused.",
    dep: ["verification-class-library", "object-oriented-testbench-runtime"]
  },
  "phase-scheduler": {
    s: "Runs the build, connect, run and check steps of every testbench component in a defined order across the hierarchy, and decides when the test is over.",
    d: "Components are created top-down in a build step, connected in a connect step, then every component's run step starts as a concurrent process. Cleanup and report steps follow bottom-up. Components raise and drop objections to keep the run step alive until they finish. The scheduler waits for all objections to clear, then ends the test. The difficulty is termination: an objection never dropped hangs the run; one dropped too early cuts off a test that was still working.",
    k: ["Objection-based end of test vs a fixed run time: objections end exactly when work is done, but require discipline from every component; fixed time is simple but wastes cycles or ends early.", "Parallel run phase vs sequential sub-phases: parallel is simple, but makes ordering between components hard to control."],
    p: ["A forgotten dropped objection makes a regression job hit its wall-clock limit instead of finishing.", "A timeout set too tight cuts off a legitimately long test and reports it as a hang."],
    v: "Run a test where one component holds an objection forever and confirm the global timeout fires with the holder's name in the message, then fix it and confirm a clean end with a summary.",
    dep: ["verification-class-library", "process-scheduler"]
  },
  "transaction-ports": {
    s: "Typed connections that pass transactions between testbench components, with blocking and non-blocking calls and broadcast to many subscribers.",
    d: "A component exposes ports and exports; the connect step links them, and a transaction sent from a producer reaches every subscriber, for example a scoreboard and a coverage collector. Blocking variants suspend the calling process, using the simulator's thread support, until a consumer accepts. Hard parts are type safety checked at connection time, and flow control: an unbounded queue hides a slow consumer until memory runs out.",
    k: ["Broadcast analysis ports vs point-to-point channels: broadcast decouples producers from consumers, but cannot apply back-pressure.", "Passing a handle vs passing a copy: handles are cheap, but a subscriber that modifies the object corrupts what others see."],
    p: ["A subscriber that mutates a shared transaction changes the value another checker is about to read.", "An unconnected port is only detected at run time, after hours of simulation."],
    v: "Connect one monitor to two subscribers, send a numbered stream, and confirm both receive every transaction in order, and that an intentionally unconnected port is reported at the end of the connect step.",
    dep: ["object-oriented-testbench-runtime", "process-coroutines"]
  },
  "register-model": {
    s: "An abstract model of the design's control and status registers that generates read and write sequences and tracks expected values, including fields and access types.",
    d: "The model describes registers, fields, reset values, address maps and access policies such as read-only or write-one-to-clear. It is typically generated from a machine-readable register specification, so the design, software headers and test model share one source. The model keeps a mirror of expected values and predicts the effect of reads and writes, flagging mismatches. It is hard because access side effects are numerous, and because back-door access through the hierarchy must stay consistent with front-door bus access.",
    k: ["Generated model from a spec vs hand-written: generated stays correct as registers change, but depends on the spec being complete; hand-written handles odd cases but drifts.", "Back-door access vs front-door: back-door is fast and skips the bus for setup, but never tests the bus path or access side effects."],
    p: ["Back-door writes bypass hardware side effects, leaving the mirror and the design out of sync.", "Reset values in the model differ from the design after a late spec change."],
    v: "Run the model's built-in test that writes and reads every register through the bus and compares reset values and access policies, and confirm each disagreement it finds is traced to a specific field.",
    dep: ["verification-class-library", "stimulus-drivers", "bus-functional-models"]
  },
  "virtual-sequences": {
    s: "Test scenarios that coordinate several sequences on several interfaces at once, so system-level behavior is written in one place.",
    d: "A sequence is a generator of transactions for one driver. A virtual sequence has no driver of its own; it starts sub-sequences on several agents, in parallel or in order, to create a scenario such as a DMA transfer while a processor interrupts. Layering lets a test pick a scenario while agents stay unchanged. Difficulty is synchronization: waiting for events across interfaces, and avoiding deadlocks when sequences compete for a shared resource or arbitration.",
    k: ["Layered virtual sequences vs flat tests that drive every interface: layering improves reuse, but adds indirection and a handle to every sequencer.", "Randomized scenario composition vs fixed scripts: random reaches more interleavings, but failures are harder to reproduce and simplify."],
    p: ["Sequences started with the wrong sequencer handle run but affect the wrong interface, and the test passes.", "A scenario that depends on timing instead of events breaks when latency changes."],
    v: "Run a scenario that overlaps two interfaces and confirm in the waveform that the overlap happens as intended; then rerun with the same seed and confirm the same interleaving.",
    dep: ["stimulus-drivers", "verification-class-library", "constrained-random-generator"]
  },
});
