// Details for the symbolic execution plate, part 1: setup, outputs, cross-cutting concerns.
ATLAS.details("symbolic-execution", {
  "harness-and-entry-points": {
    s: "The small program or function wrapper that sets up symbolic inputs, calls the code under test and defines what counts as finished, so the engine explores a bounded piece of the target.",
    d: "Running a whole program from its real entry point drags in initialization, parsing and library code the analyst does not care about. A harness instead calls one function or one parsing routine with inputs declared symbolic, builds the objects it needs, and ends at a clear exit. It can be written in the target's own source, in a driver script, or generated from a function signature. The difficulty is realism: a harness that builds impossible states reports false bugs, and one that is too narrow hides real ones.",
    k: ["Whole-program entry versus unit-level harness: whole program finds integration bugs but explodes in startup code; a unit harness is fast but reports bugs callers could never trigger.", "Hand-written versus generated harness: generation scales to many functions, but hand-written ones encode valid object relationships generated ones guess wrong."],
    p: ["A harness that leaves a pointer field symbolic without a validity assumption reports null dereferences that no real caller can cause.", "Harness code itself gets explored and consumes the budget on setup rather than on the target."],
    v: "Run the harness on a function with a known planted bug and confirm a concrete input reaches it, then run on the fixed version and confirm zero findings and full path coverage of the function.",
    dep: ["symbolic-input-declaration", "front-end-ir"]
  },
  "symbolic-input-declaration": {
    s: "The mechanism by which a harness or command line marks bytes, integers, buffers or whole files as unknown, giving each a name, a size and optional bounds.",
    d: "A declaration call allocates memory or registers and attaches a fresh symbolic array or variable, usually with a name that will appear in output. Sizes may be fixed or bounded, since an unbounded buffer is not representable. Inputs can be scalars, byte buffers, structured records built from several variables, or whole streams from files and sockets. The engine records the declaration order so a solved model can be mapped back to the exact bytes of each input in the generated test.",
    k: ["Many small named variables versus one large byte array: small variables give readable tests and narrower queries, but a single array models parsers that index arbitrarily.", "Fixed size versus several runs at increasing sizes: fixed is simple, while sweeping sizes finds length-dependent bugs at the cost of repeating work."],
    p: ["Declaring an input too large makes every path touch many bytes and every query huge, so the run stalls before finding anything.", "Declaring inputs in a different order between runs makes tests from two runs impossible to compare."],
    v: "Declare a four-byte symbolic buffer, run a function that branches on its first byte equaling a specific value, and confirm exactly two test cases with a named buffer whose first bytes differ accordingly.",
    dep: ["expression-builder", "symbolic-array-theory"]
  },
  "preconditions-and-assumptions": {
    s: "Constraints added to the path condition up front, stating what valid inputs look like, so the engine does not waste effort on or report findings for inputs the real system rules out.",
    d: "An assumption call adds a Boolean expression to the current path condition without forking. A path that contradicts it is silently dropped. Typical uses are length limits, valid enumeration values, sorted ordering and non-null pointers. They can also encode protocol rules. Assumptions are not checked; they are trusted, which is why they are the main source of unsound results when written too strongly. Engines usually log the number of paths killed by each one so over-constraint is visible.",
    k: ["Strong assumptions versus weak ones: strong ones keep the search focused and kill false alarms, but a wrong assumption hides real bugs without any warning.", "Assume versus check: assuming prunes quickly, while asserting the same condition in callers' code verifies the contract itself, at the cost of finding bugs outside the unit."],
    p: ["An assumption that is accidentally unsatisfiable makes every path vanish and the run reports full coverage of nothing.", "Assumptions copied from documentation that is out of date exclude exactly the inputs that crash production."],
    v: "Add an assumption that contradicts a known buggy input range and confirm the bug disappears, with the log showing the count of paths pruned by that assumption. Remove it and confirm the bug returns.",
    dep: ["path-condition-store", "symbolic-input-declaration"]
  },
  "run-configuration-and-budgets": {
    s: "The settings that bound a run: time, memory, depth, number of states, solver time per query, loop bounds and which search strategies and checks are active.",
    d: "A configuration file or command line selects the scheduler mix, enables oracles, and sets hard limits. Limits exist at several levels: wall-clock for the entire run, per-state instruction count, maximum fork depth, memory cap that triggers state killing, and a per-query solver timeout. Configuration is also the place where fidelity switches live, such as whether symbolic pointers are resolved precisely. The difficulty is that good settings depend on the target; the defaults rarely suit a given program, and results are meaningless without recording them.",
    k: ["Tight budgets versus generous ones: tight budgets give fast, predictable CI runs but stop before deep bugs; generous ones find more and cost machine hours that may not be available.", "Configuration in a file versus on the command line: files are reviewable and reproducible, while flags are quick to change but easily lost."],
    p: ["Results are compared across runs with different budgets, so a regression is blamed on code when the limit changed.", "A memory cap set too close to the machine's total causes the operating system to kill the engine and lose all findings."],
    v: "Run the same target twice with the same configuration and confirm identical path counts and test sets. Lower the memory cap and confirm the engine reports killed states instead of crashing.",
    dep: []
  },
  "build-integration": {
    s: "The glue that compiles or packages the target in a form the engine can consume, with the right flags, instrumentation and libraries, as part of a normal build or CI job.",
    d: "Source targets must be compiled to the engine's intermediate form with optimizations that keep checks visible, and linked against modeled libraries instead of the real ones. Binary targets need the exact artifact, symbols and loader inputs. Build integration provides wrappers for the compiler and linker, caches build products, pins versions and exposes the output as a normal build target. It also records the commit and flags used, because a finding is useless if the exact build cannot be recreated.",
    k: ["Analysis build separate from release build versus one build: a separate build uses flags that help the engine, but may behave differently from what ships.", "Compiler wrappers versus explicit analysis targets: wrappers find everything automatically, while explicit targets are predictable but need maintenance."],
    p: ["The analysis build optimizes away a bounds check, so the engine proves the shipped code safe by analyzing different code.", "Mismatched library versions between the analysis build and production produce findings that do not reproduce."],
    v: "Build the target through the integration, run the engine on the output in CI, and confirm the recorded commit and flags let a clean checkout reproduce byte-identical IR and identical findings.",
    dep: ["front-end-ir", "program-loader"]
  },
  "scripting-api": {
    s: "A programmatic interface for driving the engine: creating states, stepping, adding constraints, reading memory and registering callbacks, used for custom analyses and tool integrations.",
    d: "Instead of a fixed command line, a library interface exposes the engine's objects: the program, an initial state, a scheduler, and hooks on events such as instruction executed, memory read or branch taken. Scripts replace function bodies with their own models, inject constraints, query the solver and step a state manually. This is how researchers build custom bug oracles or reproduce exploits. The difficulty is stability: internal data structures are exposed, so an interface that is too thin limits users and one that is too thick locks the engine design in place.",
    k: ["Event hooks versus subclassing core components: hooks are easy to attach and stay compatible, while subclassing gives control at the cost of breaking on every internal change.", "Interpreted scripting versus compiled plugins: scripts iterate quickly but run slowly in hot hooks, whereas plugins run fast but need a build step."],
    p: ["A hook on every instruction slows the engine by orders of magnitude without anyone noticing it was left on.", "A script mutates a state shared by two forks, so one path's change appears in another."],
    v: "Register a hook that counts executed branches in a script, run on a target with a known number of branch sites, and confirm the count matches an independent trace of the same input.",
    dep: ["execution-state", "state-scheduler", "instruction-interpreter"]
  },
  "test-case-generation": {
    s: "Solves each completed path's constraints for concrete input values and writes them as a runnable test, one per path or one per newly covered line.",
    d: "When a state terminates, the engine asks the solver for a model of its path condition, then maps each symbolic variable to bytes of the declared inputs and writes them with the exit status and the path's branch trace. Writing a test for every path produces thousands of near-duplicates, so most engines write only for terminated paths that add coverage, hit an error, or are requested explicitly. Filling values the path does not constrain with a default keeps tests stable. The cost is one solver call per test.",
    k: ["Test per path versus per newly covered code: per path gives thorough regression suites but floods storage; per coverage gain keeps tests few but loses variety.", "Solver's arbitrary values versus preferred defaults such as zero: defaults give readable, stable tests but can need extra queries."],
    p: ["A path ends by timeout or limit and a test is generated for a partial path condition, giving an input that does not follow that path.", "Unconstrained bytes take solver-chosen values that change between solver versions, making tests unstable."],
    v: "Generate tests for a parser, replay each concretely against the uninstrumented program, and confirm every replay follows the recorded branch trace and covers the line it was created for.",
    dep: ["model-extraction", "path-condition-store", "symbolic-input-declaration"]
  },
  "bug-reports": {
    s: "Structured records of a detected violation: its kind, location, call stack, the path's constraints, and the concrete input that triggers it.",
    d: "When an oracle's query is satisfiable, the engine pauses the state, extracts a model, and writes a report with the faulting instruction mapped back to source, the stack trace, the input values and often the sequence of branch decisions. Reports are written as text for people and a structured form for triage tools. A good report states what was violated and why the path is feasible, not just that something failed. The difficulty is that the symbolic path can be long, so presenting it in terms a developer can follow takes real effort.",
    k: ["Report at first violation versus continue and collect all: stopping gives one clear finding per path, while continuing finds more but cascades into noise after state corruption.", "Terse reports versus full path conditions: terse ones are easy to read, whereas full constraints let experts judge feasibility without rerunning."],
    p: ["The report points to the instruction in lifted code with no mapping back to source lines, so developers cannot find it.", "After a first memory error the state is corrupt and later reports are consequences, not separate bugs."],
    v: "Plant an out-of-bounds write, run the engine, and confirm the report names the correct source line and variable, and that feeding its input to the real binary reproduces the fault.",
    dep: ["memory-error-checks", "debug-info-mapping", "model-extraction"]
  },
  "witness-replay-harness": {
    s: "Runs the real, uninstrumented program on a generated input to confirm that the engine's finding or path is genuine and not an artifact of modeling.",
    d: "A replay tool feeds the generated bytes to the original binary through its real input channels, such as standard input, a file or arguments, and watches for the claimed fault using a sanitizer build, a debugger or crash signals. It compares the observed outcome with the engine's prediction and labels each finding confirmed, unconfirmed or divergent. It is the main protection against false positives, since modeled libraries or approximated pointers can misreport behavior. The hard part is recreating the environment: files, time, locale and threads all affect whether the run matches.",
    k: ["Replay every finding versus replay only high severity: replaying everything gives a verified list but costs time; selective replay is cheaper but leaves false alarms for people.", "Replay in a sanitizer build versus the shipped build: sanitizers expose more faults, but a fault there may not occur in the release binary."],
    p: ["A finding fails to replay because the environment differs, and is wrongly discarded as a false positive.", "A replay succeeds by crashing for a different reason than the one the engine reported."],
    v: "Take twenty reported findings, replay each against the real binary under a fault detector, and confirm the proportion that reproduce with the same fault location is recorded alongside each report.",
    dep: ["bug-reports", "test-case-generation", "program-loader"]
  },
  "finding-minimization": {
    s: "Shrinks a bug-triggering input to the smallest or simplest one that still hits the same fault, so a developer can read and understand it.",
    d: "Solver models are arbitrary: a four-kilobyte buffer where only three bytes matter. Minimization asks for a model with the fewest non-default bytes, or removes bytes and fields and replays to check the fault remains. Constraint-based approaches add soft constraints preferring zero or printable values and ask for an optimal model; replay-based approaches delete chunks and test. The cost is repeated solver calls or runs. The difficulty is knowing what the same fault means, since a smaller input may hit a different bug.",
    k: ["Constraint-based minimization versus replay-based: constraints are exact within the modeled path but need optimizing solver features; replay needs no modeling but only sees what the real program does.", "Minimize every finding versus on request: always minimizing makes reports uniform but costs solver time on thousands of findings."],
    p: ["The minimized input triggers a different, shallower bug, so the report describes one problem and its input shows another.", "Aggressive shrinking removes bytes that make the input structurally valid, giving something a developer thinks is nonsense."],
    v: "Minimize an input for a known fault, replay both versions, and confirm both fault at the same location with the same stack while the minimized input has strictly fewer non-default bytes.",
    dep: ["model-extraction", "witness-replay-harness", "incremental-solving"]
  },
  "finding-deduplication": {
    s: "Groups reports that share a root cause, using fault location and call stack, so a thousand paths into the same bug show up as one item.",
    d: "One flawed function reached from many callers, or via many paths, produces many violations. Deduplication computes a signature from the fault kind, the faulting instruction and a truncated call stack, optionally including the variable involved, and keeps one representative with a count. Some engines also compare path constraints or the sets of branches. Too coarse a signature merges distinct bugs; too fine a signature leaves duplicates. The challenge is that the same bug can surface at different instructions after a corrupt state propagates.",
    k: ["Stack-depth-limited signature versus full stack: truncated signatures merge different callers of one bug, while full stacks split a single bug into many reports.", "Signature on faulting instruction versus on the root cause: instruction signatures are easy to compute, but root cause needs analysis of how bad data arrived."],
    p: ["Two distinct bugs in a shared helper get one signature, and the second is never fixed.", "Inlining or build changes alter addresses so identical bugs get different signatures between runs."],
    v: "Feed in one hundred reports comprising five seeded distinct bugs reached through different callers and confirm exactly five groups result, each with the correct count.",
    dep: ["bug-reports", "debug-info-mapping"]
  },
  "coverage-reporting": {
    s: "Reports which instructions, lines and branches the exploration reached, and which were proven unreachable or abandoned, so users know what was and was not examined.",
    d: "The engine marks each instruction as it is executed in any state and maps marks back to source lines and branch outcomes using debug information. Reports show line and branch coverage, plus categories specific to symbolic runs: reached but with a path cut short by limits, never reached, and covered only under concretization. The last column matters most, since a covered line may have only been run with one value. The difficulty is attributing coverage across merged states and lifted code where one source line becomes many instructions.",
    k: ["Instruction coverage versus branch outcome coverage: instruction coverage is simple, while branch outcomes expose branches taken only one way at higher bookkeeping cost.", "Coverage as claimed by the engine versus measured on replayed tests: engine-claimed is immediate, but replayed measurement confirms it with the real program."],
    p: ["Reporting a function as covered when only one path was taken gives a false sense of having examined its behavior.", "Compiler-generated code inflates the denominator, so coverage appears lower than it is for developer-written code."],
    v: "Run on a program with a known number of branches, compare the engine's branch coverage with a coverage tool run on the replayed tests, and confirm they agree except where the report flags limits.",
    dep: ["debug-info-mapping", "control-flow-graph-recovery", "test-case-generation"]
  },
  "regression-suite-export": {
    s: "Writes generated tests in a form the project's own test runner executes, so findings become permanent tests that fail until fixed and keep passing afterward.",
    d: "Exported tests are inputs in files plus a thin runner, or generated source with the values embedded, labeled by the bug or path they came from. The suite is checked into the project and run in CI against the normal build. Exports record the expected outcome, such as an exit code or a fault, so a fixed bug turns the test from failing to passing and stays a guard. The hard part is maintenance: when behavior changes legitimately, hundreds of path-specific tests break together.",
    k: ["Raw input files versus generated source tests: files are simple and format-neutral, whereas source tests read naturally in the project but couple to its API.", "Export every path versus a distilled suite: complete suites catch more regressions but are slow and brittle; a distilled one keeps one test per coverage gain."],
    p: ["Tests encode the current, buggy behavior as expected, so fixing the bug fails them and people delete them.", "A large generated suite slows CI until people stop running it."],
    v: "Export the tests from a run, apply a fix for one seeded bug, and confirm exactly the tests tied to that bug flip from failing to passing in the project's normal test command.",
    dep: ["test-case-generation", "witness-replay-harness"]
  },
  "progress-reporting": {
    s: "Live statistics during a long run: states alive, states completed, queries and their timings, coverage over time and memory use, so operators can judge whether to wait or stop.",
    d: "The engine writes periodic counters and a coverage-versus-time series to a log or a dashboard. Useful figures include instructions per second, forks per second, the fraction of time in the solver, cache hit rates, and queue depth. A coverage curve that has been flat for an hour usually means the search is stuck. Reports also include counts of killed states by reason. The challenge is overhead and honesty: counters touched on every instruction cost time, and averages hide a single query that took half the run.",
    k: ["Sampled periodic stats versus event logs: periodic samples are cheap and compact, but event logs show which query or state caused a stall.", "Single aggregate dashboard versus per-worker views: aggregates are easy to read, while per-worker views expose an imbalanced parallel run."],
    p: ["The fraction of time in the solver is not tracked, so a run that is ninety percent solver time is tuned in the interpreter.", "Progress output to a terminal on a fast loop slows the run itself."],
    v: "Start a run on a target known to stall in the solver and confirm the statistics show solver time near the stall duration, the coverage curve flat, and the stuck query's size in the log.",
    dep: ["state-scheduler", "query-cache"]
  },
  "soundness-and-completeness": {
    s: "Which kind of wrong answer the engine accepts: missing real bugs through approximation, or reporting bugs that cannot happen, and where each choice is made across the components.",
    d: "A perfect engine would find every feasible bug and report only feasible ones. Real engines give up one or the other. Concretizing a value, ignoring a library effect, bounding a loop, or killing a state at a limit all lose paths, so absence of findings proves nothing. Over-approximating a summary or a pointer can report impossible bugs. The decisions live in many places, so the engine needs to log each point where it approximated, letting users judge what a clean result actually covers.",
    k: ["Favor no false positives versus no missed bugs: replay-confirmed findings suit developers, while over-approximation suits assurance but needs triage work.", "Silent approximation versus recorded approximation: silent is simpler, but recording each concretization makes a clean result interpretable at the cost of log volume."],
    p: ["A run that finishes with no findings is reported as verified, when every interesting path was bounded away.", "Different components approximate in incompatible directions, so no one can state what the overall result means."],
    v: "Run on a program with a seeded bug behind a concretized library call and confirm the engine's approximation log names that call, and that the report lists the bug as missed or unexplored.",
    dep: ["external-call-concretization", "loop-bounds", "state-killing-and-limits"]
  },
  "path-explosion": {
    s: "The exponential growth in feasible paths as branches and loops multiply, which makes exhaustive exploration impossible and shapes the design of the scheduler, merging and limits.",
    d: "Each independent input-dependent branch doubles the number of paths, so a program with thirty such branches has a billion. Loops with symbolic bounds produce unbounded numbers. Everything in the strategy layer exists to cope: ordering paths so the interesting ones come first, merging paths, summarizing functions, bounding loops, pruning by static facts and distributing work. Each technique trades something, so the decision is not whether to use them but which approximations a given target and goal can accept.",
    k: ["Merge paths versus keep them separate: merging cuts states exponentially but produces harder queries; separate states give simple queries but may never finish.", "Bound the search versus explore until done: bounds give predictable runs but incomplete results; open-ended runs may never end."],
    p: ["A parser loops over input bytes, each with a branch, and the engine spends its entire budget on one input's variants.", "Techniques are combined without understanding how they interact, so merging defeats a search heuristic that assumed distinct states."],
    v: "Run on a function with a loop over ten symbolic bytes, measure states created with each technique on and off, and confirm the counts fall as expected while the same set of seeded bugs is found.",
    dep: ["state-scheduler", "state-merging", "loop-bounds", "function-summaries"]
  },
  "determinism-and-reproducibility": {
    s: "Whether the same target and configuration give the same states, queries and findings every time, and whether a finding can be rebuilt later from its recorded inputs.",
    d: "Sources of nondeterminism are random scheduler choices, hash table iteration order, solver timeouts that depend on machine load, parallel workers racing, solver models that differ between versions, and addresses assigned from the host. Making runs deterministic requires seeded random numbers, ordered containers, instruction-count budgets rather than wall-clock ones, and a pinned solver. It matters because debugging a search heuristic or a missed bug is impossible if the run cannot be repeated, and because findings must be reproducible by someone else.",
    k: ["Instruction-count limits versus wall-clock limits: counts reproduce exactly, but wall-clock matches actual time budgets and is what users usually care about.", "Single-threaded deterministic mode versus parallel nondeterministic: deterministic makes debugging easy but is slower; parallel finds more per hour but cannot be replayed exactly."],
    p: ["A solver timeout set in seconds makes a path feasible on one machine and abandoned on another.", "A solver upgrade changes which model is returned and every stored test changes bytes."],
    v: "Run twice with the same seed and configuration on the same target, and confirm identical sequences of state ids, query hashes and generated test bytes, including after a restart from a saved snapshot.",
    dep: ["state-scheduler", "solver-timeouts", "run-configuration-and-budgets"]
  },
  "modeling-fidelity": {
    s: "How faithfully the engine represents the machine and its environment, from bit-exact arithmetic and memory layout to library behavior, and how that choice trades accuracy against speed.",
    d: "Each model sits on a scale. Integers can be bit-vectors with exact wraparound or unbounded mathematical integers that are faster and wrong at the edges. Memory can be a flat byte array or a set of separate objects. Floating-point can be exact, approximated with reals or concretized. System calls can be fully modeled or run for real. High fidelity finds bugs at the edges, such as overflow and alignment, but yields harder queries. Low fidelity runs faster and may report impossible results or miss real ones.",
    k: ["Bit-precise versus idealized arithmetic: bit-precise catches overflow and truncation bugs but costs solver time; idealized is faster and misses exactly those bugs.", "One uniform fidelity versus a per-component setting: uniform is simple to explain, but per-component settings spend precision where bugs are likely."],
    p: ["Treating pointers as integers loses the difference between objects, so out-of-bounds into a neighbor looks fine.", "A model that is more accurate than the target's real platform reports bugs that do not occur on the deployed system."],
    v: "Run a test containing a signed overflow, an alignment fault and a floating-point rounding case under each fidelity setting and confirm the findings match a table of expected results for that setting.",
    dep: ["bit-precise-arithmetic", "object-memory-model", "syscall-models"]
  },
  "resource-budgets": {
    s: "The limits that keep a run finite: how much time, memory, solver effort and state count each part may use, and what the engine does when a limit is hit.",
    d: "Time budgets cap the run and each query. Memory budgets cap the live states, which are the largest consumer. State counts and fork depth limit exploration. When a limit is reached the engine must choose what to give up: kill the largest or oldest states, switch to a cheaper search, concretize more values, or stop. Budgets are also how the engine is shared in CI, where each target gets a slice. They are hard because the dominant cost varies by target, so no single split suits all.",
    k: ["Kill states when memory is high versus swap or spill to disk: killing is fast and loses paths, whereas spilling keeps them and is far slower.", "Fixed time slice per target versus adaptive: fixed is predictable for CI, while adaptive gives more time to targets still finding new coverage."],
    p: ["A budget is only checked between instructions, so a single enormous query blows through it.", "Killing the youngest states removes exactly the ones nearest to uncovered code."],
    v: "Set a low memory cap on a branching target and confirm the engine kills states by the documented policy, stays under the cap, logs how many were killed, and still completes with partial coverage reported.",
    dep: ["run-configuration-and-budgets", "state-killing-and-limits", "solver-timeouts"]
  },
  "testing-the-engine": {
    s: "How the engine's own correctness is checked, because a bug in it silently produces wrong tests, missed findings or unreproducible reports.",
    d: "An engine has many ways to be wrong without crashing: an incorrect expression simplification, a wrong memory model for a corner case, a mismodeled system call, a cached answer reused when it should not be. Defenses include differential testing of the simplifier against a reference evaluator on random expressions, replaying every generated test on the real program, running on programs with known bug and path counts, and comparing two solvers on the same queries. Results that disagree point to a defect in one of them.",
    k: ["Differential testing against a reference versus hand-written expected outputs: references find unexpected bugs at scale, while hand-written cases are precise but cover only what authors imagined.", "Replaying every test versus sampling: full replay gives continuous validation but costs real execution; sampling is cheaper and misses rare errors."],
    p: ["A simplifier rule is wrong only for a particular bit width and goes unnoticed for years because ordinary targets never hit it.", "Tests only check that findings are reported, not that paths are complete, so path-losing bugs pass."],
    v: "Generate ten thousand random expressions, evaluate each with the simplifier on and off under random concrete assignments, and confirm every result matches. Run two solvers on a query corpus and confirm identical satisfiability answers.",
    dep: ["expression-simplifier", "witness-replay-harness", "solver-backend-interface"]
  }
});
