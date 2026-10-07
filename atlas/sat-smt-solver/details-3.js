// Details for the SAT & SMT solver plate, part 3: preprocessing, encoding and the conflict-driven search.
ATLAS.details("sat-smt-solver", {
  "term-rewriter": {
    s: "Applies algebraic and Boolean simplification rules to terms until they stop changing, shrinking formulas and exposing structure before any search starts.",
    d: "Rules include constant folding, flattening associative operators, sorting commutative arguments into a canonical order, removing double negation, and theory-specific identities such as adding zero or extracting from a concatenation. A cache keyed by the shared term avoids repeating work. The rewriter runs before search and again whenever new terms are created. Each rule must preserve meaning exactly, including the standard's corner cases, and must terminate. Rewriting is where many solver bugs live, since a single wrong identity changes answers silently and passes most tests.",
    k: ["Aggressive rewriting vs minimal rewriting: aggressive shrinks the problem and risks losing structure that a later engine exploited, while minimal is safe and leaves work to search.", "Rewrite to a fixed point vs a bounded number of passes: a fixed point is canonical and can be slow, while bounded passes are quick and non-canonical."],
    p: ["A rule that is true over unbounded integers but false for wrapping bit-vectors passes review and breaks real programs.", "Two rules that undo each other make rewriting loop forever."],
    v: "Check each rule by evaluating both sides on random and boundary inputs, and by solving the original and rewritten formula on a corpus. Answers match everywhere, and the rewriter reaches a fixed point on every corpus formula within a step limit.",
    dep: ["hash-consed-terms", "exact-numerals"]
  },
  "ite-and-let-lifting": {
    s: "Removes conditional expressions nested inside terms by naming them with fresh variables and adding clauses that define them, and keeps shared let bindings from expanding.",
    d: "An if-then-else term inside an arithmetic or array expression cannot be handled directly by a theory solver. The preprocessor replaces it with a fresh variable v and adds the facts that the condition implies v equals the first branch, and its negation implies v equals the second. Let bindings are translated into shared subterms rather than copies, preserving the term graph's compactness. Choices include lifting the conditional to the atom level, which duplicates the atom, and naming it, which adds a variable. Deeply nested conditionals blow up if lifted naively.",
    k: ["Naming a conditional with a fresh variable vs lifting it over the atom: naming keeps size linear and adds variables, while lifting avoids new variables and can duplicate subformulas exponentially.", "Eliminating all conditionals up front vs lazily when a theory needs it: up front is simple, while lazy keeps problems smaller when relevancy would skip them."],
    p: ["Expanding a long chain of nested conditionals by duplication turns a linear input into an exponential one.", "Defining facts attached to the wrong scope remain after a pop and constrain later queries."],
    v: "Preprocess formulas with deep conditional nesting. Size stays linear in input, the processed formula is equisatisfiable with the original on a reference solver, and models returned evaluate correctly with the conditionals restored.",
    dep: ["term-rewriter", "tseitin-transformation"]
  },
  "ackermannization": {
    s: "Eliminates uninterpreted function applications by replacing each with a fresh variable and adding constraints that equal arguments imply equal results, turning the problem into pure arithmetic or bit-vectors.",
    d: "For each pair of applications of the same function, a clause states that if their arguments are equal the results are equal. This is a quadratic number of clauses in the number of applications, but it removes the need for congruence closure and lets a bit-vector problem go straight to bit-blasting. Reduced variants add the constraints lazily as conflicts arise. The model for the function is rebuilt from the values assigned to the application variables. It pays off for small numbers of applications and becomes unusable for large ones.",
    k: ["Full Ackermann reduction vs congruence closure: reduction enables eager bit-blasting and costs quadratic clauses, while congruence closure scales with the number of terms and needs a theory solver.", "Eager constraints vs lazy refinement: eager is predictable, while lazy adds only the constraints the search finds violated."],
    p: ["Thousands of applications of one function generate millions of pairwise constraints.", "Forgetting to rebuild the function interpretation leaves models that assign values to application variables but not to the function."],
    v: "Compare results with and without the reduction on bit-vector problems containing functions. Answers match, the model's function table reproduces every application's value, and the clause count follows the expected quadratic growth.",
    dep: ["bit-blasting", "congruence-closure", "model-reconstruction"]
  },
  "unit-and-equivalence-reduction": {
    s: "Finds literals forced by unit clauses or proven equal to each other through chains of binary implications, and substitutes one representative everywhere to shrink the formula.",
    d: "Unit propagation at level zero fixes variables and removes satisfied clauses. Binary clauses form an implication graph; strongly connected components are sets of mutually equivalent literals and are replaced by a single representative, found by a linear-time graph algorithm. Substituting shrinks clauses, and often creates new units and duplicates. Because eliminated variables lose their own values, the reconstruction stack records the equivalence so models can restore them. This is cheap and often the most effective single inprocessing step on structured industrial problems.",
    k: ["Running it repeatedly during search vs once up front: repeated runs find equivalences revealed by learned clauses, while once is cheap and misses them.", "Choosing the representative arbitrarily vs by activity: activity keeps the most-useful variable alive, and arbitrary is simpler."],
    p: ["Substituting an assumed variable away, in incremental use, breaks later calls that assume it.", "Failing to push the equivalence onto the reconstruction stack gives models that violate the original clauses."],
    v: "Run on formulas with planted equivalences. The variable count drops by the planted amount, answers match a run without the step, and final models evaluate correctly against the original clauses.",
    dep: ["binary-implication-lists", "model-reconstruction", "assumptions-interface"]
  },
  "bounded-variable-elimination": {
    s: "Removes a variable by resolving all clauses containing it with all clauses containing its negation, when doing so does not increase the clause count by more than a small bound.",
    d: "Eliminating variable x replaces the clauses with x and the clauses with not x by their pairwise resolvents, dropping tautologies. The number of clauses may fall or grow; the technique is applied only when growth stays within a limit, in order of increasing cost. Gate detection finds definitions that avoid many resolvents. The eliminated clauses go onto the reconstruction stack so a value for x can be recomputed from a model of the rest. It is among the most effective preprocessing steps on industrial inputs and the most dangerous for incremental use.",
    k: ["Strict growth limit vs generous limit: strict keeps clause counts safe and eliminates fewer variables, while generous shrinks variables and sometimes bloats the formula and slows propagation.", "Elimination in preprocessing only vs during search: only up front is simple, while during search profits from learned units and needs occurrence lists kept in sync."],
    p: ["Eliminating a variable that a later incremental clause mentions makes the new clause unsound; it must be frozen.", "Resolvent counts that explode on one dense variable stall preprocessing."],
    v: "Compare with and without elimination across a benchmark set. Answers agree, models evaluate correctly after reconstruction, and the post-elimination clause count does not exceed the original by more than the configured bound.",
    dep: ["subsumption", "gate-extraction", "model-reconstruction"]
  },
  "subsumption": {
    s: "Deletes clauses that are implied by a shorter clause, and shortens clauses by self-subsuming resolution when a resolvent subsumes one of its parents.",
    d: "A clause is subsumed if another clause's literals are a subset of it; the larger one is redundant. Self-subsumption finds that resolving two clauses on one literal yields a clause that subsumes a parent, so the literal can be removed from it. Efficient implementations use occurrence lists and bit signatures to filter candidates before full comparison. Backward subsumption checks a new clause against existing ones; forward checks existing ones against it. The work is quadratic in the worst case, so it is bounded by effort limits, and learned clauses benefit from being checked as they are added.",
    k: ["Full subsumption vs bounded effort: full removes every redundant clause and can be very slow, while bounded keeps the cost predictable and misses some.", "Applying to learned clauses vs original only: learned clauses are plentiful and benefit most, and checking them costs time in the search loop."],
    p: ["Removing a clause that subsumes another in the proof order leaves the proof referencing a deleted clause.", "Missing the signature filter makes it quadratic and prohibitively slow on large inputs."],
    v: "Plant subsumed and self-subsumed clauses in a formula. All planted clauses are removed or strengthened, the answer is unchanged, and the proof checker accepts the logged deletions and strengthened clauses.",
    dep: ["clause-arena", "proof-logging"]
  },
  "blocked-clause-elimination": {
    s: "Removes clauses that cannot take part in any resolution proof of unsatisfiability because all their resolvents on some literal are tautologies, preserving satisfiability.",
    d: "A clause is blocked on a literal if every resolvent with a clause containing the opposite literal is a tautology. Removing it does not change whether the formula is satisfiable, but may change the set of models, so removed clauses are pushed to the reconstruction stack and the model is repaired by flipping the blocking literal when needed. It subsumes many circuit simplifications. Because the step is satisfiability-preserving rather than implication-preserving, standard proof formats must be able to express it, which is why extended proof systems exist.",
    k: ["Eliminating blocked clauses vs keeping the formula equivalent: elimination can simplify greatly and requires model repair and a richer proof format, while equivalence-preserving steps are simpler to certify.", "Running on all clauses vs restricted to original: restricting limits the cost and misses blocks among learned clauses."],
    p: ["Using it with assumptions or incremental clauses can make later queries wrong, since blockedness depends on the whole formula.", "A proof format that cannot express the step makes the logged proof incorrect even though the answer is right."],
    v: "Remove blocked clauses from circuit encodings, solve, then check models against the original. All models are valid after repair, and an extended-format checker accepts the logged proof.",
    dep: ["model-reconstruction", "proof-logging", "clause-arena"]
  },
  "failed-literal-probing": {
    s: "Tentatively assigns a literal and propagates; if that causes a conflict, the opposite literal is forced, giving new units and equivalences found by lookahead rather than search.",
    d: "For each candidate literal, typically roots of the binary implication graph, the solver assigns it at a temporary level and propagates. A conflict means the literal is failed, so its negation is a unit. If two different literals imply the same literal in both polarities, that literal is also forced. Probing can also learn equivalences and hyper-binary resolvents that strengthen the implication graph. Cost is propagation work per candidate, so an effort budget limits it, and results are cached until the formula changes.",
    k: ["Probing only roots of the implication graph vs all variables: roots cover most useful cases and keep cost low, while all variables find more at much higher cost.", "Adding hyper-binary resolvents vs discarding them: adding strengthens propagation and grows the binary clause set."],
    p: ["Probing without undoing the temporary level leaves partial assignments that later look like decisions.", "Re-probing the same literals when nothing changed wastes the effort budget."],
    v: "Plant a formula with a failed literal and a forced equivalence. Probing finds both, units appear in the log, the answer is unchanged, and re-running without changes performs no further probes.",
    dep: ["binary-implication-lists", "trail-and-assignment", "inprocessing-scheduler"]
  },
  "vivification": {
    s: "Strengthens clauses by assigning the negations of their literals one at a time and propagating, deleting any literal that turns out to be redundant or finding the clause subsumed.",
    d: "For a clause, the solver assumes its first literal false, propagates, and checks whether another literal in the clause is forced true or false, or a conflict occurs. A forced-true literal means the clause can be shortened to those assumed so far; a conflict does the same with the assumed prefix. Applied to learned clauses, it often shortens many of them noticeably, and since short clauses propagate more, it speeds up the whole search. It uses ordinary propagation, so cost is that of many small searches, controlled by an effort budget and by prioritizing clauses used recently.",
    k: ["Vivifying learned clauses vs only original: learned clauses are numerous and valuable, and they change constantly, while original clauses are fixed and tested once.", "Sorting literals by occurrence before vivifying vs given order: sorting shares propagation across clauses and costs a sort."],
    p: ["The clause being vivified must be detached from watches first, or it propagates to itself and the check is trivially true.", "Strengthened clauses logged without a derivation step make the proof unverifiable."],
    v: "Run on a benchmark set with statistics. Average learned clause length drops, the answers are unchanged, and the proof, with each strengthened clause logged with its derivation, is accepted by the checker.",
    dep: ["two-watched-literals", "learned-clause-database", "proof-logging"]
  },
  "gate-extraction": {
    s: "Recognizes clauses that encode logic gates, such as AND, OR, XOR and if-then-else, so elimination and other steps can treat them as definitions instead of arbitrary clauses.",
    d: "A set of clauses defines an output literal as a function of inputs when they match the standard gate patterns, for example three clauses for an AND gate. Once recognized, resolution on the output variable only needs to use the gate clauses against the non-gate clauses, avoiding the full cross product and making elimination much cheaper and safer. Recovering gates also recovers circuit structure, which can guide decision heuristics and symmetry detection. Detection is syntactic and so fails when preprocessing has rewritten the clauses into an unrecognizable shape.",
    k: ["Syntactic gate matching vs semantic detection with propagation: syntactic is fast and incomplete, while semantic finds more definitions and costs search.", "Using gates only for elimination vs also for branching: elimination gains are certain, while branching on inputs can help structured problems and hurt others."],
    p: ["Treating clauses as a gate that is not actually functional gives wrong resolvent reductions and unsound elimination.", "Detection run after other simplification misses gates that had been disguised."],
    v: "Run on circuit-derived formulas with known gate counts. The detector finds the planted gates, elimination with gates yields fewer resolvents than without, and answers and models are unchanged.",
    dep: ["bounded-variable-elimination", "tseitin-transformation", "clause-arena"]
  },
  "symmetry-breaking": {
    s: "Adds constraints that exclude all but one member of each set of equivalent assignments, so the solver does not repeat the same failed search under every relabeling.",
    d: "Many problems are invariant under permutations of objects: colors, pigeons, machines. Symmetry detection builds a graph from the formula and finds its automorphisms; for each generator, lexicographic-leader clauses are added that say the assignment must be no larger than its image. Dynamic variants prune symmetric branches during search. It can turn hopeless problems into trivial ones, notably in combinatorial and finite-model search. Cost and soundness depend on the details: partial breaking is safe, but a flawed predicate over-constrains and loses real solutions.",
    k: ["Static breaking clauses vs dynamic symmetry handling: static is simple and works with any solver, while dynamic prunes more and needs deep integration.", "Full breaking vs partial: full is expensive to detect and add, while partial removes most symmetry cheaply."],
    p: ["Breaking constraints that disagree between the generators remove all models of a satisfiable problem.", "Symmetry detection spending more time than the solving it saves."],
    v: "Solve pigeonhole and graph coloring instances with and without breaking. Satisfiable instances remain satisfiable with a valid model, unsat time drops by orders of magnitude, and counts of models modulo symmetry match.",
    dep: ["clause-arena", "finite-model-finding"]
  },
  "inprocessing-scheduler": {
    s: "Decides when during search to run simplification techniques, how much effort each gets, and in what order, so simplification pays for itself without starving the search.",
    d: "Techniques such as elimination, probing, subsumption and vivification are scheduled at restarts or at level zero, each with a budget proportional to the search effort since the last round, so inprocessing never exceeds a fixed fraction of total time. Rounds grow geometrically apart. A technique that found little gets less budget next time. The scheduler must also handle ordering dependencies: substitution before elimination, subsumption after learning. Getting the interaction between techniques right is a major part of why one solver outperforms another more than any single idea does.",
    k: ["Fixed effort ratio vs adaptive: fixed is predictable, while adaptive moves effort to the techniques that currently reduce the formula.", "Inprocessing at every restart vs at long intervals: frequent catches changes early and costs overhead, while infrequent has less overhead and finds fewer opportunities."],
    p: ["A technique with no budget cap can consume the whole run on one pathological formula.", "Running a technique that is unsound with assumptions during an incremental session corrupts answers."],
    v: "Log time spent per technique over a long run. Total inprocessing stays within the configured share, each round's budget scales with search effort, and answers match a configuration with inprocessing disabled.",
    dep: ["restart-policy", "bounded-variable-elimination", "subsumption", "vivification"]
  },
  "model-reconstruction": {
    s: "Remembers how each eliminated or substituted variable depends on the rest, so that a model of the simplified formula can be extended to a model of the original.",
    d: "Each simplification that removes variables or clauses pushes an entry on a reconstruction stack: the clause removed and the literal to flip if it is violated. After solving, the stack is replayed in reverse; whenever a stored clause is falsified by the current assignment, its witness literal is flipped. Word-level rewrites and tactic converters play the same role in SMT. The mechanism is simple and every simplification must feed it: a single missing entry returns an assignment that satisfies the simplified problem and violates the original.",
    k: ["Storing the removed clauses vs a functional description: clauses are generic and use memory proportional to what was removed, while functions are compact and must exist per technique.", "Reconstructing on demand vs eagerly at sat time: on demand saves time when no model is wanted, while eager keeps one consistent assignment."],
    p: ["A technique that forgets to record its change gives wrong models only on formulas that trigger it.", "Replaying the stack in the wrong order undoes substitutions in the wrong sequence and breaks values."],
    v: "For every sat benchmark, evaluate every original clause under the reconstructed model with an independent checker. All are satisfied, and disabling one technique's recording in a test build makes the check fail on some benchmark.",
    dep: ["trail-and-assignment", "memory-manager"]
  },
  "tseitin-transformation": {
    s: "Converts an arbitrary Boolean formula into clauses of size linear in the original by introducing a fresh variable for each subformula and clauses defining it.",
    d: "Each gate-like subterm gets a variable and a handful of clauses saying it is equivalent to the operator applied to its inputs; the root variable is asserted. The result is equisatisfiable and avoids the exponential blowup of distributing disjunctions over conjunctions. Sharing in the term graph is preserved: a subterm used in many places gets one variable. Variants encode only one direction when the subformula appears with a single polarity, producing fewer clauses and slightly weaker propagation. The new variables are decision candidates a heuristic must learn to avoid or favor.",
    k: ["Full equivalence vs one-sided implication: full equivalence propagates in both directions, while one-sided halves the clauses and weakens propagation.", "Naming every subformula vs only shared or large ones: naming all is uniform, while selective naming reduces variables and clauses."],
    p: ["Distributing instead of introducing variables turns a linear formula into one with exponentially many clauses.", "Auxiliary variables chosen as decisions waste effort since they carry no independent choice."],
    v: "Convert random formulas and compare satisfiability to a direct truth-table evaluation at small size. Results match, the clause count is linear in formula size, and models restricted to original variables satisfy the formula.",
    dep: ["hash-consed-terms", "clause-arena"]
  },
  "polarity-aware-encoding": {
    s: "Encodes each subformula in only the direction its position requires, positive, negative or both, to cut clause counts while preserving satisfiability.",
    d: "A subformula appearing only under positive polarity needs only the implication from its variable to its meaning; one appearing only negatively needs the converse. Equivalence is required only where the polarity is mixed, as under an equivalence operator or an exclusive-or. The pass computes polarity bottom-up for every node of the shared graph. Savings are significant on large formulas, up to half the clauses. The compromise is slightly weaker unit propagation on the unconstrained side, and complication for incremental use when a term later reappears at a different polarity.",
    k: ["Polarity-aware vs full equivalence encoding: polarity-aware gives smaller formulas and can propagate less, while full is simple and always strong.", "Fixing polarity at first use vs recomputing: fixing is simple and breaks when later assertions need the other direction, so it must add the missing clauses then."],
    p: ["A term first encoded one-sided then reused at the opposite polarity without adding the missing clauses is unsound.", "Models read from one-sided definitions give wrong values to auxiliary variables."],
    v: "Encode a benchmark set both ways. Satisfiability agrees everywhere, the one-sided clause count is smaller by the expected fraction, and an incremental sequence that reuses terms at new polarity still matches full encoding.",
    dep: ["tseitin-transformation", "incrementality-contract"]
  },
  "bit-blasting": {
    s: "Translates word-level operations into circuits over single Boolean variables, one per bit, and then into clauses, so a bit-vector problem becomes pure SAT.",
    d: "Each bit-vector variable of width n becomes n Boolean variables. Bitwise operators map one-to-one; addition is a ripple or a parallel-prefix adder; comparison and shifts have circuit forms; multiplication builds an array of adders, with clause counts growing quadratically in width. Constants propagate through the circuits and are simplified out during construction. Circuits are shared through structural hashing so identical subcircuits are built once. The choice of circuit architecture changes both clause count and propagation strength, and division and remainder are costly with no cheap form.",
    k: ["Ripple adders vs parallel-prefix adders: ripple has few clauses and long dependency chains, while prefix has more clauses and shorter propagation paths.", "Eager blasting up front vs lazy blasting on demand: eager is simple and can spend memory on parts the search never needs, while lazy saves memory and complicates the framework."],
    p: ["Wide multiplication or division of symbolic values creates a clause set too large to hold.", "A subtle circuit error for a rarely used operator, such as arithmetic shift, is found only when a real input exercises it."],
    v: "Blast each operator at small widths and compare the circuit's behavior against exhaustive evaluation over all inputs. Every operator matches the reference, and clause counts for each width follow the expected growth.",
    dep: ["tseitin-transformation", "hash-consed-terms"]
  },
  "cardinality-encodings": {
    s: "Clause encodings of constraints like at most k of these literals are true, using counters, sorting networks or adders to keep size manageable and propagation strong.",
    d: "The pairwise encoding of at most one needs quadratic clauses; sequential counters need linear clauses and auxiliary variables; totalizers and sorting networks give strong propagation in n log n or n log squared n size. Which is best depends on n and k: small k favors counters, large k favors sorting networks. Incremental variants allow raising or lowering k without rebuilding by exposing output variables as assumptions. This is the workhorse for translating counting constraints in planning, scheduling and optimization.",
    k: ["Counter-style encodings vs sorting networks: counters are compact for small bounds, while sorting networks keep propagation strong at large bounds and use more clauses.", "Fixed k vs incremental bound: fixed produces the smallest formula, while incremental lets an optimizer tighten the bound with learned clauses kept."],
    p: ["Pairwise encoding of a constraint over thousands of variables creates a clause set too large to load.", "An encoding that is correct but propagates weakly leaves the solver unable to detect simple violations early."],
    v: "Encode at-most-k for many n and k and compare satisfiability against counting every assignment at small sizes. They match exactly, and an incremental bound change returns the same answers as a fresh encoding.",
    dep: ["tseitin-transformation", "clause-arena"]
  },
  "bounded-integer-encoding": {
    s: "Represents integer variables with a known finite range by bits or by one-hot indicators so that arithmetic constraints become clauses instead of calls to an integer theory solver.",
    d: "A range of size d can be encoded as a binary number with about log d bits, an order encoding with d minus one variables meaning x at most i, or a direct one-hot encoding. Order encoding makes bound constraints a single clause and propagates well; binary makes arithmetic compact; direct makes equality tests simple. Constraints are translated by the corresponding circuits or by enumeration of cases. It is attractive when ranges are small, such as in scheduling, and impossible for unbounded variables.",
    k: ["Order encoding vs binary encoding: order propagates bounds strongly at the cost of size linear in the range, while binary is compact and propagates arithmetic weakly.", "Encoding to clauses vs using the integer theory solver: clauses make learned reasoning uniform and blow up for large ranges, while the theory solver scales with range and loses clause learning inside arithmetic."],
    p: ["Unbounded variables treated as bounded by default produce models that violate the intended constraints.", "Ranges of millions create encodings far larger than the solver could ever search."],
    v: "Encode small-range arithmetic problems and compare answers with the integer theory solver. They agree on all instances, bounds on the encoded variables hold in every model, and encoded size scales as predicted.",
    dep: ["bit-blasting", "cardinality-encodings"]
  },
  "xor-handling": {
    s: "Recognizes parity constraints, chains of exclusive-or, and reasons with them by Gaussian elimination instead of treating them as large clause sets that propagate weakly.",
    d: "An exclusive-or of n variables expands into 2^(n-1) clauses and propagates nothing until all but one variable are assigned. Cryptographic and coding problems are full of them. Solvers detect XOR clause groups, then run Gaussian elimination over the binary field to derive implied units and conflicts, with reasons produced as clauses on demand. Long XORs are cut into short ones with auxiliary variables when encoded as clauses. Proof support is difficult since resolution proofs of parity reasoning are exponentially long, so special proof formats are needed.",
    k: ["Detecting and eliminating XORs vs leaving them as clauses: detection gives strong propagation on parity-heavy inputs, while leaving them is simple and weak.", "Gaussian elimination at each propagation vs periodically: each time finds more and costs more, while periodically trades detail for speed."],
    p: ["Cutting an XOR chain into pieces too long makes clause counts explode.", "Reasons from elimination that are not derived as clauses make the logged proof incomplete."],
    v: "Solve parity-heavy benchmarks with and without elimination. Answers agree, the elimination run finishes problems the plain run cannot, and each derived reason is an implied clause under an independent check.",
    dep: ["native-constraint-propagators", "tseitin-transformation", "proof-logging"]
  },
  "cdcl-loop": {
    s: "The main loop of conflict-driven clause learning: propagate, resolve any conflict into a learned clause and backjump, otherwise decide a new literal, until a model or an empty clause appears.",
    d: "At each step the solver runs unit propagation to a fixpoint. With no conflict, it checks whether all variables are assigned, then picks a decision variable and phase and opens a new decision level. With a conflict, it analyzes the implication graph, learns a clause asserting a literal after the backjump, backjumps to the second-highest level in that clause, and continues. Around it sit restarts, clause database reduction and inprocessing at defined points. The loop itself is short, and nearly all of the engineering is in the data structures and policies it calls.",
    k: ["Learning every conflict clause vs selective learning: learning all is the standard and needs deletion to bound memory, while selective learning loses the pruning power.", "Restarting inside the loop vs not: restarts escape bad early decisions at a cost of rebuilding the trail, which phase saving reduces."],
    p: ["Failing to backjump to the correct level makes the asserting literal unit at the wrong level and breaks later analysis.", "Skipping propagation after backjumping misses the immediate implication of the learned clause."],
    v: "Run the loop on a benchmark set with an internal invariant checker enabled. Every learned clause is implied by the formula, each backjump level equals the second-highest in the clause, and every sat model satisfies the clauses.",
    dep: ["two-watched-literals", "conflict-analysis", "backjumping", "activity-based-branching"]
  },
  "conflict-analysis": {
    s: "Starting from a falsified clause, resolves backward through the reasons of implied literals until the clause has exactly one literal from the current level, the first unique implication point, and learns that clause.",
    d: "Walking the trail backward from the conflict, the analyzer resolves the current clause with the reason of each marked literal at the conflict level, until just one such literal remains. That literal's negation is the asserting literal. Variables seen are bumped for the branching heuristic. The result is passed to minimization, and the second-highest level among its literals is the backjump target. The first unique implication point is chosen because it gives short clauses that become unit right after backjumping. The structure needs reasons stored for every implied literal and careful handling of binary and theory reasons.",
    k: ["First unique implication point vs later or all-decision cut: first point is the proven default for short, immediately useful clauses, while other cuts give different clause shapes that rarely win.", "Computing reasons eagerly vs lazily for theory propagations: lazy saves work for unused propagations, while eager is simple and slow."],
    p: ["A reason clause with the implied literal not in first position breaks the resolution loop.", "Missing a literal's level due to stale data gives clauses that are not asserting."],
    v: "On every conflict in a test run, verify the learned clause has exactly one literal at the conflict level and is implied by the clause database by running propagation on its negation. All checks pass across a benchmark set.",
    dep: ["reason-and-level-store", "trail-and-assignment", "activity-based-branching"]
  },
  "clause-minimization": {
    s: "Removes literals from a learned clause that are implied by the others through the implication graph, producing a shorter clause that prunes more of the search.",
    d: "A literal is redundant if its reason's literals are all already in the clause, or recursively redundant themselves, so removing it loses nothing. The recursive version marks literals as removable or not with a cache and an abstraction by decision level to cut off hopeless searches quickly. A binary-clause variant uses only binary implications and is cheaper. Typically it shortens clauses by a significant fraction, and shorter clauses propagate earlier and take less memory. Minimization must not remove the asserting literal, and its work is bounded by a depth or size limit.",
    k: ["Recursive minimization vs local-only: recursive removes more and costs more per conflict, while local is cheap and finds fewer.", "Using binary implications to shrink further vs not: using them is cheap and effective, and needs the binary lists to be current."],
    p: ["Removing a literal whose reason depends on the literal itself gives unsound circular justification.", "An unbounded recursion on huge implication graphs stalls analysis."],
    v: "Compare learned clause lengths with and without minimization. Average length falls, every minimized clause passes the implied-by-propagation check, and total conflicts to solve a benchmark set do not increase.",
    dep: ["conflict-analysis", "reason-and-level-store", "binary-implication-lists"]
  },
  "backjumping": {
    s: "After learning a clause, undoes assignments back to the second-highest decision level in that clause, so the clause becomes unit and immediately forces the opposite choice.",
    d: "Rather than undoing only the last decision, the solver jumps over any levels that did not contribute to the conflict. It pops the trail down to the target level, restoring each variable to unassigned and putting it back into the branching heap, and with phase saving remembers its last value. The learned clause is then added and propagates its asserting literal at the target level. Skipping levels is the reason conflict-driven solvers do far better than chronological search on structured problems, and the cost is rebuilding the trail afterward.",
    k: ["Non-chronological jumps vs shallow backtracking: jumps skip irrelevant levels and discard more of the trail, while shallow keeps more but repeats failures.", "Restoring variables to the heap eagerly vs on demand: eager keeps decision selection simple and costs per variable."],
    p: ["Leaving a variable out of the branching heap after backjump makes it undecidable and the solver incomplete.", "Watches not adjusted after jumping produce missed propagations."],
    v: "After each backjump in a test build, assert that no variable above the target level is assigned, that each is back in the branching structure, and that the new clause is unit. All hold throughout a benchmark run.",
    dep: ["trail-and-assignment", "conflict-analysis", "phase-saving"]
  },
  "chronological-backtracking": {
    s: "A variant that, for very long backjumps, undoes only the most recent level, keeping the implied literals that remain valid so less of the trail is rebuilt.",
    d: "When the target level is far below the current one, a full backjump discards many assignments that the solver will then re-derive by propagation. Chronological backtracking instead backtracks one level and enters the learned literal at its true level out of order, so the trail is no longer sorted by level. This keeps work and helps on instances with huge trails, such as large bounded model checking problems. The cost is complexity: invariants about trail ordering break, and conflict analysis, propagation and assumptions must tolerate literals at levels lower than their position.",
    k: ["Chronological for long jumps vs always non-chronological: chronological preserves large trails on huge instances, while always jumping keeps invariants simple.", "A threshold on jump length vs a fixed policy: a threshold uses each when it pays and adds a parameter that needs tuning."],
    p: ["Analysis assuming the trail is level-sorted gives wrong asserting literals when levels are out of order.", "Out-of-order literals interact badly with assumption replay and incremental trail reuse."],
    v: "Run an invariant-checking build on instances with long jumps. Learned clauses remain valid under the relaxed ordering, the answers match a run with the feature disabled, and the trail work metric falls on large instances.",
    dep: ["backjumping", "trail-and-assignment", "trail-reuse"]
  },
  "learned-clause-database": {
    s: "The store of clauses derived during search, kept separate from the original clauses and managed by size, quality and age so it helps rather than slows propagation.",
    d: "Learned clauses are appended to arenas, tiered by quality: very low glue clauses are kept permanently, medium ones for a while, and the remainder compete for space. Each carries a quality score, a usage flag and an activity. Periodically the database is reduced by sorting on the score and discarding the worse half. Binary clauses go to special lists. The database grows by thousands of clauses per second, so its size, layout and reduction schedule control propagation speed more than any search heuristic does.",
    k: ["Tiered retention by quality vs a single sorted pool: tiers protect the best clauses from fluctuation, while a single pool is simpler and more arbitrary.", "Time-based vs conflict-count-based reduction: conflict count tracks search progress, while time tracks propagation cost."],
    p: ["Deleting a clause that is currently the reason for an assigned literal corrupts conflict analysis.", "Database growth without reduction makes propagation slower until throughput collapses."],
    v: "Run a long search and sample database size and propagations per second. Size stays within a bound set by the schedule, throughput does not decline over time, and no deleted clause is referenced as a reason.",
    dep: ["clause-arena", "clause-quality-scoring", "clause-deletion"]
  },
  "clause-quality-scoring": {
    s: "A score that predicts how useful a learned clause will be, most commonly the number of distinct decision levels among its literals, with lower being better.",
    d: "The score, often called glue or literal block distance, counts the decision levels represented in the clause at learning time. Clauses with few levels link a small number of decision groups and tend to be reused. It is cheap to compute during analysis and can be recomputed when the clause is used in later conflicts, so clauses can be promoted. Size and recent usage serve as tie-breakers. The measure is empirical: it correlates with usefulness on typical benchmarks, and is a known weak predictor for some problem families.",
    k: ["Level-based score vs clause size: the level-based score predicts reuse better on structured problems, while size is trivially cheap and less predictive.", "Updating the score on each use vs fixed at learning: updating adapts to the changing search and costs extra per use."],
    p: ["Treating a low score as a guarantee of usefulness keeps stale clauses forever.", "Computing the score after backjumping gives a different, wrong level count."],
    v: "Log score at learning and whether the clause later participates in a conflict. Low-score clauses show a clearly higher reuse rate than high-score ones on a benchmark set, and the recomputed score matches a reference implementation.",
    dep: ["conflict-analysis", "learned-clause-database"]
  },
  "clause-deletion": {
    s: "Periodically discards the lower-value half of the learned clauses, so the database stays small enough for fast propagation while keeping the clauses that help.",
    d: "At scheduled intervals, learned clauses not protected by tier or recent use are sorted by score and the worst are removed. Clauses that are currently reasons for assigned literals are locked and skipped. Watch lists are cleaned, and the arena is compacted by garbage collection. In proof-logging mode each deletion is written to the proof so the checker's database tracks the solver's. The interval typically grows slowly over a run, giving the solver more room as the search matures. Mistakes here cost speed rather than correctness, except for locked clauses.",
    k: ["Deleting by score alone vs mixing usage history: score alone is simple, while history protects clauses the current search is actually using.", "Aggressive deletion vs lenient: aggressive keeps propagation fast and forgets useful clauses, while lenient keeps knowledge and slows each step."],
    p: ["Removing a reason clause leaves a dangling reference that crashes analysis.", "Failing to log deletions makes the checker's database larger and slower than the solver's."],
    v: "Run with an invariant check that no reason clause is deleted and no watch list refers to a freed clause. Throughput after reductions rises, memory stays bounded, and the proof's deletion lines let the checker finish within its time limit.",
    dep: ["learned-clause-database", "clause-arena", "proof-logging"]
  },
  "on-the-fly-strengthening": {
    s: "Shortens or subsumes clauses during conflict analysis itself, when an intermediate resolvent reveals that an earlier clause can lose a literal at no extra cost.",
    d: "During resolution, if a resolvent is found to subsume one of its antecedents, the antecedent can be replaced by the smaller clause immediately, with no separate pass. This tends to apply to binary and ternary clauses and to learned clauses used repeatedly in analysis. The check is cheap since the analyzer already has both clauses in hand. The effect is gradual strengthening of the clause database as a by-product of search. Care is needed to modify clauses that may be in watch lists and as reasons, and to log the strengthened clause in proofs.",
    k: ["Strengthening during analysis vs in a separate pass: during analysis is nearly free and misses clauses not used as reasons, while a separate pass covers more at extra cost.", "Replacing the clause in place vs adding a new one: in place saves memory and complicates watches, while adding is simple and leaves the old clause to be deleted."],
    p: ["Shortening a clause that is currently a reason invalidates the implication graph.", "Updated clauses not re-watched properly miss propagations afterward."],
    v: "Count strengthened clauses in a run with an invariant checker. The database never contains a clause subsumed by a shorter one it was resolved with, answers are unchanged, and logged proof steps verify.",
    dep: ["conflict-analysis", "two-watched-literals", "proof-logging"]
  },
});
