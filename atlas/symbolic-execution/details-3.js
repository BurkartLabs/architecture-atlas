// Details for the symbolic execution plate, part 3: instruction execution, state and memory, bug oracles.
ATLAS.details("symbolic-execution", {
  "instruction-interpreter": {
    s: "The loop that fetches the current instruction of a state, evaluates it over concrete and symbolic values, updates the state and moves to the next instruction.",
    d: "For each instruction the interpreter reads operands from registers or memory, builds the result and writes it back. If every operand is concrete it computes directly. If any is symbolic it constructs an expression through the expression builder. Control instructions go to branch handling, calls push frames, and special operations dispatch to the environment models or oracles. The interpreter is written for speed since it executes billions of steps, but most time is spent in the solver. Its difficulty is full coverage of the instruction set, including odd operations such as vector instructions.",
    k: ["Interpret IR directly versus translate to native code with hooks: an interpreter is simple and easy to inspect, while translated code runs concrete portions much faster at the cost of complexity.", "Execute one instruction per scheduling step versus a basic block: per instruction gives fine control, while per block cuts scheduling overhead."],
    p: ["An instruction the interpreter does not implement aborts the whole run, or worse is skipped, silently corrupting the state.", "Operand width mistakes, such as treating a 16-bit value as 32 bits, produce subtly wrong constraints."],
    v: "Execute a suite of instruction-level tests with concrete operands against expected results from real hardware or a reference interpreter, and confirm every opcode and width matches, then repeat with symbolic operands and compare after solving.",
    dep: ["execution-state", "expression-builder", "branch-forking", "front-end-ir"]
  },
  "expression-builder": {
    s: "Creates the symbolic expression nodes for operations on values, applying cheap rewrites and sharing identical nodes so expressions stay small.",
    d: "Every arithmetic, logical, comparison, extract, concatenate and memory read operation produces a node in a directed acyclic graph over bit-vectors and arrays. A factory function hash-conses nodes, so identical subexpressions share one node and comparison is a pointer check. Constant operands fold immediately, and simple identities such as x plus zero are rewritten during construction. Deep expressions are a problem: a long loop of updates can create a chain millions of nodes long, which slows the simplifier, the solver and anything that walks it.",
    k: ["Rewrite at construction versus in a separate pass: construction rewrites keep expressions small from the start, while a pass is easier to extend and test.", "Hash-consing versus tree allocation: hash-consing saves memory and speeds equality, at the cost of a global table that is hard to free and shared across threads."],
    p: ["The global node table grows without bound and keeps dead expressions alive.", "A recursive walk of a very deep expression overflows the native stack."],
    v: "Build the same expression twice and confirm one shared node, build a sum of two constants and confirm a constant, and walk a ten-million-node chain without stack overflow.",
    dep: ["bit-precise-arithmetic"]
  },
  "concrete-evaluation-shortcuts": {
    s: "Detects when an operation has all-concrete operands, or a symbolic one that a path condition pins to a single value, and computes it directly without building expressions.",
    d: "Most of a program's instructions touch no input at all, and keeping them concrete is what makes symbolic execution tractable. The engine checks operands before building an expression. More advanced shortcuts ask whether a symbolic value is forced to a single value by the current constraints and replace it by that constant, often called value propagation. Constant-folding reduces expression size and removes later queries. The check itself costs time, and a solver call to prove a value is fixed is only worth it for values used many times.",
    k: ["Check constants only versus also infer forced values: constants are free to detect, while forced-value inference needs queries but collapses large expressions.", "Eager concretization at every opportunity versus on demand: eager keeps expressions small but burns solver calls, on demand saves queries but allows growth."],
    p: ["A value is treated as concrete after a store that was symbolic, because a flag was not updated.", "Repeated solver calls to see whether values are fixed cost more than they save."],
    v: "Run a loop whose counter is concrete over a symbolic buffer, count expressions built, and confirm none are created for the counter arithmetic, while branches on the buffer still produce symbolic conditions.",
    dep: ["expression-builder", "path-condition-store", "solver-backend-interface"]
  },
  "branch-forking": {
    s: "At a conditional on a symbolic value, checks whether each outcome is feasible and, if both are, splits the state into two with the condition and its negation added.",
    d: "The engine first asks whether the condition is always true or always false under the path condition, using the cache and a solver. If one side is infeasible the state continues unchanged. If both are feasible, it clones the state, adds the condition to one clone and the negation to the other, and registers the new state with the scheduler. The two solver calls at each branch are the main cost of the whole engine. Optimizations reuse cached answers and avoid the second query when the first result proves the other.",
    k: ["Check feasibility at each branch versus fork eagerly and check later: checking prunes infeasible states early at the cost of a query per branch, while lazy forking is cheaper and builds many dead states.", "Clone the whole state versus copy-on-write sharing: cloning is simple, while sharing makes forks cheap but complicates writes."],
    p: ["Both sides are assumed feasible after a timeout, so the engine explores impossible paths and reports false bugs.", "Forking at every branch of a loop produces thousands of states before the first has finished."],
    v: "Execute a branch on x less than 10 with x symbolic, confirm two states with the opposing conditions, and a branch on x equaling x confirm only one state with no query for the false side.",
    dep: ["execution-state", "path-condition-store", "query-formulation", "copy-on-write-state"]
  },
  "symbolic-jump-targets": {
    s: "Handles indirect jumps, calls through pointers and switch dispatch whose target depends on a symbolic value, by enumerating feasible targets and forking on each.",
    d: "For an indirect call or jump, the engine asks the solver for the possible target addresses under the path condition, forks one state per valid target, and constrains each with an equality. If the number of possible targets is huge, because the pointer is unconstrained, it either limits enumeration, concretizes one, or reports the bug that a corrupted pointer can reach arbitrary code. Jump tables are common and bounded. In binaries this is also how the control flow graph is discovered, because targets are only known after solving.",
    k: ["Enumerate all targets versus sample a few: enumerating is complete but can mean thousands of forks, while sampling is cheap and misses behavior.", "Report an unconstrained target as a finding versus concretize: reporting flags control-flow hijack, while concretizing keeps exploring a case the bug would make meaningless."],
    p: ["A function pointer table is large and every call forks into hundreds of states.", "Targets are found by solving but land in the middle of an instruction in lifted code."],
    v: "Call through a function table indexed by a symbolic byte with eight valid entries and confirm eight forks each with the index constrained, and nine or more entries from an unconstrained pointer reported as a hijack finding.",
    dep: ["branch-forking", "control-flow-graph-recovery", "query-formulation"]
  },
  "bit-precise-arithmetic": {
    s: "Models integers as fixed-width bit-vectors with exact wraparound, signed and unsigned operations and shifts, matching how the real machine computes.",
    d: "Every integer expression carries a width, and operations follow the machine's rules: addition wraps modulo two to the width, signed and unsigned comparison differ, shifts by large counts have defined or undefined results, and extensions copy the sign bit or zeros. The solver reasons about these with bit-vector theory, which it converts to propositional formulas, so multiplications and divisions are costly. This precision is what finds overflow and truncation bugs. Differences between platforms, such as division by zero results or shift-count masking, must match the target.",
    k: ["Bit-vectors versus unbounded mathematical integers: bit-vectors are exact and find overflow bugs, but multiplication and division make queries much harder.", "Model undefined behavior as a bug versus as some chosen result: flagging it finds real defects, while a chosen result mimics one platform and hides portability problems."],
    p: ["A signed comparison is modeled as unsigned, making a negative index look huge.", "Multiplying two symbolic 64-bit values yields a query that never finishes."],
    v: "Check a table of operations at extreme values, such as maximum plus one and minus one divided by minus one, against the real machine, and confirm solved models from queries on the same operations produce those results when replayed.",
    dep: ["expression-builder"]
  },
  "floating-point-modeling": {
    s: "Represents floating-point values and operations so that rounding, special values and conversions are handled either exactly, approximately or by falling back to concrete values.",
    d: "Exact modeling encodes the IEEE format as bit-vectors with rounding modes, special values and subnormals. Solvers with a floating-point theory do this, and the queries are expensive. Cheaper options approximate with real arithmetic, which gives wrong answers at rounding boundaries, or concretize the operands and track nothing. Many targets use floating-point only for outputs, so concretizing is acceptable, but programs whose branches depend on floats are poorly served. Conversions between floats and integers and library math functions need their own models.",
    k: ["Exact floating-point theory versus real-number approximation: exact finds rounding bugs but queries are slow, while real approximation is quicker and gives false answers near boundaries.", "Concretize floats versus model them: concretizing is fastest and loses all float-dependent paths, whereas modeling keeps them at significant cost."],
    p: ["Real approximation says a sum equals a target, but the actual rounded result differs, so the generated input does not reproduce the path.", "Library functions such as sine are modeled as returning arbitrary values."],
    v: "Run a branch on a floating-point comparison near a rounding boundary and confirm the generated input, replayed on the real machine, takes the predicted side, with the model's fidelity setting recorded.",
    dep: ["bit-precise-arithmetic", "solver-backend-interface", "external-call-concretization"]
  },
  "calling-convention-handling": {
    s: "Maps function calls to the machine's argument passing, return values, stack frame layout and saved registers, so calls into modeled and real code agree.",
    d: "At IR level calls have typed arguments. At machine level, arguments sit in registers and on the stack according to the platform's convention, and callee-saved registers must be preserved. When the engine hooks a function, such as a library model, it must extract arguments from the right places for the platform and write the result where the caller expects it. Variadic functions, structure passing and unusual conventions add cases. It is hard because convention violations in the target, such as hand-written assembly, break the assumptions.",
    k: ["Model conventions per platform versus rely on IR: IR calls need no convention but only exist for source builds, while binary analysis needs full convention handling for each target.", "Check callee-saved registers on return versus trust: checking finds assembly bugs but adds cost, and trusting is cheaper."],
    p: ["A function with a structure argument passed in registers is modeled as taking a pointer.", "Variadic argument counts are guessed wrongly and a hooked function reads garbage."],
    v: "Call a hooked function with six integer and two floating-point arguments and a structure return, and confirm the model reads each value and the caller sees the right return, on every platform convention supported.",
    dep: ["register-file", "heap-and-stack-modeling", "binary-lifter"]
  },
  "exception-and-trap-handling": {
    s: "Models how the program raises and handles faults, signals, exceptions and exits, including unwinding frames and running handlers or cleanup code.",
    d: "Divisions by zero, invalid memory access and explicit throws transfer control. The engine must decide per fault whether it is a bug to report or a program-defined behavior to continue. Language-level exceptions need unwind tables to find handlers and run cleanups in order. Signals and abnormal exits also appear in models of the operating system. The problem is that error paths are rarely tested and are often where the bugs are, but modeling them takes careful work with tables and cleanup code.",
    k: ["Report the fault and stop versus emulate the handler and continue: stopping gives a clear finding, whereas emulating explores error handling paths where more bugs live.", "Parse unwind tables versus approximate: parsing is exact but format-specific, and approximating is simple and breaks on cleanup code."],
    p: ["A thrown exception is treated as a program exit, so the catch block is never explored.", "Cleanup code run during unwinding frees memory that the handler then uses."],
    v: "Run a function that throws through two frames with cleanup in each, and confirm the cleanups run in order, the catching handler executes, and a missing handler is reported as an uncaught exception.",
    dep: ["instruction-interpreter", "execution-state", "debug-info-mapping"]
  },
  "execution-state": {
    s: "The complete description of one path in flight: program counter, call stack, registers, memory, path condition and bookkeeping for the scheduler and oracles.",
    d: "A state is a record that can be cloned in constant time through sharing. Its parts are the current instruction pointer, a stack of frames with locals, the memory image, the path condition, a unique id, a parent pointer, counters for instructions and forks, and any per-oracle data. The scheduler holds thousands of them. Memory dominates, so representations that share unchanged parts between states determine how large an analysis can be. A state should be serializable for snapshots, distribution and replay.",
    k: ["Immutable shared structure versus mutable copies: shared structure makes forks nearly free but every write pays an indirection, whereas copies make writes direct and forks expensive.", "Store per-state metadata in the state versus in side tables: in the state it is cloned for free and always consistent, side tables keep states small and are easier to inspect."],
    p: ["A reference to a shared object is modified through one state and appears changed in a sibling.", "State size grows unnoticed because each oracle adds its own per-state tracking."],
    v: "Fork a state, write distinct values in each child, and confirm neither is visible to the other or the parent, and that state creation time stays constant as memory size grows.",
    dep: ["register-file", "flat-memory-model", "object-memory-model", "path-condition-store", "copy-on-write-state"]
  },
  "register-file": {
    s: "Holds the values of machine registers or IR virtual registers for a state, as concrete numbers or symbolic expressions, with partial register and flag handling at binary level.",
    d: "At IR level each virtual register is assigned once, so a frame's registers are a simple array of values. At machine level there are named registers of fixed width with aliased sub-registers, such as a low half of a wider register, and condition flags set by instructions. The file stores each as an expression and handles reads of part of a wider value by extraction. Flags are often computed lazily, only materialized when a branch reads them, to avoid building unneeded expressions. Vector registers add wide values.",
    k: ["Compute flags eagerly versus lazily: eager is simple and builds many unused expressions, while lazy keeps the operation and operands and builds the flag only on use.", "Store sub-registers separately versus as slices of a full register: slices avoid inconsistency but need extract and concatenate on each partial access."],
    p: ["Writing a half register without preserving the other half corrupts the full register.", "Lazy flags are not saved across a call, and a later branch reads the wrong flag."],
    v: "Write a symbolic value to a wide register, read its low byte, modify it, and read the whole register, and confirm the result equals the composed expression and that a flag-dependent branch matches the real machine.",
    dep: ["expression-builder", "bit-precise-arithmetic"]
  },
  "flat-memory-model": {
    s: "Treats memory as one large array of bytes indexed by address, which is simple and faithful to machine behavior but makes symbolic addresses expensive to reason about.",
    d: "Memory is a single symbolic array theory term: a store creates a new array from the old one, and a load selects from it. With concrete addresses, reads and writes resolve quickly to byte-level values. With symbolic addresses the solver must reason over the entire array. A flat model never confuses what an address means, so it handles type punning, overlapping accesses and low-level binary code naturally, but it has no notion of object boundaries, so bounds checks need extra information.",
    k: ["Flat array versus per-object arrays: flat is faithful and handles unions and casts, while per-object makes bounds explicit and queries much smaller.", "Sparse concrete map plus symbolic overlay versus pure array theory: the sparse form is fast for concrete addresses, but handling mixed access needs care."],
    p: ["A long chain of stores to a flat array makes each later load a deep expression the solver cannot simplify.", "A symbolic address matches anywhere in memory, so a load returns values from unrelated objects."],
    v: "Store a symbolic value at a concrete address, load it as bytes and as a word, and confirm results compose correctly, and a load at a symbolic address constrained to a range returns the matching element.",
    dep: ["symbolic-array-theory", "expression-builder"]
  },
  "object-memory-model": {
    s: "Divides memory into discrete objects, each with its own base, size and contents, so a pointer is an object plus offset and bounds can be checked directly.",
    d: "Every allocation, whether a stack variable, global or heap block, becomes an object with an identity and a byte array. A pointer resolves to an object, and accesses are checked against the object's size. A concrete pointer finds its object by address lookup. A symbolic pointer may refer to several objects, so the engine forks per candidate or builds a conditional. Small objects keep queries small, and out-of-bounds is a first-class condition. Casting between types and pointer arithmetic that crosses objects are the hard cases.",
    k: ["Object-based versus flat: object-based gives small queries and exact bounds, while flat handles pointer tricks and binaries more faithfully.", "Fork per candidate object versus a single combined query: forking keeps each query simple and multiplies states, a combined query keeps one state and is harder for the solver."],
    p: ["A pointer computed past one object into the next appears valid under the flat view, and is flagged under the object view.", "Resolving a pointer that could point to hundreds of objects forks hundreds of states."],
    v: "Allocate two adjacent objects, access one past the first's end, and confirm the object model reports an out-of-bounds finding, while a flat model of the same program silently reads the neighbor.",
    dep: ["symbolic-pointer-resolution", "symbolic-array-theory", "heap-and-stack-modeling"]
  },
  "copy-on-write-state": {
    s: "Shares memory and structure between a parent and its forked children until one writes, so that forking costs time and space proportional to what changes, not to the size of the state.",
    d: "States hold references to immutable or reference-counted chunks: pages, objects or tree nodes of a persistent map. A write to a shared chunk copies it, updates the copy and repoints only the writing state. Forking copies only the top-level pointers. This is what lets an engine hold hundreds of thousands of states whose memory is mostly identical. The difficulty is correctness around the sharing: counts must be right, mutable caches inside shared objects are hazardous, and the copy granularity trades copy cost against sharing.",
    k: ["Page-granular copy versus object-granular: pages are simple and fit a flat model, while object granularity copies less for small writes and fits the object model.", "Reference counting versus a garbage collected persistent structure: counting frees memory promptly and costs updates, while persistence is simple and delays reclamation."],
    p: ["An object shared by two states is mutated in place, and a sibling's data changes.", "Large objects written a byte at a time are copied wholesale at every fork, defeating the sharing."],
    v: "Fork a state with one hundred megabytes of memory a thousand times, write one byte in each child, and confirm total memory grows by far less than a hundred gigabytes and each child sees only its own write.",
    dep: ["execution-state", "object-memory-model"]
  },
  "symbolic-pointer-resolution": {
    s: "Decides which objects or addresses a pointer holding a symbolic value can refer to, then forks, enumerates or encodes the choice so the access can proceed.",
    d: "When a load or store address is symbolic, the engine asks the solver for objects whose address range the pointer can fall in. For each candidate it forks a state with the constraint that the pointer lies in that object, then performs the access. If the set is too large it may sample, limit the number of forks, or use a theory-based combined access. It also determines whether the pointer can fall outside every object, which is a bug. This is one of the largest sources of both precision and blow-up.",
    k: ["Fork per candidate object versus one query with a conditional value: forking keeps queries simple at the cost of states, and conditionals keep a single state and make queries hard.", "Resolve fully versus cap the number of candidates: full resolution is complete, while capping bounds work at the cost of missing accesses."],
    p: ["A pointer into a large table of equal-sized objects forks once per entry, and the budget goes to resolution.", "An imprecise resolution picks only the first candidate and misses accesses to the rest."],
    v: "Index an array of sixteen objects with a symbolic index, confirm sixteen resolved states with the correct constraints plus an out-of-bounds finding when the index is unconstrained.",
    dep: ["object-memory-model", "query-formulation", "branch-forking"]
  },
  "symbolic-array-theory": {
    s: "Represents memory contents as arrays with store and select operations, so reads and writes with symbolic indices can be reasoned about by the solver.",
    d: "The theory of arrays gives a term for the array after a write and for a read at an index, with rules saying a read after a write returns the written value at an equal index and the earlier value otherwise. The engine can pass whole arrays to the solver, or simplify first: reads of concrete indices from concrete writes are answered directly, and chains of writes are bounded. Large arrays with many symbolic writes are the problem, since each chain step adds a case for the solver to consider.",
    k: ["Use the solver's native array theory versus expand into one variable per element: the native theory scales to large arrays, while expansion is simpler and tractable only for small arrays.", "Keep write chains versus rebuild a flattened array periodically: chains are cheap to extend, while flattening resets cost of long histories and loses structure."],
    p: ["A buffer of a megabyte becomes a million variables when expanded for a single symbolic index.", "Long write chains make every read an expression of unbounded depth."],
    v: "Write three symbolic values to symbolic indices, read at a fourth symbolic index, and confirm models satisfy every combination of equal and unequal indices, checked by replay with concrete values.",
    dep: ["expression-builder", "solver-backend-interface"]
  },
  "lazy-initialization": {
    s: "Creates the structure behind a symbolic pointer or object only when the program first touches it, so large or recursive data structures do not need to be built in full.",
    d: "A symbolic pointer field is not forced to be null or to point to a fresh object at declaration. When the program dereferences it, the engine forks over cases: null, an alias to an existing object of compatible type, or a newly created symbolic object whose fields are also lazy. This explores linked structures of arbitrary shape without a size bound, driven by the code's own accesses. It is common for object-oriented programs and for testing functions that take data structures. Aliasing cases multiply the paths, and type information is required.",
    k: ["Lazy initialization versus building bounded concrete shapes up front: lazy explores only needed shapes, while eager enumerates small structures and may build many that code never visits.", "Allow aliases to existing objects versus always new objects: allowing aliasing finds shape-dependent bugs, and always new is simpler and misses cycles and sharing."],
    p: ["Recursive structures unfold indefinitely if no depth limit is applied.", "Generated shapes violate the data structure's invariants, reporting bugs on impossible inputs."],
    v: "Test a list-traversal function on a lazily initialized list, and confirm cases for null, one node, a node pointing to itself and longer lists up to the bound, each as a valid test input.",
    dep: ["symbolic-pointer-resolution", "object-memory-model", "preconditions-and-assumptions"]
  },
  "heap-and-stack-modeling": {
    s: "Implements allocation, deallocation, stack frames and global storage, deciding object addresses, tracking lifetimes and supporting detection of misuse after free or after return.",
    d: "Stack frames allocate objects on call and release them on return. The heap model handles allocate, reallocate and free, assigning addresses from a simulated allocator, either deterministically or constrained to be unique and non-overlapping. Freed objects are marked so later accesses are found. Choices about layout, such as whether a freed address is reused, change which bugs show up and whether the engine matches the real allocator. Zero-sized and aligned allocations, and failure to allocate, are paths worth exploring.",
    k: ["Simulate the real allocator's layout versus abstract unique addresses: simulating reproduces exploits and layout-sensitive bugs, while abstract addresses are simpler and layout-independent.", "Fork an allocation-failure path versus assume success: forking tests error handling, whereas assuming success avoids forks that most programs ignore."],
    p: ["Reusing addresses after free hides a use-after-free because the new object is valid.", "A symbolic allocation size makes the object's extent unknown."],
    v: "Allocate, free and access an object, and confirm a use-after-free is reported with the allocation and free sites, then run a double free and an access to a returned stack frame and confirm both findings.",
    dep: ["object-memory-model", "symbolic-allocation-sizes", "libc-models"]
  },
  "symbolic-allocation-sizes": {
    s: "Handles allocations whose size depends on input by bounding, enumerating or concretizing the size, since an object of unknown length cannot be laid out.",
    d: "A program that mallocs a length read from input creates an object of symbolic size. Memory models need a concrete extent to place the object. Options are to ask the solver for a maximum value consistent with the path condition and allocate that many bytes with a constraint that the logical size is at most that, to fork over several sizes, or to pick one. The choice affects bounds checks, since the logical size differs from the allocated extent. Overflowing size arithmetic, such as a multiplication wrapping, is itself a common bug to detect.",
    k: ["Allocate the maximum feasible with a logical-size constraint versus fork per size: a maximum keeps one state but needs size-aware bounds checks, and forking is precise and costly.", "Concretize the size versus keep it symbolic: concretizing is simple and loses size-dependent bugs."],
    p: ["The maximum feasible size is huge, so the engine tries to allocate gigabytes.", "A bounds check against the allocated extent instead of the logical size misses an overflow."],
    v: "Allocate with an input-controlled size multiplication that can wrap, and confirm a finding for the wrap and, for non-wrapping sizes, that an access one past the logical size is flagged even though the extent is larger.",
    dep: ["object-memory-model", "heap-and-stack-modeling", "arithmetic-checks"]
  },
  "path-condition-store": {
    s: "The conjunction of all branch conditions and assumptions along a state's path, kept as a shared persistent list that every query on that state is conjoined with.",
    d: "Each fork appends a constraint. The store is a persistent linked structure so children share the common prefix, and it can be indexed by the variables each constraint mentions, which feeds independence slicing. Operations include adding a constraint, asking for all constraints relevant to an expression, and asking whether a constraint is implied. The path condition grows with depth, and each new query on a deep state would be large without slicing. Memory and the cost of walking long conditions are the concerns.",
    k: ["Flat list versus indexed by variable: a flat list is simple to append to, while an index makes relevant-constraint lookup fast at the cost of maintenance.", "Store constraints as given versus simplified: as given is cheap and keeps redundancy, simplified yields smaller queries and costs rewriting on every add."],
    p: ["A deep path's condition has tens of thousands of constraints and each query serializes all of them.", "A constraint added in one state is shared into a sibling through an aliasing bug."],
    v: "Fork three levels deep, confirm each leaf's store holds exactly its path's constraints, shares the common prefix by reference with siblings, and returns the right subset for a query over one variable.",
    dep: ["expression-builder", "independence-slicing"]
  },
  "taint-tracking": {
    s: "Marks values derived from chosen sources, such as input bytes, and propagates the mark through computation, so sinks can check whether untrusted data reaches them.",
    d: "Each value carries a label or a set of labels. Operations combine the labels of operands, and loads and stores carry them through memory by shadow state. In a symbolic engine labels can be read off the expression itself, since it names the input variables it depends on, but concrete-mode and binary-level runs need explicit shadow data. It supports oracles for injection and leaks, and in concolic tools it decides which branches depend on input. Over-tainting, where everything becomes tainted, and under-tainting through missed flows, such as control dependencies, are the problems.",
    k: ["Taint through data flow only versus including control dependencies: data flow only is precise and misses implicit flows, while including control flow catches them and over-taints.", "Per-byte labels versus per-value labels: per-byte is precise for parsers, and per-value costs less memory and loses structure."],
    p: ["A label is dropped at an instruction the tracker does not model, silently breaking the chain from source to sink.", "Everything in a long run becomes tainted and the oracle reports on every sink."],
    v: "Read three input bytes, combine two into a value written to a sink, and confirm the sink reports those two source offsets and not the third, including across a memory copy.",
    dep: ["expression-builder", "execution-state", "symbolic-input-declaration"]
  },
  "memory-error-checks": {
    s: "At each load, store and free, asks whether an out-of-bounds access, null dereference, use-after-free or double free is feasible under the current path condition.",
    d: "Before an access the oracle builds the condition that the address lies outside every live object, or in a freed one, or is zero, and conjoins it to the path condition. If satisfiable, a finding is made with a model as witness. For the access to continue, the engine then adds the negation as a constraint, so the remaining path assumes the access was valid. This yields at most one report per access and prevents cascades. The cost is one query per memory operation, so queries on concrete in-bounds addresses are answered without the solver.",
    k: ["Check every access with the solver versus only symbolic ones: checking all is thorough but costly, and concrete accesses can be checked by direct comparison with no query.", "Assume the access valid afterward versus fork the failing side: assuming avoids cascades, while forking keeps exploring a corrupt state."],
    p: ["A one-byte overflow into padding is not an error under the object model but corrupts data in the real layout.", "Redzone sizes in the real allocator differ from the model so replays do not reproduce."],
    v: "Execute a loop writing one element past an array's end under a symbolic bound, and confirm exactly one finding at the store with a bound value triggering it, which crashes or is reported by a sanitizer when replayed.",
    dep: ["object-memory-model", "heap-and-stack-modeling", "model-extraction"]
  },
  "arithmetic-checks": {
    s: "Checks arithmetic operations for signed overflow, unsigned wraparound that matters, division by zero, invalid shifts and lossy conversions, by asking whether the violating values are feasible.",
    d: "For each relevant operation the oracle forms a condition, such as the operands' sum exceeding the signed range or a divisor equal to zero, and queries its satisfiability. Which operations count depends on the target's rules: signed overflow is undefined in some systems, while wraparound is intended in hash functions. The checks are configurable by operation and by site. Many findings are intended behavior, so the real challenge is precision: reporting only wraps that flow into a size, index or allocation.",
    k: ["Report every overflow versus only those reaching a sensitive use: reporting all is complete and noisy, and filtering by use cuts noise but needs data flow tracking.", "Check at the operation versus at the use of the result: at the operation finds it earliest, at the use is less noisy and shows the consequence."],
    p: ["Hash and checksum code that intentionally wraps floods the report.", "A division check is omitted for divisors that the compiler had proven nonzero, so engine and shipped code disagree."],
    v: "Run a function computing a size from two inputs with a multiplication that can wrap, and confirm the finding with concrete values producing the wrap, and no finding for an intentionally wrapping hash.",
    dep: ["bit-precise-arithmetic", "model-extraction", "taint-tracking"]
  },
  "assertion-checks": {
    s: "Treats explicit assertions and error-reporting calls in the program as properties, and reports a finding when the asserted condition can be false on a feasible path.",
    d: "An assert call becomes a branch on its condition: the failing side is feasible if the condition's negation is satisfiable under the path condition. If so, the oracle reports with a model. Calls to abort or a panic function are failures when reachable. Developers' assertions encode intent, so findings have a clear meaning and few false alarms. In verification mode the same checks, applied to the whole bounded space, show that no violating input exists within the bounds.",
    k: ["Treat failing assertion as a finding versus as a path to continue: reporting makes bugs visible, while continuing may explore code that assumes the assertion held.", "Assertions compiled out in release builds versus kept: kept ones are checked, and removing them for performance hides the properties from the engine."],
    p: ["Assertions removed by a release build leave nothing to check.", "An assertion with side effects changes the program's state when evaluated."],
    v: "Assert a property that holds for all inputs and one that fails for a single value, and confirm no finding for the first within the bounds and exactly one with that value for the second.",
    dep: ["branch-forking", "model-extraction", "preconditions-and-assumptions"]
  },
  "uninitialized-read-checks": {
    s: "Detects reads of memory that was never written, by tracking initialization per byte and reporting when a branch, address or output depends on an unwritten value.",
    d: "Fresh stack and heap objects are marked uninitialized, either as a shadow bit per byte or by filling with a special symbolic value. A read of such bytes is not an error by itself, since copying uninitialized padding is common. The finding arises when the value affects control flow, an address or output. Using a fresh symbolic value for uninitialized memory lets the solver show the dependence. Padding, partially initialized structures and library routines that fill buffers require models to avoid false alarms.",
    k: ["Track initialization per byte versus per object: per byte is exact for partially filled structures and uses more memory, while per object is cheap and coarse.", "Report at the read versus at the use: reporting at the read is noisy for copies, while reporting at use points to the consequential case."],
    p: ["A library function that initializes a buffer is not modeled, so every later read is flagged.", "Structure padding copied around is reported repeatedly."],
    v: "Branch on an uninitialized local and confirm a finding at the branch, copy uninitialized padding without branching and confirm none, and call a modeled function that fills a buffer and confirm none.",
    dep: ["heap-and-stack-modeling", "libc-models", "taint-tracking"]
  },
  "taint-sink-checks": {
    s: "Reports when data derived from untrusted input reaches a sensitive operation such as a command execution, format string, file path, query or privileged call without being checked.",
    d: "Sinks are listed with the arguments to inspect. When a call reaches one, the oracle checks the taint label or, symbolically, whether the argument's expression depends on input and can be made to hold a dangerous value. The strongest form asks the solver for an input making the argument equal an attack string. Sanitizer functions are modeled to clear or restrict taint. Precision depends on knowing which routines validate data, and without that, many reports are for already-checked values.",
    k: ["Report on any tainted flow versus on a solver-confirmed exploit value: any flow is cheap and noisy, while proving a dangerous value is reachable is precise and costs queries.", "Fixed sink list versus user-extensible: fixed is easy to adopt, and extensible adapts to project-specific dangerous calls."],
    p: ["A validating function is not recognized as a sanitizer and every use of it is flagged.", "Control-dependent flows are missed and the sink appears clean."],
    v: "Pass an input-derived string to a command-execution sink, confirm a finding with an input containing the metacharacter, and confirm no finding after a modeled sanitizer that rejects metacharacters.",
    dep: ["taint-tracking", "user-property-checks", "model-extraction"]
  },
  "race-and-deadlock-checks": {
    s: "Checks multithreaded executions for unsynchronized conflicting accesses and for cycles in lock acquisition, across the thread interleavings the engine explores.",
    d: "The engine records, per memory location, which thread accessed it and which locks were held. Two accesses from different threads, at least one a write, with no common lock or happens-before ordering, form a race. For deadlocks it builds a graph of lock acquisition order and reports cycles, or detects states where all threads wait. Interleavings explored depend on the scheduling model, so a race may only be exposed under a specific schedule. The finding's witness needs both the input and the schedule.",
    k: ["Happens-before based detection versus lockset: happens-before reports only real races and needs complete synchronization modeling, while lockset is simpler and reports false alarms.", "Explore interleavings exhaustively versus sample: exhaustive is complete and explodes, sampling scales and may never hit the race."],
    p: ["Synchronization through atomic operations or custom primitives is not modeled, so benign accesses are flagged.", "The finding has an input but no schedule, so it cannot be reproduced."],
    v: "Run two threads incrementing a shared counter with and without a lock, and confirm a race finding with a schedule for the first, nothing for the second, and a deadlock finding for two threads taking two locks in opposite order.",
    dep: ["thread-scheduling-model", "execution-state", "model-extraction"]
  },
  "user-property-checks": {
    s: "Lets users define their own violation conditions, such as protocol invariants or data structure rules, and checks them at specified points as extra oracles.",
    d: "A property is a predicate over program state, written in the harness, a specification language or a script hook, and evaluated at function exits, after each instruction in a range, or on events. If its negation is satisfiable under the path condition, a finding is reported with a model. Properties encode domain knowledge no generic oracle can, such as a balance never going negative or a parsed length matching the buffer. Writing them correctly is hard, and a wrong property yields false alarms or nothing.",
    k: ["Check at function boundaries versus after every instruction: boundaries are cheap and miss transient violations, while every instruction is thorough and slow.", "Properties as program code versus a separate specification language: program code is familiar to developers, while a specification language is checkable and easier to reuse."],
    p: ["A property is too weak and is always true, so the engine reports nothing.", "A property reads memory in a way that itself forks states and distorts the exploration."],
    v: "Write a property that a counter never exceeds its limit, run on a target with an off-by-one that exceeds it, and confirm a finding with the triggering input and none for the corrected version.",
    dep: ["scripting-api", "path-condition-store", "model-extraction"]
  },
  "crash-detection": {
    s: "Notices when the program terminates abnormally, through a fault, abort, signal or non-zero exit, and treats the path as a finding with its input.",
    d: "At a terminating event the engine records the exit kind and code and the state. Crashes from memory faults, aborts from failed internal checks, uncaught exceptions, timeouts and resource exhaustion are all categorized. Normal exits with an error code are usually not bugs unless the harness says so. Mapping the event to the instruction and stack makes reports useful. For targets run concretely in hybrid mode this is the same information a fuzzer uses, giving a consistent set of crashes across both tools.",
    k: ["Treat every non-zero exit as a finding versus only signals and aborts: all non-zero exits are complete and noisy, while signals and aborts match what developers call crashes.", "Count timeouts as findings versus as limits: counting finds hangs and denial-of-service bugs, and counting inflates results with slow but valid inputs."],
    p: ["Expected error exits, such as for malformed input, flood the report.", "A crash caused by the engine's own model, such as a missing syscall, is reported as a program bug."],
    v: "Run targets that abort, divide by zero, exit with an error code and return normally, and confirm the classification of each, with crashes carrying the faulting instruction and a reproducing input.",
    dep: ["exception-and-trap-handling", "bug-reports", "execution-state"]
  }
});
