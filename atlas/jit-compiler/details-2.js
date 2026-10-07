// Details for the JIT compiler plate, part 2: speculation and deoptimization, optimizing IR.
ATLAS.details("jit-compiler", {
  "speculation-policy": {
    s: "The rules for which feedback the optimizer is willing to bet on, which assumptions it turns into guards, and which it refuses because failure would cost too much.",
    d: "For each operation the compiler reads its feedback and decides: specialize on the observed shape, emit integer arithmetic, inline the recorded callee, or stay generic. Inputs include how stable the feedback is, how often this function has already deoptimized, and how costly the guard and exit would be. Functions with a deoptimization history get more conservative settings. The difficulty is calibrating risk: a speculation that is nearly always right is worth far more than its guard, while one that is wrong once in a thousand times can be a net loss when exits are slow.",
    k: ["Speculating on any consistent feedback versus requiring evidence of stability: more optimization sooner, but more wasted compiles when programs change phase.", "A per-function speculation budget that shrinks after each deoptimization versus a global setting: converges on safe code for troublesome functions, but needs history stored with each function."],
    p: ["Speculating on a slot with very few observations gives a guard that fails the first time real data arrives.", "Ignoring deoptimization history makes the system recompile the same failing assumption forever."],
    v: "Feed a function a stable type, confirm the optimized code specializes on it, then flip the type repeatedly and confirm the next compiles are progressively more generic until deoptimization stops.",
    dep: ["type-feedback-vectors","guards","deopt-backoff"]
  },
  "guards": {
    s: "Cheap run-time checks inside optimized code that verify an assumption, such as an object's shape or a number's kind, and leave the code through a deoptimization exit if it is false.",
    d: "A guard is a compare and conditional branch to an exit stub, placed immediately before the first use of the assumed fact. After it, the optimizer treats the fact as true: later loads use a fixed offset, later arithmetic uses integers. Redundant guards are removed when dominated by an earlier one on the same value. The difficulty is placement: hoisting a guard out of a loop saves work but must keep the state recoverable, and removing one that was not truly redundant gives code that reads wrong memory.",
    k: ["Many small guards versus fewer, stronger guards: simple reasoning and local exits, but more instructions on the hot path until elimination merges them.", "Checking on every use versus once at definition: less work, but a later write can invalidate the check when it is not tracked as an effect."],
    p: ["A guard removed because an earlier one seemed to cover it, when a call in between could change the shape, gives silent memory corruption.", "Guards on values after an operation that can run arbitrary code are not valid unless re-established."],
    v: "Pass an object with an unexpected shape to optimized code that guards on shape and confirm it takes the exit, restarts correctly in a lower tier, and produces the right result.",
    dep: ["deopt-exits","frame-states","shape-system"]
  },
  "deopt-exits": {
    s: "The out-of-line code sequences that guards jump to when an assumption fails, which capture the live values and hand control to the deoptimizer.",
    d: "Each exit is a small stub, usually shared by reason and placed away from the hot path. It saves registers, records the exit's identifier and the reason, then calls the deoptimizer, which uses the frame state attached to that exit to rebuild the interpreter's frames. Exits are numerous: one per guard, and they are kept tiny so they do not bloat the code. The difficulty is volume and cost: thousands of exits per function add size and metadata, and the deoptimization itself is a slow path that must not run often.",
    k: ["One exit stub per guard versus a shared stub per reason: unique stubs make the failing site identifiable, but they add code size.", "Calling the deoptimizer directly from the stub versus a jump table: simple, but it adds a return address to the stack that the deoptimizer must account for."],
    p: ["A stub that fails to save a callee-saved register loses a live value during reconstruction.", "Deoptimizing from inside a loop body, repeatedly, because the exit never changes feedback."],
    v: "Trigger each deoptimization reason once with a targeted input and confirm the deopt log names the correct reason, bytecode offset and function, and execution resumes correctly.",
    dep: ["frame-states","frame-reconstruction","assembler"]
  },
  "frame-states": {
    s: "Metadata attached to every exit and call in optimized code that says which bytecode position it corresponds to and where every live interpreter value currently lives.",
    d: "A frame state lists, for each inlined function in the current call chain, the bytecode offset, the locations of each register, argument and accumulator, and the stack of expression temporaries. Locations may be a machine register, a spill slot, a constant, or a virtual object that was never allocated. It is attached to graph nodes that can exit, kept alive through optimization, and translated into compact tables by the backend. The difficulty is size and consistency: frame states keep values alive that would otherwise be dead, which raises register pressure.",
    k: ["Frame states on every side-effecting node versus only at guards and calls: precise recovery anywhere, but it keeps more values alive and costs more memory.", "Delta-encoded compact tables versus full records: much smaller metadata, but a slower decode on the deoptimization path."],
    p: ["A frame state that refers to an optimized-away value gives the interpreter garbage after an exit.", "Metadata growth on very large inlined functions can exceed the code size itself."],
    v: "Decode the frame state at a chosen exit from the code object and confirm every live bytecode register maps to a valid location or constant matching the values observed in a debugger.",
    dep: ["graph-ir","effect-control-edges"]
  },
  "frame-reconstruction": {
    s: "The deoptimizer's work of reading an optimized frame's values and building one or more interpreter frames from them, including frames for every inlined caller.",
    d: "Given the exit's frame state, the deoptimizer reads each described value from its machine register or stack slot, boxes untagged numbers back into runtime values, rematerializes any objects that escape analysis removed, and writes the results into freshly built interpreter frames. It then removes the optimized frame, installs the new ones and resumes the interpreter at the described bytecode. For an inlined chain, it builds one frame per level. The difficulty is that it runs at arbitrary points with the heap in any state, can allocate, and must not trigger a collection that sees half-built frames.",
    k: ["Building all frames eagerly versus lazily one at a time: simple and predictable, but it pays for outer frames that may never be needed.", "Translating from an interpreter-style description versus generating specialized code per exit: compact and easy to verify, but slower than code made for each case."],
    p: ["A collection triggered by an allocation in the middle of rebuilding sees an inconsistent frame and corrupts the heap.", "A wrong tag for an unboxed double reads it back as a pointer."],
    v: "Force a deoptimization from three levels of inlining and inspect the resulting stack: three interpreter frames with correct functions, offsets and values, and the program's result unchanged.",
    dep: ["frame-states","object-rematerialization","shared-frame-layout","safepoints"]
  },
  "object-rematerialization": {
    s: "Re-creating objects on deoptimization that escape analysis had eliminated, so the interpreter finds real objects with the field values the program had at that point.",
    d: "When scalar replacement removes an allocation, the frame state describes it as a virtual object: its type and the location of each field's value. On exit, the deoptimizer allocates the object and fills in the fields, and also handles references between virtual objects, including cycles. Identity must be consistent: two references to the same virtual object become references to one new object. The difficulty is that allocation during deoptimization can fail or trigger collection, and that objects materialized at an earlier exit must not be duplicated at a later one.",
    k: ["Describing virtual objects in frame states versus forcing allocation before any exit: removes allocation from the fast path, but makes metadata and the deoptimizer more complex.", "Materializing on demand at exit versus at every call: no cost on the hot path, but every call site needs a description."],
    p: ["Two references to one virtual object, rematerialized separately, break identity comparisons after the exit.", "An object whose field already changed since its last description gets rebuilt with stale values."],
    v: "Run a loop where escape analysis removes a short-lived object, force a deoptimization mid-iteration, and confirm the interpreter sees one object with the fields' current values and the right identity.",
    dep: ["escape-analysis","frame-states","frame-reconstruction"]
  },
  "lazy-deopt": {
    s: "Invalidating optimized code that is not currently failing a check, by marking it and deoptimizing each activation when control next returns to it.",
    d: "When a global assumption breaks, such as a prototype changing, the dependent code objects are marked invalid. Code not yet running is simply not entered again. Code already on a stack cannot be changed in place, so its return addresses are patched to a deoptimization trampoline, or every call returns through a check. When control returns to that frame, it is deoptimized at the call's frame state. The difficulty is that every call site in optimized code must have a recoverable state, and the call itself must not be assumed to have left things unchanged.",
    k: ["Lazy deoptimization at return versus eager check on every use: no cost in the fast path, but every call needs complete frame state.", "Patching return addresses versus a flag checked on return: fast and no extra cost for valid code, but it needs writable stack and careful synchronization."],
    p: ["A frame that is paused in a call and never returns holds stale code until its callee finishes.", "Missing a code object in the dependency list leaves it running with a broken assumption."],
    v: "Optimize a function that depends on a stable property, call into it, change the property from inside a callee, and confirm the caller deoptimizes on return and uses the new value.",
    dep: ["dependency-registry","frame-states","code-patching"]
  },
  "dependency-registry": {
    s: "A table that records, for each assumption a compile made about the global state, which code objects depend on it, so a change can find and invalidate exactly those.",
    d: "During compilation the compiler registers dependencies: this code assumes this shape is stable, that prototype chain is unchanged, this function is not redefined, this global holds a constant. Each dependency is a key in a registry mapping to a weak set of code objects. When the runtime mutates the keyed object, it looks up and invalidates the code. Registration must happen under the same consistency as the read, or a change between read and registration is missed. The difficulty is race-freedom and bounded memory with weak references.",
    k: ["Registering at compile time versus guarding inline: no hot-path cost, but invalidation machinery and lazy deoptimization are required.", "Fine-grained keys per property versus coarse per-object keys: fewer needless invalidations, but more entries to maintain and register."],
    p: ["A dependency registered after the compile read the value misses a change in between and runs stale code.", "A strong reference from the registry keeps dead code alive until the key dies."],
    v: "Compile code with a known dependency, mutate the depended-on object, and confirm the registry lists the code object as invalidated and the next call runs in a lower tier.",
    dep: ["lazy-deopt","shape-system","code-objects"]
  },
  "property-watchpoints": {
    s: "Cells or flags the runtime watches that record that a property or prototype link has stayed constant, letting compiled code skip checks as long as the watch is untouched.",
    d: "An object field is marked stable when it has only been written once or has kept one shape since creation. Compiled code that treats it as a constant depends on a watchpoint instead of re-reading it. Any write that breaks stability must trip the watchpoint, invalidating dependents through the registry. This turns checks on prototype chains, global variables and singleton configuration into zero cost. The difficulty is that every write path in the runtime, including generic and builtin ones, must cooperate or the fast path is unsound.",
    k: ["Watchpoints with invalidation versus guards at each use: zero steady-state cost, but every mutation path must check the watch.", "A watch per property versus one per object: precise and few false invalidations, but memory scales with property count."],
    p: ["A write path that forgets to trip the watch, such as one in a builtin, leaves compiled code using a stale constant.", "A watch on a frequently modified object trips constantly and keeps invalidating good code."],
    v: "Compile code that treats a global as constant, assign to the global once, and confirm the watchpoint trips, the dependent code is invalidated, and later reads see the new value.",
    dep: ["dependency-registry","shape-system"]
  },
  "deopt-backoff": {
    s: "Policy that stops a function from entering an endless cycle of optimize, deoptimize and recompile, by counting exits per function and making later compiles safer or delayed.",
    d: "Each deoptimization increments a counter on the function, and the reason is recorded. After a threshold, the function is recompiled with the failing speculation turned off, tiered up only after more feedback, or kept out of the top tier entirely. Waiting times grow exponentially with each cycle. Without this, a function whose data legitimately varies spends most of its time compiling. The difficulty is distinguishing a one-time phase change, where recompiling is the right answer, from a perpetually unstable function, where it is not.",
    k: ["Exponential backoff per function versus a global compile budget: reacts to individual problem functions, but needs extra state on each function.", "Disabling only the failing speculation versus a general downgrade: keeps other optimizations, but needs the compiler to remember specifics across compiles."],
    p: ["A counter that never resets locks out a function that was fixed by a later phase change.", "A reason categorized wrongly turns off an unrelated, useful speculation."],
    v: "Alternate a function between two types in a loop and confirm the number of recompiles stops growing after a few cycles, with the log showing the speculation turned off.",
    dep: ["deopt-exits","speculation-policy","compile-blacklist"]
  },
  "bytecode-graph-builder": {
    s: "The first optimizing phase: it reads bytecode and feedback and produces the initial graph, inserting guards and specialized operations for what feedback says each site does.",
    d: "It walks the bytecode in order, maintaining an abstract frame of values for each register, creating a node per operation and merging at joins to place phi nodes. For each feedback slot it picks a specialized node, such as a shape-checked load, or a generic one. It also builds frame states for exits and calls, and inlines callees by recursively building their graphs into the caller. The difficulty is that it does much of the optimizing work implicitly: its choices set the shape of everything later, and mistakes in modeling exceptions or loops are hard to see.",
    k: ["Specializing during graph building versus building a generic graph and specializing later: smaller graphs and less rework, but the builder grows large and entangled with profile policy.", "Building loops with phis up front versus patching afterwards: simple SSA, but needs a loop pre-scan of assigned variables."],
    p: ["Failing to place a phi for a variable assigned only in some branches gives the wrong value on one path.", "Exception edges modeled imprecisely make every call look like it can throw everywhere."],
    v: "Compile a small function with a loop and branch, dump the built graph, and compare each node to the bytecode and feedback: every bytecode maps to its expected node with the right guard.",
    dep: ["graph-ir","ssa-form","type-feedback-vectors","frame-states"]
  },
  "graph-ir": {
    s: "The optimizing compiler's central data structure: nodes for operations connected by edges for value, control and effect dependencies, with no fixed instruction order until scheduling.",
    d: "Each node has an operation, inputs and a type. Pure nodes float freely, constrained only by data dependencies. Nodes with side effects are ordered by chains of effect edges, and branches and merges by control edges. This lets passes reorder, share and remove work by rewriting edges. The graph is mutated in place by reducers, which replace a node with a simpler one. The difficulty is memory and discipline: graphs for large inlined functions reach millions of nodes, and any pass that ignores a kind of edge breaks semantics invisibly.",
    k: ["Floating pure nodes versus a fixed instruction order in blocks: more freedom for value numbering and code motion, but a scheduling pass is required and the output is harder to read.", "In-place node mutation versus building a fresh graph per phase: much faster and less memory, but stale pointers and use-list bugs are easy to cause."],
    p: ["A reducer that updates a node's inputs but not its users' use-lists corrupts later passes in rare ways.", "Unbounded node growth from inlining exhausts memory on a background thread."],
    v: "Run the verifier after every phase on a large input and confirm the graph stays well-formed: every input exists, every use-list matches its inputs and all effect chains are connected.",
    dep: ["ssa-form","effect-control-edges","type-lattice"]
  },
  "ssa-form": {
    s: "The property that every value in the graph is defined exactly once, with phi nodes at merges choosing between definitions, which makes data flow explicit and many analyses linear.",
    d: "With one definition per value, a use points directly at its producer, so constant propagation, value numbering and dead code elimination need no data flow solver. Phi nodes at control merges and loop heads pick the value from the incoming edge. SSA is deconstructed late, before register allocation, by turning each phi into moves on its predecessor edges. The difficulty is in the transitions: critical edges must be split before placing moves, and phi moves form parallel copies that can contain cycles, needing a swap.",
    k: ["Keeping SSA through register allocation versus deconstructing earlier: allocator sees exact live ranges, but must handle phi resolution inside the allocator.", "Minimal versus pruned SSA construction: fewer phis and smaller graphs with pruning, but liveness must be computed first."],
    p: ["Placing phi moves on a critical edge without splitting it executes the move on a path that does not need it.", "A cyclic parallel copy emitted as sequential moves overwrites a value before it is read."],
    v: "Check on each compiled test graph that every value has exactly one definition dominating its uses, and that phi input counts match their block's predecessor counts.",
    dep: ["graph-ir"]
  },
  "effect-control-edges": {
    s: "The extra graph edges that order operations with side effects, such as stores and calls, and tie operations to the branches that govern them.",
    d: "Control edges connect branches, merges, loops and exits so that code can only execute on its path. Effect edges form a chain through every operation that reads or writes memory or may throw, so two operations that could interact stay in order, while independent pure operations are free. Passes such as load-store elimination walk the effect chain to find the last write. The difficulty is precision: an effect chain that is too conservative blocks optimization, and one that is too lax allows a load to move past the store it depends on.",
    k: ["A single linear effect chain versus alias-class chains: simple and safe, but it prevents reordering loads from unrelated fields.", "Modeling exceptions as control edges versus as effects: precise handler flow, but graph size and pass complexity grow with every call."],
    p: ["A node that writes memory but is not placed on the effect chain can be moved or deleted by a reducer.", "Calls modeled as pure by mistake let the optimizer reorder them with stores."],
    v: "Compile code with a store followed by a load of the same field and confirm the graph keeps the effect order, and that swapping them in a test pass is caught by the verifier.",
    dep: ["graph-ir"]
  },
  "type-lattice": {
    s: "The set of types the compiler can assign to a graph value, ordered from most specific to most general, used to prove facts and remove checks.",
    d: "Types include exact numbers, integer ranges, any number, strings, objects of a known shape, and a top type for anything. A typing pass propagates them from constants and guards through operations. Where a guard has established that a value is a small integer, later nodes carry that type and need no check. At merges, types are joined to the least upper bound. Representation selection later maps types to machine formats. The difficulty is soundness: types derived from guards are valid only on the path the guard dominates.",
    k: ["Rich range-carrying types versus kind-only types: enables bounds-check and overflow elimination, but typing becomes expensive and fixpoints slower.", "Typing once up front versus retyping after each reducer: cheaper per pass, but types may go stale as the graph changes."],
    p: ["Carrying a guard's narrowed type to a node reachable on another path claims a fact that is not true there.", "A join that loses range information at a loop head blocks elimination of every check inside."],
    v: "Compile an addition guarded to small integers and confirm the dumped graph assigns an integer range type to the result, and that no further type check appears downstream.",
    dep: ["graph-ir","guards"]
  },
  "phase-pipeline": {
    s: "The ordered list of passes the compiler runs on the graph, with the invariants each one expects and promises, and the scheduling of repeated passes.",
    d: "A typical order: build graph, early inlining, typing, a reducer loop for simplification and value numbering, escape analysis, load elimination, representation selection, lowering, scheduling, instruction selection and register allocation. Reducer passes run repeatedly until no change occurs. Each phase has preconditions, such as being in SSA or having effect chains intact, and the verifier checks them between phases. The difficulty is order dependence: moving a pass changes results unpredictably, since each exposes work for the next, and total compile time is the sum of all of them.",
    k: ["A fixed pass order versus a dynamically chosen one: predictable results and easy debugging, but time is wasted on passes that find nothing.", "Combining many reducers into one fixpoint loop versus separate passes: reuses traversal and finds more cascades, but interactions between reducers are harder to reason about."],
    p: ["Adding a pass before the one that normalizes its input makes it miss patterns on some graphs only.", "A fixpoint loop that oscillates between two forms never terminates."],
    v: "Dump the graph size and compile time after each phase for a typical function and confirm every phase runs in the documented order with the verifier passing between them.",
    dep: ["graph-ir","ir-verifier","lowering-phases"]
  },
  "lowering-phases": {
    s: "Passes that replace high-level operations, such as a property load or a checked add, with progressively lower-level ones until each node maps to a few machine instructions.",
    d: "A shape-checked load becomes a shape comparison, a branch to an exit, and a raw memory load at a known offset. A checked integer add becomes an add with an overflow flag and a branch. Lowering happens after high-level optimizations have exploited the abstract form, because abstract nodes are easier to analyze. Some lowering is repeated, with cleanup between steps, so late-exposed redundancy can still be removed. The difficulty is deciding when: lower too early and optimization opportunities disappear; too late and instruction selection must understand too many nodes.",
    k: ["Several gradual lowering steps versus one big lowering: cleanup between steps finds more redundancy, but costs compile time and more intermediate node kinds.", "Lowering to target-neutral operations first versus directly to target operations: most work is portable, but the neutral level must be rich enough."],
    p: ["Lowering a node before guard elimination has run duplicates guards that could have been removed.", "A lowering that drops the frame state of the high-level node makes later exits unrecoverable."],
    v: "Compare the graph before and after lowering for a load-heavy function and confirm each high-level node is replaced by the documented low-level sequence, with frame states preserved.",
    dep: ["graph-ir","phase-pipeline","instruction-selection"]
  },
  "graph-scheduler": {
    s: "The pass that turns the floating graph into basic blocks with a fixed order by deciding where each pure node actually executes.",
    d: "Each floating node can go anywhere between its earliest legal block, after all its inputs, and its latest, before all its uses. The scheduler computes both and picks a block, usually the latest outside any loop the node need not be in, so computation moves to where it is needed and invariant work leaves loops. Nodes with effects and control are already pinned. It then orders nodes within each block. The difficulty is balancing register pressure against redundancy and avoiding moving work onto paths where it was not previously executed.",
    k: ["Scheduling late and out of loops versus early: less computation on cold paths, but values stay live longer, which can add register pressure.", "Global scheduling over the whole graph versus local list scheduling within blocks: finds more movement, but costs two dominator-tree walks."],
    p: ["Scheduling a load into a block after a store that aliases it reads the wrong value if effect edges were wrong.", "Moving an expensive pure node into a branch that rarely executes it is good; moving it into a hot loop is not."],
    v: "Schedule a function with a loop-invariant expression and confirm in the dumped blocks it executes once outside the loop, and no pure node sits in a block that does not dominate its uses.",
    dep: ["graph-ir","effect-control-edges"]
  },
  "ir-verifier": {
    s: "A checker that validates structural and semantic invariants of the graph between phases, so a bug in one pass is caught where it happens and not as wrong output later.",
    d: "It checks that every input edge refers to a live node, use-lists agree with inputs, control and effect chains are connected, phi arity matches predecessors, types are consistent with operations and every exiting node has a frame state. It is expensive, so it runs in debug builds, in fuzzing and on demand. Failures dump the offending node and its neighborhood. The difficulty is coverage: it can only check what its author thought of, and some invariants, such as precise liveness in frame states, are costly to confirm.",
    k: ["Running after every phase versus only at the end: pinpoints the pass that broke the graph, but multiplies compile time by a large factor.", "Verifying structure only versus also semantics such as type consistency: cheap and unambiguous, but it misses bugs that produce valid but wrong graphs."],
    p: ["A verifier enabled only in debug builds lets the production build ship a bug that debug builds would have caught.", "A check that is too loose passes graphs whose exits are unrecoverable."],
    v: "Inject a known corruption, such as a dangling input, into a graph under test and confirm the verifier reports the exact node and phase, and passes cleanly on the full regression corpus.",
    dep: ["graph-ir","ssa-form","frame-states"]
  }
});
