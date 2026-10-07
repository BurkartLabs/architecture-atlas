// Details for the symbolic execution plate, part 4: solver interface, environment modeling, program representation.
ATLAS.details("symbolic-execution", {
  "query-formulation": {
    s: "Builds the satisfiability question for each decision: the relevant path constraints plus the condition being tested, expressed over bit-vectors and arrays in the solver's input language.",
    d: "A query is a set of constraints and a question: is the condition valid, satisfiable, or what values can an expression take. The formulator selects the constraints from the path condition, converts the engine's expression graph into the solver's term format, and chooses the form of the question, such as must-be-true, may-be-true or get-value. Many engines ask a combined question that returns both outcomes of a branch in one call. Conversion cost matters for large expressions, and conversion bugs here produce errors that look like solver bugs.",
    k: ["Ask satisfiability of the condition and its negation separately versus one combined query: separate is simple and may cost two calls, while combined returns more per call and needs extra logic.", "Send the whole path condition versus only relevant constraints: the whole is simple and slow, relevant-only is fast and depends on correct slicing."],
    p: ["A term conversion drops a width extension and the solver answers a different question from the one intended.", "Rebuilding the same large term for each query dominates time."],
    v: "Form queries for a set of conditions with known answers and confirm satisfiability results and returned models agree with exhaustive evaluation over small bit-widths.",
    dep: ["independence-slicing", "expression-builder", "solver-backend-interface"]
  },
  "independence-slicing": {
    s: "Splits a query into groups of constraints that share no variables and sends only the group relevant to the new condition, because the others cannot affect its answer.",
    d: "Constraints form a graph where two are linked if they mention the same variable. The new condition touches some variables, and only the connected component of constraints reaching those variables matters. Others are dropped. This turns a query over a hundred input bytes into one over a few, giving large speedups and better cache hits, since small queries repeat across paths. Components can be maintained incrementally as constraints are added, using union-find over variables.",
    k: ["Compute components per query versus maintain incrementally: per query is simple and repeats work, while incremental needs updates on every constraint addition and shares across queries.", "Variable-level independence versus byte-level: byte-level is finer and exposes more independence in arrays, with more bookkeeping."],
    p: ["A single constraint mentioning every byte, such as a checksum, links everything and defeats slicing.", "A dropped constraint that mattered through an array alias gives a wrong answer."],
    v: "Make a path with twenty constraints over twenty separate bytes, query one byte, and confirm the solver receives only its constraints, with answers identical to unsliced queries on a random sample.",
    dep: ["path-condition-store", "expression-builder"]
  },
  "expression-simplifier": {
    s: "Rewrites expressions into simpler equivalent ones before they reach the solver, applying algebraic identities, constant propagation and known-bit reasoning.",
    d: "Rules include folding constants, removing double negation, collapsing extract-of-concatenate, replacing x minus x by zero, and recognizing comparisons that are always true by range reasoning. A simplifier can also use equalities in the path condition, substituting a variable by its known value. It runs on construction or just before queries. Good simplification removes many queries entirely. Every rule is a chance for a subtle error, since a wrong rewrite makes the engine disagree with the machine, which is why simplifiers are tested against a reference evaluator.",
    k: ["Few safe rules versus many aggressive rules: few rules are easy to trust, while aggressive ones reduce solver time and raise the risk of unsound rewrites.", "Simplify with path-condition equalities versus without: using them shrinks queries but makes expressions depend on the state, harming cache sharing."],
    p: ["A rule that is right for 32-bit values is wrong for 8-bit ones through an overflow case.", "Repeated simplification of a huge shared expression is not memoized."],
    v: "Evaluate random expressions before and after simplification on random concrete values and confirm identical results for millions of cases, and that a known redundant query is eliminated without calling the solver.",
    dep: ["expression-builder", "bit-precise-arithmetic"]
  },
  "query-cache": {
    s: "Remembers results of earlier queries, keyed by the constraint set and question, so identical questions on different paths are answered without calling the solver.",
    d: "After slicing, many paths ask the same small question. The cache keys on a canonical form of the sliced constraint set plus the condition, and stores satisfiable or unsatisfiable, with the model if satisfiable. Keys must ignore irrelevant differences such as constraint order or variable naming. A hit costs a hash lookup instead of milliseconds or seconds. The cache grows over a run and needs eviction, and it must be shared among workers to be effective.",
    k: ["Exact-match keys versus canonicalized keys: exact is fast to compute and misses equivalent queries, while canonical forms hit more and cost normalization.", "Unbounded versus size-limited cache: unbounded keeps everything and eventually exhausts memory, whereas limited evicts and may recompute valuable results."],
    p: ["Two queries with different array names but equal structure miss each other.", "A stale entry from a different solver configuration or timeout is returned as definitive."],
    v: "Run a target twice in one process, confirm the second run's solver calls fall to near zero, record hit rates in statistics, and confirm results are identical with the cache disabled.",
    dep: ["independence-slicing", "expression-simplifier"]
  },
  "counterexample-cache": {
    s: "Keeps models found for earlier queries and tries them on new ones, since a model that satisfies a superset of constraints often satisfies a subset, and a subset that is unsatisfiable rules out supersets.",
    d: "Stored satisfying assignments are checked cheaply by evaluating the new constraint set under each; if one satisfies it, the answer is satisfiable with no solver call. Stored unsatisfiable sets let any superset be answered unsatisfiable. Lookup uses an index over variables to find candidates quickly. On paths that extend each other by one constraint, the previous model often still satisfies the new constraint, or a small change does. Cost is the evaluations and the memory of stored models.",
    k: ["Try stored models versus only exact-match caching: stored models answer many more queries and cost evaluations per lookup, and exact-match is cheap but hits rarely.", "Index candidates by variable sets versus scan: an index finds relevant models quickly and costs memory and maintenance."],
    p: ["A cached model is evaluated with a mistaken default for variables it does not mention.", "The store grows large, and lookup time exceeds a solver call for simple queries."],
    v: "Extend a path by one constraint at a time for a hundred steps, and confirm most steps are answered from cached models without solver calls, with all answers matching an uncached run.",
    dep: ["query-cache", "model-extraction", "independence-slicing"]
  },
  "incremental-solving": {
    s: "Keeps a solver context alive across related queries, adding and removing constraints with push and pop, so the solver reuses learned facts instead of starting from scratch.",
    d: "Paths share long prefixes, so the solver is given the common constraints once and then asked about each additional condition inside a scope that is popped afterward. Learned clauses and partial results from the shared part remain valid. The engine must keep its constraint scope stack synchronized with the solver, which is awkward when it jumps between unrelated states. Solvers differ in how well they support it, and some do better restarting on a fresh small query.",
    k: ["Incremental context per state versus a fresh solver per query: incremental reuses work on deep prefixes, while fresh is simple, stateless and combines well with caching.", "One context per worker versus per state: per worker is memory-light and thrashes on state switches, while per state is quick and needs lots of memory."],
    p: ["The solver's constraint stack goes out of sync after a state switch and answers a question for the wrong path.", "Incremental mode is slower than restarting because slicing already made queries small."],
    v: "Run the same sequence of related queries incrementally and from scratch and confirm identical answers and a lower total solver time incrementally for a deep prefix and a higher time for tiny sliced queries.",
    dep: ["solver-backend-interface", "path-condition-store"]
  },
  "solver-backend-interface": {
    s: "An abstraction over decision procedures that takes terms and returns satisfiable, unsatisfiable or unknown with a model, so solvers can be swapped, combined or run in separate processes.",
    d: "The interface exposes assert, check, push, pop, get-value and timeouts, and hides each solver's term format. Backends run in process through a library, or as a separate process spoken to in a standard text format, which isolates crashes and allows timeouts to be enforced by killing the process. Wrappers add caches, slicing and statistics around the raw backend. Different solvers excel at different theories, so the interface lets an engine route queries.",
    k: ["In-process library versus separate process with a text protocol: in-process has low latency and a solver crash takes the engine down, whereas a process isolates crashes and costs serialization.", "Lowest-common-denominator interface versus exposing solver-specific features: common is portable and loses optimization, while specific features gain speed and tie the engine to one solver."],
    p: ["A solver crashes on a pathological query and takes the whole run with it.", "A new solver version returns different models, and stored tests change."],
    v: "Run the same query set against two backends, confirm identical satisfiability answers, and kill a backend process mid-query and confirm the engine records unknown and carries on.",
    dep: ["solver-timeouts", "model-extraction"]
  },
  "solver-timeouts": {
    s: "A limit on how long a single query may run, after which the engine treats the answer as unknown and decides how to proceed.",
    d: "Hard queries, particularly with multiplication, division or large arrays, can run for hours. A timeout, set per query, aborts and returns unknown. The engine then chooses: treat the branch as feasible and keep the state, assume infeasible and drop it, or concretize. Each choice has consequences for soundness. Timeouts based on wall-clock time depend on machine load and break determinism. Some engines retry with a simplified query or a different solver before giving up.",
    k: ["Treat unknown as feasible versus infeasible: feasible keeps the path and may report false bugs, whereas infeasible drops paths silently and misses real bugs.", "Wall-clock timeout versus a resource or step limit: wall-clock bounds real time and is irreproducible, while step limits are deterministic and less meaningful."],
    p: ["A few queries that time out account for most of the run, and are never visible in summary statistics.", "A timeout in an oracle query is treated as no bug, so the check silently stops working on hard cases."],
    v: "Issue a deliberately hard multiplication query with a one-second limit, confirm return in about one second with unknown, the configured policy applied, and the event counted in the statistics.",
    dep: ["solver-backend-interface", "run-configuration-and-budgets"]
  },
  "model-extraction": {
    s: "Reads the satisfying assignment from the solver after a satisfiable answer and converts it into concrete bytes for each symbolic input and array.",
    d: "The engine asks the solver for the values of the input variables and arrays, then packs them into the byte layout of the declared inputs. Variables not mentioned in the constraints receive arbitrary or default values. Arrays are returned as a set of index-value pairs plus a default for the rest, which must be expanded to the declared size. Because the model satisfies only the queried constraints, extraction after path completion queries the entire path condition. It is also where preferences, such as minimal or readable values, are applied.",
    k: ["Ask for values on demand versus extract the full model: on demand is cheap and may miss consistency between asks, while the full model guarantees consistency.", "Arbitrary solver defaults versus fixed defaults: fixed defaults make tests stable and need extra constraints or post-processing."],
    p: ["Extracting values from a model for a different query than the path's final condition yields an input that does not follow the path.", "A large array's default and exceptions are expanded incorrectly and produce short or misaligned input."],
    v: "Solve for a record of three fields and an array, extract a model, and confirm that evaluating every original constraint with the extracted bytes gives true.",
    dep: ["solver-backend-interface", "symbolic-input-declaration"]
  },
  "unsat-core-use": {
    s: "When a query is unsatisfiable, takes the subset of constraints responsible and uses it to shrink caches, explain infeasibility and prune other states.",
    d: "Solvers can report a core: a small subset of the asserted constraints that is already unsatisfiable. The engine stores it, so any later query containing those constraints is answered without solving. Cores also tell which assumption or branch condition made a path infeasible, for diagnosis, and guide interpolation, where the core is generalized to prune a family of states. Producing cores costs extra solver time and the cores are not minimal unless asked for.",
    k: ["Request cores always versus only on demand: always gives better caching and slows every unsatisfiable query, while on demand saves time and loses reuse.", "Minimal cores versus any core: minimal prune the most and cost more to compute, and any core is cheap and larger."],
    p: ["Cores are computed under assumptions that differ from the cache key, so they are reused wrongly.", "Time spent shrinking a core exceeds what later cache hits save."],
    v: "Make an unsatisfiable path with fifty constraints of which three conflict, confirm the reported core contains those three, and a later query containing them is answered from the store with no solver call.",
    dep: ["solver-backend-interface", "counterexample-cache", "state-subsumption"]
  },
  "portfolio-solving": {
    s: "Runs several solvers or several configurations on the same query concurrently and takes the first answer, because no one solver is fastest on every kind of query.",
    d: "Solvers differ widely: one handles arrays well, another excels at bit-vector multiplication, a third at floating-point. A portfolio dispatches the query to a few of them, or chooses by features of the query such as operators present, and cancels the rest when one answers. It reduces tail latency, the few queries that dominate runs. The costs are CPU use, memory, and the need to check that solvers agree. Disagreement indicates a bug in one of them.",
    k: ["Run all solvers in parallel versus select by query features: parallel is robust and spends several times the CPU, whereas selection is cheaper and can choose badly.", "Take the first answer versus cross-check: first is fastest, and cross-checking finds solver bugs and doubles the cost."],
    p: ["Cancelling a losing solver mid-query leaves it in a bad state and it must be restarted.", "Solvers return different models for the same query and generated tests vary between runs."],
    v: "Run a benchmark set of hard queries with each solver alone and with the portfolio, and confirm the portfolio's total time is near the best per-query time and satisfiability answers agree for all.",
    dep: ["solver-backend-interface", "solver-timeouts", "query-formulation"]
  },
  "syscall-models": {
    s: "Implements the operating system interface in the engine, returning symbolic or concrete results for calls such as read, write, open and exit, so the program runs without a real kernel.",
    d: "Each call has a handler that checks arguments, updates the modeled system state and writes results into program memory. A call to read from a symbolic file returns symbolic bytes, and one writing to a file records the bytes. Error returns are explored where programs mishandle them. A model aims at the portion of behavior programs actually use, not the entire kernel. At binary level, the handler is entered by the system call instruction, and arguments follow the platform's convention.",
    k: ["Model the call set in the engine versus run a real emulated kernel: modeling is light and incomplete, while an emulated kernel is faithful and slow.", "Fail calls nondeterministically to test error paths versus always succeed: failure paths find bugs in rarely run code, and always-succeed keeps the state space small."],
    p: ["An unmodeled call returns an error code the program does not handle, ending exploration early.", "A model's partial read behavior differs from the real kernel, so replays diverge."],
    v: "Run a program that reads, writes and exits through modeled calls, confirm outputs and exit code match a real run on the generated test, and that a call returning an error code reaches the program's error path.",
    dep: ["file-system-model", "calling-convention-handling", "execution-state"]
  },
  "libc-models": {
    s: "Replacements for the standard library's functions, such as string handling, memory allocation, formatting and conversion, written to keep symbolic data symbolic and to avoid forking inside library internals.",
    d: "Running the real library under symbolic execution forks on every byte of string comparison and parsing, which wastes budget. A model implements each function at a higher level, for instance comparing two buffers with one expression, and can add checks for misuse such as passing an unterminated string. Models also provide the allocator and formatted output. Variadic functions and locale behavior need care. The models define the program's semantics, so an error in one is wrong for every target using it.",
    k: ["Model at the semantic level versus run the real implementation under the engine: semantic is quick and may differ from real behavior, while real code is faithful and explodes in paths.", "Models written in the engine's host code versus compiled to the target IR: host models are fast and need direct access to engine internals, while IR models are portable and run through the interpreter."],
    p: ["A string function model treats a buffer as terminated when it is not, and misses an overread.", "Formatted output with symbolic arguments forks over every character."],
    v: "Test each modeled function against the real library on thousands of random concrete inputs and confirm identical results, then run with symbolic arguments and confirm the generated inputs replay correctly.",
    dep: ["heap-and-stack-modeling", "expression-builder", "calling-convention-handling"]
  },
  "file-system-model": {
    s: "A simulated file system holding symbolic files with declared sizes, directories and descriptors, so programs that read configuration or data files can be explored without touching real disk.",
    d: "The model keeps a table of open descriptors and a set of files, each a symbolic byte array with a size. Reads return slices, writes update the array, and seeks adjust positions. A fixed set of files, such as one symbolic input file and its metadata, covers many targets. Permissions, directories and special files are modeled as needed. Because the model replaces the real system, replaying needs the concrete files written back to disk from the solved model. Mismatches in error behavior are the usual defect.",
    k: ["Fully symbolic file contents versus concrete files from disk: symbolic finds input-dependent bugs, and concrete files give faithful behavior for fixed configuration.", "Model the real file system's metadata semantics versus minimal reads and writes: full semantics find more bugs and cost modeling effort, and minimal is enough for most parsers."],
    p: ["A program checks file size first, and the model's size is unconstrained, producing inputs larger than any limit.", "Generated tests lack the files the program expected, so replay differs."],
    v: "Run a program that opens, seeks and reads a symbolic file, then write the generated file contents to disk and confirm the real program, run on them, follows the same path.",
    dep: ["syscall-models", "symbolic-input-declaration", "symbolic-array-theory"]
  },
  "network-model": {
    s: "A simulated network that delivers symbolic bytes on sockets, models connection setup, partial reads and errors, and lets servers and clients be explored without real peers.",
    d: "Sockets are modeled as streams with symbolic content and a configurable delivery pattern: all at once, byte by byte, or in chunks. Connection, accept and shutdown calls have handlers and can fail. For protocols the model can combine with a grammar, so message framing stays valid and exploration reaches deep protocol states instead of failing at the first malformed byte. Time and ordering enter through the scheduling model. A full network stack is out of scope.",
    k: ["Symbolic bytes on a stream versus structured messages from a grammar: raw bytes find parsing bugs and stall at framing checks, while grammar-based input reaches deeper states.", "Deliver all data at once versus in fragments: all at once is simple, and fragmentation finds bugs in partial-read handling."],
    p: ["The model delivers complete messages each time and never exercises partial reads.", "A symbolic stream makes a server loop wait for more input forever."],
    v: "Run a server on a model connection that delivers a request in single-byte chunks, confirm the parser handles fragmentation or a finding is reported, and replay the stream against the real server.",
    dep: ["syscall-models", "thread-scheduling-model", "symbolic-input-declaration"]
  },
  "thread-scheduling-model": {
    s: "Decides how multiple threads interleave in the engine, which switching points are explored and how synchronization primitives behave.",
    d: "A deterministic scheduler runs one thread at a time and switches at specified points: every instruction, every shared access, or only at synchronization calls. Each switch point can be a fork over which thread runs next, making interleavings part of the explored space. Locks, condition variables and thread creation are modeled. Reduction techniques skip equivalent interleavings. Interleavings multiply with paths, so most engines restrict switching to the points that can matter.",
    k: ["Switch at every instruction versus only at synchronization and shared accesses: every instruction is complete and explodes, while limited switching is tractable and relies on correct identification of shared accesses.", "Systematic interleavings versus random scheduling: systematic gives coverage guarantees with cost, and random is cheap and probabilistic."],
    p: ["Interleaving points are only at lock calls, so a race on an unprotected variable is never exposed.", "A scheduling bug makes the model deadlock where the real program does not."],
    v: "Run a two-thread program with a known race that appears under one interleaving, and confirm the exploration reaches it and outputs the schedule, while a lock-protected version shows no divergent outcomes.",
    dep: ["execution-state", "branch-forking", "syscall-models"]
  },
  "time-and-randomness-model": {
    s: "Supplies the program with times, clocks and random numbers as controlled values, symbolic or fixed, so runs are reproducible and time-dependent branches can be explored.",
    d: "Calls to read the clock, sleep or generate random bytes return values defined by the model. Fixed values give reproducibility. Symbolic values let the engine explore timeouts, expiry checks and random-dependent branches, producing inputs the replay must supply. Sleep calls can advance a virtual clock instantly. Random generators used for security have no useful symbolic model, since reasoning through them is infeasible, so they are treated as free inputs. Consistency matters: two reads of the clock should be monotonic.",
    k: ["Fixed values versus symbolic values: fixed keeps runs reproducible and hides time-dependent paths, while symbolic explores them and needs a way to replay.", "Virtual clock versus real clock: virtual makes sleeps instant and deterministic, whereas real keeps behavior faithful and slow."],
    p: ["A symbolic clock returns decreasing values, producing impossible paths.", "Generated tests cannot recreate the clock value on replay, so findings do not reproduce."],
    v: "Run a token-expiry check on a symbolic clock, confirm both expired and valid paths are generated with monotonic reads, and replay with a fake clock set to each value to confirm the paths.",
    dep: ["syscall-models", "symbolic-input-declaration"]
  },
  "external-call-concretization": {
    s: "The policy for calls into code the engine cannot execute symbolically: pick concrete argument values, call the real function, and continue with its concrete result.",
    d: "When a call reaches native code outside the analyzed program, such as a compiled library or a kernel service, the engine asks the solver for a value of each symbolic argument, adds an equality constraint, performs the call for real and writes the returned values back. Side effects on memory must be copied in. It is the escape hatch that keeps analyses going when a model is missing, at the cost of paths with other argument values. Writes through pointer arguments to symbolic buffers are hard: the callee may read or write more than the engine knows.",
    k: ["Bind the arguments with equality constraints versus leave them free: binding is sound for the path and narrow, whereas leaving free explores more and can report impossible behavior.", "Call the real function versus skip it with a default result: calling is faithful and has side effects on the host, skipping is safe and may be wrong."],
    p: ["The native function writes through a pointer to memory the engine shadows, and the shadow state is stale afterward.", "The real call has side effects such as deleting files on the analysis machine."],
    v: "Call a native function with a symbolic argument, confirm the log records the value bound and the call made, the result is available as a concrete value, and a path needing another argument is listed as unexplored.",
    dep: ["concretization-fallback", "path-condition-store", "calling-convention-handling"]
  },
  "library-summaries": {
    s: "Hand-written or generated descriptions of what a library routine reads, writes and returns, so the engine applies the effect without executing the routine.",
    d: "A summary lists inputs, outputs, side effects on memory and error cases for a routine, in a declarative form or a small model program. It is less detailed than a full model, which re-implements the behavior, and can be generated from annotations or learned from observed executions. Applying one is fast and adds an approximation, since details not described are lost. Summaries for compression, cryptography and hashing routines are important, since their internals defeat the solver, and typically treat outputs as fresh unconstrained values.",
    k: ["Declarative summary versus executable model: declarative is compact and checkable, and executable covers any behavior but takes work.", "Treat outputs as unconstrained versus constrain them by properties: unconstrained is sound but gives weak information, whereas properties such as output length add precision and risk errors."],
    p: ["A hash summary returns a fresh value for each call, so equal inputs produce different outputs and a comparison never succeeds.", "A summary omits a write to a global, and later code reads the stale value."],
    v: "Summarize a hashing routine, call it twice on the same symbolic input, and confirm the engine returns identical outputs for identical inputs and does not execute the routine's body.",
    dep: ["external-call-concretization", "function-summaries", "libc-models"]
  },
  "symbolic-argv-and-environment": {
    s: "Makes the command-line arguments, environment variables and standard streams symbolic, with declared counts and lengths, so whole programs can be tested from their outside interface.",
    d: "The launcher builds the initial process image as the operating system would: argument vector, environment block, auxiliary data and standard files. The user states how many arguments, how long each may be, and which are fixed. Symbolic arguments let the engine find option parsing bugs and reach each flag combination. The initial stack layout matters to binaries, and the program loader and the model must agree on it. Too many or too long symbolic arguments make the path count unmanageable.",
    k: ["A fixed number of symbolic arguments versus a range of counts: fixed is simple, and covering several counts catches argument-count bugs at the cost of repeated runs.", "Symbolic environment variables versus concrete: symbolic finds environment-dependent bugs and enlarges the search, while concrete defaults keep it focused."],
    p: ["The argument count is fixed at two and a bug requiring three is not found.", "Argument strings are not null-terminated in the model, so parsing code runs off the end."],
    v: "Run with two symbolic arguments of up to four characters on a program with flag parsing, and confirm tests for each flag combination as real argument vectors that reproduce the paths.",
    dep: ["program-loader", "symbolic-input-declaration", "syscall-models"]
  },
  "device-and-peripheral-models": {
    s: "Stand-ins for hardware that firmware reads and writes, such as registers, timers and interrupts, returning symbolic values so code that expects a device can run without one.",
    d: "Firmware accesses memory-mapped registers whose values depend on hardware state. A model maps address ranges to handlers: reads return symbolic or scripted values, writes are logged or update a state machine, and interrupts are raised at chosen points. Fully symbolic reads find robustness bugs but lead to impossible hardware states. Learned or specified models give realistic sequences. Polling loops waiting for a ready bit will loop forever unless the model eventually returns a value that exits.",
    k: ["Fully symbolic register reads versus modeled device state machines: symbolic is cheap to write and reports impossible behavior, while state machines are realistic and need device knowledge.", "Interrupts at any point versus at defined points: any point is thorough and explodes, defined points are tractable and may miss races."],
    p: ["A polling loop on a status bit never exits and consumes the whole budget.", "Impossible register values lead the firmware into code paths real hardware can never reach."],
    v: "Run firmware polling a ready flag against a model that sets it after a few reads, confirm the loop exits and later code is reached, and that scripted device responses reproduce the same path.",
    dep: ["syscall-models", "symbolic-input-declaration", "thread-scheduling-model"]
  },
  "front-end-ir": {
    s: "Translates source programs into a typed, low-level intermediate form with explicit control flow and memory operations that the engine can interpret.",
    d: "A compiler front end parses the source and lowers it to a small instruction set in static single assignment form, with typed values, basic blocks, loads and stores and calls. The engine interprets this form directly. Compile options matter: keeping debug information, disabling optimizations that remove checks, and replacing library headers with modeled ones. Programs must be compiled whole or linked from several units. The form should be simple and stable, since each instruction needs engine support.",
    k: ["Analyze optimized versus unoptimized IR: unoptimized is closer to source and has more instructions, while optimized matches shipped code and may remove the undefined behavior being sought.", "A typed IR versus an untyped one: types help pointer and size reasoning, and untyped is more general across source languages."],
    p: ["The optimizer deletes a bounds check as unreachable because it assumes no overflow, so the bug is invisible.", "Inline assembly in the source has no IR form and the engine cannot execute it."],
    v: "Compile a program, run the IR on concrete inputs under the engine and the native build on the same inputs, and confirm identical outputs and exit codes across a test suite.",
    dep: ["ir-normalization", "debug-info-mapping"]
  },
  "binary-lifter": {
    s: "Converts machine instructions into the engine's intermediate form with explicit effects on registers, flags and memory, so executables can be analyzed without source.",
    d: "For each decoded instruction the lifter emits IR operations describing every effect: results, flag updates, memory accesses and control transfer. Machine instructions have many implicit effects, so lifting is large and detail-heavy. It runs lazily as the engine reaches new code, since a binary cannot be fully disassembled ahead of time. Instruction sets with variable-length encodings, vector operations and system instructions are the hard cases. Errors in lifting produce wrong behavior with no warning, so semantics are validated against real hardware.",
    k: ["Lift lazily during execution versus lift all code ahead of time: lazy handles indirect jumps and self-modifying code, while ahead of time gives a whole-program graph and misses what cannot be found statically.", "Hand-written semantics versus semantics generated from a formal specification: hand-written is flexible and error-prone, and generated is consistent where specifications exist."],
    p: ["A flag effect of rarely used instruction is omitted and a conditional branch after it uses the wrong value.", "Unsupported vector instructions halt the run."],
    v: "Execute each instruction of the supported set on random operands in the lifted form and on real hardware, and confirm registers, flags and memory match after every one.",
    dep: ["instruction-decoding", "ir-normalization", "register-file"]
  },
  "instruction-decoding": {
    s: "Splits raw bytes into instructions with their opcodes, operands and lengths, which is the first step of any binary analysis.",
    d: "The decoder reads bytes at an address and identifies the instruction using prefix, opcode and operand encoding rules. For fixed-width sets it is a table lookup; for variable-length sets it must know where instructions start, and the same bytes decode differently from different offsets. Output includes the length, operands and categorization such as branch or call. It must handle invalid encodings and mode switches. A decoder is shared by the lifter, the control flow recovery and the loader.",
    k: ["Table-driven decoder versus handwritten: tables are compact and verifiable, and handwritten is faster and harder to audit.", "Fail on invalid bytes versus treat as an invalid-instruction trap: failing stops early and is unfriendly, and a trap models what hardware does."],
    p: ["Decoding from the middle of an instruction, after a wrong jump target, silently yields a different instruction sequence.", "A rarely used prefix changes operand size and is ignored."],
    v: "Decode a large corpus of machine code and compare each instruction's address, length and mnemonic with a reference disassembler's output, and confirm invalid encodings are reported rather than mis-decoded.",
    dep: ["program-loader"]
  },
  "control-flow-graph-recovery": {
    s: "Builds the graph of basic blocks and transfers between them, resolving indirect jumps and calls as far as possible, for use by search heuristics and static analysis.",
    d: "From an entry point the recovery follows direct jumps and calls to discover blocks, splitting blocks at branch targets. Indirect transfers through registers or tables are resolved by pattern matching jump tables, by data-flow analysis or by the engine itself as it learns targets during execution. The graph feeds distance calculations, loop detection and merge points. Function boundaries, tail calls, and non-returning functions are common sources of error. An incomplete graph makes directed search misjudge reachability.",
    k: ["Static recovery before running versus discovering edges during execution: static recovery gives a complete picture where possible, and dynamic discovery is exact and incremental.", "Over-approximate indirect targets versus under-approximate: over-approximation keeps safe distances and loses precision, under-approximation is precise and misses edges."],
    p: ["A non-returning function is treated as returning, and code after the call is treated as reachable.", "A jump table is misread as having too many entries and the graph contains bogus blocks."],
    v: "Recover the graph of a program with known structure and a jump table, compare blocks and edges with a ground truth listing, and confirm unresolved indirect transfers are marked.",
    dep: ["instruction-decoding", "ir-normalization"]
  },
  "ir-normalization": {
    s: "Rewrites the intermediate form into a smaller, regular subset of operations, such as lowering switches, removing unsupported intrinsics and exposing implicit behavior, so the interpreter has fewer cases.",
    d: "A pass transforms constructs the interpreter does not support: switch statements into branch chains, intrinsics into library calls, vector operations into scalars, and exception constructs into explicit control flow. It can insert checks, such as turning each division into a branch on a zero divisor so the oracle needs no special case. It also simplifies instruction patterns the optimizer made opaque. Every normalization must preserve semantics, including undefined behavior boundaries, and the mapping to the original for debugging.",
    k: ["Normalize aggressively into few operations versus support many natively: few operations keep the interpreter simple and make IR larger, many native operations run faster and need more engine code.", "Insert checks as explicit branches versus as hooks in the interpreter: branches are visible in coverage and the IR, and hooks keep code small and hide the checks."],
    p: ["A lowering of a switch changes the order in which cases are tested and affects coverage reports.", "A normalization drops source location data and findings lose their lines."],
    v: "Run the normalizer on a corpus, execute the original and normalized forms on random inputs, and confirm identical observable behavior and that every output instruction maps back to a source location.",
    dep: ["front-end-ir"]
  },
  "debug-info-mapping": {
    s: "Maps instructions and memory objects back to source files, lines, functions and variable names, so reports and coverage are readable by developers.",
    d: "Compilers can emit tables linking each machine or IR instruction to a source line, and describing variables, types and function boundaries. The engine reads them to attach locations to findings, name symbolic variables after program variables and compute line coverage. For binaries without debug information, only symbols or addresses are available. The mapping often suffers after optimization, where one instruction maps to several lines or none. Type information also helps with structure layout, enabling field-level reports.",
    k: ["Rely on compiler debug data versus reconstruct from symbols: compiler data is detailed and absent in release binaries, while symbols give function names only.", "Map at the instruction versus at the block level: instruction-level gives exact lines and larger tables, and block-level is smaller and coarser."],
    p: ["Optimized code maps an instruction to the wrong line, and the finding points developers at innocent code.", "Debug data from a different build is used with the binary."],
    v: "Compile a program with known bug locations, run the engine, and confirm every finding's reported file and line matches the planted line, and variables in the test are named as in the source.",
    dep: ["front-end-ir", "program-loader"]
  },
  "program-loader": {
    s: "Reads the executable and shared objects, places segments in the simulated address space, applies relocations and builds the initial stack, so execution starts from the same image the operating system would give.",
    d: "The loader parses the file format, maps code and data segments at their addresses, resolves imports to modeled or real library code, applies relocations, and sets up the initial registers, stack and auxiliary data. Address choices matter for reproducibility, so fixed bases are common. Dynamic linking, thread-local storage and initialization functions must run before the entry point. For source targets, a simpler loader assembles the IR modules and globals.",
    k: ["Emulate the system loader faithfully versus load a flat image: faithful runs initialization the program expects, and a flat image is simple and misses dependencies.", "Fixed addresses versus randomized layout: fixed is reproducible, and randomized finds layout-dependent bugs and cannot be replayed."],
    p: ["A relocation is skipped and a pointer in a data table points to the wrong place.", "Initialization routines run in the wrong order and global state is uninitialized when used."],
    v: "Load a binary with relocations, a global table of function pointers and thread-local data, and confirm every pointer, initial value and segment permission matches the real loader's memory image.",
    dep: ["instruction-decoding"]
  },
  "static-analysis-feed": {
    s: "Imports results from static analyses, such as alarms, call graphs, alias information and value ranges, to prioritize or prune exploration and to confirm alarms.",
    d: "A static analyzer produces cheap, conservative facts: where an error might happen, which functions are reachable, which pointers may alias. The engine consumes them as search targets, pruning information or hints. An alarm becomes a target; the engine either finds a concrete input reaching it and confirms it, or fails within a budget, leaving it unresolved. The call graph improves directed search. The combination uses the analyzer's breadth and the engine's precision, and requires the analyses to refer to the same code and locations.",
    k: ["Use static facts to prune versus only to prioritize: pruning gives more speed and trusts the analysis, whereas prioritizing is safe and gains less.", "Confirm each alarm separately versus explore broadly: separate is focused and uses a budget per alarm, and broad exploration may confirm several at once."],
    p: ["Analysis results refer to a different revision than the one analyzed.", "An alarm unconfirmed within a small budget is wrongly treated as false."],
    v: "Feed the engine a list of fifty alarms with known ground truth, and confirm every real one is matched to a reproducing input and the unconfirmed ones are reported as unresolved, not as false.",
    dep: ["control-flow-graph-recovery", "debug-info-mapping"]
  },
  "instrumentation-runtime": {
    s: "The support code and hooks that run inside a concrete execution to record symbolic data flow and branch conditions, used by concolic and hybrid modes.",
    d: "A compile-time pass or binary rewriter inserts calls before operations that touch tracked data. The runtime maintains shadow memory and registers holding expressions, builds constraints on branches, and reports them to the driver. It must be fast, because it runs on every instruction of a real execution, and small, since it shares the process with the target. Interaction with threads, signals and the target's own allocator needs care. It must also detach cleanly when the target performs operations it cannot track.",
    k: ["Compile-time instrumentation versus dynamic binary translation: compile-time is faster and needs source, whereas dynamic works on any binary at a larger overhead.", "Shadow all data versus only data derived from input: shadowing everything is simple and slow, while limiting to input-derived data needs accurate taint."],
    p: ["The runtime's own allocations perturb the target's memory layout and change behavior.", "An uninstrumented library call drops tracked data and later branches lose their conditions."],
    v: "Run an instrumented binary and the original on one thousand inputs and confirm identical outputs, with recorded constraints that evaluate to true on each input, and measure slowdown against a stated bound.",
    dep: ["program-loader", "taint-tracking", "ir-normalization"]
  }
});
