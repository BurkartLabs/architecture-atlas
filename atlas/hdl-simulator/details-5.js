// Details for the hardware description simulator plate, part 5: cycle-based, compiled and the value system.
ATLAS.details("hdl-simulator", {
  "cycle-based-evaluator": {
    s: "Evaluates all logic once per clock cycle in a precomputed order, skipping the event queue and sub-cycle timing.",
    d: "Instead of reacting to each change, the evaluator computes every register's next value from current register values and inputs in one pass in dependency order, then updates all registers. There are no delta cycles and no per-event scheduling, so a cycle costs a fixed amount of straight-line work, often an order of magnitude less than event-driven. It requires a synchronous design with defined clocks, and ignores intra-cycle delays and glitches. Hard parts: asynchronous logic, latches and multiple clocks do not fit, and users must be sure the design obeys the restrictions.",
    k: ["Cycle-based vs event-driven: cycle-based is much faster for synchronous RTL, but cannot model delays, glitches or asynchronous behavior, which the event-driven kernel handles exactly.", "Whole-design cycle mode vs hybrid with an event-driven island: hybrid handles odd blocks, but needs a boundary with conversion cost."],
    p: ["A latch or asynchronous reset path in a cycle-mode design silently simulates differently from hardware.", "Tests relying on glitch behavior pass in one mode and fail in the other."],
    v: "Run the same synchronous design and test in cycle mode and in event-driven mode and confirm register values match on every clock edge for a million cycles; report the speed ratio.",
    dep: ["levelization", "clock-domain-handling", "two-state-optimization"]
  },
  "levelization": {
    s: "Sorts combinational logic into an order so each element is evaluated after its inputs, making one pass per cycle enough.",
    d: "The tool builds a graph of combinational dependencies, assigns each node a level equal to its longest path from a register output or input, and evaluates nodes level by level. Register boundaries and clock edges cut the graph. Nodes at a level are independent, which suits parallel or vector evaluation. It is hard because loops make a valid order impossible, because large designs have deep and uneven levels, and because order must be recomputed if forced signals or debug probes alter dependencies.",
    k: ["Static order computed once vs dynamic re-ordering: static is fast at run time, while dynamic adapts to changes and costs bookkeeping.", "Level-by-level vs topological list: levels expose parallelism and need extra storage, while a flat list is simple and sequential."],
    p: ["A false combinational loop through a mux that is never active blocks ordering of a valid design.", "Forcing a signal from the debugger invalidates the precomputed order."],
    v: "Levelize a netlist and verify, for every edge, that the driver's level is strictly lower than the load's; then confirm a design with a real loop is rejected with the loop path listed.",
    dep: ["net-and-driver-graph", "combinational-loop-detection", "design-flattening"]
  },
  "native-code-generator": {
    s: "Translates the elaborated design into machine code or C-like source compiled to a native library, so it runs without interpreting an internal representation.",
    d: "Each process and expression is lowered to an intermediate form, optimized (constant folding, common subexpression removal, inlining), then emitted as source for the host's compiler or as machine code directly. The result links with the runtime kernel. This removes interpretation overhead and enables optimization across modules. It is hard because compile time can dominate: a large design takes hours to build, and generated code is large. Debug information must map the generated code back to the original source lines.",
    k: ["Generate source for a system compiler vs emit machine code directly: using the compiler gets mature optimization for free, but depends on a toolchain and is slower to build, while direct emission is fast to build and costs effort.", "Optimize aggressively vs keep structure for debug: aggressive is faster to run, and removes the signals users want to look at."],
    p: ["Build time grows faster than design size when whole-design optimization is on.", "Generated code with different floating-point or integer width semantics than the language gives silently different results."],
    v: "Compile a design, run it against the interpreted mode on a fixed test, and confirm outputs and waveforms are identical; record build time and cycles per second for both.",
    dep: ["simulation-image", "constant-evaluator", "interpreted-mode"]
  },
  "interpreted-mode": {
    s: "Executes the design directly from its internal representation, with no code generation step, so a run starts immediately and debugging has full visibility.",
    d: "A virtual machine walks the compiled process representation and evaluates it. There is no separate native compile, so startup is fast, and every signal and line is available to the debugger. Per-cycle speed is lower, often several times lower than compiled mode. Many tools offer both and let users choose per module. The difficulty is keeping the two modes semantically identical: any divergence between them makes bugs that appear in one mode only.",
    k: ["Interpretation vs compilation: interpretation starts fast and debugs easily, while compilation runs faster and costs build time.", "Hot-spot compilation of busy processes vs choosing one mode up front: mixed mode gets both speed and flexibility, and adds complexity."],
    p: ["A bug present only in compiled mode is hard to debug because the debug build is interpreted.", "Mixed modules at an interface add conversion cost that cancels the speedup."],
    v: "Run a regression subset in both modes and compare logs and waveforms byte for byte; any difference is a defect in one of the two code paths.",
    dep: ["simulation-image", "process-scheduler"]
  },
  "two-state-optimization": {
    s: "Treats signals as plain zero and one where unknown values cannot occur, so each signal fits in one bit and operations become native word operations.",
    d: "Four-state values need two bits each and special handling in every operator. If analysis or user declaration shows a signal can never be unknown, the compiler stores it as two-state and uses direct machine instructions. Whole designs can be simulated in two-state mode after reset. The saving is memory and speed, often two to four times. It is hard because initial values, tri-state buses and out-of-range indexes introduce unknowns, so a two-state run hides bugs that four-state would flag.",
    k: ["Four-state everywhere vs two-state where proved safe: four-state finds uninitialized state, while proven two-state saves time and memory.", "Randomly initializing two-state variables vs initializing to zero: random initialization exposes missing resets, and zero hides them."],
    p: ["Running two-state from time zero hides missing resets because every register begins as zero.", "An out-of-range array read returns an unknown in four-state, and zero in two-state."],
    v: "Simulate the same design with a missing reset in four-state and two-state modes and confirm four-state shows unknowns on the affected outputs while two-state does not; confirm two-state gives identical results otherwise.",
    dep: ["four-state-values", "vector-storage", "native-code-generator"]
  },
  "clock-domain-handling": {
    s: "How cycle-based and compiled simulators deal with several clocks that are unrelated or have different frequencies and phases.",
    d: "Each domain is evaluated at its own edges. For related clocks, the scheduler computes the least common time grid and evaluates edges in order; for unrelated clocks, it falls back to an event-driven treatment at crossings. Signals crossing domains need ordering rules for edges at the same time. It is hard because simultaneous edges in different domains must give a defined result, and because real metastability cannot be modeled by zero-delay logic, so tools offer models that inject delays or random values.",
    k: ["Global least-common time grid vs per-domain event handling: a grid is simple and fast for related clocks, but blows up with unrelated periods, while per-domain handling is general and slower.", "Zero-delay crossing vs modeled synchronizer behavior: zero-delay is deterministic and optimistic, while modeled behavior finds real crossing bugs and varies run to run."],
    p: ["Simulating clock crossing with zero delay shows correct data that silicon would lose.", "Two clocks edges in the same time step are evaluated in different orders in two modes."],
    v: "Run two domains with a known skew and a crossing path, and confirm values captured at each edge match a hand-derived timeline, including a simultaneous-edge case with a documented order.",
    dep: ["cycle-based-evaluator", "clock-and-reset-generators", "time-wheel"]
  },
  "bit-parallel-evaluation": {
    s: "Packs many independent bits, such as many test patterns or many gate inputs, into machine words so one instruction evaluates them all.",
    d: "Gate-level and fault simulation can evaluate sixty-four patterns at once by storing one bit of each pattern in a word and applying bitwise operators. With vector units, hundreds of patterns run per instruction. The same technique evaluates wide vectors natively. It is hard because it only helps when work is regular and independent: control-heavy behavioral code cannot be packed, and four-state needs two words per signal and costs more operations.",
    k: ["Pattern-parallel packing vs one pattern at a time: parallel is much faster for regression-like data, but needs independent runs of the same netlist.", "Two bits per signal for four-state vs two-state packing: four-state is complete, while two-state halves the work."],
    p: ["Packing runs that share state, such as memories, gives wrong results unless the state is replicated.", "Divergent control flow among packed patterns forces fallback to serial execution."],
    v: "Evaluate a netlist for 64 random input patterns in one pass and separately one by one; confirm every output bit equals the serial result, and report the speedup.",
    dep: ["levelization", "vector-storage", "native-code-generator"]
  },
  "combinational-loop-detection": {
    s: "Finds paths in the netlist where a signal feeds back into itself through combinational logic only, which cycle-based ordering cannot handle.",
    d: "A strongly-connected-component search over the combinational dependency graph finds loops. Some are real oscillators or latches built from gates; others are false loops that cannot sustain because of an unreachable mux path. The tool reports them with a path, breaks them by inserting an artificial delay or a latch model, or refuses to proceed. It is hard to tell false from true loops without reasoning about values, and to break one without changing behavior.",
    k: ["Fail on any loop vs break and warn: failing is safe and blocks legitimate designs, while breaking runs but can alter behavior.", "Structural detection vs value-aware detection: structural is fast and conservative, and value-aware avoids false loops at a high analysis cost."],
    p: ["A loop broken at an arbitrary point changes which glitches occur.", "A latch built from gates is reported as an error when it was intended."],
    v: "Feed in a netlist with one real loop and one false loop through a mux, and confirm the real loop is reported with its full path and the false loop is flagged separately as a potential one.",
    dep: ["net-and-driver-graph", "levelization"]
  },
  "gate-level-acceleration": {
    s: "Specialized techniques for simulating large synthesized netlists, whose very high event counts make general-purpose scheduling too slow.",
    d: "Gate-level designs have millions of small cells, each with timing. Techniques include collapsing cells into larger compiled functions, running in two-state for the bulk of a test, skipping delay processing in the zero-delay phase, and parallel partitioning. Timing checks per flip-flop (setup and hold) add cost at each clock edge. It is hard because these runs are essential for signoff and also the slowest: they are often limited to a few thousand cycles of the most critical tests.",
    k: ["Full-timing runs vs zero-delay netlist runs: full timing finds timing-dependent bugs, but costs orders of magnitude more, while zero-delay checks function cheaply.", "Collapse cells into larger functions vs keep cells separate: collapsing is fast, but removes the nets users look at."],
    p: ["Initialization of flip-flops with unknown values at start leaves a gate-level run full of unknowns that the register-level run never saw.", "Timing checks in a long run write enormous violation reports."],
    v: "Run the same short test on the register-level and gate-level versions and confirm outputs match after reset; then check that a deliberately injected setup violation is reported at the flip-flop and time.",
    dep: ["primitive-and-path-delays", "native-code-generator", "parallel-partitioner", "delay-annotation"]
  },

  "four-state-values": {
    s: "Each bit is zero, one, unknown or high impedance, which lets the simulator model uninitialized storage and undriven or shared wires.",
    d: "Each bit takes one of four values. Operators have defined truth tables: an unknown input gives an unknown output unless the other input decides the result, as zero in an AND. Values are stored as two bits per signal (value and control) or as separate planes of data, so bitwise operations remain word-wide. Comparisons and conditions with unknown inputs need explicit rules. It is hard because the tables must be implemented exactly, and every operator, from multiplication to shifts, needs a defined treatment of unknown bits.",
    k: ["Two planes of bits vs a byte per bit: planes use less memory and operate word-wide, while a byte per bit is simple and wasteful.", "Strict operator tables vs approximations: strict matches the standard, and approximations run faster and diverge on edge cases."],
    p: ["An if on an unknown condition takes the else branch and hides an uninitialized signal.", "A compare that returns unknown is used as a true value in a testbench and the check passes."],
    v: "Evaluate each operator on every combination of zero, one, unknown and high-impedance inputs for small widths and compare with the standard's truth tables; all entries must match.",
    dep: ["vector-storage", "unknown-propagation-rules"]
  },
  "strength-resolution": {
    s: "Combines values from several drivers on one net, taking into account driver strength, to produce the net's value.",
    d: "Real wires may have several drivers: a bus with tri-state buffers, pull-up resistors, wired logic. Each driver supplies a value with a strength from strong to weak, plus high impedance. The resolution function picks the strongest, and equal-strength conflicts produce an unknown. Evaluation happens whenever any driver changes. It is hard because net resolution is on the hot path for every shared bus, and because multi-level hierarchies split nets into pieces connected through ports that must be merged correctly.",
    k: ["Full strength resolution everywhere vs only on multi-driver nets: full is general, but costly, while selective evaluation skips single-driver nets, which are the vast majority.", "Resolving incrementally on driver change vs recomputing all drivers: incremental is faster for wide buses and needs per-driver state."],
    p: ["A net with two active strong drivers resolves to unknown, and the cause is far from where it is seen.", "Merged nets across a hierarchy boundary lose a driver and show the wrong value."],
    v: "Connect two drivers of different strengths and equal strengths with opposite values to a net and confirm resolved results follow the strength table, including pull-ups and high-impedance.",
    dep: ["four-state-values", "net-and-driver-graph"]
  },
  "user-resolution-functions": {
    s: "Resolution rules defined by the user for a signal type, so several drivers combine under a custom function such as a priority or wired-or.",
    d: "In some languages, a signal type has a resolution function written by the designer. The kernel collects the current values of all drivers into an array and calls the function whenever one changes. The function may implement standard multi-valued logic or domain-specific rules, and in real-number modeling it can sum currents or select maximum. The cost is a call per change with the full driver list. It is hard to keep it fast and to ensure the function is commutative, or results depend on driver order.",
    k: ["User-defined functions vs built-in resolution: user-defined supports any domain, but runs slower and can be non-commutative, while built-in is fast and fixed.", "Resolve on every driver change vs batch per delta: every change is exact, and batching reduces calls."],
    p: ["A resolution function that depends on driver order gives results that vary between tools.", "A function with side effects is called a different number of times in each mode."],
    v: "Define a function resolving to the maximum of the drivers, apply drivers in several orders and confirm the same result every time and that the function is called at most once per delta.",
    dep: ["strength-resolution", "dynamic-types", "real-and-time-types"]
  },
  "vector-storage": {
    s: "How multi-bit signals are laid out in memory: words, packed bits, offsets and masks, with fast access to slices and single bits.",
    d: "Vectors are stored in arrays of machine words, with two planes for four-state. Slices and bit-selects are implemented with shifts and masks, and widths that do not fill a word need masking after operations. Very wide vectors use multi-word arithmetic. Storage layout decides cache behavior: dense layouts for big arrays, aligned layouts for narrow signals. It is hard to get all operations right at arbitrary widths, and to make small vectors, which dominate, as cheap as native integers.",
    k: ["Specialized storage for small widths vs one general representation: specialized is fast for the common one-to-sixty-four bit case, but doubles code paths.", "Memory-compact vs access-fast layout: compact reduces footprint for large memories, while fast layout speeds the hot signals."],
    p: ["Unmasked high bits after an operation leak into later comparisons.", "Off-by-one on widths that are exact multiples of the word size."],
    v: "Test every operator at widths one, two, thirty-one through sixty-five and seven hundred with random values against a big-integer reference, including slices that cross word boundaries.",
    dep: ["memory-allocator", "four-state-values"]
  },
  "packed-and-unpacked-types": {
    s: "The distinction between packed types, stored as one contiguous bit vector, and unpacked types, stored as separate elements, plus structures, unions, enumerations and arrays built from them.",
    d: "Packed structures and arrays behave like a single vector, so bit-selects and whole-value operations work. Unpacked arrays and structures are collections of separately addressable elements, up to multi-dimensional and associative forms. Enumerations carry names and checks for values. Union types overlay members. The compiler must lay each out, generate access code, and enforce assignment compatibility. It is hard because the rules for mixing packed and unpacked, for passing through ports, and for four-state members are long and subtle.",
    k: ["Flatten packed aggregates into one vector vs keep fields separate: flattening gives fast whole-value operations, while separate fields give quick access to one field.", "Sparse storage for large arrays vs dense: sparse saves memory for mostly-unused memories and slows every access."],
    p: ["Assigning between a packed and an unpacked type with different bit ordering reverses fields.", "A large dense array of a memory model uses gigabytes for data never touched."],
    v: "Define a packed struct with nested fields, write each field and read the whole as a vector, and confirm bit positions match the declared order; repeat with a union overlay.",
    dep: ["vector-storage", "type-checker", "memory-allocator"]
  },
  "unknown-propagation-rules": {
    s: "The rules for how unknown values flow through expressions, conditions and assignments, which decide whether uninitialized state is visible or masked.",
    d: "Operators produce unknown when inputs are unknown unless another input fixes the result. Control constructs have defined behavior: an if with an unknown condition takes the else branch, a case compares exactly, a conditional operator merges the two arms bitwise. Gate-level models behave differently from register-level ones for the same hardware. It is hard because the rules are inconsistent in places, reflecting history, and both optimism and pessimism cause problems.",
    k: ["Language-exact propagation vs extra tool options that make unknowns visible: exact is portable, while extra options help find bugs and change results.", "Propagate unknown through arithmetic as all bits vs per bit: all bits is simple and pessimistic, per bit is more precise and costly."],
    p: ["Unknown on a case selector takes the default and hides the problem.", "Register-level code passes while the gate-level netlist shows unknowns, and the two disagree on which is right."],
    v: "For a list of expressions with unknown inputs, compare results against hand-derived values from the standard, and run the design with randomized initial state to confirm reset clears every observed unknown.",
    dep: ["four-state-values", "active-region"]
  },
  "dynamic-types": {
    s: "Run-time-sized data such as strings, dynamic arrays, queues, associative arrays and class handles, used mostly by testbenches.",
    d: "Strings, queues and arrays resize at run time, and associative arrays index by any key. The runtime allocates and frees their storage, tracks lengths, and provides methods for insertion, deletion, search and sort. They are not synthesizable, and live only in the verification side. It is hard because they must interoperate with hardware vectors, because associative arrays with wide keys need an efficient map, and because lifetime errors, such as dangling references after resize, are easy to make.",
    k: ["Value semantics with copies vs reference semantics: copies are safe, but expensive for big arrays, while references are cheap and share mutation.", "Hash map vs ordered tree for associative arrays: hash is faster per access, and ordered trees give required traversal order for first and next."],
    p: ["Assignment of a large queue copies it entirely and quietly slows the test.", "Reading a missing associative array key returns a default and masks an error."],
    v: "Insert one million random keys into an associative array and iterate in key order, confirming ordering, count and lookups against a reference map, and memory per entry within budget.",
    dep: ["memory-allocator", "object-oriented-testbench-runtime"]
  },
  "real-and-time-types": {
    s: "Floating-point and time-valued data in the design, used for behavioral models, analog abstractions and delay computation.",
    d: "Real variables use double precision with the language's conversion rules to and from integers and bit vectors. Time values count in the module's time unit and are rounded to the global precision. Real-valued nets allow analog behavior in the digital kernel, with resolution by sum or other rule. It is hard because rounding of time can reorder events, because real numbers have no unknown value, and because results of floating-point operations may differ across hosts and compilers.",
    k: ["Native floating-point on the host vs software floating-point: native is fast and varies a little between hosts, while software is reproducible and slower.", "Round time at declaration vs at scheduling: early rounding is predictable, and late rounding preserves precision for longer expressions."],
    p: ["Accumulating a real-valued time step drifts from the true multiple.", "Converting a negative real to an unsigned vector gives a surprising value."],
    v: "Schedule events at a series of fractional delays in modules with different time units and confirm the global times equal the correctly rounded values, and that two hosts print the same real results.",
    dep: ["time-precision-units", "vector-storage"]
  },
});
