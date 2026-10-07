// Details for the code formatter plate, part 5: parsing, verification, text and cross-cutting concerns.
ATLAS.details("code-formatter", {
  "tokenizer": {
    s: "Splits source text into tokens with exact ranges, retaining trivia, and without discarding anything a faithful reprint would need.",
    d: "The tokenizer scans characters and emits tokens: identifiers, keywords, literals, punctuation. Unlike a compiler's scanner, it keeps the raw text of each literal, because normalization rules need the original spelling, and it records comments and newline counts as trivia. It must be fast, usually a hand-written state machine over bytes. Some constructs make it hard: nested comments, raw strings with custom delimiters, templates with embedded expressions and numbers with separators all need modes or a stack.",
    k: ["Hand-written scanner vs generated lexer: hand-written is faster and handles odd modes; generated is shorter to write and harder to adapt for trivia and recovery.", "Keep raw text for literals vs decoded values: raw text lets rules normalize without losing information; decoded values are convenient and cannot reproduce the original."],
    p: ["A nested construct mismatch, such as an unterminated string, consumes the rest of the file as one token.", "Decoding a literal and printing it back changes escapes the author wrote."],
    v: "Tokenize a corpus and concatenate the raw text of all tokens and trivia; confirm the result equals the input file byte for byte, and that every token's range slices out exactly its text.",
    dep: ["source-reader", "source-positions", "context-lexing"]
  },
  "context-lexing": {
    s: "Resolves tokens whose meaning depends on the parser state, such as slash as division or the start of a regular expression, or template continuation.",
    d: "Some grammars cannot be tokenized without knowing the syntactic context. The parser tells the tokenizer what it expects, or the tokenizer tracks a few bits such as the previous significant token and bracket stack. Generics versus comparison operators and the end of a template segment are similar cases. It is hard because lookahead can require re-scanning, so the tokenizer must support rewinding to a saved position and re-lexing in a different mode, without leaking trivia or duplicate comments.",
    k: ["Parser-driven re-lexing vs heuristics in the lexer: parser-driven is exact and couples the stages; heuristics are independent and mislabel odd inputs.", "Rewind and re-scan vs speculative tokens in both forms: rewinding is simple and costs time on rare cases; speculation is fast and complicates the token buffer."],
    p: ["A misclassified slash turns a rest of a line of code into a regular expression and everything breaks.", "Re-lexing after a rewind records the same comment twice, so it prints twice."],
    v: "Tokenize snippets where the same character is an operator in one context and a literal start in another; confirm each is labeled according to the grammar and that comments are recorded once after rewinds.",
    dep: ["tokenizer", "parser"]
  },
  "parser": {
    s: "Builds the syntax tree from tokens by the language's grammar, aiming at fidelity to the source over speed or compact representation.",
    d: "Most formatters use a hand-written recursive descent parser with precedence climbing for expressions, since it gives control over error recovery and node shapes. It must follow the language's real grammar precisely, including the contextual and ambiguous cases, otherwise valid code is rejected. It builds nodes with children in source order and ranges covering every token, with parentheses and punctuation kept. Keeping up with new language syntax is the continuing cost: a parser that lags the language makes the formatter unusable on new code.",
    k: ["Hand-written recursive descent vs generated parser: hand-written gives recovery and error messages and takes effort; generated is quick to produce and awkward to tune for fidelity.", "Reuse the compiler's parser vs a dedicated one: reuse tracks the language exactly and drops comments and layout details; dedicated keeps all details and must follow syntax changes."],
    p: ["A parser that lags the language rejects valid new syntax, and the whole file is unformatted.", "A grammar corner handled differently from the compiler formats code that the compiler later rejects or reads differently."],
    v: "Parse the language's official conformance examples and a large real corpus; confirm every valid input produces a tree and every invalid input an error with the same position the reference compiler reports.",
    dep: ["tokenizer", "cst-builder", "grammar-module", "error-recovery"]
  },
  "cst-builder": {
    s: "Constructs the concrete syntax tree, in which every token and its trivia is present, so the original text can be reproduced and rules can inspect the author's choices.",
    d: "Unlike an abstract tree, the concrete tree keeps punctuation, parentheses, keywords and trivia, so printing it with no layout rules would reproduce the file. Nodes carry kind, children in order and range. Formatters either work directly on this tree or build a lighter abstract tree with references back to tokens. Representation matters for speed: compact node layouts in contiguous storage and typed accessors help on large files. Wrong or missing children for rare constructs are the main source of formatter bugs.",
    k: ["Concrete tree for rules vs abstract tree with links back: concrete exposes everything and is verbose; abstract is easier to write rules over and loses detail unless links are kept.", "Generic node type vs typed nodes per construct: generic is small and flexible; typed is safer and needs more code per construct."],
    p: ["A node type that omits an optional token, such as a trailing separator, makes rules unable to preserve it.", "Rules that reach into children by position fail when the grammar adds an optional child."],
    v: "Print the tree with every token and trivia in order and no layout rules; confirm that the result equals the original source byte for byte for every file in the corpus.",
    dep: ["parser", "source-positions", "arena-storage", "trivia-capture"]
  },
  "error-recovery": {
    s: "How the parser behaves on invalid input: stop with a precise error, or continue and produce a partial tree so editors can still format around the problem.",
    d: "In batch mode, the usual policy is to refuse to format a file with a syntax error and report the position, since formatting broken code could make it worse. In editors, input is often mid-edit, so the parser may synchronize at statement or bracket boundaries and mark error nodes holding the raw text. Formatting then proceeds around error nodes, leaving them verbatim. This needs careful limits: a tree with errors must never be written back as if it were fully understood.",
    k: ["Refuse invalid files vs format around errors: refusing is safe and unhelpful during editing; formatting around errors helps editors and risks changing code the parser misread.", "Error nodes printed verbatim vs dropped: verbatim never loses text; dropping gives a clean tree and destroys what the user typed."],
    p: ["A recovered tree is formatted and written, and the misparsed region is silently rewritten wrongly.", "An unbalanced bracket makes recovery swallow the rest of the file into one error node."],
    v: "Feed files with a missing bracket, a stray token and an unterminated string; confirm batch mode reports the position and writes nothing, and editor mode keeps the error region verbatim.",
    dep: ["parser", "source-positions"]
  },
  "source-positions": {
    s: "The start and end offsets recorded for every token and node, from which line, column and node ranges are derived.",
    d: "Positions are stored as byte or code unit offsets, because they are compact and cheap. Rules and tools convert them to lines and columns through the line index. Positions are needed everywhere: comment attachment, range expansion, ignore directives, error messages, cursor tracking and the check that blank lines exist between nodes. The choice of unit matters to editor integration: some protocols count UTF-16 code units, others count bytes or code points, and mismatches create edits that land in the wrong place after non-ASCII text.",
    k: ["Offsets in bytes vs in code units of the editor protocol: bytes are natural for the reader; protocol units avoid conversion on every edit and tie the tree to the protocol.", "Store offsets only vs store lines and columns too: offsets are small and need a map; storing both is quick for messages and bloats the tree."],
    p: ["Mixing byte and character offsets places edits off by several characters after any non-ASCII character.", "Positions not updated after tree normalization point to text that moved."],
    v: "On a file full of non-ASCII text, convert every node's range to line and column and back, then slice the original text; confirm the slice equals the node's printed source and matches the editor's reported position.",
    dep: ["line-index"]
  },
  "tree-normalization": {
    s: "Passes that adjust the tree before layout, such as removing redundant wrappers or rewriting equivalent forms into one canonical shape.",
    d: "Some rules are far simpler if the tree is first put into a canonical form: parenthesized expressions unwrapped, adjacent string pieces merged, optional wrappers made explicit, chains of the same binary operator flattened. Normalization runs between parsing and printing and must keep ranges valid, so comments and ignore directives still find their nodes. Every rewrite must preserve meaning, which makes the pass a candidate for the equivalence check. Rewrites that drop text, such as a redundant parenthesis, must not drop attached comments.",
    k: ["Normalize the tree first vs handle variants in each rule: normalizing writes each fix once and risks invalidating positions; per-rule handling is local and duplicated.", "Normalize in place vs build a new tree: in place is quick and loses the original shape for later stages; a new tree preserves it and costs memory."],
    p: ["Removing a wrapper node drops comments attached to it.", "A rewrite that changes a node's range makes the comment search misplace comments."],
    v: "Run normalization on a corpus and confirm the syntax equivalence check passes, the comment count is unchanged and every remaining node's range lies inside its parent's.",
    dep: ["cst-builder", "source-positions", "comment-attachment"]
  },
  "grammar-module": {
    s: "A self-contained package for one language: its tokenizer rules, parser, node kinds, layout rules and options, registered with the driver.",
    d: "Each language is a module exposing a parse function, a function that turns a node into a document, the list of node kinds, option defaults and file-matching rules. The core knows nothing about specific syntax. The boundary lets one engine, with one printer and one comment system, format many languages. Modules share a document builder API but not trees. Embedded-language support requires the module to expose a function for formatting a fragment given external width and indent, and how to find embedded regions.",
    k: ["Shared engine plus per-language modules vs separate formatter per language: sharing reuses the printer and comment logic; separate tools are free to specialize and duplicate the hard parts.", "Language rules in modules vs a declarative table: code can express any layout; a table is easier to audit and cannot express contextual rules."],
    p: ["A module that bypasses the shared comment system loses comments in ways other languages do not.", "Divergent option meanings across modules confuse users with mixed-language projects."],
    v: "Register a second language module with the same engine and confirm that parse, print, comment placement and range formatting all run through the shared code and pass the same idempotence check.",
    dep: ["parser", "doc-builder-api"]
  },
  "idempotence-check": {
    s: "Verifies that formatting already formatted code changes nothing, by running the formatter twice and comparing the outputs.",
    d: "Idempotence is the core promise: output is a fixed point. The check formats the input, formats the result and requires the two to be identical, and failures are reported with both versions. It runs in tests over a large corpus and optionally in production as a self-check that refuses to write unstable output. Failures typically come from rules that depend on input shape that the first pass changed: comment placement, authored hints, or a trailing separator rule that disagrees with a width rule.",
    k: ["Check at runtime vs in tests only: runtime checking protects users and doubles the work; tests alone are free in production and miss inputs they did not cover.", "Treat violations as bugs vs accept known exceptions: strict treatment keeps the guarantee; exceptions are pragmatic and erode trust in the check."],
    p: ["A formatter that is not idempotent makes CI check fail right after the formatter's own run.", "The corpus lacks the odd construct, so the violation first shows up in a user's repository."],
    v: "Run the formatter twice over the entire test corpus plus randomly generated programs and confirm byte-identical output in every case; any difference prints both versions and the file path.",
    dep: ["printer-loop", "corpus-fuzzing"]
  },
  "equivalence-check": {
    s: "Verifies that the formatted code parses to the same syntax tree as the input, ignoring positions and trivia, so formatting cannot change meaning.",
    d: "After formatting, the tool parses the output, strips positions, comments and parentheses, and compares the two trees node by node. A mismatch means the formatter altered the program, and the write is refused. The check catches missing parentheses, mangled strings and dropped tokens. It costs a second parse, so it is on by default in tests, optional in editors and sometimes enabled in adoption runs. Comments are compared separately as a multiset, since they are not part of the tree.",
    k: ["Compare trees vs compare compiled output: trees are fast and language-level; compiled output catches more semantic differences and needs a full toolchain.", "Always on vs only in tests and adoption: always on is safest and slows everyday use; limited is fast and trusts rules."],
    p: ["A comparison that ignores too much, such as the string raw text, hides a real change.", "A comparison that ignores too little rejects harmless changes such as removed redundant parentheses."],
    v: "Seed a deliberate bug that drops one pair of parentheses, run the check, and confirm it refuses to write and names the node; with the bug removed, confirm every corpus file passes.",
    dep: ["parser", "tree-normalization"]
  },
  "golden-snapshots": {
    s: "Test fixtures pairing each input with its expected formatted output, so any change in output is visible as a diff in review.",
    d: "Each case is a small input and a stored snapshot of the result, grouped by construct and by option settings. A test runs the formatter and compares with the snapshot, and an update command rewrites snapshots when a change is intended. Reviewers read snapshot diffs as the real effect of a rule change. Good suites include weird cases found by users and run each snapshot under several widths. They are the main defense against rule changes with side effects on unrelated constructs.",
    k: ["Large snapshot suite vs property tests only: snapshots document behavior and break on any intended change; property tests are robust and say nothing about style.", "Auto-update snapshots vs manual review: auto-update is fast and invites accepting regressions; manual review is slow and keeps the suite meaningful."],
    p: ["Snapshots updated in bulk without reading hide an accidental style change.", "A snapshot that captured a bug is defended as expected behavior years later."],
    v: "Change one layout rule and run the suite; confirm that exactly the snapshots covering that construct fail, that the diff shows the intended change, and that unrelated snapshots pass.",
    dep: ["printer-loop", "option-set"]
  },
  "corpus-fuzzing": {
    s: "Runs the formatter over large real-world code and generated random programs to find crashes, instability and meaning changes that hand-written tests miss.",
    d: "A corpus of open code in the supported language is formatted, and each result is checked for idempotence, syntax equivalence and comment preservation. A fuzzer mutates inputs or generates programs from the grammar, with varied widths and options, and looks for crashes, hangs or violated checks. Failures are minimized to small test cases, and added to the snapshot suite. The corpus matters because real code contains the unusual combinations that no designer thought of, and the fuzzer finds the ones real code lacks.",
    k: ["Real corpus vs generated programs: real code finds practical failures and is hard to minimize; generated programs reach odd constructs and look nothing like real code.", "Run in continuous integration vs on a schedule: per-change runs catch regressions early and take long; scheduled runs are cheap and find the cause later."],
    p: ["A corpus that predates new syntax never exercises it, so bugs appear first in user code.", "Failures are not minimized, and the cause stays obscure for weeks."],
    v: "Run the corpus and a fuzzer for a fixed time, confirming zero crashes, zero idempotence or equivalence failures and zero lost comments; every historical bug has a minimized case that fails when the fix is reverted.",
    dep: ["idempotence-check", "equivalence-check", "golden-snapshots"]
  },
  "style-stability-policy": {
    s: "The project's rules for when output may change between releases, which changes need a flag or major version, and how upgrades are announced.",
    d: "Because the tool rewrites the whole codebase, any output change causes diffs everywhere. A policy states that style changes ship only in major releases or behind opt-in flags, while bug fixes are allowed when output was invalid or unstable. Each change is listed in a changelog with before and after examples. Teams pin the version in CI and in the project manifest so the upgrade is deliberate. Stability is a promise to users about their history, and it competes with the pressure to improve the style.",
    k: ["Frozen style between majors vs continuous improvement: frozen protects history and delays fixes to known awkward output; continuous makes each upgrade a mass diff.", "Opt-in flags for new style vs breaking defaults: flags protect existing users and multiply options; breaking defaults keep one style and force an adoption commit."],
    p: ["A minor release changes output, and every project's CI check fails on the same day.", "Fixing an awkward layout a year later is refused, so the tool keeps a known flaw."],
    v: "Format the corpus with two consecutive minor releases and confirm output is identical; for a major release, confirm every differing case appears in the changelog with an example.",
    dep: ["golden-snapshots", "corpus-diff-tool", "opinionated-defaults"]
  },
  "perf-benchmarks": {
    s: "Repeatable measurements of formatting time and memory on files of varied size and shape, to catch regressions and find hotspots.",
    d: "Benchmarks run the tokenizer, parser, document builder and printer separately and together on a fixed set: a large generated file, a deeply nested file, a file with very long lines, many comments and a typical source tree. They record time, peak memory and allocation counts, and are compared to a stored baseline in CI. Pathological inputs matter most, since a layout trial that doubles work at each nesting level shows up only on certain shapes. Results guide decisions such as caching widths or avoiding repeated document construction.",
    k: ["Micro-benchmarks per stage vs end-to-end only: per-stage pinpoints the cause; end-to-end reflects what users experience and hides which stage regressed.", "Fixed thresholds vs relative regression detection: thresholds are simple and ignore hardware differences poorly; relative comparison on the same machine is robust and noisy."],
    p: ["Benchmarks that use typical files never reveal the exponential case that appears in generated code.", "Noisy shared machines produce false regressions, so people ignore the signal."],
    v: "Run the benchmark suite on a baseline and a candidate build on the same machine, and confirm per-stage times and memory are reported, the nested-callback stress case grows roughly linearly, and a seeded slowdown is flagged.",
    dep: ["printer-loop", "parser", "arena-storage"]
  },
  "corpus-diff-tool": {
    s: "A script that formats a large corpus with two builds of the formatter and reports every difference, used to review the real impact of a change.",
    d: "Before merging a rule change, the maintainer runs old and new builds on a corpus of open code and gets a diff summary: how many files changed, grouped by construct, with samples. This shows effects that snapshots do not, such as a heuristic that works on small cases and misfires in real code. Output is organized so reviewers can scan categories rather than thousands of lines. The tool also records instability and crashes found in either build. It supports the stability policy by quantifying churn.",
    k: ["Full-corpus diff for every change vs only for risky ones: always gives confidence and costs time and compute; selective is fast and misses interactions.", "Report by category vs raw diff: categories make review feasible; raw diffs are complete and unreadable at scale."],
    p: ["A corpus that is not representative of the user base gives false confidence.", "A diff reviewed only on the first few files misses the category that breaks a particular construct."],
    v: "Run it on two builds that differ in a single rule and confirm the report shows only files containing that construct, with counts per category and example diffs, and no changed output when both builds are identical.",
    dep: ["file-walker", "diff-report", "parallel-scheduler"]
  },
  "source-reader": {
    s: "Reads the file or buffer into text, handling encoding, byte order marks and the line ending convention, and remembers what was found so the writer can restore it.",
    d: "The reader loads bytes, detects the encoding, strips a byte order mark and records its presence, decodes to the internal string form and detects the dominant line ending. It rejects files that are not valid text, such as binary files or invalid sequences, with a clear message rather than guessing. Large files are read whole, since the parser needs random access, but a size limit protects against accidental formatting of huge generated files. What it records feeds the writer so that the output matches the file's original conventions.",
    k: ["Strict decoding vs lossy replacement: strict refuses invalid files and never changes content; lossy always proceeds and silently corrupts bytes that were not valid text.", "Read whole file vs stream: whole file gives random access and simple parsing; streaming saves memory and suits no formatter that needs look-ahead and comments."],
    p: ["Replacing invalid byte sequences while decoding changes file content in a way no diff shows as a formatting change.", "A byte order mark dropped on rewrite breaks tools that depend on it."],
    v: "Read files with and without a byte order mark, mixed line endings and an invalid byte; confirm metadata is recorded, writing back unchanged text reproduces the original bytes, and the invalid file is rejected with its path.",
    dep: ["encoding-detection"]
  },
  "encoding-detection": {
    s: "Determines the character encoding of a file from a byte order mark, declaration or validity checks, defaulting to one standard encoding.",
    d: "Most modern source is in one universal encoding, which is the default. The detector looks first for a byte order mark, then for an encoding declaration in the first lines where the language defines one, then checks that the bytes are valid in the default encoding. If none apply, it reports an error. Supporting legacy encodings widens coverage and complicates round trips, since text decoded and re-encoded must reproduce the original bytes exactly for unchanged parts.",
    k: ["One supported encoding vs several: one is simple and exact; several accommodates legacy code and risks lossy conversion.", "Trust declarations vs verify them: trusting is fast; verifying catches wrong declarations and costs a decode attempt."],
    p: ["A file declared in one encoding and saved in another is decoded to garbage, which the formatter then writes back.", "Guessing encoding statistically gives different answers for short files."],
    v: "Run detection on files with each supported byte order mark, a declaration, a mismatched declaration and invalid bytes; confirm the documented outcome for each and exact byte round trips for valid ones.",
    dep: []
  },
  "display-width": {
    s: "Lookup tables of how many terminal columns each Unicode code point occupies, used by the printer to measure lines.",
    d: "The tables classify code points as narrow, wide, zero-width or ambiguous, based on the standard's width properties and on emoji presentation rules. They are compiled into compact range tables searched by binary search, with a fast path for ASCII. The tables need updating as the standard grows, and the choice for ambiguous characters is a convention that should be documented, since different terminals differ. Tab width and control characters get special handling, so they are not part of the tables.",
    k: ["Treat ambiguous characters as narrow vs wide: narrow matches most Western terminals; wide suits East Asian contexts and makes lines shorter.", "Embedded tables vs system width functions: embedded tables give the same output everywhere; system functions track local terminals and make output machine-dependent."],
    p: ["Outdated tables misjudge new emoji and wrap lines wrongly.", "Using system locale widths makes the same file format differently on two machines."],
    v: "Look up a test set covering ASCII, wide, combining, zero-width, emoji and ambiguous code points, and confirm widths match the documented table; format the same file on two machines and confirm identical output.",
    dep: []
  },
  "line-index": {
    s: "A table of line start offsets that converts between offsets and line and column positions in logarithmic time.",
    d: "Built in one pass over the text, the index stores the offset where each line begins. Looking up the line of an offset is a binary search, and the column is the difference, converted to the unit the caller wants, such as characters or the editor's code units. It serves error messages, the diff report, range requests, blank line counting and cursor tracking. It must understand all newline forms used by the file and not count carriage return and line feed as two breaks.",
    k: ["Offset table with binary search vs storing line and column on every token: the table is small and cheap; per-token storage is immediate and wastes memory.", "Column in code points vs in editor units: code points are intuitive; editor units avoid conversion and match the protocol."],
    p: ["Mixed line endings make line counts differ between the index and the editor.", "Stale index after an edit gives positions that are off, since text and index diverge."],
    v: "Build an index for text with all line endings and non-ASCII characters; check that every offset round-trips to line and column and back, and that lines match what the editor reports.",
    dep: []
  },
  "arena-storage": {
    s: "Allocates tree nodes and documents from large contiguous blocks that are freed all at once, making construction fast and keeping memory compact.",
    d: "A formatter builds a tree and a document for each file, uses them once and discards both. An arena hands out nodes from big blocks and releases everything when the file is done, with no per-node free. Nodes refer to each other by index or compact handle rather than by pointer, which reduces size and improves cache locality. Interned strings for common tokens avoid duplicate text. The difficulty is lifetime: anything that must outlive the file, such as cached results, must be copied out.",
    k: ["Arena allocation vs individually allocated nodes: arenas are fast and cache-friendly and tie lifetimes to the file; individual allocation is flexible and slower with more memory overhead.", "Index handles vs references: handles are small and safe to serialize; references are direct and need care about lifetimes."],
    p: ["A node handle retained after the arena is released points to freed or reused memory.", "A very large file consumes memory proportional to several copies of its text, because tree and document both stay live."],
    v: "Format a file of one hundred megabytes and a thousand small files in one process; confirm peak memory is stable across files, drops after each, and time per file is roughly linear in size.",
    dep: []
  },
  "idempotence-guarantee": {
    s: "The promise that formatting the output again changes nothing, which every rule, the comment system and the printer must uphold together.",
    d: "No single component owns idempotence. The printer must not use layout from the input beyond declared hints, comment placement must reach the same attachment after reflow, and normalizations must reach a fixed point in one pass. Violations appear where rules interact: a trailing separator rule and a width rule, or a comment moving into a different group. The guarantee is enforced by a check in tests and optionally at runtime, and is the basis for CI check mode, caching and adoption trust.",
    k: ["Strict guarantee with no exceptions vs best effort: strict makes every violation a bug and shapes rule design; best effort ships faster and lets check mode fail on correct code.", "Make rules independent of input layout vs allow authored hints: independence makes idempotence nearly automatic; hints keep intent and are the main source of violations."],
    p: ["A violation shows up only in CI, where formatting then checking disagrees, and it blocks unrelated changes.", "Fixing one rule's violation introduces another because the rules were tuned against each other."],
    v: "Format the whole corpus and every fuzzer-generated program twice and compare outputs; confirm zero differences, and that CI check mode passes immediately after the write mode on the same tree.",
    dep: ["idempotence-check", "authored-break-hints", "comment-attachment", "printer-loop", "result-cache"]
  },
  "minimal-configuration": {
    s: "The decision to expose very few options so that most code looks the same everywhere, trading flexibility for freedom from style debate.",
    d: "Each option multiplies the tests, the documentation and the number of distinct outputs for the same tree. It also moves an argument from the codebase into the config file, where it is easier to forget than to resolve. A minimal set, such as width, indentation and a few spelling choices, reaches nearly everyone, and the opinionated defaults carry the rest. The decision shapes the option table, the config discovery, the plugin API and the community's expectations about requests.",
    k: ["Few options with strong defaults vs broad configurability: few ends debate and simplifies the tool; broad suits legacy styles and fragments the ecosystem.", "Refuse requests vs add behind opt-in flags: refusing keeps the product coherent and frustrates adopters; flags win users and accumulate permanent maintenance."],
    p: ["An option added to settle one dispute is reused by many teams, and uniform output across projects is lost.", "Too few options keep a team with a strong legacy convention from adopting the tool."],
    v: "Count the options and the total combinations covered by the golden suite; confirm every documented option has a snapshot test with a changed expected output, and no undocumented configuration key is accepted.",
    dep: ["option-set", "opinionated-defaults", "config-validation", "per-path-overrides"]
  },
  "invalid-code-tolerance": {
    s: "The policy for input that does not parse: refuse and report, or recover and format what is understood, which differs between batch runs and editors.",
    d: "Batch tools and CI treat a syntax error as a failure and leave the file alone, since the formatter cannot know what the author meant. Editors send half-typed code constantly, so for them tolerance is a feature: recover, format valid sections, keep the broken part verbatim. The policy touches the tokenizer, parser, comment system, range formatting and the write path, which must never write a result produced from a recovered tree unless the mode allows it. Error messages should point at the original text position.",
    k: ["Refuse and report vs partial formatting: refusing never corrupts code and gives no help mid-edit; partial formatting helps editing and risks rewriting what was misread.", "One policy everywhere vs per-mode policy: one is easier to explain; per-mode fits both CI safety and editor usability."],
    p: ["Partial results from a recovered tree are written to disk by batch mode.", "An error in one embedded region makes the whole host file unformatted."],
    v: "Format a tree with one broken file in batch mode and confirm the broken file is untouched and reported with its position while the others are formatted; in editor mode confirm the broken region is verbatim and the rest formatted.",
    dep: ["error-recovery", "exit-status", "embedded-formatter-call", "range-request"]
  },
  "performance-budget": {
    s: "The requirement that formatting is fast enough to run on every save and on whole repositories, which shapes data structures and the printing algorithm.",
    d: "A formatter that takes noticeable time on save is turned off. Budgets are set per file, in tens of milliseconds for typical files, and per repository, in seconds with caching and parallelism. They constrain choices throughout: single-pass printing, linear fits checks, compact trees, avoiding repeated document construction in trial layouts, and a cache that skips unchanged files. Pathological shapes such as deeply nested callbacks or very long lines can break the budget even when average files are fast.",
    k: ["Greedy linear algorithms vs better layouts at higher cost: greedy meets budgets on every input; costlier search gives nicer code and risks slow outliers.", "Cache and parallelism vs simpler single-threaded runs: they cut wall-clock time and add nondeterminism risks; the simple route is predictable and slow on large repositories."],
    p: ["A trial layout that prints subdocuments twice grows exponentially with nesting and hangs on one file.", "Benchmarks with typical files miss the slow case, which is only found by a user's generated code."],
    v: "Format a typical file in the editor service and confirm it returns within the budget; format a large repository cold and warm and confirm times, and run the nesting stress case to confirm near-linear growth.",
    dep: ["perf-benchmarks", "result-cache", "parallel-scheduler", "fits-check", "arena-storage"]
  },
  "determinism": {
    s: "The property that the same input, options and version produce byte-identical output on every machine, thread count and run.",
    d: "Reproducibility makes CI checks, caches and shared editor behavior possible. It depends on fixed width tables rather than locale queries, stable ordering of files and diagnostics, no dependence on the time, the environment or the current directory beyond declared inputs, and no shared mutable state between parallel workers. Option resolution must be a pure function of config files. Sorting, hash iteration order and plugin load order are common leaks, so they are fixed explicitly.",
    k: ["Self-contained tables and rules vs deferring to the host system: self-contained output is identical everywhere; host queries adapt to local settings and make output machine-dependent.", "Stable ordering enforced vs completion order: stable ordering gives reproducible reports and costs a sort; completion order is quicker and varies."],
    p: ["Hash iteration order in a rule gives different output on different runs of the same input.", "A locale-dependent width or sort makes CI disagree with a developer's machine."],
    v: "Format the corpus on two operating systems with different locales and thread counts and compare outputs and reports byte for byte; confirm no differences in any file or message.",
    dep: ["display-width", "parallel-scheduler", "config-discovery", "file-walker", "plugin-loader"]
  },
  "version-stability": {
    s: "How the formatter's output and interfaces change over time: pinned versions, changelogs, flagged changes and the cost of upgrading a whole codebase.",
    d: "Because output is a function of the formatter's version, upgrades can change every file. Teams pin the version in CI, editors and hooks so all agree, and upgrade deliberately with a mass reformat commit added to the blame ignore list. The project's release policy, the cache key, the plugin API contract and the configuration schema all carry version information. Mismatched versions among editor, hook and CI produce a check that fails for code that looks formatted locally.",
    k: ["Pin an exact version vs track latest: pinning gives reproducible results and requires deliberate upgrades; tracking gets fixes sooner and breaks checks without warning.", "Stable plugin and config interfaces vs freedom to change: stability protects the ecosystem; freedom lets the tool improve and breaks existing setups."],
    p: ["An editor extension bundles a different version than CI and formats files differently, causing churn between commits.", "A version bump reformats part of the codebase and is mixed into a feature commit."],
    v: "Print the version from the editor service, the hook and CI and confirm all are identical; upgrade the pinned version in a branch and confirm the resulting reformat is a separate commit listed in the ignore file.",
    dep: ["style-stability-policy", "blame-ignore-list", "result-cache", "plugin-loader", "config-validation"]
  }
});
