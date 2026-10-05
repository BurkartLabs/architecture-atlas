// Compiler plate details, part 3: intermediate representation, analyses, optimization passes.
ATLAS.details("compiler", {
  "high-level-ir": {
    s: "A tree-like or structured IR that keeps language-level constructs (loops, closures, pattern matches, types with full detail) after checking, before flattening to a control-flow graph.",
    d: "It sits between the checked syntax tree and low-level IR. Control flow is still structured, every expression has a resolved type, and generics and closures are explicit. Language-specific analyses and rewrites run here because the information they need, such as ownership, aliasing guarantees from the type system or iterator structure, has not yet been lost. It is also where monomorphization often runs. Hard parts are deciding how much language semantics to keep, since each retained construct is another form every pass must handle, and when to give up and lower.",
    k: ["Keep a language-specific IR level vs lower directly to a general one: a dedicated level enables language-aware optimization and checks; skipping it saves an IR and loses facts that are hard to recover later.",
        "Structured control flow vs flat blocks at this level: structured makes loop and scope facts explicit; flat blocks are uniform for later passes and hide structure."],
    p: ["Information discarded during lowering, such as non-aliasing guarantees the type system proved, cannot be recovered and the optimizer is forced into conservative assumptions."],
    v: "Dump the high-level IR for a program using each language feature: every feature appears in its expected form, types are fully resolved, and a verifier accepts it before lowering runs.",
    dep: ["ast", "type-representation"]
  },
  "ir-lowering": {
    s: "Translates the checked, desugared program into the middle-end IR: structured control becomes basic blocks and branches, expressions become instructions, and variables become memory or values.",
    d: "The lowering walks the tree emitting instructions through a builder. Control constructs become blocks with conditional and unconditional branches, short-circuit operators become branches, aggregates become sequences of loads and stores or values, calls follow the language's evaluation order, and cleanups for scope exit are inserted on every exit path including exceptions. Local variables initially live in memory slots, leaving promotion to SSA to a later pass. Hard parts are evaluation order, cleanup on all paths, generating code simple enough for optimizers and encoding language-level undefined behavior as IR flags.",
    k: ["Lower locals to memory then promote vs build SSA directly: memory form is trivial to generate and relies on a promotion pass; direct SSA construction saves that pass and complicates the front end.",
        "Emit conservative code vs emit with attached facts: attaching facts like non-null or non-aliasing enables optimization and is wrong if the language does not truly guarantee them."],
    p: ["Cleanup actions emitted on the normal path but forgotten on an early return or exception edge leak resources only in rare control-flow."],
    v: "Lower each language construct and run the IR verifier; run a behavior test suite with optimization off and compare outputs to the reference interpreter, including exception and early-exit paths.",
    dep: ["desugaring", "high-level-ir", "control-flow-graph", "mid-level-ir"]
  },
  "ssa-form": {
    s: "Static single assignment: every value is defined exactly once, and merges at control-flow joins use phi nodes, making def-use chains explicit and many optimizations simple.",
    d: "Each variable is split into versions, one per assignment; at a join, a phi selects the version from whichever predecessor ran. Construction places phis at dominance frontiers and renames along the dominator tree; destruction later replaces phis with copies during register allocation. Because each use has exactly one definition, constant propagation, redundancy elimination and dead code elimination reduce to simple graph walks. Hard parts are maintaining SSA through transformations, correctly handling phi operands on critical edges, and translating out of SSA without lost-copy or swap bugs.",
    k: ["Full SSA for scalars with memory handled separately vs memory SSA too: scalar SSA is simple and fast; memory SSA gives precise store and load reasoning at higher construction and maintenance cost.",
        "Phi nodes vs block arguments: they are equivalent; block arguments make edges carry values explicitly and avoid special phi-position rules."],
    p: ["Inserting code on a critical edge without splitting it puts a copy where it also executes for the other path, producing the lost-copy bug."],
    v: "Run the verifier after every pass in a debug build: each value has one definition dominating all uses and phi operands match predecessors. Round-trip through SSA construction and destruction preserves program output.",
    dep: ["control-flow-graph", "dominators-and-loops"]
  },
  "control-flow-graph": {
    s: "A directed graph of basic blocks, straight-line instruction sequences ending in a branch, showing every path execution can take through a function.",
    d: "Each block has a single entry and ends in one terminator (branch, switch, return, unwind). Edges give predecessors and successors; an entry block and exits anchor the graph. Exception handling adds edges to landing blocks. Nearly all analyses and optimizations traverse it in an order such as reverse post-order. It must be kept consistent as passes add, merge, split and delete blocks, so the IR library provides editing utilities that fix up phis and edge lists. Hard parts are unreachable blocks, irreducible loops that have no single header and keeping edge counts and probabilities accurate.",
    k: ["Explicit exception edges vs separate handling: explicit edges let ordinary analyses see exceptional paths and bloat the graph; separate handling is lean and risks passes missing them.",
        "Block terminator with multiple successors vs conditional branch plus fallthrough: explicit terminators keep blocks position independent; fallthrough is compact and ties semantics to layout."],
    p: ["A transformation that leaves an unreachable block with stale predecessors confuses dominator computation and passes that assume every block is reachable."],
    v: "Verify on every function: each block ends in exactly one terminator, successor and predecessor lists mirror each other, and a reachability walk from entry finds all non-dead blocks.",
    dep: ["mid-level-ir"]
  },
  "mid-level-ir": {
    s: "The main language-neutral, machine-neutral IR where most optimization happens: typed instructions in SSA form over a control-flow graph, with explicit memory operations.",
    d: "Functions contain blocks of typed, three-address instructions: arithmetic, comparisons, loads and stores, calls, casts, address computations, and terminators. Types are low level (integers of a width, floats, pointers, vectors, aggregates). Instructions carry flags that unlock optimization, such as 'no signed overflow', 'does not alias', or fast-math. Modules hold functions, globals and metadata. It is a stable, documented interface that many front ends target and many passes consume. Hard parts are defining semantics precisely, especially undefined values and memory model, and evolving the IR without breaking every pass.",
    k: ["Typed vs untyped values: types enable verification and size-aware lowering; untyped IR is simpler and moves meaning into the instructions.",
        "Poison and undefined values vs only undefined behavior: separate deferred-error values permit speculation safely; one concept is simpler to explain and permits fewer transformations."],
    p: ["Ambiguity in the IR's own semantics lets two correct-looking passes each be valid alone and miscompile when combined."],
    v: "Every pass output is checked by the verifier; a reference interpreter executes the IR before and after the optimization pipeline on a test corpus and agrees on all outputs.",
    dep: ["control-flow-graph", "ssa-form", "uniquing"]
  },
  "machine-ir": {
    s: "The low-level IR of target instructions with virtual registers, used for instruction selection results, scheduling, register allocation and frame lowering before final emission.",
    d: "After instruction selection, code is a list of target-specific instructions per block, operands being virtual registers, physical registers, immediates, frame slots and symbols. Instructions carry descriptors giving their operands, side effects, latencies and encoding. Passes run in sequence: scheduling, SSA destruction, register allocation, prologue and epilogue insertion, branch relaxation. It retains enough information to print assembly or encode bytes. Hard parts are modeling implicit register uses, flags and predicated instructions accurately, and maintaining liveness through every rewrite.",
    k: ["SSA for virtual registers early then non-SSA vs non-SSA from the start: early SSA allows machine-level optimizations and costs a destruction step; non-SSA is simpler and limits them.",
        "One generic machine IR vs a representation per target: generic infrastructure shares passes across targets; per-target IR can be tighter and duplicates tooling."],
    p: ["Missing an implicit register or flags use in an instruction descriptor lets a pass reorder code across a flags producer, breaking branches intermittently."],
    v: "A machine-level verifier checks operand counts, register classes and liveness after each pass; printing the code after allocation shows no virtual registers remaining and every use dominated by a definition.",
    dep: ["instruction-selection", "target-description"]
  },
  "ir-verifier": {
    s: "A checker that asserts structural and semantic invariants of the IR (dominance, types, terminators, phi shape) and is run between passes to catch compiler bugs early.",
    d: "The verifier walks the IR checking rules that every pass must preserve: each block ends in one terminator, operand types match instruction rules, each value's definition dominates its uses, phi operands correspond to predecessors, calls match signatures, metadata is well-formed. It is cheap enough to run after every pass in debug builds and on demand in release builds. Failing a check points at the guilty pass instead of a crash many stages later. Hard parts are keeping it complete as the IR evolves and defining invariants that are checkable yet tight.",
    k: ["Verify after every pass vs only at stage boundaries: every pass pinpoints the culprit and multiplies compile time; boundary checks are cheap and blame a whole region.",
        "Abort on failure vs report and continue: aborting gives a precise crash for reduction; reporting all violations helps when many are related."],
    p: ["A verifier that checks only structure and not dominance or types accepts broken IR that later crashes the back end far from the cause."],
    v: "Seed known-invalid IR for each rule (use before definition, wrong operand type, phi mismatch) and confirm each is rejected with a specific message; the full test suite runs with verification after every pass.",
    dep: ["mid-level-ir", "ssa-form", "dominators-and-loops"]
  },
  "dominators-and-loops": {
    s: "Computes which blocks must precede others (dominance) and finds natural loops with headers, bodies and nesting, the basis for SSA and most loop optimizations.",
    d: "Block A dominates B if every path from entry to B passes through A. Algorithms compute the dominator tree and dominance frontiers; post-dominators give the same for exits. A back edge to a dominator defines a natural loop, and the loop forest records nesting, preheaders and exits. Results are cached and invalidated when the graph changes, with incremental updates where possible. Hard parts are irreducible control flow, keeping the tree correct under frequent edits, and speed on functions with very large graphs.",
    k: ["Iterative data-flow algorithm vs Lengauer-Tarjan style: iterative is short and fast on typical graphs; the asymptotically better approach pays off on huge or adversarial functions.",
        "Recompute vs incrementally update after edits: recomputing is simple and wasteful in loops of transformations; incremental updates are fast and easy to get subtly wrong."],
    p: ["Using a dominator tree after a pass changed the graph, without invalidation, justifies hoisting code above a point that no longer dominates its uses."],
    v: "Compare the computed tree against a brute-force check (remove block, test reachability) on randomly generated graphs. After each pass in tests, recomputed and cached results must be identical.",
    dep: ["control-flow-graph"]
  },
  "alias-analysis": {
    s: "Answers whether two memory references may, must or cannot refer to overlapping storage, enabling reordering, removal and promotion of loads and stores.",
    d: "Queries take two pointers with access sizes and return no-alias, may-alias, partial or must-alias. Implementations layer techniques: type-based rules from the language, distinct allocation sites, offsets from the same base, argument attributes such as no-alias, and flow- or context-sensitive points-to analysis. Cheap analyses answer most queries; expensive ones are consulted on demand. Results also report whether a call may read or write memory. Hard parts are precision versus cost, soundness in the face of casts and escaping pointers, and encoding language guarantees faithfully.",
    k: ["Flow-insensitive whole-program points-to vs local rule-based queries: whole-program finds more facts and costs memory and needs all code; local rules are quick, modular and conservative.",
        "Trust language-level aliasing rules vs assume nothing: trusting enables large speedups and turns user violations into miscompiles; assuming nothing is safe and slower."],
    p: ["An unsound no-alias answer reorders a load above a store to the same address, giving wrong results that appear only at higher optimization levels."],
    v: "Run a corpus of aliasing tests asserting must, may and no-alias answers on small programs, then differential-test optimized and unoptimized runs on aliasing-heavy code.",
    dep: ["mid-level-ir", "call-graph", "escape-analysis"]
  },
  "dataflow-framework": {
    s: "A generic engine for iterating facts across the control-flow graph until they stabilize, instantiated for reaching definitions, availability, liveness and other problems.",
    d: "An analysis supplies a lattice of facts, a transfer function per instruction or block, a meet operator and a direction. The engine runs a worklist over blocks in a good order, propagating until no fact changes, which terminates because the lattice has finite height and transfer functions are monotone. Sparse variants propagate along SSA def-use edges instead of through all blocks, which is much faster. Hard parts are choosing lattices that capture the property without exploding in size, handling interprocedural effects and keeping per-block bit vectors efficient.",
    k: ["Dense block-level propagation vs sparse SSA-based: dense handles any property and is slower; sparse is fast and only for properties that attach to values.",
        "Forward and backward analyses in one framework vs separate: one framework reuses worklist and ordering code; separate ones are simpler for each case."],
    p: ["A non-monotone transfer function prevents convergence or oscillates, and the compiler spins forever on a specific input shape."],
    v: "Instantiate the framework for a known problem and compare results to a hand-computed solution on small graphs. Random-graph tests confirm termination and agreement between worklist and naive round-robin solving.",
    dep: ["control-flow-graph", "ssa-form"]
  },
  "call-graph": {
    s: "A graph of which functions call which, including indirect and virtual calls resolved as far as possible, guiding inlining and whole-program analysis.",
    d: "Nodes are functions; edges are call sites. Direct calls give exact edges; indirect calls need an analysis of which functions a pointer can hold, producing an over-approximation, and virtual calls use class hierarchy information. Strongly connected components identify recursion, and bottom-up traversal of SCCs is the standard order for interprocedural passes. The graph is updated as inlining and devirtualization change calls. Hard parts are precision for indirect calls, incomplete knowledge when modules are compiled separately, and keeping the graph current as passes transform code.",
    k: ["Whole-program graph vs per-module with unknown external callers: whole-program is precise and requires link-time access; per-module is modular and treats externally visible functions conservatively.",
        "Incremental updates vs rebuild per pass: incremental is fast and error prone; rebuilding is simple and expensive on large programs."],
    p: ["Treating a function whose address is taken as having no external callers lets dead-function removal delete something reached through a pointer."],
    v: "Build the graph for programs with indirect and virtual calls and compare edges to a runtime trace collected by instrumentation; every observed call must be present in the static graph.",
    dep: ["mid-level-ir", "type-representation"]
  },
  "liveness-analysis": {
    s: "Computes at each program point which values will still be read later; the key input to register allocation and dead code elimination.",
    d: "A value is live from definition to last use along any path. A backward data-flow computes live-in and live-out sets per block, and interval or per-instruction liveness is derived from them. In SSA form liveness can be computed per value from its uses without iteration. Register allocators build interference or live intervals from it; spill decisions depend on how many values are live simultaneously (register pressure). Hard parts are phi semantics (a phi operand is live on the edge, not in the block), large live sets, and keeping liveness up to date through rewrites.",
    k: ["Recompute after every rewrite vs update incrementally: recomputing is correct and slows allocation; incremental updates are faster and fragile.",
        "Bit-vector sets vs sparse intervals: bit vectors are fast for small functions and quadratic in size on huge ones; intervals are compact and less precise on holes."],
    p: ["Treating a phi operand as live through the whole predecessor block rather than at the edge overstates pressure and causes needless spills."],
    v: "Compare computed liveness with a brute-force per-path check on randomly generated programs. After allocation, assert no two simultaneously live values share a register.",
    dep: ["dataflow-framework", "control-flow-graph"]
  },
  "induction-and-trip-counts": {
    s: "Recognizes values that change by a fixed step each iteration and computes how many times a loop runs, symbolically if the count is not constant.",
    d: "Induction variables are expressed as recurrences (start, step, loop) so derived values such as an array address can be written in closed form. The analysis proves loop bounds, determines whether the trip count is finite and whether arithmetic can overflow, and gives a symbolic expression for the iteration count. Loop unrolling, vectorization, strength reduction and bounds-check elimination all consume this. Hard parts are overflow semantics (wrapping versus undefined), loops with multiple exits, nonlinear recurrences and expressions that grow unmanageably.",
    k: ["Symbolic recurrence algebra vs pattern matching common loop shapes: algebra generalizes and is complex; patterns are simple and miss unusual but valid loops.",
        "Assume signed overflow cannot happen vs wrap: assuming makes bounds provable and many loops faster; wrapping is safe and defeats those optimizations."],
    p: ["Assuming a counted loop is finite because its counter increases ignores wraparound, so a loop that should run forever is optimized to a short fixed trip."],
    v: "Check computed trip counts against actual counts from instrumented execution over many bounds and steps, including zero-trip loops, negative steps and loops that exit early.",
    dep: ["dominators-and-loops", "ssa-form", "constant-propagation"]
  },
  "escape-analysis": {
    s: "Determines whether a pointer to a local or heap object can outlive its function or be seen by others, and which functions have side effects, so storage and calls can be optimized.",
    d: "The analysis tracks where a pointer flows: stored to memory, passed to calls, returned, captured by a closure. Objects that never escape can live on the stack or in registers, avoiding heap allocation and enabling scalar replacement. A related purity analysis labels functions as reading or writing memory or not at all, letting calls be reordered, merged or removed. Summaries per function are computed bottom-up over the call graph. Hard parts are conservative handling of unknown callees and soundness across threads and callbacks.",
    k: ["Interprocedural summaries vs intraprocedural only: summaries find many more non-escaping objects and need whole-program or annotated information; intraprocedural is simple and conservative at every call.",
        "Treat unknown calls as escaping vs trusting attributes: conservative is safe; trusting declared attributes enables optimization if declarations are correct."],
    p: ["An object stored through a pointer argument is judged non-escaping, is stack-allocated, and the caller later reads freed stack memory."],
    v: "Write programs where objects do and do not escape through returns, fields, closures and callbacks; verify allocation is removed exactly for the non-escaping cases and the program output is unchanged.",
    dep: ["call-graph", "mid-level-ir", "alias-analysis"]
  },
  "analysis-invalidation": {
    s: "Caches analysis results and discards or updates them when passes change the IR, so analyses are reused when still valid and recomputed when not.",
    d: "Analyses are computed on demand through a manager and cached per function or module. Each pass declares which analyses it preserves; after it runs, the manager invalidates the rest. Passes can also request recomputation midway. Correct preservation declarations are the contract: claiming to preserve something a pass actually changed corrupts later decisions. Fine-grained schemes track which functions changed so function-level analyses survive module passes. Hard parts are auditing preservation claims, ordering dependencies between analyses and memory use of cached results.",
    k: ["Passes declare preserved analyses vs manager detects changes automatically: declarations are cheap and trust-based; automatic detection is safe and requires tracking mutations.",
        "Cache at function granularity vs module: function granularity allows reuse across edits to other functions; module granularity is simpler."],
    p: ["A pass that declares it preserves dominators while splitting a block leaves a stale tree that a later pass uses to justify an illegal transformation."],
    v: "In a checking mode, recompute every analysis claimed preserved after each pass and compare to the cached copy; any difference names the pass with the incorrect declaration.",
    dep: ["pass-manager", "dominators-and-loops", "alias-analysis"]
  },
  "pass-manager": {
    s: "Schedules the optimization pipeline: which passes run, in what order, on which unit (function, loop, module), with analyses supplied on demand.",
    d: "A pipeline is a nested list of passes grouped by the unit they operate on, so a sequence of function passes runs on one function before moving to the next, improving cache behavior and enabling parallelism. Optimization levels select pipelines, and users can override or print them. The manager runs analyses, handles invalidation, collects statistics, times each pass, and supports bisecting to the first failing pass. Order decisions are largely empirical. Hard parts are phase-ordering interactions, pipelines tuned for one benchmark and compile-time cost of repeated cleanup passes.",
    k: ["Fixed hand-tuned pipeline vs iterate to a fixed point: fixed order is predictable and fast; iteration finds more opportunities and risks long compile times.",
        "Legacy global pass list vs nested pipelines by unit: nesting enables per-function locality and parallelism with more manager complexity."],
    p: ["Adding a new pass at a convenient point silently regresses unrelated benchmarks because it shifts what later passes see."],
    v: "Print the pipeline for each optimization level and diff against expected. A bisect option that stops after pass N lets a miscompile be narrowed to one pass by binary search.",
    dep: ["analysis-invalidation", "mid-level-ir", "ir-verifier"]
  },
  "inlining": {
    s: "Replaces a call with a copy of the callee's body, removing call overhead and exposing the callee's code to optimization in the caller's context.",
    d: "The inliner walks the call graph bottom-up, estimating each call site's benefit (known arguments, constant branches that vanish, callee size) against code growth using a cost model with thresholds. When it inlines, it clones blocks, remaps values, merges returns and fixes metadata and debug locations. Always-inline and never-inline attributes override the model. It is the pass that enables most others, since after inlining constant propagation and dead code elimination can act across former boundaries. Hard parts are cost modeling, exponential growth through repeated inlining, recursion and debug-info fidelity.",
    k: ["Aggressive inlining thresholds vs conservative: aggressive speeds hot code and bloats the binary and instruction cache; conservative keeps size and misses cross-call optimization.",
        "Bottom-up static cost model vs profile-guided decisions: static is always available; profile data inlines hot call sites and refuses cold ones much more accurately."],
    p: ["Inlining a function containing a static local, alloca or setjmp-like construct without handling its special semantics changes behavior."],
    v: "Compile with inlining on and off over the test suite; outputs must match. Check that a small callee with a constant argument has its body folded into the caller's code and disappears from the output.",
    dep: ["call-graph", "mid-level-ir", "constant-propagation", "dead-code-elimination"]
  },
  "constant-propagation": {
    s: "Replaces values known at compile time with constants and folds the operations on them, simplifying code and branches across the function or program.",
    d: "On SSA, sparse conditional propagation evaluates instructions with known operands, propagates results along def-use edges and simultaneously tracks which branches are taken, so code in provably untaken paths is ignored. Folding must reproduce target semantics exactly, including integer wraparound, division by zero rules and floating-point rounding, and may use exact arithmetic libraries. Interprocedural variants carry constants into callees. Range and known-bits analysis generalize it. Hard parts are floating-point fidelity, undefined value handling and avoiding compile-time blowup on huge constant expressions.",
    k: ["Sparse conditional propagation vs simple propagation then separate branch pruning: the combined version finds facts that separate passes miss; separate is simpler and needs iteration.",
        "Fold floating point at compile time vs defer: folding is faster at run time and must match the target's rounding and exception behavior exactly."],
    p: ["Folding an operation using host-machine semantics instead of the target's changes results for shifts beyond width or floating-point edge cases."],
    v: "Compare folded results against actual target execution for operator edge-case grids. Check that a branch on a propagated constant disappears and its dead side is removed from the output.",
    dep: ["ssa-form", "arbitrary-precision", "dataflow-framework"]
  },
  "dead-code-elimination": {
    s: "Removes instructions, blocks, globals and functions whose results are never used or that can never execute, shrinking code and unblocking other optimizations.",
    d: "Simple elimination deletes instructions with no uses and no side effects, iterating as removals expose more. Aggressive variants assume everything is dead until proven needed starting from side-effecting roots, which also removes dead loops and cycles of values that only feed each other. Unreachable block removal prunes the graph and fixes phis. At module level it drops unused internal functions and globals. Hard parts are the exact definition of side effect, loops that might not terminate, and preserving observable behavior such as volatile accesses and exceptions.",
    k: ["Optimistic (assume dead, prove live) vs pessimistic (assume live): optimistic deletes mutually dependent dead cycles; pessimistic is simple and leaves them.",
        "Remove possibly infinite loops with no side effects vs keep: removal is permitted under some language rules and surprises users who rely on non-termination."],
    p: ["Classifying a call as side-effect free when it writes through a pointer deletes work the program needed, appearing only when its result is unused."],
    v: "Seed code with unused computation, dead cycles, unreachable blocks and unused internal functions: the output has none of them. Behavior tests with volatile access and exceptions confirm required effects survive.",
    dep: ["ssa-form", "escape-analysis", "control-flow-graph"]
  },
  "redundancy-elimination": {
    s: "Finds computations or memory loads whose value is already available and reuses it: common subexpressions, value numbering, redundant loads and partially redundant expressions.",
    d: "Global value numbering assigns each value a number so equal expressions share one; dominating occurrences replace later ones. Load elimination uses alias analysis to forward stored or previously loaded values across intervening code. Partial redundancy elimination inserts computations on paths that lack one so that a later use becomes fully redundant, which also hoists loop-invariant work. Hard parts are memory dependence accuracy, avoiding extending live ranges so far that register pressure rises, and floating-point and volatile corner cases.",
    k: ["Hash-based value numbering vs dominator-tree scoped CSE: global numbering finds more equivalences and costs more; scoped CSE is simpler and local to dominance.",
        "Aggressive reuse vs rematerialization: reuse saves recomputation and lengthens live ranges; recomputing is cheap on simple values and reduces spills."],
    p: ["Forwarding a stored value over a call that may modify memory through an alias returns stale data."],
    v: "A test with repeated pure expressions and redundant loads shows each computed once in optimized output; program tests with intervening aliased stores and calls confirm results unchanged.",
    dep: ["ssa-form", "alias-analysis", "dominators-and-loops"]
  },
  "peephole-simplification": {
    s: "Applies thousands of local algebraic and structural rewrites to small instruction patterns, such as strength reduction, identity removal and canonicalization.",
    d: "A combiner walks instructions and matches small patterns against rewrite rules: multiply by a power of two becomes a shift, x plus zero becomes x, comparison chains fold, redundant casts cancel. Rules canonicalize forms so later passes see one shape instead of many equivalents. It runs repeatedly between other passes, since each exposes new patterns for the other. Rules must be correct in the presence of overflow flags and undefined values. Hard parts are rule volume, termination (rules that undo each other loop forever) and proving each rewrite right.",
    k: ["Hand-coded matchers vs declarative rewrite rules: hand-coded can be fast and flexible; declarative rules are easier to audit and can be verified automatically.",
        "Canonicalize aggressively vs preserve author shape: canonical form helps analysis and sometimes makes target selection harder to recover the best instruction."],
    p: ["Two rewrite rules that transform in opposite directions create an infinite loop on a pattern that appears only in one library."],
    v: "Automatically verify each rewrite with an exhaustive check on small bit widths. Run the pass to a fixed point on a large corpus and confirm iteration counts stay bounded.",
    dep: ["mid-level-ir", "constant-propagation", "ssa-form"]
  },
  "scalar-replacement": {
    s: "Breaks up local aggregates into individual scalar values and promotes memory slots to SSA registers, so data lives in registers and never touches memory.",
    d: "Front ends emit locals as memory slots for simplicity. This pass finds slots whose addresses never escape, splits structs and arrays into separate scalars when accesses use known offsets, and rewrites loads and stores as direct SSA values with phis at joins. After it, most local variables vanish from memory entirely and become eligible for every scalar optimization. Without it, the whole optimizer sees only loads and stores. Hard parts are slots accessed through casts or variable offsets, partially overlapping accesses and keeping debug information attached to promoted values.",
    k: ["Promote all non-escaping slots vs only simple scalars: promoting everything yields the best code and increases compile time; limiting to scalars is cheap and leaves aggregates in memory.",
        "Run early and again late: early promotion feeds everything; a late run catches slots exposed by inlining."],
    p: ["Promoting a slot whose address leaks into a call changes behavior, because the callee wrote through that address and the promoted value never sees it."],
    v: "After the pass, optimized IR of a function using local structs contains no stack slots for them; debugger variable inspection still shows the source variables at breakpoints.",
    dep: ["ssa-form", "alias-analysis", "escape-analysis"]
  },
  "loop-invariant-motion": {
    s: "Moves computations that produce the same value on every iteration out of the loop into its preheader so they run once.",
    d: "For each natural loop, the pass finds instructions whose operands are defined outside the loop or are themselves invariant, checks they are safe to execute speculatively or are guaranteed to execute, and moves them to the preheader. Loads can be hoisted only if alias analysis shows no store in the loop may modify them. Stores may be sunk after the loop and kept in registers across iterations (scalar promotion). Hard parts are speculation safety (division and loads may trap), register pressure from long-lived hoisted values and zero-trip loops.",
    k: ["Hoist speculatively when safe vs only guaranteed-execution code: speculation finds more but must prove no trap and no side effect; guarded hoisting is always correct and misses conditional work.",
        "Hoist aggressively vs limit to avoid pressure: hoisting always saves ALU work and can force spills in the loop it was meant to speed up."],
    p: ["Hoisting a division or load above the loop guard that protected it introduces a trap on inputs where the loop would not have executed."],
    v: "A test with an invariant expression inside a loop shows it computed once in the preheader. Run with zero iterations and with trapping operands to confirm no new faults.",
    dep: ["dominators-and-loops", "alias-analysis", "ssa-form"]
  },
  "loop-unrolling": {
    s: "Replicates a loop body several times per iteration to cut branch overhead, expose independent work to the scheduler and enable later optimizations.",
    d: "Full unrolling removes loops with small constant trip counts altogether. Partial unrolling by a factor repeats the body and adds a remainder loop or prologue for counts not divisible by the factor. The cost model weighs reduced overhead against code size and instruction-cache pressure, using the trip count analysis and estimated body cost. Unrolling exposes more instruction-level parallelism and allows cross-iteration redundancy elimination. Hard parts are choosing factors per target, handling loops with early exits and avoiding blowup in loop nests.",
    k: ["Static factor heuristics vs profile or runtime-informed: static is always available; profile data avoids unrolling cold code and picks better factors.",
        "Runtime-checked remainder loop vs requiring known trip count: remainder handling covers unknown counts and adds code and a branch; known-count-only is lean and narrow."],
    p: ["Unrolling nested loops multiplicatively yields huge code that thrashes the instruction cache and loses the speedup it was meant to deliver."],
    v: "Check a constant-trip loop is fully removed, and an unknown-count loop runs correctly for trip counts of zero, one, factor minus one, factor and larger. Benchmarks show speedup without code size explosion.",
    dep: ["induction-and-trip-counts", "dominators-and-loops", "redundancy-elimination"]
  },
  "vectorization": {
    s: "Converts scalar operations into SIMD instructions that process several elements at once, either by transforming loops or by packing independent straight-line operations.",
    d: "Loop vectorization proves iterations are independent (or independent enough using dependence analysis), widens the body by the vector factor, adds a scalar remainder, and replaces scalar operations with vector ones, using masks or gather and scatter where needed. Superword-style vectorization packs similar independent instructions in a block. A cost model compares scalar and vector cost on the target, including shuffles and alignment. It needs trip counts, alias information and target vector widths. Hard parts are dependence proofs, reductions that reorder floating-point arithmetic, cost accuracy and runtime checks for possible aliasing.",
    k: ["Runtime alias checks with a scalar fallback vs only provably safe loops: checks vectorize far more and add code and branch overhead; proof-only is safe and misses common patterns.",
        "Allow reassociation of floating-point reductions vs preserve order: reassociation enables vectorization and changes rounding; preserving order matches scalar results exactly."],
    p: ["A cost model that ignores shuffle and remainder overhead vectorizes short loops that run slower than the scalar version."],
    v: "Vectorized and scalar builds produce identical results on integer loops and within the documented tolerance for float reductions; instruction output shows vector instructions and a benchmark shows speedup for large trip counts.",
    dep: ["induction-and-trip-counts", "alias-analysis", "target-description", "loop-unrolling"]
  },
  "devirtualization": {
    s: "Turns indirect or virtual calls into direct calls when the target can be determined, which then allows inlining and other optimizations.",
    d: "Using type information, the compiler proves what concrete types can reach a call: from construction sites, final classes, class hierarchy analysis over the whole program, or known values flowing in SSA. A single possible target becomes a direct call; a few targets become a guarded chain of type checks with direct calls and a fallback. With profile data, the hot target is speculatively guarded. This works best with whole-program or link-time visibility. Hard parts are dynamic loading that invalidates closed-world assumptions and keeping type information through earlier lowering.",
    k: ["Closed-world assumption vs open: closed-world finds many unique targets and breaks when code is loaded later; open-world stays correct and relies on speculation guards.",
        "Guarded speculative calls vs only proven direct calls: guards capture hot cases and cost a check and code size; proven-only never adds overhead and never fires on polymorphic sites."],
    p: ["Assuming no further subclasses exist, then loading a plugin that adds one, sends calls to a function that is now wrong."],
    v: "Test programs with one, two and many implementations at a call site; optimized output shows direct, guarded and indirect calls respectively, and behavior matches an unoptimized build including after adding a new subclass.",
    dep: ["call-graph", "type-representation", "inlining", "mid-level-ir"]
  },
  "interprocedural-opt": {
    s: "Optimizations that use information across function boundaries: argument specialization, dead argument removal, global constant propagation, function merging and attribute inference.",
    d: "Working bottom-up and top-down over the call graph, these passes infer function attributes (does not write memory, never returns null), propagate constant arguments into callees or clone a specialized copy, remove unused parameters and return values, merge identical functions, promote globals that are never modified into constants, and change calling conventions for internal functions. They need to know all callers, so apply to functions with internal linkage or under whole-program visibility. Hard parts are cost of whole-program information, correctness when addresses escape, and keeping debug information coherent after signatures change.",
    k: ["Specialize by cloning vs a shared body with guards: cloning gives the best code per call context and grows binary size; sharing is smaller and preserves generality.",
        "Rely on internal linkage vs require whole-program mode: internal linkage is available everywhere and limited in reach; whole-program mode finds far more and needs link-time access."],
    p: ["Changing the signature of a function whose address is also used by external code breaks callers the pass could not see."],
    v: "A multi-function test with unused arguments, constant arguments and identical functions shows each optimized away or merged in the output while exported functions keep their original signatures.",
    dep: ["call-graph", "escape-analysis", "constant-propagation", "symbols-and-linkage"]
  },
  "link-time-optimization": {
    s: "Defers optimization until all modules are available, then optimizes the whole program as one unit, enabling cross-file inlining and global dead code removal.",
    d: "At compile time each file emits IR rather than machine code. The linker, through a plug-in interface or integrated step, merges the IR, learns which symbols are used externally, and runs the optimization pipeline over the combined module before code generation. A thin variant keeps modules separate and shares only compact summaries, so imports and inlining decisions use cross-module information while back-end work stays parallel and incremental. Hard parts are memory and time for full merges, symbol visibility accuracy, and consistent options across inputs.",
    k: ["Full monolithic LTO vs thin summary-based: monolithic has the best optimization and the worst build time and memory; thin retains most gain with parallel, incremental builds.",
        "Optimize in the linker vs a separate whole-program tool: the linker knows exactly which symbols are retained; a separate tool is simpler and must be told."],
    p: ["Objects built with different flags or compiler versions are merged into one unit, silently mixing assumptions such as exception model or ABI."],
    v: "Build a multi-file program with and without LTO; a function defined in one file and called from another must be inlined with the option on, unused exported-but-unreferenced code removed, and results identical.",
    dep: ["interprocedural-opt", "inlining", "linker-invocation", "ir-verifier"]
  },
});
