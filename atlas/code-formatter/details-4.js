// Details for the code formatter plate, part 4: layout rules and comments.
ATLAS.details("code-formatter", {
  "statement-layout": {
    s: "The rules that print sequences of statements and blocks: one statement per line, block braces or indentation, and separators between them.",
    d: "A block is a document made of an opening token, an indented sequence of statements separated by hard lines, and a closing token. Each statement's rule returns its own document, so blocks nest naturally. Rules decide details such as whether an empty block prints on one line, whether control keywords share a line with the preceding brace, and how chained clauses attach. Hard lines in blocks propagate breaks upward, which is why a function containing any statement is never flattened into its caller's line.",
    k: ["One statement per line always vs allowing short blocks on a line: always is uniform and long; allowing short forms saves lines and requires a rule about what counts as short.", "Rules per node type vs a generic block printer: per-type rules let each construct be shaped exactly; a generic printer is smaller and less natural."],
    p: ["An empty block rule that differs from the non-empty rule makes adding a statement reformat surrounding lines.", "A missing separator between statements merges them when the source relied on newlines."],
    v: "Format blocks that are empty, contain one statement and contain several, nested three deep; confirm each prints with the expected braces and indentation and that reformatting the result is a no-op.",
    dep: ["line-kinds", "indent-align", "blank-lines", "cst-builder"]
  },
  "binary-chains": {
    s: "Layout of long chains of operators, deciding where to break, how to indent continuation lines and whether operators end or begin lines.",
    d: "An expression such as a long sum or logical condition is a left-nested tree. The rule flattens operators of equal precedence into one group so that the chain breaks together at each operator and continuation lines share a single indent, rather than stair-stepping. Mixed operators form nested groups. The rule also decides whether the operator ends the upper line or starts the next one, and whether parentheses are added around mixed precedence for clarity. Chains inside call arguments or conditions get different indentation.",
    k: ["Operator at line start vs at line end: start makes the operator visible and the continuation obvious; end matches older convention and hides the operator when scanning.", "Flatten the chain vs follow tree shape: flattening gives even lines; following the tree reflects grouping and can create staircase indentation."],
    p: ["Flattening operators that are not associative changes the meaning when parentheses are dropped.", "Breaking inside a short comparison makes tall, hard-to-read conditions."],
    v: "Format a long chain of mixed arithmetic and logical operators at several widths; confirm continuation lines share one indent per precedence level and that the syntax tree equals the original's.",
    dep: ["group-node", "indent-align", "parenthesization"]
  },
  "call-arguments": {
    s: "Layout of function call arguments: all on one line, all broken, or the last argument hugged when it is a function or literal.",
    d: "The rule starts with all arguments in a group. If they do not fit, it considers special cases: when the last argument is a function or an object, it can be printed hugging the opening parenthesis with the other arguments kept on the first line, which avoids pushing everything down one level. Rules check that the earlier arguments are short and simple. If hugging fails, all arguments break one per line, with a trailing separator where allowed. Hugging decisions need a trial layout, so the rule may print an argument two ways and compare.",
    k: ["Hug the last argument vs always break all: hugging keeps callback-heavy code compact and flat; always breaking is consistent and deepens nesting.", "Trial layouts for hugging vs a fixed syntactic test: trials adapt to content and cost extra printing; a fixed test is cheap and misjudges edge cases."],
    p: ["Hugging when earlier arguments are long yields a first line that is much wider than the limit.", "A trial layout that prints a subdocument twice causes exponential cost in nested callbacks."],
    v: "Format calls with a trailing callback, with long plain arguments and with nested callbacks; confirm hugging occurs only when earlier arguments fit on the first line and no line exceeds the width.",
    dep: ["group-node", "conditional-content", "trailing-separators", "break-propagation"]
  },
  "member-chains": {
    s: "Layout of long chains of property accesses and method calls, breaking before each dot only when the chain is long or complex enough.",
    d: "A fluent chain is a nested tree of member and call nodes. The rule flattens it into a head, such as an identifier or short call, and a list of groups of the form dot, name and call arguments. It then counts calls and checks complexity to decide between keeping it on one line, if it fits, and breaking each group onto its own indented line. Short chains and chains with computed heads are treated as ordinary expressions. This rule is a notorious source of heuristics, since readers' preferences depend on semantics the formatter cannot see.",
    k: ["Heuristic threshold on call count vs always break when over width: thresholds give readable fluent code and add magic numbers; width-only is predictable and breaks short chains awkwardly.", "Keep the first call on the head line vs break immediately: keeping reads naturally for short heads; breaking is uniform and wastes vertical space."],
    p: ["A threshold that flips with one more call changes layout drastically for a one-token edit.", "Chains containing comments between links need special handling or the comments are misplaced."],
    v: "Format chains of two, three and eight calls at different widths and confirm short chains stay on one line, long ones break before each dot with one indent, and the output is a fixed point.",
    dep: ["call-arguments", "group-node", "comment-attachment"]
  },
  "collection-literals": {
    s: "Layout of array, object and tuple literals: compact on one line when small, one entry per line when not, with rules for nested content.",
    d: "A literal is an opening token, a separated list of entries in a group and a closing token. The rule decides spacing inside delimiters and trailing separators when broken. Many formatters keep an object expanded if the author put a line break after its first key, since multi-line objects are often used to signal a record, which makes the output depend on input shape. Arrays of numbers may use fill rather than one per line. Nested literals break outer first, giving the familiar shape of data files.",
    k: ["Always collapse when it fits vs respect the author's first break: collapsing is a pure function of the tree; respecting the break keeps intentional layouts and makes output depend on the input text.", "One entry per line vs fill for numeric arrays: one per line yields smaller diffs; fill is compact for tables of numbers."],
    p: ["Collapsing a hand-aligned table destroys readable alignment and annoys its author.", "Respecting the first break means two inputs with identical trees format differently."],
    v: "Format small, large and nested literals, including an object with an authored first-key break; confirm the documented policy and that formatting a collapsed version gives either the same or the documented different output.",
    dep: ["group-node", "fill-node", "trailing-separators", "authored-break-hints"]
  },
  "parenthesization": {
    s: "Decides where parentheses must be kept, added or removed so the printed tree parses back to the same structure.",
    d: "The CST often retains the author's parentheses, while the formatter's rules may normalize them. A function consults operator precedence, associativity and the parent node type to decide whether a child needs parentheses to preserve meaning. Redundant ones may be removed, and clarifying ones added around mixed operators. Some constructs need them only in a position, such as an expression statement starting with a brace that would be read as a block. Errors here are the most dangerous kind, because the output is valid but means something different.",
    k: ["Remove redundant parentheses vs keep what the author wrote: removing gives canonical output; keeping respects clarity intent and leaves variation.", "Central need-parens function vs per-rule checks: central logic is testable in one place; per-rule checks are local and drift out of agreement."],
    p: ["A missing pair around a lower-precedence child silently changes evaluation order.", "A pair added for clarity is removed on the next run by another rule, breaking idempotence."],
    v: "Generate expressions combining every pair of operators in every child position, format them, and confirm the tree after formatting is identical to the tree before, using the equivalence check.",
    dep: ["cst-builder", "equivalence-check", "tree-normalization"]
  },
  "string-normalization": {
    s: "Rewrites string literals to the configured quote style and escape conventions without changing the string's value.",
    d: "The rule chooses the preferred quote character unless that would require more escapes than the other, then re-escapes the content. It must understand the language's escape rules exactly, so the value is the same: some escapes are only meaningful in one quote style and some characters must remain escaped. Prefix characters, raw string forms and template literals are usually left alone. The goal is uniformity with minimal diff, so the rule is a simple function of the text and the preference.",
    k: ["Normalize quotes vs leave as written: normalizing removes a trivial inconsistency from code review; leaving avoids touching literals and keeps the diff on adoption small.", "Prefer fewer escapes vs always the preferred quote: fewer escapes is more readable; always-preferred is simple and clutters text with backslashes."],
    p: ["Unescaping a character that was meaningful in the original changes the runtime value of the string.", "Rewriting raw or template strings changes their content, since escape semantics differ."],
    v: "Format a set of strings containing both quote types, escapes and unicode sequences; evaluate each literal before and after with the language's own parser and confirm identical values.",
    dep: ["tokenizer", "equivalence-check"]
  },
  "number-normalization": {
    s: "Rewrites numeric and similar literals to a canonical spelling, such as lowercase prefixes and exponents and no redundant zeros, without changing the value.",
    d: "Numeric literals have many equivalent spellings: case of hex digits and exponent letters, leading and trailing zeros, redundant plus signs and digit separators. The rule picks a canonical form by lowercasing prefixes and exponents, removing trailing zeros after a decimal point and adding a leading zero where missing. It must preserve exact value and, in some languages, type: a suffix or a decimal point can turn an integer into a float. Applying it to every literal costs a scan, so it works on tokens, not on trees.",
    k: ["Canonical spelling vs leave literals untouched: canonical form gives uniform code and a small set of rules; untouched avoids any chance of changing value or intent, such as aligned hex columns.", "Lowercase vs uppercase digits and prefixes: either is a convention that must be fixed once; neither affects meaning."],
    p: ["Removing trailing zeros changes the type of a literal in a language that distinguishes integer and floating forms.", "Case-changing hex digits in a table breaks column alignment that readers relied on."],
    v: "Format a list of literals in all spellings and confirm that parsing each before and after yields the same value and type, and that output spelling is the canonical one in all cases.",
    dep: ["tokenizer", "equivalence-check"]
  },
  "trailing-separators": {
    s: "Rules for the comma or semicolon after the last element of a list or statement, usually added only when the list is broken across lines.",
    d: "A trailing separator after the last element lets a new line be added or removed with a one-line diff. The rule is a conditional document: print it when the enclosing group is broken, nothing when flat. Some grammars forbid it in places, such as after a rest element, so each list rule declares whether it is allowed. Statement terminators are a sibling decision: either always printed or added only where needed to prevent a line from joining the next, and the formatter must know the grammar's rule for when omission is safe.",
    k: ["Trailing separator when broken vs never: when broken yields smaller diffs and cleaner version history; never matches older style and makes appending an element touch two lines.", "Always print statement terminators vs omit where legal: always is safe and noisy; omitting is lighter and needs guards where a line could merge with the next."],
    p: ["A trailing separator in a position the grammar forbids produces code that no longer parses.", "Omitting a terminator before a line starting with a bracket makes two statements into a call."],
    v: "Format lists that fit and do not fit, and statements preceding lines that begin with a bracket or parenthesis; confirm separators appear only as specified and the output parses to the same tree.",
    dep: ["conditional-content", "equivalence-check"]
  },
  "import-ordering": {
    s: "Optionally sorts and groups import or include declarations and the names within them into a deterministic order.",
    d: "The rule extracts a contiguous run of import statements, sorts them by a documented key such as module path, orders the names inside braces and may group by origin with blank lines between groups. Because import order can affect behavior through side effects, it is limited to cases where order is irrelevant or it is an opt-in feature. Comments attached to an import move with it. Many formatters leave this to a separate tool, to keep formatting a pure layout change and avoid semantic risk.",
    k: ["Sort in the formatter vs a separate organizer: in the formatter gives one tool and one pass; separate keeps layout free of semantic reordering and costs another run.", "Sort only names inside braces vs whole statements: names are safe and limited; statements give full tidiness and can change load-time side effects."],
    p: ["Reordering imports that have side effects changes program behavior at startup.", "Comments left behind when a statement moves end up attached to the wrong import."],
    v: "Sort a file's imports with attached comments and a side-effect import; confirm comments travel with their statements, side-effect imports stay in place, and a second run produces identical output.",
    dep: ["comment-attachment", "statement-layout", "equivalence-check"]
  },
  "blank-lines": {
    s: "Decides how many blank lines survive between statements, usually keeping at most one of the author's blank lines and inserting some at fixed points.",
    d: "Blank lines are not part of the grammar, so the CST records them as trivia count between nodes. The rule preserves the presence of a blank line, caps runs at one, removes leading and trailing blanks inside blocks and may insert one around certain declarations. Preserved blank lines are a rare case of the output depending on input whitespace, deliberately allowed because authors use them to group related statements and no tool could infer that. Rules must also deal with blank lines adjacent to comments.",
    k: ["Preserve up to one blank line vs fully canonical spacing: preserving respects authors' grouping; canonical gives uniform code and removes meaning authors added.", "Insert blank lines around declarations vs only preserve: inserting standardizes structure and rewrites more code; only preserving is minimal and leaves inconsistency."],
    p: ["A blank line between a comment and its statement is moved or removed, separating them in meaning.", "Counting blank lines with trailing whitespace as nonblank loses the author's grouping."],
    v: "Format code with runs of zero, one and three blank lines, whitespace-only lines and leading blanks in blocks; confirm runs cap at one, edge blanks are removed, and idempotence holds.",
    dep: ["trivia-capture", "statement-layout"]
  },
  "authored-break-hints": {
    s: "The few places where the author's own line breaks are honored, so the formatter's output depends slightly on how the input was written.",
    d: "A formatter that ignores all input layout would be a pure function of the tree, but some constructs carry intent that is not in the tree: an object written with a break after its opening brace, a chain written one call per line, a blank line between statements. The rule reads the original positions and records a flag on the node, which the layout rule reads. This keeps authors in control for these constructs and adds a rule for each, which weakens the guarantee that all equal trees format equally.",
    k: ["Honor input layout for selected constructs vs ignore all input layout: honoring respects intent and costs canonical output; ignoring is simple to explain and annoys people who care about shape.", "Flag once at parse time vs recompute at print time: flagging keeps the printer free of source text; recomputing needs the original text at every rule."],
    p: ["Two inputs with the same tree format differently, which confuses people who expect a pure function.", "A hint that survives into output but is lost by another edit makes layout flip unexpectedly."],
    v: "Format an object with and without a break after the opening brace and confirm the policy: expanded input stays expanded, collapsed input collapses if it fits, and each output is stable under a second run.",
    dep: ["source-positions", "cst-builder", "collection-literals"]
  },
  "trivia-capture": {
    s: "Records comments and whitespace that the grammar ignores, keeping them with their exact text and positions so none are lost.",
    d: "The tokenizer produces trivia alongside each token: leading comments and newlines before it, and trailing comments on the same line. Some designs hang trivia off tokens in the tree, others collect comments into a separate list with ranges. Each comment records its kind, text, start and end, whether it is on its own line and the number of blank lines around it. This is what makes a formatter different from a compiler front end, which discards it. Memory cost is small, and correctness cost is large.",
    k: ["Trivia attached to tokens vs a separate comment list: attached trivia moves with tokens naturally; a separate list keeps the tree clean and requires an attachment step.", "Keep exact whitespace vs normalized flags: exact text allows faithful reproduction of unusual forms; flags are small and lose detail."],
    p: ["A comment inside a token sequence the parser skips, such as between a keyword and its operand, disappears.", "Comments in unusual places are collected but never printed, which is silent deletion."],
    v: "Format a corpus and confirm that the multiset of comments in the output equals that of the input, character for character, and that no comment text was altered except where reflow was documented.",
    dep: ["tokenizer", "source-positions"]
  },
  "comment-attachment": {
    s: "Assigns each comment to a syntax node as leading, trailing or dangling, so the comment moves with the code it describes.",
    d: "After parsing, each comment is matched to the node that encloses it, the node that precedes it and the node that follows it. A comment on its own line usually leads the following node, a comment at the end of a line trails the preceding one, and a comment inside an empty construct dangles from the enclosing node. Heuristics, usually layered as placement handlers, override the default for known awkward shapes. The printer then prints leading comments before the node's document and trailing ones after it.",
    k: ["Attach by position heuristics vs keep comments at their original offsets: attachment lets comments follow reflowed code; offsets keep text in place and cannot survive line changes.", "Attach to the outermost vs the innermost node: outermost keeps comments with statements; innermost is precise and can move comments into expressions."],
    p: ["A comment attached to the wrong node is printed far from the code it describes after reflow.", "A comment attached to a node that is deleted or normalized away is dropped."],
    v: "Format files with comments before statements, at ends of lines, between arguments and in empty blocks; confirm each comment appears next to the same code as in the input and none are missing.",
    dep: ["candidate-search", "placement-handlers", "dangling-comments", "trivia-capture"]
  },
  "candidate-search": {
    s: "For each comment, finds the enclosing, preceding and following nodes by descending the tree using source positions.",
    d: "Starting at the root, the search descends into the child whose range contains the comment. At each level it records the sibling before and the sibling after the comment's position. When no child contains the comment, the last enclosing node, preceding sibling and following sibling are the candidates. The search relies on accurate ranges for every node, including punctuation, and uses binary search over the children for speed, since files may have thousands of comments. Child enumeration order must be source order.",
    k: ["Tree descent per comment vs one merged walk over comments and nodes: descent is simple and costs logarithmic time per comment; a merged walk is linear and harder to write correctly.", "Ranges that include trivia vs exclude it: excluding keeps comments outside nodes and requires careful edge rules; including makes comments inside nodes ambiguous."],
    p: ["Child ranges out of source order, from a rule that reorders children, cause comments to be attached to the wrong neighbor.", "Quadratic search time on files with many comments and flat sequences."],
    v: "Run the search on constructed trees with comments between every pair of siblings and confirm each result names the expected enclosing, preceding and following nodes, then time it on a file with ten thousand comments.",
    dep: ["source-positions", "cst-builder"]
  },
  "placement-handlers": {
    s: "A chain of special-case rules that override default comment attachment for constructs where position alone gives the wrong owner.",
    d: "Each handler examines the comment, its three candidates and the surrounding context and may claim the comment, assigning it a specific node and role. Typical cases are comments between an if body and else, after a function's parameters, inside an empty argument list, or before a closing brace. Handlers are ordered; the first to claim wins, and unclaimed comments fall back to the default rule. The list grows with every reported bug, so each handler needs a test, and a clear invariant, that no comment is claimed twice.",
    k: ["Ordered handler chain vs a table of constructs: a chain is flexible and order-sensitive; a table is easy to audit and cannot express contextual cases.", "Fix in handlers vs change the tree shape: handlers keep the tree general; changing the tree can remove the special cases and complicates other consumers."],
    p: ["A new handler placed early captures comments intended for a later one and silently changes outputs elsewhere.", "A handler that is never exercised by tests rots as the tree changes."],
    v: "Run a table of awkward comment positions through attachment and confirm each lands at its documented node and role; then print and confirm the comment appears in the expected line of output.",
    dep: ["candidate-search", "cst-builder"]
  },
  "dangling-comments": {
    s: "Handles comments that belong to a construct with no child to attach to, such as an empty block, empty argument list or empty object.",
    d: "When the enclosing node has no preceding or following node, a comment is stored as dangling on the enclosing node. Its rule prints dangling comments inside the empty delimiters, forcing the construct to break since a line comment cannot share a line with the closing token. Different node types decide indentation and placement. These cases are rare and easy to lose, since a rule that never mentions dangling comments will quietly drop them, which is why a global check that every captured comment was printed matters.",
    k: ["Print dangling comments inside the empty construct vs move them outside: inside keeps the author's intent and forces a break; outside is tidier and changes what the comment appears to describe.", "A global printed-comments check vs trusting each rule: a global check catches lost comments for every rule; trusting needs every rule author to remember."],
    p: ["A rule that omits dangling comments deletes them silently, and users only notice later.", "A dangling line comment printed before the closing token on the same line comments out the delimiter."],
    v: "Format empty blocks, calls and objects each containing only a comment, line and block; confirm each comment survives inside its construct and the output parses to the same tree.",
    dep: ["comment-attachment", "comment-printing"]
  },
  "comment-printing": {
    s: "Turns attached comments into document pieces: leading comments before a node, trailing ones after it, with line breaks matching their kind.",
    d: "A line comment forces a hard break after it. A block comment may sit on the same line or take its own line, depending on whether it was on its own line in the source. Leading comments print before the node, followed by a space or newline, and keep one blank line between the comment and the node if the author had one. Trailing line comments use a line suffix so later tokens come before them. The printer marks each comment as printed, so the final check can ensure none were lost.",
    k: ["Preserve whether the comment was on its own line vs always standardize: preserving keeps the author's shape; standardizing is uniform and moves comments.", "Mark comments printed at print time vs trust the tree: marking supports a global loss check; trusting is lighter and silently loses comments on bugs."],
    p: ["A trailing comment printed in place pushes the line over the width and breaks the surrounding group needlessly.", "Spacing between a comment and its node varies between rules and breaks idempotence."],
    v: "Format code with every comment kind in leading and trailing positions; confirm no comment is lost, line comments end their lines, and the printed-comments check reports zero unprinted comments.",
    dep: ["line-suffix", "comment-attachment", "line-kinds"]
  },
  "block-comment-reflow": {
    s: "Decides how multi-line comments are re-indented and whether their internal text is touched, usually only shifting leading whitespace consistently.",
    d: "A block comment spanning several lines contains its own indentation. When the surrounding code is re-indented, the comment's lines need to move too. If each continuation line starts with a decoration character, the comment is treated as aligned and re-indented; otherwise the lines are kept as written, shifted by the change in indentation of the first line. The formatter does not rewrap prose, since comment text may be a table, code or documentation tags whose layout matters.",
    k: ["Shift by the same delta vs re-indent line by line: a uniform shift preserves the internal shape of the text; per-line re-indent keeps decorated comments tidy and can ruin pasted code.", "Rewrap prose vs leave text alone: rewrapping normalizes lines and mangles tables and examples; leaving is safe and allows long lines."],
    p: ["Re-indenting a block comment shifts documentation tags or examples so a tool that reads them parses them incorrectly.", "Tabs inside comments shift differently from spaces and leave a ragged edge."],
    v: "Format a function whose body is re-indented, containing decorated and plain multi-line comments; confirm the decorated ones stay aligned under their opening mark and plain ones keep relative indentation.",
    dep: ["comment-printing", "indent-style"]
  },
  "ignore-directives": {
    s: "Special comments that tell the formatter to leave the next node, or a region, exactly as written.",
    d: "An ignore comment before a node causes the printer to emit the node's original source text, verbatim, instead of the layout document. Region variants use start and end markers. This gives authors an escape hatch for hand-aligned tables and similar constructs. The verbatim text must still be indented to the surrounding level, and trailing whitespace trimming must not touch it. The mechanism has to respect the rest of the pipeline, so the node still takes part in comment attachment, and its range must be accurate.",
    k: ["Verbatim original text vs formatting with relaxed rules: verbatim is predictable and fully respects the author; relaxed rules are a new option and a new maintenance burden.", "Node-level and region-level directives vs node-level only: regions are convenient for tables and can cut across nodes, which is hard to define."],
    p: ["An ignored region that cuts through a node produces invalid text or is silently expanded to the node.", "Heavy use of ignore comments hides the formatter's own bugs from the team."],
    v: "Mark a hand-aligned table with an ignore comment, format the file, and confirm the table's bytes are unchanged apart from base indentation, and that the surrounding code is formatted.",
    dep: ["comment-attachment", "source-positions", "trivia-capture"]
  },
  "pragma-lines": {
    s: "Handles the first line of a file and special header comments, such as an interpreter line, encoding declaration or license block, which must not be moved or changed.",
    d: "Some first lines are read by the operating system or the language runtime, so they must stay the first line, unmodified, without leading blank lines or indentation. License headers and pragma comments also carry meaning to other tools. The parser recognizes the interpreter line as a special token, and the printer emits it verbatim before everything else. Some tools also use pragmas in the header to opt files in or out of formatting, so the formatter reads them before parsing the rest.",
    k: ["Treat as verbatim special tokens vs as ordinary comments: verbatim guarantees the line is untouched; ordinary comments risk moving it and need correct placement rules.", "Opt-in or opt-out pragma support vs none: pragmas allow gradual adoption of the tool in legacy code and add another way for files to diverge."],
    p: ["An interpreter line preceded by a blank line stops working, and scripts fail to launch.", "A BOM before the interpreter line is retained or dropped inconsistently across platforms."],
    v: "Format a script with an interpreter line, a license block and a pragma comment; confirm the first line is byte-identical and still the first line, and that the script runs the same.",
    dep: ["trivia-capture", "source-reader", "comment-printing"]
  }
});
