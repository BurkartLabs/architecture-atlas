// Compiler plate details, part 1: driver, build integration, diagnostics/editor services, source management.
ATLAS.details("compiler", {
  "command-line-parsing": {
    s: "Turns the argument vector into a structured request: which inputs, which output kind, which options, in what order. It is the first thing every user and build script exercises.",
    d: "The parser walks arguments against a declarative option table, handling short and long forms, joined and separate values, aliases, negations and positional inputs. It expands response files, applies environment-supplied defaults and records the original order, because for some options later flags override earlier ones and for others they accumulate. Output is an option set the rest of the driver queries, never raw strings. Hard parts are backward compatibility with decades of flag spellings, helpful errors for near-miss flags, and keeping the table as the single source of truth for help text and shell completion.",
    k: ["Declarative option table vs hand-written parsing: a table generates help, completion and validation from one source but makes unusual syntaxes awkward; hand parsing is flexible and drifts out of sync with documentation.",
        "Strict rejection vs ignoring unknown flags: strictness catches typos, while tolerance lets one build script drive several compiler versions at the price of silently dropped intent."],
    p: ["Order-sensitive flags (include paths, defines, undefines) handled as an unordered set produce different programs than the author wrote, and only for some build layouts."],
    v: "Run the parser over a corpus of real build command lines from many projects and confirm each yields the expected option set. Round-trip: print the parsed options back as a command line and re-parse to the same set.",
    dep: ["option-model"]
  },
  "option-model": {
    s: "The typed, validated set of settings every stage reads: optimization level, language mode, target features, warning policy and output kind, with defaults and mutual constraints resolved in one place.",
    d: "Raw flags are folded into a single immutable configuration object. Presets such as an optimization level expand into many individual switches, which explicit flags can then override. The model checks conflicts (incompatible modes, features unsupported by the target), derives implied options, and exposes only semantic queries so no stage re-parses strings. It also defines which options affect generated code, and so must be part of any cache key. Difficulty comes from the sheer number of options and the interactions between presets and overrides.",
    k: ["One global options object vs per-stage views: a single object is simple but couples every stage to everything; narrow views make cache keys precise at the cost of more plumbing.",
        "Level presets vs individual pass flags: presets are what users understand, but they hide the pipeline and make 'what did -O2 actually enable' hard to answer without a dump option."],
    p: ["An option that changes output but is omitted from the cache key or build fingerprint yields stale cached objects after the flag changes."],
    v: "Dump the resolved configuration for several flag combinations and diff against golden files. Changing any output-affecting option must change the printed configuration hash used for caching.",
    dep: ["command-line-parsing"]
  },
  "target-selection": {
    s: "Decides what machine, operating system and ABI the output is for, and finds the matching libraries, headers and tools. It is what makes cross-compilation possible.",
    d: "A target description (machine family, vendor-neutral OS, ABI, environment) is parsed from a flag or defaulted to the host. The driver maps it to a target description for the back end, a default language data model (sizes of integer and pointer types), standard library search paths, startup objects and the right linker and assembler. A sysroot flag redirects all of this to a different tree. Hard parts are heuristic toolchain discovery on messy systems and keeping the front end's type sizes consistent with the back end's layout rules.",
    k: ["Target as one triple-like string vs structured fields: a string is easy to pass and compare but is parsed repeatedly and ambiguous; structured fields are safer yet need conversion at every tool boundary.",
        "One binary per target vs one binary with all targets: all-in-one makes cross-compilation trivial but increases binary size and build time; per-target keeps builds lean."],
    p: ["Front-end constants (long integer width, struct alignment) computed from the host instead of the target compile cleanly and then crash on the target."],
    v: "Compile one source file for several targets in a single session and inspect each object file's header: machine, word size, endianness and ABI flags must match the request, and no host paths appear in search order.",
    dep: ["option-model", "target-description"]
  },
  "stage-orchestration": {
    s: "Sequences preprocessing, parsing, checking, optimization, code generation and assembly for each input, runs them in-process or as subprocesses, and schedules independent files in parallel.",
    d: "For each input the driver builds a plan: a small graph of actions whose outputs feed later actions, stopped early depending on the requested output (syntax check, IR, assembly, object, executable). Actions run as direct function calls when stages live in one binary, or as child processes with temporary files when a tool is external. Jobs for separate inputs run concurrently up to a limit. The driver also cleans up temporaries on failure and chooses exit codes. Hard parts are robust cleanup, deterministic temporary names and propagating a failure from deep inside a stage.",
    k: ["In-process stages vs subprocess per stage: in-process avoids startup cost and shares memory; subprocesses isolate crashes and let tools be swapped, at the cost of serialized intermediates.",
        "One process per file vs one for many files: batching amortizes startup and shared state such as parsed headers but loses crash isolation and parallel granularity."],
    p: ["Temporary files named from a process id or timestamp collide under parallel builds or leak after a crash, filling disks on long-lived build machines."],
    v: "Ask for each stopping point (syntax only, IR, assembly, object, executable) and verify the produced artifact kind. Kill the compiler mid-run and confirm no temporary files remain.",
    dep: ["option-model", "target-selection", "linker-invocation"]
  },
  "linker-invocation": {
    s: "Builds the final link command: object files, libraries, startup objects, runtime library and options, then runs the linker. It is the last thing the driver does and a frequent source of user confusion.",
    d: "The driver decides link order, adds default libraries and startup objects for the target, translates options (static, shared, position-independent, symbol visibility, stripping) into linker flags and passes through the user's own. For link-time optimization it supplies a plugin or switches to IR inputs. Errors come from the linker in its own words, so the driver can add context such as which library to add. Hard parts are library ordering for archive semantics, diverse linker dialects and getting runtime libraries onto the line only when something needs them.",
    k: ["Delegate to a separate linker vs integrate one: delegating reuses mature tools and users' choices; integration enables faster links and cross-module optimization with fewer moving parts but is a large project.",
        "Driver-added default libraries vs explicit-only: defaults make hello-world work but surprise freestanding and embedded users; a freestanding mode must turn them all off."],
    p: ["Libraries placed before the objects that need them link fine with shared libraries and fail with archives, so the bug appears only on some platforms."],
    v: "Link a program that needs the runtime library and one that needs none; print the linker command (verbose mode) and confirm the second omits runtime and startup objects when freestanding is requested.",
    dep: ["target-selection", "object-file-writer", "runtime-library"]
  },
  "dependency-files": {
    s: "Writes a list of every file read during a compile so the build system can rebuild exactly when one of them changes, including headers found through search paths.",
    d: "While compiling, the source file manager records each file actually opened: sources, includes, imported module interfaces, response files, even configuration files that affected behavior. At the end it emits them in a format the build system consumes (target followed by prerequisites). This is the compiler's half of correct incremental builds: only the compiler knows which files a translation unit really used, since that depends on conditional includes and search order. Hard parts are including files that were looked for but missing, generated files and path normalization across build directories.",
    k: ["Emit dependencies as a side effect of compile vs a separate scan step: side effect is exact and free; a scan is faster for planning builds before compiling but can disagree with the real compile.",
        "Record only opened files vs also failed lookups: recording misses lets the build notice a newly added shadowing header, at the cost of much longer dependency lists."],
    p: ["Omitting missing-file probes means adding a header earlier in the search path leaves stale objects that silently use the old header."],
    v: "Compile a file that includes a header via two search paths, check the dependency file lists only the one used, then add a header earlier in the path and confirm the build system rebuilds it.",
    dep: ["source-file-manager", "import-resolution"]
  },
  "incremental-compilation": {
    s: "Reuses results from a previous compile of the same unit when only part of it changed, tracking what each result depended on so only invalidated work is redone.",
    d: "The compiler records a dependency graph between fine-grained items (declarations, function bodies, type checks, optimized functions) and fingerprints their inputs. On the next run it loads the old graph, compares fingerprints, and re-executes only what changed, reusing stored results for the rest. It can work at file granularity, which is simple, or at item granularity, which saves far more but demands precise dependency tracking. Hard parts are over-invalidation, under-invalidation, stable fingerprints for results containing pointers, and the cost of loading and saving the graph.",
    k: ["Coarse (per-file) vs fine (per-item) reuse: per-file is easy and robust but rebuilds more; per-item can finish edits in milliseconds yet needs the whole compiler written in a query style.",
        "Persist results on disk vs recompute from fingerprints: storing results is faster to reuse but large; recomputing from cheap fingerprints saves space and risks re-doing work."],
    p: ["A missed dependency edge reuses a stale result and produces a wrong binary that only a clean build fixes, the hardest class of incremental bug to notice."],
    v: "Edit a function body, rebuild, and verify only that function and its callers' dependents were recompiled. Then compare the result against a clean build: output must be byte-identical.",
    dep: ["demand-driven-queries", "dependency-files", "uniquing"]
  },
  "compilation-cache": {
    s: "Stores compile outputs keyed by a hash of every input that affects them, so identical work on this or another machine is replaced by a lookup.",
    d: "The key hashes the preprocessed source (or its dependencies and contents), compiler identity, resolved options, target and any environment that leaks into output. A hit returns the object file and diagnostics; a miss compiles and stores. Caches may be local directories or shared remote services serving a whole team and CI fleet. It only works if output is deterministic and keys are complete. Hard parts are key correctness, paths embedded in debug info that vary by checkout location, and cache poisoning from a bad entry that spreads to everyone.",
    k: ["Key on preprocessed text vs on source plus dependency hashes: preprocessed text is exact but requires paying for preprocessing; dependency hashes skip it and risk missing hidden inputs.",
        "Local vs shared remote cache: shared caches multiply hit rates across machines but add network latency, trust and invalidation questions."],
    p: ["Absolute paths or timestamps inside the object make keys or outputs vary by machine, collapsing hit rate to near zero without any visible error."],
    v: "Build the same commit from two different checkout directories on two machines; the second must be nearly all cache hits and the resulting binaries byte-identical.",
    dep: ["option-model", "determinism-of-output", "dependency-files"]
  },
  "module-interfaces": {
    s: "A compiled, importable description of a unit's public declarations, so dependents read a compact precomputed interface instead of reparsing source or headers.",
    d: "A module is compiled once to an interface file holding its exported names, types, templates or generics and inline-able bodies in a serialized form. Importers load it lazily, resolving only the declarations they touch. This replaces textual inclusion, where every file re-reads every header, and makes dependencies explicit and acyclic. The compiler must order builds so each interface exists before its importers, which requires dependency scanning. Hard parts are deciding what is part of the interface (inline bodies, private types in layouts), stable serialization and visibility across modules.",
    k: ["Binary interface files vs textual headers: binary loads faster and is isolated from macros but is compiler-version specific; text is portable and inspectable but slow and context-sensitive.",
        "Expose inline bodies in the interface vs hide them: exposing enables cross-module inlining but ties dependents' rebuilds to implementation changes."],
    p: ["Changing a private detail that leaks into the interface (struct layout, inline body) forces a rebuild of every dependent despite no visible API change."],
    v: "Change a function body not marked inline in a widely imported module; only that module recompiles and no dependent rebuilds. Change an exported signature and every direct importer rebuilds.",
    dep: ["import-resolution", "ast", "scope-and-symbol-tables"]
  },
  "distributed-compilation": {
    s: "Ships preprocessed or self-contained compile jobs to remote workers and brings back objects, so large builds use a whole fleet instead of one machine's cores.",
    d: "A coordinator packages everything a compile needs (preprocessed source or a hermetic tree of inputs, the compiler binary or its hash, options) and sends it to a worker with identical toolchain, then returns the object file and diagnostics. It pairs naturally with the compilation cache. It demands hermetic inputs: the job must not read files that only exist locally. Hard parts are toolchain consistency across workers, upload cost for large inputs, scheduling, and diagnosing failures that reproduce only remotely.",
    k: ["Ship preprocessed source vs a full input tree: preprocessed is simple and self-contained but big and loses build-wide sharing; hermetic trees dedupe files across jobs but need exact dependency lists.",
        "Remote execution vs remote cache only: execution adds raw parallelism; cache-only is simpler and cheaper but only helps with repeated work."],
    p: ["A worker with a slightly different compiler or header version yields objects that link but behave differently, with no local trace of the difference."],
    v: "Build a large project locally and distributed; objects must be byte-identical and wall-clock time must fall roughly with worker count until upload or link time dominates.",
    dep: ["compilation-cache", "dependency-files", "stage-orchestration"]
  },
  "diagnostic-engine": {
    s: "Collects, classifies, deduplicates and routes every error, warning and note produced by any stage, with a source location and a stable identifier for each.",
    d: "Stages report through one interface, passing a diagnostic kind, a location, format arguments and optional related notes and fix-its. The engine maps each to a severity under the current warning policy, suppresses duplicates and cascades (an error caused by a previous error), counts errors to decide whether to continue, and forwards the result to a consumer: terminal text, a structured format, or an editor. Message text lives in a central catalog for consistency and localization. Hard parts are cascading errors, ordering across parallel stages and keeping messages precise.",
    k: ["Report immediately vs buffer and sort: immediate output is simple and lets users start reading; buffering gives deterministic, source-ordered output across parallel work at the price of latency.",
        "Typed diagnostic definitions vs free-form strings: typed definitions give stable IDs, localization and tooling; strings are quick to add but impossible to track."],
    p: ["After a missing declaration, every later use reports its own error, burying the single real mistake under hundreds of follow-ups."],
    v: "Feed a file with one root-cause mistake and count reported errors: exactly one should appear. Run the same file with parallel front-end threads ten times and verify identical ordered output.",
    dep: ["source-locations", "warning-controls", "message-rendering"]
  },
  "message-rendering": {
    s: "Formats diagnostics for a reader: the source line, a caret or underline for the span, labeled secondary locations and notes, plus a structured form for machines.",
    d: "Given a diagnostic and the source manager, the renderer prints file, line and column, the offending source line, and underlines the exact span. It handles tabs and wide characters so carets align, merges multi-line spans, shows related notes (where a name was declared, what type was expected) and optionally color. A machine-readable format (structured records with spans and fix-its) feeds editors and CI annotators. Hard parts are alignment with variable-width text, very long lines and macro or generated code where the user-visible location differs from the real one.",
    k: ["Rich snippets with labels vs one-line messages: snippets cut debugging time dramatically but depend on accurate spans; one-liners are robust and easy for tools to parse.",
        "Render at report time vs from stored structured data: structured storage allows many output formats from one record; eager rendering is simpler but locks in one."],
    p: ["Column computed in bytes rather than characters puts carets under the wrong text for any line containing non-ASCII characters or tabs."],
    v: "Golden-file test messages for lines containing tabs, wide characters, multi-line spans and macro expansions; carets and labels must land under the exact text in every case.",
    dep: ["diagnostic-engine", "source-file-manager", "source-locations"]
  },
  "fix-it-hints": {
    s: "Attaches machine-applicable edits to diagnostics, such as inserting a missing semicolon or renaming a misspelled identifier, so users and tools can repair code with one action.",
    d: "A diagnostic carries zero or more edits: replace span with text, insert text at a location, remove a span. Producers attach them when the fix is nearly certain, from a missing delimiter, a similar name found by edit distance, a deprecated API with a known replacement. Consumers either print the suggestion or apply it automatically. Edits must not overlap and must be expressed in original source coordinates, not post-expansion ones. Hard parts are confidence (a wrong auto-fix is worse than none) and applying several fixes to one file consistently.",
    k: ["Offer low-confidence suggestions vs only certain ones: more suggestions help novices but, if applied blindly by a tool, can change program meaning; limit automatic application to certain fixes.",
        "Edits as text patches vs syntax-tree rewrites: patches are simple and general; tree rewrites preserve formatting and structure but need a lossless tree."],
    p: ["Applying a fix generated inside a macro expansion edits the macro body or an unrelated file instead of the line the user wrote."],
    v: "Apply all suggested edits on a corpus of broken files automatically and recompile: files marked certain must compile cleanly and keep their original behavior where tests exist.",
    dep: ["diagnostic-engine", "source-locations", "lossless-syntax-tree"]
  },
  "warning-controls": {
    s: "Lets users and projects decide which warnings are errors, which are silenced, and where, by flag, by category, and by in-source annotations.",
    d: "Every warning belongs to a named category. Flags enable, disable or promote categories to errors; annotations in source suppress a category for a region or line; system headers can be exempted wholesale. The engine evaluates this policy at report time using the diagnostic's location. Group names let projects say 'all' or 'extra' without listing individuals. Hard parts are stability (a new warning in a compiler update breaks builds that treat warnings as errors), precedence when flags and source annotations disagree, and avoiding the noise that trains users to ignore everything.",
    k: ["Warnings-as-errors by default vs opt in: defaults keep code clean but break builds on compiler upgrades; opt in lets projects choose when to adopt new checks.",
        "Per-region suppression vs per-line: regions are convenient for generated code but easy to forget open; per-line is precise and noisy."],
    p: ["A newly added warning in a routine compiler upgrade, combined with warnings-as-errors, turns every downstream build red on the same day."],
    v: "Compile a file under policy combinations (category off, promoted to error, suppressed in a region, inside a system header) and assert exactly the expected set of diagnostics and exit codes.",
    dep: ["diagnostic-engine", "option-model", "source-locations"]
  },
  "language-server": {
    s: "Exposes the compiler's front end as a long-running service answering editor requests: completions, go-to-definition, hover types, rename and live errors on unsaved, incomplete code.",
    d: "The server keeps documents in memory, reparses and rechecks on each edit, and answers queries by mapping a cursor position to syntax and semantic information. It must produce useful results for code that does not compile, so it depends on error recovery and on a type checker that tolerates holes. To stay responsive it reuses prior work through demand-driven queries and cancels stale requests when new keystrokes arrive. Hard parts are latency on large projects, memory, and keeping its answers consistent with what the real compiler would say.",
    k: ["Reuse the compiler's front end vs a separate analysis engine: reuse guarantees agreement with real builds; a separate engine can be tuned for latency and partial code but may disagree.",
        "Recompute on every keystroke vs debounce: immediate feedback feels better but wastes work; debouncing saves CPU and makes completions lag."],
    p: ["Analysis that assumes a well-formed program crashes or hangs on the half-typed code present for most of an editing session."],
    v: "Replay a recorded editing session with thousands of keystrokes against a large project; every request must return within the latency budget, and final diagnostics must match a command-line compile of the saved result.",
    dep: ["demand-driven-queries", "error-recovery", "lossless-syntax-tree", "diagnostic-engine"]
  },
  "demand-driven-queries": {
    s: "Structures analysis as memoized functions that compute results only when asked and record what they read, giving laziness, caching and incremental invalidation from one mechanism.",
    d: "Instead of a fixed pipeline, each fact (the type of this function, the layout of that struct, the signature of this item) is a query with a key. Evaluating a query records the other queries it called, building a dependency graph. Results are cached and, when inputs change, only queries whose dependencies changed are re-evaluated, with early cutoff if the new result equals the old one. The same machinery serves editors and incremental builds. Hard parts are cycle detection, deterministic evaluation order, memory growth and expressing mutation-heavy algorithms as pure functions.",
    k: ["Query-based architecture vs a fixed pass pipeline: queries give laziness and incrementality for free; pipelines are simpler to reason about, faster in a single full compile and easier to parallelize by stage.",
        "Early cutoff on equal results vs invalidate dependents always: cutoff saves large amounts of work after trivial edits but requires comparable, hashable results."],
    p: ["Query results that depend on hidden global state, such as an unrecorded environment read, are cached across runs and returned stale."],
    v: "Edit a comment in a file and verify the query log shows only the parse query re-run, with all type queries cut off by identical results. Cycle in definitions yields a clear error, not a hang.",
    dep: ["type-checker", "name-resolution", "uniquing"]
  },
  "source-file-manager": {
    s: "Loads, caches and owns the text of every source file, hands out stable file identifiers, and records which files were read.",
    d: "All reads go through one component that maps paths to buffers, memory-maps or reads files, caches them so repeated includes cost nothing, and records inode or content identity to detect the same file reached by different paths. It assigns each file a compact identifier used inside locations, and keeps line-start tables for fast offset to line and column conversion. It exposes overlays so an editor's unsaved buffer replaces disk contents. Hard parts are symbolic links and case-insensitive file systems, files that change during a compile and very large inputs.",
    k: ["Memory-map vs read into memory: mapping avoids copies for big files but a file truncated by another process mid-compile can crash the compiler; reading is safe and costs a copy.",
        "Identify files by path vs by content identity: path is simple but treats links and aliases as different files; identity prevents duplicated inclusion and requires file system support."],
    p: ["A file reachable through two paths is parsed twice, so its declarations conflict with themselves or its include guard fails."],
    v: "Include one header through a symbolic link and its real path; it must be loaded once, appear once in the dependency list, and all locations must report one canonical name.",
    dep: ["virtual-file-system", "source-locations"]
  },
  "source-locations": {
    s: "Compact identifiers for positions and ranges in source, carried by every token, tree node and instruction so diagnostics and debug information can point back at the author's code.",
    d: "A location is typically a single integer encoding a file and offset within a global address space; ranges are pairs. Line and column are computed on demand from per-file line tables, so most nodes pay only a few bytes. Macro expansions need locations with provenance: a point inside an expansion links back to the macro definition and to the expansion site, forming a chain. Later stages copy locations onto IR instructions, which become debug line tables. Hard parts are choosing which location a synthesized node gets and keeping locations stable through transformations.",
    k: ["Offsets into one global space vs file plus line and column pairs: global offsets are small and cheap to copy; pairs are directly readable but double or triple the size of every node.",
        "Locations on every instruction vs only some: dense locations give accurate debugging but inhibit merging and enlarge IR; sparse ones shrink output and make stepping jump."],
    p: ["Synthesized nodes with an invalid or reused location produce diagnostics pointing at the wrong line or debug steps that skip statements."],
    v: "For every kind of diagnostic and each debug line entry in a test corpus, check that the reported position lands inside the author-written text, including code produced by macro expansion and desugaring.",
    dep: ["source-file-manager"]
  },
  "preprocessor": {
    s: "A textual stage before parsing that handles includes, conditional sections and macro substitution, producing the token stream the parser sees. Not every language has one.",
    d: "It runs inline with the lexer, interpreting directive lines: include another file, define or undefine macros, evaluate constant conditions to keep or skip regions. Skipped regions are lexed but not parsed. Macros are expanded in token streams, tracking provenance for locations. Because it works on tokens before structure exists, it can break syntax in ways later stages cannot see. Hard parts are performance (re-reading the same headers thousands of times), include guards and precompiled forms, and producing sensible diagnostics inside expansions.",
    k: ["Textual preprocessing vs a module or import system: text is flexible and powerful but context-dependent and slow; modules are fast and hygienic but require redesigning the language and build.",
        "Preprocess as a separate pass vs integrated with lexing: integrated avoids materializing the full expanded text and keeps locations precise; separate is simpler and lets other tools reuse it."],
    p: ["A macro argument evaluated twice or an unparenthesized expansion changes meaning only for particular arguments, a bug no later stage can detect."],
    v: "Run the preprocessor on a large codebase and compare token streams against an independent implementation; also measure time on a header included by a thousand files and confirm the multiple-include shortcut triggers.",
    dep: ["lexer", "macro-expansion", "import-resolution", "source-file-manager"]
  },
  "macro-expansion": {
    s: "Replaces macro invocations with their definitions, from simple token substitution to hygienic, syntax-aware macros that run user code at compile time.",
    d: "Simple macros substitute tokens for arguments with rescanning rules. Structured macro systems parse the invocation, run a transformation over the syntax tree or token trees, and splice the result back, which can itself contain more invocations, so expansion runs to a fixed point with a depth limit. Hygiene tracks the origin of each identifier so names introduced by a macro cannot capture or be captured by the caller's. Expansion interleaves with name resolution because macros may define items. Hard parts are hygiene, termination, error locations and ordering between expansion and resolution.",
    k: ["Token-level vs syntax-tree-level macros: tokens are simple and language-agnostic but can produce malformed code; syntax-aware macros produce valid trees at the cost of tighter coupling to the grammar.",
        "Hygienic vs unhygienic expansion: hygiene avoids accidental capture and complicates the implementation; unhygienic is trivial and relies on discipline."],
    p: ["Recursive macros without an expansion limit hang or exhaust memory, and each error points into generated text the author never wrote."],
    v: "Test macros that introduce local names while the caller uses the same names; results must not interfere. A self-recursive macro must stop at the depth limit with a diagnostic naming the expansion chain.",
    dep: ["parser", "name-resolution", "source-locations", "preprocessor"]
  },
  "import-resolution": {
    s: "Maps include or import statements to files or module interfaces by searching configured paths in a defined order, and detects cycles and ambiguities.",
    d: "Given a name or path in source, the resolver consults search directories in order (current file's directory, user-specified, system, sysroot) or a package manifest, and returns a file or compiled interface. It records every probe for dependency tracking, deduplicates already loaded units, and detects import cycles. For package-based languages it also resolves versions and visibility between packages. Hard parts are case sensitivity differences between systems, path normalization, shadowing between user and system locations, and making lookups cheap since they run constantly.",
    k: ["Ordered search paths vs explicit manifests: search paths are flexible and easy to break silently; manifests are hermetic and predictable but need tooling to maintain.",
        "Resolve at parse time vs after parsing: parse-time resolution suits textual include; deferring lets the compiler parse files independently and in parallel."],
    p: ["A header or module with the same name in two search locations is silently picked by order, so builds on different machines compile different code."],
    v: "Create same-named files in two search locations and verify the documented one is chosen and listed. An import cycle produces one diagnostic naming the whole cycle, not a stack overflow.",
    dep: ["source-file-manager", "virtual-file-system"]
  },
});
