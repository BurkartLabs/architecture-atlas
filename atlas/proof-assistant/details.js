// Details for the proof assistant plate, part 1: editor protocol, libraries, tactics.
ATLAS.details("proof-assistant", {
  "editor-protocol": {
    s: "The message protocol between the editor and the checking engine: edits go in, and goal states, diagnostics and progress come back while the person keeps typing.",
    d: "The engine runs as a separate process and speaks a structured request and notification protocol, usually JSON over a pipe or socket. The editor sends document changes and cursor positions. The engine answers with diagnostics, the proof state at a position, and a progress report saying which region is checked. Beyond generic language-server features it adds custom requests for goals and proof state. Hard parts are ordering of concurrent requests against changing text and cancelling stale work quickly.",
    k: ["Generic language-server messages plus custom extensions vs a fully custom protocol: reuse of existing editors comes cheap, but proof-specific views need extensions that each editor must implement.", "Push of progress and diagnostics vs polling: pushing keeps the display current without request traffic, but needs back-pressure so a slow editor cannot stall checking."],
    p: ["A response computed for an old version of the text is shown against the new one, so goals appear that do not match the cursor.", "Long-running checks that ignore cancellation make every later request queue behind work nobody wants."],
    v: "Type a character in the middle of a long proof and watch the trace: the engine cancels the old check, reports the new version, and the goal view at the cursor updates within a fraction of a second.",
    dep: ["document-model", "incremental-checking"]
  },
  "document-model": {
    s: "The engine's versioned in-memory copy of each open file, split into commands so a change invalidates only the commands it can affect.",
    d: "Each file is parsed into a sequence of top-level commands, each with a source range, a parse result and a checking status. An edit replaces a text range, reparses from the nearest command boundary, and compares new commands with old ones to reuse results. A version number tags every state. Open files shadow the disk, and other files come from compiled library output. It is hard because parsing depends on notation declared earlier in the file, so an edit can change how later text parses.",
    k: ["Command-level granularity vs finer syntax-tree granularity: command-level is simple and matches checking units, but a single long proof is re-run entirely after any edit inside it.", "Reparse from the edit vs reparse the whole file: local reparse is fast, but must detect when the edit changes notation and widen the invalidated region."],
    p: ["A notation or import change at the top reparses later commands under old assumptions and gives errors that vanish on reload.", "Version numbers that are not threaded through every result let late answers overwrite fresh state."],
    v: "Edit a lemma statement near the top of a file and confirm that only commands depending on it are marked pending, while unrelated commands keep their previous results and timestamps.",
    dep: ["lexer-and-parser", "incremental-checking"]
  },
  "proof-state-display": {
    s: "Renders the current goals, their hypotheses and the metavariables in play as structured text that the editor can show beside the code.",
    d: "At a cursor position the engine finds the tactic state after the preceding step and prints each goal as a list of named hypotheses with types, followed by the target. It is produced by the pretty printer under display options such as hiding implicit arguments or universe levels. Newer designs return structured trees rather than strings so the editor can attach hovers and clickable subterms. The hard part is size: real goals contain terms that print to thousands of lines.",
    k: ["Structured output vs plain strings: trees allow hover, click-to-copy and folding, but every editor needs rendering code and the protocol grows.", "Show all goals vs only the focused one: all goals give context, but a proof with hundreds of side goals buries the one being worked on."],
    p: ["Display options that hide implicit arguments make two different goals look identical and mislead the author about why a rewrite fails.", "Printing very large terms freezes the editor while the engine is still waiting to answer other requests."],
    v: "Place the cursor between two tactics, and confirm the displayed goals match the engine's actual state: copy the shown target into a new statement with the shown hypotheses and see it check.",
    dep: ["goal-state-model", "pretty-printer", "editor-protocol"]
  },
  "hover-and-goal-info": {
    s: "Answers questions about the term under the cursor: its type, the definition it refers to, its documentation, and the instances or coercions the elaborator inserted.",
    d: "During elaboration the engine records an info tree that maps source ranges to the terms, expected types, local contexts and metavariable assignments seen there. A hover or go-to-definition request looks up the innermost range containing the position and prints the stored information. Because it records what was done, it can show inserted implicit arguments that the source never contained. The cost is memory: the info for a large file is itself a large structure kept alive for the editor.",
    k: ["Record info during elaboration vs recompute on request: recording is exact and cheap to query, but retains data for every file; recomputing saves memory but can disagree with the original run.", "Show elaborated terms vs source text: the elaborated form tells the truth about what was checked, but differs from what the person wrote."],
    p: ["Info trees for failed commands are partial, so hover silently shows nothing exactly where the author needs it.", "Positions that shift after an edit return information for a neighboring term."],
    v: "Hover over a function application with an omitted argument and confirm the shown type includes the inferred implicit argument that matches what the kernel receives in the final term.",
    dep: ["elaborator", "document-model", "pretty-printer"]
  },
  "diagnostics-and-recovery": {
    s: "Reports errors and warnings with source ranges, and keeps checking after an error so one mistake does not hide every message after it.",
    d: "Each command produces diagnostics with a range, severity and message. Recovery means the engine continues after a failure: a failed tactic marks its goal as admitted with an error term and proceeds, so later goals are still checked. Errors may carry structured data, such as the expected and actual types, so the editor can offer fixes. Hard parts are cascading errors, where one wrong definition produces dozens of unrelated complaints, and keeping recovery from producing a term that looks complete.",
    k: ["Recover and continue vs stop at the first error: continuing shows all problems at once, but later messages may be consequences of the first, and a recovered proof must never be accepted as complete.", "Errors in the goal view vs in a separate list: inline errors sit where the author works, but long messages crowd out the proof state."],
    p: ["Recovery inserts a placeholder that later checks accept, so the file appears to succeed while containing an unproved hole.", "Error ranges that cover a whole command rather than the failing token send the author to the wrong place."],
    v: "Introduce one wrong lemma name in the middle of a proof and confirm exactly one error at that token, with the following steps still checked and the theorem reported as depending on an admitted placeholder.",
    dep: ["postponement-and-error-reporting", "document-model", "axiom-tracking"]
  },
  "completion-and-code-actions": {
    s: "Suggests names, tactics and whole next steps at the cursor, and offers edits such as filling in missing cases or replacing an automation call with its explicit proof.",
    d: "Completion queries the environment and the local context for names whose types fit the expected type at the cursor, ranked by namespace and recent use. Code actions use the same information to generate text: the cases of a match, the skeleton of a structure instance, or the explicit steps found by an automatic tactic so the slow search can be removed. The difficulty is that the context at a cursor may be incomplete, since the surrounding code often does not yet parse or check.",
    k: ["Type-directed suggestions vs textual prefix matching: type-directed results are far more relevant, but need a usable expected type, which broken partial code often lacks.", "Generated code that is exact vs short: exact output is robust against automation changes, but is much longer than the call it replaces."],
    p: ["Suggestions ranked by name alone offer a lemma in the wrong namespace that cannot apply, and the author trusts it.", "A generated replacement script that was found under one set of options fails when checked under the project's defaults."],
    v: "Invoke the suggestion at a goal and apply the first result: the edited file must check, and the replaced automation call must now succeed without searching.",
    dep: ["lemma-search", "goal-state-model", "document-model"]
  },
  "interactive-stepping": {
    s: "Lets the author move forward and backward through a proof one step at a time and see the state after each, without rerunning the whole file by hand.",
    d: "Older systems kept a mutable session where commands are submitted in order and can be undone back to a saved state. Newer ones derive the state at any position directly from the document, since each command's result is stored and each tactic records its before and after states. Moving the cursor is then a lookup. Backward movement needs persistent states or checkpoints; the hard part is memory, because each intermediate proof state holds term data.",
    k: ["Document-driven state at any position vs a stateful session with undo: lookup needs no session and survives reordering, but retains every intermediate state; sessions use less memory but fail on out-of-order edits.", "Per-tactic states vs per-command states: per-tactic gives fine inspection, at a cost multiplied by the number of steps."],
    p: ["Undo in a stateful session does not restore a side effect such as a global option or registered notation, leaving later behavior inconsistent.", "A very long tactic block keeps thousands of intermediate states alive and exhausts memory."],
    v: "Step to the middle of a long proof, change one early tactic, and confirm the state shown at every later position is recomputed and matches a full check run from the start of the file.",
    dep: ["document-model", "goal-state-model", "incremental-checking"]
  },
  "standard-library": {
    s: "The shipped collection of definitions and theorems for numbers, lists, sets, relations and algebra, which defines both the style of proofs and what is cheap to prove.",
    d: "The library supplies the basic data types, their operations, and the lemmas that connect them, plus the instances and simplification rules that make automation work on them. A larger mathematical library is often separate and layered above it. Its design choices, such as how natural numbers or finite sets are represented, shape every later proof. It is hard to maintain because thousands of proofs depend on exact statement forms and on which lemmas the simplifier uses.",
    k: ["Small core with a large separate library vs one big library: a small core is stable and quick to load, but users must manage versions of two things that must agree.", "Computable definitions vs convenient ones: computable definitions allow evaluation and extraction, but are often harder to prove properties about."],
    p: ["Adding a simplification rule that loops with an existing one makes automation hang across every project that imports the library.", "Renaming a lemma for consistency breaks downstream proofs that referred to it by name."],
    v: "Build the whole library from a clean checkout with the kernel checker enabled for every declaration, and confirm zero errors, zero unexpected axioms and a build time within the recorded budget.",
    dep: ["namespaces-and-modules", "simplifier", "inductive-declarations"]
  },
  "namespaces-and-modules": {
    s: "Organizes names into hierarchies and files so that large libraries avoid collisions and users control which definitions, notations and rules are visible.",
    d: "Names live in nested namespaces; opening one makes its short names visible, and sections introduce shared variables and local settings that end with the section. Files are modules imported by others, forming a dependency graph that must have no cycles. Attributes, notations and instances are scoped to a file, a section, or globally. It is hard because visibility is itself state: what a name means depends on what was imported and opened at that point.",
    k: ["Globally visible instances and notation vs locally scoped: global is convenient and predictable for libraries, but importing two libraries can create conflicting meanings with no way to opt out.", "Strict import order vs unordered imports: strict order makes meaning deterministic, but forces a diamond of dependencies to be arranged by hand."],
    p: ["Two imported files each declare a notation for the same symbol, and which one wins depends on import order.", "A cyclic import is introduced by moving one lemma, and the error appears far from the change."],
    v: "Import two libraries that each define a short name, then use the qualified name for each and confirm both resolve to the intended declaration, while the ambiguous short name is reported as an error.",
    dep: ["global-environment", "scoping-and-precedence"]
  },
  "lemma-search": {
    s: "Finds existing theorems by name, by pattern in the statement, or by the shape of the current goal, so authors do not reprove what the library already has.",
    d: "A search index is built over the statements of all declarations. Name search is a prefix or fuzzy match. Pattern search matches a term with holes against subterms of statements, usually with a discrimination tree keyed on head symbols. Goal-directed search asks which lemmas could close or rewrite the current goal. Results are ranked by closeness and by library structure. It is hard because matching must be up to reduction and instances while staying fast over a library of hundreds of thousands of statements.",
    k: ["Index on syntactic shape vs match up to definitional equality: shape indexes are very fast and predictable, but miss lemmas stated in an equivalent form.", "Precomputed index shipped with the library vs built at load: shipping makes search instant, but it must be rebuilt in step with the library."],
    p: ["A lemma exists under a different but equivalent statement, the search misses it, and the author proves it again.", "The index is out of date relative to the loaded files and returns lemmas that are not imported."],
    v: "Search with a pattern for a known lemma, with the arguments left as holes, and confirm that lemma is returned in the first results and that its name can be used directly in the current file.",
    dep: ["global-environment", "term-representation", "compiled-library-files"]
  },
  "package-and-versioning": {
    s: "Specifies which versions of the system and of each library a project uses, fetches them, and builds them together reproducibly.",
    d: "A project manifest names the engine version and dependencies with version constraints. A resolver picks a compatible set and a lock file records it. Because proofs refer to the exact statements of imported theorems, a minor library change can break a dependent, so versions are usually pinned to a single known-good revision rather than a loose range. The tool builds dependencies once and shares compiled files. It is hard because the engine itself changes the logic's behavior between versions.",
    k: ["Pin exact revisions vs semantic version ranges: pinning gives reproducible builds, but dependents upgrade slowly; ranges upgrade smoothly but break on changes that semantic versioning does not capture.", "One shared compiled cache vs per-project builds: sharing saves hours, but requires keys that include the exact engine and options."],
    p: ["A resolver picks two versions of one library, and types from the two do not unify even though they print the same.", "A cached build is reused after an engine option changed, hiding a failure until a clean build."],
    v: "Check out the project on a clean machine, run the build from the lock file, and confirm every declaration is checked with the recorded engine version and the result is identical to the reference build.",
    dep: ["compiled-library-files", "dependency-and-rebuild"]
  },
  "axiom-audit": {
    s: "Reports which axioms and unproved placeholders a given theorem depends on, so users can see exactly what a result assumes.",
    d: "Every declaration records the constants it uses, and the audit walks that dependency closure to collect axioms, placeholder proofs and unchecked extensions such as native evaluation. A command prints the list for a theorem, and the build can fail if the list contains something not allowed. It depends on the kernel recording dependencies exactly. The hard part is transitive reach: a theorem inherits the assumptions of everything it used, including through definitions rather than proofs.",
    k: ["Audit as a separate query vs enforced at declaration time: queries are flexible and cheap, but nothing stops a library from accepting an unwanted axiom unless the build checks.", "Treat placeholders like axioms vs report them separately: uniform treatment is simpler to reason about, but hides the difference between a stated assumption and unfinished work."],
    p: ["A definition quietly uses an axiom for choice, and every theorem using the definition inherits it with no mention in its statement.", "A placeholder left in a helper lemma is not noticed because the main theorem checks successfully."],
    v: "Run the audit on a theorem that uses classical reasoning and confirm the list names exactly the classical axioms used, and that a constructive theorem in the same file reports none.",
    dep: ["axiom-tracking", "global-environment"]
  },
  "doc-and-source-links": {
    s: "Generates browsable documentation from the library with statements, doc comments and links to the source, so definitions can be read without opening the project.",
    d: "A documentation generator loads compiled modules, then renders each declaration with its signature, attached text and a link to its source line. Since statements may use notation and coercions, it calls the pretty printer under the notation active in that file. Cross references link names within and across libraries, and a search index is built from the output. It is hard because signatures depend on the same state as elaboration, so documentation that ignores scoping prints names that cannot be typed.",
    k: ["Render from compiled declarations vs from source text: compiled output is exact and includes generated items, but loses comments and layout that only exist in source.", "One site per library vs a combined site: combined search is more useful, but versions of different libraries must agree."],
    p: ["Notation is printed with the global defaults rather than the file's scope, so the displayed statement is not what was written.", "Links point to a source revision that no longer matches after the library moves on."],
    v: "Open the generated page for a lemma, follow its source link, and confirm the linked line contains the same statement, and that every constant in the signature links to its own page.",
    dep: ["pretty-printer", "global-environment", "compiled-library-files"]
  },
  "tactic-language": {
    s: "The language in which proof scripts are written: a sequence of commands that each transform the current goals, with the syntax, scoping and control flow around them.",
    d: "A script is a sequence of tactic invocations, each taking arguments such as terms, names and options, and acting on the goal state. The language has its own syntax for focusing on one goal, naming hypotheses, and branching. It is separate from the term language: the same system has a language for stating things and a language for finding proofs. The difficulty is that the effect of a command depends on hidden state, so a script that reads clearly may be unreadable without running it.",
    k: ["Imperative script style vs declarative proof style: scripts are short to write and write like a conversation with the system, but are hard to read later; declarative text is long but states each intermediate claim.", "A fixed built-in tactic set vs a language users can extend: extensibility lets libraries add domain tactics, but each extension is another place for subtle bugs."],
    p: ["A tactic works only because of hypothesis names it auto-generated, and breaks when an earlier step changes the naming.", "A proof relies on the order that goals are produced, and any change to a lemma silently reorders them."],
    v: "Check a proof written only with the language's documented commands, then print the final proof term and confirm it is a closed term accepted by the kernel with no remaining goals.",
    dep: ["goal-state-model", "core-tactics", "tactic-combinators"]
  },
  "goal-state-model": {
    s: "The data structure for an unfinished proof: a list of goals, each a local context and a target, with the metavariable assignments that will assemble the final term.",
    d: "A goal is a metavariable whose type is the statement to prove, together with the local context of hypotheses available. A tactic closes a goal by assigning the metavariable a term that may contain fresh metavariables, which become the new goals. The state also tracks which goals are in focus. The final proof term is obtained by instantiating all assignments. The hard part is that metavariables can depend on each other and be assigned out of order, so goals are not a simple stack.",
    k: ["Goals as metavariables in a shared context vs as an explicit proof tree: metavariables allow dependent goals and sharing, but make the state harder to inspect and undo.", "Persistent immutable state vs mutable state with a trail: immutable makes backtracking trivial, but costs more memory when many alternatives are tried."],
    p: ["A tactic assigns a metavariable that another goal depends on, and the dependent goal becomes ill-typed in a way that only surfaces at the end.", "Unassigned metavariables are left at the end of a proof and are reported far from the tactic that created them."],
    v: "Apply a lemma with two premises and confirm the state shows exactly two new goals with correct contexts; finishing both yields a term where every metavariable is assigned and the kernel accepts it.",
    dep: ["metavariables", "term-representation", "substitution"]
  },
  "core-tactics": {
    s: "The small set of primitive proof steps that everything else is built from: introducing hypotheses, applying lemmas, supplying exact terms, and splitting conjunctions.",
    d: "A handful of tactics correspond to the basic moves of logic: introduce an assumption or variable, apply a function or lemma to the goal, give a term directly, assume a hypothesis, and close trivial goals by reflexivity. Each is implemented by elaborating its argument, unifying its type with the goal, and creating new goals for the arguments left open. Almost every automated tactic ends up calling these. The hard part is that application depends on unification, so its behavior on a goal is only as predictable as unification is.",
    k: ["Few powerful primitives vs many specialized commands: few primitives are easy to learn and check, but common patterns need long scripts; many commands are short but each is another thing to specify.", "Apply up to definitional equality vs syntactic match: up to equality succeeds in more cases, but can be slow or unfold definitions the author did not expect."],
    p: ["Applying a lemma creates goals in an order that differs from the lemma's argument order, and a script written for one order fails.", "Unification solves a metavariable with the wrong instance, giving a goal that is true but useless."],
    v: "Prove a small implication using only introduce, apply and assumption, then print the resulting term and confirm it is the expected lambda and application and passes the kernel.",
    dep: ["goal-state-model", "unification", "elaborator"]
  },
  "rewriting-tactics": {
    s: "Replaces part of a goal using an equation, by finding the left side in the target, abstracting it, and producing a proof that the new goal implies the old one.",
    d: "Rewriting by an equation finds instances of its left side in the goal, usually the first match and all of its identical copies, abstracts them into a motive, and replaces them with the right side. The proof term uses the equality eliminator on that motive. Variants rewrite in hypotheses, rewrite backward, or rewrite under binders using congruence lemmas or setoid relations. It is hard because finding the pattern up to instances is a unification problem, and because rewriting under binders needs support for non-equality relations.",
    k: ["Syntactic pattern matching vs matching up to reduction: syntactic matching is fast and predictable, but fails when terms are equal only after computation.", "Rewrite under binders through generic congruence vs special-purpose tactics: generic support covers any relation, but needs registered lemmas and is slower."],
    p: ["Rewriting changes more occurrences than intended because the pattern matches several places, and the later steps no longer apply.", "The motive is not type correct because a dependent type mentions the rewritten term, producing an error about abstraction."],
    v: "Rewrite with a known equation in a goal that contains the left side twice, and confirm in the displayed state that both occurrences changed, then close the goal and see the kernel accept the term.",
    dep: ["goal-state-model", "unification", "core-tactics"]
  },
  "induction-and-cases": {
    s: "Splits a goal by the constructors of an inductive type, and for recursive types generates the induction hypothesis, using the type's eliminator to build the proof.",
    d: "Case analysis on a term replaces it with each constructor applied to fresh variables, producing one goal per constructor. Induction does the same and adds hypotheses for the recursive arguments. The tactic must generalize the goal over variables that depend on the term, pick the right eliminator for indexed families, and replace the term everywhere it appears. For families, indices must be unified with constructor results, which can eliminate impossible cases or fail. It is hard because dependencies between hypotheses force careful reordering.",
    k: ["Eliminator-based tactic vs direct pattern matching on a recursive function: eliminators are uniform and checked by the kernel directly, but pattern matching is easier to write and compiles to eliminators.", "Automatic generalization of dependencies vs asking the author: automatic is convenient, but can produce an induction hypothesis too weak or too strong."],
    p: ["The induction hypothesis is too specific because a variable was not generalized, and the proof cannot finish at the recursive step.", "Case analysis on an indexed family leaves equalities that cannot be solved, and the author is shown a stuck unification problem."],
    v: "Prove a property of a list by induction and confirm two goals appear, one with an induction hypothesis; the final term uses the type's recursor and is accepted without any recursion in the term.",
    dep: ["recursors", "goal-state-model", "inductive-declarations", "unification"]
  },
  "tactic-combinators": {
    s: "Operators that combine tactics: run in sequence, try alternatives, repeat, apply to all goals, or focus on one, so scripts express control flow.",
    d: "Sequencing runs one tactic then another on the resulting goals. Alternatives try the first tactic and fall back to the second if it fails, with backtracking over the state. Repetition runs a tactic until it fails. Focus blocks restrict a tactic to one goal and require it to finish. Failure is an exception caught by the combinators. It is hard because failure semantics, such as whether a partial change is undone, determine whether scripts are predictable, and unbounded repetition may never stop.",
    k: ["Backtracking over alternatives vs commit to the first success: backtracking finds more proofs, but searches exponentially and hides which branch was used; committing is predictable but misses solutions.", "Structured blocks that must finish vs free sequences: blocks localize failures and make scripts robust to goal order, but need more syntax."],
    p: ["A repeated tactic loops on a goal that it keeps changing without making progress, and the system hangs.", "A failure caught by an alternative hides a real error, so a later and unrelated tactic reports the problem."],
    v: "Run a first-success alternative where the first branch fails midway and confirm the state shown afterward has none of that branch's partial changes, while a branch that succeeds leaves its goals.",
    dep: ["tactic-language", "goal-state-model"]
  },
  "tactic-metaprogramming": {
    s: "Lets users write new tactics in a programming language that can inspect goals, build terms, call the elaborator and report errors, running inside the system.",
    d: "Tactics are programs in a monad that carries the goal state, the local context and a cache. They can read and construct terms, call unification, add declarations and print messages. Either the tactic language is itself an embedded programming language or a general language is exposed through an API. Because tactics only produce terms, a buggy tactic cannot make a false proof, only a rejected one. It is hard because the term-building API must keep terms well scoped and avoid exposing unstable internals.",
    k: ["A tactic language that is the same as the main language vs a separate scripting language: one language reduces learning and lets tactics be proved, but pays for the full language's type checking when writing them.", "Direct term construction vs going through the elaborator: direct is fast, but skips checks and unification that elaboration provides."],
    p: ["A tactic builds a term that is not well scoped, and the error appears only when the kernel rejects the final proof, far from the faulty tactic.", "A tactic depends on internal functions that change between versions, and breaks on every upgrade."],
    v: "Write a small tactic that proves a family of goals, run it on three goals of that shape, and confirm each result passes the kernel, and that a goal of the wrong shape gives a clear error rather than a wrong term.",
    dep: ["tactic-language", "elaborator", "term-representation", "metavariables"]
  },
  "structured-proofs": {
    s: "A proof style where each step states the claim it establishes, so the proof reads as mathematics and survives changes to automation.",
    d: "The author writes assumptions, intermediate claims and conclusions explicitly, each followed by a justification, which can be a tactic or a call to automation. The system checks that each claim follows from earlier ones and that the last claim matches the goal. The text is translated into the same goal-state machinery as tactics. It is more verbose but reads without running anything. The difficulty is making each small justification cheap and stable enough that the style does not become slower to write than scripts.",
    k: ["Explicit intermediate claims vs a tactic script: explicit claims document the argument and localize failures, but cost more to write and need statements for each step.", "Justify steps by automation vs by named lemmas: automation keeps text short, but a library update can break a step; lemma names are stable but long."],
    p: ["A step is justified by automation that succeeds locally but times out under different library settings.", "Intermediate claims are stated with the wrong implicit types, so they check but do not connect to the next step as intended."],
    v: "Change a lemma used inside one justification and confirm the failure is reported at that single step, with all other steps still checked and the surrounding claims unchanged.",
    dep: ["tactic-language", "goal-state-model", "simplifier"]
  }
});
