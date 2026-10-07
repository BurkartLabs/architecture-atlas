// Details for the SAT & SMT solver plate, part 4: heuristics, propagation and storage, foundation.
ATLAS.details("sat-smt-solver", {
  "activity-based-branching": {
    s: "Chooses the next decision variable by an activity score that rises for variables involved in recent conflicts and decays over time, so search focuses where trouble is occurring.",
    d: "Each variable carries a score. During conflict analysis, every variable seen is bumped by an increment, and the increment itself grows geometrically, which is equivalent to decaying all older scores. Variables live in a binary heap ordered by score, and the heap supplies the highest-scoring unassigned variable at each decision. Variants bump by a graph measure, learning rate or conflict recency. The heap must be updated on every bump and every unassignment, and rescaling is needed when scores overflow. It is a heuristic with no correctness role but dominates performance.",
    k: ["Exponential decay of scores vs periodic halving: exponential is smooth and requires rescaling, while halving is simple and coarse.", "Heap-ordered selection vs sorting occasionally: a heap keeps selection exact at logarithmic cost per bump, while occasional sorting is cheaper and stale."],
    p: ["Score overflow without rescaling turns all variables into infinities that compare equal.", "A variable missing from the heap after backjumping is never chosen as a decision."],
    v: "Instrument decisions and confirm each chosen variable has the maximum score among unassigned ones in a checking build. Scores rescale without ordering changes, and the heap contains every unassigned variable at every decision.",
    dep: ["conflict-analysis", "backjumping", "phase-saving"]
  },
  "move-to-front-queue": {
    s: "A decision order kept as a linked list in which variables seen in recent conflicts move to the front, a cheap alternative to numeric activity scores.",
    d: "Variables are on a doubly linked list ordered by when they were last bumped, with a pointer to the first unassigned one so selection is constant time on average. Bumping moves each analyzed variable to the front, sorted by their earlier order to keep structure. After backjumping, the search pointer is moved forward to the earliest unassigned element that was freed. It is simpler and faster per operation than a heap and tracks recency sharply, which suits bursts of rapid restarts. It forgets older history that scores would keep.",
    k: ["Queue vs heap: the queue has constant-time operations and strictly follows recency, while the heap keeps a smoother long-term memory.", "Used in all phases vs alongside scores in different modes: one scheme is simple, while using both gives each its strength."],
    p: ["A stale search pointer after backjumping skips free variables near the front.", "Bumping in an arbitrary order loses relative recency among variables of the same conflict."],
    v: "In a checking build, confirm that the pointer always refers to the first unassigned variable in queue order and that after any backjump no earlier variable is unassigned. Decisions match a slow reference scan on a sample.",
    dep: ["conflict-analysis", "backjumping"]
  },
  "phase-saving": {
    s: "When a variable must be decided, it is set to the value it last held, so restarts and backjumps resume near the previous partial solution instead of discarding it.",
    d: "On each unassignment, the solver stores the variable's last value in a phase array. At the next decision on that variable, it uses the saved phase. This lets the search recreate an assignment quickly after a restart and makes it locally explore a region around a near-solution. For satisfiable instances it often approaches a model steadily, and for unsatisfiable instances it matters less. The initial phase, often false or chosen by a polarity heuristic, matters on first visits. Combined with rephasing, it avoids staying forever in one region.",
    k: ["Saved phase vs fixed polarity: saved phase keeps progress through restarts and may trap the search in one region, while fixed is stable and ignores progress.", "Best-seen phases vs most recent: the best-seen assignment is a stronger guide toward a model and costs extra storage and bookkeeping."],
    p: ["Saving phases from a trail that was truncated by a conflict stores values that were never a consistent assignment.", "Starting each run with the same initial phase makes restarts lack diversity."],
    v: "Compare propagations and conflicts to solve satisfiable benchmarks with saving on and off. The saved setting solves more of them within the limit, and after a restart the first assignments reproduce the previous trail's values.",
    dep: ["trail-and-assignment", "target-phases-rephasing"]
  },
  "target-phases-rephasing": {
    s: "Tracks the longest consistent assignment reached without conflict and periodically resets the saved phases to it, to the opposite, or to random values, to escape local traps.",
    d: "The solver records the largest conflict-free trail seen so far as a target assignment, and uses it to guide decisions in a mode where it prefers the target's values. At intervals it rephases: set saved phases to the best assignment, to its inverse, to the original input polarity, or to random flips. Some variants run a local search from the current phases and use its best assignment. These moves add diversification to the single-trail search and help on satisfiable problems notably. Intervals follow an increasing schedule.",
    k: ["Target phases vs plain saved phases: targets steer toward the best partial model and add state, while plain is simple and drifts.", "Local-search rephasing vs random flipping: local search finds better assignments at higher cost, while random flipping is free and uninformed."],
    p: ["Rephasing too frequently destroys the progress phase saving was meant to preserve.", "A target assignment from before a unit was learned conflicts with it and misleads decisions."],
    v: "Run satisfiable benchmark families with rephasing on and off. The solved count rises with it, and the log shows the target trail size improving between rephase events.",
    dep: ["phase-saving", "mode-switching", "trail-and-assignment"]
  },
  "restart-policy": {
    s: "Decides when to abandon the current partial assignment and start over from level zero, keeping learned clauses, to escape unproductive regions of the search.",
    d: "Schedules include the Luby sequence, geometric growth, and dynamic policies that restart when recent clause quality is worse than the long-term average. Restart intervals are measured in conflicts. Because learned clauses and saved phases survive, a restart loses little and reorders decisions with updated scores. Restarts reduce the heavy tail of runtimes. Too frequent restarts prevent deep exploration needed for satisfiable instances, and too rare make unsatisfiable proofs miss the changed scores. Some solvers postpone restarts when the trail is unusually long and might be near a model.",
    k: ["Fixed sequence vs dynamic quality-based: fixed is predictable and reproducible, while dynamic adapts to the instance and varies with its history.", "Restart on every trigger vs restart with reuse of the common trail prefix: reuse saves rebuilding work and adds bookkeeping."],
    p: ["Restarting while assumptions are being replayed wastes time reasserting thousands of assumptions.", "A dynamic trigger that fires on noise restarts constantly and prevents any deep search."],
    v: "Record restart intervals and the solved count on both satisfiable and unsatisfiable benchmark sets for several policies. The chosen policy solves more under the time limit than no restarts and the sequence matches its specification.",
    dep: ["cdcl-loop", "phase-saving", "learned-clause-database"]
  },
  "mode-switching": {
    s: "Alternates between a stable mode with rare restarts and slowly changing heuristics, aimed at finding models, and a focused mode with frequent restarts, aimed at proving unsat.",
    d: "In stable mode, restarts follow a slow schedule, target phases guide decisions, and scores decay slowly. In focused mode, restarts are frequent, the move-to-front queue or fast-decaying scores react to recent conflicts, and phases are plain saved ones. The solver switches by a growing budget of conflicts or ticks, so neither mode dominates. This lets one binary perform well on both satisfiable and unsatisfiable inputs without knowing which it faces. The cost is that each mode only gets part of the time, and state such as phases must carry across.",
    k: ["Alternating modes in one solver vs a portfolio of two: alternation shares learned clauses automatically and halves each mode's time, while a portfolio uses more cores and memory.", "Switching by conflicts vs by propagations: conflicts are simple, while propagations measure actual effort more fairly."],
    p: ["Heuristic state from one mode left unreset misguides the other.", "Time budgets that do not grow starve long proofs by switching at fixed short intervals."],
    v: "Run satisfiable-only and unsatisfiable-only benchmark sets with mode switching versus each mode alone. Switching approaches the better single mode on each and beats the worse one, with the mode log showing alternation at the growing budgets.",
    dep: ["restart-policy", "move-to-front-queue", "target-phases-rephasing", "activity-based-branching"]
  },
  "random-decisions": {
    s: "Occasionally branches on a random variable or random phase instead of following the heuristic, adding diversity and a source of different runs from different seeds.",
    d: "A small fraction of decisions, often one percent or less, pick a random unassigned variable, or flip the saved phase. Random seeds also permute initial variable order and scores. The effect is a measurable improvement on instances where the heuristic is trapped, and it makes performance vary across seeds, which is the basis for portfolio solving. Random choices must come from a seeded generator the user can set, with state saved so replay is exact. Overuse destroys the benefit of learned activity.",
    k: ["Random decisions in the search vs only a random initial order: in-search diversifies throughout and costs some determinism of structure, while initial only is cheaper and weaker.", "Per-worker different seeds vs sharing: different seeds give diversity in a portfolio, and sharing makes runs identical."],
    p: ["Using the system clock as a seed makes a failure unreproducible.", "Random picks inside an inner loop make the cost per decision unpredictable."],
    v: "Run the same instance with twenty seeds and plot the spread of solving time. The spread is nonzero, repeating a seed reproduces the run exactly, and the statistics report the seed used.",
    dep: ["seeded-randomness", "activity-based-branching"]
  },
  "lookahead-branching": {
    s: "Chooses a decision by tentatively assigning candidate variables, propagating, and scoring how much each reduces the formula, then picking the best, which is slower per decision and builds better search trees.",
    d: "For each candidate the solver propagates both polarities and measures the reduction in the clause set, or the number of newly shortened clauses, then combines both scores. Failed literals discovered along the way become units immediately. Lookahead solvers do few conflicts but make strong decisions, and are best on small hard combinatorial problems. It is the engine for the cubing phase in cube-and-conquer, because its choices split the problem into balanced pieces. On large structured industrial inputs the per-decision cost is too high to compete with learning-based search.",
    k: ["Lookahead vs conflict-driven search: lookahead excels on small hard random or combinatorial instances, while conflict-driven wins on large structured ones.", "Full candidate set vs a preselected subset: full is thorough and expensive, while a subset keeps cost per decision in check."],
    p: ["Evaluating all variables at every node makes the cost per node unacceptable on large formulas.", "Scores computed without a consistent measure make decisions that unbalance the cubes."],
    v: "Compare decision-tree sizes and cube balance for lookahead against activity-based choice on a hard combinatorial benchmark. Lookahead yields fewer nodes and cubes of similar difficulty, and any failed literal found is a valid unit.",
    dep: ["binary-implication-lists", "trail-and-assignment", "failed-literal-probing"]
  },
  "two-watched-literals": {
    s: "Each clause of length at least three is watched on two of its literals, so assigning a literal visits only the clauses watching it and most clauses are never touched on backtracking.",
    d: "A clause is only able to become unit or false when all but one of its literals are false, so watching two non-false literals is enough to detect that. When a watched literal becomes false, the solver scans the clause for another non-false literal to watch; if none exists besides the other watch, the clause is unit or conflicting. On backtracking, nothing needs to be undone, because the watch invariant holds on any prefix of the trail. This makes propagation cost proportional to the clauses that matter, and it is the main reason solvers scale to millions of clauses.",
    k: ["Two watches vs counting satisfied or false literals: watches need no undo and visit few clauses, while counters give exact status and cost updates on every assignment and backtrack.", "Scanning from the last position vs from the start: remembering the position makes long clauses linear overall and uses extra per-clause storage."],
    p: ["A watch placed on a false literal after backjump misses unit propagations silently.", "Always scanning clauses from the beginning makes long clauses quadratic."],
    v: "In a checking build, after propagation reaches fixpoint, scan every clause: none is unit or falsified unnoticed, and each watch is on a non-false literal or its clause is satisfied. A brute-force propagator finds identical implications.",
    dep: ["clause-arena", "trail-and-assignment", "propagation-queue"]
  },
  "blocking-literals": {
    s: "Each watch entry stores one extra literal from the clause; if that literal is true, the clause is satisfied and the solver skips fetching the clause from memory.",
    d: "A watch list entry holds a reference to the clause and a blocker literal, often the other watched literal or any true literal seen last time. During propagation, the solver first checks the blocker's value, which is already in cache next to the entry. When true, the clause is skipped, saving a cache miss to read the clause itself. Since most visited clauses are already satisfied, this avoids the majority of memory accesses and gives a large constant-factor speedup. The blocker is updated when a different true literal is found during scanning.",
    k: ["Storing a blocker vs only the clause reference: a blocker costs extra bytes per watch and avoids most clause fetches, while omitting it keeps lists smaller and slower.", "Updating the blocker on every visit vs only on change: always updating is simple and writes more, while only on change reduces stores."],
    p: ["A blocker that is not actually in the clause produces wrongly skipped clauses and misses propagations.", "Stale blockers after clause strengthening point to deleted literals."],
    v: "Check in a debug build that every blocker occurs in its clause. Run propagation with and without blockers on a benchmark: identical implications and conflicts, with fewer clause fetches and less time with blockers.",
    dep: ["two-watched-literals", "clause-arena"]
  },
  "binary-implication-lists": {
    s: "Binary clauses are stored directly in per-literal lists of implied literals, with no separate clause object, making their propagation the cheapest in the solver.",
    d: "A binary clause a or b means not a implies b and not b implies a, so each literal has a list of literals it forces. Propagating a literal walks its list: assign each implied literal or report a conflict if one is false. There is no clause lookup and no watch update. The lists also form the implication graph used for equivalence detection, probing and clause minimization. Binary clauses can be numerous, especially after encoding of at-most-one constraints, and reasons for them can be stored as the single other literal rather than a clause reference.",
    k: ["Implicit binary lists vs ordinary clauses: implicit lists are faster and smaller and need separate handling in analysis, while ordinary clauses keep one code path.", "Keeping learned and original binaries together vs separately: separate lists allow deleting learned ones, while together is simpler."],
    p: ["Duplicate binaries inflate lists and slow every propagation of that literal.", "Reasons stored as bare literals must be turned into clauses for proof logging and for theory use."],
    v: "Compare against a version with explicit binary clauses on a benchmark: identical implications, fewer cache misses, higher propagation rate. Removing duplicates leaves list sizes equal to the count of distinct binaries.",
    dep: ["trail-and-assignment", "reason-and-level-store"]
  },
  "trail-and-assignment": {
    s: "A stack of assigned literals in order, with a per-variable value array and a position index, which is the solver's single source of truth about the current partial assignment.",
    d: "Assigning a literal writes its value, level and reason, and pushes it on the trail; the propagation queue is just a pointer into the trail marking the next literal to process. Decision levels are indices into the trail where each level begins. Backjumping pops entries down to a level and resets their values. Value lookups are the most frequent operation in the solver, so the value array is compact with one byte per literal and is indexed by literal rather than variable. Everything else, from analysis to heuristics, reads the trail.",
    k: ["Value array indexed by literal vs by variable: by literal gives one lookup without sign handling, while by variable halves memory and adds a computation.", "Trail pointer as queue vs separate queue: the pointer needs no extra memory, while a separate queue can implement different propagation orders."],
    p: ["Resetting values on backjump but not the saved reasons leaves stale references that analysis later follows.", "A trail not sized for the variable count overflows when variables are added in incremental use."],
    v: "After every propagation and backjump in a checking build, verify the value array agrees with the trail for every variable and that levels are non-decreasing along the trail, except where chronological backtracking is on.",
    dep: ["memory-manager"]
  },
  "reason-and-level-store": {
    s: "Per-variable records of the decision level at which a variable was assigned and the clause or theory fact that forced it, which conflict analysis needs to walk the implication graph.",
    d: "For every implied variable, the solver keeps a reference to the reason: a clause in the arena, a literal for a binary reason, or a theory explanation handle. Decisions have no reason. Level and reason are written at assignment time, close to the value, so they share cache lines. For theory propagations, the reason may be generated lazily on the first request. Analysis reads these for every literal it resolves, and clause deletion must consult them to avoid freeing a clause that is a reason.",
    k: ["Lazy theory reasons vs eager: lazy saves explanation work for propagations that never appear in conflicts, while eager is simpler and wasteful.", "Packing level and reason in one record vs separate arrays: one record has better locality, and separate arrays are simpler to resize."],
    p: ["A reason pointer left from an earlier assignment is read for a variable that is now a decision.", "A lazily generated theory reason that depends on state since changed is no longer valid."],
    v: "In a checking build, for every implied variable verify its reason clause is unit under the assignment prefix at that level, with the implied literal true and the others false at earlier positions on the trail.",
    dep: ["trail-and-assignment", "clause-arena"]
  },
  "clause-arena": {
    s: "Contiguous memory in which clauses are stored back to back with a small header, referenced by offsets, so propagation reads sequential memory and the whole database can be compacted.",
    d: "Each clause is a header, containing size, flags, score and activity, followed by its literals. Clauses are referenced by a 32-bit offset into the arena rather than a pointer, halving the size of watch entries. When many clauses are deleted, a garbage collection pass copies live ones into a new arena and relocates every reference: watches, reasons and the clause lists. Layout and compaction matter because propagation is limited by memory latency, and a clause set that fits in cache can run several times faster.",
    k: ["Offsets in an arena vs individually allocated objects: offsets give compact references and locality and require a relocation pass, while objects are simple and scatter memory.", "Compacting often vs rarely: often keeps memory dense at a cost of copying, while rarely lets waste accumulate."],
    p: ["A reference missed during relocation points into freed memory and crashes much later.", "Growing the arena by reallocation invalidates any pointers taken into it."],
    v: "Force garbage collection after every reduction in a test build and compare the answer and statistics with a normal run. All references still resolve, there are no relocation failures, and memory in use equals the sum of live clause sizes.",
    dep: ["memory-manager"]
  },
  "propagation-queue": {
    s: "The ordering in which newly assigned literals are processed, which determines which implications and conflicts are found first and with what reasons.",
    d: "Usually a first-in first-out scan of the trail: each assigned literal is propagated in the order it was assigned, binary implications first for speed, then longer clauses. A conflict found stops propagation immediately, and the clause that failed becomes the starting point for analysis. The order affects the shape of the implication graph and therefore the learned clause, so even a harmless-looking change in order changes the run. Theory propagation is called when the Boolean queue empties, then may add more literals and restart the queue.",
    k: ["Binary clauses before long clauses vs a single mixed order: binaries first finds cheap conflicts early and gives shorter implication chains, while mixed is simpler.", "Propagating theories at each fixpoint vs after each literal: each fixpoint reduces calls and delays conflicts, while each literal catches them early and costs more."],
    p: ["Continuing to propagate after finding a conflict wastes time and may overwrite the conflict state.", "A queue pointer not reset on backjump skips literals on the next propagation."],
    v: "Check that propagation stops at the first conflict, that after a fixpoint the queue pointer equals the trail size, and that after backjumping the pointer equals the new trail size. Results match a reference propagator on random formulas.",
    dep: ["trail-and-assignment", "two-watched-literals", "binary-implication-lists"]
  },
  "native-constraint-propagators": {
    s: "Dedicated propagators for cardinality, pseudo-Boolean and parity constraints, which keep their own state, propagate directly and produce reasons without being expanded into clauses.",
    d: "Each constraint registers watches on its literals and maintains a counter or slack. When a literal is assigned, the propagator updates its state and, if the bound is tight, forces the remaining literals with an explanation made up of the assigned ones, created lazily as a clause only when asked for. This saves memory against clause encodings and gives stronger propagation. They must integrate with backtracking, so state changes are undone with the trail, and with clause deletion and proof logging, where reasons need a format the checker accepts.",
    k: ["Native propagator vs encoding: native is compact and powerful for large constraints and requires custom analysis and proofs, while encodings reuse the whole core.", "Counter-based vs watch-based propagation: counters are simple and update on every literal, while watching reduces work on large constraints."],
    p: ["State not undone on backjump gives stale counters and unsound propagations.", "A reason clause generated lazily after later assignments includes literals assigned after the propagation."],
    v: "Solve constraint-heavy benchmarks with native propagation and with clause encoding. The answers agree, reasons are verified implied, memory is lower with native, and counters equal a recount from the trail after every backjump.",
    dep: ["trail-and-assignment", "reason-and-level-store", "two-watched-literals"]
  },
  "hash-consed-terms": {
    s: "A term graph in which every distinct term exists once, found through a hash table, so equality of terms is pointer comparison and shared subterms are never duplicated.",
    d: "Terms are built only through a factory that looks up an existing node with the same operator and children and returns it, or creates and registers a new one. Each node has a unique integer id used as a key everywhere, from caches to equivalence classes. Reference counts or generation-based garbage collection reclaim nodes no longer reachable. Sharing turns trees with exponential size into compact graphs, and every algorithm must therefore avoid treating the graph as a tree, using caches in traversals. The factory is also where sort checking happens.",
    k: ["Maximal sharing vs plain trees: sharing gives constant-time equality and compact memory and needs a global table and garbage collection, while trees are simple and blow up.", "Reference counting vs scope-based arena: counting reclaims memory during long sessions and costs updates, while an arena frees everything at once and grows meanwhile."],
    p: ["Traversing a shared graph without a visited cache repeats work exponentially.", "A hash table not sized for hundreds of millions of terms makes building the input the bottleneck."],
    v: "Build the same term through many paths and check for a single node with one id. Build a formula whose tree size is exponential and confirm memory stays proportional to distinct nodes and that equality tests take constant time.",
    dep: ["memory-manager"]
  },
  "exact-numerals": {
    s: "Arbitrary-precision integers and rationals used throughout the SMT layer, so arithmetic reasoning is exact and models never suffer from overflow or rounding.",
    d: "Numbers are stored in a small inline form when they fit a machine word and fall back to a heap-allocated big-number representation when they do not, so the common case is fast. Rationals are kept normalized with a positive denominator and reduced by a greatest common divisor. Arithmetic solvers pivot rows many times, and coefficient sizes can grow quickly, which makes big-number speed visible in total runtime. Overflow checks on small-case operations must be exact. Models containing algebraic numbers use a further representation on top.",
    k: ["Small-value fast path vs always big numbers: the fast path makes common arithmetic cost almost nothing and adds a branch to every operation, while always big is uniform and slower.", "Exact rationals vs floating point with checking: exact avoids any doubt and can be slow, while floating point is quick and needs verification."],
    p: ["An overflow check missed in the fast path silently wraps and produces a wrong result.", "Unreduced rationals grow in size and slow every later operation."],
    v: "Compare every operation against a reference big-number library on random and boundary inputs, including values at the word-size edge. Results match exactly, and a long pivoting run reports sizes of coefficients in the statistics.",
    dep: ["memory-manager"]
  },
  "memory-manager": {
    s: "Allocation and accounting for the solver's data: arenas for clauses, pools for terms, and a counter of total bytes so limits can be enforced and growth observed.",
    d: "General-purpose allocation is too slow and fragments memory for millions of small objects, so each data structure uses its own region or pool with compaction. All regions report to a single accountant that knows total use and can trigger responses, such as deleting learned clauses, when a limit nears. Allocation failures are caught at defined places so the solver returns unknown and leaves a consistent state rather than aborting. Memory use often decides whether a problem is solvable at all, since the largest industrial inputs use tens of gigabytes.",
    k: ["Custom pools vs the system allocator: pools are faster and denser and need maintenance, while the system allocator is simple and fragments.", "Aborting on allocation failure vs recovering: aborting is simple, while recovering yields an unknown answer and demands that every structure can be left consistent."],
    p: ["Fragmentation after many clause deletions inflates resident memory far beyond live data.", "An allocation failure inside a half-updated structure leaves state that the next call misreads."],
    v: "Run a large input with a memory limit slightly below its need. The solver returns unknown without crashing, the accountant's total matches the process's resident memory within a small margin, and a following small query is answered correctly.",
    dep: []
  },
  "seeded-randomness": {
    s: "A single pseudo-random generator with a user-settable seed from which every random choice in the solver draws, so any run can be reproduced exactly.",
    d: "The generator is a small, fast algorithm with explicit state, seeded from an option. Heuristics that use randomness, from initial variable order to random decisions and random rephasing, all take values from it in a fixed order, and parallel workers derive their own streams from the base seed and a worker index. The seed is printed with each run. It sounds trivial and breaks easily: any code path that reads a clock, a thread id or a memory address as a source of variation makes results unreproducible and bug reports unusable.",
    k: ["One shared generator vs one per component: one stream is simple and any added call shifts all later values, while per-component streams isolate changes.", "Fixed default seed vs random default: a fixed one makes runs repeatable by default, while random reveals seed sensitivity."],
    p: ["Ordering of an unordered container by pointer value makes behavior depend on allocation addresses.", "Adding one random call early in the run changes every later decision and invalidates comparisons."],
    v: "Run an instance twice with the same seed on one machine and on another. The statistics, conflict counts and the proof file are identical, and a different seed changes them.",
    dep: ["option-system"]
  },
  "fuzzing-harness": {
    s: "A generator of random or mutated formulas run against the solver and a reference, checking answers, models and proofs, to find bugs no hand-written test would reach.",
    d: "Generators produce random clause sets, structured circuits and typed SMT formulas by grammar, or mutate existing benchmarks. Each run checks several oracles: a sat answer's model must evaluate true, an unsat answer's proof must verify, and the result must agree with another solver or with the same solver under different options. Because solvers are intricate and aggressive, fuzzing is by far the most productive source of bugs, particularly in inprocessing, incremental use and rarely used operators. A harness must run for hours with a stable throughput and report each failure with its seed.",
    k: ["Grammar-based generation vs mutation of real inputs: grammar-based reaches exotic combinations and misses realistic structure, while mutation stays near real inputs.", "Differential testing against another solver vs self-consistency checks: differential finds disagreements and needs a trustworthy partner, while self-checks need no partner and miss consistent errors."],
    p: ["A fuzzer with a narrow generator reports clean runs for months while a whole feature is never exercised.", "Failures found without a recorded seed and options cannot be replayed."],
    v: "Run the harness for several hours with seeded faults in random components of a test build. Each seeded fault is caught within a bounded time, and every reported failure replays from its recorded seed and options.",
    dep: ["seeded-randomness", "model-evaluator", "proof-checker"]
  },
  "test-case-reduction": {
    s: "Automatically shrinks a failing input by removing clauses, assertions and subterms while the failure persists, producing a minimal case a developer can read.",
    d: "Given an input and a predicate that is true when the bug appears, the reducer repeatedly tries deleting chunks of the formula, simplifying subterms to constants and lowering widths, keeping any change after which the predicate still holds. Chunk size starts large and halves. The predicate must be stable, so it fixes the seed and limits to avoid reducing to a different failure. Reduction takes a failure found on a ten-megabyte file and returns a few lines, which turns a day of debugging into minutes. Syntax-aware reducers keep formulas well-sorted.",
    k: ["Syntax-aware reduction vs line-based: syntax-aware keeps inputs valid and takes more code, while line-based is general and often yields ill-formed files.", "Strict predicate on the exact error vs any failure: strict keeps the same bug and may stop early, while any failure may drift to a different, easier bug."],
    p: ["A nondeterministic failure makes the predicate flaky and the reducer converges on noise.", "Reduction that removes a declaration breaks the file and gets rejected as a different error."],
    v: "Apply it to a set of known failing inputs. Each output is far smaller, still triggers the same failure signature under the recorded seed, and is parseable and well-sorted.",
    dep: ["fuzzing-harness", "seeded-randomness"]
  },
  "benchmark-infrastructure": {
    s: "The corpus of problems and the tooling that runs configurations on them under fixed limits and compares solved counts, times and answers, which is how every change to the solver is judged.",
    d: "Benchmarks come from real applications and from crafted families, grouped by logic, with expected answers recorded where known. A runner executes each instance with a time and memory cap, records status, wall and CPU time and statistics, and a comparison tool reports solved counts, penalized averages and instance-level wins and losses across configurations and seeds. Disagreements between configurations are flagged as soundness alerts. It is a cross-cutting dependency since heuristics cannot be tuned by reasoning, and the corpus must stay representative as the solver's users change.",
    k: ["Large mixed corpus vs a small fast subset: the large corpus is representative and takes hours, while a subset gives quick feedback and risks overfitting.", "Penalized average time vs solved count: penalizing timeouts rewards speed on solved problems, while solved count rewards reach."],
    p: ["Tuning against a fixed corpus overfits and regresses on new application inputs.", "Running benchmarks on a loaded machine adds timing noise larger than the effect being measured."],
    v: "Run the full corpus for two builds and for the same build twice. The same build gives results within the noise bound, the changed build's differences exceed it, and every disagreement between answers is reported.",
    dep: ["statistics-reporting", "seeded-randomness"]
  },
  "assertion-and-self-checking": {
    s: "A debug mode in which the solver verifies its own invariants and results continuously: every model is evaluated, every learned clause is checked as implied, and data structures are validated.",
    d: "Checks include verifying that each learned clause is implied by unit propagation on its negation, that the watch invariant holds at fixpoint, that reasons are unit under their prefix, that models satisfy the original input, and that each theory explanation is inconsistent on its own. The mode runs at a fraction of normal speed, so it is used in testing and fuzzing and in production as an optional flag for critical queries. It converts silent unsoundness into an immediate failure with a location, which is the difference between a bug found in a day and one found in the field.",
    k: ["Always-on light checks vs a heavy optional mode: light checks run on every user query and miss deep invariants, while the heavy mode checks everything and is used only in testing.", "Aborting on a failed check vs reporting and continuing: aborting gives a clear failure, while continuing lets one run collect several violations."],
    p: ["Self-checks written with the same logic as the code they check share the same mistake.", "A mode that is slow enough never to be run stops being maintained and silently rots."],
    v: "Seed a few known faults, such as an unsound explanation and a missed watch, into a test build. The self-checking mode aborts at each one with a message naming the violated invariant, while the normal mode does not notice.",
    dep: ["model-evaluator", "proof-checker", "two-watched-literals"]
  },
});
