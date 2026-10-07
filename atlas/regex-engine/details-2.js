// Details for the regular expression engine plate, part 2: parsing, syntax tree, construction.
ATLAS.details("regex-engine", {
  "tokenizer": {
    s: "Reads pattern text and produces tokens such as literals, operators, escapes and group openers, tracking positions so errors can point at the exact character.",
    d: "Regex syntax is context dependent: a hyphen is an operator inside a class and a literal outside, a brace may start a repeat or be plain text. So the tokenizer often runs inside the parser, which tells it the current mode. It decodes the pattern as characters, not bytes, so multi-byte literals stay whole. Escapes expand to code points, classes, assertions or errors. The hard part is the long tail of historical escape rules and the ambiguity of braces and backslashes followed by digits.",
    k: ["Parser-driven mode switching versus a context-free tokenizer: mode switching handles classes and braces correctly, but couples the two stages tightly.", "Treating an unknown escape as a literal versus an error: literal is lenient and compatible, while an error catches typos that would silently change meaning."],
    p: ["Reading a pattern as bytes so a multi-byte literal splits into separate unrelated literals.", "Treating a brace as a repeat in one place and a literal in another, producing a different pattern than the author wrote."],
    v: "Tokenize a corpus of patterns with escapes, braces and classes, and confirm the token stream and spans match a golden file. Confirm an unterminated escape reports the position of the backslash.",
    dep: ["flavor-grammars", "error-reporting"]
  },
  "flavor-grammars": {
    s: "The syntax rules for each supported pattern dialect: which operators, escapes, group types and class forms are legal and what they mean.",
    d: "A grammar table or dialect switch controls the parser: whether lookaround exists, whether named groups use one syntax or several, how classes nest, and whether POSIX bracket names are recognized. Different dialects also differ in what is escaped by default, such as whether a bare parenthesis is a group or a literal. The parser consults the active dialect for each decision. The hard part is that dialects overlap enough to look identical and diverge in rarely used corners.",
    k: ["A parameterized single parser versus one parser per dialect: one parser shares fixes and tests, while separate parsers avoid conditionals but drift apart.", "Rejecting unsupported syntax versus accepting and ignoring it: rejection is honest, while acceptance helps porting but risks a different meaning."],
    p: ["Supporting a dialect's syntax for a feature but implementing different matching semantics.", "Dialect switches added as flags scattered through the parser, so combinations are never tested."],
    v: "Parse the same set of one hundred patterns in each dialect and confirm each is either accepted with the expected tree or rejected with a dialect-specific error, comparing against a table.",
    dep: ["tokenizer", "error-reporting"]
  },
  "character-class-parser": {
    s: "Parses bracketed sets, ranges, negation, nested sets, named classes and set operations into a set of code point ranges.",
    d: "A class like a bracket expression is read item by item: single characters, ranges, escapes such as digit and word shorthands, named property classes and, in some dialects, nested classes with union, intersection and difference. It produces a normalized sorted list of non-overlapping ranges. Negation is applied after case folding. The difficulty is edge syntax: a leading closing bracket, a trailing hyphen, ranges whose endpoints are classes, and reversed ranges, all of which differ by dialect.",
    k: ["Producing ranges immediately versus keeping a class expression tree: ranges are simple and fast to compile, while a tree preserves operations needed for case-insensitive negation.", "Strict range validation versus tolerating reversed ranges: strict catches typos, tolerance preserves old patterns."],
    p: ["Negating a class before applying case folding, so a negated case-insensitive class matches letters it should exclude.", "Quadratic behavior on classes with thousands of items because ranges are merged naively."],
    v: "Parse classes with edge syntax and confirm the resulting range lists equal expected values. Check a negated case-insensitive class excludes both cases of every listed letter.",
    dep: ["tokenizer", "class-set-algebra", "unicode-property-tables"]
  },
  "quantifier-parser": {
    s: "Reads repeat operators, including star, plus, optional and counted braces, with their greedy, lazy and possessive variants, and attaches them to the right subexpression.",
    d: "A quantifier binds to the preceding atom, which may be a literal, class, group or assertion. The parser reads minimum and maximum counts, an optional lazy or possessive suffix, and rejects a quantifier with nothing before it or on a construct that cannot repeat. It enforces a maximum count. Nested quantifiers like repeating a repeat are legal in some dialects and an error in others. The hard part is validating counts early, because a large count multiplies compiled size.",
    k: ["Allowing quantifiers on assertions versus rejecting them: allowing is compatible, but repeating a zero-width construct creates empty-loop corner cases.", "Capping repeat counts at parse time versus at compile time: parse time fails fast, while compile time knows the real expanded size after nesting."],
    p: ["Accepting a very large counted repeat and discovering the compiled size only after memory is exhausted.", "Misreading a brace that is not a valid count as a repeat and failing instead of matching literally."],
    v: "Parse a set of valid and invalid quantifiers, including nested counts, and confirm each result against expectations, with an oversize count rejected before any automaton memory is allocated.",
    dep: ["tokenizer", "nesting-depth-limit", "program-size-limit", "repetition-expansion"]
  },
  "group-and-name-parser": {
    s: "Parses capturing, non-capturing, named, atomic and lookaround groups, assigning numbers and names and resolving references.",
    d: "Each group type has its own opener syntax. Capturing groups receive indices in the order of their opening parenthesis; named groups also record a name, which must be unique or follow a duplicate-name rule. Backreferences are resolved to indices after parsing so forward references work. The parser tracks nesting for the depth limit. The hard part is numbering when named and unnamed groups mix, and duplicate names across alternation branches, which some dialects allow.",
    k: ["Numbering named and unnamed groups together versus separately: together is simple and consistent, while separate numbering surprises people who add a name and see indices shift.", "Allowing duplicate names in different branches versus forbidding them: allowing helps alternation patterns, but needs a rule for which branch value is returned."],
    p: ["Referencing a group that does not exist and discovering it only at match time.", "Adding a capturing group in the middle of a pattern and silently renumbering every later reference."],
    v: "Parse patterns mixing named and numbered groups and confirm the index-to-name table equals the expected one, and that a reference to a missing group is a compile error naming the reference.",
    dep: ["tokenizer", "flavor-grammars", "nesting-depth-limit"]
  },
  "inline-flag-scoping": {
    s: "Handles flags that switch on or off partway through a pattern, applying them to the rest of the enclosing group and restoring them at its end.",
    d: "An inline flag group changes case sensitivity, multiline, dotall or whitespace handling for what follows. The parser keeps a stack of flag states: entering a group copies the current state, a flag directive modifies it, leaving the group restores it. The tree records the effect by rewriting nodes, such as turning a literal into a case-insensitive set. The difficulty is correct scope at group boundaries and with alternation, where a flag set in one branch should not leak into the next.",
    k: ["Applying flags during parsing by rewriting nodes versus carrying flag fields on nodes: rewriting leaves later stages flag-free, while fields keep the tree small but force every stage to check them.", "Scoped-to-group versus scoped-to-end-of-pattern: group scope is safer for composition, while pattern scope matches some older dialects."],
    p: ["A flag turned on inside a group leaking to text after the group because the stack was not restored.", "Case folding applied to a backreference differently from the group it refers to."],
    v: "Parse a pattern that enables case insensitivity inside one group and confirm only text matched by that group is case-folded, with an identical literal outside it still exact.",
    dep: ["tokenizer", "case-fold-rewrite", "option-flags"]
  },
  "extended-mode": {
    s: "A mode that lets pattern authors use whitespace and comments for layout, ignoring them outside character classes and escapes.",
    d: "In extended mode the tokenizer skips unescaped whitespace and everything from a comment marker to the end of line, so long patterns can be formatted and annotated. Whitespace inside a class or after a backslash still counts. Some dialects make whitespace inside classes ignorable as well. Mode can be switched inline, so the tokenizer must follow the flag stack. The hard part is the handful of places where whitespace matters, such as between a quantifier and its operand or inside a counted repeat.",
    k: ["Ignoring whitespace in classes versus keeping it: keeping is least surprising, while ignoring allows tidy layout but surprises people who meant a space.", "Treating comments as a lexer feature versus a group type: lexer comments are cheap, while a group-style comment can sit inside a line."],
    p: ["Using extended mode and forgetting that a literal space must be escaped, so the pattern silently loses it.", "A comment that contains the closing delimiter in some embedded contexts breaking the pattern."],
    v: "Parse the same pattern written compactly and in extended layout with comments and confirm the resulting trees are identical, and that an escaped space and class space still match a space.",
    dep: ["tokenizer", "inline-flag-scoping"]
  },
  "nesting-depth-limit": {
    s: "A cap on how deeply groups and repeats may nest, preventing stack overflow in recursive parsing and later recursive tree walks.",
    d: "Parsing and every later tree traversal are recursive, so a pattern with a million opening parentheses overflows the stack. The parser counts depth as groups open and fails with an error past a limit, often a few hundred. A second kind of limit applies to nested repeats whose counts multiply. The limit protects the process, so it must be enforced in the parser and not after the fact. The hard part is choosing a value generous for real patterns and safe on a small thread stack.",
    k: ["A fixed depth limit versus making all traversals iterative: a limit is simple and safe, while iteration allows deep patterns but complicates every pass.", "Counting syntactic depth versus counting expanded size: depth bounds stack, but only expanded size bounds memory."],
    p: ["Enforcing the limit in the parser but not in a later rewrite that recurses deeper on the expanded tree.", "Running on a thread with a small stack where the default limit is already too large."],
    v: "Parse patterns of increasing nesting depth on a thread with a reduced stack and confirm those under the limit parse and those over it fail with the depth error, never crashing.",
    dep: ["error-reporting"]
  },

  "ast-nodes": {
    s: "The data structure that represents a parsed pattern: literals, classes, concatenation, alternation, repetition, groups, assertions and anchors, each with a source span.",
    d: "A small closed set of node kinds covers the language. Each node stores its children, its source position for error messages and, for groups, an index. The tree is immutable once built so analyses and rewrites can share subtrees safely. Memory is a concern because a repeat expansion can create many nodes; nodes are arena allocated or interned. The difficulty is choosing granularity: too coarse hides optimization opportunities, too fine bloats memory and slows traversal.",
    k: ["Rich tree preserving source detail versus a minimal normalized one: rich supports linters and error messages, while minimal is smaller and faster to optimize.", "Immutable shared nodes versus mutation in place: sharing is safe and cheap to copy, but rewrites allocate new nodes."],
    p: ["Dropping source spans to save memory and then being unable to point errors at the right place.", "Deep trees that overflow the stack in a recursive destructor."],
    v: "Parse a pattern, print the tree, and confirm it round-trips to an equivalent pattern string. Confirm a tree of one million nodes can be dropped without stack overflow.",
    dep: ["tokenizer", "arena-allocation"]
  },
  "tree-simplifier": {
    s: "Rewrites the tree into a smaller equivalent form: flattening nested concatenations, merging adjacent literals, factoring common prefixes and removing dead branches.",
    d: "Passes include concatenating adjacent literals into strings, flattening alternation of alternations, merging single-character alternations into a class, removing empty repeats and collapsing nested repeats where legal. Each rewrite must preserve match semantics including priority among branches and capture positions. Smaller trees mean smaller automata and clearer literals for prefilters. The hard part is semantic safety: reordering alternatives changes which match is leftmost-first, and merging across groups changes captures.",
    k: ["Aggressive rewriting versus conservative rewriting: aggressive gives smaller automata, while conservative is easier to prove equal to the original.", "Factoring common prefixes of alternation versus leaving it: factoring cuts states and enables literal detection, but can change capture behavior if not handled."],
    p: ["Reordering alternatives for compactness and thereby changing which text is matched first.", "Collapsing nested repeats where the inner group is captured, losing the last-iteration capture."],
    v: "Compare simplified and unsimplified trees on a large generated input set across all matchers and confirm identical spans and captures for each pair.",
    dep: ["ast-nodes", "property-analysis"]
  },
  "class-set-algebra": {
    s: "Operations on sets of code point ranges: union, intersection, difference, negation, case closure and canonicalization, used by the parser and compiler.",
    d: "Classes are sorted, non-overlapping range lists, so set operations are linear merges. Negation is relative to the full code point space or to valid characters only. Case closure adds every case variant of each member. Canonical form means equal sets have equal representation, so automaton construction can share them. The hard part is scale: a negated Unicode class contains over a million code points as a few hundred ranges, so everything must operate on ranges, never members.",
    k: ["Range lists versus bitmaps: ranges are compact for Unicode and fast to merge, while bitmaps give constant lookup but only for small alphabets such as bytes.", "Eager canonicalization versus lazy: eager keeps equality simple, while lazy avoids work for sets that are never compiled."],
    p: ["Enumerating members for a negated class, which allocates over a million entries.", "Treating surrogate or unassigned code points inconsistently between negation and matching."],
    v: "Verify union, intersection and negation identities on random range sets, such as complement of complement equal to the original, and confirm negation of a class runs in time proportional to its range count.",
    dep: ["ast-nodes", "unicode-property-tables"]
  },
  "case-fold-rewrite": {
    s: "Rewrites literals and classes under case-insensitive mode so each matches every case variant, including characters with multiple or special mappings.",
    d: "For each literal the pass looks up its simple case-fold equivalence class and replaces it with a set of alternatives. Classes get case closure. Some characters fold to several code points or have two uppercase forms, so simple one-to-one folding is not enough; engines choose whether to support full folding. Rewriting runs before compilation so matchers need no case logic. The hard part is the special cases, such as a character whose uppercase is different in a particular language, and the size growth of case-closed classes.",
    k: ["Simple one-to-one folding versus full multi-character folding: simple keeps automata uniform, while full matches more linguistically but breaks one character equals one step.", "Rewriting at compile time versus comparing folded text at match time: compile time keeps the inner loop fast, while match time avoids size growth."],
    p: ["Using ASCII folding on Unicode text and missing characters whose case pairs sit outside ASCII.", "Case-closing a large class and growing the automaton noticeably for little benefit."],
    v: "Match a case-insensitive pattern against every case variant of its characters, including ones outside ASCII with special folding, and confirm each matches while characters from other equivalence classes do not.",
    dep: ["class-set-algebra", "case-folding", "inline-flag-scoping"]
  },
  "property-analysis": {
    s: "Computes facts about each subexpression: whether it can match empty, minimum and maximum match length, anchoring, and which first and last bytes are possible.",
    d: "A bottom-up pass over the tree annotates each node. Minimum length lets matchers reject inputs that are too short. Anchoring tells the engine to try only one position. The set of possible first bytes drives scan acceleration. Whether a node can match the empty string decides empty-loop handling. Maximum length bounds lookbehind and streaming buffers. The hard part is correctness under assertions and lookaround, which consume nothing but constrain matches, so length facts must treat them carefully.",
    k: ["Computing facts once on the tree versus recomputing in each stage: once is consistent and cheap, but the tree must carry annotations or a side table.", "Conservative bounds versus exact bounds: conservative is always safe, while exact needs automaton analysis but allows stronger optimizations."],
    p: ["Reporting a minimum length that ignores a branch which matches less, rejecting inputs that should match.", "Treating an unbounded repeat as bounded because the bound overflowed an integer."],
    v: "Compute min and max length for generated patterns and confirm every match found by brute-force search has a length inside the computed bounds, with bounds tight on simple cases.",
    dep: ["ast-nodes", "class-set-algebra"]
  },
  "feature-detection": {
    s: "Determines which advanced constructs a pattern uses, such as backreferences, lookaround, atomic groups or Unicode classes, so the selector knows which engines can run it.",
    d: "A tree walk records flags for each construct. Backreferences require backtracking or a limited fallback. Lookaround may be handled by a specialized automaton form or by backtracking. Atomic and possessive groups change matching semantics. The result is a capability set consumed by the engine selector and the linter. The difficulty is precision: a lookahead at the end of a pattern may be supported by an automaton while one in the middle is not, so detection needs context.",
    k: ["Coarse flags per construct versus context-sensitive detection: coarse is simple but sends supported patterns to the slow engine, while contextual gives better placement at greater complexity.", "Detecting at compile time versus discovering unsupported features at runtime: compile time lets the selector pick an engine, while runtime failure wastes work."],
    p: ["Missing a backreference inside a rarely used branch and running an automaton that cannot represent it.", "Flagging all lookaround as unsupported and sending common patterns to the exponential engine."],
    v: "Detect features on a corpus of patterns and confirm each capability set equals a manually labeled table, and that the selector's chosen engine supports every construct in the pattern.",
    dep: ["ast-nodes", "engine-selector"]
  },
  "repetition-expansion": {
    s: "Expands counted repeats into repeated copies of the subexpression, which is how automata represent bounded counting at the cost of multiplying size.",
    d: "A repeat with minimum two and maximum five becomes two required copies followed by three nested optional copies. Large counts or nested counted repeats multiply: a counted repeat of a repeat of a class can expand to millions of states. Expansion happens before or during construction, and the program size limit is checked as it grows. The hard part is that counting is not representable in finite automata without copying, so some engines add counters that complicate matching.",
    k: ["Full expansion versus counter-based repeats: expansion keeps matchers simple and linear, while counters save memory but need extra state per thread.", "Checking size after expansion versus predicting it first: predicting fails before allocating, while checking after is simpler but can exhaust memory in the check."],
    p: ["Letting a hostile counted repeat nest to produce a huge automaton before any limit applies.", "Expanding the same large subexpression repeatedly instead of sharing the compiled fragment."],
    v: "Compile a pattern with nested counted repeats and confirm the predicted state count equals the built count, and that an oversize request fails before allocating more than the configured limit.",
    dep: ["ast-nodes", "program-size-limit", "quantifier-parser"]
  },

  "thompson-construction": {
    s: "Builds a nondeterministic automaton from the tree by composing small fragments for each operator, giving a graph linear in pattern size.",
    d: "Each node becomes a fragment with one entry and one exit: a literal is a single transition, concatenation links exits to entries, alternation adds a split state, repetition adds loops with empty transitions. The result has a number of states proportional to pattern size, so it can be built and simulated safely. It carries priority on splits so leftmost-first semantics can be reproduced. The hard part is empty transitions, which create cycles that simulation must close over without looping.",
    k: ["NFA with empty transitions versus an epsilon-free form: empty transitions keep construction simple and small, while removing them speeds simulation but can increase transitions.", "Building directly from the tree versus through an intermediate instruction list: direct is minimal, while an instruction list is a shared form that matchers can all consume."],
    p: ["Repeating a subexpression that can match empty creates an empty-transition cycle that loops forever unless closure tracks visited states.", "Losing split priority during construction so later engines pick a different alternative than expected."],
    v: "Build automata for a set of patterns, simulate them on random inputs, and confirm the match sets equal a reference matcher, with state count linear when pattern size doubles.",
    dep: ["ast-nodes", "program-instructions", "capture-slot-allocation", "utf8-automata"]
  },
  "program-instructions": {
    s: "The compact instruction format the compiled pattern uses: byte or class tests, split, jump, save position, assert, and match.",
    d: "The program is a flat array of small instructions that every matcher interprets or converts to its own form. Instructions test a byte or range, branch with priority order, record a position into a capture slot, check an assertion, or accept. Sharing one program lets the simulation, the backtracker and the DFA builder agree on semantics. Compact encoding matters for cache. The difficulty is the instruction set boundary: richer instructions simplify backtracking but complicate automata that must expand them.",
    k: ["One shared program for all engines versus per-engine forms: one program guarantees the same meaning, while per-engine forms can be optimized for each.", "Byte-level instructions versus code-point-level: bytes make the DFA uniform, while code points keep programs smaller but require decoding in every matcher."],
    p: ["Adding an instruction that one matcher supports and another silently ignores.", "Storing jump targets as absolute large integers and bloating programs that must stay in cache."],
    v: "Print the program for a set of patterns and confirm instruction counts and semantics against golden listings. Run each matcher on the same program and confirm identical results.",
    dep: ["ast-nodes", "capture-slot-allocation"]
  },
  "capture-slot-allocation": {
    s: "Assigns two position slots per capture group, start and end, and emits instructions that save the current position into them.",
    d: "Group zero is the whole match. Each group gets two consecutive slots; entering the group saves the position to its start slot and leaving it to the end slot. Matchers carry a slot array per active thread or backtrack frame, so the number of slots is a direct cost. Optimizations omit slots for groups not requested, which means the program can be compiled in a form without captures. The difficulty is repetition: each iteration overwrites the slots, and unmatched branches must clear them.",
    k: ["Carrying all slots always versus compiling slot-free variants: always is simple, while variants make plain matching faster and smaller but double compilation work.", "Clearing slots on failure versus restoring them by undo log: clearing is simple in simulation, while an undo log is cheaper in backtracking."],
    p: ["Slots left over from an earlier abandoned branch appearing as a capture of the final match.", "Allocating slots for every group in a pattern with hundreds of groups when the caller asked only for overall span."],
    v: "Match patterns with groups inside alternation and repetition and confirm slot values equal the reference, with no stale values from failed branches. Confirm a slot-free build still returns the same overall spans.",
    dep: ["program-instructions", "group-and-name-parser"]
  },
  "utf8-automata": {
    s: "Compiles ranges of code points into automata over UTF-8 bytes, so matchers can run on bytes while still matching whole characters.",
    d: "A code point class becomes a set of byte sequences: one-byte, two-byte, three-byte and four-byte forms, split so each range maps to consecutive byte ranges. Shared suffixes are merged so a large class such as all letters stays small. A dot that must match any valid character becomes a compact automaton that also rejects invalid sequences. The result lets the DFA and prefilters work on raw bytes. The hard part is minimizing size for large classes and handling surrogates and overlong forms.",
    k: ["Compiling Unicode to byte automata versus decoding to code points first: bytes keep the inner loop simple and fast, while decoding is easier to implement but slower.", "Suffix sharing versus naive expansion: sharing keeps big classes small at a cost of compile time and cache lookup."],
    p: ["Accepting overlong or surrogate encodings so a match starts at invalid text.", "Naively expanding a negated Unicode class into thousands of states and exceeding the size limit."],
    v: "For a class and a negated class, test every code point from zero to the maximum encoded as UTF-8 and confirm acceptance equals set membership, with invalid sequences always rejected.",
    dep: ["class-set-algebra", "program-instructions", "utf8-decoding"]
  },
  "empty-assertion-compilation": {
    s: "Compiles zero-width assertions such as line start, line end, text boundaries and word boundaries into checks that depend on adjacent input.",
    d: "An assertion depends on the bytes before and after the current position, not on consuming input. Simulation checks it when following empty transitions, using look-around-one context from the haystack. A DFA has no access to context, so the construction records the previous byte class as part of state, or defers the check to the following byte. Anchors at text start depend on search bounds. The hard part is word boundaries, which need Unicode word-class knowledge and cannot be decided until the next byte is seen.",
    k: ["Carrying previous-byte context in DFA states versus delaying assertion decisions one byte: carrying multiplies states, while delaying keeps states fewer but needs a trailing step.", "Treating the text edge as a virtual byte class versus a special flag: a virtual class unifies handling but must be added to the alphabet."],
    p: ["Evaluating an end anchor without knowing whether more input follows when streaming.", "Treating a word boundary at a chunk edge as a text edge, producing a false boundary."],
    v: "Test line, text and word assertions at every position of strings with line breaks and Unicode words, and confirm DFA and simulation results agree with a hand-computed table at each offset.",
    dep: ["program-instructions", "line-mode-semantics", "word-boundary-semantics", "search-window"]
  },
  "lookaround-compilation": {
    s: "Compiles lookahead and lookbehind into sub-programs that check text around the current position without consuming it.",
    d: "A positive lookahead runs a nested program at the current position and succeeds if it matches. Negative forms succeed on failure. Lookbehind needs a program that matches ending at the position, often by reversing the subpattern, and usually requires a bounded length. Automata engines support limited forms, such as lookaround at pattern edges, by extending state. General lookaround usually needs backtracking. The hard part is interaction with captures inside lookaround and with search windows, where context outside the window must be visible.",
    k: ["Supporting lookaround in automata versus only in backtracking: automata keep the linear guarantee for a restricted subset, while backtracking supports all forms but loses it.", "Bounded-length lookbehind versus arbitrary: bounded can be compiled to a reverse match of fixed width, while arbitrary needs the reverse engine and more cost."],
    p: ["Allowing unbounded lookbehind and then scanning to the start of text at every position, giving quadratic time.", "Captures set inside a negative lookahead leaking into the result."],
    v: "Match positive and negative lookahead and lookbehind patterns over inputs and confirm results equal the reference engine at every start position, including at the very start and end of the input.",
    dep: ["program-instructions", "reverse-program", "feature-detection", "search-window"]
  },
  "reverse-program": {
    s: "A second compiled form of the pattern that matches backward from a position, used to find where a match starts once the forward scan found where it ends.",
    d: "The tree is reversed, with concatenations flipped and anchors swapped, then compiled to its own automaton. A forward DFA scan finds the match end without tracking starts; the reverse DFA runs from the end back to locate the earliest start that makes a valid leftmost match. Together they give exact bounds in two linear passes without captures. The hard part is semantics: to reproduce leftmost-first the reverse scan must run in a mode that picks the right start, and lookaround and anchors need mirrored handling.",
    k: ["Forward plus reverse scan versus a single forward scan tracking starts: two scans keep states small and speed high, while one scan costs more per state but avoids rescanning.", "Compiling the reverse form eagerly versus on first use: eager keeps search latency flat, while lazy saves memory for patterns that rarely need it."],
    p: ["Using the reverse scan with the wrong start semantics so overlapping alternatives report the wrong start.", "Reversing a pattern with lookbehind or anchors without mirroring them."],
    v: "Find match bounds on a random pattern and input set with forward-plus-reverse scanning and confirm start and end equal those from a captures-tracking simulation for every match.",
    dep: ["thompson-construction", "tree-simplifier", "empty-assertion-compilation"]
  },
  "nfa-minimization": {
    s: "Reduces the automaton's size by sharing identical sub-paths and removing unreachable and redundant states before matchers see it.",
    d: "Common suffix states are shared through hash-consing during construction, which matters most for large alternations of literals and Unicode classes. Unreachable states are dropped, and chains of empty transitions are collapsed. Full minimization of nondeterministic automata is too expensive, so only cheap, local reductions are used. Smaller automata mean fewer states to step per byte and smaller DFA states. The hard part is staying cheap and preserving priority order, which sharing could otherwise disturb.",
    k: ["Cheap local reduction versus full minimization: local is linear and safe to run on every compile, while full minimization is exponential in the worst case.", "Sharing states across branches versus keeping them separate for priority: sharing shrinks the graph, but can merge paths that must remain ordered."],
    p: ["Merging two states that look the same but differ in capture side effects.", "Spending more compile time on minimization than matching saves on short-lived patterns."],
    v: "Compile a large alternation of words with and without sharing and confirm state count drops substantially while match results across a test corpus remain identical.",
    dep: ["thompson-construction", "utf8-automata"]
  },
  "program-size-limit": {
    s: "A cap on the compiled program's memory, which stops patterns with huge repeats or classes from consuming unbounded memory at compile time.",
    d: "Construction accounts for the bytes of each state and instruction it adds, and aborts with a size error when the total passes the limit. Defaults are chosen so common patterns fit with room to spare while pathological ones fail early. The limit covers the forward program, the reverse program and optional full automata separately. Because it is checked during construction, the process never holds the oversized graph. The hard part is accounting accurately for shared structure and temporary memory.",
    k: ["A byte limit versus a state-count limit: bytes bound real memory, while state counts are easier to explain but ignore state size differences.", "Fail on exceeding versus fall back to a slower engine: failing is predictable, while fallback keeps more patterns working but needs a matcher that does not require the large form."],
    p: ["Checking after construction completes, so the memory spike already happened.", "A single global limit that is too small for legitimate large Unicode classes, forcing users to raise it for every pattern."],
    v: "Compile a pattern whose size is just under and just over the limit and confirm the first works and the second fails with the size error, peak memory remaining within a small multiple of the cap.",
    dep: ["memory-accounting", "error-reporting", "thompson-construction"]
  }
});
