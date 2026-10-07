// Details for the parser generator plate, part 1: authoring tools, testing and the grammar language.
ATLAS.details("parser-generator", {
  "grammar-visualizer": {
    s: "Draws the grammar as railroad diagrams and the generated automaton as a state graph, so authors can see what the generator built instead of inferring it from the text.",
    d: "Railroad diagrams render each rule as a path of tokens and branches, and are usually produced straight from the normalized grammar. The state graph shows item sets, transitions and reductions for table-driven parsers, or the decision points for predictive ones. Large grammars produce graphs with thousands of states, so the viewer needs filtering by rule or by state, collapsing of unit rules and links back to source lines. Layout of big graphs is the hard part, not the data.",
    k: ["Static images vs interactive viewer: images drop into documentation and need no tooling, while an interactive viewer can filter and follow a conflict but must be shipped and maintained.", "Show the original grammar vs the normalized one: original rules match what authors wrote, but only the normalized form explains generated states and synthetic rules."],
    p: ["Synthetic rules created by desugaring appear in the graph with invented names, and authors cannot map them back to their source.", "A full state graph of a real language is unreadable, and teams stop opening it."],
    v: "Generate diagrams for a grammar with a known repetition and an optional part. Confirm each rule's path shows the same choices as the source text, and that clicking a state lists its item set with source line links.",
    dep: ["grammar-normalization", "lr0-item-sets", "graph-algorithms"]
  },
  "conflict-explainer": {
    s: "Turns a conflict in the tables into a concrete input and two derivations, so an author sees which two readings of the same text the grammar allows.",
    d: "A raw report names a state and a token. The explainer searches the automaton for the shortest token sequence that reaches the state, then prints the two competing actions as partial derivations with the dot marking where they diverge. For ambiguity it can show two full trees for one sentence. It needs the item sets, lookaheads and a way back from each lookahead to the path that produced it. Unifying counterexamples is expensive and may time out, so the report must say when it gave up.",
    k: ["Shortest example vs most informative example: a short input is easy to read, but a longer one sometimes shows the real cause, such as a missing separator.", "Report every conflict vs group by root cause: the full list is complete, while grouping shows that fifty reports come from one rule but risks hiding a distinct one."],
    p: ["Counterexample search reports nothing on timeout, and authors read silence as no problem.", "Examples use internal rule names from desugaring, so the text matches nothing in the grammar file."],
    v: "Feed it the classic dangling-else grammar. It should print one statement with an else and two derivations that attach the else to different ifs, and name the shift and reduce actions involved.",
    dep: ["conflict-detection", "lalr-lookahead", "graph-algorithms", "generator-diagnostics"]
  },
  "parse-tracer": {
    s: "Logs each decision the generated parser makes, such as rules entered, tokens consumed and alternatives tried, so an author can watch a specific input take the wrong path.",
    d: "A tracing build of the runtime emits an event per shift, reduce, rule entry, rule exit or backtrack, with the token and position. Output is either a text log or a structured stream that a viewer can fold by rule. Tracing must not change behavior, so it hooks the driver loop rather than the actions. The hard part is volume: a thousand-line input produces millions of events, so filters by rule, position range and event kind are required, and memoized or speculative work must be marked as such.",
    k: ["Compile-time trace flag vs runtime switch: compile-time costs nothing in release builds but needs a rebuild, while a runtime switch adds a branch to the hot loop.", "Event stream vs plain text log: structured events can be filtered and replayed in a viewer, at the cost of a format both runtime and tool must agree on."],
    p: ["Trace output interleaves speculative attempts with committed parses, and readers mistake abandoned alternatives for the real path.", "A tracing runtime whose behavior differs from the release one hides the bug it was meant to find."],
    v: "Parse a short input that is mis-recognized, then read the trace: it should show every rule entered with the token position, each backtrack, and the exact token where the chosen alternative failed.",
    dep: ["driver-loop", "token-stream", "source-positions"]
  },
  "grammar-playground": {
    s: "A live editor where an author types grammar and sample input and immediately sees tokens, the parse tree and errors, without leaving to run a build.",
    d: "The playground runs the generator and a runtime in process, or compiled to run in a browser, and reparses on each edit. It shows the token list, the tree, the errors and, ideally, the tracer and conflict report in the same view. The generator must be fast enough to run on every keystroke for small grammars, and must survive an invalid grammar mid-edit by reporting the error and keeping the last good parser. Sharing links that embed grammar and input help teams discuss changes.",
    k: ["Interpreting the grammar vs generating and loading code: interpretation starts instantly and is easier to sandbox, but its behavior can differ from the generated target's.", "Autosave and share state vs local only: shared links make bug reports reproducible, but they put grammar text and sample inputs on a server."],
    p: ["The playground uses an interpreter whose recovery or ambiguity behavior differs from the generated parser, so a fix works there and fails in production.", "A grammar with an infinite loop in analysis freezes the editor because generation runs on the interface thread."],
    v: "Edit a rule while a sample input is loaded. Within a second the tree updates, and introducing a conflict shows the conflict report and keeps the previous working parser available.",
    dep: ["parse-tracer", "conflict-explainer", "parser-api", "generator-diagnostics"]
  },
  "grammar-coverage": {
    s: "Reports which rules, alternatives and tokens a test corpus actually exercised, exposing grammar parts that no test ever reaches.",
    d: "The generated parser, built with coverage hooks, counts each rule entry, each alternative taken and each token kind consumed. A report lists the zero-count items and ranks the rest. It differs from code coverage because an alternative that is never reached usually means a missing test or dead syntax, not an untested branch. With ordered choice, an alternative that is shadowed by an earlier one shows up as permanently uncovered, which is a real grammar defect.",
    k: ["Rule-level vs alternative-level counting: rule counts are cheap and coarse, while alternative counts find shadowed branches but need a hook in every choice point.", "Corpus coverage vs grammar-derived coverage: coverage of real files shows what matters in practice, while generated sentences cover everything but include inputs no one writes."],
    p: ["Coverage counts speculative attempts as hits, so a rule that always fails after being tried looks well covered.", "Teams chase 100 percent and add contrived inputs that exercise no real behavior."],
    v: "Run the corpus against a grammar containing a deliberately unreachable alternative. The report lists that alternative with zero hits and lists every other alternative with its count.",
    dep: ["grammar-test-corpus", "parse-tracer", "reachability-checks"]
  },
  "ambiguity-finder": {
    s: "Searches for a sentence that a grammar parses in more than one way, since no general algorithm can prove a grammar unambiguous.",
    d: "Because ambiguity is undecidable in general, tools use bounded search: enumerate sentences up to a length, or search for two distinct derivations of a shared string through an automaton product. A found example is proof. An empty result only means none was found within the bound. Generators with general parsers can also report ambiguity at run time when two trees appear for real input. Ambiguity found in one rule may come from an interaction across several, which makes the example the most useful output.",
    k: ["Bounded search at generation time vs detection at parse time: generation-time search finds problems before release, but misses long witnesses, while runtime detection sees real inputs only.", "Report every ambiguity vs only unresolved ones: full reports are noisy when precedence already resolves most, so reporting only what remains focuses attention on real defects."],
    p: ["A clean report is read as a proof of unambiguity, though it only covers inputs up to the search bound.", "Ambiguity hidden by ordered choice is never reported, because that formalism has no notion of two parses."],
    v: "Run it on an expression grammar with no precedence. It should return a short sentence such as three operands and two operators, with two distinct trees, and return none after precedence is declared.",
    dep: ["conflict-detection", "earley-parsing", "ambiguity-resolution", "grammar-normalization"]
  },
  "grammar-test-corpus": {
    s: "A versioned collection of valid and invalid inputs, with expected outcomes, that every grammar change is run against.",
    d: "The corpus holds real files, minimized regression cases for each past bug and negative cases that must be rejected with a specific error. Each entry records whether it must parse and which error position or message is expected. Runs are automated on each change and compare against the last accepted results. Its value depends on breadth: grammars are usually tested with the examples the author imagined, so real code harvested from users catches the surprising ones. Size matters for speed, so it needs sampling or sharding.",
    k: ["Real files vs minimal hand-written cases: real files find unexpected combinations, while minimal cases pinpoint the failing rule and stay fast.", "Pass/fail only vs full expected outputs: pass/fail is cheap to maintain, but only stored outputs catch a change that parses the same text into a different tree."],
    p: ["Corpus files are copied from licensed sources without checking terms, which blocks sharing the repository.", "Negative cases are not stored, so a change that starts accepting invalid input passes every test."],
    v: "Make a grammar change that accepts one previously invalid construct. The run should fail on the negative case naming the file, and a change that rejects a valid construct should fail on the positive one.",
    dep: ["generator-bootstrapping", "golden-tree-tests"]
  },
  "golden-tree-tests": {
    s: "Stores the expected tree or token output for each corpus input and fails when a grammar change alters it, even when parsing still succeeds.",
    d: "Each input has a stored dump of the tree in a stable text form, such as nested parentheses with node names and spans. The test regenerates the parser, parses the input, dumps the result and diffs it. It catches changes in precedence, associativity, list flattening and error recovery that parse without failing. The format has to be deterministic and independent of memory addresses. An approval workflow lets an author accept intended changes in one step, which is also where careless approvals slip in.",
    k: ["Dump the full tree vs selected properties: full dumps catch everything but change on harmless renames, while selected properties are stable but miss unplanned effects.", "Update by default vs update on request: one-step update speeds intended changes, though it makes it easy to bless a regression without reading the diff."],
    p: ["Spans in dumps shift with trivial whitespace edits to the inputs, producing diff noise that hides real changes.", "Reviewers approve a large golden diff without reading, locking in a wrong tree."],
    v: "Change an operator's associativity. The golden test for a chained expression must fail with a diff showing the tree nesting flipped, while unrelated inputs remain identical.",
    dep: ["parse-tree-builder", "tree-visitors", "source-positions"]
  },
  "grammar-fuzzer": {
    s: "Generates random sentences from the grammar to test the parser against itself, and mutates them to test error handling and robustness.",
    d: "Generation expands rules at random up to a depth limit, with weights to avoid explosions in recursive rules, then feeds the sentences to the generated parser and checks that all are accepted. A second mode mutates valid sentences by deleting, swapping or inserting tokens and checks that the parser terminates, does not crash and returns errors. Differential runs compare two strategies or two targets on the same input. The hard part is semantic validity: a grammar-valid sentence may still be rejected by later passes.",
    k: ["Generate from the grammar vs mutate real inputs: generation covers all syntax, but mutation of real files reaches realistic structure that random expansion rarely produces.", "Depth-bounded expansion vs weighted expansion: a hard bound is simple and always terminates, while weights shape size distribution but need tuning per grammar."],
    p: ["Random expansion of recursive rules produces enormous or degenerate inputs, and the run spends most of its time in a few giant cases.", "Fuzzing only checks that parsing succeeds, not that the tree is right, so wrong trees pass."],
    v: "Generate ten thousand sentences from the grammar and parse each; all must be accepted. Mutate each by deleting one token; every result must be an error or a valid parse, with no crashes or hangs within a time limit.",
    dep: ["grammar-normalization", "driver-loop", "first-sets", "error-messages"]
  },
  "grammar-linter": {
    s: "Static checks on grammar style and likely mistakes, such as unused rules, overlapping tokens, unreachable alternatives and rules that match the empty string unexpectedly.",
    d: "The linter works on the normalized grammar and the analysis results. It flags rules never referenced, tokens that can never win because an earlier pattern matches the same text, alternatives shadowed under ordered choice, nullable rules inside repetitions that can loop forever, and names that break convention. Rules are configurable and can be suppressed per rule with a comment. The difficulty is precision: too many false positives teach authors to ignore it, so each rule needs a justification and an example in its message.",
    k: ["Warnings that block the build vs advisory output: blocking keeps the grammar clean but halts work on style, while advisory output gets ignored over time.", "Built-in rules vs user-defined rules: built-in rules are consistent across projects, while user rules fit local conventions but can contradict the generator's own checks."],
    p: ["A nullable rule inside a star compiles but loops forever on some input, and only a lint rule catches it before runtime.", "Suppression comments accumulate until the linter reports nothing useful."],
    v: "Add an unused rule, an unreachable alternative and a star over a nullable rule. Lint output must list all three with rule names and source lines and exit non-zero when configured to fail.",
    dep: ["reachability-checks", "nullable-analysis", "maximal-munch", "generator-diagnostics"]
  },
  "build-integration": {
    s: "How the generator runs inside a project's build: command line, plugins, dependency tracking and where generated files go.",
    d: "The generator is invoked by the build system as a command or plugin that declares the grammar and imports as inputs and the generated sources as outputs, so unchanged grammars are not regenerated. Output may be committed to the repository or produced during every build. Options pass target, package, runtime version and flags. Errors have to appear as normal compiler diagnostics with file, line and column so editors can jump to them. Imports make dependency tracking essential: editing an imported file must regenerate dependents.",
    k: ["Commit generated files vs generate in the build: committing removes the build-time tool dependency and shows diffs, but it invites hand edits and stale output.", "Pin the generator version vs use whatever is installed: pinning makes builds reproducible, while a floating version picks up fixes but changes generated code unexpectedly."],
    p: ["Imported grammars are missing from the dependency list, so an edit to one never triggers regeneration and old behavior ships.", "Generator and runtime versions drift apart, and generated code fails at run time with an obscure mismatch."],
    v: "Change only an imported grammar file and rebuild. The build should regenerate exactly the dependent parsers and nothing else, and a deliberate grammar error should appear as a compiler-style message with file and line.",
    dep: ["grammar-imports", "generator-diagnostics", "target-backends", "runtime-library"]
  },
  "generator-bootstrapping": {
    s: "The generator's own grammar file is parsed by a parser the generator produced, which requires a trusted first version and a way to rebuild from it.",
    d: "A generator that reads a grammar notation needs a parser for that notation. Many tools use a hand-written first version, then regenerate their own front end from a grammar file describing the notation, and keep the generated parser in the repository so the build starts from a known state. A bootstrap test regenerates the parser with itself and checks that the output is byte-identical to the checked-in copy, which shows that the tool is a fixed point and has not drifted.",
    k: ["Hand-written bootstrap parser vs self-generated front end: hand-written code is independent of the tool's bugs, while a self-generated front end makes the tool its own best test but needs a checked-in seed.", "Check in generated front end vs build it from a prior release: a checked-in copy is simple, but it can lag the grammar until someone regenerates it."],
    p: ["A bug in the generator corrupts its own front end, and the broken copy can no longer regenerate a fix.", "The checked-in parser and the grammar describing it diverge silently because nobody reran the bootstrap."],
    v: "Regenerate the front end from its own grammar twice in a row. The second output must be byte-identical to the first and to the checked-in file, and the test fails on any difference.",
    dep: ["grammar-file-format", "recursive-descent-generation", "code-templates"]
  },
  "grammar-file-format": {
    s: "The concrete syntax of a grammar file: how rules, token definitions, options and embedded code are laid out and how the file itself is parsed.",
    d: "A file typically has a header with name and options, token definitions, rules and optional embedded code sections. The tool parses it into a grammar model with source locations for every element, which later passes use for diagnostics. Embedded code blocks must be captured verbatim with brace matching or explicit delimiters, since the generator does not understand the target language. Comments, string escapes and character literals need exact rules. A format that mixes lexical and syntactic rules in one file blurs the layers.",
    k: ["Single file vs separate lexer and parser files: one file keeps related rules together, while two files let lexer and parser be reused and tested alone.", "Embedded target code vs external hooks: embedded code is convenient and fast to write, but it ties the grammar to one target and hides actions from tools."],
    p: ["Brace matching in embedded code breaks on a brace inside a string or comment of the target language.", "Source locations are lost during parsing, so every later error points at line zero."],
    v: "Parse a grammar file containing a quoted brace inside an action. The grammar model must contain the action text intact, and a syntax error in the file must report its exact line and column.",
    dep: ["source-positions", "generator-diagnostics", "symbol-interning"]
  },
  "rule-notation": {
    s: "The notation for writing productions: nonterminals, terminals, alternatives and sequences, in plain or extended Backus-Naur form.",
    d: "A rule names a nonterminal and lists alternatives, each a sequence of terminals and nonterminals. Extended forms add grouping, optional and repeated parts, and often character ranges inside tokens. The notation also fixes how terminals are written (quoted literals or token names) and how alternatives are separated. The parser for the notation builds the grammar model that analysis consumes. The choice of notation shapes readability: lists written with explicit recursion are verbose, and direct repetition hides the recursion the generator must reintroduce.",
    k: ["Plain BNF vs extended BNF: plain rules map directly to the algorithms with nothing to expand, while extended rules are shorter and clearer but need a desugaring step.", "Quoted literals as tokens vs named tokens only: literals keep rules readable, but they create implicit tokens whose priority and spelling the author never declared."],
    p: ["Implicit tokens from literals collide with a declared token of the same text, and the wrong one wins.", "Authors write left-recursive lists in a top-down tool and only learn of the problem at generation."],
    v: "Write the same arithmetic grammar in plain and extended form. Both must produce identical parse results on a corpus, and the model dump for each must show the same set of language sentences.",
    dep: ["grammar-file-format", "symbol-interning"]
  },
  "repetition-operators": {
    s: "The star, plus and question-mark operators, and separator forms, that express lists and optional parts without writing recursive rules by hand.",
    d: "Repetition operators are written after an element or group. The generator rewrites each into helper rules or, for top-down tools, a loop. Variants add separators or terminators so a list of items split by commas is one construct. Their semantics must be fixed: whether a star is greedy, how it interacts with ordered choice, and what tree it produces, a flat list or a nested chain. Nested repetition and nullable bodies are the hard cases, since they can create ambiguity or infinite loops.",
    k: ["Greedy repetition vs full nondeterminism: greedy repetition is fast and predictable, while allowing every split gives the full language but creates conflicts the author must resolve.", "Flat list nodes vs nested helper nodes: flat lists suit consumers directly, while nested nodes are what the plain grammar naturally yields and need flattening later."],
    p: ["A star over an element that can match nothing makes an infinite loop, which compiles and hangs on the first input.", "Separated lists with an optional trailing separator create a conflict at the final token."],
    v: "Parse zero, one and many items with a separator, including a trailing one. The tree must contain exactly the items in order, and a body that can match empty must be rejected at generation, not at run time.",
    dep: ["rule-notation", "ebnf-desugaring", "nullable-analysis"]
  },
  "grammar-imports": {
    s: "Splitting a grammar across files and reusing or overriding rules from another grammar, for shared expression syntax or language families.",
    d: "An import brings rules and tokens of another grammar into the current one, with a defined order of precedence when names collide. Composition forms include simple inclusion, overriding a rule with a new body, extending an alternative list and renaming on import. Imports are resolved before analysis so the combined grammar is one model. The difficulty is that the combined grammar must still be conflict-free, and a change in an imported file can introduce a conflict in every importer.",
    k: ["Textual inclusion vs namespaced modules: inclusion is easy to implement and understand, while namespaces avoid name clashes but need qualified references throughout rules.", "Overriding rules vs extending alternatives: overriding gives full control and can silently drop cases, while extension is safer but cannot remove or reorder what the base defined."],
    p: ["An override replaces a base rule that other imported rules still depend on, which changes behavior far from the edit.", "Two imports define the same token name, and the one listed later silently wins."],
    v: "Import a base expression grammar, override one rule and add an alternative. Generate and parse inputs that use both; a name collision must produce an error naming both source files.",
    dep: ["grammar-file-format", "grammar-normalization", "symbol-interning"]
  },
  "parameterized-rules": {
    s: "Rules that take arguments, such as a list rule parameterized by its element and separator, so repeated patterns are written once.",
    d: "A parameterized rule is a template: each use supplies concrete symbols and the generator instantiates a separate ordinary rule, or reuses an existing instance with identical arguments. Instantiation happens before analysis so later stages see only plain rules. Some tools also allow parameters that carry values at run time, passed down into predicates or actions. Template expansion needs cycle detection, since a rule can instantiate itself with growing arguments and never terminate.",
    k: ["Compile-time macros vs run-time arguments: macros keep the parser simple and analyzable, while run-time arguments express context but make the language non-context-free in effect.", "Reuse identical instances vs copy per use: sharing shrinks the parser, but a shared rule gives every use the same action and error behavior."],
    p: ["Recursive instantiation with growing arguments never terminates, and generation runs out of memory.", "Instances get generated names that appear in error messages and tree dumps, confusing users."],
    v: "Define a separated-list template and use it for three element types. The generated grammar should have three instances, no duplicates for identical uses, and error messages should refer to the template by its readable name.",
    dep: ["rule-notation", "ebnf-desugaring", "symbol-interning"]
  },
  "labels-and-aliases": {
    s: "Names attached to elements and alternatives, such as a field name for each child and a node name for each alternative, so the generated tree has meaningful structure.",
    d: "An element label names the field that holds a child in the node built for a rule. An alternative label names the node type produced when that alternative matches, so one rule can yield several node types. Labels are carried through the model to the tree builder and are also usable in actions. They must be unique within an alternative and consistent across alternatives that share a field. A label on a repeated element implies a list type, which the tree generator needs to infer correctly.",
    k: ["Explicit labels vs positional access: labels make trees readable and stable under reordering, while positional access needs no extra text but breaks when the rule changes.", "Label per alternative vs one node type per rule: per-alternative types give precise nodes, but they multiply the number of classes consumers must handle."],
    p: ["Two alternatives use the same label with different types, and the generated node cannot represent both.", "Renaming a label silently changes the tree shape that downstream passes depend on."],
    v: "Label two alternatives and a repeated child. The generated nodes should have fields with those names, the repeated child should be a list, and a duplicate label in one alternative should fail generation.",
    dep: ["rule-notation", "ast-generation", "grammar-normalization"]
  },
  "predicates": {
    s: "Conditions attached to a grammar position that decide whether an alternative may be taken, based on lookahead syntax or on parser state.",
    d: "A syntactic predicate tests whether some other pattern would match at this point without consuming input, enabling lookahead beyond a fixed number of tokens. A semantic predicate evaluates user code against parser state, for example to check whether a name is a type. Predicates take part in prediction, so a semantic one can hide the real alternatives from analysis. Evaluation order matters: predicates must run when decisions are made, not after speculation, and side effects in them can corrupt state when the parser backtracks.",
    k: ["Syntactic predicate vs semantic predicate: syntactic ones stay inside the grammar and can be analyzed, while semantic ones solve context-dependence but are opaque and target-specific.", "Hoist predicates into prediction vs evaluate at the point reached: hoisting resolves choices early, though it evaluates code before the parser knows the path is real."],
    p: ["A semantic predicate with side effects runs several times during speculation, leaving the symbol table wrong.", "A syntactic predicate looks ahead across the whole input in a loop, turning parsing quadratic."],
    v: "Use a predicate to distinguish a cast from a parenthesized expression. Both inputs must parse correctly, and a trace must show the predicate evaluated once per decision with no state change left from failed branches.",
    dep: ["llk-lookahead", "adaptive-ll", "semantic-actions", "ordered-choice"]
  },
  "entry-points": {
    s: "The rules from which parsing can begin, so the same grammar can parse a whole file, a single expression or a snippet from an editor.",
    d: "One start symbol is the classic form, with an augmented end-of-input rule added by the generator. Many projects need several entry points: parse a statement, parse a type, parse an expression embedded in a template. Each entry point needs its own table or driver start state, and the follow set of every rule must account for what can follow it in each context. Entry points reachable only from outside the grammar must be kept alive by reachability analysis, not removed as unused.",
    k: ["One start symbol vs multiple entry points: a single start gives one small table, while multiple entries serve tools and embedding but multiply start states and follow contexts.", "Require end-of-input vs allow a prefix: requiring it catches trailing garbage, while prefix parsing suits streams and embedded snippets but can accept partial matches."],
    p: ["A secondary entry point is dropped as unreachable, and the API call that uses it fails at run time.", "Parsing a snippet without requiring end-of-input silently ignores trailing text."],
    v: "Generate a parser with two entry points and call each. An expression entry must parse a lone expression and reject a statement, and trailing text after a complete parse must produce an error unless prefix mode was selected.",
    dep: ["reachability-checks", "follow-sets", "parser-api", "grammar-normalization"]
  },
});
