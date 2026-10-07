// Details for the transpiler plate, part 4: code generation, source maps, caching and testing.
ATLAS.details("transpiler", {
  "code-generator": {
    s: "Walks the final tree and writes source text, tracking output positions so each emitted token can be tied back to the node it came from.",
    d: "A printer has a routine per node type that emits tokens in order and calls the routine for each child. It keeps a buffer, the current line and column, and indentation level, and records a mapping each time it emits a token that has an original location. Options choose compact or readable output, quote style, line width and the target edition for constructs with multiple spellings. It must produce text that parses back to an equivalent tree, which depends on the parenthesization, separator and comment rules working together.",
    k: ["Direct string building vs building an intermediate document layout: direct is fast and simple; a layout model supports line-width-aware wrapping at the cost of a second representation.", "One printer for all options vs specialized fast minified path: one printer is easy to keep correct; a fast path is quicker and must be tested against the main one."],
    p: ["A node type missing a printing routine produces empty output for that construct, with no error.", "Emitting two adjacent tokens without a separator merges them into one, such as a plus and an increment."],
    v: "Print every tree in a large corpus, parse the output again, and confirm the new tree equals the original ignoring locations, and that the output runs equal to the source.",
    dep: ["ast-traversal", "parenthesization", "whitespace-and-newlines", "literal-printing", "source-map-generation"]
  },
  "parenthesization": {
    s: "Decides where parentheses are required by operator precedence, associativity and context, and inserts them so the printed code parses back to the same tree.",
    d: "A tree has no parentheses, only structure, so the printer must add them when a child binds more loosely than its parent requires. It compares precedence and associativity, and applies context rules: an object literal or function at the start of a statement needs wrapping to avoid parsing as a block or declaration, an arrow function body that begins with a brace, a sequence expression in an argument, or a leading let bracket. Transforms that move expressions into new contexts depend on this working, because they never think about grouping.",
    k: ["Parentheses derived from the tree vs preserved from source: derived is always correct for edited trees; preserved keeps author intent and stays valid only if the tree is unchanged.", "Minimal parentheses vs extra for readability: minimal output is smaller; extra grouping makes mixed operators easier to read and slightly larger."],
    p: ["An object literal at the beginning of an expression statement prints without wrapping and parses as a block.", "Wrapping nodes in the wrong order after a transformation changes the order of evaluation."],
    v: "Generate random trees, print them, parse the output and compare structure. Confirm zero mismatches including statement-initial literals, nested ternaries and mixed nullish and logical operators.",
    dep: ["node-type-definitions", "operator-precedence"]
  },
  "whitespace-and-newlines": {
    s: "Controls spacing, indentation and line breaks in output, including the places where a newline changes meaning, such as after return or before an increment.",
    d: "The printer chooses separators between tokens and decides when to break lines. Some breaks are required: a statement boundary without a semicolon depends on the next token, and a newline after return, throw or a postfix operator alters the program. Others are style: indentation width, blank lines between declarations, wrapping long argument lists. Compact mode removes all optional space but keeps a space between two word-like tokens. Retaining original blank lines helps readability and requires location data.",
    k: ["Always emit semicolons vs rely on automatic insertion: explicit semicolons are safe and unambiguous; omitting is shorter and fails on lines starting with brackets or parentheses.", "Fixed line width wrapping vs one statement per line: width-aware output reads better and needs a layout engine; simple output is predictable and long."],
    p: ["A newline inserted between return and its value turns the function into one returning undefined.", "Removing a newline merges a line starting with a parenthesis into the previous call."],
    v: "Print statements ending in return with a multi-line expression, lines starting with brackets, and postfix increments, then run the output and confirm behavior equals the original.",
    dep: ["code-generator", "node-locations"]
  },
  "comment-emission": {
    s: "Writes attached comments back into the output at the right positions, with correct line or block form and without swallowing the code around them.",
    d: "For each node the printer emits leading comments before it and trailing after, choosing line or block form while keeping the form's own rules: a line comment must end with a newline, and a block comment ends in a closing marker that cannot appear inside it. It handles comments inside empty blocks and argument lists, directive comments with special meaning, and license notices kept at the file top. In compact mode, most comments are dropped but marked ones remain. A misplaced line comment can comment out the rest of a line of code.",
    k: ["Keep every comment vs only marked ones: keeping all preserves intent for readers; only marked ones minimize size for production and need a convention authors follow.", "Convert line comments to block form when inlining vs force line breaks: conversion keeps layout compact and can mangle content; breaks keep form intact and cost lines."],
    p: ["A trailing line comment emitted before a following token on the same line comments out that code.", "A block comment containing a closing marker from original text ends early and leaves junk."],
    v: "Print trees with comments before, after and inside empty constructs in readable and compact modes, and confirm the output parses with the same code and the expected comments in place.",
    dep: ["code-generator", "comment-attachment"]
  },
  "literal-printing": {
    s: "Prints strings, numbers, regular expressions, template pieces and identifiers in valid form for the target, using the original spelling when possible.",
    d: "Strings need quotes chosen to minimize escapes and escapes for line separators, control characters and, for older targets, characters outside the basic range. Numbers print in the shortest form that round-trips, or the original text when preserved, with care for large integers and exponent forms. Regular expression literals keep their flags and body. Identifiers with Unicode escapes may be written in escaped form for targets that need it. Templates keep raw and cooked values. A printing bug changes data silently.",
    k: ["Use the original raw text vs regenerate from the value: raw text preserves what authors wrote and remains correct after no change; regeneration is needed when the value was edited and normalizes style.", "Escape non-ASCII characters vs emit them directly: escaping is safe for any output encoding; direct output is smaller and readable but depends on file encoding."],
    p: ["A string containing a line separator character prints raw and breaks parsing on older targets.", "A number printed with limited precision no longer equals the original value."],
    v: "Round-trip a corpus of literals, including lone surrogates, line separators, large integers and unusual regex flags, and compare parsed values before and after.",
    dep: ["code-generator", "node-type-definitions"]
  },
  "format-preserving-reprint": {
    s: "Reprints only the nodes that were changed and copies the rest of the original text verbatim, so edits show as minimal diffs and keep the author's formatting.",
    d: "The printer compares the edited tree with the original, using locations, and for unchanged nodes reuses the exact source slice including whitespace and comments. For changed nodes it prints new text and reindents it to match the surroundings. It needs a record of the original tree, precise positions, and tracking of trivia between nodes. Used by codemods, refactoring tools and automatic fixes, where a human reviews the result. It is much harder than full reprinting because every combination of edit and neighbor needs correct spacing.",
    k: ["Reuse original slices vs reprint everything: reuse keeps diffs minimal and formatting intact; reprint is simpler, consistent and touches every line.", "Detect style from surrounding code vs fixed style: detection matches the file's conventions; a fixed style is predictable and clashes with some files."],
    p: ["Reused source slices contain a node that was moved, so the same text appears twice or is out of date.", "Inserted code uses different indentation or quotes than its neighbors, producing a noisy diff."],
    v: "Change one argument in a hand-formatted file with unusual spacing and comments, and confirm a text diff of input and output shows only that argument changed.",
    dep: ["node-locations", "comment-attachment", "code-generator", "source-fidelity"]
  },
  "source-map-generation": {
    s: "Records, as code is printed, which output line and column came from which original file, line and column, and writes the result as a map file.",
    d: "The printer reports each token's output position and original location to a builder. The builder stores segments sorted by generated position, deduplicates consecutive identical mappings, tracks the list of source files and names, and serializes into the standard map format with an optional inline data URL or a separate file with a comment pointing to it. Lines without mappings are legal. Maps can be large, often as large as the code, so options trade detail against size. Accuracy depends on every transform preserving locations.",
    k: ["Map every token vs only node starts: every token gives exact stepping and large maps; node starts are smaller and coarser in the debugger.", "Inline map in the output vs separate file: inline is self-contained and bloats the file; separate keeps code small and requires serving and linking the file."],
    p: ["Mappings built from generated nodes with no original location point at line one of the wrong file.", "A map with paths relative to the wrong root makes debuggers fail to find the sources."],
    v: "Translate a file, load the output and map in a map-reading tool, and for twenty sampled output positions confirm the reported original line, column and name match the source text.",
    dep: ["code-generator", "mapping-encoding", "node-locations", "name-mappings"]
  },
  "mapping-encoding": {
    s: "The compact text format for mapping segments: relative numbers encoded as variable-length base-64 digits, grouped by output line.",
    d: "Each segment holds generated column, source index, original line, original column and optionally a name index, stored as differences from the previous segment so most values are small. Each number is encoded as a signed variable-length quantity in base-64 characters, segments are separated by commas, and output lines by semicolons. Encoding and decoding must handle negative differences, large values and lines with no segments. Subtle off-by-one errors, such as columns being zero-based and lines one-based in different places, shift every mapping.",
    k: ["Relative deltas vs absolute positions: deltas compress well and require sequential decoding; absolute positions allow random access and are much larger.", "Segments with names vs without: names support readable variable names in debuggers and add size per segment."],
    p: ["A sign bit handled incorrectly for negative deltas corrupts all later mappings on that line.", "Mixing zero-based and one-based lines shifts every breakpoint by one."],
    v: "Encode a set of segments, decode with an independent implementation, and confirm the same positions result. Include negative deltas, empty lines and values over thirty-two bits.",
    dep: ["source-map-generation"]
  },
  "map-composition": {
    s: "Combines the maps of successive steps, such as type stripping then downleveling then bundling, into one map from final output to the original source.",
    d: "Each tool maps its output to its input. To debug the original, the maps are chained: for each segment in the last map, find the segment in the previous map covering its source position, and replace the position with that segment's source. The chain requires a lookup structure over each map for efficient search. Gaps happen when one step has no mapping for a region; policies choose between dropping the segment or keeping the nearest. Names and source content must be carried through, and the cost grows with the number of stages.",
    k: ["Compose maps at the end vs have each tool accept an input map: end composition keeps tools simple; accepting maps lets each tool compose as it goes, avoiding storing intermediates.", "Nearest-segment fallback vs drop unmatched segments: fallback keeps stack traces approximate and useful; dropping avoids wrong locations but loses coverage."],
    p: ["One tool in a chain emitting no map breaks the chain, so all positions point at its output, not the source.", "Mappings in a composed map point to an intermediate file that does not exist."],
    v: "Chain three steps on a fixture and compare lookups in the composed map for sampled output positions against a manual trace through each step. Confirm they land on the same original line.",
    dep: ["source-map-generation", "mapping-encoding", "source-embedding"]
  },
  "name-mappings": {
    s: "Records original variable and property names alongside positions, so tools can show original names even when output renamed or generated different ones.",
    d: "When a transform renames a binding, the output token carries the original name in the map. Debuggers use it to show source-level variable names in scopes, and error tools use it to restore names in stack traces. The generator must supply the original name at renames and not at every identifier, or the map grows. Names are deduplicated into a table indexed by segments. Some renames, such as helper-generated temporaries, have no original name and are left blank. Without names, locals look obfuscated even when positions are correct.",
    k: ["Record names only for renamed identifiers vs all identifiers: renames only is small and enough for debugging; all names help symbolication and enlarge the map.", "Name the original binding vs the original expression text: binding names are short and consistent; expression text is more informative and larger."],
    p: ["A rename applied after map generation leaves the map listing the earlier name.", "Names recorded for generated temporaries display meaningless identifiers in the debugger's scope view."],
    v: "Rename a local variable through the pipeline, set a breakpoint after it, and confirm the debugger's variables pane shows the original name with the correct value.",
    dep: ["source-map-generation", "renamer"]
  },
  "source-embedding": {
    s: "Optionally stores the full original source text inside the map, so debuggers can show code without access to the files on disk.",
    d: "A map's contents list can hold the text of each original file. Debuggers then display the author's code even when sources are not served, as with published packages or code compiled on another machine. The cost is size, since every source is stored once per map, and exposure, since embedding ships original code to everyone who can read the map, including comments. The transpiler can embed all, none, or only for files outside the project, and maps with no content rely on resolvable relative paths.",
    k: ["Embed source content vs reference paths: embedding works anywhere and increases map size and exposure; references are small and break when sources are not available.", "Embed original text vs the text before the last step only: original is what authors want; intermediate text is available and not what they wrote."],
    p: ["Maps with embedded content shipped to production expose internal source and comments to the public.", "Embedded text from an earlier step does not match the final composed positions."],
    v: "Build with embedding on, delete the original files, and open the output in a debugger. Confirm the original text still appears and the line positions of breakpoints match the code shown.",
    dep: ["source-map-generation", "map-composition"]
  },
  "diagnostic-formatter": {
    s: "Renders errors and warnings for humans with a message, severity, file, line and column, a code excerpt and a pointer at the exact span.",
    d: "A diagnostic is a record with a category, a message, one or more locations and optional suggestions. The formatter finds the original line or lines from the source, expands tabs, draws a caret or underline under the span, and adds a few lines of surrounding context. It colors output when attached to a terminal and has a machine-readable form for editors. Location must refer to the original file, so a diagnostic raised on a generated node must be mapped back first. Good messages say what is wrong and what would fix it.",
    k: ["Show an excerpt with underline vs location only: excerpts make errors self-explanatory and require source access at report time; location only is lighter and forces a lookup.", "Many structured fields vs a plain message: structure supports editors and tooling; plain messages are simpler to produce and impossible to process."],
    p: ["Tabs in the source misalign the caret under the wrong character.", "A diagnostic about a generated node prints a location in output code the user never wrote."],
    v: "Trigger errors on a line with tabs and on a multi-line span, and confirm the excerpt shows the correct lines, the underline covers the right characters, and the machine form gives the same position.",
    dep: ["node-locations", "error-provenance"]
  },
  "error-provenance": {
    s: "Traces an error raised on a generated or moved node back to the original source it came from, so messages and stack traces cite what the author wrote.",
    d: "Nodes created by transforms inherit the location of the node they replaced, where possible. When an error is reported on a generated node, the reporter walks its recorded origin to the nearest original location. At runtime the same job is done by applying a source map to a stack trace, either in the runtime itself or in a tool. Provenance depends on every transform setting origins deliberately. A few transforms merge many nodes into one, making the choice of single origin arbitrary.",
    k: ["Track an explicit origin per generated node vs rely on inheriting location: explicit origins are accurate and cost a field and discipline; inherited locations are free and sometimes point to a neighbor.", "Map stack traces in the runtime vs in a separate tool: runtime mapping is immediate and needs support there; a separate tool works anywhere and can be forgotten."],
    p: ["A transform that merges two nodes keeps the location of neither and loses the ability to report either.", "Stack traces in production remain in generated coordinates because maps were not uploaded."],
    v: "Cause a runtime error inside code produced by a transform that expands one statement into several. Confirm the mapped stack trace reports the original statement line and column.",
    dep: ["node-locations", "map-composition"]
  },
  "content-hash-cache": {
    s: "Stores the result of translating a file under a hash of its content and relevant settings, so unchanged files are returned without parsing or transforming.",
    d: "Before translating, the tool computes a key from the file's text, the resolved configuration, plugin versions and engine version, and looks it up. A hit returns the stored code and map. A miss runs the pipeline and stores the result. Because the key is content-based, not time-based, it survives branch switches and moves between machines. The cost saved is parsing and all transforms, which dominates repeat builds. The danger is a key that omits an input that influences output, so cached results are stale but plausible.",
    k: ["Content hash vs modification time: hashes are exact and cost reading the file; timestamps are cheap and break on checkout, copy and clock differences.", "Per-file entries vs whole-build snapshot: per-file entries reuse partial work; a snapshot is simpler and invalidates entirely when any input changes."],
    p: ["A cached result survives an upgrade of a plugin because its version was not part of the key.", "Two projects sharing one cache directory read each other's entries with different options."],
    v: "Build twice and confirm the second run reports all hits and is much faster. Change one plugin option and confirm every affected file is a miss while outputs differ accordingly.",
    dep: ["cache-key-derivation", "persistent-store", "determinism"]
  },
  "cache-key-derivation": {
    s: "Builds the key for a cache entry from every input that can change the output: file text, options, plugin and engine versions, environment values and tracked dependencies.",
    d: "The key function hashes a canonical encoding of all inputs: the source, the resolved options after merging, the identity and version of every plugin and preset, the target, and any environment variables a plugin reads. Files read by macros or imported for type information are added as dependencies. Canonical encoding means sorted keys and normalized paths so equivalent inputs hash equal. Including too little produces stale hits; including too much, such as an absolute path or timestamp, makes the cache useless on other machines.",
    k: ["Hash the resolved options vs the config file text: resolved options ignore irrelevant edits such as comments; file text is simple and invalidates on any change.", "Include environment values by declaration vs the whole environment: declared names keep the key stable; the whole environment is safe and almost never hits."],
    p: ["A plugin that reads an environment variable without declaring it produces output that varies with no key change.", "Including the absolute working directory in the key prevents sharing the cache between developers and servers."],
    v: "Derive the key for the same file on two machines with different checkout paths and the same settings, and confirm identical keys. Change a declared environment value and confirm the key changes.",
    dep: ["config-loader", "determinism"]
  },
  "persistent-store": {
    s: "The on-disk or shared storage that holds cache entries between runs, with atomic writes, size limits and eviction of old entries.",
    d: "Entries live in a directory or database, keyed by hash and stored compressed with a header including versions. Writes go to a temporary file and are renamed into place, so parallel workers and crashes never leave a half-written entry. A size or age limit evicts the least recently used. A shared remote store lets a build server fill the cache for developers. Reads must validate integrity, since a truncated entry would otherwise be served as valid output. Concurrency, corrupt entries and growth over months are the practical difficulties.",
    k: ["Many files in a directory vs a single database file: files are simple and parallel-friendly but slow to scan; one database is compact and faster to query and contends on writes.", "Local only vs shared remote store: local is simple and private; remote speeds new checkouts and demands trust and key discipline."],
    p: ["Two processes writing the same entry without atomic rename leave a corrupted file that crashes later runs.", "An unbounded cache fills the disk over months of branch switching."],
    v: "Kill the process mid-write during a parallel build, restart it, and confirm no corrupt entry is served, the build succeeds, and a checksum verification passes over the store.",
    dep: ["content-hash-cache", "determinism"]
  },
  "incremental-reparse": {
    s: "Reuses unchanged parts of a previous tree when a file is edited slightly, parsing only the changed region instead of the whole file.",
    d: "The parser keeps the previous tree. Given an edit range, it finds the smallest enclosing nodes that could be affected, re-parses from there, and splices the result in, reusing subtrees outside the edit with positions shifted. It matters for editors and long-running watchers that translate the same file thousands of times. It needs a lexer that can restart at arbitrary points and a tree whose node boundaries are stable. Correctness is difficult: an edit that opens a comment or string changes the meaning of everything after it.",
    k: ["Incremental parsing vs fast full parsing: incremental scales with the edit size and is complex and error-prone; a fast full parse is simple and good enough for small and medium files.", "Reuse nodes by identity vs copy them: reuse is free and risks stale mutable state; copying is safe and erodes the benefit."],
    p: ["An edit that opens an unterminated comment reuses nodes after it that are no longer code.", "Reused nodes carry old locations that were not shifted, producing wrong diagnostics."],
    v: "Apply a thousand random edits, incrementally reparse after each, and compare the tree to a full parse of the same text. Confirm they are identical every time.",
    dep: ["parser-core", "node-locations", "lexer"]
  },
  "arena-allocation": {
    s: "Allocates tree nodes and strings from large contiguous blocks that are freed all at once, making parsing fast and reducing memory overhead and collector pressure.",
    d: "Instead of allocating each node separately, the parser takes space from a block by advancing an offset, and the whole block is released when translation of the file ends. Nodes refer to each other by index or compact pointer instead of full references. It improves cache locality, removes per-node bookkeeping and removes frees during the run. The cost is flexibility: nodes cannot be individually freed, and long-lived references past the arena's life are unsafe. It matters most in tools written for speed and in memory-limited environments.",
    k: ["Arena with indices vs individually allocated objects: arenas are fast and compact and make tree editing and long-lived references awkward; objects are flexible and slower.", "One arena per file vs a shared one: per-file frees memory promptly and prevents cross-file references; shared allows reuse and lengthens lifetimes."],
    p: ["A reference kept after the arena is released points at reused memory and gives corrupt output.", "Large generated files exhaust a fixed-size arena and fail with an out-of-memory error."],
    v: "Translate a very large generated file and a thousand small files in sequence. Confirm peak memory returns to baseline between files and does not grow with the number of files processed.",
    dep: ["node-type-definitions", "string-interning"]
  },
  "string-interning": {
    s: "Stores each distinct identifier and string once and refers to it by a small handle, so comparisons are integer checks and memory is shared.",
    d: "Identifiers repeat constantly across a program. The lexer looks each up in a table and returns a handle for the single stored copy. Scope lookup, keyword detection and renaming then compare handles rather than character sequences, and hash tables key by handle. The table lives as long as the compilation session. Interning cost is a table lookup per token, repaid on every later comparison. Handles from different tables must never be mixed, and a global table grows without bound in a long-running process.",
    k: ["Intern all identifiers vs only keywords: interning everything speeds up scope and rename work and holds names in memory; keywords only is lighter and leaves comparisons by text.", "Global table vs per-session table: global shares across files and leaks in long-running tools; per-session releases memory and repeats work."],
    p: ["Comparing handles from two different sessions gives false mismatches or matches.", "A watch process with a global table grows steadily as renamed variables accumulate."],
    v: "Parse a large file twice and confirm the identical identifiers resolve to one table entry each, and that a long watch run stays flat in memory after table cleanup between sessions.",
    dep: ["lexer", "arena-allocation"]
  },
  "fixture-tests": {
    s: "Directories each holding an input file, options and expected output, run automatically so every transform's behavior is shown as concrete before and after code.",
    d: "A harness discovers fixture folders, runs the pipeline with the options file, and compares generated code to the expected file, reporting a diff on mismatch. Fixtures are small, focused on one construct and named for the case, such as the edge it covers. Error fixtures hold the expected message. Because the files are readable, they double as documentation of what each transform does. An update mode rewrites expectations, which needs review, since a blindly updated fixture proves nothing.",
    k: ["Expected output files vs inline assertions: files are readable and diff well; inline assertions keep a case next to its test and clutter test code.", "One fixture per case vs large programs: small cases locate failures; large programs catch interactions and are harder to diagnose."],
    p: ["Blindly accepting regenerated expectations bakes a regression into the suite.", "Fixtures that cover only the common path leave edge cases such as holes and getters untested."],
    v: "Break one transform deliberately and confirm exactly the fixtures for that construct fail with a readable diff, while unrelated fixtures stay green.",
    dep: ["programmatic-api", "output-snapshots"]
  },
  "output-snapshots": {
    s: "Compares generated output to stored snapshots across many inputs, to show any change in emitted code from a refactor or upgrade.",
    d: "A snapshot suite translates a corpus of real and synthetic files and stores outputs. After a change, the same corpus is rerun and any difference is shown. Changes are either intended and approved, or caught as regressions. Because output is deterministic, differences are meaningful. Large corpora give wide coverage cheaply, but a snapshot only says output changed, not that the old or new output is correct, so approval needs judgment. Snapshots also measure output size, which is itself a product quality.",
    k: ["Store full snapshots vs hashes: full text allows reading diffs; hashes are compact and say only that something changed.", "Real-world corpus vs synthetic cases: real code finds surprises; synthetic code targets known edges and is easier to minimize."],
    p: ["Approving a large snapshot diff without reading it, because it is tedious, lets a regression through.", "Nondeterministic output makes snapshots fail randomly and teaches people to ignore failures."],
    v: "Refactor the printer without behavior change and run the corpus. Confirm zero snapshot differences, then change one transform and confirm differences appear only in files using that construct.",
    dep: ["fixture-tests", "determinism"]
  },
  "execution-equivalence": {
    s: "Runs original and translated programs in real target runtimes and compares their observable behavior, proving the translation preserved meaning.",
    d: "A suite of programs prints or asserts results; each runs once as written on a runtime that supports the source and once translated on the oldest target. Outputs, thrown errors and ordering of side effects are compared. Programs exercise edge cases of each transform, such as evaluation order, closures in loops and getters. It tests the actual claim of a transpiler, which fixtures cannot: that the output works. It requires real runtime versions in the test environment, and failures can come from runtime bugs rather than the transform.",
    k: ["Real old runtimes vs emulated environments: real runtimes find actual bugs and are hard to install and maintain; emulation is convenient and may behave differently.", "Self-checking programs vs comparing printed logs: self-checking is robust and harder to write; log comparison is easy and sensitive to irrelevant differences."],
    p: ["Running translated code only on the newest runtime hides output that fails on the oldest.", "A runtime bug reported as a transform bug sends effort to the wrong place."],
    v: "Run the suite on each listed target runtime for a build and confirm that every program passes in translated form and matches the original's results, including thrown error types.",
    dep: ["semantic-preservation", "target-matrix", "conformance-suite"]
  },
  "conformance-suite": {
    s: "The language's official test programs, run through the parser and transforms to show the tool accepts what is valid, rejects what is invalid and preserves behavior.",
    d: "Standards bodies publish thousands of tests, each a small program with expected results and metadata about required features. The harness runs each through parse-only, parse and print, and translate and execute, and records pass, fail and skipped with reasons. Tests for unsupported proposals are tagged and excluded explicitly, so the list of known failures is tracked and shrinks. It is the broadest source of edge cases, written by people who read the specification closely, and a pass rate is a meaningful quality number.",
    k: ["Track known failures in an allowlist vs require all to pass: an allowlist lets the suite stay green while showing progress; requiring all blocks merges on features not yet supported.", "Run all tests every time vs a sampled subset: all gives full coverage and takes long; a subset is quick and misses rare cases."],
    p: ["An allowlist that is never revisited hides regressions: a test that now fails stays listed as already failing.", "Tests that need a specific runtime feature fail on older targets and are misread as transform bugs."],
    v: "Run the full suite and confirm the pass count matches the recorded baseline, the allowlist contains only still-failing tests, and a deliberately broken transform increases failures in its feature area.",
    dep: ["parser-core", "execution-equivalence"]
  },
  "idempotence-checks": {
    s: "Verifies that translating already-translated output changes nothing, and that reprinting a parsed tree and parsing it again yields the same tree.",
    d: "Two properties are tested over a corpus. Round trip: parse, print, parse again and compare trees. Idempotence: run the pipeline on its own output and compare to the first result, which fails if a transform leaves behind syntax it should have removed or applies twice. These checks need no expected outputs, so any file serves as a test. They catch printer bugs, missing parentheses, helper duplication and transforms that do not recognize their own output. They do not prove correctness, since both runs can agree on the same wrong answer.",
    k: ["Compare trees ignoring locations vs compare text: trees tolerate formatting changes; text is stricter and fails on harmless differences.", "Run on the whole corpus each time vs sampled: whole catches everything and costs time; sampling is faster and less thorough."],
    p: ["Treating a pass as proof of correctness, when both passes share a bug, gives false assurance.", "A transform that adds a helper import each run fails idempotence and duplicates imports."],
    v: "Translate every file in a corpus twice, with the second run's input being the first run's output, and confirm byte-identical output and no extra helpers or imports.",
    dep: ["code-generator", "helper-injection", "output-snapshots"]
  },
  "differential-fuzzing": {
    s: "Generates many random programs, runs each before and after translation, and reports any difference in behavior, finding bugs no fixture thought of.",
    d: "A generator builds valid programs from the grammar, biased toward the constructs under test, with deterministic seeds. Each program is run on a reference runtime as written and, after translation, on the target, and outputs are compared. When a difference appears, a reducer shrinks the program by deleting parts while the difference persists, giving a small reproduction. The generator must avoid undefined or non-deterministic behavior such as random values and timing. It is effective at finding interactions between transforms and unusual combinations of syntax.",
    k: ["Grammar-based generation vs mutating real programs: grammar-based reaches odd combinations; mutation stays realistic and finds fewer structural bugs.", "Automatic test-case reduction vs manual: automatic reduction yields small, reportable cases at the cost of a reducer to maintain; manual is slow and loses details."],
    p: ["Programs whose output depends on timing or object ordering report false differences, burying real ones.", "A generator that never produces a construct leaves that transform untested while the run looks healthy."],
    v: "Seed a known transform bug and confirm the fuzzer finds a differing program within a set budget and the reducer shrinks it to a few lines that still reproduce the difference.",
    dep: ["execution-equivalence", "ast-validation", "parser-core"]
  }
});
