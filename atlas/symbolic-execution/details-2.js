// Details for the symbolic execution plate, part 2: search, hybrid execution, path explosion control.
ATLAS.details("symbolic-execution", {
  "state-scheduler": {
    s: "Holds every live state and decides which one executes next, using one or more search strategies, and is the main lever over what the engine finds within its budget.",
    d: "The scheduler keeps a collection of runnable states and is told when states are created, forked, merged or terminated. On each step or after a time slice it picks the next state. Picking the same state repeatedly gives depth-first behavior; rotating gives breadth. It can run several strategies in rotation. It must update strategy data structures cheaply, because forks happen often. The difficulty is that good scheduling depends on the target, and a poor choice looks identical to a hard program.",
    k: ["Run a state for a long slice versus switch every instruction: long slices keep caches warm and avoid switching cost, while frequent switching gives fairer exploration but more overhead.", "One strategy versus a rotation of several: one is predictable, while a rotation avoids the worst case of any single heuristic at the cost of diluting the best."],
    p: ["A strategy keeps picking a state stuck in a long loop, starving states that could reach new code.", "Scheduler bookkeeping is linear in the number of states, so a run with a million states spends its time choosing."],
    v: "Run the same target with each strategy and the rotation, plot coverage over time, and confirm the scheduler's per-pick cost stays constant as live states grow to a hundred thousand.",
    dep: ["execution-state", "depth-first-search", "breadth-first-search", "random-path-selection"]
  },
  "depth-first-search": {
    s: "Always continues the most recently created state, finishing one path completely before starting another, using little memory and following program order closely.",
    d: "States are kept on a stack. A fork pushes the alternative and continues the current side, so a path runs to completion and backtracks. Memory use stays low because few states live at once, and results are easy to follow. It is strongly biased by program text: with a loop whose bound is symbolic it can spend the whole budget on one loop and never reach code after it. It suits small targets and bug-seeking when the bug is deep inside a single call chain.",
    k: ["Depth-first versus breadth-first: depth-first needs little memory and reaches deep code quickly, but can be trapped in loops or in the first branch's subtree.", "Fixed branch order versus randomized order: fixed order is reproducible and easy to reason about, while randomized order avoids systematic bias at the cost of repeatability."],
    p: ["A parse loop with a symbolic bound makes the engine explore longer and longer inputs forever.", "The first branch of every conditional is always preferred, so error handling code on the other side is reached only at the very end."],
    v: "On a program with a loop followed by a bug, confirm depth-first never reaches the bug under a loop bound of a thousand, while a randomized strategy reaches it within the same budget.",
    dep: ["state-scheduler"]
  },
  "breadth-first-search": {
    s: "Advances all states evenly, so shallow paths are all explored before deep ones, finding the shortest input-dependent paths first at high memory cost.",
    d: "States are held in a queue and each runs a slice before the next. The frontier grows with each level of branching, so memory climbs exponentially with depth and the engine usually dies from memory before the depth that matters. It is useful for finding short counterexamples, where bugs are shallow, and as one member of a rotation, since it escapes loop traps. Tests found are short and easy to read. Little else recommends it for full-size programs.",
    k: ["Breadth-first versus depth-first: breadth-first finds the shallowest bugs and escapes loops, but the number of live states grows exponentially.", "Fair slicing versus per-branch ordering: fair slicing treats all states equally, while ordering by depth gives a true shortest-path guarantee but needs a priority queue."],
    p: ["The frontier fills memory before any state reaches code past a dozen branches.", "Many states hold copies of nearly identical data, so memory is wasted unless copy-on-write sharing is effective."],
    v: "On a program whose bug needs eight branches, confirm breadth-first finds the shortest triggering input, and record peak live states against depth to confirm growth is bounded by the memory cap.",
    dep: ["state-scheduler", "copy-on-write-state"]
  },
  "random-path-selection": {
    s: "Chooses a state by walking the tree of past forks from the root and picking a child at random at each fork, which favors states near the root of the execution tree.",
    d: "The engine keeps a binary tree recording every fork. To pick a state, it descends from the root choosing a random branch at each internal node until it reaches a runnable leaf. Because each split gets equal probability, states in a subtree of few leaves are chosen as often as those in a huge one, which prevents a heavily forking region from monopolizing the search. It needs no knowledge of the program. It is cheap but not directed, so it is usually combined with a coverage heuristic.",
    k: ["Uniform random state versus tree-walk random: uniform picks favor regions that produce many states, while tree-walk gives each subtree equal weight and resists explosion.", "Pure random versus random with bias: pure random is simple and unbiased, but bias toward uncovered code finds new coverage faster."],
    p: ["The fork tree grows without limit and is never pruned, so memory goes to the history rather than the states.", "States removed by merging leave dangling tree nodes that are picked and found empty."],
    v: "On a program with one branch region producing many forks and another with few, count picks per region and confirm each region is picked about equally, unlike under uniform selection.",
    dep: ["state-scheduler", "branch-forking"]
  },
  "coverage-guided-search": {
    s: "Prefers states likely to reach code not yet covered, scoring them by instructions to the nearest uncovered location, recent new coverage and how often their current code has run.",
    d: "Each state is scored from information such as the distance in the control flow graph to uncovered instructions, whether it recently covered something new, and the call-stack depth. The scheduler selects with probability proportional to score or takes the highest. Weights favor states that make progress and decay those that loop in covered code. The distance computation needs the control flow graph and is recomputed as coverage grows. It often beats random selection but can chase code that is statically reachable and semantically infeasible.",
    k: ["Static distance to uncovered code versus recent coverage gain: distance uses global structure and can chase unreachable code, while recency is local and adapts but ignores code just ahead.", "Pick best-scoring versus sample by score: best-score is fast to converge but gets stuck, while sampling keeps some diversity."],
    p: ["A state aims at an uncovered block that no input can reach, so the engine stays near it forever.", "Distances computed ignoring indirect calls or returns badly misjudge states inside called functions."],
    v: "Compare coverage after a fixed budget with this strategy against random selection on three benchmark programs, and confirm the strategy covers more lines in at least two while its scores track the real control flow distance.",
    dep: ["state-scheduler", "control-flow-graph-recovery", "coverage-reporting"]
  },
  "target-directed-search": {
    s: "Steers states toward a specific location, such as a reported crash site or changed line, and abandons states that move away from it.",
    d: "Given a target instruction or a call stack to reproduce, the engine computes the distance from each state's location to the target and prefers closer states, often killing states for which the target is unreachable on the control flow graph. It is used to reproduce a crash from a stack trace, to test a patch by reaching its changed lines, and to confirm whether a static analysis alarm is real. Precision depends on the call graph; indirect calls make distances overestimates and mistaken prunes.",
    k: ["Aggressive pruning of states that cannot reach the target versus keeping them with low priority: pruning saves memory but a wrong call graph discards the winning path.", "Directed search from the entry versus backward from the target: forward is simple and generic, while backward constrains inputs earlier but needs inverse reasoning about states."],
    p: ["The call graph misses an indirect call to the target's function and the engine declares it unreachable.", "Directed search never leaves the target's neighborhood, so it misses the setup needed far from it."],
    v: "Give the engine the stack trace of a known crash and confirm it reaches the crash site and produces an input that reproduces the same trace, using far fewer states than undirected search.",
    dep: ["state-scheduler", "control-flow-graph-recovery", "static-analysis-feed"]
  },
  "learned-search-policy": {
    s: "Replaces a hand-written scoring rule with a model trained on past runs to predict which state is most likely to lead to new coverage or a bug.",
    d: "Features of each state, such as depth, instruction counts, the number of recent forks, call stack shape and distance to uncovered code, feed a model whose output ranks states. Training uses runs where the outcome, new coverage or finding, is known, and it can be offline on a corpus of programs or online during the run. It adapts to targets where fixed heuristics fail. The challenges are that training data is expensive, generalizing to unseen programs is unreliable, and an opaque policy is hard to debug when it stalls.",
    k: ["Offline-trained versus online-adapting policy: offline policies are stable and fast but may not fit a new program, while online ones adapt at the cost of noisy early behavior.", "Learned policy alone versus mixed into a rotation: alone can win big or fail badly, while a rotation caps the downside."],
    p: ["A policy trained on small programs fails to generalize to large ones and does worse than random selection.", "Model inference per pick is slower than the interpreter step it is choosing for."],
    v: "Evaluate the policy on programs held out of training, and confirm coverage at a fixed budget is at least that of the best hand-written strategy on most, with per-pick inference time reported.",
    dep: ["state-scheduler", "coverage-guided-search", "execution-state"]
  },
  "interleaved-searchers": {
    s: "Rotates between several strategies, such as random path and coverage-guided, giving each equal turns so that the weakness of one is covered by the strength of another.",
    d: "A wrapper holds a list of searchers and, when asked for the next state, asks them in turn. Every state is registered with all of them so any can pick it. When one picks a state the others are informed it ran. Rotation prevents a loop trap in one heuristic from stalling the run, because the next strategy picks something else. Overheads are bookkeeping in every searcher on each fork and the fact that no strategy can concentrate its effect.",
    k: ["Equal rotation versus adaptive weights: equal is simple and robust, while adaptive weights favor whichever strategy is currently finding coverage but can lock in a lucky streak.", "Shared state set versus per-strategy sets: shared is consistent and light, per-strategy lets heuristics keep private views at greater memory use."],
    p: ["A state removed from one searcher but not another is picked and found missing, and crashes the scheduler.", "One expensive searcher's update cost on every fork dominates a rotation."],
    v: "Run a target where depth-first alone gets trapped and random alone is slow, and confirm the rotation reaches the coverage of the better one within a modest constant factor.",
    dep: ["state-scheduler", "random-path-selection", "coverage-guided-search", "depth-first-search"]
  },
  "state-killing-and-limits": {
    s: "Terminates states that exceed limits on instructions, depth, time or memory, or that are unreachable, and records why, so the run stays finite and memory stays bounded.",
    d: "Limits are checked as states execute: maximum instructions on a path, maximum fork depth, maximum solver time, and a global memory cap. When memory crosses the cap, a policy chooses victims, commonly the most recently created, the deepest or random states. A killed state may still emit a partial test. Limits are the engine's last defense against explosion and an important source of incompleteness: every kill loses all paths beneath that state. Logging the count by reason is essential.",
    k: ["Kill deep states versus young states versus random: deep states are likely loops with low yield, young ones hold fresh coverage, and random avoids bias at no insight.", "Hard stop versus emit a test then stop: emitting gives a usable input but for a partial path, and costs a solver call."],
    p: ["A limit meant to catch infinite loops also kills legitimate long executions of a parser on large inputs.", "Victims are chosen only when memory is almost full, so a single large allocation triggers an out-of-memory crash first."],
    v: "Run a target with an infinite loop and a memory cap, and confirm the loop's state is killed by the instruction limit, the kill reason is logged, the other paths complete and peak memory stays below the cap.",
    dep: ["execution-state", "run-configuration-and-budgets"]
  },
  "concolic-driver": {
    s: "The loop that runs the program on a concrete input, collects its symbolic path condition, negates one branch, solves for a new input and repeats.",
    d: "Concolic execution keeps both a concrete value and a symbolic expression for every variable. The concrete run decides which way each branch goes, so no forking is needed; the symbolic side accumulates the conditions taken. After the run the driver picks a branch, flips its condition, drops the later ones, and asks the solver for an input. Because every run is a real execution, unmodeled code can simply run concretely. The cost is that it explores one path at a time and re-executes the prefix of each new input.",
    k: ["Concolic versus pure symbolic forking: concolic needs no state copying and handles unmodeled calls, but re-runs shared path prefixes and loses parallel breadth.", "Execute in-process versus a separate traced process: in-process is fast and tightly integrated, while a separate process isolates crashes and runs unmodified binaries."],
    p: ["The solver returns an input that follows a different path than predicted because of an unmodeled operation, and the loop explores the same path repeatedly.", "A program with side effects such as writing files is re-run hundreds of times and corrupts its own environment."],
    v: "Run on a program with four sequential independent branches from one seed and confirm sixteen runs eventually cover all paths, each run matching the predicted branch sequence for its input.",
    dep: ["concrete-trace-recorder", "branch-negation", "model-extraction"]
  },
  "concrete-trace-recorder": {
    s: "Records which branches a concrete run takes and the symbolic conditions guarding them, producing the path constraint that the driver later negates.",
    d: "Either an instrumented binary or a tracing runtime emits, for each conditional branch that depends on tracked input, the symbolic condition and the direction taken. It shadows data flow so that only operations touching input bytes are recorded; everything else stays concrete. The trace may include loads from symbolic addresses, where the recorder must decide how to model the index. Traces for long runs are large, so they are streamed and compressed. The challenge is completeness and speed: missing one propagation step makes the recorded condition wrong.",
    k: ["Instrument at compile time versus dynamic binary translation: compile-time is faster but needs source, while dynamic translation works on any binary at several times the overhead.", "Record every branch versus only input-dependent ones: recording all is simple and large, while filtering needs reliable taint to be correct."],
    p: ["A data-flow step through an unsupported instruction loses the symbolic link, so the recorded condition is simply missing.", "Traces of multi-minute runs exhaust disk or memory before they are solved."],
    v: "Record the trace of a known input through a function with seven input-dependent branches, and confirm seven conditions in order with the correct directions and that evaluating them on the input gives true each time.",
    dep: ["taint-tracking", "instrumentation-runtime", "expression-builder"]
  },
  "branch-negation": {
    s: "Builds a new query by keeping the conditions up to a chosen branch and inverting that one, to ask the solver for an input that takes the other direction.",
    d: "Given a recorded path condition c1 through cn, negating the k-th gives c1 and so on up to c(k-1) together with the negation of ck. If satisfiable, the model is an input expected to follow the same prefix then diverge. Which branch to negate is a policy: the last, all in order, or ones nearest uncovered code. Queries share long prefixes, which is why incremental solving and caching matter. Negating a branch whose other side was already seen is wasted work, so the driver tracks explored branches.",
    k: ["Negate only the last branch versus every branch: last-only is cheap per run, while negating all yields many new inputs per run at the cost of many queries.", "Skip already-explored branch directions versus retry: skipping saves queries, but missing a prior concretization means a skipped branch was never really covered."],
    p: ["The same negated query is solved again in each run because the cache keys differ in irrelevant details.", "Negating a branch in loop code produces an input that only changes iteration count, adding no coverage."],
    v: "Take a trace with ten branches, build all ten negation queries, and confirm each satisfiable model, when run, follows the prefix and flips exactly the intended branch.",
    dep: ["concolic-driver", "incremental-solving", "path-condition-store"]
  },
  "generational-search": {
    s: "Expands every branch of a recorded path at once, producing many children from each run, and ranks them by how much new coverage the parent gained.",
    d: "Rather than one negation per run, the engine negates every branch beyond a bound marking where the parent itself was generated, yielding a generation of new inputs. Each child records the position from which it may expand, so work is not duplicated. Children are queued by a score such as new instructions covered by the parent. This front-loads queries but gives rich input sets, which suits large inputs. Cost scales with trace length times number of runs, and solver time dominates.",
    k: ["Generational expansion versus one flip at a time: generational finds many paths per run, but spends heavily on queries whose results may never be run.", "Score by parent's coverage gain versus uniform: scoring focuses effort on productive seeds but can neglect a seed whose children are the interesting ones."],
    p: ["Long traces yield tens of thousands of queries, and the solver queue grows faster than it drains.", "The expansion bound is mishandled so children regenerate their ancestors' inputs forever."],
    v: "Run on a program with a deep chain of checks and compare coverage per hour against single-flip concolic, confirming more distinct inputs generated per run and no input duplicated across generations.",
    dep: ["branch-negation", "concolic-driver", "coverage-reporting"]
  },
  "seed-corpus-exchange": {
    s: "Moves inputs between the symbolic engine and the fuzzer in both directions: fuzzer inputs seed symbolic exploration, and solver-generated inputs are added to the fuzzer's corpus.",
    d: "A shared directory or a queue holds inputs. The fuzzer finds many cheap inputs and gets stuck at hard comparisons such as checksums or magic values. The engine picks interesting corpus items, those that reached rarely seen code, runs them concolically and solves for flipped branches near that code, then writes the new inputs back. A filter keeps duplicates and slow inputs out. The challenges are choosing which seeds are worth the expensive symbolic run and synchronizing without either side re-processing the same items.",
    k: ["Exchange through files versus a shared in-memory queue: files are simple, durable and tool-agnostic, but latency is high and polling wastes cycles.", "Send all fuzzer inputs versus only coverage-increasing ones: all gives completeness at the cost of overwhelming the slower symbolic side."],
    p: ["The engine spends hours on one seed that gets nothing while a more promising seed waits.", "An input produced by the engine is slow to run and makes the fuzzer's throughput collapse."],
    v: "Run both tools on a target with a four-byte magic comparison, and confirm the fuzzer alone never passes it while the combination does within minutes, with the engine's input visible in the fuzzer's corpus.",
    dep: ["fuzzer-bridge", "concolic-driver", "test-case-generation"]
  },
  "fuzzer-bridge": {
    s: "The adapter that connects the symbolic engine to a fuzzer's coverage feedback and scheduling, deciding when the engine is called and how its output is formatted.",
    d: "The bridge reads the fuzzer's coverage map to identify stuck points, such as branches seen taken in only one direction, and hands matching inputs to the engine with a goal. It converts the engine's tests into the fuzzer's input format and respects its queue and timing. Strategies range from loose coupling, where the engine runs when the fuzzer plateaus, to tight coupling, where each fuzzer input triggers local symbolic reasoning around one comparison. Different tools have different coverage representations, which makes the bridge fragile.",
    k: ["Loose coupling at plateaus versus tight per-input coupling: loose is simple and modular, while tight reacts faster but needs invasive integration.", "Run the engine concurrently versus time-sliced: concurrent uses spare cores and delivers continuously, while time-slicing is simpler on one machine."],
    p: ["Coverage maps with hash collisions make the bridge think a branch is stuck when it is covered.", "The engine and fuzzer disagree about input framing, so engine-made inputs are rejected."],
    v: "Plateau a fuzzer on a target, start the bridge, and confirm it identifies the stuck branches, produces inputs that flip each, and the fuzzer's coverage counter rises within the same run.",
    dep: ["seed-corpus-exchange", "coverage-reporting", "concolic-driver"]
  },
  "divergence-detection": {
    s: "Checks that a concrete run actually followed the path the solver predicted, and discards or flags the input when it did not.",
    d: "After solving a negated query the driver runs the new input and compares its branch trace with the expected prefix plus the flipped branch. A mismatch means the symbolic model was imprecise: an unmodeled function, a concretized value, a floating-point approximation or hidden state such as time. The divergent input is still a valid input and is usually kept for coverage, but its path condition is unreliable and further expansion from it is suppressed or specially handled. Detecting divergence is the way to find modeling gaps.",
    k: ["Strict equality of traces versus tolerating differences after the flip: strict finds every modeling gap but flags harmless tail differences, while tolerant ignores them.", "Drop divergent inputs versus keep them: dropping avoids wasted expansion but loses valid, possibly useful inputs."],
    p: ["Nondeterminism in the target causes a flood of divergences unrelated to modeling.", "Divergence is counted but never explained, so the gap that caused it persists."],
    v: "Insert a call to an unmodeled function whose result affects a branch, run the loop, and confirm divergence is reported at that branch with the expected and observed directions.",
    dep: ["concolic-driver", "concrete-trace-recorder", "external-call-concretization"]
  },
  "concretization-fallback": {
    s: "When symbolic reasoning is infeasible, such as a call into unmodeled code, the engine picks one concrete value for the symbolic input and carries on, trading completeness for progress.",
    d: "At a call the engine cannot model, or an operation the solver cannot express, it asks the solver for a value consistent with the current path condition, adds an equality constraint binding the symbolic value to it, and executes concretely. Alternatives are to concretize only for the call and keep the original symbolic value free, which risks false results, or to fork on several candidate values. The binding keeps the path sound but removes all paths with other values. Recording each concretization lets users see where coverage was given up.",
    k: ["Add the equality constraint versus leave it unbound: binding keeps results sound but narrows exploration, whereas unbound explores more but can report impossible behavior.", "Pick one value versus several candidate values: one is cheap, while several recover some paths at the cost of forks."],
    p: ["A concretized length field fixes the input size, so every later size-dependent bug is missed.", "The chosen value is arbitrary and always the same, such as zero, so a branch is never taken the other way."],
    v: "Call an unmodeled function with a symbolic argument, confirm the equality constraint appears in the path condition, the log records the concretization with its value, and the call's result is consistent with a real run on that value.",
    dep: ["external-call-concretization", "path-condition-store", "model-extraction"]
  },
  "state-merging": {
    s: "Combines two states at the same program point into one whose variables are if-then-else expressions over the branch condition, cutting the number of paths at the cost of harder queries.",
    d: "When two states reach the same instruction with the same call stack, the engine builds a merged state with each differing value replaced by an expression choosing between the two, and a path condition that is the disjunction of the originals. This turns an exponential number of paths into a polynomial number of states in the best case. Merged queries have disjunctions and conditional values, which can be much harder for the solver. Merging works best when the differing values are not used in later branches.",
    k: ["Merge aggressively versus never: merging prevents explosion on branch-heavy code, but some merged queries become unsolvable where separate ones were trivial.", "Merge only states whose differing values are never used in conditions versus all states: the selective rule keeps queries easy and merges less often."],
    p: ["Merging states that differ in a value later used as a pointer creates a conditional pointer, and the memory model then resolves it expensively.", "Merging reduces states but doubles solver time, so total time rises."],
    v: "Run a function with twenty independent if statements with and without merging, and confirm paths drop from about a million to a handful while the set of generated bug findings is unchanged.",
    dep: ["merge-point-selection", "expression-builder", "path-condition-store", "execution-state"]
  },
  "merge-point-selection": {
    s: "Chooses where and when states are merged, such as at join points of a branch, ahead of loops or after calls, and in what order they arrive.",
    d: "States can only merge at the same location, so the engine delays states that are ahead until others catch up. It computes join points, often immediate post-dominators of branches, and holds early arrivals until the rest reach them or a timeout passes. Heuristics estimate query cost so merges that look expensive are skipped. Ordering by topological position keeps states moving in step. A wrong choice either leaves states unmerged and explosion persists, or merges everything and the query cost explodes instead.",
    k: ["Merge at every join versus only selected ones: every join gives the biggest state reduction, while selection uses a cost estimate to avoid hard queries.", "Wait for stragglers versus merge what has arrived: waiting merges more but may stall on a state that never arrives."],
    p: ["A state that loops forever is waited for, and all other states are held up behind it.", "Estimates of query cost based on expression size are poor predictors of solver time."],
    v: "Instrument merging on a diamond-shaped control flow with a loop, and confirm states join at the post-dominator, stragglers are timed out after the limit, and no state is merged twice at one point.",
    dep: ["state-merging", "control-flow-graph-recovery", "state-scheduler"]
  },
  "function-summaries": {
    s: "Records what a function does as a pair of pre- and post-conditions the first time it is explored, and reuses it at later calls so the body is not re-executed.",
    d: "While executing a function, the engine collects, for each path through it, the condition on its inputs and the resulting outputs and side effects. At later call sites it instantiates the summary, forking on its cases, instead of stepping through the body again. This helps for functions called from many places or with deep internal path counts. Summaries must account for global state and memory the function touches, which is the difficulty. A summary that omits a side effect makes later results wrong, and big summaries cost more than re-running.",
    k: ["Summarize a function versus inline it every time: summaries save repeated work and compact deep call chains, but side effects on memory make correct summaries hard.", "Lazy summaries built on first use versus precomputed: lazy is simple and driven by need, while precomputed enables parallel work and static reuse."],
    p: ["A summary built under one calling context is reused in another where globals differ, producing wrong results.", "Summaries for functions with many paths are so large that applying them is slower than executing the body."],
    v: "Summarize a pure function called from a hundred sites, confirm the body is executed once, and compare findings with those from full inlining on the same target to confirm they are identical.",
    dep: ["execution-state", "path-condition-store", "library-summaries"]
  },
  "loop-bounds": {
    s: "A cap on how many times a loop body or a recursive call may run on one path, making the search finite at the price of ignoring executions that need more iterations.",
    d: "A symbolic loop condition forks at each iteration: continue or exit. Without a bound this never ends. A bound counts iterations per loop head per path, or call depth per function, and kills or terminates states that exceed it. Common settings are a small constant, an adaptive bound increased in stages, or a bound derived from declared input sizes. Bounds are the largest single source of lost paths: bugs requiring more iterations, such as a buffer overflow after exactly N bytes, are invisible.",
    k: ["Small fixed bound versus iterative deepening: a fixed bound is predictable, while repeated runs with growing bounds find more but repeat work.", "Terminate the state at the bound versus force the loop to exit: terminating discards the path, forcing an exit keeps it but may not satisfy the loop's condition."],
    p: ["A buffer of 256 bytes is only overflowed by a loop of 257 iterations, and a bound of 100 makes the program appear safe.", "Nested loops make a bound per loop explode multiplicatively."],
    v: "Plant a bug that needs 40 iterations, run with bounds of 10 and 50, and confirm only the second finds it and that the report from the first lists the loop's cutoff.",
    dep: ["execution-state", "run-configuration-and-budgets"]
  },
  "loop-summarization": {
    s: "Replaces a loop with a closed-form description of its effect, such as an induction variable's final value or an invariant, so one symbolic step stands for any number of iterations.",
    d: "The engine recognizes common loop shapes: counted loops, string length and copy loops, and accumulators. For each it infers how variables change per iteration and writes the post-loop value as an expression over the iteration count. Where inference fails, an annotation or an invariant supplied by the user may stand in. This removes the dependence on any bound for these loops. The method is only as good as its pattern recognition; irregular loops fall back to bounded unrolling, and a wrong summary silently produces wrong constraints.",
    k: ["Automatic inference versus user-written invariants: automatic needs no effort but handles few shapes, while invariants cover anything and can be wrong.", "Summarize at the IR level versus at the source level: IR summaries work on any target but lose structure, and source summaries are clearer but need source."],
    p: ["A loop with an early exit is summarized as if it ran to completion, missing the exit paths.", "Quantifiers introduced by summaries confuse the solver and make queries time out."],
    v: "Summarize a counted copy loop over a symbolic length, and confirm the result agrees with unrolling to every length up to a bound and handles lengths beyond it in one step.",
    dep: ["loop-bounds", "ir-normalization", "expression-builder"]
  },
  "state-subsumption": {
    s: "Discards a state when an earlier state at the same program point already explored a more general set of conditions, since nothing new could be found from it.",
    d: "At selected points, often loop heads or join points, the engine records the abstracted state and the constraints under which the future was explored. A new arrival whose constraints imply those of a recorded state, and whose relevant values are covered, is pruned. This is similar to caching in model checkers. Computing the relevant part, such as only the variables used later, is the hard part, as are implication checks, which are solver calls. When it works it can collapse an infinite family of equivalent paths into a few.",
    k: ["Subsumption check at every point versus only at loop heads: every point catches more but costs a solver call per state, while loop heads target the major source of explosion.", "Check on the full state versus only live variables: live-variable checks subsume far more states, but need accurate liveness including memory."],
    p: ["A state is pruned because of memory the subsuming state never read, so a bug through that memory is missed.", "Implication queries take longer than just executing the state."],
    v: "Run a loop that repeats an identical computation, confirm after the second iteration the new state is pruned, and confirm the findings are the same as without subsumption on a target with seeded bugs.",
    dep: ["execution-state", "path-condition-store", "solver-backend-interface"]
  },
  "symmetry-reduction": {
    s: "Avoids exploring states that differ only by a renaming or reordering of equivalent symbolic objects, such as interchangeable array elements or identical threads.",
    d: "If two inputs are interchangeable, the paths from swapping them are copies. The engine imposes an ordering constraint, for instance requiring elements to be sorted, or canonicalizes object identities, so only one representative of each equivalence class is explored. It applies to collections of symmetric objects, equivalent threads in a model of concurrency and symbolic file names. The gain can be factorial. The danger is that the assumed symmetry is false, such as when iteration order matters, and valid behaviors are discarded.",
    k: ["Impose an ordering constraint versus detect equivalence on the fly: constraints are simple and cheap to apply, whereas detection is general but needs canonical forms.", "Apply automatically versus on user annotation: automatic helps naive users but risks false symmetry, while annotation is safe and needs knowledge."],
    p: ["The code depends on an element's position, so the ordering constraint removes a real case.", "Canonicalization costs more than the states it saves on small collections."],
    v: "Make three symmetric symbolic items in a set, count explored paths with and without reduction, and confirm six-fold fewer paths with identical bug findings on a symmetric target.",
    dep: ["execution-state", "path-condition-store", "symbolic-input-declaration"]
  },
  "static-path-pruning": {
    s: "Uses facts from static analysis, such as unreachable blocks, constant values and dead stores, to drop branches and calls the engine would otherwise fork on.",
    d: "A prepass runs cheaper analyses over the program and records facts: a branch always goes one way, a function cannot reach any target, a variable is not read afterward. The engine checks them before forking or issuing queries and skips what is decided. Pruning can also remove irrelevant code from the analyzed program, called slicing, shrinking everything downstream. The analyses must be sound, or must be known to be unsound and labeled, since a false claim silently removes feasible paths.",
    k: ["Sound conservative analysis versus aggressive heuristic: conservative never loses paths but prunes less, while heuristic prunes more and risks missing bugs.", "Slice the program upfront versus prune dynamically: slicing makes everything faster but costs precomputation and loses debugging fidelity, while dynamic is simple and gains less."],
    p: ["An analysis that ignores aliasing declares a value constant that another pointer changes.", "Facts are computed for one build configuration and applied to another."],
    v: "Run a static analysis marking a set of dead branches, run the engine with pruning, and confirm no pruned branch is taken by any test from an unpruned run, with the fork count reduced.",
    dep: ["static-analysis-feed", "branch-forking", "control-flow-graph-recovery"]
  },
  "parallel-exploration": {
    s: "Runs several worker threads or processes that each execute different states, sharing a work queue and the solver caches, to use all cores of a machine.",
    d: "States are mostly independent, so workers pull them from a shared pool and fork back into it. Challenges are the shared data: the query cache, coverage map, scheduler and test writer. Each worker usually has its own solver instance since solver contexts are not shared. Work can be distributed by handing whole subtrees, which keeps cache locality, or by random states, which balances load. Results are no longer deterministic unless exploration is carefully ordered, and speedup is limited by the solver and by contention on shared structures.",
    k: ["Shared cache across workers versus private caches: shared hits more but contends on locks, while private is lock-free but repeats queries between workers.", "Hand out subtrees versus individual states: subtrees keep locality and cheap sharing, while individual states balance load better."],
    p: ["Workers contend on one lock around the coverage map and scale poorly past four cores.", "One worker gets a huge subtree and the others sit idle."],
    v: "Run with one, four and sixteen workers on a fixed budget of work, and confirm speedup near the worker count for low contention targets and that the findings found are the same set.",
    dep: ["state-scheduler", "query-cache", "execution-state"]
  },
  "distributed-state-queue": {
    s: "Spreads exploration across many machines by serializing states, sending them through a shared queue, and collecting findings and coverage centrally.",
    d: "A coordinator holds a frontier of serialized states or of prefixes of branch decisions that let a worker recreate the state by re-execution. Workers lease items, explore for a time slice, return new states and results, and report heartbeats. Sending decision sequences is far smaller than sending memory images but costs re-execution time. Coordination handles worker failure, duplicate work, and global budget. It makes very long runs possible but adds fault-tolerance and cost concerns beyond those of one machine.",
    k: ["Ship serialized states versus replay decision prefixes: serialized states resume instantly but are large, while prefixes are tiny and cost re-execution.", "Central coordinator versus peer-to-peer work stealing: central is simple and observable, whereas stealing removes the bottleneck but is harder to reason about."],
    p: ["A worker dies holding a lease and its subtree is lost without a timeout to requeue it.", "The coordinator becomes the bottleneck as thousands of tiny states are requested."],
    v: "Run on a cluster with a worker killed midway, and confirm leased states are requeued after the timeout, the final coverage equals a single-machine run with the same total work, and no finding is duplicated.",
    dep: ["parallel-exploration", "execution-state", "run-configuration-and-budgets"]
  }
});
