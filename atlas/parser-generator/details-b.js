// Details for the parser generator plate, part 2: lexical specification, grammar analysis and lexer generation.
ATLAS.details("parser-generator", {
  "token-definitions": {
    s: "Named patterns, usually regular expressions, that describe each kind of token and the text it covers, from which the scanner is built.",
    d: "Each definition names a token kind and gives a pattern built from literals, character classes, repetition and alternation, plus optional fragments reused by other patterns. Definitions may carry an action such as skip, change mode or transform the text. The generator parses them into one combined set so a single automaton can recognize every kind at once. Order often matters as a tie-breaker, so the file is partly a priority list. The hard part is overlap: identifiers, keywords and numbers all match the same text unless priority is explicit.",
    k: ["Order as priority vs explicit priority numbers: file order is simple to read, but moving a definition changes behavior, while explicit numbers are stable and noisier.", "Fragments vs inline repetition: fragments remove duplication in patterns, though they make the final pattern harder to see and let a typo in one fragment affect many tokens."],
    p: ["A broad pattern defined early shadows a narrower one, and the narrower token is never produced.", "A pattern that can match the empty string makes the scanner loop without consuming input."],
    v: "Define identifiers, integers and a float. Scan a file with each and one ambiguous case such as 1.5; every token must have the expected kind and text, and an empty-matching pattern must be rejected at generation.",
    dep: ["regex-parser", "maximal-munch", "grammar-file-format"]
  },
  "keyword-handling": {
    s: "How reserved words are told apart from identifiers: as separate patterns in the automaton, or by looking up each identifier in a table after it is matched.",
    d: "Listing every keyword as its own pattern gives the automaton exact paths, but it grows the state count with the number of keywords. The alternative matches a general identifier and then checks the text against a perfect hash or sorted table, which keeps the automaton small and makes adding a keyword cheap. Contextual keywords, which are reserved in some positions only, are harder: either the scanner stays unaware and the parser accepts an identifier with a particular spelling, or the lexer needs mode information.",
    k: ["Keywords in the automaton vs table lookup after matching: in-automaton matching avoids a second pass, while lookup keeps tables small and lets keywords be added without rebuilding the automaton.", "Reserved everywhere vs contextual keywords: reserved words make scanning context-free, but contextual ones avoid breaking existing names and need parser cooperation."],
    p: ["Adding a keyword to a language breaks every program that used it as a name, with no migration path.", "Case-insensitive keywords are folded in the scanner but the original spelling is lost for later error messages."],
    v: "Scan a file where one keyword appears as a plain name in a permitted position and as a keyword elsewhere. Each occurrence must get the right kind, and a name that merely starts with a keyword must remain an identifier.",
    dep: ["token-definitions", "subset-construction", "lexer-feedback", "symbol-interning"]
  },
  "lexer-modes": {
    s: "Named scanner states, each with its own set of token patterns, switched by actions so one input can contain regions with different lexical rules.",
    d: "A mode selects which patterns are active. Matching a token can push or pop a mode, which is how string interiors, comments, embedded templates and tag bodies are scanned with different rules. The generator builds one automaton per mode, or one automaton with start states. Modes form a stack when nesting is allowed. The problem is that modes are context, and every place where the parser's view of context and the scanner's mode differ produces confusing token streams.",
    k: ["Mode stack vs single current mode: a stack supports nesting such as interpolation inside strings, while a single mode is simpler and fails when regions nest.", "Scanner-driven modes vs parser-driven modes: scanner-driven switching keeps layers separate, while parser-driven switching is more accurate but couples the two and complicates lookahead."],
    p: ["An unmatched closing delimiter pops the last mode and leaves the stack empty, and the next token fails with a baffling message.", "Lookahead tokens fetched before a mode switch were scanned in the wrong mode."],
    v: "Scan a string containing an interpolated expression that itself contains a string. The token kinds must alternate correctly, and the mode stack must be empty at end of input, otherwise the scanner reports an unterminated region.",
    dep: ["token-definitions", "nfa-construction", "lexer-feedback"]
  },
  "skip-and-channels": {
    s: "Rules for tokens that matter to tools but not to the grammar, such as whitespace and comments: discarded, or sent to a side channel for later use.",
    d: "A skip action drops the matched text. A channel action keeps the token but routes it where the parser does not see it, so formatters and documentation tools can recover comments and spacing. Channel tokens keep positions so they can be reattached to nearby tree nodes. This keeps the grammar free of whitespace rules at every position, which would otherwise be unmanageable. The difficulty is deciding what to attach to what, and for languages where whitespace matters, which separate rules are needed.",
    k: ["Discard trivia vs keep it on a side channel: discarding is cheapest and simplest, while keeping it supports formatters and refactoring at the cost of memory and attachment rules.", "Handle whitespace in the scanner vs in the grammar: the scanner approach keeps rules clean, while grammar-level handling is needed only when whitespace changes meaning."],
    p: ["Comments are dropped, then a refactoring tool rewrites the file and loses all of them.", "Nested comments are not supported by a regular pattern and cut off early."],
    v: "Scan a file with line and block comments between tokens. The parser must see only code tokens, and the side channel must contain every comment with exact start and end positions.",
    dep: ["token-definitions", "token-stream", "trivia-attachment"]
  },
  "maximal-munch": {
    s: "The rule that the scanner takes the longest possible match, and on a tie the earliest-listed pattern, which resolves overlap between tokens.",
    d: "When several patterns can match at the current position the scanner prefers the longest text, so a name like iffy is one identifier and not a keyword followed by letters. Ties go to the pattern that appears first. Implementation records the last accepting state while continuing to read, then backs up to it when the automaton dies. That backing up can cost repeated rescanning on adversarial input. A few languages need exceptions to longest match, handled with lookahead or context rules.",
    k: ["Longest match vs first match: longest match gives the intuitive tokenization of names and operators, while first match is simpler and requires careful ordering of every pattern.", "Backtrack to last accept vs prove no backing up is needed: backtracking is general, while analysis can show when a pattern never needs it and skip the buffering."],
    p: ["A pattern that nearly matches a very long input fails at the end, and the scanner rescans it from each start position, going quadratic.", "Operator tokens such as a double greater-than conflict with closing of nested generic types."],
    v: "Scan an operator sequence with overlapping prefixes. The longest valid operator must win at each step, and a crafted input with repeated near-matches must scan in time proportional to its length.",
    dep: ["subset-construction", "token-definitions", "trailing-context"]
  },
  "layout-tokens": {
    s: "Producing indent and dedent tokens from leading whitespace so that block structure defined by layout can be parsed by an ordinary context-free grammar.",
    d: "A scanner pass tracks a stack of indentation widths. At each line start it compares the new width to the stack top and emits indent, one or more dedents or nothing, and it suppresses newlines inside brackets. Tabs and spaces need a defined width rule. The grammar then uses these as ordinary braces. Because the scanner is stateful, it cannot be a pure automaton, so generators offer hooks or a built-in mode. Continuation lines and blank lines are the main sources of bugs.",
    k: ["Synthetic tokens from a scanner hook vs layout rules in the grammar: hooks keep the grammar context-free and simple, while grammar-level rules express alignment constraints that tokens cannot.", "Fixed tab width vs reject mixed tabs: a fixed width accepts more files, but rejecting mixtures prevents code that looks aligned in one editor and not another."],
    p: ["A dedent to a width that matches no outer level is accepted silently and produces a wrong nesting.", "Blank and comment-only lines emit layout tokens and split a block in two."],
    v: "Parse nested blocks with blank lines, comments and a bracketed continuation line. Indent and dedent tokens must balance exactly, and a dedent to an unmatched width must report an error at that line.",
    dep: ["lexer-modes", "token-stream", "skip-and-channels", "lexer-feedback"]
  },
  "grammar-normalization": {
    s: "Rewrites the grammar into a canonical internal form, with imports resolved, extended notation expanded and symbols numbered, so every later pass works on one simple model.",
    d: "Normalization resolves imports and templates, expands repetition and groups, assigns integer ids to terminals and nonterminals, adds an augmented start rule and an end-of-input terminal, and records for each production its origin so diagnostics can point at source text. It may also remove unit rules or inline small ones when asked. It must be deterministic, since ids determine table layout and therefore generated output. The hard part is traceability: every synthetic rule needs a path back to the author's text.",
    k: ["Keep one canonical model vs one model per algorithm: a canonical model reduces code and bugs, while algorithm-specific models are faster but must be kept in agreement.", "Inline small rules vs keep the author's structure: inlining shrinks tables, but it also changes tree shape and error messages unless the mapping is preserved."],
    p: ["Symbol ids depend on hash iteration order, so generated output changes between runs with no grammar change.", "Synthetic rules lack origin information, and every conflict message refers to rules the author cannot find."],
    v: "Normalize a grammar with imports, a template and a repetition, then dump the result. Every production must carry its source location, and two runs must produce byte-identical dumps.",
    dep: ["ebnf-desugaring", "symbol-interning", "grammar-imports", "parameterized-rules"]
  },
  "ebnf-desugaring": {
    s: "Rewrites optional, repeated and grouped notation into plain productions by adding helper nonterminals, in a way that matches the chosen parsing strategy.",
    d: "A question mark becomes a rule with an empty alternative, and a star becomes a right- or left-recursive helper. For bottom-up parsing, left recursion keeps the stack shallow, while top-down tools need loops or right recursion. The pass records each helper's origin and what tree shape the original notation promises, so the tree builder can flatten helper chains back into lists. Choosing the recursion direction changes stack depth, conflicts and the order in which actions run, so the choice is visible to users.",
    k: ["Left recursion vs right recursion for lists: left recursion needs constant stack in bottom-up parsers, while right recursion fits top-down tools but can overflow the stack on long lists.", "Expand to rules vs native loops: loops generate faster, smaller top-down code, though expansion keeps one algorithm for all strategies."],
    p: ["Right-recursive lists overflow the stack on inputs with hundreds of thousands of elements.", "Helper rules appear in error messages and trees under invented names."],
    v: "Desugar a star list and parse an input with one hundred thousand items. It must complete without stack overflow and produce a flat list of that length with items in source order.",
    dep: ["repetition-operators", "left-recursion-analysis", "symbol-interning"]
  },
  "reachability-checks": {
    s: "Finds rules that cannot be reached from any entry point, and rules that can never derive a finite string, both of which indicate mistakes.",
    d: "Reachability is a graph search from the start symbols through right-hand sides. Productivity is a fixed-point computation: a rule is productive if some alternative consists of terminals and productive rules. An unreachable rule is dead text, and an unproductive one means the grammar accepts nothing through it, often a missing base case. Results are warnings or errors, and they must respect entry points and rules referenced from actions or externals so that live rules are not removed.",
    k: ["Remove unreachable rules automatically vs report them: removal makes tables smaller and the output clean, while reporting keeps what the author wrote and shows mistakes.", "Treat unproductive rules as errors vs warnings: an error blocks a clearly broken grammar, but a warning allows work in progress to proceed."],
    p: ["A rule only used through an external entry point is flagged as dead and deleted.", "A mutually recursive pair with no base case passes casual review and fails only when the language is used."],
    v: "Add one rule that nothing references and one that only references itself. Analysis must report the first as unreachable and the second as unproductive, naming each, and must not flag any rule that an entry point uses.",
    dep: ["grammar-normalization", "graph-algorithms", "entry-points"]
  },
  "nullable-analysis": {
    s: "Computes which nonterminals can derive the empty string, a fact that FIRST, FOLLOW and loop checks all depend on.",
    d: "A nonterminal is nullable if some alternative consists entirely of nullable symbols, which is solved by iterating to a fixed point over all rules. The result feeds FIRST and FOLLOW computation, because a nullable symbol lets the next symbol's tokens appear next. It also drives warnings for repetition over a nullable body and detection of hidden left recursion, where a rule is left-recursive only after nullable prefixes. Efficient implementations use worklists and reverse dependency lists rather than rescanning every rule.",
    k: ["Fixed-point iteration over all rules vs worklist with reverse edges: simple iteration is shorter to write, while a worklist runs in near-linear time on large grammars.", "Allow nullable rules freely vs warn on them: allowing them supports optional constructs naturally, but nullable rules are the root of many conflicts and infinite loops."],
    p: ["Hidden left recursion through a nullable prefix is missed, and the generated parser recurses forever.", "Nullable-ness is computed before desugaring, so helper rules for star are not accounted for."],
    v: "Analyze a grammar where an optional prefix precedes a self-referential rule. The prefix must be marked nullable, the hidden left recursion must be reported, and a grammar without it must pass.",
    dep: ["grammar-normalization", "bitsets"]
  },
  "first-sets": {
    s: "For each rule, the set of tokens that can begin a string it derives, used to choose between alternatives with one token of lookahead.",
    d: "FIRST of a terminal is itself. FIRST of a sequence is the FIRST of its first symbol, extended through each nullable symbol to the next. FIRST of a nonterminal is the union over its alternatives. Computing it is a fixed point over the rule graph, usually with bitsets so unions are one operation per word. Generalized versions track the first k tokens for deeper lookahead. FIRST sets of two alternatives that overlap are the basic signal of a prediction conflict.",
    k: ["Compute FIRST for single tokens vs for k tokens: single-token sets are small and fast, while k-token sets resolve more choices but grow quickly with k and grammar size.", "Eager computation for all rules vs on demand: eager is simple, while on demand saves time when only some entry points are used."],
    p: ["Forgetting that a nullable symbol lets the next symbol's tokens appear produces sets that are too small and parsers that reject valid input.", "The end-of-input marker is included in FIRST by mistake and confuses conflict reports."],
    v: "Compute FIRST for a small expression grammar and compare with the hand-derived table. Two alternatives with overlapping FIRST sets must be reported as a conflict naming the shared token.",
    dep: ["nullable-analysis", "bitsets", "graph-algorithms"]
  },
  "follow-sets": {
    s: "For each rule, the set of tokens that can appear immediately after it in some valid sentence, needed to decide when to leave a rule or reduce.",
    d: "FOLLOW of the start symbol includes end-of-input. For each occurrence of a nonterminal in a right-hand side, the FIRST of what follows is added, and when what follows is nullable, the FOLLOW of the rule's left side is added too. This is another fixed point. Simple LR construction uses FOLLOW as its lookahead, which is imprecise because it ignores context, and the error recovery code uses it to find tokens at which to resume. Context-free FOLLOW merges all uses of a rule.",
    k: ["Context-free FOLLOW vs context-specific lookahead: FOLLOW is cheap and global, while per-state lookahead is more precise and resolves more conflicts at higher construction cost.", "Use FOLLOW for recovery vs track dynamic context: static FOLLOW sets are cheap, but dynamic context gives better resume points."],
    p: ["A rule reused in many places has a huge FOLLOW set, and conflicts appear that disappear with precise lookahead.", "Missing the nullable-suffix case omits tokens, and the parser reports errors on valid input."],
    v: "Compute FOLLOW for a grammar with a nullable suffix and compare with a hand-derived table. A reduction whose lookahead is outside FOLLOW must never be taken in the generated parser.",
    dep: ["first-sets", "nullable-analysis", "bitsets", "entry-points"]
  },
  "left-recursion-analysis": {
    s: "Detects direct, indirect and hidden left recursion, which is harmless to bottom-up methods and fatal to naive top-down ones.",
    d: "A rule is left-recursive if it can derive a string that begins with itself. Direct cases are visible in the text. Indirect cases are found by building a graph where one rule points to the rules that can appear first in its alternatives, treating nullable symbols as transparent, and then finding cycles with a strongly connected component pass. The result either triggers an error for top-down strategies, a rewrite, or nothing for bottom-up ones. The report should show the cycle path, since the cause is often several rules apart.",
    k: ["Reject left recursion vs rewrite it automatically: rejection keeps the tree shape honest, while automatic rewriting is convenient but changes associativity and tree structure unless handled carefully.", "Report only cycles vs show each cycle's path: cycle members alone are short, but the path is what lets an author see where to break it."],
    p: ["The graph ignores nullable prefixes, so hidden left recursion is accepted and the parser loops at run time.", "A cycle report lists rules in arbitrary order and does not show how one leads to the next."],
    v: "Analyze grammars with direct, indirect and nullable-hidden left recursion. Each must be reported with the full cycle path, and a right-recursive grammar of the same language must pass.",
    dep: ["nullable-analysis", "graph-algorithms", "grammar-normalization"]
  },
  "conflict-detection": {
    s: "Finds places where the tables would need two actions for the same state and token, or where two alternatives are predicted by the same lookahead.",
    d: "In a bottom-up automaton, a shift-reduce conflict means a token can both extend the current item and complete a rule, and a reduce-reduce conflict means two rules could end at the same point. In a predictive parser, a conflict is two alternatives with overlapping lookahead. The generator fills the table cell by cell and notes each cell that receives a second action, then applies declared precedence before counting what is left. Reporting needs the state, token and items involved, since the number alone is of little use.",
    k: ["Fail on any conflict vs apply a default resolution: failing guarantees determinism, while default rules such as prefer shift let generation succeed but hide real ambiguity.", "Count conflicts vs require an expected number: an expected count lets known conflicts pass but breaks, usefully, when a change adds a new one."],
    p: ["A default resolution silently picks the wrong reading and the bug appears only in rarely used syntax.", "Hundreds of conflicts from one root cause bury the one conflict that matters."],
    v: "Generate a parser for a grammar with a known shift-reduce conflict. The report must name the state, token and items, and a declared expected count must make a second added conflict fail the build.",
    dep: ["lalr-lookahead", "first-sets", "follow-sets", "precedence-declarations", "generator-diagnostics"]
  },
  "precedence-declarations": {
    s: "Annotations that rank operators and set left, right or no associativity, which resolve expression conflicts without rewriting the grammar into layered rules.",
    d: "Declarations assign each operator token a level and an associativity. When the automaton has a shift-reduce conflict between a rule and a token, the rule's precedence, usually that of its last terminal, is compared with the token's: higher wins, and on a tie associativity picks shift or reduce, or an error for non-associative. A rule can take an explicit precedence override for cases like unary minus. Top-down tools instead use climbing or layered rules. The danger is that declarations also silence unrelated conflicts.",
    k: ["Declared precedence vs layered grammar rules: declarations are short and easy to extend, while layered rules make the grammar self-explanatory and need no resolution at all.", "Precedence from last terminal vs explicit per rule: the default is concise, while explicit assignment handles rules where the deciding operator is not last."],
    p: ["A precedence declaration resolves a conflict that was an unrelated real ambiguity, and it is never reported again.", "Unary and binary uses of the same token share one level and parse incorrectly."],
    v: "Declare levels for plus, times and unary minus with correct associativity. Parse chained and mixed expressions and compare the trees to the expected nesting, and confirm the generator reports zero conflicts.",
    dep: ["conflict-detection", "grammar-normalization", "precedence-climbing"]
  },
  "regex-parser": {
    s: "Parses the pattern syntax of token definitions into a regular-expression tree, including classes, escapes, repetition bounds and Unicode properties.",
    d: "The pattern grammar covers literals, escapes, character classes with ranges and negation, groups, alternation, the repetition operators and counted repetition. The parser produces a tree whose leaves are character sets, which are kept symbolic rather than expanded into single characters. Counted repetition is expanded or encoded as counters. Case-insensitive matching, escapes for control characters and named classes must be resolved consistently here, because everything downstream sees only sets and operators.",
    k: ["Support a minimal pattern syntax vs a rich one: a minimal syntax is easy to implement and reason about, while a rich one reduces friction for authors but adds features such as lookaround that automata cannot express.", "Expand counted repetition vs encode counters: expansion keeps the result a plain automaton but blows up state counts for large bounds."],
    p: ["A pattern with a large count such as a repeat of thousands produces an automaton with millions of states.", "Escape rules differ from the target language's own, and authors write patterns that mean something else."],
    v: "Parse patterns using each syntax element and print the resulting trees. Invalid patterns such as an unclosed class must report an error position, and a counted repeat must expand to the expected size.",
    dep: ["character-sets", "generator-diagnostics", "source-positions"]
  },
  "char-class-partition": {
    s: "Splits the alphabet into the fewest groups of characters that every pattern treats identically, so tables are indexed by group rather than by code point.",
    d: "Patterns mention ranges and classes. The partition step collects all boundaries, sorts them and merges ranges that appear in exactly the same patterns, so a thousand letters might share one class. The automaton then has one column per class, and a separate small lookup maps each input character to its class. Without this, a Unicode-capable scanner would need a column for every code point. The hard part is computing the partition efficiently when patterns contain large Unicode properties with thousands of ranges.",
    k: ["Partition by equivalence class vs one column per character: classes shrink tables by orders of magnitude, but add a lookup per input character.", "Two-stage lookup table vs binary search of ranges: a two-stage table is fast and larger, while binary search is compact and slower per character."],
    p: ["A case-insensitive pattern over a large Unicode class doubles the range count and slows generation to minutes.", "A character missing from every pattern lacks a class and crashes the scanner on first use."],
    v: "Partition an alphabet with identifier, digit and operator patterns. The class count should equal the number of distinct pattern memberships, and every code point, including those in no pattern, must map to a class.",
    dep: ["character-sets", "regex-parser"]
  },
  "nfa-construction": {
    s: "Builds a nondeterministic automaton for all token patterns together, using the standard fragment-joining construction with empty transitions.",
    d: "Each regular-expression operator maps to a small automaton fragment with one start and one accept state, joined by empty transitions: concatenation chains fragments, alternation forks, repetition loops back. All token patterns are unioned under a single start state, and each accept state is tagged with its token rule and priority. The result is linear in pattern size. Modes produce separate start states. The nondeterminism means it is not directly runnable fast, which is what the next step removes.",
    k: ["Thompson-style fragments vs derivative-based construction: fragment joining is simple and well understood, while derivatives yield smaller deterministic results directly but are harder to implement efficiently.", "One combined automaton vs one per token: one combined automaton finds the longest match across all tokens in one pass, while separate ones are simpler but rescan the input."],
    p: ["Accept states lose their priority tags during merging, and the wrong token wins on a tie.", "Empty-transition cycles from a nullable pattern make closure computation loop forever."],
    v: "Build the NFA for two overlapping patterns and simulate it on sample strings. Each input must reach an accept state tagged with the expected token, and an input matching neither must reach none.",
    dep: ["regex-parser", "char-class-partition", "graph-algorithms"]
  },
  "subset-construction": {
    s: "Converts the nondeterministic automaton into a deterministic one by treating each set of reachable NFA states as a single DFA state.",
    d: "Starting from the closure of the start state, the algorithm computes, for each alphabet class, the set reached by that class and its closure, creating a new DFA state for each distinct set. A DFA state is accepting if it contains an accepting NFA state, and the highest-priority tag among them decides the token. Worst case state count is exponential, and real token sets are usually well-behaved, though counted repetition can trigger the blowup. Sets are represented as bitsets or sorted arrays and hashed to find duplicates.",
    k: ["Eager full construction vs lazy construction at run time: eager construction produces fast, predictable generated code, while lazy construction avoids blowup at the cost of run-time state creation.", "Priority by pattern order vs by explicit rank: order matches author expectations, while ranks allow reorganizing the file without changing behavior."],
    p: ["Patterns with counted repetition produce exponential state growth and exhaust memory during generation.", "State sets are compared by identity and not by contents, so duplicates multiply."],
    v: "Determinize a combined token set, then run both the NFA and DFA on a thousand random strings. Results must be identical, and the DFA must never be in more than one state for a given input prefix.",
    dep: ["nfa-construction", "bitsets", "maximal-munch", "char-class-partition"]
  },
  "dfa-minimization": {
    s: "Merges states of the deterministic automaton that behave identically for all inputs, producing the smallest equivalent automaton.",
    d: "Partition refinement starts with states grouped by their accepting token and splits groups whose members move to different groups on some alphabet class, until nothing splits. Accepting states with different tokens are never merged, since that would change which token is produced. The output is the table the scanner runs, so size here is size in the final program. Minimization is optional, and for very large automata it costs more generation time than it saves.",
    k: ["Minimize always vs on request: always minimizing gives the smallest output, while skipping it for fast builds is acceptable when table size is not critical.", "Refinement by partition vs by reverse construction: partition refinement is well known and fast in practice, while reverse construction can minimize while building, avoiding the large intermediate."],
    p: ["States with different actions are merged and the scanner returns the wrong token kind.", "Error or dead states are merged with live ones, which changes where scanning stops."],
    v: "Minimize an automaton with duplicate identifier-continuation states. The state count should drop, and the minimized and unminimized automata must produce identical tokens on a large random corpus.",
    dep: ["subset-construction", "graph-algorithms", "bitsets"]
  },
  "trailing-context": {
    s: "Lets a token pattern require specific text after it without consuming that text, as in a name followed by a parenthesis, which plain automata cannot express directly.",
    d: "The pattern is written as a body plus a context. The scanner matches both, then rewinds the input to the end of the body, so the context is read again as the start of the next token. When the body has fixed length the rewind is simple. When both parts are variable it can be ambiguous where the body ends, and the generator must record a marker inside the automaton or run a second pass. The feature makes automata larger and complicates the position tracking that error messages rely on.",
    k: ["Support trailing context in the scanner vs push it to the parser: scanner support gives tokens the right kind early, while parser-side handling avoids the complication but needs more lookahead.", "Fixed-length context only vs general: fixed length is easy and fast, while general context handles more languages but needs markers and rewinding that can go quadratic."],
    p: ["Variable-length body and context make the boundary ambiguous, and the scanner splits the text at the wrong place.", "Rewinding the input breaks a streaming reader that cannot seek back."],
    v: "Define a name token that requires an opening parenthesis after it. Scan a call expression: the name token must exclude the parenthesis, which must then appear as the next token with correct position.",
    dep: ["nfa-construction", "token-stream", "maximal-munch", "source-positions"]
  },
  "lexer-tables": {
    s: "The compact arrays that encode the scanner's states, transitions and accepting actions, read by a small driver loop in the generated code.",
    d: "A transition table is indexed by state and character class. Dense arrays are fast, and sparse automata compress through row sharing or default transitions with exceptions. A second table maps accepting states to token kinds and actions. The driver loop reads one character, looks up its class, finds the next state and records the last accept. Table layout decides cache behavior, so it is a major factor in scanning speed. Large Unicode support pushes designers to two-stage class lookups.",
    k: ["Dense table vs compressed table: a dense table is the fastest to index and the largest, while a compressed one saves memory and adds an indirection per character.", "Table-driven scanner vs directly coded states: a table keeps code small and portable, while generated switch code is faster but larger and harder to build in some targets."],
    p: ["Compression assumes a state numbering that a later optimization changes, and every transition lands wrong.", "A table sized for ASCII reads out of bounds on a wider character."],
    v: "Scan a large file at a measured speed using the generated tables, then compare the token stream with an independent reference scanner. Streams must match exactly, with a throughput figure stated alongside.",
    dep: ["dfa-minimization", "char-class-partition", "table-compression", "table-encoding"]
  },
});
