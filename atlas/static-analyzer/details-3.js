// Details for the static analyzer plate, part 3: data-flow, abstract interpretation, pointer analysis.
ATLAS.details("static-analyzer", {
  "worklist-solver": {
    s: "The generic engine that computes a data-flow fixed point: it repeatedly applies transfer functions at nodes whose inputs changed until no fact changes anywhere.",
    d: "The solver keeps a queue of nodes, takes one, merges facts from its predecessors or successors, applies the node's transfer function, and if the output changed, enqueues the affected neighbors. Termination follows from facts moving only one way in a finite-height lattice. The visit order matters for speed: reverse postorder for forward problems converges in far fewer passes. It is hard to make fast on large functions: facts can be large sets, and naive copying at each node dominates the cost.",
    k: ["Node-level facts vs block-level facts: block-level facts use less memory and recompute inside blocks on demand; node-level facts are simple and store far more.", "Reverse postorder queue vs plain FIFO: ordered traversal reaches a fixed point in fewer iterations and requires an ordering pass up front."],
    p: ["A transfer function that is not monotone makes the iteration oscillate and never finish.", "Copying whole fact sets at every edge turns a linear analysis into a memory problem on large generated functions."],
    v: "Run a known analysis on a function with nested loops and confirm the fixed point equals the hand-computed answer, with an iteration count within a small multiple of loop depth.",
    dep: ["control-flow-graph","transfer-functions","lattices-and-joins"]
  },
  "transfer-functions": {
    s: "The per-statement rules that say how a statement changes the analysis facts: what it generates, what it kills and what it passes through unchanged.",
    d: "For each kind of instruction the analysis defines a function from the fact before it to the fact after it. Gen and kill sets give distributive problems a compact form; richer domains need functions that evaluate expressions abstractly. Edge-specific transfer functions let a branch condition refine facts differently on each side. They must be monotone and, for soundness, over-approximate every concrete behavior including exceptions. The hard part is covering every instruction form, including rare ones, since a missing case defaults to either unsound or useless.",
    k: ["Gen/kill formulation vs general functions: gen/kill is fast and limited to bit-vector problems; general functions express value analyses and cost more.", "Treat unknown instructions as no-ops vs as havoc: no-op keeps precision and may be unsound; havoc is sound and loses all facts it touches."],
    p: ["An exceptional edge is given no transfer function, so facts from before a throw wrongly survive into the handler.", "A rarely used instruction form has no case and silently passes facts through."],
    v: "Enumerate every instruction kind in the intermediate representation and confirm each has a defined transfer function, then check that a test with each kind produces the hand-derived fact.",
    dep: ["intermediate-representation","lattices-and-joins"]
  },
  "reaching-definitions": {
    s: "Computes, for each program point, which assignments to each variable could have supplied its current value, the basis for def-use links and uninitialized-use checks.",
    d: "A forward analysis where each assignment generates a definition and kills other definitions of the same variable. At a use, the set of reaching definitions tells which writes may have provided the value. The result builds def-use chains and detects reads with no reaching definition on some path. Aliased and field writes complicate killing: a write through a pointer may or may not overwrite a given variable. The difficulty is precision around memory, since without alias information every pointer write must conservatively kill nothing or everything.",
    k: ["Strong update vs weak update on writes: strong updates kill the old definition when the target is certain and are precise; weak updates keep both and are sound under uncertainty.", "Per-variable bit vectors vs sparse maps: bit vectors are quick to merge and wasteful for large procedures; sparse maps scale better and cost more per operation."],
    p: ["A pointer write is treated as a strong update to a variable it only might change, so a live definition is lost.", "Definitions that cross loop back-edges are dropped, hiding a use of a stale value."],
    v: "Analyze a function with a branch that assigns a variable on one side only and confirm a later use reports two reaching definitions, one being the missing initialization.",
    dep: ["worklist-solver","transfer-functions","alias-queries"]
  },
  "live-variables": {
    s: "A backward analysis that finds which variables may still be read later, used to detect dead stores, unused values and values that need not be kept.",
    d: "A variable is live at a point if some path from there reads it before overwriting it. The analysis flows backward from uses, with reads generating liveness and writes killing it. A store to a variable that is not live afterward is a dead store, which is often a bug such as a result that was never checked. It also identifies overwritten secrets that should be wiped. The difficulty is distinguishing intentional dead stores from defects, and handling variables whose address escapes, which can be read through other names.",
    k: ["Report all dead stores vs only suspicious ones: all is complete and noisy, since defensive initialization is common; filtering by pattern reduces noise and skips some real defects.", "Treat address-taken variables as always live vs track them: always live is sound and loses dead-store detection for them; tracking needs alias analysis."],
    p: ["Initialization to a default is flagged as a dead store, and developers stop trusting the rule.", "A variable whose address was passed to a function is reported dead and the callee actually read it."],
    v: "Run on code containing an unchecked return value assigned to a local and never read, and confirm exactly that store is reported while an initialize-then-overwrite idiom in the same file is not.",
    dep: ["worklist-solver","transfer-functions","escape-analysis"]
  },
  "constant-propagation": {
    s: "Tracks variables that hold a known constant on every path, enabling checks such as division by zero, impossible conditions and out-of-range constants.",
    d: "Each variable maps to a lattice value: unknown-yet, a specific constant, or not-constant. Assignments evaluate expressions over known constants, and merges at joins lose the constant when branches disagree. Conditional versions also prune branches whose conditions are decided, so unreachable code stops contributing facts. Results feed other checks as a precise-value source. The hard part is evaluating operations exactly as the language does, with overflow, integer width and floating-point behavior, since an approximation reports bugs that cannot occur.",
    k: ["Plain vs conditional propagation: plain propagation is simple and treats all branches as reachable; conditional prunes dead branches for more precision and extra work.", "Exact machine arithmetic vs mathematical integers: machine arithmetic is faithful to overflow and needs width tracking; mathematical integers are easier and wrong near limits."],
    p: ["A constant folded with the wrong integer width yields a phantom overflow finding.", "A value changed by another thread is treated as constant in a function that runs concurrently."],
    v: "Analyze a function that divides by a variable set to zero on one branch and nonzero on the other, and confirm a division-by-zero finding is reported only on the path through the zero branch.",
    dep: ["worklist-solver","transfer-functions","abstract-domains"]
  },
  "nullness-analysis": {
    s: "Tracks whether each reference may be null, definitely null or definitely non-null, to report dereferences of possibly-null values and redundant null checks.",
    d: "Values start unknown and become non-null after allocation, after a successful comparison against null, or through annotations on declarations. A dereference of a value that may be null on some path is a finding. Branch conditions refine facts on each outgoing edge. Interprocedural summaries say whether a callee can return null or requires non-null arguments. The difficulty is precision at boundaries: library return values, fields set elsewhere and conditions combined across several variables give many false alarms unless annotations or models fill the gaps.",
    k: ["Rely on declared annotations vs infer nullness: annotations are cheap and trustworthy where present and sparse in older code; inference covers everything and is wrong more often.", "Report possibly-null at every dereference vs only on certain paths: all is sound and noisy; path-limited reports are quieter and miss rare paths."],
    p: ["A field checked for null at the start of a method is assumed to stay non-null after a call that can reset it.", "Library functions with unknown nullness are treated as nullable, producing alarms on nearly every call."],
    v: "Analyze a method that checks a parameter for null in one branch and dereferences it in the other, and confirm a finding appears only on the unchecked path with a trace through the branch.",
    dep: ["worklist-solver","procedure-summaries","library-models","path-sensitivity"]
  },
  "typestate-analysis": {
    s: "Tracks the protocol state of each object, such as opened or closed, locked or unlocked, to find calls made in the wrong state or required calls never made.",
    d: "A state machine per object type lists legal operations in each state. The analysis follows each tracked object through the program, updating its state at calls and reporting violations such as use after close, double release or a missing release on some path including error exits. It needs alias information, since an object reached through two names is one object, and ownership or escape information to know when an obligation has been handed off. The hard part is leaks along exceptional paths and ownership transfer.",
    k: ["Typestate specs written by hand vs inferred from usage: hand-written specs are exact for the APIs covered; inference covers more and creates spurious rules.", "Track every object vs only resource types: tracking all is general and costly; a small tracked set keeps the analysis cheap and limited."],
    p: ["A resource stored in a field and closed elsewhere is reported as leaked.", "An exception path that skips a close call is never examined because the control-flow graph omits exceptional edges."],
    v: "Write a function that opens a handle and returns early on an error path without closing it, and confirm a leak finding appears with a trace through the early return, and none on the version that closes it.",
    dep: ["worklist-solver","points-to-analysis","escape-analysis","control-flow-graph"]
  },
  "abstract-domains": {
    s: "The families of abstract values an analysis computes with, such as signs, intervals or sets of possible objects, each trading expressiveness against speed.",
    d: "A domain defines how a set of concrete values is described, how abstract operations over-approximate concrete ones, and how to compare and combine descriptions. Signs record only negative, zero or positive; intervals record bounds; congruence domains record divisibility; set domains list possible values up to a limit. Choosing a domain fixes what can be proved: array bounds need numeric bounds, null checks need only a small flag. The difficulty is soundness of each operation, especially for wraparound arithmetic and floating point.",
    k: ["Simple domain, fast and coarse vs rich domain, precise and costly: intervals scale to millions of lines and cannot express relations between variables; richer domains can and become expensive.", "One domain for all values vs different domains per type: one domain is uniform; per-type domains fit well and complicate how they interact."],
    p: ["An interval operation ignores overflow wraparound, so a bounds proof is wrong for large inputs.", "Domain precision is chosen for the demo program and is far too slow on real code."],
    v: "Test each abstract operation against random concrete inputs and confirm the concrete result is always contained in the abstract result, with failures reported as soundness bugs.",
    dep: ["lattices-and-joins"]
  },
  "lattices-and-joins": {
    s: "The mathematical structure ordering abstract values by precision, with a join that merges facts from different paths into one that covers both.",
    d: "A lattice gives a partial order, a least upper bound for merging and usually a top element meaning anything and a bottom meaning impossible. At control-flow joins the analysis computes the join of incoming facts. Finite height guarantees termination of iteration; infinite height needs widening. Properties such as monotonic operations and associative joins make results independent of visit order. The hard part is implementation error: a join that is not actually an upper bound causes unsound or oscillating results that are hard to find.",
    k: ["Join at every merge vs delayed joins by keeping disjuncts: joining is cheap and loses correlations between facts; keeping disjuncts is precise and grows exponentially.", "Explicit bottom for unreachable vs none: explicit bottom prunes dead paths precisely and needs care at every operation."],
    p: ["A join implementation is not commutative, so the result depends on iteration order and varies between runs.", "Bottom is mishandled and unreachable code contributes facts to a later merge."],
    v: "Property-test every domain with random pairs and confirm the join is commutative, associative, idempotent and above both inputs, and that the order relation matches it.",
    dep: []
  },
  "widening-and-narrowing": {
    s: "Techniques that force termination on domains with infinite ascending chains, by jumping to a coarser answer at loops, then optionally recovering precision with a refinement pass.",
    d: "On loops, an interval analysis would increase an upper bound one step per iteration forever. Widening replaces a growing bound with infinity after a few iterations, guaranteeing a fixed point quickly. Narrowing then re-applies the transfer functions to tighten the over-wide result. Thresholds can make widening stop at meaningful constants such as an array length. Where widening is applied, usually at loop heads, strongly affects precision. The hard part is losing needed precision, since a widened bound can turn a provable access into a possible violation.",
    k: ["Widen immediately vs delay a few iterations: immediate is fast and coarse; delaying keeps precision for short loops at modest cost.", "Threshold widening vs plain: thresholds keep useful bounds when picked well and need a good set of constants drawn from the program."],
    p: ["Widening turns a loop counter's bound to infinity, and every array access in the loop is flagged.", "Narrowing is skipped for speed, leaving results too coarse to prove anything after the loop."],
    v: "Analyze a counted loop with a known bound and confirm termination within a small iteration count and that the post-loop interval equals the loop bound after narrowing.",
    dep: ["lattices-and-joins","abstract-domains","worklist-solver"]
  },
  "relational-domains": {
    s: "Abstract domains that record relationships between variables, such as one being less than another or their sum being constant, needed to prove properties non-relational domains cannot.",
    d: "Intervals treat each variable independently, so they cannot show that an index is below a length that changes with it. Relational domains such as difference constraints, octagons or polyhedra hold inequalities between variables. Operations like assignment and join update the relation set, and cost rises sharply with the number of variables: some are cubic or worse. Tools apply them to small groups of related variables rather than whole functions. The hard part is scalability and numeric robustness of the underlying arithmetic.",
    k: ["Whole-function relations vs small variable packs: whole-function relations are precise and expensive; packs keep cost bounded and miss relations across packs.", "Fast weak relations vs exact expensive ones: difference constraints cover common index patterns cheaply; exact polyhedra cover more and do not scale."],
    p: ["A pack grouping misses a pair of variables that are related, and the proof fails on correct code.", "Relational analysis time explodes on one large generated function and exhausts the budget."],
    v: "Analyze a loop that copies up to a length held in another variable and confirm an index-in-bounds proof succeeds with the relational domain and fails with intervals alone.",
    dep: ["abstract-domains","lattices-and-joins","widening-and-narrowing"]
  },
  "abstract-memory": {
    s: "The abstract model of the heap, stack and arrays used by value analyses: how many locations are distinguished and how reads and writes to them are approximated.",
    d: "Abstract memory maps abstract locations, such as one per variable, per allocation site or per array region, to abstract values. Arrays may be summarized as one cell, split into segments or tracked by index. A write to a single concrete location is a strong update; a write to a summarized location may only join with the old value. It is closely tied to pointer analysis for deciding which locations an access touches. It is hard because byte-level reinterpretation, unions and pointer arithmetic break clean location boundaries.",
    k: ["Array as single summary cell vs per-index tracking: one cell is cheap and loses element facts; per-index tracking is precise for small constants and breaks on dynamic indices.", "Field-based vs object-based modeling: object-based keeps objects apart; field-based merges by field name and is cheap and more imprecise."],
    p: ["Pointer arithmetic moves outside the tracked object, and the analysis reads facts from a neighboring variable.", "A summarized array element receives a strong update, and later reads wrongly see only the newest value."],
    v: "Analyze code that fills an array with known values then reads one back and confirm the read value is exact for constant indices and conservatively joined for a loop index.",
    dep: ["points-to-analysis","abstract-domains","heap-abstraction"]
  },
  "domain-products": {
    s: "Combinations of several abstract domains run together so that each can refine the others, for example intervals plus nullness plus taint on the same variables.",
    d: "A direct product runs the domains side by side with no communication. A reduced product exchanges information: if one domain knows a value is positive, another may drop a case. Reduction passes cost time and need correct rules for each pair. Products make a single analysis cover many properties with shared traversal and a shared fixed point. The difficulty is the quadratic growth in interactions: adding a domain means defining how it combines with every existing one.",
    k: ["Direct product vs reduced product: direct is modular and finds no more than the parts; reduced shares knowledge and needs pairwise rules.", "One combined analysis vs separate analyses: combined shares the traversal and facts; separate analyses are simpler to build, run in parallel and re-traverse."],
    p: ["Reduction between two domains is unsound in one direction, and a wrong fact spreads to all of them.", "Adding one more domain doubles the analysis time without any new findings."],
    v: "Run the combined analysis on code where a sign fact should eliminate a nullness alarm and confirm the alarm is present with the direct product and absent with the reduced product.",
    dep: ["abstract-domains","lattices-and-joins"]
  },
  "points-to-analysis": {
    s: "Computes for each pointer or reference the set of memory objects it may refer to, the foundation for resolving writes, calls through pointers and aliasing.",
    d: "The analysis creates an abstract object per allocation site and propagates sets through assignments, calls, field loads and stores, solving a system of inclusion constraints until stable. Variants differ in precision: unification-based approaches are near-linear and merge aggressively; inclusion-based ones are cubic in the worst case and more precise. Results are consumed by nearly every other analysis. It is hard to scale on large programs, where cycles and huge sets dominate time and memory.",
    k: ["Inclusion-based vs unification-based: inclusion is more precise and slower; unification scales to millions of lines and merges unrelated objects.", "Flow-insensitive vs flow-sensitive: insensitive is far cheaper and imprecise; sensitive tracks order of assignments and costs much more memory."],
    p: ["A single wide-spread object, such as a shared container, merges together everything stored in it.", "Calls through function pointers are resolved by the same analysis they depend on, creating a circular dependence that must be solved jointly."],
    v: "Analyze programs with known aliasing relationships and confirm the computed sets are supersets of the true targets, and measure average set size to track precision across versions.",
    dep: ["intermediate-representation","heap-abstraction","call-graph-construction"]
  },
  "alias-queries": {
    s: "The interface through which analyses ask whether two references may or must refer to the same object, answered from points-to results.",
    d: "Clients ask may-alias, must-alias or no-alias for two expressions at a program point. The answer comes from intersecting points-to sets, adjusted for field paths and, if the analysis is flow-sensitive, for the program point. Must-alias is stronger and rarely available; it is what justifies strong updates. A cache avoids repeating queries. The difficulty is that clients differ in what they can tolerate: a taint analysis wants soundness, a bug finder may accept optimistic answers.",
    k: ["Conservative may-alias for soundness vs optimistic no-alias for fewer alarms: conservative never misses a flow and adds noise; optimistic quiets output and misses bugs through aliases.", "Query on demand vs precompute all pairs: on demand scales with what clients ask; precomputing is quadratic."],
    p: ["Must-alias is claimed from a single points-to target that was actually a summarized object, enabling a wrong strong update.", "The same query is repeated thousands of times without a cache and dominates the run."],
    v: "Compare alias answers against a small program with known aliasing for each pair of references, and confirm there are no false no-alias answers and the share of may-alias pairs is within the expected bound.",
    dep: ["points-to-analysis","field-sensitivity"]
  },
  "field-sensitivity": {
    s: "Distinguishes the fields of an object in the pointer analysis, so that a write to one field does not appear to modify the others.",
    d: "A field-insensitive analysis treats an object as a single blob, so anything stored in any field is assumed to be in every field. A field-sensitive one keeps a separate points-to set per field of each abstract object, at the cost of more nodes. Path-limited variants track chains such as a.b.c up to a bounded depth. Unions, casts and pointer arithmetic that reach into object internals undermine it. The hard part is deciding the bound for nested fields and handling casts between structure types.",
    k: ["Field-sensitive vs field-insensitive: sensitive separates different roles of fields and costs more constraints; insensitive scales and merges unrelated data.", "Bounded access-path depth vs unbounded: bounded paths guarantee termination and merge deep structures; unbounded can loop on recursive data types."],
    p: ["A cast to a different structure type makes field offsets disagree, and facts attach to the wrong field.", "Recursive data such as linked lists generates unbounded paths and exhausts memory."],
    v: "Analyze an object with two fields holding different values and confirm a taint set into one field does not appear on a read of the other under field-sensitive mode and does under insensitive.",
    dep: ["points-to-analysis","heap-abstraction"]
  },
  "heap-abstraction": {
    s: "The scheme for naming heap objects in the analysis, typically by allocation site, which decides how many runtime objects are merged into one abstract object.",
    d: "Every allocation site becomes one abstract object representing all runtime objects it creates. Objects created in loops or helper functions therefore merge, so two lists built by the same factory are one. Finer schemes add context to the name, such as the call chain to the allocation, or use shape analysis for linked structures. Coarser schemes name by type only. The hard part is allocation wrappers: a generic allocation function makes all objects in the program one abstract object unless it is cloned or modeled.",
    k: ["Allocation-site naming vs type-based naming: sites are more precise and cost more objects; types are cheap and merge distinct instances heavily.", "Special-case known wrappers vs generic handling: special cases give precision where the wrapper is known and miss custom ones."],
    p: ["A custom allocation wrapper merges every object in the program, so each pointer appears to alias every other.", "Heap objects created by libraries have no allocation site in analyzed code, so pointer results are empty and miss flows."],
    v: "Analyze two separately allocated lists built by one factory function and confirm they are distinguished with heap cloning and merged without it, and that a wrapper-allocated pair is separated when the wrapper is declared.",
    dep: ["points-to-analysis","library-models"]
  },
  "heap-cloning": {
    s: "Gives objects created in the same place but reached via different call paths separate abstract identities, recovering precision lost to allocation helpers and factories.",
    d: "The abstract object name includes a bounded context, such as the call sites on the stack at allocation. Two calls to a factory then create two abstract objects, and flows through one no longer appear on the other. The number of objects multiplies with the depth allowed, so selective cloning is applied only to functions that allocate and return, or to container classes. It raises precision most for containers and wrappers. The hard part is choosing where it pays off, as blanket cloning makes the analysis too large.",
    k: ["Clone selectively by function kind vs uniformly: selective captures most benefit cheaply; uniform is simple and expensive.", "Fixed context depth vs adaptive: fixed depth is predictable; adaptive depth spends where merges hurt and complicates reproducibility."],
    p: ["Cloning depth is set high for a recursive allocator and the number of abstract objects explodes.", "Cloning is applied to a container used everywhere and the cost multiplies for every client."],
    v: "Measure the number of abstract objects and the false aliasing pairs on a container-heavy test program with cloning off, selective and uniform, and confirm selective removes most false pairs for a small cost increase.",
    dep: ["heap-abstraction","context-sensitivity","points-to-analysis"]
  },
  "escape-analysis": {
    s: "Determines whether a reference can outlive its function or be seen by other threads, used to find leaked locals, dangling pointers and unsynchronized sharing.",
    d: "An object escapes when its reference is stored in a field of a longer-lived object, returned, passed to code that may keep it, or captured by another thread. The analysis tracks references through assignments and calls using pointer results and summaries that say which parameters a callee retains. Non-escaping objects are safe to treat with strong updates and simple ownership rules. The hard part is unknown callees: without a model, every parameter passed to external code must be assumed to escape.",
    k: ["Treat unknown calls as escaping vs trust annotations: assuming escape is sound and reduces precision everywhere; annotations recover it only where they are accurate.", "Per-function escape summaries vs whole-program analysis: summaries compose and cache well; whole-program results are precise and slow."],
    p: ["A pointer to a stack variable is returned through a field and the analysis reports no escape.", "A callback registered with a library retains an object, but the library has no model."],
    v: "Run on functions returning a pointer to a local, storing a local into a global and keeping everything local; confirm only the first two are reported as escaping, with the storing statement identified.",
    dep: ["points-to-analysis","procedure-summaries","library-models"]
  },
});
