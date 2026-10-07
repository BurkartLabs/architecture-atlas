// Details for the proof assistant plate, part 3: terms, inductive types, reduction, kernel.
ATLAS.details("proof-assistant", {
  "term-representation": {
    s: "The in-memory form of terms: a tree of variables, applications, abstractions, dependent function types, constants, sorts and literals, shared and cached for speed.",
    d: "A term is one of a few node kinds. Every node carries cached data such as a hash, whether it has loose bound variables, and whether it contains metavariables, computed once at creation. Nodes are immutable and often shared. Large proofs make memory the limit, so representation matters: compact nodes, small integer tags and shared subtrees decide whether a library fits in memory. It is hard because every algorithm walks these trees, so a poor representation slows everything at once.",
    k: ["Immutable shared nodes with cached data vs mutable terms: immutable terms allow sharing and cheap equality checks, but every change builds new nodes.", "A few node kinds vs many specialized ones: a few kinds keep the kernel small and the checking rules short, while specialized nodes for literals or projections speed common cases."],
    p: ["Cached data is computed incorrectly for a rarely used node, so an optimization skips a term that does need processing.", "Deeply nested terms overflow the call stack in a recursive traversal."],
    v: "Build a term with a million shared subterms and confirm memory use is proportional to the number of distinct nodes, that traversal visits each once with caching, and that hashes equal for structurally equal terms.",
    dep: ["binders-and-indices", "sharing-and-interning"]
  },
  "binders-and-indices": {
    s: "How bound variables are represented so that renaming never changes meaning: usually numbered by distance to their binder, with names kept only for display.",
    d: "With nameless indices, a bound variable is the number of binders between it and its binder, so alpha-equivalent terms are identical and equality is structural. Terms under binders contain loose indices, which must be shifted when moved across binders. Local contexts use free variables with unique identifiers instead, and the algorithms open a binder by replacing its index by a fresh free variable. It is hard because shifting mistakes silently capture variables, and these bugs appear only in unusual terms.",
    k: ["Indices for bound variables and identifiers for free ones: this avoids capture and renaming problems, at the cost of instantiating binders whenever an algorithm goes under one.", "Names with explicit renaming vs nameless: names read well in debugging, but need freshness checks everywhere and make equality an alpha-equivalence algorithm."],
    p: ["An index is not shifted when a term moves under a binder, and a variable silently refers to a different one.", "Display names are chosen from the binder annotation, producing clashes that make the printed term misleading."],
    v: "Check that substituting a term under three nested binders and then abstracting gives back the original term, over a generated set of random terms, with no index shifted wrongly.",
    dep: ["term-representation"]
  },
  "substitution": {
    s: "Replaces a variable by a term inside another term, shifting indices as needed, and is the operation behind application, instantiation and rewriting.",
    d: "To apply a function to an argument, the kernel instantiates the body's loose variable with the argument. The substitution walks the body, replaces matching indices and shifts others, skipping subtrees that contain no loose variables thanks to cached flags. Batched versions replace many variables in one pass. It is the most executed function in the system, so it is caching-heavy and optimized. The difficulty is complexity: naive substitution on shared terms blows up, since a shared subterm gets copied once for each place it is visited.",
    k: ["Cache by node identity during traversal vs plain recursion: caching preserves sharing and avoids exponential blowup, but costs a table lookup at each node.", "Substitute eagerly vs build explicit substitutions: eager is simple and obviously correct, but explicit substitutions defer cost in abstract machines at the price of complexity."],
    p: ["Substitution ignores sharing, and a proof with heavy repetition turns a linear job into an exponential one.", "A substitution that drops the loose-variable shift gives a term that checks in one case and fails in another."],
    v: "Instantiate a body that shares a large subterm ten times through variable references and confirm result size and time grow linearly with distinct nodes, and that the result equals the naive substitution on small cases.",
    dep: ["term-representation", "binders-and-indices"]
  },
  "sharing-and-interning": {
    s: "Keeps one copy of each distinct term in memory, through hash-consing or caches, so structural equality is a pointer comparison and repeated work is avoided.",
    d: "On creating a node, the system looks it up in a table keyed by its contents and returns the existing node if there is one. Equal terms are then identical, and results of traversals can be cached by node. The table must be weak or periodically cleared, or it holds every intermediate term forever. Terms written to disk preserve sharing in the file format. It is hard because the table is shared by threads and hot, and because exporting a heavily shared term as a tree can be exponentially larger.",
    k: ["Global interning vs per-computation caches: global interning gives pointer equality everywhere, but the table becomes a contention point and a memory risk.", "Preserve sharing when serializing vs expand: preserving keeps files small and loading fast, but a reader must reconstruct the graph, and tools that walk trees must be aware of it."],
    p: ["A traversal that does not use sharing visits the same node millions of times, and a proof that fits on disk takes hours to check.", "The intern table is never cleaned, and a long session's memory climbs until it is killed."],
    v: "Check a proof whose tree form has 2 to the 40th nodes but whose shared form has a thousand, and confirm check time and memory stay proportional to the shared size.",
    dep: ["term-representation"]
  },
  "universe-hierarchy": {
    s: "The tower of sorts in which types live, indexed by levels, which prevents a type from containing itself and thereby blocks the paradoxes of naive type-in-type.",
    d: "Types are classified by sorts at numbered levels: the sort of types at level n lives in level n plus one. A function type lives at the maximum of its parts' levels, with a special rule for the proposition sort. Levels can be variables, constants, successors and maxima, and the kernel compares them with a decision procedure on these level expressions. It is hard because comparing level expressions with maximum and successors, with variables, must be complete enough not to reject correct programs.",
    k: ["Cumulative universes vs explicit lifting: cumulativity lets a type at one level be used at a higher one without ceremony, but complicates conversion and inference.", "Levels as expressions with maxima vs only variables and constants: richer expressions allow more general definitions, and the comparison algorithm and the constraint solver become more complex."],
    p: ["An implementation of level comparison is incomplete, so some valid developments are rejected only when large libraries are combined.", "A bug that lets a level constraint be dropped makes the logic inconsistent without any visible symptom."],
    v: "Try to type a type as a member of itself and confirm the kernel rejects it by level comparison, and check that a corpus of known paradox constructions is rejected.",
    dep: ["term-representation", "universe-polymorphism"]
  },
  "propositions-sort": {
    s: "A special sort for statements whose proofs carry no computational content, which can be erased and are all considered equal.",
    d: "Types in the proposition sort are treated differently: any two proofs of the same proposition are definitionally equal, and information in a proof cannot flow into data except through narrow rules. This allows extraction to erase proofs and reduces the work of conversion. Quantifying over all propositions stays in the same sort, which makes it impredicative in some systems. The hard part is the restriction on eliminating proofs into data: only propositions that cannot reveal information, like equality, may do it.",
    k: ["A separate proposition sort vs propositions as ordinary types: a separate sort gives irrelevance and erasure, but needs rules about what may be eliminated into data.", "Large elimination only for subsingleton propositions vs never: allowing it for equality and falsehood is needed for practical proofs, and the rule must be checked in the kernel."],
    p: ["A rule on elimination of proofs is too permissive and allows data to depend on which proof of an existence statement was used.", "Code written assuming proofs erase fails after a proof is placed inside a data structure that later computes with it."],
    v: "Attempt to extract a natural number from a proof of existence and confirm the kernel rejects the elimination, while the same extraction from a subsingleton proposition is accepted.",
    dep: ["universe-hierarchy", "proof-irrelevance-rule", "impredicative-prop"]
  },
  "global-environment": {
    s: "The table of everything declared so far: constants with types and values, inductive types, axioms and their dependencies, which the kernel extends one declaration at a time.",
    d: "The environment is a persistent map from names to declarations: definitions with bodies, theorems, axioms, inductive families with constructors and recursors, and quotient primitives. Each declaration was admitted by the kernel and is immutable afterward. Importing a file adds its declarations, so the environment is built from compiled files. Elaboration reads it constantly, so lookup must be fast. It is hard because it gets large, and because extension must be atomic, with nothing visible until the kernel accepts the whole declaration.",
    k: ["Persistent immutable map vs mutable table with undo: persistence makes branching and backtracking cheap, but reads cost a little more.", "Load all imported declarations eagerly vs lazily: lazy loading saves startup time on large libraries, but needs a stable way to find a declaration from a name."],
    p: ["A declaration is partially added when a check fails midway, and later commands see an environment that was never valid.", "Environment growth is not bounded, and startup time on a large library grows each release."],
    v: "Import a library, look up a theorem by name, and confirm its type and value are those recorded in the compiled file, and that the number of declarations equals the sum over imported files.",
    dep: ["declaration-admission", "compiled-library-files"]
  },
  "inductive-declarations": {
    s: "Defines a new type by listing its constructors, with parameters and indices, from which the system derives the type's elimination and computation rules.",
    d: "A declaration gives a name, parameters, indices, a sort and the constructors with their types. The kernel checks the declaration is well formed: constructors return the type, parameters are uniform, and occurrences are positive. It then generates the recursor and registers constructors and projections. Structures and records are special cases with one constructor. Elaboration derives related definitions, like case analysis and injectivity lemmas. It is hard because the checks are subtle, and generated terms are large for types with many constructors.",
    k: ["Inductive types as primitive vs encoded from simpler types: primitive support gives usable computation and error messages, but means the kernel contains the generation algorithm, which must be correct.", "Indexed families built in vs only parameters: indexed families give length-indexed vectors and typed syntax, and complicate pattern matching and the kernel's rules."],
    p: ["A universe level of the type is chosen too low, and a constructor field no longer fits.", "Generated auxiliary definitions for a type with hundreds of constructors take far longer than the declaration itself."],
    v: "Declare a tree type with a nested recursive field and confirm the kernel accepts it, the recursor has the expected type, and a non-positive variant of the same type is rejected.",
    dep: ["positivity-checking", "recursors", "global-environment", "universe-hierarchy"]
  },
  "positivity-checking": {
    s: "Rejects inductive types where the type being defined occurs to the left of an arrow in a constructor argument, since such types allow non-terminating terms and prove false.",
    d: "The checker examines each constructor argument type and verifies that the inductive type occurs only in strictly positive positions: as the argument itself or as the result of a function, never inside a function's domain. Nested occurrences, such as a list of the type itself, are accepted if the outer type is itself positive in that argument, which the kernel checks by unfolding. The check is simple for plain types and subtle for nested and mutual ones, where it runs an auxiliary translation.",
    k: ["Strict positivity vs a looser criterion: strict positivity is simple, well understood and enough for nearly all uses, while looser criteria allow more types but depend on more elaborate metatheory.", "Check nested occurrences by translating to mutual types vs rejecting them: translation allows common types like trees of lists, but adds a complex kernel component."],
    p: ["A bug in the nested case admits a type that encodes a fixed-point operator, and a proof of false follows.", "Positivity failures are reported with no indication of which constructor argument caused them."],
    v: "Submit the classic self-application type with a negative occurrence and confirm the kernel rejects it, while a tree of lists of itself is accepted and its recursor type-checks.",
    dep: ["inductive-declarations", "kernel-checker"]
  },
  "recursors": {
    s: "The generated induction principle for each inductive type, from which every proof by induction and every structurally recursive function is ultimately built.",
    d: "For each inductive type the kernel generates one constant, the recursor, with a type stating that to prove a property for all values it suffices to prove it for each constructor given the property for recursive arguments. It has computation rules: applying it to a constructor reduces to the corresponding case. All pattern matching and structural recursion is compiled to recursor applications. It is hard because recursors for indexed, mutual and nested types have large and delicate types, and the rules must preserve reduction.",
    k: ["Recursor as the only primitive vs adding pattern matching to the kernel: one primitive keeps the kernel small and checked, but compiled terms are larger and harder to read.", "Generate recursors in the kernel vs trust the elaborator: generation in the kernel prevents wrong rules, and the kernel must contain the algorithm."],
    p: ["A recursor for a mutual type is generated with an incorrect motive, and a proof of false follows from a case no one tests.", "A function compiled to recursors is extremely slow to evaluate, since each step passes the motive and accumulates closures."],
    v: "Use the recursor of a natural number type to define addition, then confirm the kernel reduces the addition of two literals to the right numeral and that the computation rule fires exactly on constructor applications.",
    dep: ["inductive-declarations", "reduction-rules", "kernel-checker"]
  },
  "match-compilation": {
    s: "Translates pattern-matching definitions, with overlapping and nested patterns, into case analysis and recursor applications the kernel can check.",
    d: "The author writes equations with nested patterns over several arguments. The compiler builds a decision tree, choosing which argument to inspect first, generates case splits using the type's case analysis principle, and handles dependent patterns by solving equations on indices. It then produces a term and proves that the original equations hold. Missing and redundant cases are reported. It is hard for dependent types: matching on one value can refine the type of another, and the compiler must discover the unification that justifies it.",
    k: ["Compile to eliminators in the elaborator vs trust in the kernel: compiling in the elaborator keeps the kernel small, but the checked term is not the same as the source, and error messages must be translated.", "Prove the original equations as lemmas vs reduce by computation only: lemmas allow rewriting with them, but cost proof time for every definition."],
    p: ["Compilation order of arguments produces a term that does not reduce on an argument the author expected, so evaluation gets stuck.", "A definition with many overlapping patterns generates an exponential decision tree."],
    v: "Define a function with overlapping patterns on two lists and confirm it compiles, that the generated equation lemmas match the written clauses, and that a missing case gives an error naming the uncovered pattern.",
    dep: ["recursors", "induction-and-cases", "unification", "elaborator"]
  },
  "structural-recursion": {
    s: "Accepts recursive definitions where each recursive call is on a strict subterm of an argument, and compiles them to recursor applications that obviously terminate.",
    d: "The checker looks for an argument position where every recursive call passes a subterm obtained by pattern matching, which makes the function expressible through the recursor. It tracks what is a subterm of which variable through matches and let-bindings, and handles mutual and nested cases. Because it must be implemented before any proof support is available, it is a syntactic criterion. It is hard because many natural definitions, such as those that recurse on a computed argument, fail and need a different technique.",
    k: ["Syntactic check vs checking termination by proof: a syntactic check is automatic and the term reduces by computation, but rejects definitions that terminate for non-obvious reasons.", "Check in the kernel vs compile away in the elaborator: kernel checking is more flexible, while compilation to recursors needs no special kernel support."],
    p: ["A definition that obviously terminates is rejected because the recursive argument passes through a helper function that hides the subterm.", "A criterion bug accepts a definition recursing on a non-decreasing argument, giving a looping term in the logic."],
    v: "Define addition by recursion on the first argument and confirm acceptance, then define a function calling itself on the same argument and confirm rejection with a message naming the call.",
    dep: ["recursors", "match-compilation", "kernel-checker"]
  },
  "wellfounded-recursion": {
    s: "Supports recursion justified by a measure that decreases under a well-founded order, with the termination proof supplied or found by automation.",
    d: "The author gives a measure and each recursive call must come with a proof that the measure decreases. The definition is built from a general fixed-point combinator, defined once by structural recursion on an accessibility proof. The equation for unfolding is proved as a lemma, since the function does not reduce by computation inside the kernel. Decreasing proofs are commonly found by automation. The difficulty is evaluation: such functions get stuck when reduced inside proofs, so users make them opaque or avoid them.",
    k: ["Well-founded recursion vs restricting to structural: it covers any terminating algorithm, but definitions do not compute in the kernel and equations must be proved.", "Automatic decreasing proofs vs always supplied: automatic proofs keep definitions short, but a failure appears as a goal about a measure the author never wrote."],
    p: ["A function defined by well-founded recursion is used in a reflective proof and the kernel cannot evaluate it, so the check fails or times out.", "Termination goals are generated in a form that the default automation cannot prove, and the error is unreadable."],
    v: "Define division by repeated subtraction with a measure on the dividend, confirm the equation lemma unfolds it correctly, and check that a call with a non-decreasing argument leaves an unprovable goal.",
    dep: ["recursors", "reflection", "structural-recursion", "propositions-sort"]
  },
  "coinduction-guardedness": {
    s: "Supports infinite data such as streams by accepting definitions that produce a constructor before making a recursive call, so every observation terminates.",
    d: "Coinductive types are defined by their destructors. A corecursive definition is accepted if every recursive call occurs under a constructor, a guard, so any finite observation of the result requires finitely many steps. Checking is syntactic. Equality of infinite objects is proved by bisimulation rather than induction. Reduction of corecursive terms is only performed when they are observed, to prevent unfolding forever. It is hard because the guard condition interacts poorly with other definitions and has been a source of soundness problems.",
    k: ["Syntactic guard check vs a type-based approach: the syntactic check is simple and automatic, but fragile under abstraction; type-based approaches allow more definitions and need extra machinery.", "Bisimulation as equality vs adding an extensionality axiom: bisimulation needs no axiom, but proofs of equalities are manual."],
    p: ["A guard is hidden behind a function call that the checker cannot see through, and a legitimate definition is rejected.", "Unfolding a corecursive definition during conversion checking never terminates."],
    v: "Define the stream of natural numbers and confirm the guard checker accepts it, observe its first five elements by evaluation, and confirm that a definition calling itself outside a constructor is rejected.",
    dep: ["inductive-declarations", "reduction-rules", "kernel-checker"]
  },
  "reduction-rules": {
    s: "The computation rules of the logic: substituting arguments into function bodies, unfolding definitions, applying recursors to constructors, and projecting from structures.",
    d: "Each rule rewrites a term to an equal one. Beta replaces an application of an abstraction by the instantiated body. Delta replaces a constant by its definition. Iota applies a recursor to a constructor, selecting the right case. Zeta replaces let-bound variables, and further rules cover projections and quotients. Terms are equal by definition if they reduce to a common term. It is hard because the rules together must be confluent and terminating, which ties to the logic's consistency.",
    k: ["Many specialized rules vs few general rules: specialized rules for projections and literals give much faster evaluation, but each is more kernel code to trust.", "Reduce under binders vs only to weak head normal form: full reduction decides more equalities and is far slower, so checking usually reduces only as needed."],
    p: ["A rule fires on a stuck term in an unexpected case, and evaluation produces a result that differs from the documented one.", "Unfolding a definition made opaque for performance in one component but not another causes inconsistent behavior."],
    v: "Reduce a recursor applied to a constructor and confirm the result is exactly the corresponding case with the recursive argument filled in, and that the kernel's result equals the reference semantics on random closed terms.",
    dep: ["substitution", "recursors", "global-environment"]
  },
  "conversion-checking": {
    s: "Decides whether two terms are definitionally equal, by comparing structure and unfolding or reducing only as much as is needed.",
    d: "The checker first compares terms structurally with cheap tests such as pointer equality. If they differ, it applies lazy reduction, usually weak head reduction, and compares again, deciding at each step which side to unfold using a measure of definition height. Eta and proof irrelevance rules apply at the right types. Results are cached. It is hard because naive strategies are exponentially slow, since two terms that differ only by deep definitions may be unfolded fully before they are found equal.",
    k: ["Lazy unfolding guided by definition height vs full normalization: lazy unfolding finds equalities quickly in common cases, but can choose a bad order and be much slower than normalizing.", "Cache successful comparisons vs none: caching avoids repeats in shared terms, and holds memory and must be invalidated when options change."],
    p: ["Two large terms that are equal only after unfolding a deep tower of definitions take minutes to compare, and the cause is invisible in profiles.", "A cache keyed without the transparency setting returns a result computed under different unfolding rules."],
    v: "Compare two shared terms of different shape that are equal after unfolding five definitions, and confirm the checker succeeds with a number of unfoldings within the recorded bound.",
    dep: ["reduction-rules", "reduction-strategies", "eta-rules", "proof-irrelevance-rule"]
  },
  "eta-rules": {
    s: "Rules that identify a function with its abstraction applied to a variable, and a structure with the structure built from its own projections.",
    d: "Function eta says that a term of function type equals the abstraction of its application to a fresh variable. Structure eta says a term of a record type equals the constructor applied to its projections. Conversion applies them when comparing a term to an abstraction or a constructor application. They make many proofs of equality unnecessary, because the equality holds by computation. They complicate the checker: unification must handle them, and some combinations make conversion fail to be transitive or the metatheory harder to prove.",
    k: ["Include eta in definitional equality vs prove it as a lemma: including it removes frequent proof obligations, but adds rules to the kernel and interactions with other features.", "Structure eta for all records vs only for some: for all gives uniform behavior, but breaks for types where it is unsound, such as ones with a proposition field."],
    p: ["Unification fails to apply eta in a case where the kernel accepts it, so an elaborated term the kernel would accept is rejected earlier.", "Eta for a structure combined with an unusual universe rule makes conversion inconsistent."],
    v: "Check that a function equals the abstraction of its own application by reflexivity, and that a pair equals the pair of its projections by reflexivity, both accepted by the kernel without any lemma.",
    dep: ["conversion-checking", "term-representation"]
  },
  "reduction-strategies": {
    s: "The order and manner in which terms are reduced during checking: lazy or eager, call by need, to weak head form or fully, with caches for shared work.",
    d: "Strategies include a lazy abstract machine, which shares the results of work on substituted arguments, and normalization by evaluation, which translates terms into host-language values and reads them back. Each needs care with open terms containing variables, which get stuck. The kernel uses a strategy selectable per call and a faster one for closed computations. It is hard because evaluation strategies change both speed and which terms are reduced to what, and some make it infeasible to extract an error.",
    k: ["Lazy with sharing vs strict evaluation: lazy avoids computing unused arguments and keeps proofs about open terms working, but needs a more complex machine.", "Normalization by evaluation vs term rewriting: evaluation is much faster on closed terms, but reading values back to terms needs a separate, trusted-looking procedure."],
    p: ["A strict strategy evaluates an argument that diverges or is expensive and never used, and a proof times out.", "The faster strategy is trusted by default for closed terms but its result for a stuck term differs from the main one."],
    v: "Evaluate the same closed arithmetic term with each strategy and confirm identical results, and that the lazy strategy leaves an unused diverging argument unevaluated.",
    dep: ["reduction-rules", "term-representation", "substitution"]
  },
  "transparency-controls": {
    s: "Settings that decide which definitions may be unfolded in which contexts, so automation can see through some and treat others as opaque.",
    d: "Each definition has a reducibility attribute, such as reducible, default or irreducible, and each operation, such as unification, simplification or instance search, runs under a transparency level that unfolds only definitions at or below it. Instances are usually reducible. Theorems and opaque definitions are never unfolded. Kernel conversion ignores these hints. It is hard because transparency is a performance and predictability knob that leaks into proofs: a definition marked irreducible breaks users who relied on unfolding it.",
    k: ["Fine-grained transparency levels vs all or nothing: fine-grained control gives automation just enough unfolding to stay fast, but authors must understand which level each tactic uses.", "Decide at definition time vs at use: attributes on definitions apply everywhere, while per-use settings are flexible and need extra syntax."],
    p: ["Marking a definition irreducible to speed up one proof breaks every dependent proof that needed to unfold it.", "A tactic runs at a lower transparency than the elaborator, so a term it accepts is not recognized by the tactic that follows."],
    v: "Mark a definition irreducible and confirm unification no longer unfolds it, an explicit unfolding command still can, and the kernel still accepts a term that relies on its definitional equality.",
    dep: ["conversion-checking", "unification", "global-environment"]
  },
  "proof-irrelevance-rule": {
    s: "The conversion rule that treats any two proofs of the same proposition as equal, so the checker never compares proof terms.",
    d: "When conversion compares two terms whose type is a proposition, it succeeds without examining them, after checking only that they have the same type. This saves a great deal of work, since proof terms are large, and lets a function taking a proof be used regardless of which proof is supplied. It requires inferring the type of terms during comparison, which is an extra cost, and requires the propositions to be real subsingletons. It is hard to combine with elimination restrictions and with unification on metavariables.",
    k: ["Built into conversion vs proved as an axiom: built in, it makes equalities of subtypes and sets hold by computation, but adds a type inference step to conversion.", "Applied everywhere vs only on demand: everywhere is uniform, and an erroneous type could skip a check that should have run."],
    p: ["A term is treated as a proof because of a wrong sort inference, and two different data values are declared equal.", "Skipping proof comparison hides that a proof was never actually checked, so a placeholder goes unnoticed."],
    v: "Compare two syntactically different proofs of the same proposition and confirm conversion succeeds without reducing them, while two different numbers in the data sort are not identified.",
    dep: ["conversion-checking", "propositions-sort"]
  },
  "kernel-checker": {
    s: "The small program that type checks every term against the rules of the logic and is the only code whose bugs can make a false statement look proved.",
    d: "The kernel implements inference and checking of types for the core language: variables, applications, abstractions, dependent functions, sorts, constants, inductive types and the few extensions. It uses conversion to compare types and the environment to look up constants. It does not know about notation, tactics, implicit arguments or unification. Every declaration produced by the elaborator passes through it. The goal is a few thousand lines that can be read and reviewed. It is hard to keep small while being fast enough for libraries of millions of lines.",
    k: ["Small and simple vs fast and feature-rich: a smaller kernel is easier to trust and audit, while performance features such as caching and special literals add code that must also be right.", "Check every declaration vs skip trusted ones: checking all gives the guarantee at the cost of build time; skipping saves time and removes the guarantee."],
    p: ["A shortcut added for speed accepts an ill-typed term in a rare combination, and no test covers it.", "The elaborator is so capable that nobody tests the kernel directly, and kernel bugs go unnoticed for years."],
    v: "Feed the kernel a corpus of hand-written ill-typed and paradoxical terms and confirm every one is rejected, and confirm the whole library is accepted with elaboration's own checks turned off.",
    dep: ["conversion-checking", "global-environment", "term-representation", "declaration-admission"]
  },
  "declaration-admission": {
    s: "The kernel's gate for adding to the environment: each definition, theorem, axiom or inductive type is checked against its rules before it becomes usable.",
    d: "Admitting a definition checks that its type is a type, its value has that type, and its name is new. Theorems are checked the same way but are marked so their values need not be unfolded. Inductive types go through well-formedness and positivity checks and then generate their recursors. Axioms are accepted as assumed. The operation is atomic and records the constants used. It is hard because it is the one place where extending the logic can break soundness, so all new features must pass through it.",
    k: ["A single admission path for all declarations vs separate trusted shortcuts: one path concentrates review on one place, and feels slow to those who want special handling for generated code.", "Check theorem bodies immediately vs allow asynchronous checking: immediate checking gives early errors, while asynchronous checking improves latency and lets the file be reported finished before the check completes."],
    p: ["A generated declaration bypasses admission for speed and is never checked.", "A name clash with an existing constant is accepted because the check was done on the unqualified name."],
    v: "Submit a definition whose value has the wrong type and confirm admission fails, the environment is unchanged afterward, and the name remains available for a later correct declaration.",
    dep: ["kernel-checker", "global-environment", "inductive-declarations", "axiom-tracking"]
  },
  "kernel-reduction-machine": {
    s: "The optimized evaluator inside the kernel for computation during checking, with caches and shortcuts for common cases.",
    d: "Conversion calls into the evaluator to bring terms to weak head normal form. It uses an environment-based abstract machine or a normalization-by-evaluation scheme with shared closures, caches the results of reducing constants, and recognizes recursors applied to constructors. Some designs compile definitions to bytecode or native code for closed computations. Every shortcut is part of the trusted code. It is hard to make it fast and still reduce exactly what the rules specify, especially for terms with free variables.",
    k: ["A single machine vs separate machines for open and closed terms: one machine is easier to trust, and separate machines allow a very fast path for closed computation at the cost of more trusted code.", "Cache normal forms vs recompute: caching speeds repeated work and uses memory, and invalidation must follow the environment."],
    p: ["The fast path disagrees with the reference rules on a stuck term, and a proof that depends on it is accepted by one and rejected by the other.", "A cache entry computed before a constant was made opaque is still used afterward."],
    v: "Run the evaluator and a naive reference implementation on thousands of random terms and confirm identical normal forms, and measure the speedup on a large reflective computation.",
    dep: ["reduction-rules", "reduction-strategies", "term-representation", "substitution"]
  },
  "literal-acceleration": {
    s: "Built-in representations and fast operations for large numbers and strings, so arithmetic on literals runs at machine speed instead of by unary constructor reduction.",
    d: "Natural-number literals are stored as arbitrary-precision integers, not as chains of successor constructors. The kernel recognizes applications of arithmetic functions to literals, such as addition, multiplication and comparison, and computes them with the host's big-number library, producing a literal. Conversion treats a literal and its constructor form as equal. Strings and arrays can have similar special forms. It is hard because each accelerated function is extra trusted code that must agree with the definition it replaces.",
    k: ["Accelerate arithmetic natively vs compute by definition: native speed makes numerical proofs practical, but each accelerated function is an obligation to match its logical definition.", "Literal as a primitive node vs as constructor chain: primitive nodes save memory, and every algorithm must handle both forms and convert between them."],
    p: ["An accelerated function differs from its definition on an edge case such as subtraction below zero, making conversion unsound.", "Converting a large literal to its constructor form during matching allocates gigabytes."],
    v: "Check that a numerical identity with 100-digit numbers is accepted in milliseconds, and compare the accelerated functions with their recursive definitions on a generated set of small inputs, including edge cases.",
    dep: ["kernel-reduction-machine", "term-representation"]
  },
  "axiom-tracking": {
    s: "Records for each declaration the axioms and unproved placeholders that its proof transitively depends on, so assumptions are never hidden.",
    d: "When the kernel admits a declaration it records the set of constants its body and type mention. A query computes the transitive closure over definitions and theorems and filters for axioms and for the placeholder constant that stands for an unfinished proof. This information drives the audit command and build checks that forbid unwanted axioms. It is hard because precision matters: a missed dependency lets an assumption be hidden, and an over-approximation flags harmless uses.",
    k: ["Track exact dependencies during admission vs compute on demand by walking terms: tracking is fast to query and adds bookkeeping to admission; walking needs no storage and is slow on large closures.", "Treat placeholders as axioms vs separate them: sharing the mechanism is simple, but separating lets builds distinguish assumptions from unfinished proofs."],
    p: ["A dependency through a definition's type rather than its value is not recorded, and an axiom is hidden.", "Generated declarations are excluded from tracking, and an axiom used inside one escapes the report."],
    v: "Prove a theorem using a placeholder lemma two levels down, run the query on the top theorem, and confirm it lists the placeholder constant; replace it with a real proof and confirm the list is empty.",
    dep: ["declaration-admission", "global-environment"]
  },
  "proof-term-storage": {
    s: "How proof terms are kept after checking: stored in compiled files in a compact, shared form, or discarded and re-derived on demand.",
    d: "Compiled library files contain declarations with types and values. Proof terms are often the largest part, so formats use sharing, compression and lazy loading, letting a tool read a theorem's type without its proof. Some systems discard proofs of theorems after checking and keep only statements, trading re-checkability for space. Stored terms are what independent checkers and export tools consume. It is hard because files must load fast, handle terms with enormous sharing, and remain readable across engine versions.",
    k: ["Keep proofs vs discard after checking: keeping allows later re-checking by anyone, and proofs dominate file size; discarding saves space, and removes the ability to audit.", "Lazy loading of proof bodies vs loading everything: lazy loading cuts startup time and needs an index and stable offsets in the file."],
    p: ["A format change makes old files unreadable, so a library must be rebuilt from source for every release.", "Sharing is lost on writing, and a proof with a compact shared form is stored as a file larger than a disk."],
    v: "Compile a library, load a theorem's type without its proof, then load its proof and confirm the stored term re-checks in an independent run and has the same hash as at compile time.",
    dep: ["sharing-and-interning", "compiled-library-files", "term-representation"]
  },
  "independent-checker": {
    s: "A separate, much smaller implementation of the kernel's rules, possibly written by a different team in a different style, that rechecks exported proofs.",
    d: "The engine exports a library's declarations in a simple format, and the independent checker reads them and checks every one using its own implementation of conversion and inference. Agreement between two implementations makes a shared bug unlikely. The checker can be optimized for clarity or speed separately from the main kernel. It is hard because the export format must say everything, including universe constraints and inductive types, and a checker that disagrees can be wrong or the kernel can be.",
    k: ["A second implementation vs a verified one: a second implementation is practical and catches independent bugs, while a verified checker gives a stronger guarantee at much higher effort.", "Check the final export vs check during development: final checking is cheap to schedule, and finds problems late, long after the bug was introduced."],
    p: ["Both checkers share a misunderstanding of a rule from the same source document, so a bug passes both.", "The export drops a universe constraint, and the independent checker accepts a program that the kernel would reject."],
    v: "Export a library, run the independent checker on it, and confirm it accepts every declaration; then export a deliberately corrupted library and confirm it rejects the corrupted declaration by name.",
    dep: ["proof-term-storage", "proof-export", "kernel-checker"]
  },
  "trusted-base-discipline": {
    s: "The practice of keeping the code that must be correct small, listing it explicitly, and refusing features whose benefit does not justify enlarging it.",
    d: "The trusted base includes the kernel, the parts of the runtime it uses such as the big-number library and the memory manager, the compiler of the host language, and the hardware. Each proposal for a faster path or a new primitive is judged by what it adds. Features such as native evaluation or external solver results are tagged as extending the base, and tracked per theorem. The discipline is social: it needs a list, reviews and a habit of saying no. It is hard because every performance problem has a tempting fix that enlarges the base.",
    k: ["Add a trusted fast path vs keep the base fixed and optimize elsewhere: a trusted path solves the problem immediately, and each such path adds to what must be reviewed forever.", "Tag untrusted-extension use per theorem vs forbid it: tagging allows pragmatic use and still lets users avoid it; forbidding is simpler and removes useful tools."],
    p: ["A convenience feature quietly adds an unchecked step, and results using it are indistinguishable from fully checked ones.", "The list of trusted components is not updated when a new one is added, so it no longer describes the system."],
    v: "Produce the report of trusted components for a release and confirm it matches the actual kernel source by line count and file list, and that every theorem using a tagged extension is flagged by the audit.",
    dep: ["kernel-checker", "axiom-tracking", "axiom-audit"]
  }
});
