// Details for the SAT & SMT solver plate, part 1: interfaces, results, orchestration, incremental solving.
ATLAS.details("sat-smt-solver", {
  "smtlib-parser": {
    s: "Reads the standard text language for logic problems: s-expressions declaring sorts and functions, asserting formulas and issuing queries, and turns them into the solver's term graph.",
    d: "The language is a stream of parenthesized commands. The parser tokenizes quoted symbols, numerals, bit-vector and string literals, then builds terms through the sort-checked term factory so identical subterms are shared immediately. Binders such as let and quantifiers introduce scopes that must be resolved during parsing. It is hard because inputs reach gigabytes with deeply nested terms: recursive descent overflows the stack, and let-chains can expand exponentially if they are inlined rather than shared.",
    k: ["Streaming command-by-command parsing vs reading the whole file first: streaming bounds memory and lets the solver answer early queries, but it forbids look-ahead optimizations that need the full problem.", "Iterative parsing with an explicit stack vs recursive descent: handles million-deep terms safely, at the cost of more complex code and harder error messages."],
    p: ["Expanding let bindings as text instead of sharing them turns a linear file into an exponential term.", "Accepting ill-sorted input leniently produces a wrong answer later instead of an error at the offending line."],
    v: "Feed a file with a ten-thousand-deep nested let chain and a gigabyte of declarations: memory stays proportional to distinct terms, no stack overflow occurs, and a deliberately ill-sorted assertion is rejected with its line number.",
    dep: ["sort-checker", "hash-consed-terms"]
  },
  "sort-checker": {
    s: "Verifies that every term is well formed: function applications have arguments of the declared sorts, indexed operators have valid indices, and the chosen logic permits the symbols used.",
    d: "Each function symbol carries a signature; the checker infers the sort of each application bottom-up and rejects mismatches. Overloaded symbols such as equality and conditionals are resolved from their arguments, and numerals are typed by context or by logic. A declared logic restricts which symbols and which mixes of sorts are legal, which in turn lets the solver pick a specialized engine. The difficulty is subtle sort rules: parametric datatypes, bit-vector widths computed from indices, and integer-to-real coercion that some logics allow and others forbid.",
    k: ["Strict checking vs permissive coercion: strict rejection catches client bugs early, while coercion accepts sloppy generators but silently changes meaning for integer versus real division.", "Checking at construction time vs a separate pass: construction-time checks guarantee no ill-sorted term ever exists, but they make bulk term building slower."],
    p: ["Treating integer and real division as the same operator gives wrong models on divisible and non-divisible inputs.", "A width mismatch that is allowed through reaches bit-blasting and crashes far from the real cause."],
    v: "Submit one assertion for each class of sort error, including a wrong bit-vector width and a real term in an integer-only logic. Each is rejected at its own line with a sort message before any search starts.",
    dep: ["hash-consed-terms"]
  },
  "command-interpreter": {
    s: "Executes the commands of an input script in order: declarations, assertions, scope pushes and pops, queries and requests for models, cores or statistics, printing each response in the standard form.",
    d: "The interpreter maintains an assertion stack with named scopes, a symbol table that follows those scopes, and the current option values. Check commands invoke the solver; follow-up commands such as get-model or get-unsat-core are legal only in the right state, so the interpreter tracks whether the last answer was sat, unsat or unknown. Output must exactly match the standard because competition harnesses and downstream tools parse it. The hard part is the state machine: invalid sequences, option changes after assertions, and scope pops that must also retract declarations.",
    k: ["Eager execution of each assertion vs buffering until the check: eager lets preprocessing begin early, but buffering allows whole-problem simplification that depends on seeing everything.", "Strict state tracking vs best-effort answers: strictness prevents handing out a model after an unsat answer, but rejects scripts that other tools tolerate."],
    p: ["Printing a model after an unknown answer gives a client a plausible but meaningless assignment.", "A pop that removes the assertions but leaves the declarations changes behavior of later redeclaration."],
    v: "Run a script that pushes, asserts, checks, pops and checks again with the same names declared twice. Responses follow the standard grammar, and the post-pop query sees none of the popped assertions.",
    dep: ["smtlib-parser", "push-pop-scopes", "option-system"]
  },
  "dimacs-reader": {
    s: "Reads the plain clause-file format for pure SAT problems: a header with variable and clause counts, then clauses as lists of signed integers terminated by zero.",
    d: "The format is deliberately minimal, so the reader is mostly about speed and tolerance. It parses with hand-written integer scanning rather than a general stream, handles comment lines, and can read compressed files. Real files misreport their header counts, contain duplicate literals, tautologies, or empty clauses, and sometimes put multiple clauses on one line. Competition-scale files hold hundreds of millions of literals, so reading can be a measurable share of runtime and peak memory if clauses are copied twice.",
    k: ["Trusting the header vs recomputing counts: trusting allows exact preallocation, but wrong headers in the wild then cause crashes or silent truncation.", "Cleaning clauses on read vs delegating to preprocessing: cleaning early saves memory, but then proof output must reproduce the original clause set or checkers will disagree."],
    p: ["An empty clause in the input must make the answer unsat immediately, and a reader that drops it answers sat.", "A header declaring fewer variables than the clauses use causes out-of-bounds writes in per-variable arrays."],
    v: "Parse a file with a wrong header, a duplicate literal, a tautology and an empty clause. The solver reports the header mismatch, treats the file as written, and answers unsat because of the empty clause.",
    dep: ["memory-manager"]
  },
  "programmatic-api": {
    s: "The library interface through which other programs build terms, assert constraints, run checks and read answers directly, without going through text.",
    d: "A context object owns terms, a solver object owns assertions, and handles refer to both with reference counting or arena lifetime rules. Callers construct formulas, set options, call check with optional assumptions, then query models, cores and statistics. Many bindings sit above a thin C-style interface for portability. The challenges are lifetime and error handling: terms from one context used in another, models invalidated by the next check, and exceptions or resource exhaustion crossing a language boundary that cannot carry them.",
    k: ["Reference-counted handles vs context-owned arena: counting frees memory early in long sessions but costs correctness effort for callers, while an arena is simple but grows until the context ends.", "Exposing the term graph vs opaque handles: direct access allows fast traversal, but it freezes the internal representation as an interface that cannot change."],
    p: ["Reading a model after the next check call returns data from a different, now-invalid state.", "Sharing a context across threads without locking corrupts the term table, since the solver is usually not thread-safe."],
    v: "Write a client that builds a formula, checks it, asks for the model, adds a constraint and checks again. The first model is still readable or fails cleanly, and a ten-thousand-iteration loop shows flat memory.",
    dep: ["hash-consed-terms", "option-system", "model-generation"]
  },
  "option-system": {
    s: "The typed registry of settings and the choice of logic that select engines, heuristics, limits and output behavior, settable from files, the command line, scripts and the API.",
    d: "Each option has a name, type, default and a rule for when it may change; some are only legal before the first assertion. The declared logic and the options together choose which theory solvers load and which preprocessing passes run. Because the search is chaotic, options that look harmless, such as the random seed, change which problems finish in time. The hard part is the sheer count: hundreds of options with interactions, plus the need to record the exact configuration with every result so a run can be reproduced.",
    k: ["Logic-driven defaults vs one global default: per-logic tuned defaults solve more problems, but give different behavior when a script changes the declared logic.", "Strict rejection of unknown options vs ignoring them: rejection catches typos, while ignoring lets one script drive solvers with different option sets."],
    p: ["An option set after assertions is silently ignored, so a tuning experiment measures the default.", "Defaults that differ between a competition build and a library build make reported results unreproducible."],
    v: "Set a deliberately misspelled option and an option too late in the script. Both are reported rather than ignored, and the statistics output lists the full effective configuration of the run.",
    dep: []
  },
  "format-translators": {
    s: "Converters from neighboring problem formats, such as pseudo-Boolean files, weighted maximization problems, circuit descriptions and constraint models, into the solver's formula or clause input.",
    d: "Many applications start in a more natural format: linear constraints over 0-1 variables, hardware netlists, planning domains or finite-domain constraints. A translator maps each to terms or clauses and records how to map a model back. Quality depends on the encoding choice, not correctness: a naive translation of a cardinality bound is correct but unsolvably large. They also have to carry names so that a model or core can be reported in the user's vocabulary rather than in generated variable numbers.",
    k: ["Translating once offline vs inside the solver: offline translation keeps the solver small, while in-solver translation can pick encodings after seeing the whole problem.", "Preserving user names vs minimal output: names make models and cores readable, at the cost of memory and a mapping that must survive preprocessing."],
    p: ["A translator that renumbers variables without recording the mapping makes returned models unusable.", "Choosing the same encoding for every constraint size gives huge formulas for the few large constraints."],
    v: "Translate a pseudo-Boolean problem with one very large bound, solve it, and map the model back. The reported assignment satisfies every original constraint when evaluated by an independent checker.",
    dep: ["cardinality-encodings", "tseitin-transformation"]
  },
  "model-generation": {
    s: "Produces a satisfying assignment for the original formula after a sat answer, by collecting values from the Boolean assignment and each theory solver and presenting them in the input vocabulary.",
    d: "The Boolean trail supplies values for propositional atoms; each theory solver supplies values for its own terms: rational numbers from the arithmetic solver, bit patterns from the bit-vector solver, finite interpretations for functions and arrays. These are merged into one interpretation. Variables removed by preprocessing are restored by the reconstruction stack. It is hard because the model must satisfy the original problem, not the simplified one, and because functions and arrays need finite tables with a default case to be printable.",
    k: ["Building the model only on request vs always: on-demand saves time on queries that only need sat or unsat, but it requires the solver state to stay intact until the model is requested.", "Partial models vs total models: partial ones are cheaper and smaller, while total ones are what a client usually expects and can evaluate without further reasoning."],
    p: ["A model of the simplified problem that skips reconstruction fails when evaluated against the original assertions.", "Values for eliminated variables chosen arbitrarily break equalities that the eliminated clauses implied."],
    v: "After each sat answer on a benchmark set, evaluate every original assertion under the printed model using an independent evaluator. All evaluate to true; a mutated model flips at least one to false.",
    dep: ["model-reconstruction", "model-completion", "trail-and-assignment"]
  },
  "model-completion": {
    s: "Fills in values for terms the search never needed to decide, such as unconstrained variables and function entries, so that a returned model assigns every symbol a value.",
    d: "Many symbols never appear in a decision: they were free or became irrelevant. The completion step gives each a default of the right sort, chooses a default branch for function tables, and respects equalities that theory solvers merged. For quantified problems, completion decides what unlisted points map to. The difficulty is that completion is not free of constraints: a careless default can violate an array or datatype axiom that was satisfied only because those terms were left unconstrained.",
    k: ["Canonical defaults vs random defaults: canonical ones make output stable across runs, while random ones sometimes expose client assumptions about unspecified values.", "Completing lazily when read vs once at model time: lazy completion saves effort on large models, but values may then change between two reads if state moves."],
    p: ["Two uses of the same unconstrained function symbol receive different defaults, contradicting functional consistency.", "Default values chosen outside a declared finite range of an enumerated sort produce unreadable output."],
    v: "Declare variables never mentioned in any assertion and a function used at only three points. The model assigns every symbol a sort-correct value and evaluates the function at an unlisted point without error.",
    dep: ["congruence-closure", "array-solver"]
  },
  "model-evaluator": {
    s: "An independent routine that computes the value of any term or formula under a given model, used to check answers and to let clients ask what an arbitrary expression evaluates to.",
    d: "It walks a term graph bottom-up with a cache, applying each operator's definition on concrete values: exact rational arithmetic, wrapping bit-vector operations, array lookups, string functions. It deliberately shares as little code as possible with the solver's reasoning, so that a bug in a theory solver cannot also hide in the check. Hard parts are corner cases that the standard defines exactly: division by zero, shifts by more than the width, and the signedness of remainder.",
    k: ["Separate evaluator vs reusing the rewriter: independent code actually catches solver bugs, while reuse is cheaper but shares the same misreading of the standard.", "Total vs partial semantics for division by zero: treating it as an uninterpreted function matches the standard, but surprises clients expecting an error."],
    p: ["Using machine integer arithmetic for intermediate values silently overflows on large inputs.", "An evaluator derived from the rewriter inherits the same sign error for remainder and approves wrong models."],
    v: "Run it over every sat answer in a regression set and over random terms with a reference implementation. Disagreements are zero, and a deliberately broken theory rule is caught as a false assertion under its own model.",
    dep: ["exact-numerals", "hash-consed-terms"]
  },
  "unsat-core-extraction": {
    s: "After an unsat answer, reports a subset of the named assertions or assumptions that is already contradictory, telling the client which of its requirements conflict.",
    d: "The SAT core records which assumption literals took part in the final conflict by following reasons back from the empty clause or from a falsified assumption. Named assertions are tracked through activation literals, so the set of names in the derivation is the core. In SMT, theory explanations contribute their own antecedents. The cores are valid but not minimal: they depend on whatever the search happened to learn. Preprocessing complicates it, since a clause derived through elimination must still map back to the original assertions it came from.",
    k: ["Cores from the final conflict vs cores from a proof: the final conflict is cheap but can be large, while proof-based extraction is tighter and costs full proof logging.", "Tracking origins through preprocessing vs disabling it when cores are requested: tracking keeps speed but adds bookkeeping, while disabling is simple but slows exactly the queries that use cores."],
    p: ["A core that omits an assertion consumed by preprocessing is satisfiable when checked on its own.", "Treating a core as minimal leads clients to report a larger conflict than necessary."],
    v: "For each unsat benchmark, assert only the returned core and check it again. The result is still unsat; dropping any one member from a minimized core makes it sat.",
    dep: ["assumptions-interface", "conflict-analysis", "conflict-explanations"]
  },
  "core-minimization": {
    s: "Shrinks an unsat core by repeatedly testing whether a member can be removed, producing a smaller or truly minimal conflicting subset at the cost of extra solver calls.",
    d: "The simplest method deletes one member at a time and re-solves under the rest; if still unsat, the member stays out. More efficient variants use the core of each re-solve to drop several members at once, or binary search, or start from a seed core and exchange members. Each call reuses learned clauses through incremental solving. Cost is the issue: minimal cores need one solver call per member in the worst case, and each call can itself be a hard problem, so minimization needs a time budget and degrades gracefully.",
    k: ["Subset-minimal vs cardinality-minimal cores: subset-minimal is feasible with linear calls, while the smallest possible core is itself an optimization problem and far costlier.", "Deletion-based vs insertion-based search: deletion works well when cores are large, insertion when they are small; picking wrongly multiplies the number of calls."],
    p: ["Minimizing without a budget can spend more time than the original solve.", "Results from calls that hit a timeout are treated as satisfiable and wrongly keep members in the core."],
    v: "Minimize cores on a benchmark with known minimal conflicts. Each result is unsat, no single member can be removed, and total minimization time stays within the configured fraction of the original solve time.",
    dep: ["unsat-core-extraction", "assumptions-interface", "learned-clause-retention"]
  },
  "proof-logging": {
    s: "Writes a machine-checkable certificate of an unsat answer: each learned or derived clause, in order, with enough information for an independent checker to verify it.",
    d: "In pure SAT the usual certificate lists every learned clause and every deleted clause, each one implied by unit propagation over the clauses before it. Stronger formats add the antecedent clause identifiers, which make checking much faster. In SMT, proofs also carry theory lemmas with their own justifications and the rewriting steps of preprocessing. The hard part is completeness: every inprocessing technique that changes the clause set, including ones that add clauses that are not logical consequences, must emit a step the checker understands. Proofs can reach terabytes.",
    k: ["Clause-only certificates vs certificates with antecedent hints: clause-only is cheap to write but slow to check, while hints make checking fast and enlarge the file.", "Logging all steps vs trusting theory solvers: full logging gives a complete certificate but slows theory-heavy runs, while trusting them leaves a gap in the guarantee."],
    p: ["Deleting a clause without logging it lets later steps appear justified by a clause the checker still holds.", "An inprocessing step that is correct but not logged makes every later step in the proof unverifiable."],
    v: "Solve an unsat benchmark with logging, then check the output with an independently written checker. The checker accepts, and flipping or removing a single logged line causes it to reject.",
    dep: ["learned-clause-database", "clause-deletion", "inprocessing-scheduler"]
  },
  "proof-checker": {
    s: "A separate, small program that reads a problem and its proof certificate and verifies every step, so that an unsat answer does not depend on trusting the solver's own code.",
    d: "The checker rebuilds the clause set, then for each step confirms it follows by unit propagation or by the listed antecedents, finally confirming the empty clause. Speed comes from backward checking: it verifies only the steps actually needed, working from the empty clause toward the input. The most trusted checkers are written in a form that can be verified formally, with a fast unverified checker whose output is cross-checked. The hard part is the scale of the proof against the checker's own memory and run time.",
    k: ["Forward checking vs backward checking: forward verifies every step and is simple, while backward skips unneeded steps and runs faster but needs the whole proof loaded first.", "Verified checker vs fast checker: a formally verified one can be trusted completely but is slower, so many pipelines use the fast one and audit the verified one on samples."],
    p: ["A checker that shares parsing code with the solver misreads the input in the same way and accepts a wrong proof.", "Checking runs that exceed memory limits get reported as failures rather than as unchecked."],
    v: "Check a set of valid proofs and a set of corrupted ones. All valid proofs are accepted, every corrupted proof is rejected, and the checker's time is within a small multiple of the solver's solving time.",
    dep: ["proof-logging", "dimacs-reader"]
  },
  "statistics-reporting": {
    s: "Counters and timers describing a run: conflicts, decisions, propagations, restarts, learned clauses, time per phase and theory call counts, available as output and through the API.",
    d: "Counters are incremented at low cost on hot paths and aggregated at report time. The report includes both effort figures and quality figures, such as average learned-clause size and the share of time in preprocessing versus search. This is how tuning is done: a configuration change is judged on conflicts per second and on which phase dominates, not on a single end-to-end time. It is hard to keep honest because timing hot loops perturbs them, and sampling or coarse timers hide short phases.",
    k: ["Always-on counters vs compile-time statistics: always-on gives data from any user run, while compile-time keeps the hot path clean at the cost of needing a special build.", "Per-phase wall time vs CPU time: wall time shows what the client waits for, while CPU time is stable under load but hides time spent blocked."],
    p: ["Reading a timer inside the propagation loop slows it measurably and changes the behavior being measured.", "Counters that overflow on long runs wrap and report meaningless negative rates."],
    v: "Run a benchmark twice with identical settings. Counter totals are identical for deterministic counters, the per-phase times sum to within a few percent of total time, and the report lists every option that was in effect.",
    dep: ["option-system"]
  },
  "tactic-framework": {
    s: "A composable way to express solving strategies: small transformations, simplifiers and solvers that can be chained, tried in order, run in parallel or applied conditionally to subgoals.",
    d: "A tactic takes a goal, a set of formulas, and returns zero or more subgoals, with a model or proof converter to translate answers back. Combinators run tactics in sequence, try alternatives, repeat until nothing changes, or split into cases. Users write strategies in a small script language, and the defaults per logic are themselves tactic scripts. It is powerful because strategy becomes data. The challenge is converter correctness: every tactic that removes or changes variables must supply the inverse mapping, and composing a dozen of them multiplies the chances of an unsound inverse.",
    k: ["Strategies as scripts vs hard-coded pipelines: scripts let advanced users tune a problem family, while hard-coding is easier to test and more predictable.", "Goal-based tactics vs incremental state: goals fit one-shot queries and rewriting, while they fit poorly with a long-lived incremental session."],
    p: ["A tactic that eliminates a variable but registers no converter returns models missing that variable's value.", "Repeating a rewrite tactic without a fixed-point test loops forever on a rewrite cycle."],
    v: "Run a three-tactic script on a benchmark with model checking on. The final model satisfies the original goal, and removing one converter in a test build makes the model check fail on the first sat instance.",
    dep: ["term-rewriter", "model-reconstruction", "logic-based-selection"]
  },
  "logic-based-selection": {
    s: "Chooses which engines and preprocessing to use from the declared logic and measured features of the formula, so that simple problems avoid the cost of the full SMT machinery.",
    d: "If the input is pure propositional, it goes to the SAT core directly. Quantifier-free bit-vector problems can be bit-blasted; difference constraints can use a dedicated graph solver; linear arithmetic with integers needs the simplex solver with cuts. The selector inspects the logic declaration and, for undeclared or loose logics, scans the assertions for features such as nonlinear terms, quantifiers or strings. The hard part is mispredicting from features: a formula that looks small can hide a huge arithmetic search, so selection needs fallbacks.",
    k: ["Static selection from the logic vs learned selection from features: static is predictable and explainable, while learned selection wins on average but is hard to debug.", "Specialized engine vs general framework: specialized engines are far faster in their fragment, but each is another code path to keep sound."],
    p: ["A formula declared as linear that contains a hidden multiplication of variables is sent to an engine that cannot handle it.", "Selection that depends on timing makes runs differ between machines."],
    v: "Run a set of problems across logics with selection on and off. The selected engine matches the expected one for each logic, answers agree between settings, and the specialized path is faster on its target fragment.",
    dep: ["option-system", "sort-checker"]
  },
  "portfolio-solving": {
    s: "Runs several differently configured solvers on the same problem at once and takes the first answer, trading extra compute for protection against the heavy-tailed runtime of any single configuration.",
    d: "Each worker uses different seeds, restart and decision policies, preprocessing sets, or even different algorithms. The first to finish wins and the others are stopped. Workers can run as threads in one process or as separate processes. Because performance varies across configurations far more than it varies with extra search work, a small diverse portfolio beats a single tuned run on wall-clock time. The challenge is diversity versus memory: every worker holds its own copy of the clause set.",
    k: ["Independent workers vs workers that share clauses: independence gives clean diversity and no synchronization, while sharing speeds up proofs but reduces diversity and complicates proof logging.", "Fixed configurations vs adaptive assignment: fixed is reproducible, while adaptive moves work toward whichever strategy is making progress but is nondeterministic."],
    p: ["Workers that differ only by seed fail on the same hard instances together, giving little gain over one run.", "A portfolio that exceeds available cores slows every worker and may be slower than one run."],
    v: "Run a hard benchmark set with one, four and eight workers on matching hardware. The solved count and wall-clock total improve with workers, and a problem solved only by a single configuration is still solved.",
    dep: ["option-system", "seeded-randomness", "timeouts-and-limits"]
  },
  "cube-and-conquer": {
    s: "Splits a hard problem into many subproblems by fixing a few well-chosen variables, solves each independently in parallel, and combines the answers.",
    d: "A lookahead solver explores the top of the search tree and chooses variable assignments that most reduce the formula; each resulting prefix, a cube, is handed to a conflict-driven solver as assumptions. The problem is unsat only if every cube is. Because cubes are independent, they scale across thousands of machines, which is how some of the largest combinatorial problems have been settled. The hard part is balance: if cube difficulty varies widely, a few stragglers dominate, and cutoff depth must be tuned per problem family.",
    k: ["Static splitting up front vs dynamic work splitting: static is simple and reproducible, while dynamic balances load better but needs a coordinator and transfers state.", "Many small cubes vs few large cubes: many small ones balance well and lose shared learning, while few large ones keep learning and balance poorly."],
    p: ["A single cube that is far harder than the rest holds up the whole result.", "Clauses learned in one cube reused in another without checking they depend on that cube's assumptions are unsound."],
    v: "Run a combinatorial benchmark with cubing on a cluster. The union of cube answers matches the monolithic answer where known, and per-cube times show the longest cube is within a small multiple of the average.",
    dep: ["lookahead-branching", "assumptions-interface", "portfolio-solving"]
  },
  "clause-sharing": {
    s: "Lets parallel solver instances exchange useful learned clauses, so work done by one worker prunes the search of the others.",
    d: "Each worker exports short or high-quality learned clauses, filtered by size or glue score, to a shared pool, and imports others' clauses at safe points such as restarts or level zero. Imports enter the clause database like learned clauses. Sharing can cut time greatly on unsat problems but can also swamp workers with clauses of little value and reduce the diversity of their searches. Soundness requires that every shared clause be implied by the original problem, not just by the sender's local assumptions or by preprocessing the receiver did not do.",
    k: ["Aggressive sharing vs selective sharing: more clauses give more pruning, but import cost and database growth can erase the gain.", "Sharing between preprocessed copies vs original-formula clauses only: sharing only original-variable clauses is sound but misses eliminated-variable learning, while sharing everything needs matching preprocessing."],
    p: ["A clause derived under a worker's assumptions is exported as if unconditional and makes the others answer unsat wrongly.", "Imported clauses that mention variables eliminated by the receiver's inprocessing corrupt its state."],
    v: "Run a parallel unsat benchmark with sharing on and off. Answers agree, an independent check of the combined proof passes, and the conflict count per worker drops when sharing is on.",
    dep: ["learned-clause-database", "clause-quality-scoring", "portfolio-solving"]
  },
  "optimization-objectives": {
    s: "Extends decision problems to find the best model: minimize or maximize an expression, or satisfy as many weighted soft constraints as possible.",
    d: "Typical algorithms call the decision solver repeatedly: tighten a bound on the objective after each model, or relax and extend an unsat core, or search with a binary split on the objective. For maximization of weighted soft constraints, core-guided methods use unsat cores to raise a lower bound, while model-improving methods lower an upper bound. Multiple objectives can be combined by priority or by exploring a Pareto front. It is hard because every call reuses state through incremental solving, and arithmetic objectives can be unbounded or approach a limit that is never reached.",
    k: ["Core-guided vs model-improving search: core-guided proves optimality quickly when few constraints conflict, while model-improving gives usable answers early but may be slow to prove them.", "Optimization inside the solver vs repeated external calls: inside permits sharing learned clauses and bounds, while external calls are simple and engine-independent."],
    p: ["An unbounded objective loops forever lowering the bound unless it is detected.", "Treating a timeout as proof of optimality returns a suboptimal answer labeled optimal."],
    v: "Solve a weighted problem with a known optimum. The returned value equals the optimum, the model evaluates to that value under an independent evaluator, and a bound just below it is reported unsat.",
    dep: ["assumptions-interface", "unsat-core-extraction", "simplex-solver"]
  },
  "timeouts-and-limits": {
    s: "Bounds each solver call by wall time, conflicts, memory or steps, and ensures that exhausted limits produce a clean unknown answer rather than a crash or a wrong result.",
    d: "Limits are checked at safe points: after each conflict, at restarts, inside long preprocessing loops and inside theory solvers' iterations. Time limits use a monotonic clock; deterministic limits count conflicts, propagations or other abstract steps so that runs reproduce across machines. Memory limits are enforced by the allocator. The hard part is cooperative cancellation: a theory solver deep in one long operation, such as a pivoting loop or a big-number multiplication, must poll the flag or the limit overshoots by minutes.",
    k: ["Wall-clock limits vs deterministic step limits: wall-clock matches what the client pays, while step limits give identical behavior on every machine and are essential for regression testing.", "Cooperative checks vs hard kill: cooperative checks return a valid unknown and leave state clean, while a hard kill is reliable but loses all partial results and incremental state."],
    p: ["A long operation with no check point exceeds the limit by an unbounded amount.", "Clean-up after hitting a limit leaves the solver in a state that the next incremental call mishandles."],
    v: "Set a one-second limit on a problem that needs minutes and on one dominated by a theory loop. Both return unknown within a small margin of one second, and the solver then answers a follow-up easy query correctly.",
    dep: ["memory-manager", "cdcl-loop"]
  },
  "push-pop-scopes": {
    s: "Lets a client open a scope, add assertions, check, and then discard everything added since, restoring the earlier state in constant or near-constant time per scope.",
    d: "A push records the current size of the assertion stack, symbol table and each theory solver's state. A pop restores them. Clauses learned inside a scope that depend on its assertions must be dropped or guarded. One implementation guards every scoped clause with an activation literal and pops by permanently disabling it; another truly backtracks, discarding learned clauses derived from popped assertions. The difficulty is theory state: every solver must be able to undo to an arbitrary earlier point cheaply and consistently.",
    k: ["Real scoped state vs activation-literal emulation: real scoping gives the cleanest semantics and memory behavior, while emulation reuses the SAT core's existing assumption machinery with some clause-count growth.", "Dropping all learned clauses at pop vs tracking dependencies: dropping is simple and loses useful learning, while tracking dependencies keeps independent clauses at the cost of bookkeeping."],
    p: ["A learned clause that depended on a popped assertion survives and makes later queries wrongly unsat.", "Preprocessing that eliminated a variable inside a scope is not undone by the pop."],
    v: "Run a long push, assert, check, pop sequence repeated thousands of times, comparing each result to a fresh solver with the same live assertions. All answers match and memory stays flat.",
    dep: ["backtrackable-theory-state", "learned-clause-retention", "activation-literals"]
  },
  "assumptions-interface": {
    s: "Lets a client solve under a temporary set of literals taken as true for one call only, and learn which of them caused failure if the answer is unsat.",
    d: "Assumptions are placed as the first decisions of the search, before any heuristic choice. If a conflict forces an assumption false, the solver stops and reports the subset of assumptions in that conflict's derivation. Nothing about the assumptions persists, so the next call can use different ones while keeping every learned clause. This is the primary incremental interface for SAT-based tools such as planners and bounded checkers. The challenge is interaction with preprocessing: assumed variables must not be eliminated, and with restarts, which must replay the assumption levels cheaply.",
    k: ["Assumptions as initial decisions vs adding unit clauses and removing them: decisions keep all learning valid for later calls, while units are simpler but force restoring state afterward.", "Freezing assumed variables vs allowing elimination with reconstruction: freezing is simple and safe, while elimination is faster for the rest but needs care to stay correct on later calls."],
    p: ["Using a variable as an assumption after it has been eliminated gives incorrect answers or crashes.", "Assumption levels replayed after every restart cost a lot when there are many thousands of assumptions."],
    v: "Solve the same formula under many different assumption sets and compare each answer to a fresh solver with the assumptions asserted as units. All answers match, and each failed call returns a core that is itself unsat.",
    dep: ["cdcl-loop", "conflict-analysis", "bounded-variable-elimination"]
  },
  "activation-literals": {
    s: "Fresh Boolean variables added to a group of clauses so that the group can be switched on by assuming the variable and switched off later by assuming its negation or asserting it permanently.",
    d: "To make a clause removable, the client adds the clause with an extra literal, the negated activation variable, so the clause is satisfied unless the variable is assumed true. To retract, it asserts the variable false; the clauses become satisfied forever and can be garbage-collected by simplification. This gives push and pop semantics on top of a solver with no removal operation, and it labels assertions for unsat cores. The cost is that retired clauses linger until simplification removes them, and every enabled clause carries an extra literal that propagation must visit.",
    k: ["Activation literals vs true clause deletion: activation literals work with any solver that supports assumptions, while true deletion gives cleaner memory but needs support from the core.", "One literal per clause vs one per group: per-clause gives fine-grained cores, while per-group is cheaper but yields coarser cores."],
    p: ["Never simplifying retired clauses lets the database grow unbounded in a long session.", "Reusing an activation variable after retiring it re-enables clauses a client believed were gone."],
    v: "Add and retire a thousand clause groups in a loop. Answers match a fresh solver at each step, and after a simplification pass the clause count returns near its initial size.",
    dep: ["assumptions-interface", "clause-arena"]
  },
  "trail-reuse": {
    s: "Keeps the part of the current assignment that is still valid when the next call starts, instead of backtracking to level zero, so related queries skip re-deriving the same propagations.",
    d: "After a call finishes, the trail contains decisions and implications. When the next call's assumptions match a prefix of the previous ones, the solver backtracks only to the first differing level and resumes from there. This saves the re-propagation of large formulas, which can dominate when each query is tiny relative to the base problem. It also interacts with restarts, which can partially backtrack to reuse similar prefixes. The difficulty is correctness after added clauses: a new clause may be falsified or unit under the kept assignment and must be handled immediately.",
    k: ["Keeping the trail vs restarting from level zero: keeping saves repeated work on small deltas, while resetting is simpler and avoids stale-state bugs.", "Reusing across different assumptions vs only identical ones: partial reuse helps more in practice, but it demands careful detection of the longest shared prefix."],
    p: ["A newly added clause that is falsified by the kept trail is missed, so the solver reports sat for a formula that is unsat.", "Kept decision levels that include assumption levels from a failed call are replayed incorrectly."],
    v: "Run a sequence of incremental calls with trail reuse on and off over the same problems. Every answer matches, and propagation counts with reuse are measurably lower on the sequence of small changes.",
    dep: ["trail-and-assignment", "backjumping", "assumptions-interface"]
  },
  "learned-clause-retention": {
    s: "Policy for which learned clauses to keep between calls, since clauses learned in one query often prune later ones but can also bloat the database and slow propagation.",
    d: "Learned clauses are consequences of the permanent clauses, so they stay valid when only assumptions change. Clauses that depend on removable assertions must be dropped at pop or be guarded. Between calls, the solver applies its usual deletion policy, but may also treat the first call differently because the next query's relevant clauses are unknown. The hard part is the trade-off: aggressive retention speeds related queries but makes unrelated ones slower, and thousands of queries accumulate clauses that the usual per-run scoring was not tuned for.",
    k: ["Keep everything permanent vs score-based pruning: keeping all is simplest and best for near-identical queries, while pruning bounds memory in long sessions.", "Protecting clauses used recently vs clauses of low glue: recency favors the current workload, and glue favors general usefulness."],
    p: ["A clause that depends on a retracted assertion is retained and silently corrupts later answers.", "Unbounded retention across a million queries makes each propagation slower until the session stalls."],
    v: "Run a long incremental session and sample memory and per-query time. Memory stays within a configured bound, per-query time does not trend upward, and answers match fresh solves on a sampled subset.",
    dep: ["clause-deletion", "learned-clause-database", "push-pop-scopes"]
  },
  "backtrackable-theory-state": {
    s: "The ability of each theory solver to undo its recent work to an earlier decision level or scope, so the Boolean search can backjump without recomputing the theory from scratch.",
    d: "Each solver keeps a trail of its own changes: merged equivalence classes, tightened bounds, added rows. On a backjump the Boolean engine tells each solver the level to return to, and each reverts its structures to match. Designs differ: undo logs record inverse operations, persistent data structures share history, and some solvers keep only conservative state, such as bounds, and accept a changed basis after backtracking. It is hard because undo must be cheap, correct for every internal structure, and consistent across solvers at once.",
    k: ["Undo logs vs persistent data structures: undo logs are compact and fast in the forward direction, while persistence gives free backtracking and costs overhead on every operation.", "Exact restoration vs conservative restoration: exact is simpler to reason about, while conservative, such as keeping a valid but different basis, is far cheaper and enough for correctness."],
    p: ["A structure that is not logged keeps stale facts after backjumping and produces conflicts that are not real.", "Backjumping many levels at once triggers a quadratic replay of the undo log."],
    v: "Run randomized sequences of assert, propagate, backjump on each theory solver against a reference that rebuilds from scratch at the target level. The two agree on every consistency answer and every explanation.",
    dep: ["theory-solver-interface", "trail-and-assignment"]
  },
  "soundness-and-trust": {
    s: "Every unsat answer must be right, because systems built on the solver treat it as a proof. The decision is how much of the solver is trusted and how much is independently checked.",
    d: "A solver is large, aggressive and written for speed, so bugs are expected. Defense comes in layers: independent model evaluation for sat answers, proof logging with an independent checker for unsat answers, self-checking assertions in debug builds, and large-scale differential testing against other solvers. Each unverified optimization, such as an inprocessing technique, enlarges the code that is trusted. It is a cross-cutting decision because every component that rewrites formulas must also emit what the checker needs, and retrofitting that is expensive.",
    k: ["Verified small checker vs trusted large solver: checking certificates keeps the trusted base tiny, at the cost of proof size and write time.", "Fast and unchecked vs slow and certified: unchecked runs win benchmarks, while certified runs are the only ones usable for safety-critical claims.", "Checking every answer vs sampling: checking all is slow, sampling is cheap but leaves bugs."],
    p: ["A technique added without a proof step is correct on all tests but invalidates every proof that uses it.", "Differential testing against a solver sharing the same parser misses parsing bugs."],
    v: "Run a corpus of known sat and unsat problems with model evaluation and proof checking turned on. Every answer is confirmed independently, and seeded faults in a few components are each caught by one of the checks.",
    dep: ["proof-logging", "proof-checker", "model-evaluator", "fuzzing-harness"]
  },
  "determinism-and-reproducibility": {
    s: "Whether the same input and options always yield the same run. The decision is how much to give up, in speed and in parallelism, to make a bug report or benchmark result repeatable.",
    d: "Sequential single-thread runs can be fully deterministic if seeds are fixed and nothing depends on timing or addresses; hash tables keyed by pointer values, uninitialized memory and time-based limits break that. Parallel solving is nondeterministic by default because the order in which clauses are shared depends on thread scheduling; deterministic modes exist but synchronize at barriers and slow down. Reproducibility matters since the search is chaotic: any small change, including adding a harmless option, changes the run.",
    k: ["Deterministic limits vs time limits: deterministic limits reproduce exactly, while time limits reflect the real cost for a user.", "Deterministic parallel mode vs free-running mode: deterministic is debuggable and costs speed at the synchronization points.", "Seeded randomness vs none: seeded randomness diversifies runs but must be recorded."],
    p: ["Iterating a hash table in pointer order makes the run depend on memory addresses.", "A benchmark compared across machines using time-based limits reports differences that are only timing."],
    v: "Run the same benchmark twice, and on two machines, with the same seed and step limits. Statistics output is byte-identical, including conflict counts, and a bug found on one machine reproduces on the other.",
    dep: ["seeded-randomness", "timeouts-and-limits", "portfolio-solving"]
  },
  "incrementality-contract": {
    s: "What the solver promises to remember across calls and what clients may assume. The decision shapes preprocessing, memory and the API, since many techniques are unsafe when later calls may change assumptions.",
    d: "Incremental use means preprocessing cannot freely eliminate variables the client may mention later; techniques that are valid once are unsound across calls unless variables are frozen or the effect is reconstructed. The contract names which operations are legal between calls, which state is kept, and how scopes behave. Different clients need different contracts: a bounded checker adds clauses forever, an interactive verifier pushes and pops constantly. Declaring a contract early avoids a split between a fast one-shot mode and a slow incremental mode.",
    k: ["Incremental by default vs a separate incremental mode: default incrementality costs preprocessing power on every run, while a mode lets one-shot runs use every simplification.", "Freezing variables explicitly vs inferring future use: explicit freezing is exact and burdens the client, while inference is convenient and often wrong."],
    p: ["Preprocessing applied once, then more clauses added over eliminated variables, gives wrong answers.", "Incremental mode that is rarely tested ages and fails on features added only for one-shot runs."],
    v: "Run the full regression suite in both one-shot and incremental sessions, splitting each problem into pieces added over several calls. Final answers and models agree with the one-shot runs for every problem.",
    dep: ["assumptions-interface", "push-pop-scopes", "bounded-variable-elimination"]
  },
  "resource-limits": {
    s: "How the solver bounds memory, time and output size across all components, so that a runaway component yields an unknown answer instead of an exhausted machine.",
    d: "Memory grows with the clause database, the term graph, proof output and theory structures such as rational matrices whose entries can blow up. A single budget shared by all components makes it possible to react, for example by deleting clauses first. Time limits must be observed in code that has no natural check point. The decision to design for limits up front shows in every long loop having a polling point and every allocator reporting to one accountant.",
    k: ["One global memory accountant vs per-component limits: global gives the best total behavior, while per-component limits are simpler and let one component starve the others.", "Graceful degradation (delete, simplify) vs immediate unknown: degradation lets a run continue and costs complexity, while immediate unknown is simple but loses answers that were within reach."],
    p: ["Number sizes in an arithmetic solver grow without bound and exhaust memory long before time runs out.", "Proof files filling the disk stop the solver partway and leave an unusable certificate."],
    v: "Run adversarial inputs under a set memory cap: huge clause sets, rational blow-up, and long proofs. Each returns unknown or a clear error before the cap, and the solver never exceeds it by more than a small margin.",
    dep: ["memory-manager", "timeouts-and-limits"]
  },
  "decidability-and-completeness": {
    s: "Which fragments the solver always answers, and where it may say unknown. The decision is where to draw that line and how to report it honestly.",
    d: "Propositional logic and many quantifier-free theories are decidable; with quantifiers, nonlinear integer arithmetic or strings with certain operations, no complete procedure exists. The solver is complete in some fragments, a semi-decision procedure in others, and heuristic elsewhere. The architecture must keep the difference visible: an unknown from an incomplete quantifier engine is not a statement that the formula is satisfiable. Completeness also depends on limits and on options such as disabling a rewrite, so the claim attaches to a configuration.",
    k: ["Complete engine in a restricted fragment vs incomplete engine on everything: completeness gives guaranteed answers where it applies, while generality accepts more inputs and sometimes gives up.", "Reporting unknown vs best-guess sat: unknown is honest, and a guess breaks the trust that clients place in answers."],
    p: ["Returning sat from a quantifier procedure that only checked instantiated instances is wrong when the instances do not cover the domain.", "A client reads unknown as unsatisfiable and drops a feasible solution."],
    v: "Run decidable-fragment benchmarks to completion with no unknown answers, and undecidable ones with limits. The solver never answers sat or unsat incorrectly, and each unknown carries a reason such as incomplete quantifier handling.",
    dep: ["logic-based-selection", "model-based-instantiation", "nonlinear-arithmetic"]
  },
  "heavy-tailed-runtimes": {
    s: "Solve times for similar inputs, or for the same input with different seeds, range from milliseconds to hours. The decision is how to spend effort given that the distribution has a very long tail.",
    d: "Because early choices commit the search to a region it may not escape, a run can get stuck while another configuration finishes quickly. This explains restarts, random seeds, portfolios and cube splitting: they all sample or shorten the tail. It also dictates how results are measured, since averages are dominated by a few extreme runs; percentiles, solved counts under a time cap and penalized averages are used. The cross-cutting consequence is that no component can be judged by a single run on a single instance.",
    k: ["Restart often vs run long: frequent restarts cut off bad early commitments but throw away progress, while long runs let learning pay off.", "Evaluating on a few hard instances vs a large mixed benchmark: few instances are cheap and noisy, while a large mix is expensive but shows real change."],
    p: ["A tuning change judged on one lucky seed is reported as an improvement and reverses on the next.", "Benchmark sets dominated by easy instances hide regressions on the hard ones that matter."],
    v: "For a configuration change, run several hundred instances with several seeds each and compare solved counts and penalized times with confidence intervals. The reported improvement exceeds the seed-to-seed variation.",
    dep: ["restart-policy", "portfolio-solving", "benchmark-infrastructure"]
  },
});
