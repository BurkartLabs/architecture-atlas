// Details for the parser generator plate, part 4: the generated parser's runtime, tree building, and error handling.
ATLAS.details("parser-generator", {
  "token-stream": {
    s: "The buffer between scanner and parser that supplies the next token, allows looking ahead and rewinding, and can be fed lazily from the input.",
    d: "The parser asks for the token at an offset from the current position. The stream fills a buffer on demand from the scanner, keeps tokens that backtracking may revisit and releases those behind a commit point. Fixed-lookahead parsers need a small ring buffer, while backtracking or general parsers may need the whole input kept. The stream also filters channels so hidden tokens do not appear. It is the place where a lazily scanned input and a parser that rewinds must agree on positions and state.",
    k: ["Pull tokens lazily vs scan the whole input first: lazy scanning starts fast and bounds memory, while scanning first allows parsing that needs random access and simplifies backtracking.", "Release tokens behind a mark vs keep everything: releasing bounds memory in long inputs, while keeping everything makes rewinding trivial and costs memory."],
    p: ["Lazy scanning with lexer modes means tokens fetched ahead were scanned in the wrong mode when the parser changes it.", "Tokens released too early are needed again after backtracking, and the parser reads garbage."],
    v: "Parse an input with backtracking of known depth using a small buffer. Parsing must succeed, peak buffer size must equal the maximum backtrack distance, and scanning a large file must keep memory flat.",
    dep: ["lexer-tables", "skip-and-channels", "source-positions"]
  },
  "parse-stack": {
    s: "The structure holding parse state: the explicit stack of states and values for bottom-up parsers, or the call chain and its context for top-down ones.",
    d: "A shift-reduce parser pushes a state and a semantic value per symbol and pops one pair per symbol on a reduce. The stack is an array that grows on demand, and its depth tracks nesting of unfinished rules. Predictive table parsers keep a stack of expected symbols. Generalized parsers keep a graph of stack nodes that branches and merges. The stack is the first thing to bound for robustness: an unbounded depth turns hostile input into a crash, and its layout decides cache behavior of the hot loop.",
    k: ["Contiguous array stack vs linked frames: arrays are fast and cache-friendly but must grow, while linked frames allow cheap snapshots for backtracking and cost allocation.", "Unlimited depth vs configured limit: unlimited depth accepts any valid input, while a limit turns pathological nesting into a clean error."],
    p: ["Deeply nested hostile input grows the stack without limit until memory is exhausted.", "Values left on the stack after an error are never released, and they leak in a long-running process."],
    v: "Parse inputs nested to the configured limit and one level beyond. The first must succeed and the second must return a nesting-depth error, with the stack empty and memory returned afterward.",
    dep: ["driver-loop", "node-allocation"]
  },
  "driver-loop": {
    s: "The small generic loop that reads tokens and the tables and performs shift, reduce, accept or error, shared by every grammar.",
    d: "Each iteration looks at the state on top of the stack and the next token, reads an action from the table and acts. A shift pushes the token's value and the new state, a reduce pops the rule's right-hand side, runs the action, then looks up the goto state for the rule's left side and pushes it. Accept ends the parse and error calls recovery. The loop is the hot path, so it avoids allocation and indirect calls. Because it is shared, it is the right place to put tracing, limits and cancellation.",
    k: ["Shared interpreter loop vs code generated per state: a shared loop keeps generated code small and uniform, while generated states are faster and can inline actions.", "Check cancellation and limits inside the loop vs outside: inside gives responsive control and costs a branch per step, while outside is faster but cannot stop a runaway parse."],
    p: ["An error action that does not consume input and does not change state loops forever.", "Extra work added to the loop, such as logging, slows every grammar by a constant factor."],
    v: "Run the loop on a corpus and count shifts and reduces per input token. The ratio must match the grammar's expected value, a malformed input must reach the error action, and a limit must stop a long input within its bound.",
    dep: ["parse-stack", "token-stream", "table-encoding", "default-reductions"]
  },
  "lexer-feedback": {
    s: "Information passed from parser to scanner, or between scanner stages, so that tokens are classified using context, for example whether a name currently denotes a type.",
    d: "Some languages cannot be tokenized without knowing parse state. The parser or its actions update a table of names, and the scanner consults it to emit a different token kind for the same text. The parser can also tell the scanner which tokens it currently accepts, so keywords are recognized only where valid. Both approaches couple the two stages, and lookahead becomes dangerous: a token scanned before the state changed has the wrong kind. Designs minimize the feedback to the narrowest form that works.",
    k: ["Feedback from parser to scanner vs a single ambiguous token resolved in the grammar: feedback keeps the grammar simple and ties scanner to parser state, while grammar-level resolution stays declarative and needs a more powerful parsing strategy.", "Context supplied as accepted-token set vs as a user-maintained table: an accepted-token set is automatic and general, while a table is flexible and entirely the author's responsibility."],
    p: ["A lookahead token is scanned before a declaration updates the name table, and it gets the wrong kind.", "Backtracking restores the parser but not the shared table, leaving state from abandoned parses."],
    v: "Parse a program in which one name is first a variable and later a type. Each use must tokenize correctly, and a backtracked parse must leave the name table exactly as before the attempt.",
    dep: ["token-stream", "predicates", "keyword-handling", "lexer-modes"]
  },
  "source-positions": {
    s: "Tracking where each token and tree node came from in the input, as offsets, lines and columns, so errors, tools and later passes can point to exact text.",
    d: "The scanner records start and end offsets for every token, and a line table maps offsets to line and column on demand. Nodes inherit a span from their first and last children. Choices include byte versus character versus code-unit offsets, how tabs and line endings count, and whether positions survive transformation of the input such as decoding or macro expansion. Compact encodings matter, because storing line and column on every node is costly. Consistency across targets is a common source of off-by-one bugs.",
    k: ["Store offsets and compute lines on demand vs store line and column per token: offsets are compact and exact, while stored lines are quick to read and take more memory.", "Byte offsets vs character offsets: byte offsets are cheap and match the file, while character offsets match what users see in editors."],
    p: ["Offsets count bytes but an editor expects code units, and every error underline is shifted on lines with non-ASCII text.", "Carriage return and line feed pairs are counted as two lines in one place and one in another."],
    v: "Parse a file with multibyte characters, tabs and mixed line endings. The reported line and column for several known tokens must match an editor's cursor position, and spans must be nested within parent spans.",
    dep: ["character-sets"]
  },
  "parser-api": {
    s: "The interface the host program uses: construct a parser, supply input, choose an entry point, set options and receive a tree or errors, with no shared global state.",
    d: "A parser object holds input, options, error listeners and caches, and exposes a method per entry point. Reentrancy means two parsers can run in different threads, or one parser can be invoked from inside an action, without interfering, so no state lives in globals. The API defines how errors are delivered, as exceptions, a list or callbacks, and how the caller cancels or limits a parse. Stability matters: this surface is the one users compile against, and generated code and runtime must keep it compatible.",
    k: ["Errors as list vs callback vs exception: a list is simplest to consume after the fact, callbacks suit streaming and editors, and exceptions suit scripts that treat any error as failure.", "Reusable parser object vs one-shot function: reuse amortizes caches and allocation, while one-shot calls are simple and impossible to misuse."],
    p: ["A static table filled lazily is shared between threads without synchronization, and parses corrupt each other.", "A new runtime version changes the API, and generated code from an older generator fails to compile."],
    v: "Run two parsers on different inputs concurrently, and call a parser from within an action of another. All results must match single-threaded runs and no data race should be reported by a race detector.",
    dep: ["driver-loop", "token-stream", "error-messages", "runtime-library"]
  },
  "semantic-actions": {
    s: "User code attached to rules and run when the parser recognizes them, used to build values, check conditions or update state.",
    d: "Actions are written inline in the grammar or referenced by name. In bottom-up parsers they run on reduction with access to the values of the right-hand side symbols and produce the value for the left side. In top-down parsers they run as the function reaches that point, and can use inherited values passed down. Embedded code makes grammars target-specific and hard to read, so many tools keep actions minimal or move them out. The hard part is order and speculation: actions that run during backtracking or in forked branches execute work that is later discarded.",
    k: ["Actions in the grammar vs separate tree-walking code: inline actions are immediate and compact, while a separate walk keeps grammars target-independent and lets tools reuse the tree.", "Run actions during parsing vs after: running during parsing saves a pass and memory, while deferring is safe under backtracking and ambiguity."],
    p: ["An action with side effects runs during speculation and the effect is not undone when the branch is dropped.", "A grammar full of target-language snippets cannot be shared across targets."],
    v: "Attach an action that counts rule matches and parse an input twice, once with backtracking enabled and once without. Counts must be identical, or the difference must be documented and explained by the speculative attempts.",
    dep: ["predicates", "parse-stack", "labels-and-aliases", "driver-loop"]
  },
  "parse-tree-builder": {
    s: "Builds a generic concrete tree that mirrors the rules exactly, one node per rule application with its children, without any user code in the grammar.",
    d: "The runtime creates a node on each reduction or rule exit, with the rule name, children and span. It keeps every token and rule, including unit rules and punctuation, so the tree can reproduce the input and is useful for formatting and tooling. The cost is size and noise: a chain of rules for expression levels creates deep paths of single-child nodes. Options can drop helper nodes, collapse chains or elide punctuation. Because the tree follows the grammar, any grammar change changes the tree shape and breaks consumers.",
    k: ["Full concrete tree vs pruned tree: full trees are lossless and large, while pruned trees are smaller and drop information that tools such as formatters need.", "Generic nodes vs generated classes: generic nodes need no generation and give weak types, while generated classes give typed access and cost a generation step."],
    p: ["Single-child chains for precedence levels make trees ten times deeper than needed, and traversals slow down.", "Consumers depend on rule names, so renaming a grammar rule breaks code far from the grammar."],
    v: "Parse a file and reconstruct its text by concatenating the tree's leaves in order. The result must match the original exactly including whitespace if trivia is kept, and node counts must be reported.",
    dep: ["driver-loop", "node-allocation", "trivia-attachment", "source-positions"]
  },
  "ast-generation": {
    s: "Produces a simplified, typed tree designed for later analysis, either from annotations in the grammar or from a mapping that drops syntax-only detail.",
    d: "An abstract tree keeps only meaningful structure: operators with operands, declarations with names and bodies, lists as lists, and no punctuation or helper rules. Generators derive node classes from labels in the grammar, with fields for named children and a base type for alternatives, and generate the construction code that runs on reduction. Types come from the labels, so label discipline in the grammar determines the quality of the tree. Keeping locations on nodes lets later passes report errors precisely.",
    k: ["Generate nodes from the grammar vs write them by hand: generation stays consistent with the grammar and gives weaker control, while hand-written nodes can carry methods and invariants.", "One class per alternative vs one per rule with a kind field: per-alternative classes give precise types and many classes, while a kind field is compact and loses static checking."],
    p: ["The generated tree changes with every grammar edit, and consumers break far from the cause.", "Missing labels yield fields named by position, and later passes depend on fragile indices."],
    v: "Generate the tree types for a small language and parse a program. Every node must have the declared fields with the right types, optional children must be null or empty as specified, and every node must carry a span.",
    dep: ["labels-and-aliases", "semantic-actions", "target-backends", "source-positions"]
  },
  "tree-visitors": {
    s: "Generated or library code that walks a tree and dispatches on node type, so analyses and transformations can be written without hand-coding traversal.",
    d: "A visitor interface has a method per node kind, and each node accepts a visitor and calls the matching method. Listeners add enter and exit events with a built-in walker that handles traversal order. Generators produce these from the node types, so adding a rule adds a method. Variants return values, carry a context parameter or allow rewriting. The cost is in evolution: every new node type breaks every visitor unless defaults exist, and deep trees overflow the call stack in a recursive walker.",
    k: ["Visitor with return values vs listener with events: visitors compose naturally for computing values, while listeners are simpler for scanning and need external state.", "Default fallthrough for unknown nodes vs required implementation: defaults keep old visitors compiling, while required methods guarantee every case is handled."],
    p: ["A new node type is added and an old visitor silently skips it through the default, losing an analysis case.", "A recursive walk over a long chain overflows the stack."],
    v: "Walk a tree of a thousand nodes with a visitor that counts each kind. Counts must match the parse, and walking a ten-thousand-deep chain must complete or fail with a clear limit error.",
    dep: ["ast-generation", "parse-tree-builder", "target-backends"]
  },
  "attribute-evaluation": {
    s: "Computing values attached to tree nodes from their children (synthesized) or from context (inherited), driven by equations declared next to the grammar.",
    d: "Each rule can declare equations for attributes of its symbols. The generator checks that every attribute is defined and finds an evaluation order, either during parsing for restricted classes or in a separate pass over the tree. Simple synthesized attributes, such as values of expressions, map onto actions on reduction. Inherited attributes such as expected types flow downward and fit top-down parsers or tree walks. Circular dependencies between attributes must be detected at generation, since they make evaluation impossible.",
    k: ["Evaluate during parsing vs in a separate pass: during parsing is fast and limited to attributes that flow left to right, while a separate pass handles any acyclic dependency.", "Declarative equations vs hand-written actions: equations can be checked for completeness and order, while actions are flexible and unchecked."],
    p: ["An attribute is read before it is computed, and the result is silently a default value.", "Circular attribute definitions are found only on the first input that exercises them."],
    v: "Define a synthesized value attribute and an inherited depth attribute, then parse a nested input. Values must match a reference calculation, and a deliberately circular definition must be rejected at generation with the cycle named.",
    dep: ["semantic-actions", "tree-visitors", "graph-algorithms"]
  },
  "node-allocation": {
    s: "How tree nodes and values are allocated and freed during parsing, using arenas or pools to make creation cheap and to release a whole tree at once.",
    d: "A parse can create millions of small nodes. An arena hands out memory by moving a pointer and frees everything when the parse result is discarded, avoiding per-node bookkeeping. Pools reuse fixed-size nodes. In languages with automatic memory management, the concern shifts to object count and garbage pressure, and compact node layouts help. Nodes that refer to input text can store offsets rather than copies. The hard part is lifetime: values on the stack of a failed or abandoned parse must be cleaned up, and nodes shared in a forest need reference tracking.",
    k: ["Arena per parse vs individual allocation: an arena is fastest and frees at once, while individual allocation lets parts of the tree outlive the rest.", "Copy token text vs reference the input: references save memory and require the input to outlive the tree, while copies are independent."],
    p: ["The input buffer is freed while the tree still refers to it, producing garbage text in later tools.", "Nodes created by a failed branch are never released, and a long-running server grows steadily."],
    v: "Parse a large file one thousand times in a loop. Resident memory must be flat after warm-up, allocation counts per parse must be reported, and freeing the result must return the arena's memory.",
    dep: ["parse-stack", "symbol-interning"]
  },
  "trivia-attachment": {
    s: "Rules for attaching comments and whitespace to nearby nodes so that tools which rewrite code can keep them, even though the grammar ignores them.",
    d: "Tokens skipped by the parser are kept as trivia on a side channel. After parsing, a pass attaches them as leading or trailing items of neighboring tokens or nodes using positional rules: trailing on the same line goes to the previous token, comments on their own lines lead the next. The result lets a formatter or refactoring tool print the tree back with its comments. Every rule is a heuristic, and moving a node moves its comments in ways users may not expect.",
    k: ["Attach to tokens vs attach to nodes: token attachment is lossless and simple to define, while node attachment matches human intent and breaks when tree shape changes.", "Store trivia in the tree vs recompute from input: storing is fast to use and larger, while recomputing from spans keeps trees small and needs the source text."],
    p: ["A comment above a deleted statement is deleted with it, or is left orphaned in the middle of another statement.", "Attachment rules differ between the parser and the formatter, and comments move on every format run."],
    v: "Parse a file with leading, trailing and standalone comments, and print the tree back. The output must reproduce every comment in a position consistent with the documented rules, and stay stable on a second pass.",
    dep: ["skip-and-channels", "source-positions", "parse-tree-builder"]
  },
  "panic-mode-recovery": {
    s: "On an error, discards tokens until one that can safely restart parsing, then continues, so one mistake does not stop all later errors from being reported.",
    d: "The parser enters recovery on a bad token, then skips input until it finds a token in a chosen synchronization set, such as a statement terminator or a closing bracket. For bottom-up parsers it also pops stack entries until a state that can accept that token. After resynchronizing, normal parsing resumes. It is simple, always terminates when it consumes input, and works without grammar knowledge. The cost is poor locality: one error can swallow a large region or lead to a cascade of false follow-on errors.",
    k: ["Skip to a synchronizing token vs try local repair: skipping always makes progress and is cheap, while repairs give better messages and need search.", "Suppress errors until resynchronization vs report all: suppression avoids cascades, but it can hide a real second error inside the skipped text."],
    p: ["A missing closing bracket makes recovery skip the rest of the file, hiding every later error.", "Recovery does not consume input in some state, and the parser loops forever on the same token."],
    v: "Parse a file with three separate errors in different statements. All three must be reported with correct positions, no spurious follow-on errors may appear, and the tree must still contain every correct statement.",
    dep: ["sync-sets", "driver-loop", "parse-stack", "follow-sets"]
  },
  "sync-sets": {
    s: "The sets of tokens at which parsing may safely resume after an error, chosen by rule so that recovery stops at natural boundaries.",
    d: "A basic choice is the FOLLOW set of the rule being parsed, extended with ancestors' sets as recovery unwinds, so the parser can leave the current rule at any token that could legally follow it. Authors can add tokens such as statement keywords or declaration starters to anchor recovery at a sensible place. Sets are computed at generation and embedded in the parser. Dynamic variants compute them from the actual call stack at error time, which gives better resumption but costs time on the error path only.",
    k: ["Static FOLLOW-based sets vs dynamic sets from the call stack: static sets are fast and approximate, while dynamic sets follow the actual context and cost more on errors.", "Grammar-chosen sets vs author-declared anchors: automatic sets need no effort and may stop at odd places, while anchors give good recovery and must be maintained."],
    p: ["Sets are too large and recovery stops at the first plausible token, resuming in the wrong rule.", "Sets are too small and recovery skips far past the problem."],
    v: "Inject a deletion error at each token of a sample file and recover. Most errors should resume within the same statement, and the report should state the average number of tokens skipped per error.",
    dep: ["follow-sets", "panic-mode-recovery", "grammar-normalization"]
  },
  "error-productions": {
    s: "Rules added to the grammar on purpose to match common mistakes, so the parser can recognize them, report a precise message and continue with a sensible tree.",
    d: "An author adds an alternative that matches an incorrect form, such as a missing semicolon or an assignment inside a condition, and attaches an action that records a specific diagnostic. Because it is an ordinary rule, parsing proceeds normally with no special recovery and the tree contains an error node. It produces the best messages for anticipated mistakes. The drawback is that the grammar must be extended with deliberately wrong syntax, which may add conflicts and cannot cover mistakes nobody expected.",
    k: ["Error productions vs generic recovery: error productions give precise messages for known mistakes, while generic recovery covers unknown mistakes with less specific output.", "Keep in the main grammar vs in a separate error mode: the main grammar is simple and mixes valid and invalid syntax, while a separate mode keeps normal parsing clean and costs a second pass."],
    p: ["An error production accepts text that should have been a hard error, and invalid programs reach later stages.", "Added rules create new conflicts in the otherwise clean grammar."],
    v: "Add an error production for a missing closing parenthesis. The parser must report that message at the right position and produce a tree with an error node, and valid programs must parse as before.",
    dep: ["conflict-detection", "error-messages", "semantic-actions"]
  },
  "repair-search": {
    s: "Finds the cheapest sequence of token insertions, deletions or replacements that lets parsing continue, giving more accurate recovery than skipping.",
    d: "At an error, the parser explores candidate edits, such as inserting an expected token, deleting the current one or replacing it, by simulating the parser a few tokens ahead for each. Each edit has a cost, and the search keeps the cheapest that survives a validation window. The winning edit is applied, and the message states what was inserted or removed. With table-driven parsers the simulation runs on a copy of the stack. Time on the error path is bounded by a limit, and on timeout it falls back to simple skipping.",
    k: ["Search for a repair vs skip tokens: repair gives better messages and recovery and costs time and complexity, while skipping always terminates and is cheap.", "Longer validation window vs shorter: a long window avoids repairs that fail soon after, while a short one is fast and accepts repairs that only look good locally."],
    p: ["The search takes seconds on a pathological error and stalls an editor.", "A repair that parses successfully produces a tree for code the author did not write, and later passes act on it."],
    v: "Delete a closing bracket in a sample file. The parser must propose inserting that token with the lowest cost, report it in the message, and finish parsing with a tree matching the original, within a time bound.",
    dep: ["panic-mode-recovery", "parse-stack", "driver-loop", "error-messages"]
  },
  "error-messages": {
    s: "Turns a failed parse into a message with position, what was found and what was expected, in terms the grammar author's users can read.",
    d: "The parser knows the state, the offending token and the set of tokens that would have been accepted, so it can say that something was found where one of several tokens was expected. Raw expected sets are long and mention internal tokens, so messages need names for tokens, collapsing of large sets and customization by state or rule. Some tools allow a mapping from error states to written messages, maintained by example. A good message also names the construct being parsed, not only the token, since users think in constructs.",
    k: ["Generated expected-token lists vs hand-written messages by state: generated lists are free and sometimes unhelpful, while hand-written messages are excellent and need maintenance as the grammar changes.", "Report the furthest failure vs the last one: furthest failure points at the real problem in backtracking parsers, while the last one is easy to compute and often misleading."],
    p: ["Expected lists include dozens of tokens and tell the user nothing.", "Message mappings keyed by state number silently go stale when the grammar changes and states renumber."],
    v: "Feed a set of typical mistakes and compare messages with a written list. Each must cite the right position, name what was found and give a short expected list, and the check must fail when a state's message goes stale.",
    dep: ["source-positions", "follow-sets", "conflict-explainer", "driver-loop"]
  },
  "incremental-reparse": {
    s: "After a small edit, reparses only the affected region and rebuilds the minimum of the tree instead of parsing the whole file again.",
    d: "The previous tree and the edit range are inputs. The scanner restarts at the nearest safe token boundary before the edit and stops once its tokens line up with the old ones again. The parser then starts at the nearest enclosing node that can be reparsed in isolation, and the new subtree replaces the old. Parsers that record the lookahead each node examined can tell exactly which old nodes remain valid. It is needed for editors, where every keystroke triggers a parse, and it requires the tables and tree to carry state information.",
    k: ["Incremental parser with reuse vs fast full parser: reuse scales with edit size and needs bookkeeping in every node, while a fast full parse is simpler and bounded by file size.", "Reparse at node granularity vs token granularity: node granularity is simple and may redo more, while token granularity is precise and complicates state tracking."],
    p: ["Lookahead beyond a node is not recorded, and a node is reused that should have been invalidated by the edit.", "Incremental results differ from a full parse in rare cases and nobody notices without comparing."],
    v: "Apply thousands of random edits to a corpus file. After each, compare the incremental tree to a full reparse; they must be identical, and the time for a single-character edit should be reported against a full parse.",
    dep: ["subtree-reuse", "token-stream", "parse-tree-builder", "source-positions"]
  },
  "subtree-reuse": {
    s: "Keeps unchanged parts of the previous tree in the new one, checking that each reused node would be parsed the same way in its new context.",
    d: "A node can be reused if its text is unchanged, the parser state at its start matches the state it was built in, and the lookahead it examined is unaffected by the edit. Nodes record their start state, span and the furthest token they examined. During reparsing the driver offers old subtrees as single shifts, in place of re-parsing their tokens. Sharing means trees are persistent, and old versions remain valid. Positions are stored relative to parents so that an insertion does not require updating every later node.",
    k: ["Relative positions vs absolute positions: relative positions make an edit cost proportional to the path to the root, while absolute positions are simpler and must be rewritten for everything after the edit.", "Persistent immutable trees vs in-place mutation: immutable trees allow concurrent readers and undo, while mutation uses less memory and complicates readers."],
    p: ["A reused node was built in a different parser state, and it fits the new context only by luck.", "Stale span data in reused nodes shifts diagnostics by the edit length."],
    v: "Edit one statement in a large file. The new tree must share every untouched top-level statement by identity with the old tree, and the count of reused nodes versus rebuilt nodes should be reported.",
    dep: ["incremental-reparse", "lalr-lookahead", "node-allocation", "parse-tree-builder"]
  },
});
