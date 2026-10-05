// Compiler plate details, part 2: lexing and parsing, semantic analysis.
ATLAS.details("compiler", {
  "lexer": {
    s: "Converts a stream of characters into tokens: identifiers, keywords, literals, operators and punctuation, each with a source location, discarding or recording whitespace and comments.",
    d: "A lexer is a finite-state machine, usually hand written for speed rather than generated. It classifies by first character, scans the longest valid token, interns identifiers, parses literal values and attaches locations. It must handle encodings, nested comments, raw and multi-line strings, and context-dependent tokens such as a closing angle bracket that is sometimes two operators. Because every character passes through it, it is among the hottest code in the compiler. Hard parts are lexical ambiguity, speed, and producing a usable token after an invalid character instead of aborting.",
    k: ["Hand-written lexer vs generated from regular expressions: generated is quick to build and verify; hand-written is faster, handles context and gives better errors.",
        "Lex on demand vs tokenize the whole file first: on demand lets the parser steer lexical modes and saves memory; an up-front array enables cheap lookahead and backtracking."],
    p: ["Treating an unterminated string or comment as end of file makes every following line a confusing error instead of one precise one."],
    v: "Fuzz the lexer with random bytes and valid-token mutations: it must never crash, always make progress, and concatenating all token texts with trivia must reproduce the input exactly.",
    dep: ["source-file-manager", "string-interning", "source-locations"]
  },
  "parser": {
    s: "Checks that token sequences follow the grammar and builds the syntax tree, usually by recursive descent with precedence handling for expressions.",
    d: "Most production parsers are hand-written recursive descent, with a precedence-climbing loop for binary operators. Each grammar rule becomes a function that consumes tokens and returns a tree node, using one or a few tokens of lookahead and, where the grammar needs it, speculative parsing with backtracking. It reports unexpected tokens, then hands control to error recovery. It does not check meaning: whether a name exists or types agree is for later stages. Hard parts are grammar ambiguity, deep nesting that overflows the stack, and keeping grammar and tree definitions in sync.",
    k: ["Hand-written recursive descent vs parser generator: hand-written gives control, speed and great error messages; generators prove the grammar is unambiguous and are shorter but harder to customize.",
        "Backtracking vs extra lookahead: backtracking handles tricky grammars simply but can go exponential; lookahead is predictable and demands careful grammar design."],
    p: ["Recursion on deeply nested input such as thousands of parentheses exhausts the stack and crashes the compiler instead of reporting a nesting limit."],
    v: "Parse the language's whole example corpus and compare trees to goldens. Feed generated deeply nested inputs and confirm a clean diagnostic at the nesting limit.",
    dep: ["lexer", "ast", "error-recovery", "ambiguity-resolution"]
  },
  "ambiguity-resolution": {
    s: "The rules and mechanisms that decide what an input means when the grammar allows more than one reading, from operator precedence to declaration-versus-expression conflicts.",
    d: "Some constructs cannot be classified by syntax alone: whether a statement is a declaration or an expression, whether a less-than sign opens type arguments, whether a brace begins a block or a literal. Languages resolve these by precedence tables, by disallowing the ambiguity, by speculative parsing that tries one reading and falls back, or by deferring the decision until names are resolved. Tree shape must be settled before semantic analysis. Hard parts are cost (speculation re-parses), subtle behavior changes when the grammar evolves, and keeping rules documented and consistent with the implementation.",
    k: ["Resolve in the parser by speculation vs defer to semantic analysis: speculation keeps trees unambiguous but may re-parse; deferral allows a simple parser and makes the tree carry a placeholder node.",
        "Language design that avoids ambiguity vs tooling that resolves it: removing ambiguity from the grammar makes every tool simpler, but cannot be retrofitted onto an existing language."],
    p: ["Speculative parsing that emits diagnostics before it commits reports errors for a reading the compiler then discards."],
    v: "For each documented ambiguous construct, a table test shows the chosen reading and its tree. Speculative parses are counted on a large corpus; backtracking stays within a small bound of tokens per file.",
    dep: ["parser", "lexer"]
  },
  "ast": {
    s: "The abstract syntax tree: a typed in-memory tree of declarations, statements and expressions, annotated with locations and later with resolved names and types.",
    d: "Each construct is a node with children, a location, and slots filled by later stages (the declaration a name refers to, an expression's type, implicit conversions made explicit). Nodes are allocated from an arena and immutable after construction, or mutated in place by semantic analysis. Visitors and generic traversal helpers keep tree-walking code short. Compilers differ on whether one tree is progressively annotated or successive trees replace it. Hard parts are the sheer number of node kinds, keeping memory small for huge files, and rewriting trees safely during desugaring.",
    k: ["One progressively annotated tree vs a new tree per stage: one tree is memory efficient and invites half-initialized nodes; separate trees make each stage's invariants explicit at the cost of copying.",
        "Class hierarchy vs tagged union of node kinds: hierarchies allow convenient shared behavior; tagged unions are compact and make exhaustive matches checkable."],
    p: ["Later stages reading a type or declaration slot before the checker fills it see null and crash only on rare syntax forms."],
    v: "Pretty-print the tree back to source for a corpus and re-parse: the second tree must be structurally equal to the first. A dump of every node kind visited by the checker shows no unhandled kinds.",
    dep: ["arena-allocation", "source-locations", "string-interning"]
  },
  "error-recovery": {
    s: "Lets the parser continue after a syntax error by skipping or inserting tokens to reach a safe point, so one mistake yields one message and a usable tree.",
    d: "Typical strategies: panic mode, which discards tokens until a synchronizing token such as a statement terminator or closing brace; local repair, which inserts a missing delimiter or deletes a stray one when that makes the following tokens parse; and error nodes in the tree that mark a hole while preserving the siblings. Good recovery depends on knowing which delimiters are open, so the parser tracks bracket nesting. The tree contains explicit missing or error nodes so semantic analysis and editors can proceed. Hard parts are avoiding cascades and recovering inside deeply nested constructs.",
    k: ["Panic-mode skipping vs local repair: skipping is simple and robust but loses valid code after the error; repair keeps more of the tree and risks guessing the wrong intent.",
        "Error nodes in the tree vs aborting the file: error nodes allow editors and later checks to work on broken code, but every consumer must handle them."],
    p: ["A missing closing brace swallows the rest of the file into one function, producing hundreds of unrelated type errors."],
    v: "Delete each token in turn from a corpus of valid files; for most deletions the parser reports exactly one error near the deletion and the remaining declarations still appear in the tree.",
    dep: ["parser", "diagnostic-engine"]
  },
  "lossless-syntax-tree": {
    s: "A tree that retains every character of the source, including whitespace, comments and errors, so tools can refactor, format and analyze without losing the author's layout.",
    d: "Unlike an abstract tree that drops punctuation and trivia, this tree is built from tokens that carry leading and trailing trivia, with structure layered on top. Printing the tree reproduces the input exactly, even for invalid programs. A typed view layer offers the convenience of abstract nodes. It is immutable and shares unchanged subtrees, so editors can reparse after each edit cheaply and compare old and new. Hard parts are memory overhead, designing the typed layer, and keeping two tree forms consistent when a compiler needs both.",
    k: ["Lossless tree as the only tree vs a separate abstract tree: one tree avoids duplication and divergence; two trees let the compiler proper work on a compact, resolved form while tools keep the full detail.",
        "Immutable shared nodes vs in-place edits: immutability gives cheap reparse and thread safety at the cost of allocation churn."],
    p: ["Dropping or reattaching comments during transformation shifts them to the wrong declaration, a defect that makes automatic refactoring tools unusable."],
    v: "Parse a large corpus, print the tree, and compare to input byte for byte, including files with syntax errors. Apply a rename refactoring and confirm unrelated formatting and comments are untouched.",
    dep: ["lexer", "parser", "error-recovery"]
  },
  "scope-and-symbol-tables": {
    s: "Data structures recording which names are visible where and what each declares: nested scopes, namespaces and a record per declared entity.",
    d: "A scope maps names to declarations and chains to its parent; entering a block, function or module pushes one. Symbol records hold kind, type, visibility, defining location and links to the syntax node. Lookup walks outward through scopes, and qualified lookup goes through a namespace or type. Modern compilers often build tables lazily or per module, because declarations may be used before they appear and may arrive from imported interfaces. Hard parts are shadowing rules, forward references, overloaded names mapping to sets, and use-before-declaration checks.",
    k: ["Eager table construction before checking vs lazy per-name lookup: eager is simple and supports out-of-order declarations; lazy saves work on huge imported modules and complicates cycle handling.",
        "Hash map per scope vs one global table with undo log: per-scope maps are clear; a global table with scope stack is faster for deep nesting and needs careful popping."],
    p: ["Treating the order of declarations in a file as semantically relevant when the language allows forward references makes valid programs fail to compile."],
    v: "Table-driven tests for shadowing, nested scopes, forward references and qualified lookups: each name must resolve to the expected declaration, and dumping the table for imported modules shows no entries loaded that were never used.",
    dep: ["ast", "string-interning", "arena-allocation"]
  },
  "name-resolution": {
    s: "Binds each identifier use to the declaration it refers to, following scoping, imports, visibility and shadowing rules, before or alongside type checking.",
    d: "The resolver walks the tree with the current scope stack, looks up each name, and records the target on the node. Complications include imports and re-exports, glob imports that bring many names, overloaded names that yield candidate sets for later disambiguation, and names introduced by macros. Privacy and visibility are checked here. Some languages need a fixed-point algorithm because imports and macro expansion depend on each other. Hard parts are cyclic imports, ambiguity errors that name every candidate, and diagnostics that suggest the name the user probably meant.",
    k: ["Separate resolution pass vs resolution during type checking: a separate pass gives a clean unit and diagnostics; interleaving is needed when types determine which member a name refers to.",
        "Report ambiguity vs pick by priority: reporting is explicit and may break users when a library adds a name; priority rules are convenient and make code fragile."],
    p: ["Adding an exported name to a library silently changes what a glob import in client code resolves to."],
    v: "Resolve a corpus and dump the name-to-declaration map; golden diff must be stable. Test shadowing, import cycles and ambiguous globs: each yields the specified result or a diagnostic listing all candidates.",
    dep: ["scope-and-symbol-tables", "import-resolution", "macro-expansion", "ast"]
  },
  "type-representation": {
    s: "How the compiler stores types in memory: primitive, composite, function, parameterized and inference-variable types, shared so equality is cheap.",
    d: "Types are immutable, interned objects, so two structurally identical types are the same pointer and equality is an integer comparison. They include constructors with arguments (pointer to T, function from A to B), named types referring to declarations, type parameters, and unresolved inference variables. Substitution creates new types by replacing parameters. Canonical forms resolve aliases and qualifiers. Layout (size, alignment, field offsets) is a separate computation derived from the type for the target. Hard parts are recursive types, aliases that must stay visible for diagnostics, and memory when generic instantiations multiply.",
    k: ["Interned (hash-consed) types vs structural equality walks: interning makes comparison and caching trivial at the price of a global table and careful concurrency; structural equality needs no table and is slow.",
        "Canonical types vs sugar-preserving types: canonical forms simplify checking; keeping the alias the user wrote gives readable diagnostics, so many compilers keep both."],
    p: ["Printing only canonical types turns a simple error about a user-defined alias into a screen of fully expanded template arguments."],
    v: "Intern the same type through different construction paths (alias, substitution, parse of annotation) and assert pointer equality. A type-dump of a diagnostic shows the user's spelling, not the expansion.",
    dep: ["uniquing", "arena-allocation"]
  },
  "type-checker": {
    s: "Verifies that every expression and statement is well-typed under the language's rules, inserting implicit conversions and reporting mismatches.",
    d: "The checker visits each function body, computes a type for every expression from its children and context, compares against expected types, and records conversions (widening, reference binding, coercion) on the tree. It also validates declarations: well-formed types, interface or trait conformance, override compatibility, return paths, mutability and assignability rules. It consults resolved names and, where annotations are absent, type inference. Hard parts are the sheer rule count and interaction, soundness holes, and error messages that explain a mismatch several constraints removed from the cause.",
    k: ["Bidirectional checking (propagate expected types down) vs purely bottom-up: bidirectional gives better messages and supports literals and lambdas; bottom-up is simpler and fails on context-dependent expressions.",
        "Check bodies eagerly vs on demand: eager gives all errors in one run; on demand lets editors and incremental builds skip untouched functions."],
    p: ["A missed implicit-conversion rule is encoded as an accepted program with the wrong runtime semantics, such as an integer silently narrowing."],
    v: "Run a conformance suite of accept and reject programs: every reject program must produce its listed error and every accept program must type-check and then pass a type-annotation dump comparison.",
    dep: ["type-representation", "name-resolution", "type-inference", "overload-and-trait-resolution", "diagnostic-engine"]
  },
  "type-inference": {
    s: "Deduces omitted types from usage by generating constraints between type variables and solving them, so source can leave types implicit while staying statically checked.",
    d: "Each unannotated binding or literal gets a fresh type variable. Checking emits constraints (equality, subtyping, trait bounds) and a unification-based solver merges variables, substituting solutions. Generalization turns leftover variables into polymorphic parameters at definition sites. Defaulting picks a type for still-ambiguous literals. Local inference works within a function and demands signatures between functions; global inference reaches across the program. Hard parts are performance on large expressions, order dependence among constraints, and reporting errors when the real mistake is far from where the solver noticed it.",
    k: ["Local (per-function) inference vs whole-program: local keeps errors near the cause and compile times predictable; global asks less of the author and can have exponential cases and baffling messages.",
        "Eager solving vs deferred constraints: eager is fast and fails on programs that need later context; deferral accepts more programs and needs a worklist and ambiguity handling."],
    p: ["Inference that succeeds only because of expression order makes harmless refactorings, like reordering two statements, suddenly fail to compile."],
    v: "Run a corpus of programs where annotations are progressively removed; the inferred types must match the removed annotations or the compiler must report ambiguity. Pathological nested-literal inputs finish within a fixed time limit.",
    dep: ["type-representation", "type-checker", "uniquing"]
  },
  "overload-and-trait-resolution": {
    s: "Chooses which function, operator or interface implementation a use refers to when several candidates share a name, based on argument types and declared bounds.",
    d: "For a call, the resolver gathers candidates (overloads, methods from interfaces or traits in scope), filters by arity and applicability, ranks the survivors by conversion cost and specificity, and picks a unique best or reports ambiguity. Bound-based languages solve a goal such as 'does type T implement interface I?' by searching implementations, possibly recursively, with coherence rules preventing two answers. Hard parts are ranking rules that are intuitive, termination of recursive searches, cost on libraries with many overloads, and explaining why no candidate matched.",
    k: ["Overloading by argument types vs distinct names: overloading reads well but multiplies resolution rules and ambiguity errors; distinct names are explicit and verbose.",
        "Global coherence (one implementation per type) vs local choice: coherence keeps behavior predictable across modules; local choice is flexible and enables surprising differences between files."],
    p: ["Adding an overload in a library makes previously unambiguous calls in client code ambiguous, breaking dependents on a minor release."],
    v: "A table of calls with candidate sets and expected winners passes. An intentionally ambiguous call lists every viable candidate, and a call with no viable candidate explains which argument rejected each.",
    dep: ["type-checker", "name-resolution", "type-representation"]
  },
  "generics-and-monomorphization": {
    s: "Supports code parameterized over types, then either copies it per concrete type argument (monomorphization) or compiles one shared body that works for all types.",
    d: "Generic definitions are checked once against declared bounds, and each use records its type arguments. Monomorphization instantiates a specialized copy per distinct argument tuple, substituting types and re-lowering the body, giving fully optimized code with no runtime cost. Alternatives compile once and pass type information at run time (dictionaries or boxed values). Instantiation is memoized so identical requests share one copy. Hard parts are code bloat, instantiation depth limits for recursive generics, compile time spent in instantiation, and diagnostics that name the instantiation chain.",
    k: ["Monomorphization vs shared generic code: copies are the fastest at run time and inflate size and compile time; shared code is compact and slower through indirection and boxing.",
        "Check generics at the definition vs at each instantiation: definition checking gives errors early and independent of uses; instantiation checking is more permissive and errors appear far from the cause."],
    p: ["Infinitely expanding recursive generic instantiation never terminates unless a depth limit exists, and the resulting error lists thousands of frames."],
    v: "Instantiate one generic over many types and count emitted copies: identical arguments share exactly one copy across files. A recursive expansion test stops at the limit with a diagnostic showing the instantiation chain.",
    dep: ["type-checker", "type-representation", "overload-and-trait-resolution", "ir-lowering", "uniquing"]
  },
  "constant-evaluation": {
    s: "Runs parts of the program during compilation, from folding arithmetic to executing arbitrary marked functions, to compute array sizes, constants and generated code.",
    d: "Some constructs require values at compile time: array lengths, enumerator values, template or generic value parameters, static assertions. An interpreter over the tree or a mid-level IR evaluates marked expressions with its own memory model, call stack and step limit. It must reject operations with side effects the language disallows and must match run-time semantics exactly, including overflow and floating point behavior of the target. Hard parts are fidelity with generated code, bounding runtime so a loop cannot hang the build, and diagnosing a failure by showing a trace through the evaluated call stack.",
    k: ["Tree-walking evaluator vs reuse of the IR interpreter: tree walking is easy to build early; a shared IR interpreter guarantees one definition of semantics and is more work.",
        "Restrict to a pure subset vs allow arbitrary code: restriction gives determinism and fast evaluation; arbitrary code is powerful and makes builds depend on environment and time."],
    p: ["Compile-time evaluation that disagrees with the run-time behavior of the same expression on the target, such as overflow or float rounding, produces constants differing from the machine's."],
    v: "Evaluate each expression once at compile time and once at run time in a generated test program, over edge-case operand grids; results must match bit for bit. An infinite loop is cut off with a step-limit diagnostic.",
    dep: ["type-checker", "arbitrary-precision", "mid-level-ir"]
  },
  "flow-checks": {
    s: "Flow-sensitive semantic checks over control flow: definite assignment, unreachable code, missing returns and, in some languages, ownership and borrowing rules.",
    d: "These checks need a control-flow graph, not just a tree, because the answer depends on paths. Definite assignment propagates an 'initialized' set forward and requires it at each use; return analysis checks all paths end in a return; reachability marks dead code. Languages with ownership or lifetimes run a more elaborate analysis over a lowered form tracking moves and borrows. Because they reject programs, their precision is part of the language definition. Hard parts are false positives users cannot work around, and error messages that explain a path through the graph in source terms.",
    k: ["Check on the tree vs on a lowered control-flow graph: tree checks are quick to write and approximate; graph checks are precise and require building the graph before reporting errors.",
        "Conservative (reject if unsure) vs permissive analysis: conservative guarantees safety and rejects valid code; permissive accepts more and relaxes the guarantee."],
    p: ["Analysis that handles loops by visiting each block once misses uses before assignment reachable only through a back edge."],
    v: "A corpus of programs with the property on some paths and not others: each is accepted or rejected as the language specifies, and rejections cite a concrete path through the code.",
    dep: ["control-flow-graph", "dataflow-framework", "type-checker", "high-level-ir"]
  },
  "desugaring": {
    s: "Rewrites convenient surface constructs into a smaller core language so later stages handle fewer forms: loops over iterators, pattern matches, string interpolation, closures.",
    d: "After checking, rich syntax is translated into simpler constructs: a for-each becomes iterator calls and a loop, pattern matching becomes decision trees of tests and projections, closures become structures plus functions with explicit captured variables, operators on user types become calls, default arguments are filled in. Doing it after type checking lets the rewrite use resolved types and conversions. The core language is small enough for the middle end to reason about. Hard parts are keeping error locations and debug information tied to the original syntax and generating efficient code from generic translations.",
    k: ["Desugar early (before checking) vs late (after): early means the checker sees a tiny language; late gives user-level error messages and exact types for lowering.",
        "Decision trees vs backtracking automata for matches: trees avoid re-testing and can grow exponentially; backtracking is compact and may repeat tests."],
    p: ["Desugared code inheriting no source location or the wrong one makes stepping in a debugger jump to unrelated lines or show compiler-generated names."],
    v: "For each sugar form, compare the desugared dump against a golden core form and run behavior tests on both. Step through a desugared loop in a debugger and confirm lines map to the original statement.",
    dep: ["type-checker", "high-level-ir", "source-locations"]
  },
});
