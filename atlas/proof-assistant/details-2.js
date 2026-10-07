// Details for the proof assistant plate, part 2: automation, notation, elaboration.
ATLAS.details("proof-assistant", {
  "simplifier": {
    s: "Rewrites a goal to normal form using a database of oriented equations and conditional lemmas, and produces the equality proof as it goes.",
    d: "The simplifier traverses a term, rewrites subterms with rules from a database, and combines the results with congruence lemmas into a single equality proof. Rules are indexed by a discrimination tree, may have side conditions solved recursively, and can be added, removed or scoped per call. It also uses decision procedures for literals and propositional structure. It is hard because termination depends on the rule set: rules that loop, or that fight each other, make it run forever or yield unpredictable normal forms.",
    k: ["Global default rule set vs explicit rules at each call: a global set makes calls short, but any added rule changes every proof that uses it; explicit lists are stable but verbose.", "Proof term per rewrite vs reflective evaluation: per-rewrite terms are simple for the kernel, but become huge on large terms; reflection is compact but needs a verified procedure."],
    p: ["A new rule in a library loops with an existing one, and every project depending on it starts timing out.", "The simplifier rewrites into a form that no later lemma matches, so a goal that was one step from finished becomes unprovable by the same route."],
    v: "Run the simplifier on a goal that needs five rules and print the proof term: it is a chain of equality steps, each justified by a named rule, and the kernel accepts it in the stated time.",
    dep: ["rewriting-tactics", "unification", "congruence-closure", "global-environment"]
  },
  "arithmetic-procedures": {
    s: "Decides goals about linear and some nonlinear arithmetic over integers, rationals and naturals, returning a certificate that the kernel can check.",
    d: "For linear arithmetic, the tactic collects the hypotheses and goal, normalizes them to linear forms, and searches for a contradiction using a method such as Fourier-Motzkin elimination or the simplex algorithm. The result is a list of coefficients from which a short proof is assembled. Procedures for polynomial inequalities search for a certificate such as a sum of squares. The hard part is the interface to the rest of the system: recognizing arithmetic buried in types and casts between number types.",
    k: ["Search outside and check a certificate vs search inside the logic: external search can use fast algorithms and floating point, while checking stays simple; in-logic search is slower and larger but depends on nothing outside.", "Complete for a fragment vs heuristic for everything: completeness gives predictable behavior, but anything outside the fragment is simply not handled."],
    p: ["Casts between natural numbers and integers hide facts from the procedure, and it reports failure on a goal that is plainly linear.", "Coefficients grow large and the certificate check becomes the slowest step of the file."],
    v: "Give the procedure a linear inequality that follows from three hypotheses, and confirm it succeeds with a certificate whose coefficients, substituted by hand, derive the contradiction.",
    dep: ["normalization-procedures", "reflection", "literal-acceleration"]
  },
  "normalization-procedures": {
    s: "Proves equalities in algebraic structures such as commutative rings and fields by normalizing both sides to a canonical polynomial form.",
    d: "The tactic parses each side into a polynomial over the atoms it finds, treating unknown subterms as variables, normalizes to a canonical form, and checks the two are equal. The normalization is usually written as a verified function in the logic and run by reflection, so the proof is a single computation. Variants handle fields by tracking denominators and ask for side conditions that divisors are nonzero. It is hard because identifying atoms up to equality is itself approximate, and numerals and casts complicate the parse.",
    k: ["Normalize by a verified function vs by rewriting: the verified function gives a small proof and fast checking, but it is a substantial piece of library code to maintain.", "Complete for ring identities vs best effort for general goals: ring identities are decided exactly, but real goals mix other structure and need preprocessing."],
    p: ["Two occurrences of the same atom are not recognized as equal because they differ in unreduced form, so a true identity fails.", "Division by an expression that might be zero produces a false-looking failure instead of a clear request for a side condition."],
    v: "Prove a degree-four identity in a commutative ring and confirm the proof term is a single reflective check, accepted by the kernel in milliseconds, while a false identity is rejected with the normalized difference shown.",
    dep: ["reflection", "kernel-reduction-machine", "term-representation"]
  },
  "congruence-closure": {
    s: "Decides equality reasoning over uninterpreted functions: given equations between terms, it finds all consequences using the rule that equal arguments give equal results.",
    d: "The algorithm maintains equivalence classes of terms in a union-find structure and a table from function applications to classes. When two classes merge, it propagates to applications whose arguments changed, which may merge more classes. It stores why each merge happened so a proof can be extracted. Extensions add constructor injectivity, disjointness and some arithmetic. The hard part is explanation: producing a short proof of an equality means walking the merge history, and the history must be kept without much memory.",
    k: ["Proof-producing closure vs closure that only answers yes or no: proof-producing is needed in a proof assistant, and adds bookkeeping to every merge.", "Close under the logic's definitional equality vs syntactic terms only: definitional awareness catches more, but can be expensive and unpredictable."],
    p: ["Hypotheses are added to the closure in an order that makes the explanation unnecessarily long and slow to check.", "Terms that are definitionally equal but syntactically different are put in separate classes, so an obvious consequence is missed."],
    v: "State four equalities between applications of an unknown function and confirm the procedure proves a fifth that follows, and that the produced term uses only the given equations and congruence.",
    dep: ["term-representation", "sharing-and-interning", "inductive-declarations"]
  },
  "solver-bridge": {
    s: "Sends a goal to an external SAT, SMT or first-order prover, and turns the answer into a proof the kernel can check, or reconstructs one from scratch.",
    d: "The goal is translated into the solver's input language, encoding the logic's types and functions as the solver understands them. When the solver succeeds, it may return a proof or certificate, which is replayed as kernel steps. Otherwise the bridge uses the answer only to find which lemmas mattered and reproves the goal with internal automation. The solver is not trusted. It is hard because translation can lose information, certificates can be enormous, and solver versions change output.",
    k: ["Replay a certificate vs trust the solver's answer: replay keeps the trusted base small, but can be slow or fail on solver output that is inexact; trusting is fast and enlarges what must be correct.", "Reconstruct using only the facts the solver used: this makes the final proof independent of the solver version, but may fail if the internal automation is weaker."],
    p: ["The translation to the solver is unsound for a feature such as partial functions, so the solver proves something the logic does not support.", "A solver upgrade changes the certificate format, and previously checked proofs fail on the next build."],
    v: "Prove a propositional goal through the bridge with the solver binary replaced by a stub returning a wrong answer, and confirm the kernel rejects the result rather than accepting it.",
    dep: ["reflection", "kernel-checker", "premise-selection"]
  },
  "premise-selection": {
    s: "Chooses which of the library's hundreds of thousands of lemmas are worth giving to a prover for the current goal, using symbols, structure or learned scoring.",
    d: "Given the goal and hypotheses, the selector scores library lemmas by symbol overlap, by similarity of statements, or by a learned model trained on previous proofs, and returns the top few hundred. These go to an automatic prover, which cannot take the whole library. The selector reads only the environment, so it can be wrong without being unsound. It is hard because relevance is not syntactic: the right lemma often mentions few symbols in common with the goal.",
    k: ["Symbol-based scoring vs a trained model: scoring by symbols is cheap, deterministic and needs no training data, while a model finds less obvious lemmas but must be retrained as the library changes.", "Few premises vs many: few keeps the prover fast, but a missing lemma means no proof; many raises the chance and drowns the search."],
    p: ["The right lemma is outside the selected set, so the prover reports failure on a goal that it could prove with that one lemma.", "A model trained on an old library recommends names that no longer exist."],
    v: "On a held-out set of previously proved goals, measure what fraction of the lemmas used in the original proofs appear in the selection, and confirm the number matches the recorded baseline for the current library.",
    dep: ["lemma-search", "global-environment", "solver-bridge"]
  },
  "reflection": {
    s: "Proves a statement by running a verified decision procedure inside the logic, so the proof is one computation that the kernel evaluates.",
    d: "A procedure is written as a function in the logic with a proof that when it answers yes, the statement holds. To use it, the tactic converts the goal into the procedure's input data, a syntax tree for example, and the proof term applies the soundness theorem to a computation that reduces to yes. The kernel checks by evaluating, so its reduction speed decides the cost. It is hard because encoding the goal as data must be done by tactics, and any mismatch gives a failure that is only reported when the computation does not reduce.",
    k: ["Reflection vs generating an explicit proof: reflection gives tiny terms and fast checking when evaluation is fast, but needs the procedure verified once, and failures are opaque.", "Evaluate in the kernel vs in a faster evaluator: the kernel is trusted and slow, a faster one is quick but extends the trusted base."],
    p: ["The goal is quoted incorrectly, so the computation reduces to a stuck term, and the error message shows an unreadable internal state.", "A procedure written with well-founded recursion does not compute in the kernel, and the check hangs or fails."],
    v: "Apply a reflective tactic to a large goal and confirm the proof term contains one soundness theorem and one computation, and that the kernel check time scales with evaluation, not with the number of steps.",
    dep: ["kernel-reduction-machine", "reduction-rules", "wellfounded-recursion", "term-representation"]
  },
  "lexer-and-parser": {
    s: "Turns source text into syntax trees using a grammar that users and libraries can extend while a file is being read.",
    d: "A lexer splits the text into tokens, including user-defined symbols, and a parser builds syntax trees, usually a precedence-driven recursive-descent or Pratt-style parser. Because notation declarations in a file add tokens and rules, the grammar is part of the parser's state, and each command is parsed under what has been declared so far. Parse errors are recovered at command boundaries. It is hard because ambiguous notation and unusual token boundaries produce errors that mention internal grammar names the author has never seen.",
    k: ["Parser driven by a mutable grammar table vs a fixed generated parser: a mutable table allows notation extension, but makes parse errors and speed harder to guarantee.", "Whitespace-sensitive tokens vs free-form: whitespace sensitivity resolves ambiguities, but makes the syntax subtle for newcomers."],
    p: ["A newly declared symbol becomes a token that breaks an unrelated expression using the same characters.", "Parser errors point to the end of the command rather than the actual mistake, because backtracking discards the failing position."],
    v: "Declare a notation, use it in the next command, and confirm it parses to the intended tree; then confirm the same text outside the notation's scope still parses as before.",
    dep: ["scoping-and-precedence", "extensible-notation", "document-model"]
  },
  "extensible-notation": {
    s: "Lets libraries and users declare new infix, prefix, binder and mixfix syntax, with a defined meaning and a rule for printing it back.",
    d: "A notation declaration gives a syntax pattern, a precedence, and the term it stands for. The system registers a parsing rule and, where the pattern is invertible, a printing rule so output uses the same notation. Notations can be scoped, attached to an interpretation scope that decides which meaning applies by type, or defined for binders over a collection. It is hard because notations are global in effect: importing a library may change how existing text is parsed or printed.",
    k: ["Notation as a pure surface feature vs as part of semantics: surface-only is simple to reason about, but interpretation scopes, which depend on types, are necessary for overloaded symbols like plus.", "Always print using notation vs only when asked: printing with notation reads like mathematics, but hides the real term when debugging."],
    p: ["Two libraries define the same symbol for different operations, and a file's meaning depends on import order.", "A notation with no printing rule means output shows a different form from input, and copied goals no longer parse."],
    v: "Define a notation, print a term using it, copy the printed text back into the source, and confirm it parses to the identical term as the original.",
    dep: ["lexer-and-parser", "scoping-and-precedence", "pretty-printer"]
  },
  "macros-and-syntax-extension": {
    s: "Rewrites syntax trees into other syntax trees before elaboration, so users can define new commands, tactics and term forms without changing the engine.",
    d: "A macro is a function from a syntax tree to a syntax tree, run by the front end after parsing and before elaboration. Hygiene renames variables introduced by the macro so they cannot capture or be captured by the user's names. Elaborator extensions go further and produce terms directly. Macros are used to define tactic combinations, structure notations and domain-specific languages. It is hard to keep error messages meaningful, since the error is about the expansion rather than what the author wrote.",
    k: ["Hygienic macros vs plain text substitution: hygiene prevents accidental name capture, but makes macros that intend to bind names harder to write.", "Syntax-level macros vs elaborator extensions: macros are simple and portable, but cannot use type information; elaborator extensions can, and are tied to internals."],
    p: ["A macro expands to code with a hygiene scope that makes the name it introduces unavailable to the user's tactic that wants to refer to it.", "Errors are reported on the generated code with no position in the original text."],
    v: "Define a macro that introduces a temporary variable, use it in a context with a same-named user variable, and confirm the expansion does not capture the user's variable and the proof checks.",
    dep: ["lexer-and-parser", "elaborator", "tactic-metaprogramming"]
  },
  "coercions": {
    s: "Inserts conversion functions automatically when a term has one type but another is expected, so people can write numbers or structures where the formal types differ.",
    d: "When unification fails between an expected and an actual type, the elaborator looks for a registered coercion from the actual to the expected type, possibly composing several, and inserts the function application. Coercions can go to function types and to sorts, so a structure can be used as its underlying set. They are registered as instances with a priority. It is hard because insertion is a search in the middle of unification, can produce coercion chains that cost performance, and makes printed terms differ from the typed text.",
    k: ["Implicit coercions vs explicit casts: implicit makes mathematics read naturally, but hides real function applications that matter for rewriting and performance.", "Coercion graph with composition vs a direct pairwise table: composition scales to many types, but different paths between two types must be proved equal."],
    p: ["Two coercion paths between the same types give different but unequal terms, and rewriting fails depending on the path chosen.", "A coercion inserted in a loop condition makes a statement mean something the author did not intend, with no visible mark."],
    v: "Use a natural number where an integer is expected, then print with coercion display on and confirm the inserted cast appears exactly where unification failed, and that its removal breaks the check.",
    dep: ["unification", "elaborator", "instance-resolution"]
  },
  "pretty-printer": {
    s: "Converts terms back into readable source text, inserting notation, hiding what can be inferred, and breaking lines to fit.",
    d: "The printer walks a term and chooses for each subterm a notation, a name, or an application, and whether to show implicit arguments, universe levels and coercions. Output goes through a layout engine that fits to a width with indentation. It uses names for bound variables, avoiding clashes with names in context. Its aim is that printed text parses back to the same term, which fails when information was hidden. It is hard because options trade readability for accuracy, and large terms are expensive to print.",
    k: ["Hide inferable information by default vs show everything: hiding keeps goals short and readable, but when an error depends on what is hidden, the author must change options and retry.", "Round-trip printing as a goal vs best-effort display: round-trip enables copy and paste and tests, but forces printing details that clutter."],
    p: ["Two distinct terms print identically because the difference was hidden, and the author concludes the system is wrong.", "A bound variable is renamed to avoid a clash and the printed name no longer matches the one in the source."],
    v: "Print every statement in a library with default options, parse the output, elaborate it and confirm the result equals the original statement for all but a recorded set of known exceptions.",
    dep: ["extensible-notation", "term-representation", "binders-and-indices"]
  },
  "scoping-and-precedence": {
    s: "Defines how names resolve and how operator precedence and associativity are specified, including local and scoped overrides of both.",
    d: "Precedence levels and associativity are given numerically on each notation, with the parser using them to build trees. Name resolution consults local variables first, then open namespaces and imports, and reports ambiguity when several match, sometimes using types to choose among overloads. Auto-bound implicit names can turn a typo into a new variable. The difficulty is overloading: elaboration must try each candidate and keep the ones that type check, which is an expensive search that makes error messages confusing.",
    k: ["Overloading resolved by type vs requiring distinct names: type-directed overloading allows natural notation, but multiplies elaboration work and hides which meaning was chosen.", "Auto-bound implicit variables vs explicit declarations: auto-binding shortens statements, but a misspelled name quietly becomes a new universally quantified variable."],
    p: ["A misspelled lemma name in a statement is treated as a new variable, and the resulting statement is trivially true.", "An ambiguous overload fails with a message listing every candidate and no hint about which failed why."],
    v: "Write a statement with a deliberately misspelled constant and confirm the system either errors or displays the new variable in the signature, rather than silently accepting a different statement.",
    dep: ["namespaces-and-modules", "lexer-and-parser", "global-environment"]
  },
  "elaborator": {
    s: "The component that turns user-written syntax into a complete, explicit term, by type checking, inferring omitted parts and solving constraints along the way.",
    d: "The elaborator walks the syntax tree with an expected type where one is known, producing a term. At each point where information is missing, such as an omitted argument or an unknown type, it creates a metavariable and records a constraint. Constraints are solved by unification, instance resolution and default rules, and any left over at the end are errors. It calls into notation, coercions and tactics. It is the largest part of the system and the hardest to specify, since its behavior defines what short inputs mean.",
    k: ["Heuristic elaboration that works on common code vs a specified algorithm: heuristics make real developments pleasant to write, but behavior is documented only by examples and changes break proofs.", "Elaborate everything up front vs postpone problems: postponing handles more programs, but errors move away from the cause."],
    p: ["A change to the elaborator order makes unification choose a different solution, and many downstream proofs fail without any change to their own text.", "Elaboration time grows exponentially on deeply nested overloaded notation."],
    v: "Elaborate a statement with several omitted arguments and print the full term: every implicit argument and instance is filled in, no metavariables remain, and the kernel accepts the term.",
    dep: ["bidirectional-checking", "metavariables", "unification", "implicit-arguments", "instance-resolution"]
  },
  "bidirectional-checking": {
    s: "Type checking that alternates between checking a term against a known type and inferring a type from a term, propagating expected types to guide elaboration.",
    d: "In checking mode, the expected type flows downward, which lets lambda abstractions omit binder types and lets constructors determine implicit arguments from their expected result. In inference mode the type flows up from the term. Application elaboration infers the function's type first, then checks arguments against the parameter types, delaying arguments whose expected type has unsolved metavariables. It is hard to choose the order of arguments, because elaborating one first can supply the information needed by another.",
    k: ["Expected types pushed down vs inference only: pushing down needs less annotation and gives better errors, but makes elaboration order significant.", "Elaborate arguments left to right vs by dependency: left-to-right is predictable, but dependency order resolves more programs and is harder to explain."],
    p: ["An argument is elaborated before the information that disambiguates it, and a fine program is rejected until the author adds an annotation.", "The expected type contains unsolved metavariables, so propagating it down gives no benefit and hides an error."],
    v: "Write a function with an unannotated lambda passed to a higher-order lemma and confirm the binder type is inferred from the lemma's parameter type and the printed term shows the full annotation.",
    dep: ["metavariables", "unification", "implicit-arguments"]
  },
  "metavariables": {
    s: "Placeholders for unknown terms, types or levels, each with a context and a type, which are assigned as constraints are solved.",
    d: "A metavariable records the local context it may depend on and its type. Assignment checks that the value uses only the variables in scope and does not mention the metavariable itself. Delayed assignments handle binders whose context is not yet known. Instantiating replaces assigned metavariables inside terms, usually lazily. Nested contexts create the main difficulty: a metavariable created under a binder cannot be assigned a term that mentions variables introduced after it, which causes subtle failures.",
    k: ["Contexts recorded per metavariable vs one global context: per-metavariable contexts are precise and catch scoping errors, at the cost of more bookkeeping on every assignment.", "Assign eagerly and instantiate lazily vs substitute immediately: lazy instantiation is cheap per step, but terms carry chains of assignments that must be followed repeatedly."],
    p: ["A metavariable is assigned a term mentioning a variable out of its scope, which an occurs check misses until the kernel rejects the term.", "Long chains of assignments make every later inspection slow."],
    v: "Elaborate a term with an unknown, assign it through unification, and confirm the final term contains no metavariable and that the metavariable's recorded context contains every variable the value uses.",
    dep: ["term-representation", "binders-and-indices", "substitution"]
  },
  "unification": {
    s: "Finds assignments to metavariables that make two terms equal up to definitional equality, with heuristics for the problems that have no unique answer.",
    d: "Given two terms, unification compares their structure. If one side is a metavariable it assigns it. If heads differ it unfolds definitions, tries to reduce, or uses constant approximation. Applications of unknown functions use pattern rules where possible and guesses otherwise. Problems that cannot be decided yet are postponed. It is undecidable in general for this logic, so the implementation is a set of heuristics. Their order of attempts defines which proofs succeed.",
    k: ["Complete but slow vs fast but incomplete: completeness is unattainable in higher-order logic, so every system picks heuristics that favor common cases and sometimes choose a wrong solution.", "Unfold definitions on demand vs eagerly: on demand is fast, but can fail where a different unfolding order would succeed."],
    p: ["Unification chooses a constant function as the solution to a higher-order problem, giving a goal that type checks and is useless.", "A heuristic takes exponential time on a pair of large terms that differ only deep inside."],
    v: "Unify a pattern containing a metavariable applied to a bound variable with a concrete term, and confirm the assigned solution, substituted back, makes both sides convertible by the kernel.",
    dep: ["metavariables", "conversion-checking", "pattern-unification", "transparency-controls"]
  },
  "pattern-unification": {
    s: "A decidable fragment of higher-order unification: a metavariable applied to distinct bound variables has a unique most general solution, found by abstraction.",
    d: "When a problem has the form of a metavariable applied to distinct local variables equal to a term, the solution is the term with those variables abstracted. The check is that the term mentions no other locally bound variable. Most practical problems fall into this fragment, so it is the main route for solving them. Problems outside it are postponed or approximated. It is hard to apply because terms in practice are partially instantiated, so a problem becomes a pattern only after other constraints are solved.",
    k: ["Solve only patterns and postpone the rest vs guess for non-patterns: patterns give unique answers and predictable behavior, but some programs need guesses that the fragment cannot make.", "Prune the arguments of metavariables during solving: pruning increases the number of solved problems, but changes metavariable contexts that other constraints depend on."],
    p: ["A problem that would become a pattern after one more assignment is rejected early, so a valid program fails on elaboration order.", "A repeated variable in the application makes the solution non-unique, and the unifier fails instead of reporting why."],
    v: "Unify a metavariable applied to two distinct bound variables with a term using both, and confirm the solution is the corresponding lambda abstraction and that conversion with the original holds.",
    dep: ["metavariables", "binders-and-indices", "substitution"]
  },
  "implicit-arguments": {
    s: "Arguments the author omits because they can be recovered from other arguments or from the expected type, marked in a function's signature.",
    d: "A signature marks parameters as implicit; at each use, the elaborator inserts a metavariable for each one and expects unification to find it from the explicit arguments or the target. Strict-implicit marks apply only once an explicit argument follows. A syntax lets the author pass an implicit one by name or position when inference fails. Without them statements about polymorphic algebra would drown in types. They are hard to design because a poor choice makes a function either impossible to use without annotations or ambiguous.",
    k: ["Mark a parameter implicit vs explicit: implicit keeps uses short, but if it cannot be inferred from other arguments, every use needs a manual annotation.", "Insert implicit arguments eagerly vs when needed: eagerly is simple and uniform, but breaks passing the function itself as a value where its implicit must remain abstract."],
    p: ["A lemma whose implicit argument is only determined by the goal fails with an unsolved metavariable when used in a hypothesis.", "Implicit arguments that depend on each other are inferred in an order that picks the wrong one."],
    v: "Use a polymorphic function with its type argument omitted, then print with implicit arguments shown and confirm the inferred type argument equals what the signature required.",
    dep: ["metavariables", "unification", "bidirectional-checking"]
  },
  "instance-resolution": {
    s: "Finds a value of a class-like type, such as an ordering on a given type, by searching registered instances with a tabled, goal-directed search.",
    d: "Classes are types that describe structure, and instances are registered terms that provide it. When elaboration needs one, a logic-programming search runs, trying instances in priority order, with premises as subgoals, and caching results in a table so repeated subgoals are shared. Output parameters allow the result to determine other arguments. It builds big structures from small ones, like order on a pair from orders on each part. It is hard because search can loop or blow up, and the result depends on priorities and import order.",
    k: ["Search with a priority order vs unique instances by construction: priorities allow overriding defaults, but results depend on declaration order; uniqueness is predictable but forbids useful overlap.", "Tabled search vs plain depth-first: tabling prevents repeat work and cycles, but costs memory and makes caching rules subtle."],
    p: ["A new instance in a library changes which instance is found for existing code, and values that were definitionally equal are no longer.", "Search loops through a cycle of instances that each require the other, and the check times out."],
    v: "Ask for an instance on a nested product of types, print the found term, and confirm it is assembled from the registered component instances and that the search trace lists no failed branches beyond the recorded budget.",
    dep: ["unification", "metavariables", "global-environment", "elaborator"]
  },
  "universe-inference": {
    s: "Solves the constraints among universe levels that arise when checking terms, so authors rarely write levels and the system finds a consistent assignment.",
    d: "Each use of a type in a universe creates a level variable, and checking adds constraints: one level is less than or equal to, or strictly less than, another. A solver maintains a graph of constraints and rejects a cycle containing a strict edge, which is a universe inconsistency. Declarations may be universe polymorphic and instantiate fresh levels at each use. It is hard because errors appear far from the cause, and because minimizing levels, to keep declarations as general as possible, affects later use.",
    k: ["Infer levels automatically vs require explicit levels: inference hides the hierarchy from most authors, but inconsistency messages refer to level variables that never appear in the source.", "Generalize every declaration over levels vs fix them: generalization makes definitions reusable, but multiplies level variables and the cost of every conversion check."],
    p: ["A universe cycle is reported on a line far from the definition that introduced the strict constraint.", "A definition is accidentally fixed at one level, and a later use at a higher level fails."],
    v: "Define a type of types containing itself and confirm the system reports a universe cycle naming the constraints, while the legitimate version one level up checks and the kernel accepts it.",
    dep: ["universe-hierarchy", "universe-polymorphism", "metavariables"]
  },
  "postponement-and-error-reporting": {
    s: "Defers constraints that cannot yet be solved until more is known, and when elaboration finally fails, explains the failure in terms of what the author wrote.",
    d: "When unification meets a problem it cannot decide, it records it with its context and postpones it, and the elaborator proceeds. Postponed problems are retried when new assignments might help, and as a last resort default rules apply. If something remains, the system reports it. Messages show the expected and actual terms, the context and which application failed. It is hard to choose which of many failed constraints to report, since the first failure is often a consequence of something earlier.",
    k: ["Postpone and retry vs fail immediately: postponement accepts more programs, but delays errors until a point that can be far from their source.", "Report the first failure vs the most informative one: the first is simple and predictable, but a later failure may name the real mistake."],
    p: ["A postponed constraint is solved by a default that the author did not expect, silently changing the meaning of a number literal.", "An error message prints two terms that look the same, because the difference is an implicit argument or universe level."],
    v: "Write a mismatched application and confirm the message names the argument position, shows the expected and actual types, and, with implicit arguments displayed, the difference between them is visible.",
    dep: ["unification", "metavariables", "diagnostics-and-recovery", "pretty-printer"]
  }
});
