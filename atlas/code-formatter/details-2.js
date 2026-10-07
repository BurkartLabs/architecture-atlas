// Details for the code formatter plate, part 2: driver, ranges and embedded code.
ATLAS.details("code-formatter", {
  "file-walker": {
    s: "Expands the paths and patterns given on the command line into the list of files to format, honoring ignore rules and skipping non-source files.",
    d: "The walker accepts files, directories and globs, traverses directories, applies ignore patterns before descending so large excluded trees such as dependency folders cost nothing, and filters by known extensions. It may use the version control index to list only tracked files, which is fast and matches what will be committed. Symbolic links, case-insensitive file systems and very deep trees are common traps. The result is a deterministic, sorted list so that reports and caches behave the same on every run.",
    k: ["Walk the file system vs ask version control: walking sees untracked files and works anywhere; asking version control is faster and respects its ignore rules but misses new files.", "Sorted deterministic order vs completion order: sorted output makes reports reproducible; completion order is faster to start and varies from run to run."],
    p: ["Following symbolic links can loop or format files outside the project.", "Case-insensitive path comparison misses ignore matches, so excluded files are formatted on one operating system only."],
    v: "Run in a tree with ignored dependency folders, a symbolic link loop and mixed-case paths; confirm the printed file list is identical on two operating systems and contains no ignored or linked-out files.",
    dep: ["ignore-patterns"]
  },
  "language-dispatch": {
    s: "Chooses which language module and formatting pipeline handles each file, based on extension, name, first line or explicit editor language identifier.",
    d: "A registry maps extensions, special file names and interpreter lines to language modules, each supplying a grammar, a set of layout rules and its options. Editors pass an explicit language identifier that takes precedence. Files with no match are skipped and reported, not guessed. Dispatch also picks embedded language handlers by name, so a template literal tagged as one language reaches that language's formatter. Ambiguous extensions, such as a header shared by two languages, need a documented tie-break or a configuration override.",
    k: ["Detect by extension vs inspect content: extensions are cheap and predictable; content sniffing handles scripts without extensions but can misclassify and costs a read.", "Fixed built-in languages vs plugin registry: built-in is simple and tested together; plugins extend coverage while creating version compatibility problems."],
    p: ["A shared extension is routed to the wrong grammar and the formatter fails or mangles valid code.", "Unknown files are skipped without a message, and users think a language is supported when it is not."],
    v: "Format a set of files that includes shared extensions, an extensionless script and an unknown type; confirm each is routed to the expected language, and the unknown one is reported as skipped with its path.",
    dep: ["grammar-module", "plugin-loader"]
  },
  "stdin-mode": {
    s: "Formats text read from standard input and writes the result to standard output, with the path supplied separately for configuration and language lookup.",
    d: "Editors and scripts pipe a buffer through the tool without touching disk. Since there is no file, the caller passes a virtual path used for configuration discovery, ignore matching and language detection. Output must contain only the formatted text, with diagnostics on the error stream and a distinct exit status, because tools treat any extra output as part of the code. Encoding and line endings must round-trip exactly, as there is no file system layer to hide an error.",
    k: ["Virtual path argument vs inferring from the working directory: a path gives correct config and language for editor buffers; inferring is simpler and often wrong.", "Always output text vs output nothing when unchanged: always outputting is simple for pipes; skipping output saves work but makes empty results ambiguous."],
    p: ["Messages on standard output corrupt the buffer when an editor replaces its text with the output.", "A missing virtual path formats a buffer with the wrong options or as the wrong language."],
    v: "Pipe a file's content with its path and compare the output byte for byte with in-place formatting of that file; confirm warnings appear only on the error stream.",
    dep: ["language-dispatch", "config-discovery", "source-reader"]
  },
  "parallel-scheduler": {
    s: "Runs formatting of many files across several workers and gathers results in a stable order, so a large repository formats in seconds.",
    d: "Formatting one file is independent of every other, which makes the work embarrassingly parallel. The scheduler splits the file list across workers sized to the available cores, sorts larger files first to avoid a straggler at the end, and collects diagnostics in file order. Memory per worker matters because each holds a tree for one file at a time. Work that includes plugins or embedded formatters must make sure each worker has its own state, since shared mutable state would give nondeterministic output.",
    k: ["Worker processes vs threads in one process: processes isolate crashes and memory at the cost of startup and copying; threads share caches cheaply and risk shared state bugs.", "Largest-first scheduling vs input order: largest-first shortens total time, while input order streams results naturally and is easier to follow."],
    p: ["A single pathological file occupies one worker for minutes while the others idle.", "Shared mutable state in a plugin makes parallel runs produce output that differs from a serial run."],
    v: "Format a large tree serially and with the maximum number of workers; confirm byte-identical results, identical diagnostic order, and a wall-clock time that falls roughly in proportion to cores.",
    dep: ["file-walker", "determinism", "printer-loop"]
  },
  "result-cache": {
    s: "Remembers which files were already formatted correctly, keyed by content and settings, so unchanged files are skipped on later runs.",
    d: "After formatting a file, the tool stores a key made of the file's content hash, the resolved options and the formatter version, with the result being only that this input is already stable or maps to this output. On later runs, a matching key skips parsing and printing altogether. Stale entries are never wrong, only unused, because any change to content, options or version changes the key. The cache lives in a per-project directory and must tolerate concurrent runs and being deleted at any moment.",
    k: ["Content hash vs modification time: hashes are reliable across checkouts and clones but require reading the file; timestamps are quick and break on touch, copies and clock changes.", "Cache only unchanged verdicts vs cache full outputs: verdicts are tiny and safe; outputs allow instant rewriting but use much more space."],
    p: ["A key missing the formatter version serves old results after an upgrade, so files are not reformatted by the new style.", "Concurrent runs corrupt a shared cache file and subsequent runs crash or skip files wrongly."],
    v: "Run twice on an unchanged tree and confirm the second run reads cache entries and takes a fraction of the time; then upgrade the version or change an option and confirm every file is processed again.",
    dep: ["option-set", "file-walker"]
  },
  "atomic-writer": {
    s: "Writes formatted output to disk in a way that a crash or a full disk can never leave a half-written or empty source file behind.",
    d: "The writer saves the result to a temporary file in the same directory, flushes it, copies the original permissions and ownership, then renames it over the original, which is atomic on common file systems. It skips the write if the content is unchanged so modification times and file watchers stay quiet. It also guards against races where the file changed after it was read, by comparing the original content or timestamp before replacing. Special cases include read-only files, symbolic links and files in version control with specific line endings.",
    k: ["Write temp file then rename vs overwrite in place: rename is safe against crashes but breaks hard links and can alter ownership; overwrite preserves identity and risks truncation.", "Skip identical writes vs always write: skipping keeps timestamps and avoids triggering rebuilds; always writing is simpler and makes build tools do useless work."],
    p: ["A crash mid-write truncates the source file with no copy to recover from.", "Replacing a symbolic link with a regular file silently breaks the layout of the project."],
    v: "Kill the process in the middle of writing a large file repeatedly; confirm every file on disk is either the full original or the full formatted result, and that unchanged files keep their modification times.",
    dep: ["source-reader", "line-ending-output"]
  },
  "exit-status": {
    s: "The set of process exit codes and summary messages that tell scripts and humans whether files were formatted, were already clean, or failed.",
    d: "Distinct codes separate success, a check that found unformatted files, and errors such as invalid configuration or syntax errors in input. Pipelines depend on them, so they are documented and kept stable. The report summarizes counts of changed, unchanged and failed files, and lists failures with path, line and column. In check mode, differences are not errors in the tool's own sense, but they still fail the pipeline. Quiet and verbose levels control noise without changing codes.",
    k: ["Separate codes for check failure and error vs one failure code: separate codes let pipelines react differently, while one code is simple and loses information.", "Continue after a failed file vs stop at first error: continuing reports everything in one run; stopping is faster feedback and hides later problems."],
    p: ["A syntax error in one file is reported as success when the file is skipped, and CI passes with that file unformatted.", "Changing a code between releases breaks every pipeline that interprets it."],
    v: "Run on a clean tree, an unformatted tree and a tree with one syntax error and one invalid config; confirm four different outcomes, with codes matching the documentation and summary counts matching the file list.",
    dep: ["error-recovery", "config-validation"]
  },
  "plugin-loader": {
    s: "Loads additional language modules and rule sets at startup, so new languages and house styles can be added without changing the formatter's core.",
    d: "Plugins are located by configuration, loaded in a defined order and asked to register languages: a grammar, an embedded-language hook and a printing function that turns nodes into documents. The core exposes a stable document builder API, which is the contract plugins depend on. Version checks reject incompatible plugins. The difficulty is trust and determinism: plugin code runs with the user's privileges on every file, and two plugins claiming the same extension must resolve predictably.",
    k: ["Plugins vs a monolithic built-in set: plugins grow coverage through the community and let teams add languages; built-ins give consistent quality and one release to test.", "Stable plugin API vs freedom to refactor: a stable API protects the ecosystem but freezes internals; an unstable one lets the core improve while plugins constantly break."],
    p: ["An outdated plugin silently produces output unlike the newer core, and the idempotence check fails in only some projects.", "Two plugins for the same extension are loaded in a different order on another machine."],
    v: "Install a sample language plugin, format a file in its language, then remove it and confirm the file is reported as unsupported; load two conflicting plugins and confirm the documented winner is chosen on every run.",
    dep: ["doc-builder-api", "grammar-module"]
  },
  "range-expansion": {
    s: "Widens a requested character range to the smallest set of complete syntax nodes that contain it, so only whole constructs are reformatted.",
    d: "Given start and end offsets, it finds the deepest node covering the start and the deepest covering the end, then walks up until both are siblings or the same node, and takes that sequence of nodes. It also decides whether the selection should include leading blank lines or trailing comments belonging to those nodes. It needs the node's indentation depth from the enclosing context. Expanding too little yields invalid output; too much reformats code the user did not select, which defeats the purpose of range formatting.",
    k: ["Expand to statements vs expand to the smallest enclosing node: statements are intuitive and stable; the smallest node is more precise but can produce unusual style at expression level.", "Include attached comments vs exclude them: including keeps a comment and its code together; excluding respects the selection but can separate them."],
    p: ["A selection that ends inside a comment or string expands unpredictably or errors.", "Range expansion differs from the whole-file node boundaries, so formatting the range gives output that the next full format changes."],
    v: "Select a span starting mid-expression and ending mid-statement across three statements; confirm the result is exactly those three whole statements, formatted, and that the surrounding lines are byte-identical.",
    dep: ["cst-builder", "source-positions", "trivia-capture"]
  },
  "range-splice": {
    s: "Takes the formatted text of a range and merges it back into the untouched surrounding source, producing minimal edits for the editor or file.",
    d: "After the engine prints the expanded nodes with the correct starting indentation, the splice step replaces exactly the node span in the original text, leaving everything before and after untouched, including blank lines and trailing whitespace outside the range. It then computes the smallest edit list between old and new text so editors keep cursors and folds. It has to maintain the original line endings and avoid introducing a doubled or missing newline at the seam, which is the classic error.",
    k: ["Return replacement of the whole region vs a fine-grained edit list: whole region is trivial; fine edits keep marks and selections but need a diff step.", "Reuse original text outside the range vs reprint everything: reuse guarantees untouched areas stay byte-identical; reprinting is simpler but changes the unselected code."],
    p: ["A missing or extra newline at the boundary leaves the range joined to the next statement or separated by an extra blank line.", "Edits computed against an older version of the buffer land at wrong offsets."],
    v: "Format ranges at the start, middle and end of a file and confirm bytes outside the replaced span are identical to the original, and that applying the returned edits yields exactly the splice result.",
    dep: ["range-expansion", "line-index", "printer-loop"]
  },
  "cursor-tracking": {
    s: "Maps the cursor position from the original text to the matching position in the formatted text so the caret stays on the same token after formatting.",
    d: "The formatter records the node or token containing the cursor and, after printing, finds where that token landed in the output. Some implementations put a marker in the document at the cursor offset, so the printer reports its final location. Offsets inside whitespace or comments need rules, such as snapping to the nearest token. Without tracking, a full-file format moves the caret to an arbitrary place and the user loses their position in a long file.",
    k: ["Marker in the document vs mapping through token positions: markers are exact and need the printer to understand them; token mapping works with any printer and loses precision inside tokens.", "Preserve cursor offset inside a token vs snap to token start: offset preservation feels natural but fails when tokens are rewritten, for instance when quotes change."],
    p: ["After reformatting, the caret lands on the wrong line when a long statement is split in front of it.", "A marker left in the output after an error path corrupts the formatted file."],
    v: "Place the cursor in the middle of an identifier on a line that will be re-wrapped, format, and confirm the cursor is in the same identifier at the same character offset in the new text.",
    dep: ["source-positions", "text-primitive", "printer-loop"]
  },
  "embedded-region-finder": {
    s: "Locates spans of code in one language that is written inside another, such as templates in strings, code blocks in documents or script tags in markup.",
    d: "While formatting the host language, the rules call a finder at nodes that may carry foreign code. It decides by language tags, comments, file structure or node type whether a region is embedded and what language it is. It then extracts the region's text and its position. The finder has to be conservative: a string that looks like code but is not should be left alone. Regions can nest, such as code inside a document inside a template, so the finder is invoked recursively.",
    k: ["Explicit annotation vs heuristics: annotations are reliable and require authors to add them; heuristics catch more regions and sometimes reformat strings that were not code.", "Format embedded code by default vs opt in: default gives uniform codebases while risking unwanted changes; opt in is safe and leaves most embedded code untouched."],
    p: ["A string misjudged as code is reformatted and its content, which was data, changes.", "A region with placeholders that cannot be parsed makes the whole host file fail."],
    v: "Format a file with a tagged template, an untagged lookalike string and a nested block; confirm only the tagged and recognized regions change and the lookalike string is byte-identical.",
    dep: ["cst-builder", "language-dispatch"]
  },
  "embedded-formatter-call": {
    s: "Hands an extracted embedded region to the formatter for its own language and returns a document that the host can place in its layout.",
    d: "The call parses the region with the embedded language's grammar, runs its rules and returns a document rather than a string so the host's printer can still choose line breaks and indentation. It passes the options, adjusted for the nested position: remaining width is reduced by the host's indent. If the embedded code fails to parse, the host leaves the region as written. The hard part is keeping the layout responsibilities clear: the embedded engine decides its content, the host decides the surrounding indentation and the width budget.",
    k: ["Return a document vs return a string: documents let the host fit lines correctly and require a shared IR; strings are easy and cannot account for the host's indentation.", "Fail the whole file on embedded errors vs skip the region: failing flags the problem loudly; skipping keeps the file formatted and hides a broken region."],
    p: ["Width calculated without the host indent makes embedded lines exceed the limit.", "Formatting embedded code with different options than the host surprises users with two styles in one file."],
    v: "Format a host file whose embedded block is deeply indented and confirm no embedded line exceeds the configured width, and that an unparsable block is left unchanged while the rest of the file is formatted.",
    dep: ["embedded-region-finder", "doc-builder-api", "placeholder-substitution", "error-recovery"]
  },
  "placeholder-substitution": {
    s: "Replaces interpolated expressions inside embedded code with stand-in tokens so the code parses, then restores the original expressions afterward.",
    d: "Templates and some documents mix foreign code with host expressions, which would make the embedded text invalid. The tool substitutes each expression with a unique identifier that is valid in the embedded grammar, formats the result, and swaps each identifier back for the expression's own formatted document. Placeholders must be unique, must survive formatting without being split or renamed, and must be placed where the grammar allows an identifier, which is not always possible. If they cannot be parsed, the region is skipped.",
    k: ["Identifier-like placeholders vs structural markers: identifiers parse in most places but can clash with real names; markers are unique and require grammar support.", "Restore expressions as documents vs as raw text: documents allow them to be formatted and wrapped; raw text is safe and can overflow the line."],
    p: ["A placeholder inside a position where the grammar expects a literal makes the region unparsable.", "A placeholder that collides with real text in the template is swapped back in the wrong place."],
    v: "Format a template with expressions in value, selector and name positions and confirm every expression reappears exactly once in its original order, with no placeholder text left in the output.",
    dep: ["embedded-formatter-call", "tokenizer"]
  },
  "indent-reinjection": {
    s: "Re-indents formatted embedded code to match the host's nesting and adds or removes the surrounding line breaks.",
    d: "Embedded code is formatted at indentation zero and then must sit at the host's current depth. In a document IR this is an indent node wrapped around the embedded document, with hard breaks around the region where the host style demands them. Indentation inside multi-line string literals is significant, so it must not be altered where it would change the value. Some languages dedent the content before use, and the formatter must match that rule so meaning is unchanged.",
    k: ["Indent as part of the host document vs textual shifting afterward: document indentation composes with fitting; text shifting is easy and breaks width accounting.", "Leave string content alone vs normalize its indentation: leaving is always safe; normalizing gives tidy output only where the language ignores indentation."],
    p: ["Re-indenting a literal whose whitespace is significant changes the string value, altering the program.", "Tabs and spaces get mixed when the embedded and host indentation units differ."],
    v: "Format a host file where the embedded region moves one level deeper after another edit; confirm every embedded line gains exactly one indent unit and the string values, evaluated by the language, are unchanged.",
    dep: ["indent-align", "embedded-formatter-call", "indent-style"]
  }
});
