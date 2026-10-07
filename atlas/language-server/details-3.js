// Details for the language server plate, part 3: project model, parsing, semantic analysis.
ATLAS.details("language-server", {
  "workspace-folders": {
    s: "The set of root directories the client has opened, which can change at runtime, and which bound where the server looks for projects and which files it owns.",
    d: "Initialization supplies one or more roots, and the client later notifies of added or removed folders. The server maps each root to discovery scans and watch patterns, and treats files outside any root as standalone. Multi-root workspaces may contain unrelated projects with different toolchains. Hard cases are roots nested inside each other, roots that are only part of a larger project, and a single file opened with no folder at all, which still deserves basic features.",
    k: ["One analysis session across all roots vs one per root: a shared session finds cross-root references, but couples unrelated projects' memory and failures.", "Treating files outside roots as detached vs refusing: detached mode keeps features working for loose files, but with a guessed, limited project model."],
    p: ["A root nested in another gets discovered twice, doubling memory and producing duplicate diagnostics.", "Removing a folder without dropping its cached analysis leaves its memory held until restart."],
    v: "Add a second folder at runtime, confirm its project loads and appears in workspace symbols, then remove it and confirm its symbols vanish and memory returns near the earlier level.",
    dep: ["initialization", "project-discovery"]
  },
  "project-discovery": {
    s: "Finds the build manifests and project files under the workspace roots and decides which projects exist, which files belong to each, and which are loaded first.",
    d: "The server scans roots for known manifest names, honors ignore rules, and chooses between manifests where several apply, such as a workspace manifest above a package manifest. It also accepts explicitly configured project files or a build-generated description. The result is a list of projects handed to build system integration. It is hard to do cheaply: scanning a monorepo on every start is slow, so results are cached and refreshed by watchers, and ambiguous layouts need predictable tie-breaking.",
    k: ["Automatic discovery vs explicit user configuration: automatic works out of the box, but guesses wrong in unusual layouts; explicit is exact, but demands setup.", "Scanning the whole tree vs walking up from opened files: whole-tree finds everything, but is slow; walk-up is fast, but misses unopened projects."],
    p: ["Descending into dependency or output folders finds thousands of irrelevant manifests and stalls startup.", "A file not covered by any discovered project silently gets no analysis, with no message explaining why."],
    v: "Open a monorepo with fifty packages and confirm discovery completes within a few seconds, lists the expected projects, and that a file outside any project shows a visible notice rather than empty results.",
    dep: ["workspace-folders", "file-watching", "build-system-integration", "settings-and-configuration"]
  },
  "build-system-integration": {
    s: "Asks the project's build tool for the authoritative list of source files, dependencies and compiler options, instead of the server guessing them.",
    d: "The server invokes the build tool's metadata command, or reads a compilation database or generated description, and converts the result into its project model: targets, their roots, dependency edges, feature flags and target platform. Re-running is needed when manifests change. The difficulty is the boundary: the build tool may be slow, may need network access, may fail when the code is broken, and its output format changes, so the server needs timeouts, caching and a degraded mode.",
    k: ["Querying the real build tool vs reimplementing its rules: querying is accurate and tracks new features, but depends on the tool being installed and quick.", "Fresh query on every change vs caching: fresh is correct, but slow; cached is quick, but stale after manifest edits."],
    p: ["A broken manifest makes the metadata command fail, and the server loses the entire project model instead of keeping the last good one.", "A metadata query that downloads dependencies hangs offline machines at startup."],
    v: "Corrupt a manifest while the server runs and confirm the old project model stays in use with a visible error, then fix it and confirm the model refreshes without restarting the server.",
    dep: ["project-discovery", "out-of-process-helpers", "module-graph", "progress-reporting"]
  },
  "build-script-output": {
    s: "Runs project-defined pre-build steps, or reads their saved results, to learn about generated source files, environment variables and extra compiler settings analysis needs.",
    d: "Many projects generate code or compute settings during build. The server runs those steps in an isolated process, or reads results the build already produced, and records the output: generated file locations, configuration flags and environment values. These become inputs to analysis. The difficulties are cost, since running them can take minutes, and trust, since they execute arbitrary project code. Failures must be reported without disabling features for unaffected code.",
    k: ["Running build steps in the server's setup vs reading existing build output: running is self-contained, but slow and risky; reading is fast, but requires a prior build.", "Re-running on every source change vs on manifest changes only: manifest-only is cheap, but misses steps that depend on source."],
    p: ["Generated files absent because the step was skipped make every use of generated names look undefined.", "A step that writes into the source tree triggers file events that retrigger the step in a loop."],
    v: "Open a project with a generation step on a clean checkout and confirm the generated module resolves after the step completes, with the step's run visible in progress and logs and no repeated reruns.",
    dep: ["build-system-integration", "out-of-process-helpers", "trust-boundaries", "virtual-file-system"]
  },
  "toolchain-and-library-sources": {
    s: "Locates the standard library and installed dependencies' source code, so that names from them resolve, and navigation can enter them.",
    d: "The server asks the toolchain where its standard library sources live, and the build tool where fetched dependencies are stored, then registers those directories as read-only roots in the project model with their own dependency edges. Analysis then treats them like any other library. They are large: the standard library alone can dwarf the user's project, so their results are cached or indexed ahead. Missing sources and version mismatches degrade analysis in ways users blame on the server.",
    k: ["Analyzing library sources from scratch vs loading prebuilt summaries: from scratch is simple and exact, but slow on startup; summaries are fast, but need a second format.", "Read-only treatment of library roots vs allowing edits: read-only prevents accidental changes and skips watching, but surprises users who patch dependencies."],
    p: ["A toolchain installed without its sources leaves common types unresolved with no explanatory message.", "Library sources of a different version than the one being built give subtly wrong types."],
    v: "Resolve a standard library type through hover and definition, confirm the target file belongs to the installed toolchain's version, and confirm removing the sources produces one clear message instead of silent failures.",
    dep: ["build-system-integration", "module-graph", "prebuilt-library-index"]
  },
  "module-graph": {
    s: "The project model as a graph: compilation units with their root files, dependencies, features, target platform and the files each contains.",
    d: "Each node is a unit that is compiled together, with a root file, a set of enabled options and dependency edges to other units. Analysis starts from these roots: the module tree under each root defines which files are included, and a file may belong to several units or to none. The graph is an input to the query engine, so changing it invalidates broadly. It is hard because the same file can be analyzed under multiple configurations, and features must pick one sensibly.",
    k: ["One analysis per file vs one per file and configuration: single is cheaper and simpler, but shows only one variant's behavior.", "Replacing the whole graph on change vs patching it: replacing is simple, but invalidates every result even for a tiny change."],
    p: ["A file included by two units shows diagnostics from one configuration in the context of the other.", "Cyclic or inconsistent dependency edges from a malformed manifest cause infinite loops in resolution."],
    v: "Open a file shared by two units with different options and confirm features follow the unit chosen by the editor, and that switching the chosen unit changes diagnostics accordingly.",
    dep: ["build-system-integration", "project-discovery", "input-revisions"]
  },
  "conditional-compilation": {
    s: "Handles code enabled or disabled by build flags, features or target platform, deciding which regions are active and showing inactive ones differently.",
    d: "Source can contain regions that exist only when a flag is set. The project model supplies the active flag set, the parser or preprocessor evaluates conditions, and inactive regions are either skipped or parsed but excluded from resolution. Editors usually gray out inactive code. The difficulty is that everything depends on a flag combination, so a different choice changes names and types, and code inactive in the chosen configuration gets no diagnostics or navigation.",
    k: ["Excluding inactive regions vs analyzing them under assumed flags: excluding is faithful to the build, but hides real errors; assuming finds them, but may report impossible ones.", "Fixed flag set vs per-file user selection: fixed is simple and predictable, but editing platform-specific code needs a way to switch."],
    p: ["Editing inside an inactive region gives no completions or errors, and users think the server is broken.", "Evaluating a condition with the wrong target platform activates the wrong declaration and breaks resolution."],
    v: "Open a file with a platform-specific block, confirm it is grayed out and gives no diagnostics under the default platform, then enable that platform and confirm the block activates with working navigation.",
    dep: ["module-graph", "macro-expansion", "settings-and-configuration", "lexer"]
  },
  "settings-and-configuration": {
    s: "User and workspace options that tune the server, such as which checks run, which features are on and which paths to use, read from the client and files, and applied live.",
    d: "Settings arrive in initialization options, pull requests to the client for a configuration section, and change notifications. The server layers defaults, user, workspace and folder values, validates them against a schema, and applies each category appropriately: some immediately, some by restarting analysis or reloading the project. Hard parts are discoverability and safety: settings accumulate, clients present them differently, and some change memory or time costs dramatically.",
    k: ["Pull configuration from the client vs reading files directly: pulling follows the editor's scoping rules, but files work identically across clients.", "Live-applied vs restart-required options: live gives immediate feedback, but needs every consumer to handle change correctly."],
    p: ["An invalid value is silently ignored, so the user believes an option is active when it never took effect.", "A setting that triggers a full project reload is changed repeatedly by a settings sync tool."],
    v: "Change a setting that disables a check category and confirm diagnostics of that category disappear without a restart; set an invalid value and confirm a visible error naming the setting.",
    dep: ["initialization", "json-rpc-dispatch"]
  },
  "project-reload": {
    s: "Rebuilds the project model after manifests, lock files or settings change, while keeping the old model serving requests until the new one is ready.",
    d: "A watcher event on a manifest, or a setting change, schedules a reload: re-run discovery and the build metadata query, diff the new model against the current one, and swap it in as a single input change. Unchanged units keep their memoized results. During reload the server keeps answering from the old model. What makes it hard is cost and consistency: reloads can take many seconds, edits keep arriving, and a failed reload must leave the last good model in place.",
    k: ["Swap after a complete reload vs incremental updates while loading: swapping is atomic and simple, but delays benefits; incremental is faster to show, but exposes partial states.", "Automatic reload on every manifest write vs on save only: automatic stays correct, but fires mid-edit with half-written manifests."],
    p: ["A reload that discards all memoized analysis turns a one-line manifest change into a full reanalysis.", "Reloading while the build tool holds a lock fails, and the server keeps retrying in a tight loop."],
    v: "Add a dependency to a manifest and confirm the new dependency's names resolve within seconds, features kept responding during the reload, and unrelated units show no recomputation in the trace.",
    dep: ["build-system-integration", "file-watching", "module-graph", "debounce-and-throttle", "input-revisions"]
  },
  "lexer": {
    s: "Splits source text into tokens such as identifiers, literals, operators and comments, never failing: unknown or malformed text becomes error tokens rather than an abort.",
    d: "The lexer scans characters and produces tokens with kinds and byte lengths, including whitespace and comments as tokens so the text can be rebuilt exactly. It handles nested comments, string and raw string forms, numeric literal variants and escape sequences, flagging malformed ones rather than stopping. It must restart from arbitrary points for incremental use, so lexer state at a boundary matters. The hard part is context: some languages need state to lex template strings or embedded sections.",
    k: ["Tokens with attached errors vs failing on bad input: attaching keeps parsing alive on half-typed code, but every consumer must check error flags.", "Lexing the whole file vs re-lexing only the edited region: whole-file is simple and fast enough for most files, but region-based avoids repeated work on huge ones."],
    p: ["An unclosed string or comment swallows the rest of the file and makes everything after it appear as a single error token.", "A restart point inside a multi-line token produces different tokens than a full lex, creating subtle drift."],
    v: "Lex a file after inserting a lone quote mark near the top and confirm the token stream is still produced, and that re-lexing only the edited region gives the same tokens as lexing the whole file.",
    dep: []
  },
  "incremental-parsing": {
    s: "Updates the syntax tree after an edit by re-parsing only the affected region and reusing untouched subtrees, rather than rebuilding the whole tree.",
    d: "Given the old tree and an edit range, the parser finds the smallest enclosing node that can be reparsed in isolation, such as a block or item, re-lexes and reparses that text, and splices the new subtree in if it ends where the old one did. Otherwise it widens the region or reparses the file. Subtree reuse also lets later analysis recognize unchanged nodes. It is hard because validity of reuse depends on grammar context, and a mistaken splice yields a tree that differs from a clean parse.",
    k: ["Reparsing a bounded block vs reparsing the whole file: block reparsing scales with edit size, but needs grammar-aware boundaries and a fallback.", "Reusing nodes via tree identity vs always producing fresh nodes: reuse enables cheap equality for early cutoff, but needs structural sharing."],
    p: ["Reuse across a changed delimiter produces a tree different from a fresh parse, a bug that appears only in long sessions.", "A fallback that triggers on most edits removes the benefit while keeping the complexity."],
    v: "After each of ten thousand random edits, compare the incrementally updated tree against a fresh parse of the same text, and confirm they are identical every time, with the incremental path taken for most edits.",
    dep: ["lexer", "error-tolerant-parsing", "syntax-trees", "incremental-edits"]
  },
  "error-tolerant-parsing": {
    s: "Builds a useful tree from invalid code by recovering at known synchronization points, inserting missing pieces and wrapping garbage in error nodes instead of stopping.",
    d: "On an unexpected token the parser records an error and chooses a recovery: skip tokens until one that can start or end something sensible, treat the missing token as present, or close the current construct early. The tree stays a complete representation, with error nodes marking the damage. The aim is that code near the cursor and code after the mistake still parse normally, so completion and diagnostics keep working. Recovery quality is hard to measure and easy to regress.",
    k: ["Recovery via synchronization tokens vs full error-correcting algorithms: sync tokens are fast and predictable, but sometimes discard more than needed.", "One error node per mistake vs best-guess repair: error nodes are honest, but consumers must tolerate them; repairs read better, but can mislead."],
    p: ["A missing closing brace makes the rest of the file parse as part of one function, breaking every feature below it.", "Recovery that loops without consuming a token hangs the server on specific malformed inputs."],
    v: "Delete a closing delimiter in the middle of a large file and confirm declarations after it still appear in the outline and complete correctly, with a single error reported at the delimiter's expected position.",
    dep: ["lexer", "syntax-trees", "trivia-and-lossless-text"]
  },
  "syntax-trees": {
    s: "The lossless tree of every token and node in a file, with parent links, text ranges and cheap navigation, which all editor features start from.",
    d: "A green-and-red style design stores an immutable, position-independent tree of nodes and tokens that can be shared and compared, plus a lightweight cursor layer that adds parent pointers and absolute offsets on demand. Every byte of the file appears exactly once, so text can be recovered and edits mapped. Nodes carry kinds only, and typed wrappers add meaning. The hard part is memory and speed: trees for thousands of files are held, so nodes are compact and sharing is aggressive.",
    k: ["Immutable shared nodes vs mutable trees with parent pointers: immutable allows structural sharing and safe concurrent reads, but needs a separate cursor layer for parents.", "Storing kinds only vs rich per-node data: kinds only keep memory low, but push meaning to separate analysis."],
    p: ["Holding trees for every file in a large workspace dominates memory unless they are dropped and reparsed on demand.", "Comparing nodes by position instead of identity breaks after any edit above them."],
    v: "Parse a file, concatenate every token's text in order, and confirm it equals the original byte for byte, including for files with errors; measure resident tree memory per megabyte of source against budget.",
    dep: ["lexer", "trivia-and-lossless-text", "interning"]
  },
  "trivia-and-lossless-text": {
    s: "Keeps whitespace and comments in the tree as ordinary tokens, so that the tree reproduces the exact original text and edits and formatting can preserve layout.",
    d: "Instead of discarding whitespace and comments, the lexer emits them and the parser attaches them to nearby nodes or keeps them as siblings. This lets refactorings change one construct without disturbing surrounding formatting, lets a formatter work on the tree, and lets documentation comments be associated with declarations. The decision of which node owns a comment is a policy, hard to get right: a comment between two items can sensibly belong to either, and users notice when a refactoring moves it wrongly.",
    k: ["Trivia as tree tokens vs side tables: tokens keep order and exact reconstruction, but every traversal must skip them; side tables keep trees clean, but can drift.", "Attaching comments to the following item vs preceding: following matches documentation habits, but misplaces trailing comments on the same line."],
    p: ["A refactoring that moves a node without its leading comment separates documentation from the code it describes.", "Whitespace-sensitive constructs treated as trivia lose meaning when edited by tools."],
    v: "Apply an extract refactoring to a function with leading doc comments and inline comments, and confirm every comment stays attached to the same construct and the untouched lines are byte-identical afterwards.",
    dep: ["lexer", "syntax-trees"]
  },
  "macro-expansion": {
    s: "Runs the language's code-generating constructs, whether declarative or procedural, so the analysis sees the generated code and can map results back to source.",
    d: "A macro call is replaced by its expansion, itself parsed into a tree with a span map linking generated tokens to original ones. Expansion can nest and recurse, and expanded names carry a hygiene context that affects resolution. Procedural kinds run user code, usually in a separate process, and may be slow or fail. The hard parts are unfinished macro input, since the user is typing inside the call, cycles and recursion limits, and mapping positions both ways for features inside expansions.",
    k: ["Expanding eagerly during name resolution vs lazily on demand: eager gives a complete picture, but pays for macros nobody queries; lazy is cheaper, but complicates resolution order.", "In-process expansion vs sandboxed helper: in-process is fast, but one crash or hang takes the server down."],
    p: ["Macro input that is syntactically broken mid-typing produces expansion errors that cascade through the file.", "A recursive macro without a depth limit exhausts memory or hangs analysis."],
    v: "Complete completion and go-to-definition inside a macro call's arguments and confirm results map back to source positions; give a self-recursive macro and confirm a bounded-depth error, not a hang.",
    dep: ["syntax-trees", "out-of-process-helpers", "name-resolution", "error-tolerant-parsing"]
  },
  "typed-syntax-wrappers": {
    s: "A typed layer over the untyped syntax tree, with one type per construct and accessors for its children, giving features safe, readable access to tree structure.",
    d: "Each wrapper holds a node and exposes methods such as a function's name, parameter list and body, returning absent values when the child is missing from broken code. Casting checks the node's kind. Wrappers are usually generated from the grammar description, so grammar changes propagate. They make feature code concise and prevent accessing the wrong child index. The design challenge is that every accessor returns an optional value, since an error-tolerant tree may lack any piece, and callers must handle absence.",
    k: ["Generated wrappers from a grammar vs hand-written: generated stay in sync and cost nothing to extend, but build tooling is required.", "Optional accessors everywhere vs assuming well-formed trees: optional is safe on broken code, but verbose; assuming is concise, but crashes on typing in progress."],
    p: ["Unwrapping an accessor on the assumption that a name always exists crashes the server while the user is mid-typing.", "Hand-maintained wrappers drift from the grammar and silently miss a new child kind."],
    v: "Run every accessor of every wrapper over a corpus of truncated files and confirm none panics, and that each returns absent exactly where the corresponding syntax is missing.",
    dep: ["syntax-trees", "error-tolerant-parsing"]
  },
  "item-tree": {
    s: "A compact per-file summary of declarations without their bodies, so name resolution and signatures do not depend on, or reanalyze, function bodies that did not change.",
    d: "Lowering a file produces a flat list of items with names, kinds, visibility and signatures, and omits the code inside bodies. Because it ignores bodies, editing inside a function leaves the item tree equal, and early cutoff then stops anything that depends only on declarations from recomputing. The tree is also the basis of the module's scope. The difficulty is deciding what belongs in it: too little forces re-reading syntax, too much makes it change on edits it should ignore.",
    k: ["Excluding bodies from the summary vs including everything: excluding enables early cutoff on body edits, but needs a separate body path.", "Per-file summaries vs per-module: per-file aligns with edits and file ids, but modules spanning files need merging."],
    p: ["Including a span or offset in the summary makes it change on every edit above, defeating early cutoff.", "Leaving out an attribute that affects resolution makes resolution wrong until a full recompute."],
    v: "Edit inside a function body and confirm the file's item tree compares equal and that no declaration-level query reruns in the trace; edit a signature and confirm dependent queries do rerun.",
    dep: ["syntax-trees", "typed-syntax-wrappers", "early-cutoff"]
  },
  "name-resolution": {
    s: "Binds each name use to the declaration it refers to, according to scoping rules, imports, shadowing and namespaces, for both module-level names and local variables.",
    d: "Resolution runs at two levels. For items, it computes the set of names visible in each module by combining declarations, imports and glob imports, iterating to a fixed point because imports can depend on each other. For bodies, it walks scopes of blocks, patterns and closures. Results map each use to a definition or to unresolved. It is hard because of order dependence, macro-generated names and ambiguity, and it must still return partial results when some names fail.",
    k: ["Fixed-point module resolution vs on-demand per-name lookup: fixed-point gives complete tables, but recomputes more on change; per-name is lazy, but must handle cycles.", "Reporting unresolved names as errors vs treating them as unknown: errors help users, but a missing dependency produces a flood."],
    p: ["Glob imports that include each other create cycles that never settle without an explicit iteration limit.", "A missing dependency makes every use unresolved and drowns the useful diagnostics."],
    v: "Resolve a name reachable via a glob import, an alias, and a shadowing local, and confirm each lands on the right declaration; remove the import and confirm exactly one unresolved diagnostic at the use.",
    dep: ["item-tree", "import-resolution", "visibility-and-privacy", "macro-expansion", "memoization"]
  },
  "import-resolution": {
    s: "Resolves the paths in import and re-export declarations to modules and items, including across package boundaries, aliases and wildcard imports.",
    d: "Each import path is looked up segment by segment starting from a root determined by the path's form: the current module, a parent, a dependency package or the standard library. Re-exports make one item reachable by several paths, and wildcard imports add all public names. The resolver iterates until nothing new is found. It is hard because the set of names each module exports depends on its imports, creating circular dependencies, and every result depends on the module graph.",
    k: ["Iterative saturation vs ordered single pass: saturation handles circular imports and wildcards, but costs repeated passes on large modules.", "Tracking all reachable paths vs a canonical one: all paths give complete navigation and completion, but multiply stored data."],
    p: ["Two wildcard imports providing the same name create ambiguity that should be an error but gets silently resolved by order.", "A path through a dependency not listed in the manifest resolves in analysis but fails to build."],
    v: "Import an item through a re-export chain across two packages, and confirm it resolves; then import one through a package that is not a declared dependency and confirm an unresolved-import diagnostic.",
    dep: ["item-tree", "module-graph", "visibility-and-privacy", "toolchain-and-library-sources"]
  },
  "visibility-and-privacy": {
    s: "Applies the language's access rules to decide which declarations may be named from where, which affects resolution, completion filtering and diagnostics.",
    d: "Each declaration has a visibility, such as public, module-private or restricted to a scope, and each use site has a location in the module tree. Checking asks whether the use site lies within the region the declaration is visible to. The server uses it to filter completion and imports to only legal choices, and to report access errors with the reason. It is subtle because visibility composes with re-exports, which can widen or narrow reachability, and with generated code, whose origin location may differ from its use site.",
    k: ["Filtering inaccessible names out of completion vs showing them as disabled: filtering reduces noise, but hides items users expect and cannot explain.", "Resolving first and checking visibility after vs during: after produces better error messages, but ambiguity resolution may pick an inaccessible name."],
    p: ["Ignoring visibility in auto-import suggests private items that produce an immediate error on acceptance.", "Treating macro-generated code as located at the call site grants or denies access incorrectly."],
    v: "Complete in a sibling module and confirm private items of other modules are absent while items re-exported publicly appear; use a private item directly and confirm a diagnostic that names its visibility.",
    dep: ["item-tree", "module-graph", "name-resolution"]
  },
  "body-lowering": {
    s: "Converts a function body from syntax into a simplified tree with resolved local scopes and desugared constructs, which inference and later analyses read.",
    d: "The lowered form removes syntactic variety: loops, conditionals with patterns and sugar for common operations become a small set of core expression kinds, and every expression gets an id. A side table maps ids back to syntax for reporting. Locals and their scopes are resolved here. Lowering can be done per body, so one edited function is lowered alone. The hard parts are keeping the mapping from lowered ids to source so diagnostics point at what the user wrote, and tolerating missing pieces by inserting placeholder expressions.",
    k: ["Lowering each body independently vs the whole file: per body gives fine-grained invalidation, but needs per-body ids and source maps.", "Placeholder nodes for missing syntax vs omitting: placeholders keep the structure analyzable, but every later pass must understand and not cascade errors from them."],
    p: ["Lost source mapping makes errors on desugared code point to the wrong place or nowhere.", "Placeholders treated as real expressions generate misleading type errors on code the user has not written yet."],
    v: "Lower a body with an unfinished expression and confirm a placeholder appears, inference still types the rest, and mapping a diagnostic back to source lands on the actual text the user typed.",
    dep: ["typed-syntax-wrappers", "name-resolution", "item-tree"]
  },
  "type-inference": {
    s: "Works out the type of every expression and binding in a body from context, including generic arguments, closures and overloaded operations, tolerating unknowns.",
    d: "For each body, inference walks lowered expressions creating type variables, emits constraints from calls, assignments and annotations, and unifies them, using expected types propagated downward. Method calls are resolved using receiver types, with automatic adjustments. Unresolved variables stay as unknown and absorb errors. Results map expression ids to types. It is the costliest analysis and the most shared: hover, completion, hints and diagnostics all need it, so it is memoized per body and engineered to survive missing code without cascading failures.",
    k: ["Unknown types that suppress follow-on errors vs reporting every mismatch: suppression keeps diagnostics useful on partial code, but can hide real errors beneath one unknown.", "Inferring each body on demand vs eagerly for the file: on demand serves the cursor's function quickly, but project-wide queries pay per body."],
    p: ["One unresolved call turns types downstream into unknown, and completion stops working for the rest of the function.", "Inference differences from the real compiler produce errors the compiler would not report."],
    v: "On a function with an unfinished call, confirm the types of unrelated locals in the same function are still inferred correctly and that completion on them works, and compare inferred types with the compiler's on a corpus.",
    dep: ["body-lowering", "name-resolution", "trait-solving", "constant-evaluation", "memoization", "cycle-recovery"]
  },
  "trait-solving": {
    s: "Decides whether a type satisfies an interface or trait bound and which implementation applies, including generic, conditional and overlapping implementations.",
    d: "A bound query is posed as a goal, such as whether a type implements an interface with given arguments. The solver searches implementations, unifies their heads with the goal, and recursively proves their conditions, with caching of solved goals and cycle handling for recursive bounds. Associated types are projected by normalizing. It is hard because search can be exponential, because conditions can be circular, and because coherence rules decide which implementation wins.",
    k: ["A general logic-based solver vs ad hoc rules: general handles the language's full rules uniformly, but is heavier and harder to bound.", "Depth limits and fallbacks vs exhaustive search: limits guarantee termination and latency, but give up on legitimately deep proofs."],
    p: ["A recursive bound without a cycle check loops until the stack or time budget is exhausted.", "An ambiguous goal resolved by picking the first implementation changes method resolution randomly between runs."],
    v: "Ask the solver about a bound requiring five nested implementations and a recursive bound, and confirm the first proves in a few milliseconds and the second terminates with a defined cycle outcome.",
    dep: ["item-tree", "name-resolution", "memoization", "cycle-recovery"]
  },
  "constant-evaluation": {
    s: "Evaluates compile-time constant expressions, such as array lengths and constant parameters, enough to type check code and display values in hovers.",
    d: "An interpreter runs the constant subset of the language over the lowered body: arithmetic, conditionals, references to other constants, and calls to constant functions, with a step limit. Its results feed types, since sizes can be part of a type, and hover text showing values. Errors such as overflow or division by zero become diagnostics. The hard parts are the size of the supported subset, termination, and consistency: a shortcut that disagrees with the compiler produces wrong types.",
    k: ["Supporting a large subset vs a minimal one: larger gives exact types and hovers, but requires a near-complete interpreter that must match the compiler.", "Step and memory limits vs unbounded evaluation: limits keep the server responsive, but legitimate heavy computations show as unknown."],
    p: ["Unbounded evaluation of a loop blocks the analysis thread and the editor appears frozen.", "Evaluating with different integer sizes than the target platform gives overflow results that differ from the build."],
    v: "Hover a constant defined through three other constants and a conditional and confirm the correct value is displayed; define an infinite loop and confirm evaluation stops at the limit with a diagnostic.",
    dep: ["body-lowering", "name-resolution", "memoization"]
  },
  "lint-analysis": {
    s: "Additional checks beyond errors, such as unused items, unreachable code, style and likely mistakes, which produce warnings and hints, often with attached fixes.",
    d: "Each lint is a small analysis over syntax or typed information that emits a diagnostic with a code and a fix when safe. Control flow analyses find unreachable code and missing returns; usage analyses find unused names. Lints are individually configurable by severity, and the server may also run an external linter on save. The challenge is precision: false positives destroy trust, and lints that need whole-program information cannot run per keystroke.",
    k: ["Running cheap lints live and expensive ones on save: live feedback stays fast, but results for heavy checks lag behind edits.", "Native lints vs external linter output: native are instant and fixable, but cover fewer rules and may differ from the project's own standards."],
    p: ["An unused warning on code that is only used through a macro or reflection makes users delete live code.", "Enabling every lint by default floods new projects with warnings they did not ask for."],
    v: "Write a function with a dead branch and an unused parameter, and confirm each appears with the correct code and range within a second; confirm a use through a macro suppresses the unused warning.",
    dep: ["type-inference", "name-resolution", "body-lowering", "settings-and-configuration"]
  },
});
