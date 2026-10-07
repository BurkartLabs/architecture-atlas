// Details for the parser generator plate, part 3: top-down, bottom-up and PEG or general parsing strategies.
ATLAS.details("parser-generator", {
  "recursive-descent-generation": {
    s: "Emits one function per rule that decides which alternative to take by looking at upcoming tokens, then calls the functions for the rule's symbols in order.",
    d: "Each nonterminal becomes a function. Alternatives are chosen by a switch on lookahead tokens computed from FIRST and FOLLOW sets, or by deeper prediction when needed. Terminals call a match routine that consumes or reports an error. Repetition becomes a loop. The generated code reads like the grammar, which makes it easy to step through in a debugger and to add custom code at any point. The hard parts are deep recursion on nested input, left recursion, and keeping error handling consistent across hundreds of functions.",
    k: ["Generated functions vs a table-driven predictive parser: functions are fast and debuggable, while a table keeps code size flat and makes grammar-wide changes uniform.", "Call stack as parse stack vs explicit stack: the call stack is simple and fast, while an explicit stack avoids overflow on deep input and allows suspending a parse."],
    p: ["Deeply nested input overflows the call stack and crashes the host program instead of returning an error.", "Hand edits to generated functions are lost on the next generation."],
    v: "Generate a parser for a nested expression grammar and parse input nested ten thousand levels deep. It must either succeed or return a depth-limit error, never crash, and a debugger step through one rule should match the grammar text.",
    dep: ["first-sets", "follow-sets", "left-factoring", "code-templates", "token-stream"]
  },
  "ll1-tables": {
    s: "Builds a table with one entry for each nonterminal and lookahead token, naming the production to use, and rejects grammars where a cell would hold two.",
    d: "For each production, its FIRST set determines the cells it fills, and if it is nullable the FOLLOW set of its rule is added. A cell receiving two productions is a conflict, caused by shared prefixes, left recursion or ambiguity. The runtime is a loop with an explicit stack: pop a symbol, and either match a terminal or look up and push the production's right-hand side. It is compact and has trivial error detection, which is why it appears in small, strict tools. The limit is that one token of lookahead is a very restrictive grammar class.",
    k: ["One-token lookahead vs more: a single token keeps tables tiny and prediction instant, while more lookahead accepts natural grammars without rewrites but grows table size.", "Explicit stack interpreter vs generated functions: an interpreter makes tables the only grammar-specific part, while generated code removes the loop's dispatch cost."],
    p: ["Authors contort their grammar to be LL(1) and the tree no longer reflects the language.", "Error detection is immediate, but the stack holds symbols that are meaningless to report to a user."],
    v: "Build the table for a left-factored expression grammar and parse a corpus, comparing trees with the expected ones. A grammar with a shared prefix must be rejected with the two productions and token named.",
    dep: ["first-sets", "follow-sets", "conflict-detection", "parse-stack", "table-encoding"]
  },
  "llk-lookahead": {
    s: "Predicts alternatives using the next k tokens instead of one, which accepts more grammars without rewriting them.",
    d: "Lookahead sets become sets of token sequences up to length k. Two alternatives are distinguishable if their sequence sets are disjoint. Full sets grow exponentially in k, so practical tools compute them lazily, only for the decisions that fail at k minus one, and use a lookahead tree or automaton per decision. The runtime reads k tokens ahead from the buffer. A grammar can need unbounded lookahead, which fixed k cannot solve, and then a different mechanism is required. Analysis time is the usual limit.",
    k: ["Fixed k globally vs per-decision k: a global bound is simple to explain, while per-decision depth spends analysis only where it is needed.", "Linear-approximate lookahead vs exact sequences: approximations are far cheaper and handle most decisions, but they can declare a conflict that exact analysis would resolve."],
    p: ["Raising k to fix one conflict makes generation take minutes for the whole grammar.", "A decision needing unbounded lookahead appears to work at the chosen k and fails on longer inputs."],
    v: "Use a grammar whose alternatives share a prefix of two tokens. It must be rejected at k of two and accepted at k of three, with every input parsed to the expected tree.",
    dep: ["first-sets", "follow-sets", "token-stream", "conflict-detection"]
  },
  "adaptive-ll": {
    s: "Chooses between alternatives at run time by simulating the automaton of each, as far ahead as needed, caching results so repeated decisions are quick.",
    d: "At each decision the parser runs a lookahead simulation over the grammar's augmented transition network, following all viable alternatives in parallel until only one remains or the input ends. Results are cached in a lookahead automaton built incrementally, so common decisions become table lookups after warm-up. Because simulation sees the actual call context when needed, it accepts any non-left-recursive grammar. Cost is higher on first use and on ambiguous input. It makes the grammar more forgiving, and performance harder to predict.",
    k: ["Run-time analysis with caching vs static analysis only: run-time analysis accepts nearly any grammar, while static analysis gives predictable cost and guarantees but demands rewrites.", "Full context fallback vs stay with approximations: full context is exact, but it is a slow path that grammars can end up on often."],
    p: ["First-use cost makes short-lived processes much slower than the same parser running long.", "Ambiguous inputs trigger worst-case simulation, and a crafted input becomes a denial of service."],
    v: "Parse a large corpus twice in one process. Report the time for the first and second pass and the number of decisions that needed full simulation; the second pass should show almost none.",
    dep: ["llk-lookahead", "predicates", "recursive-descent-generation", "ambiguity-resolution", "parse-stack"]
  },
  "left-recursion-elimination": {
    s: "Rewrites left-recursive rules into equivalent right-recursive or looping form so a top-down parser can handle them, while keeping the intended tree shape.",
    d: "For a rule with left-recursive alternatives and non-recursive ones, the standard rewrite makes the non-recursive part a seed and the recursive tails a loop that extends the result. Indirect recursion is eliminated first by substituting rules into each other in order. The rewritten grammar describes the same language but parses it into a different shape, so left-associative operators come out right-nested unless the actions rebuild the structure. Tools that do this automatically must also fix up the tree.",
    k: ["Automatic rewriting vs authors rewrite by hand: automatic rewriting keeps the grammar natural, while hand rewriting makes the generated structure explicit and avoids surprising tree shapes.", "Loop with accumulator vs right-recursive helper: a loop keeps constant stack and preserves associativity, while recursion keeps the transformation purely grammatical."],
    p: ["The rewritten grammar parses the right language but builds right-nested trees, silently changing the meaning of subtraction.", "Substituting indirect recursion blows up the number of rules."],
    v: "Eliminate left recursion in a subtraction grammar and parse a minus b minus c. The tree must group as a minus b first, and the accepted language must match the original on a large generated corpus.",
    dep: ["left-recursion-analysis", "grammar-normalization", "semantic-actions", "ast-generation"]
  },
  "left-factoring": {
    s: "Extracts common prefixes of alternatives into a shared rule so that the first token alone chooses the path, making a grammar predictive.",
    d: "When two alternatives start with the same symbols, the common prefix is pulled out and the differing tails become a new rule. The transformation is repeated until the prefixes are distinct. It is mechanical, but the new helper rules do not appear in the author's grammar, and tree shape follows the helper structure unless mapped back. Tools may do it for the author or only suggest it. When the shared prefix is long or recursive, factoring can hit a limit and the author needs lookahead instead.",
    k: ["Factor automatically vs suggest to the author: automatic factoring removes busywork, while suggestions leave the grammar as written and the author informed.", "Factor in the grammar vs use more lookahead: factoring keeps one-token prediction and speed, while deeper lookahead keeps the grammar natural at higher analysis cost."],
    p: ["Factored helper rules leak into error messages and tree shapes with invented names.", "Factoring across alternatives that carry different actions merges code that was meant to differ."],
    v: "Factor a grammar with two alternatives that share a three-token prefix. The result must be predictive with one token, accept the same sentences as the original, and produce the same tree as the unfactored version.",
    dep: ["first-sets", "grammar-normalization", "conflict-detection", "labels-and-aliases"]
  },
  "precedence-climbing": {
    s: "Parses operator expressions with a loop and a precedence table instead of one rule per precedence level, avoiding deep recursion for flat expressions.",
    d: "The routine parses an operand, then repeatedly looks at the next operator: if its precedence meets a minimum it consumes it, parses the right side with a minimum chosen by associativity and builds a node. Prefix and postfix operators and ternary forms are added as special cases. In a generator, the expression rules are written as one group with a precedence declaration, and the generated code uses the table. Calls stay shallow, since a chain of many levels costs a function call per level otherwise.",
    k: ["Table-driven climbing vs a layered rule per level: climbing is fast and easy to extend with new operators, while layers keep the grammar fully declarative and analyzable.", "Operators in the grammar vs operators supplied at run time: grammar operators are fixed and checked, while run-time tables support languages whose users define operators."],
    p: ["Mixing prefix and infix uses of one token needs special handling, and a wrong table entry changes parsing silently.", "The table is a separate artifact from the grammar, and the two drift apart."],
    v: "Parse a corpus of mixed-precedence, right-associative and unary expressions and compare the trees with those from a layered grammar. All must be identical, including an expression one hundred operators long.",
    dep: ["precedence-declarations", "recursive-descent-generation", "token-stream"]
  },
  "lr0-item-sets": {
    s: "Builds the automaton of states for a bottom-up parser, where each state is a set of rule positions that could be in progress at that point.",
    d: "An item is a production with a dot marking how much has been seen. A state is a closure: for every item with the dot before a nonterminal, the productions of that nonterminal are added with the dot at the start. Transitions on a symbol move the dot across it to form the next state. States are found by exploring from the augmented start item and are deduplicated by their kernel items. This automaton ignores lookahead, so every reduction applies on any token, which is why the lookahead methods that follow exist.",
    k: ["Item sets by kernel identity vs full closure comparison: kernels are smaller and sufficient to identify states, while full closure is redundant and costs time and memory.", "Build the whole automaton up front vs on demand: up front is simple and shows all conflicts, while on demand saves effort when most states are never used."],
    p: ["Large grammars produce tens of thousands of states, and generation time is dominated by closure computations that are not cached.", "State numbering depends on traversal order and changes between runs unless it is made deterministic."],
    v: "Construct the automaton for a small expression grammar and compare the state count and item lists with a hand-built reference. Two runs must produce identical state numbering.",
    dep: ["grammar-normalization", "graph-algorithms", "bitsets", "symbol-interning"]
  },
  "slr-lookahead": {
    s: "Decides when to reduce using the FOLLOW set of the rule's left side, the simplest lookahead rule for the item-set automaton.",
    d: "A reduction by a rule is allowed on every token in the FOLLOW set of its left-hand nonterminal. This is cheap to compute, since FOLLOW is already known, and it needs no extra state information. It is imprecise, because FOLLOW merges every context in which a rule is used, so it can claim a conflict where a state-specific lookahead would not. SLR is easy to implement and understand, which makes it a good teaching and bootstrapping choice, and it is too weak for many real grammars.",
    k: ["Global FOLLOW vs state-specific lookahead: FOLLOW is trivial to compute and needs no extra storage, while specific lookahead removes spurious conflicts at a modest cost.", "Offer SLR as an option vs go straight to LALR: SLR is simpler to explain and debug, but it makes authors work around conflicts that stronger methods would not report."],
    p: ["Spurious conflicts push authors to rewrite perfectly valid rules to satisfy the weakest method.", "A grammar passes under SLR with a default resolution and later breaks when FOLLOW changes."],
    v: "Generate SLR tables for an assignment grammar known to conflict under SLR and work under LALR. The conflict must be reported with the shared token, and the LALR build of the same grammar must have none.",
    dep: ["lr0-item-sets", "follow-sets", "conflict-detection"]
  },
  "lalr-lookahead": {
    s: "Computes for each reduction the exact tokens that can follow it in that state, with states of the same core merged, giving strong lookahead at a small table size.",
    d: "States with identical item cores are treated as one, and lookahead tokens are propagated across the automaton by following where each item's context flows, using a relation-based method that runs in near-linear time. Each reduction gets the union of lookaheads over all contexts merged into the state. Merging keeps the table as small as the simple method but can introduce reduce-reduce conflicts that full lookahead would avoid. It is the usual choice because most practical grammars fit it.",
    k: ["Merge states with equal cores vs keep contexts apart: merging gives small tables and fast generation, while separate states avoid rare extra conflicts at the cost of larger tables.", "Relation-based propagation vs iterate to a fixed point: relations are fast on large automata, while iteration is simpler to write and check."],
    p: ["A reduce-reduce conflict appears only because two contexts were merged, and the report points at neither of them.", "Lookahead sets are computed on the augmented grammar and include end-of-input where they should not."],
    v: "Generate LALR tables for an expression grammar and for a grammar with a known merge-induced conflict. Compare lookahead sets for each reduction with a reference, and confirm the second build reports exactly the expected conflict.",
    dep: ["lr0-item-sets", "first-sets", "nullable-analysis", "graph-algorithms", "bitsets"]
  },
  "canonical-lr": {
    s: "Builds states that carry their exact lookahead in each item, recognizing the largest class of deterministic bottom-up grammars at the price of many more states.",
    d: "Every item holds the token expected after its rule. Two states with the same core but different lookaheads stay separate, so a reduction is allowed only in contexts where it is valid. This removes conflicts caused by merging, and the table grows, often by one or two orders of magnitude, which is why it is rarely used as is. It is the reference definition against which the cheaper variants are measured, and it is useful as a diagnostic: if a conflict remains here, the grammar is truly not deterministic.",
    k: ["Full LR(1) states vs merged states: full states are the most precise and the largest, while merging yields practical tables and sometimes extra conflicts.", "Use as the production method vs as a diagnostic: production use needs large tables and memory, while diagnostic use on conflicts answers whether the grammar or the method is at fault."],
    p: ["State counts explode and generation exhausts memory on a mid-size grammar.", "Teams assume canonical LR is always available, but it is too large to ship for real languages."],
    v: "Build canonical tables for a grammar where merging causes a conflict. The conflict must disappear, the state count must be reported next to the merged count, and parsing a corpus must give identical trees.",
    dep: ["lr0-item-sets", "first-sets", "pager-merging", "bitsets"]
  },
  "pager-merging": {
    s: "Starts from full LR(1) states and merges only those that cannot create new conflicts, giving the power of canonical tables with sizes near the merged method.",
    d: "States with the same core are considered for merging, and a pair is merged only if the combined lookahead sets would not produce a conflict that neither had alone, using a weak compatibility test. Variants generate the merged automaton directly, avoiding the huge intermediate. Some tools instead split states in the merged automaton only where a conflict appears. The result accepts every grammar that full lookahead accepts, with tables close to the compact method, at the cost of a more complex generator.",
    k: ["Merge by compatibility test vs always merge: the test keeps full power and costs generation complexity, while always merging is simple and sometimes wrong for the grammar.", "Split states on demand vs build full and merge: splitting avoids building the huge automaton, but it needs conflict-driven bookkeeping that is hard to get right."],
    p: ["A subtle bug in the compatibility test merges states that conflict, and the bug appears only on rare grammars.", "Different merge orders give different but equivalent state numberings, breaking byte-for-byte reproducibility."],
    v: "Generate tables with this method and with canonical construction for a set of grammars. Accepted languages and trees must match on a corpus, and the state counts should be close to the merged method's.",
    dep: ["canonical-lr", "lalr-lookahead", "conflict-detection", "bitsets"]
  },
  "glr-parsing": {
    s: "Runs several bottom-up parses at once when the table has a conflict, forking the stack at each choice and discarding branches that fail.",
    d: "Where the table has multiple actions, the parser splits and continues every option. Stacks are kept in a graph-structured stack that shares common prefixes so the cost stays near linear for mostly deterministic grammars. Branches that die on the next tokens are dropped, and branches that reach the same state merge. At the end, one parse remains, or several if the input is ambiguous. It accepts any context-free grammar. Use it where the language is inherently ambiguous and context decides, and expect worse worst-case cost.",
    k: ["Fork on conflict vs require deterministic tables: forking accepts natural grammars and ambiguous languages, while deterministic tables give linear time and a guarantee that one parse exists.", "Defer actions until one parse survives vs run them immediately: deferring is safe, but immediate actions with side effects corrupt state in branches that are later dropped."],
    p: ["Semantic actions with side effects run in branches that are discarded, leaving state corrupted.", "Highly ambiguous input makes the number of live branches explode."],
    v: "Parse a declaration-versus-expression input that the table cannot decide locally. Both branches must start, the wrong one must die at a later token, and a deliberately ambiguous input must report both parses.",
    dep: ["lalr-lookahead", "shared-packed-forest", "parse-stack", "ambiguity-resolution", "conflict-detection"]
  },
  "shared-packed-forest": {
    s: "A compact structure that represents every parse of an ambiguous input by sharing common subtrees and recording the alternative derivations at each shared node.",
    d: "Each node is labeled by a symbol and the span of input it covers. If the same symbol and span can be derived several ways, one node holds a list of packed alternatives, each pointing to children, so subtrees are shared and total size stays cubic at worst. General parsers produce it directly. Consumers walk it to pick one tree by a disambiguation rule, count trees or enumerate them. Making the walk lazy matters, since the number of trees can be exponential even when the forest is small.",
    k: ["Return the forest vs return one resolved tree: the forest preserves every reading for later disambiguation, while one tree is what most consumers want and avoids forest memory.", "Binarized forest vs n-ary nodes: binarizing bounds node arity and keeps size cubic, while n-ary nodes are more readable and need extra care to avoid blowup."],
    p: ["Enumerating all trees from a forest with exponential count never finishes.", "Cyclic derivations create loops in the forest, and a naive walk recurses forever."],
    v: "Parse a short ambiguous input and print the forest. Node count must be smaller than the sum of tree sizes, the number of trees must match a hand count, and selecting one tree by rule must be deterministic.",
    dep: ["glr-parsing", "earley-parsing", "ambiguity-resolution", "node-allocation"]
  },
  "ordered-choice": {
    s: "In a parsing-expression grammar, alternatives are tried in order and the first success wins, so a grammar always has at most one parse and ambiguity cannot arise.",
    d: "Choice commits to the first alternative that matches, even if a later one would let the whole input succeed, and failure backtracks to the choice point. Repetition is greedy and never gives back. Combined with lookahead operators that test without consuming, this gives a deterministic recursive-descent-like semantics and lets one grammar describe both tokens and structure. The cost is that order carries meaning: swapping two alternatives changes the language, and a prefix alternative can shadow a longer one without any warning.",
    k: ["Ordered choice vs unordered choice: ordered choice removes ambiguity and conflicts from the vocabulary, while unordered choice states what the language is and leaves resolution to the tool.", "Greedy repetition vs backtracking repetition: greedy is predictable and fast, but it cannot express some languages that backtracking handles."],
    p: ["A shorter alternative listed first shadows a longer one, and the longer one never matches.", "The grammar silently accepts a different language than the author wrote down, since no conflict report exists."],
    v: "Parse with alternatives listed in both orders on an input where one is a prefix of the other. The results must differ as the semantics predict, and the coverage report must flag the shadowed alternative.",
    dep: ["packrat-memoization", "predicates", "grammar-coverage", "recursive-descent-generation"]
  },
  "packrat-memoization": {
    s: "Stores the result of each rule at each input position so that backtracking never repeats work, giving linear time at the cost of memory proportional to input size.",
    d: "Every attempt of a rule at a position records success with end position and value, or failure. Later attempts at the same place read the table. The table can be an array of rows per position or a hash map keyed by rule and position, and most entries are never reused. Memory is the practical limit: a large file times the number of rules is a lot of cells. Optimizations memoize only rules that are expensive or likely to be retried, and clear entries behind a commit point.",
    k: ["Memoize everything vs selected rules: full memoization gives guaranteed linear time, while selective memoization saves large amounts of memory and loses the guarantee.", "Array per position vs hash map: arrays are fast and large, while hash maps hold only what was used and cost more per access."],
    p: ["Memory grows with input size multiplied by rule count, and a large file exhausts the heap.", "Actions with side effects run once and are skipped on the memoized path, so state differs from expectation."],
    v: "Parse a large input with heavy backtracking with memoization on and off. With it on, time must scale linearly as input doubles, and peak memory must be reported next to it.",
    dep: ["ordered-choice", "node-allocation", "token-stream", "performance-and-memory"]
  },
  "peg-left-recursion": {
    s: "Supports left-recursive rules in a memoizing ordered-choice parser by growing a seed result repeatedly until it stops getting longer.",
    d: "A naive ordered-choice parser loops forever on a left-recursive rule. The fix seeds the memo entry with failure, parses the rule once to get a first result, stores it as the new seed and parses again, repeating while each pass consumes more input. The last good result is kept. Indirect and nested left recursion need extra bookkeeping about which rules are involved in a cycle. The semantics differ subtly from context-free derivation, so some grammars give results that surprise their authors.",
    k: ["Seed-growing support vs forbid left recursion: support keeps natural rules and left-associative trees, while forbidding keeps the algorithm simple and forces rewrites.", "Handle nested cycles fully vs only direct recursion: full handling is general, but complex and a source of subtle bugs."],
    p: ["Mutually recursive rules grow in an order that gives a different tree from the intended one.", "A rule that is left-recursive only through a nullable prefix is missed and loops."],
    v: "Parse chained subtraction with a left-recursive rule and check that grouping is left-associative. A mutually left-recursive pair must either parse correctly or be reported at generation, never hang.",
    dep: ["packrat-memoization", "left-recursion-analysis", "ordered-choice"]
  },
  "scannerless-parsing": {
    s: "Parses characters directly with one grammar that covers both tokens and structure, removing the separate scanner and its token rules.",
    d: "Terminals are characters or character classes, and tokens are ordinary rules. This removes the lexer-parser boundary, so context decides how text is split, and languages with embedded sublanguages or no clean token boundary can be written naturally. Whitespace and comment handling must be written into rules, usually by a convention that inserts optional layout between elements. Longest-match and keyword reservation become grammar-level constraints, such as lookahead assertions. Performance is lower than with a dedicated scanner.",
    k: ["Scannerless vs separate scanner: scannerless handles context-dependent tokens and embedded languages, while a scanner is faster and keeps whitespace and keyword rules out of the grammar.", "Automatic layout insertion vs explicit layout: automatic insertion shortens rules, while explicit layout is exact and clutters every rule."],
    p: ["Keywords and identifiers conflict because no longest-match rule exists, and the grammar needs explicit negative lookahead.", "Layout rules repeated in every rule slow parsing and obscure the grammar."],
    v: "Parse a language with a keyword that is also a valid identifier prefix. Names starting with the keyword must remain identifiers, and a throughput comparison against a scanner-based parser must be reported.",
    dep: ["ordered-choice", "predicates", "earley-parsing", "keyword-handling"]
  },
  "earley-parsing": {
    s: "A chart-based algorithm that accepts any context-free grammar, running in cubic time at worst and linear for most deterministic grammars, without generating tables in advance.",
    d: "For each input position the parser keeps a set of items, each a rule with a dot and the position where it started. Three operations fill the set: predict adds items for expected nonterminals, scan advances over the next token, and complete advances items whose callee has finished. The grammar is used as is, with no analysis, so changes need no regeneration. Nullable rules need care. Memory is proportional to the chart. Pairing it with a forest representation gives all parses.",
    k: ["Chart interpretation vs generated automaton: the chart accepts any grammar immediately and needs no tables, while a generated automaton is much faster per token.", "Build all items vs prune with lookahead: pruning reduces work, while building all items keeps the algorithm simple and complete."],
    p: ["Right-recursive rules make item sets grow with input length and quadratic behavior appears on long lists.", "Nullable rules handled wrongly cause missed completions and rejected valid input."],
    v: "Parse an ambiguous grammar and a left-recursive grammar with it. Both must be accepted without grammar changes, and the number of parses returned for the ambiguous input must equal the hand count.",
    dep: ["shared-packed-forest", "nullable-analysis", "token-stream", "ambiguity-resolution"]
  },
  "gll-parsing": {
    s: "A top-down general algorithm that explores all alternatives using a graph-structured stack and descriptors, handling left recursion and ambiguity with recursive-descent-like generated code.",
    d: "Instead of choosing one alternative, the parser records a descriptor for each pending continuation: where in a rule, which stack node and which input position. A scheduler processes descriptors, skipping any seen before. Stack nodes are shared, so left recursion terminates and ambiguity yields a shared forest. The generated code resembles recursive descent, which keeps it readable and lets the grammar structure show through, and its worst case is cubic. It is less widely implemented than the bottom-up general method.",
    k: ["General top-down vs general bottom-up: top-down code stays close to the grammar and is easier to debug, while bottom-up tools have a longer history and better lookahead.", "Descriptor set for deduplication vs allow repeats: the set guarantees termination and costs memory, while repeats are cheap and can loop."],
    p: ["Descriptor sets for large inputs consume memory comparable to full memoization.", "Semantic actions are hard to place, since parsing proceeds on several paths in interleaved order."],
    v: "Parse a left-recursive and an ambiguous grammar with the generated code. Both must terminate with the right results, and the forest for the ambiguous input must contain the expected number of trees.",
    dep: ["shared-packed-forest", "recursive-descent-generation", "ambiguity-resolution", "parse-stack"]
  },
  "ambiguity-resolution": {
    s: "The rules that pick one tree when a grammar allows several: precedence, priority, preference for longest match or shortest, and filters applied to a forest.",
    d: "Deterministic tools resolve ambiguity at table construction, using precedence and a default of shift. General tools resolve it after parsing, by walking the forest and applying declared priorities, rejecting trees that violate constraints such as keyword reservation, or calling user code to choose. The tool should make each resolution visible, so reports list where a rule fired. The danger is that resolution hides genuine grammar mistakes, and that disambiguation rules interact in order-dependent ways.",
    k: ["Resolve in the tables vs filter the forest: table resolution gives deterministic fast parsers, while forest filters keep the grammar clean and allow context-dependent decisions at the cost of building the forest.", "Silent resolution vs reported resolution: silent resolution keeps output quiet, while reporting lets authors confirm each case is intended."],
    p: ["Two filters give different results depending on application order, and nobody documented the order.", "A default preference such as shift hides a real ambiguity until a rare input exposes it."],
    v: "Parse an ambiguous input under each declared preference. The chosen tree must change as the rule says, and the generator must list each resolution it applied with the rule responsible.",
    dep: ["precedence-declarations", "conflict-detection", "shared-packed-forest", "ambiguity-policy"]
  },
});
