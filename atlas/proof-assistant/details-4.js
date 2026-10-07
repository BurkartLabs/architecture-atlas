// Details for the proof assistant plate, part 4: foundation, scale, extraction, cross-cutting concerns.
ATLAS.details("proof-assistant", {
  "logical-foundation": {
    s: "The formal logic the system implements, usually a dependent type theory or higher-order logic, which defines the statements, the inference rules and what a proof is.",
    d: "The foundation is a small set of rules: how types and terms are formed, how functions are defined and applied, how equality is introduced and used, and what universes exist. Everything else is derived. Type theories identify proofs with programs, so checking a proof is type checking; higher-order logics use a separate proof calculus on simply typed terms. The choice shapes the whole system: what is decidable, which proofs are short, and how mathematics is encoded. It is hard because small changes in rules can break consistency.",
    k: ["Dependent type theory vs higher-order logic: dependent types allow types that mention values and give proofs computational meaning, but make elaboration complex; higher-order logic is simpler and has less expressive types.", "Constructive base with classical axioms added vs classical from the start: a constructive base keeps computation meaningful, but classical mathematics needs axioms and care about where they are used."],
    p: ["A new feature adds a rule whose interaction with an existing one was never analyzed, and the logic becomes inconsistent.", "A theory is formalized in a way that makes later statements need awkward encodings, which are expensive to change once a library exists."],
    v: "State the rule set as a short, written specification and confirm the kernel's source implements each rule with a named function, and that a test of known-valid and known-invalid terms matches the specification.",
    dep: ["universe-hierarchy", "metatheory-and-soundness"]
  },
  "impredicative-prop": {
    s: "The choice to let propositions quantify over all propositions, including the one being defined, which gives a powerful logic and restricts what can be extracted from proofs.",
    d: "In an impredicative proposition sort, a statement that quantifies over every proposition is itself a proposition, so definitions of connectives and many constructions need no universe levels. This makes it possible to encode inductive-like structure inside the logic. The cost is that proofs cannot be freely turned into data, which is the rule on eliminating propositions, and that the system's consistency proof is more delicate. Systems without it use universe levels for propositions too and avoid these restrictions.",
    k: ["Impredicative propositions vs predicative with levels: impredicative gives short definitions and stable levels, but needs restrictions on elimination and a stronger consistency argument.", "Make the proposition sort impredicative while types are predicative: a mixed system keeps most of the benefits and each sort follows different rules, which implementers must keep straight."],
    p: ["Allowing unrestricted elimination from an impredicative proposition into data makes the logic inconsistent.", "A definition that is accepted only because of impredicativity cannot be moved to a system without it."],
    v: "Define the proposition that all propositions are true and confirm it lives in the proposition sort at no extra level, then confirm elimination of an existence proof into a number is rejected.",
    dep: ["propositions-sort", "logical-foundation"]
  },
  "classical-axioms": {
    s: "The optional principles of excluded middle, choice and functional extensionality, added as axioms when a development needs classical reasoning.",
    d: "A constructive base proves existence by construction. Classical mathematics assumes that every statement is true or false, that choices can be made from nonempty sets, and that functions with equal values are equal. These are declared as axioms in the library, usually in one file, and any theorem using them inherits the dependency, visible through the audit. Choice and excluded middle together imply decidable equality for everything, which defeats computation. The difficulty is where they are allowed: code that must run cannot rely on them.",
    k: ["Axioms available but tracked vs removed from the base: tracking lets mathematicians work naturally while programmers avoid them, and requires discipline in what depends on what.", "Choice as an axiom vs built into the logic: an axiom keeps computation untouched and appears in audits, while built-in choice makes every theorem classical."],
    p: ["A definition used in executable code relies on choice, so extraction produces a function that cannot run.", "A library imports a classical axiom for one proof and every user then inherits the dependency."],
    v: "Audit a theorem proved by case analysis on an arbitrary proposition and confirm it lists exactly excluded middle, and a theorem about natural numbers lists no axiom.",
    dep: ["axiom-tracking", "logical-foundation", "axiom-audit"]
  },
  "quotients-and-extensionality": {
    s: "Primitive support for types formed by identifying equivalent elements, plus extensionality principles, which let proofs and definitions treat equivalent things as equal.",
    d: "A quotient type is built from a type and an equivalence relation; its elements are equivalence classes, and a function out of it is defined by giving a function on representatives that respects the relation. Quotients make function extensionality provable. The kernel includes a few primitive constants and one computation rule. Without them, users resort to setoids, carrying relations and proofs of respect everywhere. It is hard because the quotient rule sits in the kernel, and the soundness of every combination with other features must be argued.",
    k: ["Primitive quotients vs setoids as a library pattern: primitives make equality of equivalent elements real, and add kernel rules; setoids need no kernel change and burden every use with relation bookkeeping.", "Extensionality derived from quotients vs an axiom: derived needs no extra axiom, while an axiom is simpler and blocks computation on it."],
    p: ["A function out of a quotient is defined without a proof of respect that the system can check, and equality of classes becomes inconsistent.", "Setoid-based development forces rewriting through relations, and proofs fail on a goal where equality would have worked."],
    v: "Define integers as a quotient of pairs of naturals, define addition by respecting the relation, and confirm two different representatives of zero are equal by the quotient's own equality in the kernel.",
    dep: ["reduction-rules", "logical-foundation", "kernel-checker"]
  },
  "universe-polymorphism": {
    s: "The ability for one definition to be used at many universe levels, so a general construction does not have to be repeated at each level.",
    d: "A declaration lists universe parameters, and each use instantiates them with levels, possibly other parameters. The kernel stores the constraints among them and checks every instantiation satisfies them. Constants are therefore not single values but families indexed by levels. Without it, a list type would have to be redefined at each level. It adds cost to conversion, which compares level expressions, and to elaboration, which must infer the instantiation. It is hard to limit the blowup of level variables in large developments.",
    k: ["Polymorphic by default vs monomorphic with explicit lifting: polymorphism lets definitions apply anywhere, but makes every constant carry level variables that clutter output and slow comparisons.", "Level instantiation inferred vs written: inference hides it from the author, and an unlucky choice causes confusing universe errors."],
    p: ["A definition is polymorphic in a level it uses only through a constraint, so every use has an unresolvable extra variable.", "Constraint sets accumulate in a long file, and conversion checks slow noticeably."],
    v: "Use one polymorphic list definition at two different levels in the same file, and confirm each instance type-checks with distinct level arguments and the kernel's recorded constraints are satisfied.",
    dep: ["universe-hierarchy", "universe-inference", "global-environment"]
  },
  "metatheory-and-soundness": {
    s: "The mathematical argument that the logic is consistent and that the implementation, as specified, implements it: why a checked proof can be believed.",
    d: "Consistency is shown on paper by interpreting the theory in a stronger one, usually through a set-theoretic or categorical model, and by proving normalization for the rules. It depends on the exact set of rules, so every extension needs a new argument. Implementation soundness is argued by keeping the kernel close to the rules, by independent checkers, and sometimes by formally verifying a model of the kernel. It is hard because the full system, with all its features, is more complex than any model that has been checked.",
    k: ["Rely on a paper proof for the core vs mechanize it: a paper proof exists for each core calculus and covers less than the implementation, while a mechanized proof is expensive and covers a chosen fragment.", "Conservative features with known models vs novel features: using established features gives known metatheory, and novel ones give new capability with unproved consistency."],
    p: ["A feature is added whose consistency is argued by analogy, and a counterexample is found years later.", "The paper proof covers a calculus slightly different from the one implemented, and the gap hides a bug."],
    v: "List each kernel rule next to the theorem in the consistency argument that covers it, and confirm there is no rule without a covering theorem, and no implementation feature without a rule.",
    dep: ["logical-foundation", "kernel-checker"]
  },
  "incremental-checking": {
    s: "Re-checks only the parts of a development affected by an edit, reusing stored results for everything else, both within a file and across files.",
    d: "Each command's result is cached against the exact inputs it used: its text and the environment it read. When a file changes, the engine finds the first affected command and rechecks from there, skipping the rest if their inputs are unchanged. At a finer grain, proofs inside one declaration are checked separately. Across files, a change to a lemma's statement invalidates dependents but a change to a proof body does not. It is hard to compute inputs exactly: over-approximation causes unnecessary work and under-approximation reuses stale results.",
    k: ["Track exact inputs of each command vs invalidate everything below the edit: exact tracking skips much more work but needs precise reads recording; below-the-edit is simple and wasteful.", "Separate statements from proofs so proof edits do not invalidate dependents: this gives fast iteration, and requires proofs to be opaque to the rest of the system."],
    p: ["A command reads a global setting that is not recorded as an input, and a stale cached result is shown after the setting changes.", "Incrementality is broken by a command with side effects, so each edit reruns the whole file."],
    v: "Edit a proof body in a file with a thousand commands and count the commands rechecked: only the edited one and any that read its body, then confirm the final state equals a from-scratch check.",
    dep: ["document-model", "opaque-proofs", "elaboration-caching"]
  },
  "parallel-checking": {
    s: "Checks independent commands, proofs and files at the same time on many cores, with a scheduler that respects dependencies and keeps the editor responsive.",
    d: "Files are checked in dependency order, with independent files in parallel. Inside a file, the engine elaborates each declaration's statement sequentially, since later commands need it, and sends proofs to worker threads, which finish later. The kernel check of theorem bodies is often a separate task. A scheduler prioritizes work near the cursor. It is hard because the environment is shared, so concurrent extension needs immutable data and careful ordering, and because proofs that fail asynchronously must report errors in the right place.",
    k: ["Parallel proofs after sequential statements vs fully parallel: sequential statements keep the order meaningful and expose the parallelism that is safe, while fully parallel needs a language without order dependence.", "Priority to work near the cursor vs first come first served: priority makes the editor feel fast, and complicates the scheduler and cancellation."],
    p: ["A global mutable setting is read by a parallel task and gives different results across runs.", "A failure in an asynchronous proof is reported after the file is considered complete, and a build passes with a hidden error."],
    v: "Check a library with one core and with sixteen, and confirm identical results and diagnostics for every declaration, with wall-clock time scaling by at least the recorded fraction.",
    dep: ["opaque-proofs", "global-environment", "dependency-and-rebuild"]
  },
  "compiled-library-files": {
    s: "The binary form of a checked file, holding its declarations, notation and attributes, so importing it takes milliseconds instead of re-checking its source.",
    d: "After a file is checked, the system writes an output containing the environment additions, extension state such as notations, instances and simplification rules, and optionally proofs and info for tools. Importing loads this instead of source. Files are keyed by a hash of the source and imports. The format must be stable, fast to load by memory mapping, and exact: rebuilding the same source gives identical output. It is hard because extension state holds data structures that must be serialized, and a loaded file must be exactly equivalent to the checked one.",
    k: ["Memory-mapped format vs parsed on load: mapping makes loading nearly free for large libraries, and constrains the format to be position-independent.", "Include proofs vs statements only: including proofs allows re-checking and increases size, while omitting them makes imports faster and removes auditability."],
    p: ["A compiled file is reused after an option that changes elaboration was changed, and results disagree with a clean build.", "Nondeterministic output, such as timestamps, makes builds irreproducible and defeats shared caches."],
    v: "Build the same file twice on two machines and confirm the compiled outputs are byte-identical, then import it and confirm the loaded environment equals the one in the checking process.",
    dep: ["proof-term-storage", "global-environment", "dependency-and-rebuild"]
  },
  "dependency-and-rebuild": {
    s: "Tracks which files import which, and rebuilds only what changed and what depends on it, with caching shared between machines.",
    d: "The build tool reads imports to construct a graph, computes a hash for each file from its source and its dependencies' hashes, and rebuilds a file only if its hash has no stored output. A change to a proof inside a file need not change the hash that dependents see, if the interface hash covers only statements. Remote caches store outputs by hash, so a CI run can reuse others' work. It is hard because files and options must be hashed exactly, and cycles must be detected early.",
    k: ["Hash the whole file vs hash its exported interface: whole-file hashing is simple, and rebuilds all dependents after any edit; interface hashing avoids it, and needs a precise definition of the interface.", "Local cache vs shared remote cache: shared cache removes hours of rebuild, and requires deterministic outputs and trust in who writes the cache."],
    p: ["A file reads an environment variable or another file that is not part of its hash, and builds disagree between machines.", "A diamond of imports is rebuilt twice because two parents lock the same file in different orders."],
    v: "Change a proof body in a deep file and confirm only that file is rebuilt, while changing a statement rebuilds exactly its dependents, with the count printed by the build tool matching the dependency graph.",
    dep: ["compiled-library-files", "package-and-versioning"]
  },
  "opaque-proofs": {
    s: "Marks theorem bodies as hidden from the rest of the system, so dependents rely only on the statement and a proof edit never forces them to re-check.",
    d: "Once a theorem is admitted, its body cannot be unfolded by conversion or elaboration, so its proof does not influence any later result except the fact that it exists. This permits checking the body later or in parallel and caching a theorem's statement separately from its proof. Definitions that should compute are not made opaque. It is hard because the line is a design rule: a result that must compute, such as a witness, cannot be stated as a theorem, and misplacing it breaks evaluation.",
    k: ["Theorems opaque and definitions transparent vs everything transparent: opacity enables parallelism and fast incremental checking, and forbids computing with theorem bodies.", "Allow selected unfolding of theorems for convenience: this recovers some proofs by computation, and breaks the separation that incrementality depends on."],
    p: ["A value the author needs to compute is stated as a theorem, and evaluation then gets stuck on the opaque body.", "An attribute that unfolds a theorem makes dependents silently depend on its proof, and incremental builds miss the invalidation."],
    v: "Change the proof body of a theorem used by a thousand other theorems and confirm none of them is rechecked, while a definition that is a function is still unfolded and evaluated by the kernel.",
    dep: ["declaration-admission", "global-environment", "transparency-controls"]
  },
  "elaboration-caching": {
    s: "Remembers the results of expensive elaboration steps, such as instance searches and simplifier calls, keyed by their inputs, so they are not repeated.",
    d: "Within a declaration, caches store results of instance resolution, type inference and conversion for terms already seen, keyed by the term and the relevant settings and local context. Across declarations, an instance resolution result can be reused if the environment's instance set has not changed. Some systems keep persistent caches between sessions. It is hard because a cache key must include everything the result depends on, such as transparency, universe levels and options, and because caching metavariable-containing results is unsafe.",
    k: ["Cache aggressively vs recompute: caching gives large speedups on typeclass-heavy code, and a missing key component returns a wrong result that is hard to debug.", "Per-declaration caches vs session-wide: per-declaration is safe and loses cross-declaration reuse; session-wide needs invalidation when instances or options change."],
    p: ["A cached instance is reused after a local instance is added, and the elaborator picks the old one.", "A result containing an unassigned metavariable is cached and later reused in a different context."],
    v: "Elaborate a file twice with caching on and off and confirm identical terms for every declaration, and that the cached run's instance-search count is lower by the recorded factor.",
    dep: ["instance-resolution", "unification", "metavariables", "transparency-controls"]
  },
  "profiling-and-regressions": {
    s: "Measures where time and memory go during checking, and tracks the cost of each file across versions, so slowdowns are found when they are introduced.",
    d: "A profiler attributes time to commands, tactics, instance searches, conversion checks and kernel checks, producing a report per declaration. A regression system builds the library for each change and compares timings, flagging declarations that slowed by a margin. Counts of unfoldings or unifier steps are used where timing is noisy. A performance problem often has one cause, like a looping simp rule or a transparency change, that is hard to see without attribution.",
    k: ["Measure wall time vs measure deterministic counters: wall time reflects what users feel and is noisy; counters such as steps or allocations are reproducible, but may not track real cost.", "Benchmark the whole library per change vs sample: whole-library runs catch every regression, and cost hours of compute for every change."],
    p: ["A regression is noticed months later, when it is one of dozens of changes in between and cannot be bisected.", "Timing comparisons are made on machines with different load, giving false alarms and masking real slowdowns."],
    v: "Introduce a looping rewrite rule in a branch and confirm the regression run flags the affected declarations with the profile showing the simplifier as the cause, and that a no-op change flags nothing.",
    dep: ["incremental-checking", "simplifier", "conversion-checking"]
  },
  "extraction": {
    s: "Translates definitions in the logic into programs in an ordinary programming language, dropping everything that has no computational meaning.",
    d: "Extraction takes a definition, removes proofs and types, and translates the remaining computational content to a target language. Inductive types become data types and recursors become recursive functions. Terms whose types cannot be represented in the target, such as dependent types, are given an untyped or unsafe form. Some constants can be mapped to native implementations. It is hard to keep the guarantee: the extracted program is correct only if the translation and the target's compiler are, and neither is checked by the kernel.",
    k: ["Extract to a typed target vs to an untyped one: typed output reads naturally and fails on dependent types that need unsafe casts; untyped output always works and loses checking.", "Realize constants with native code vs extract them: native code is fast and can differ from the logic's definition, so a trusted correspondence must be maintained."],
    p: ["A native replacement for a function behaves differently from the proved definition on an edge case, and the proved properties no longer apply.", "A proof that was supposed to be erased is kept in the output because it is stored in a data structure, and the program is slow or does not terminate."],
    v: "Extract a verified sorting function, compile and run it on a thousand random lists, and confirm each output is sorted and a permutation of the input, matching the logic's own evaluation on the same inputs.",
    dep: ["proof-erasure", "code-generation", "recursors", "propositions-sort"]
  },
  "proof-erasure": {
    s: "Determines which parts of a term are proofs or types and therefore irrelevant at run time, and removes them without changing the result of computation.",
    d: "The analysis walks a term with its types, marking subterms whose type is a proposition or a sort as erasable and replacing them with a placeholder. Function arguments that are erased can be dropped from calls. A refinement analysis finds arguments that are never used, even if not proofs. Correctness depends on the rule that data cannot depend on proofs, so erasure never changes results. It is hard because dependent types let a type computation affect which branch is taken, and the analysis must be conservative.",
    k: ["Erase by type-directed analysis vs by annotation: type-directed needs no author effort, and relies on the logic's restrictions being exactly right; annotations are explicit and put the burden on authors.", "Erase unused arguments as well vs only proofs: removing unused arguments shrinks code, and changes the arity of exported functions."],
    p: ["A proof argument is erased from a function that a foreign caller invokes, and the calling convention no longer matches.", "A subtle dependency of a branch on an erased type makes the program take the wrong branch."],
    v: "Extract a function taking a bound proof and confirm the output has no parameter for it, and that results on a test set equal those computed by the logic's evaluator with the proof present.",
    dep: ["propositions-sort", "term-representation", "extraction"]
  },
  "code-generation": {
    s: "Turns extracted or erased terms into executable code in a target language or machine representation, with data layouts and calls to native functions.",
    d: "After erasure, the generator lowers functions to a simple intermediate form, optimizes by inlining and removing dead code, then emits source text or machine code. Inductive types get a layout such as tagged records, enumerations as integers, and natural numbers as machine or big integers. Reference counting or a collector manages memory. Calls to realized constants link to native implementations. It is hard to keep performance in the presence of closures and generic code, and to keep the semantics identical to the logic's.",
    k: ["Compile to a general-purpose language vs a custom backend: a general language reuses mature compilers and platforms, while a custom backend gives control of data layout and reuse of memory.", "Specialize generic code vs keep it uniform: specialization is faster and bloats the output, uniform code is small and slower."],
    p: ["Optimization reorders computations with side effects introduced by native calls, and results change.", "Stack use of generated recursion exceeds the limit on deep inputs, which the logic's evaluator handled."],
    v: "Compile a program and compare outputs against the logic's evaluator on a generated test set, including inputs that exceed machine integer size and deep recursion.",
    dep: ["extraction", "proof-erasure", "compiled-evaluation"]
  },
  "compiled-evaluation": {
    s: "Runs definitions through a compiler during checking, for fast closed computation inside proofs, at the cost of extending what must be trusted.",
    d: "A tactic or command compiles a definition and its dependencies to native code or bytecode and runs it, returning a value. Proofs can then assert an equation by evaluation. Because this bypasses the kernel's reduction, the result is accepted only through an axiom saying that compiled evaluation agrees with the logic, and theorems using it are marked in the audit. It is useful for large decision procedures and numeric certificates. It is hard because the compiler becomes part of the trusted base.",
    k: ["Kernel evaluation only vs compiled evaluation allowed: kernel-only is fully trusted and slow on big computations; compiled evaluation is orders of magnitude faster and adds the compiler and an axiom.", "Report use per theorem vs hide: reporting lets users reject results that depend on it, and makes the feature visible in audits."],
    p: ["A compiled run depends on a native function with a bug, and a false equation is accepted without any kernel check.", "Theorems using it are used in a library whose policy forbids the axiom, and the failure appears at release."],
    v: "Prove an equation by compiled evaluation, confirm the audit lists the evaluation axiom for that theorem, and confirm the same equation also holds by kernel reduction for a smaller input.",
    dep: ["code-generation", "axiom-tracking", "reflection"]
  },
  "proof-export": {
    s: "Writes checked developments into a neutral format that other proof systems or independent checkers can read, translating between logics where needed.",
    d: "An exporter walks the environment and emits each declaration, with universe constraints, inductive types and definitions, in a plain text or binary format designed to be simple to parse. Importers in other systems translate the terms into their logic, which works when the logics are close and requires axioms or translation when they differ. Export is also how independent checkers get their input. It is hard because the format must name every feature precisely, and because each system's version of equality and universes differs slightly.",
    k: ["A minimal, explicit format vs a rich one: minimal formats are easy to write checkers for, and large; rich formats are compact and need more complex readers.", "Export all declarations vs on demand: exporting everything is simple and heavy for large libraries, on-demand needs dependency closure per request."],
    p: ["The exporter omits a definition's reducibility or a universe constraint, and the importing system accepts something the original would reject.", "Exported files of a large library are too big to load in the target and must be split."],
    v: "Export a development, import it into a second checker, and confirm it accepts everything; change one inference rule in the second checker to be weaker and confirm it rejects the declarations needing it.",
    dep: ["proof-term-storage", "global-environment", "independent-checker"]
  },
  "soundness-vs-convenience": {
    s: "Every feature that makes proofs shorter either is checked by the kernel or enlarges what must be trusted; the trade is made again for each feature.",
    d: "Impredicativity, eta rules, proof irrelevance, native literals, quotients and cumulativity each make something easier and add a rule to the kernel and a case to the consistency argument. The same decision appears in the elaborator, where heuristics are free to be wrong because the kernel rechecks, and in the kernel, where nothing is. A feature belongs in the elaborator unless it changes what is definitionally equal or admitted. The decision shapes the layer boundary and how small the kernel can be.",
    k: ["Put a feature in the elaborator vs in the kernel: in the elaborator, it can be wrong without harm and costs proof size; in the kernel, it is fast and enlarges the trusted base.", "Add a definitional equality rule vs prove the equation: the rule removes proof obligations everywhere, and changes the metatheory."],
    p: ["A performance fix moves a check into the kernel as a shortcut, and a rare input exploits it.", "A convenience rule is added without updating the consistency argument."],
    v: "For each kernel rule, list the proof size or time saved by the rule and the measured trusted-code cost, and confirm each rule has a recorded justification and a covering test of an ill-typed term.",
    dep: ["kernel-checker", "metatheory-and-soundness", "elaborator"]
  },
  "trust-boundary": {
    s: "Where the line is between code that can be wrong without consequence and code that cannot, and how every component above the line is forced to produce checkable output.",
    d: "Elaborators, tactics, automation and external solvers are all untrusted: they produce terms, and the kernel checks them. The boundary must be enforced mechanically: tactics cannot add declarations to the environment except through admission, and nothing can write the environment directly. Features that cross it, like compiled evaluation or imported solver results, are marked. The boundary also covers tools, so an editor display that disagrees with the kernel can mislead without making a proof false.",
    k: ["Strict boundary with all results as terms vs allowing trusted extensions: strict is easy to explain and audit, and costs proof size and speed.", "Check the final term only vs check each step: final-only is cheap and gives a late, hard-to-localize failure; per-step localizes errors and costs repeated checking."],
    p: ["A tactic uses an API that adds a declaration without admission, and a result is accepted unchecked.", "The display of a goal omits something the kernel sees, so a reader trusts a statement that differs from the one proved."],
    v: "Try to add a declaration from a tactic by any API other than admission and confirm it is impossible; list all interfaces that can change the environment and confirm each goes through the kernel.",
    dep: ["kernel-checker", "declaration-admission", "tactic-metaprogramming"]
  },
  "termination-and-decidability": {
    s: "Everything in the core must terminate for the logic to be consistent, while the tools around it may not, and each layer picks which of these it guarantees.",
    d: "The kernel's conversion must terminate on all well-typed terms, which follows from strong normalization of the calculus. Recursive definitions must pass termination checks. Elaboration, unification and instance resolution are not guaranteed to terminate and are bounded by step limits and timeouts. Automation must be allowed to fail. Type checking being decidable is a design requirement of the logic, and extensions that break it, like some forms of equality, are not allowed in the kernel.",
    k: ["Decidable type checking vs a more expressive logic: decidability makes the kernel a terminating program, and some natural definitions must be written another way.", "Step limits vs unbounded search: limits keep the editor responsive and make success depend on arbitrary budgets."],
    p: ["A proof succeeds only because a search limit was just high enough, and breaks on another machine or version.", "A termination check is too permissive and admits a loop, which proves false."],
    v: "List every loop and search in the system and confirm each has either a termination argument or a configured bound that is reported when hit, with a test hitting each bound.",
    dep: ["structural-recursion", "conversion-checking", "unification"]
  },
  "performance-at-scale": {
    s: "Proofs and libraries grow without limit, so every component is judged by how it behaves on a million declarations, not on a textbook example.",
    d: "Cost appears in proof size, in conversion time, in elaboration of typeclass-heavy code, in the memory needed to hold the environment, and in the editor's response to edits. Techniques include sharing, caching, proof irrelevance, opacity, parallel checking and compiled files. Each is a trade between speed and simplicity, and each has to be maintained as the library changes. Performance work is also a correctness issue: a build that takes too long is a build that is not run, and unchecked proofs lose their value.",
    k: ["Optimize the kernel vs shrink the proofs: kernel speedups help everything and enlarge the trusted base; shrinking proofs, through better automation or reflection, keeps the base fixed and costs design effort.", "Budgets per file vs only total time: per-file budgets catch regressions early, and need maintenance as the library grows."],
    p: ["A quadratic algorithm is invisible on small examples and takes hours when the library doubles.", "A shortcut that speeds one workload slows a different one, and nobody measures the second."],
    v: "Plot build time and peak memory against library size over the last releases, and confirm growth is within the recorded bound with the worst declarations listed and each tied to a cause.",
    dep: ["incremental-checking", "parallel-checking", "sharing-and-interning", "profiling-and-regressions"]
  },
  "library-compatibility": {
    s: "Thousands of theorems depend on each other's exact statements, names and automation behavior, so every change to the system or the library can break downstream code.",
    d: "Breaking changes include renaming a lemma, changing an argument order, changing an implicit argument, altering a simplifier rule set, and changing elaboration heuristics. Libraries respond with deprecation periods, aliases, migration scripts and pinned versions. Large developments pin an exact engine release and upgrade in lockstep. The cost of compatibility limits how fast the system can improve its design, and the library's size is what makes the system useful.",
    k: ["Keep old names as deprecated aliases vs break cleanly: aliases ease upgrades and clutter the library for years; clean breaks keep it tidy and push the work to users.", "Pin one engine version for the whole library vs support several: pinning is simple and delays fixes; supporting several multiplies testing."],
    p: ["A change to default automation silently changes which lemmas are used, and downstream proofs fail far from the change.", "A migration script rewrites a pattern that appears in a different, unrelated meaning."],
    v: "Build the registered set of downstream projects against a release candidate and confirm each either builds or has a recorded, intentional break with a migration note.",
    dep: ["standard-library", "package-and-versioning", "simplifier"]
  },
  "proof-stability": {
    s: "A proof that works today should work after unrelated changes: stability comes from how much a proof depends on automation, naming, goal order and search outcomes.",
    d: "Brittle proofs rely on auto-generated names, on the order of goals, on the simplifier reaching a specific normal form, or on instance search choosing a particular instance. Stable ones state intermediate claims, name hypotheses, and call automation only for closed subgoals. The system helps through structured blocks, error messages for unused hypotheses, and tools that report tactics that succeed by luck. Stability costs author effort, and its absence costs maintainers far more later.",
    k: ["Explicit statements and names vs short scripts: explicit proofs survive library changes and take longer to write; short scripts are fast to write and break often.", "Strict linting of fragile patterns vs allow them: linting catches problems early and annoys authors; allowing them keeps flow and makes maintenance expensive."],
    p: ["A proof relies on an auto-named hypothesis, and renaming a bound variable in a lemma breaks it.", "A simplifier call that closes a goal today starts leaving a different goal after a rule is added."],
    v: "Reorder the goals produced by a lemma and rename its bound variables, then rebuild a sample of dependent proofs and confirm the fraction that fail matches the recorded stability baseline.",
    dep: ["structured-proofs", "simplifier", "tactic-language"]
  }
});
