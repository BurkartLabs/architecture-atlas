// Details for the transpiler plate, part 3: scope analysis, parsing and the syntax tree.
ATLAS.details("transpiler", {
  "scope-tree": {
    s: "A tree of lexical scopes mirroring the program's nesting, each holding the bindings declared in it, used to answer what a name means at any point.",
    d: "Built in one pass over the tree, it creates a scope for each program, function, block, loop header, catch clause and class body, with rules about which declarations belong where: function-scoped declarations hoist to the nearest function, block-scoped ones stay in their block. Each node can then look up the chain from its scope outward. Transforms ask it about names before introducing temporaries. When transforms add or move nodes the tree must be updated or rebuilt, and stale scope data is a leading source of subtle bugs.",
    k: ["Rebuild after each pass vs patch incrementally: rebuilding is simple and always consistent; patching is faster on large files but every operation must update the tree correctly.", "Scope on nodes vs separate side table: attached scope is quick to reach but pollutes the tree; a side table keeps the tree clean and needs a lookup per access."],
    p: ["A transform that moves code across a function boundary without updating scope leaves references pointing at the wrong binding.", "Treating parameter default expressions and the body as one scope misses the separate scope the language defines."],
    v: "Dump the scope tree for a file with shadowing, a catch clause, parameter defaults and a class, and compare it with the hand-derived expected bindings per scope.",
    dep: ["ast-traversal", "binding-table", "node-type-definitions"]
  },
  "binding-table": {
    s: "The per-scope record of each declared name, its kind, declaration node, references and assignments, so transforms can ask whether a binding is constant, used or captured.",
    d: "Each entry stores the identifier, what kind of declaration created it, the node that declared it, and lists of reads and writes found by reference resolution. From these, derived facts follow: whether it is never reassigned, whether closures capture it, whether it is exported or referenced in an eval. Transforms use them to inline constants, decide whether a loop needs per-iteration copies and rename safely. The table must stay in step with edits, or later transforms act on facts that are no longer true.",
    k: ["Eagerly computed reference lists vs on-demand lookup: eager lists make queries instant and cost memory and updates; on demand is lighter but rescans the tree repeatedly.", "Track writes precisely vs conservative flags: precise data allows more optimization; flags are simple and sufficient for most downleveling."],
    p: ["A binding marked constant stays so after a transform inserts an assignment to it.", "Direct calls to eval make every binding in enclosing scopes unsafe to rename, and tables that ignore this break programs."],
    v: "Query the table for variables in a fixture covering reassignment, closure capture and export, and confirm the reported flags match the code. Re-query after a transform inserts a write and see it change.",
    dep: ["scope-tree", "reference-resolution"]
  },
  "reference-resolution": {
    s: "Connects each identifier reference in the tree to the binding it denotes, or to the global environment if no binding is found.",
    d: "For every identifier in an expression position, the resolver walks outward from the current scope until it finds a declaration, and records the reference on that binding. Unresolved names are treated as globals. It must distinguish identifiers that are references from those that are property names, labels, import specifiers and export names, which share the same node type. Shorthand properties and destructuring targets act as both. Transforms rely on it to rename correctly and to detect which built-in objects a program uses.",
    k: ["Resolve once in a separate pass vs resolve during traversal as needed: a separate pass is simple and cacheable; on-demand resolution avoids a pass but repeats work and complicates state.", "Treat unresolved names as globals vs as errors: globals match how scripts work; errors catch typos but reject valid programs that rely on host-provided names."],
    p: ["A property key identifier is mistaken for a reference and renamed, changing the object's shape.", "Shorthand properties renamed on one side only change the key where they should have kept it."],
    v: "Rename a binding with the same name used as a property key, a label, a shorthand property and an inner shadow. Confirm only true references changed and the program runs the same.",
    dep: ["scope-tree", "binding-table", "ast-traversal"]
  },
  "renamer": {
    s: "Changes a binding's name and every reference to it consistently, and avoids collisions with other names visible in the affected scopes.",
    d: "Given a binding and a new name, it updates the declaration and all recorded references, including shorthand properties which must be expanded, export specifiers which must keep their external name, and class and function names that have a name property. Before renaming it checks that the new name does not clash with another binding in any scope where the old name is visible, or with a global used inside. It is used by block scope lowering, module conversion and minification. It is hard because everything that mentions a name has to be found, including indirect forms.",
    k: ["Rename the binding vs introduce an alias at the use site: renaming is clean and global to the scope; aliasing leaves the declaration alone and adds code at each use.", "Check all enclosing and nested scopes vs only the declaring one: full checks prevent capture; narrow checks are cheaper and miss cases."],
    p: ["Renaming a function that is also exported changes the public name unless export specifiers keep the old one.", "Choosing a new name equal to a global the code references captures that reference."],
    v: "Rename a variable that is used in a nested closure, in a shorthand property and in an export. Confirm the program behaves the same and exports keep their external names.",
    dep: ["binding-table", "reference-resolution", "scope-tree"]
  },
  "unique-id-generator": {
    s: "Produces names for temporaries and helpers that are guaranteed not to collide with any existing or future binding in scope.",
    d: "Given a hint, such as the role of the variable, it forms a candidate and checks it against all bindings and references in the program, adding a numeric suffix until it is free, then registers it so it is not reused. Reserved words and globals referenced anywhere in the file are excluded. Generated names should be readable for debugging, and stable for determinism, which argues against global counters. When identifiers are generated in many scopes, checking against the whole program avoids subtle collisions with names added by later plugins.",
    k: ["Check against the whole program vs the current scope: whole-program checks are safe against any later move; scope checks are cheaper and fail when code is hoisted outward.", "Counter suffix vs content-derived names: counters are short and simple; derived names stay stable when other code changes."],
    p: ["A generated name chosen without checking free globals shadows a global used in an inner function.", "A global counter makes output depend on file processing order."],
    v: "Generate names in a file that already uses the preferred names in several scopes, then process the file twice in different orders. Confirm no collision and identical output both times.",
    dep: ["scope-tree", "binding-table"]
  },
  "hoisting-analysis": {
    s: "Determines which declarations are visible before their position in the source, and which uses happen before initialization, so rewrites keep that behavior.",
    d: "Function declarations and var-style variables are available from the start of their scope; block-scoped and class declarations exist from the start but throw if read before initialization. The analysis marks references that occur before their declaration, in loops or in closures that run later, and records which are safe. Lowering uses it to decide where to place declarations, whether to emulate the dead zone, and what to initialize to undefined. Complicated by closures: a function defined earlier may legitimately read a later binding when called later.",
    k: ["Static conservative analysis vs runtime checks everywhere: static analysis produces clean output where it can prove safety; runtime checks are always right and cost code and speed.", "Treat closures as possibly run early vs prove call order: assuming early is safe and over-checks; proving order needs call analysis that is hard."],
    p: ["Moving a declaration to the top of a function changes its initialization time and alters behavior of code that read it earlier.", "A reference in a closure that runs later is treated as a use before declaration and throws unnecessarily."],
    v: "Run fixtures with use-before-declaration directly, inside a deferred closure and in a loop. Confirm the original throws or succeeds in the same cases as the lowered output.",
    dep: ["scope-tree", "reference-resolution", "binding-table"]
  },
  "lexer": {
    s: "Converts source text into a stream of tokens: identifiers, keywords, numbers, strings, punctuators and template pieces, each with its position.",
    d: "It reads characters, skips whitespace and comments (recording them for later), and groups the rest into tokens by longest match. It handles Unicode identifier rules, numeric forms with separators and prefixes, string escapes, regular expression literals and template parts. Line terminators matter because a newline can end a statement. Positions are recorded as offsets and line and column pairs. It runs on demand, so the parser can ask for the next token in a particular mode, which is essential for forms whose meaning depends on parser state.",
    k: ["Lazy on-demand tokens vs a full token array first: lazy lets the parser steer the lexer and uses less memory; an array allows unlimited lookahead and simple backtracking.", "Operate on code units vs code points: code units are fast but split characters outside the basic plane; code points are correct and need decoding."],
    p: ["Treating a carriage return and line feed pair as two line breaks doubles line numbers in diagnostics.", "A number followed by a property dot is lexed as a decimal and breaks otherwise valid code."],
    v: "Tokenize a fixture with every literal form, Unicode identifiers, comments and mixed line endings. Confirm token kinds, values and line and column positions equal the hand-written expectations.",
    dep: ["node-locations"]
  },
  "context-sensitive-lexing": {
    s: "Switches how characters are tokenized depending on parser state, so slash is division or a regular expression and braces inside templates are handled correctly.",
    d: "A slash could begin a regular expression or be a division, and only the parser knows which: after a value it is division, at an expression start it is a regex. Template literals contain nested expressions whose closing brace ends the expression and resumes the string. Markup syntax changes everything inside tags. The parser tells the lexer the current context, a stack of modes, and the lexer re-scans when needed. Contextual keywords are identifiers in some places and keywords in others. Wrong modes cause errors far from the cause.",
    k: ["Parser drives lexer modes vs lexer guesses from the previous token: parser-driven is exact; guessing is simpler and fails on edge cases such as a slash after a closing paren.", "Re-scan on demand vs speculative parse: re-scan is cheap and local; speculation handles any ambiguity and costs backtracking."],
    p: ["A division after a closing parenthesis of an if statement is lexed as a regex start and swallows the following code.", "A template inside a template expression mismatches braces and ends early."],
    v: "Parse a fixture with division after parentheses and identifiers, regex in statement position, nested templates and tags in markup. Confirm the tree matches a reference parser's output.",
    dep: ["lexer", "parser-core"]
  },
  "parser-core": {
    s: "Builds a syntax tree from the token stream by following the language grammar, recording node types, children and locations.",
    d: "Most parsers are hand-written recursive descent, with a function per grammar rule and a loop for left-associative operators. It consumes tokens, creates nodes, tracks context flags such as being inside a function, generator, strict mode region or class, and produces a tree conforming to a shared format. Hand-written parsers give control over errors, speed and extensions. Grammar changes with every new language edition, so the parser accumulates flags and exceptions, and its correctness is decided by large conformance suites.",
    k: ["Hand-written recursive descent vs generated from a grammar: hand-written is fast and gives good errors; generated is easier to keep consistent but struggles with context-sensitive rules.", "Parse to one general tree vs separate trees per dialect: one tree lets all plugins share work; per dialect simplifies each parser but multiplies transforms."],
    p: ["Forgetting to propagate a strictness flag into nested functions accepts or rejects programs wrongly.", "Deep nesting recurses until the stack overflows and crashes on hostile or generated input."],
    v: "Parse the language's official conformance programs and confirm every valid one produces a tree and every invalid one is rejected with the expected error category.",
    dep: ["lexer", "context-sensitive-lexing", "node-type-definitions", "operator-precedence", "early-errors"]
  },
  "operator-precedence": {
    s: "The method for parsing expressions with many operators: binding strength and associativity tables drive how tokens group without one grammar rule per level.",
    d: "A precedence-climbing or Pratt-style routine parses an operand, then repeatedly looks at the next operator and its binding power, deciding whether to take it into the current expression or return to the caller. A table lists binary and unary operators with levels and associativity. Special forms such as the exponent operator, which is right associative and forbids a bare unary operand on the left, mixing nullish with logical operators without parentheses, and arrow functions need exceptions. Errors in the table silently regroup expressions.",
    k: ["Table-driven precedence climbing vs one function per level: tables are short and easy to extend; per-level functions mirror the specification and handle exceptions more directly.", "Reject ambiguous mixes vs allow with defined grouping: rejection forces clarity; permitting is convenient and risks differing from the language's rule."],
    p: ["An associativity entry wrong by one direction regroups a long chain of operators and changes results.", "The unary-before-exponent case is accepted, giving a program the language defines as an error."],
    v: "Parse a corpus of expressions that mix every operator level, print each with full parenthesization, and compare against the reference grouping for every pair.",
    dep: ["parser-core", "lexer"]
  },
  "cover-grammar": {
    s: "Parses an ambiguous prefix as one construct and reinterprets it later, such as an object literal that turns out to be a destructuring pattern.",
    d: "Some forms cannot be told apart until later tokens arrive: a parenthesized list may be an expression or arrow parameters, and a bracketed or braced expression may be a literal or an assignment target. The parser first builds the more permissive tree, then converts it once the arrow or equals sign is seen, validating that the shape is allowed in the new role. Errors that only apply to one reading, such as shorthand properties with initializers, are deferred. This avoids backtracking and keeps parsing linear, but needs careful reporting of the deferred errors.",
    k: ["Parse permissively then convert vs speculative parse with backtracking: conversion is linear and predictable; backtracking is simpler to write and can be exponential on nested input.", "Defer errors until the role is known vs report immediately: deferral accepts valid programs; immediate reporting is simpler and rejects legal code."],
    p: ["A deferred error is never raised when the reading turns out to be an expression, so invalid code is accepted.", "Conversion forgets to rewrite nested elements, leaving expression nodes inside a pattern."],
    v: "Parse parenthesized lists that become arrow parameters, object literals used as assignment targets, and genuine invalid forms. Confirm correct trees for valid ones and the specified errors for invalid ones.",
    dep: ["parser-core", "node-type-definitions", "early-errors"]
  },
  "error-recovery": {
    s: "Lets the parser continue after a syntax error, producing a partial tree and a list of problems instead of stopping at the first one.",
    d: "At an error the parser records a diagnostic and resynchronizes, for example by skipping tokens to the next statement boundary or closing bracket, or by inserting a missing token it expected. The result is a tree that may contain placeholder nodes. This is essential for editors, which see broken code constantly, and optional in batch builds, where the first error is enough. The hard part is quality: poor recovery produces cascades of misleading follow-on errors that bury the real mistake.",
    k: ["Stop at the first error vs recover and continue: stopping is simple and reports one clean cause; recovery gives complete feedback and risks noisy secondary errors.", "Skip tokens to a sync point vs insert expected tokens: skipping is robust and may discard much code; insertion is precise for small slips and wrong for large ones."],
    p: ["A missing closing brace causes every later declaration to be reported as an error.", "Recovered placeholder nodes reach later passes that expect valid nodes and crash."],
    v: "Parse a file with one missing bracket in the middle. Confirm one primary error at the right location, a tree for code before and after it, and no more than a few follow-on errors.",
    dep: ["parser-core", "diagnostic-formatter"]
  },
  "early-errors": {
    s: "Checks the rules the grammar alone cannot express, such as duplicate declarations, invalid assignment targets and misplaced keywords, and rejects programs that violate them.",
    d: "Many language rules are about context and are reported during or just after parsing: redeclaring a block-scoped name, using a reserved word as an identifier in strict code, break outside a loop, duplicate parameters in strict functions, invalid regular expression flags, and assigning to a non-reference. Some require scope information gathered while parsing. A permissive transpiler may skip some of these checks to save time, but then it can accept programs the language rejects and produce output with different behavior.",
    k: ["Check during parsing vs in a later validation pass: during parsing is fast and has context at hand; a later pass keeps the parser simple and costs a traversal.", "Full checking vs only what affects translation: full checking matches the language; partial is faster and lets invalid programs pass through."],
    p: ["Skipping the duplicate declaration check lets the downleveling pass merge two bindings into one.", "Applying strict-mode rules to a region that is not strict rejects valid legacy code."],
    v: "Run the language's negative conformance tests and confirm each invalid program is rejected with an error at the right position, while the positive set still parses.",
    dep: ["parser-core", "scope-tree"]
  },
  "node-type-definitions": {
    s: "The catalog of node types, their fields and their allowed child types, which every parser, transform and printer agrees on.",
    d: "Each node type has a name, named fields with types, whether each is optional or a list, and aliases grouping types into categories such as expression, statement and pattern. The definitions can be written once and used to generate builders, validators, visitor keys and documentation. Standard formats exist so parsers and tools from different sources interoperate, and extensions add nodes for markup, types and proposals. Changes ripple: renaming a field or splitting a node breaks every plugin and tool that reads the tree.",
    k: ["Follow a community tree format vs a private richer format: the standard maximizes interoperability with other tools; a private format can carry more information and lose compatibility.", "Generate code from definitions vs hand-write each: generation keeps builders, validators and traversal consistent; hand-written code is simpler to read and drifts."],
    p: ["Two parsers disagree on a field's shape, so a plugin works with one and crashes on the other.", "Adding an optional field changes how nodes compare, silently invalidating equality-based caches."],
    v: "Generate builders and validators from the definitions, parse a large corpus, and confirm every node the parser emits passes validation and every field is covered by traversal keys.",
    dep: []
  },
  "node-locations": {
    s: "Records for each node where it began and ended in the source, as offsets and line and column pairs, along with the file it came from.",
    d: "The parser attaches a start and end to every node, and optionally the file name and an identifier for the source. These locations feed error messages, source maps, comment attachment and format-preserving printing. Transforms create nodes with no source position, so a policy decides what to do: copy from the node being replaced, inherit from a nearby node, or leave blank. Without careful propagation, generated code maps to nothing and error messages point nowhere. Storing both offsets and line data costs memory on large files.",
    k: ["Store offsets only and compute lines on demand vs store both: offsets are compact; both are convenient but double memory and must stay consistent.", "Copy original locations onto replacements vs leave generated nodes unmapped: copying keeps errors and maps useful; unmapped nodes are honest but break debugging."],
    p: ["Replacement nodes with no location make a runtime error map to the first line of the file.", "Locations computed with different tab or line-ending handling disagree with the editor's column."],
    v: "Parse a file with tabs and mixed line endings, replace a node with a new one, and confirm the original and generated nodes both report the expected line and column in a diagnostic.",
    dep: []
  },
  "comment-attachment": {
    s: "Associates each comment with a nearby node as leading, trailing or inner, so it travels with that code when the tree is edited and printed.",
    d: "Comments are not part of the grammar, so the lexer collects them separately with positions. After parsing, an attachment pass assigns each to the closest following node as a leading comment, or the preceding one as trailing, using heuristics about blank lines, line breaks and punctuation. Transforms that move or delete nodes then take their comments along or drop them with them. Directive comments, license notices and annotations for other tools must survive. No heuristic is right everywhere, and moved code often leaves comments in odd places.",
    k: ["Attach to nodes during parse vs keep comments in a separate list by position: attached comments move with code but need heuristics; a position list is exact but cannot follow edits.", "Preserve all comments vs only those marked important: preserving everything is faithful and larger; filtering is smaller and risks dropping something needed."],
    p: ["A comment above a removed statement is dropped with it, though it described a block that stayed.", "A trailing comment attached to the wrong node jumps to another line after transformation."],
    v: "Transform a fixture where a commented statement is wrapped by another node and another is moved. Confirm each comment appears next to the same code in the output and license comments survive.",
    dep: ["node-locations", "node-type-definitions", "lexer"]
  },
  "ast-traversal": {
    s: "The generic machinery for walking the tree in a defined order using each node type's list of child fields, with entry and exit callbacks.",
    d: "Each node type lists its child keys in evaluation order. The walker visits the node, descends through those keys, handling lists and optional children, and calls callbacks before and after the children. It can skip subtrees, abort, and track the path and ancestors. A queue lets transforms add nodes to be visited. Because all plugins rely on it, its order and mutation semantics are fixed contracts. It is hot code in every translation, so allocation per visit is a real cost on large inputs.",
    k: ["Visit keys defined per node type vs reflect over object fields: defined keys are fast and ordered exactly; reflection is automatic and picks up metadata fields that are not children.", "Allocate a path object per node vs pass bare nodes: paths make parent access and replacement easy; bare nodes are faster and push bookkeeping to callers."],
    p: ["A node type missing a child key is never visited, so transforms silently skip code inside it.", "Mutating a list while iterating it skips elements or visits some twice."],
    v: "Traverse a tree containing every node type and confirm each child is visited exactly once, in source order, and that the count equals the node count obtained by an independent walk.",
    dep: ["node-type-definitions"]
  },
  "node-builders": {
    s: "Functions that construct valid nodes from their parts, filling defaults and checking field shapes, so plugins build code without hand-writing node objects.",
    d: "For each node type there is a builder taking its fields in a fixed order, validating types and applying defaults. Higher-level helpers construct common patterns, such as a member access chain, a function call or a variable declaration. Template-based builders parse a snippet with placeholders and substitute nodes, which is far more readable than nested builder calls. Builders are generated from the node definitions. The hazards are shared references, since reusing one node in two places creates aliasing, and generated nodes without locations.",
    k: ["Typed builders vs template snippets: builders are explicit and cannot produce invalid shapes; templates are readable and rely on parsing and substitution at each use.", "Validate on build vs only in a final pass: immediate checks find the faulty plugin; deferred validation is cheaper and reports far from the cause."],
    p: ["Using the same node object in two places lets a later mutation change both.", "A template placeholder replaced by a node of the wrong kind builds a tree that prints invalid code."],
    v: "Build a function declaration through builders and through a template, print both, and confirm identical output, valid syntax and validation passing on both trees.",
    dep: ["node-type-definitions", "ast-validation"]
  },
  "node-cloning": {
    s: "Copies nodes or subtrees so the same code can appear in two places without shared state, with options for keeping or dropping locations and comments.",
    d: "Transforms often need to duplicate an expression, such as a default value used in two branches. Cloning copies the structure deeply, leaving metadata such as scope references, comments and locations according to flags. Because the tree is mutable and identity matters for caches, paths and scope tables, two places must never share one node object. Cloning a subtree that declares bindings produces duplicates that must be renamed or registered. Cheap shallow clones exist for nodes whose children will be replaced anyway.",
    k: ["Deep clone with metadata vs structure only: keeping metadata preserves locations and comments; stripping them avoids duplicated positions confusing maps.", "Immutable shared nodes vs mutable unique nodes: immutability makes sharing safe and clone-free; mutability is what most plugins expect and needs defensive cloning."],
    p: ["Duplicating an expression that contains a function leaves two functions declaring the same binding in one scope.", "A cloned node carrying a stale scope reference resolves names against the old position."],
    v: "Clone a subtree containing a function and a comment into two places, transform one copy, and confirm the other is unchanged, bindings are distinct and the comment appears where intended.",
    dep: ["node-type-definitions", "scope-tree"]
  },
  "ast-validation": {
    s: "Checks that a tree follows the node definitions, with correct field types, lists and parent-child relationships, before printing or between passes.",
    d: "The validator walks the tree and, for each node, checks that required fields exist, values have the expected types, child nodes are in categories allowed for that field, and structural rules hold, such as an assignment having a valid target. It can run after every pass in development and once at the end in production. Validation turns a plugin's mistake into an immediate error naming the node, instead of invalid text at the printer or, worse, valid text with different behavior.",
    k: ["Validate after every pass vs only at the end: every pass pins blame to a plugin; only at the end is cheap and cannot say which plugin broke it.", "Check shape only vs also semantic rules: shape checks are fast and generic; semantic checks catch more and duplicate parser logic."],
    p: ["Validation disabled in release builds hides a plugin bug that appears only on rare inputs.", "A validator that accepts a node the printer cannot print gives false confidence."],
    v: "Run a plugin that deliberately places a statement where an expression belongs. Confirm validation fails naming the node type, field and plugin, and the printer is never reached.",
    dep: ["node-type-definitions", "ast-traversal"]
  }
});
