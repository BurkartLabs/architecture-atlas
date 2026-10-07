// Details for the transpiler plate, part 1: entry points, configuration, pipeline and plugins.
ATLAS.details("transpiler", {
  "cli-driver": {
    s: "The command-line front end: parses arguments, finds input files, runs the engine over them and writes outputs and diagnostics with a meaningful exit status.",
    d: "It maps flags and positional paths to an options object, expands directories, calls the programmatic API per file or per batch, and writes results to a target directory, standard output or in place. Diagnostics go to standard error and the exit status tells scripts whether anything failed. It also owns user-facing behavior such as progress, color, and a mode that only checks. The hard part is that it must stay thin: logic added here is unavailable to library callers and drifts from the API's behavior.",
    k: ["Thin driver over the public API vs a driver with its own logic: one code path gets tested and behaves the same everywhere; some convenience flags need new API surface.", "Fail on first error vs collect all errors: fast feedback for scripts vs a complete list per run, at the cost of memory and ordering rules."],
    p: ["Exit status zero after a partial failure lets a build pipeline ship half-translated output.", "Writing outputs next to sources by default overwrites files that other tools read as inputs."],
    v: "Run the tool over a directory containing one file with a syntax error. Confirm the good files are written, the bad one is reported with line and column, and the exit status is nonzero.",
    dep: ["programmatic-api", "file-discovery", "diagnostic-formatter"]
  },
  "programmatic-api": {
    s: "The library interface other programs call: transform a string or file with options and get back code, a source map and metadata, synchronously or asynchronously.",
    d: "The core entry takes source text, a file name and options, and returns generated code, a map, and information such as which helpers or imports were added. Variants exist for strings versus files and for synchronous versus asynchronous callers, because plugins that do input and output cannot run synchronously. It is the stable surface that bundlers, editors and test runners embed. What makes it hard is the compatibility promise: every option name, result field and error shape becomes a contract that outlives the internals behind it.",
    k: ["Pure string-in string-out core vs a core that reads files itself: purity makes caching and testing simple; file access moves to adapters, which each must reimplement it.", "Separate sync and async entries vs async only: sync suits simple tools, but doubles the surface and forbids asynchronous plugins in sync mode."],
    p: ["Returning mutable shared result objects lets one caller's edits corrupt a cached result for the next.", "Omitting file name from the call breaks relative lookup of configuration and makes error messages unlocatable."],
    v: "Call the API twice on identical input and options from two threads and confirm both results are byte-identical and neither mutates the shared options object.",
    dep: ["parser-core", "ast-traversal", "code-generator", "config-loader"]
  },
  "bundler-adapter": {
    s: "A thin plugin for a bundler or test runner that sends each module through the transpiler on load and hands back code plus a map.",
    d: "The adapter registers a load or transform hook, filters by file extension and path, calls the programmatic API with options resolved for that file, and returns code, map and any extra files or dependencies discovered. It reports watched files so the host rebuilds when configuration changes. It also bridges conventions: the host may want a particular module format, and the adapter sets it. The difficulty is composition. The host may run other transforms before or after, and a map from this step must chain correctly into theirs.",
    k: ["Adapter calls the engine once per module vs a whole-program batch: per-module fits incremental hosts and caches well; cross-file transforms such as shared helpers become impossible.", "Adapter picks options vs host passes them through: fewer user mistakes against less flexibility and harder debugging of surprising defaults."],
    p: ["Dropping the map returned by this step breaks stack traces for every later transform in the host.", "Not reporting configuration files as dependencies leaves stale output after an option change."],
    v: "Change a transform option in the config file while the host is in watch mode and confirm the next rebuild re-translates an unmodified module and its output differs accordingly.",
    dep: ["programmatic-api", "map-composition", "watch-mode"]
  },
  "watch-mode": {
    s: "Keeps the process alive and re-translates only the files that changed, using file system events and a dependency record.",
    d: "A watcher subscribes to file system notifications for input paths and the configuration files. Events are debounced, mapped to affected files, and sent through the pipeline; unchanged files are served from cache. Output writes are batched so downstream tools see a consistent snapshot. Editors that save through rename or temporary files, network drives and case-insensitive file systems all produce events that look different from a plain write. A missed event leaves stale output, and a duplicated one wastes the whole point of the mode.",
    k: ["Event-driven watching vs periodic polling: events are immediate and cheap, but platform quirks drop or duplicate them; polling is dull and reliable at a cost in latency and idle work.", "Re-translate the file only vs also its dependents: the first is fast, the second is needed when cross-file facts such as type-only imports changed."],
    p: ["Debounce set too long makes saves feel laggy; too short translates half-written files and reports spurious errors.", "Watching a directory containing the output folder causes an endless loop of writes triggering translation."],
    v: "Save a file in an editor that writes through a temporary file and rename, then confirm exactly one re-translation occurs and the output's modification time moves while other outputs stay untouched.",
    dep: ["file-discovery", "content-hash-cache", "output-snapshots"]
  },
  "file-discovery": {
    s: "Resolves paths, directories and glob patterns into the ordered set of files to translate, applying include, exclude and ignore rules.",
    d: "Patterns are expanded against the file system, filtered by extension and ignore files, and normalized to absolute paths. Symbolic links, hidden files and generated directories need explicit policy. Each discovered file may then be paired with the configuration that governs it. Ordering is made deterministic by sorting. Large repositories make this expensive, so walkers prune excluded directories early instead of listing everything and filtering after. Mistakes here are silent: a file that is never discovered is never translated, and nothing complains.",
    k: ["Prune excluded directories during the walk vs filter afterward: pruning is far faster in large trees, but needs patterns understood as directory rules.", "Follow symbolic links vs skip them: following finds linked packages in monorepos, but risks cycles and duplicate translation of one file."],
    p: ["A broad pattern that includes already-translated output makes the tool translate its own results.", "Different glob dialects between shells and the library cause a pattern to match on one machine and not another."],
    v: "Run in a repository with a nested ignored directory and a symbolic link cycle. Confirm the file list excludes the ignored files, terminates, and is the same sorted list on repeated runs.",
    dep: []
  },
  "parallel-workers": {
    s: "Distributes independent files across worker threads or processes so a large codebase translates in parallel, then merges results in a stable order.",
    d: "A coordinator splits the file list into batches and sends them to workers, each of which loads configuration and plugins once and handles many files. Results return as code, maps and diagnostics, and are written in a fixed order so output does not depend on scheduling. Plugins must not hold global state between files or the results depend on which worker ran what. Start-up cost is real: for a few files, spawning workers costs more than the work, so a threshold decides when to stay in one process.",
    k: ["Worker processes vs threads: processes isolate crashes and global state at the price of serialization and memory; threads share memory cheaply but let a bad plugin corrupt others.", "Static batches vs work stealing: static batching is simple and deterministic; stealing balances uneven file sizes but complicates ordered output."],
    p: ["Plugins that cache results in module-level variables produce different output depending on file-to-worker assignment.", "Serializing large trees between workers can cost more than parsing again, erasing the speedup."],
    v: "Translate the same two thousand files with one worker and with eight. Confirm outputs and maps are byte-identical and the eight-worker wall time is clearly lower.",
    dep: ["programmatic-api", "determinism", "file-discovery"]
  },
  "config-loader": {
    s: "Finds and merges configuration for a file from project files, package metadata, environment and call-site options into one resolved set.",
    d: "Starting from the file's directory it walks upward to find configuration files, reads them in their formats, merges them with call-site options, and expands presets and plugin references into loaded modules. Plugin names resolve relative to the config file that named them, not the working directory. Results are cached per directory. The hard part is precedence: root versus nested configuration, environment-specific sections and overrides must combine in a documented order, because users debug by guessing which source won.",
    k: ["Upward search with merging vs a single explicit file: search lets packages in a monorepo vary, but makes the effective config a function of file location.", "Executable configuration vs static data: code allows conditions and shared helpers, but cannot be validated before it runs or cached by content alone."],
    p: ["Resolving plugin names from the working directory loads a different version than the project declared.", "Configuration changes that are not part of the cache key leave old output in the cache."],
    v: "Print the resolved configuration for two files in different packages of one repository and confirm each shows its own plugins and the source file each setting came from.",
    dep: ["option-validation", "preset-composition", "cache-key-derivation"]
  },
  "target-presets": {
    s: "Named bundles that turn a goal, such as supporting a set of runtimes or a language edition, into the list of transforms and helpers to enable.",
    d: "A preset takes a target description, either a list of runtime versions or a language edition, consults the feature matrix, and enables a transform only for features the target lacks. Targets may be expressed as queries over market share, support dates or explicit versions, and the preset resolves them to concrete minimum versions. Different presets exist for module format, markup and type syntax. The difficulty is that targets change over time: a query that meant one thing when written resolves differently a year later and changes output with no code change.",
    k: ["Targets by runtime version vs by language edition: versions give exact output for real deployments; editions are simpler to reason about but over-transform for runtimes that are ahead.", "Floating queries vs pinned versions: floating tracks reality automatically but makes builds change on data updates; pinned builds are reproducible but go stale."],
    p: ["A query resolved against an outdated data snapshot omits a transform that a still-deployed runtime needs.", "Enabling a transform for a syntax feature but not its helper produces output that fails at load time."],
    v: "Resolve the same target query against two data snapshots and confirm the list of enabled transforms differs, and that running on the oldest listed runtime executes the output without syntax errors.",
    dep: ["feature-matrix", "preset-composition", "config-loader"]
  },
  "feature-matrix": {
    s: "A data table recording, per language feature, which runtime versions support it, used to decide which transforms a target needs.",
    d: "Each row names a feature, such as a syntax form or a library function, and lists the first version in each runtime family that supports it correctly. Transforms and polyfills reference rows by name. Data comes from specification tracking and compatibility test suites, and is updated independently of the engine. Entries must distinguish partial support, where a feature exists but has a known bug, from full support. Getting this wrong is expensive in both directions: too optimistic breaks real users, too pessimistic bloats every bundle.",
    k: ["Treat buggy partial support as unsupported vs as supported: conservative output always works, but transforms code that most users never needed it for.", "Data package separate from the engine vs bundled: separate updates reach users faster but adds a version-skew case to every bug report."],
    p: ["A feature marked supported from the version that shipped it, not the version that fixed its bugs, yields output that fails in the field.", "Rows with misspelled feature names are silently never matched, so the transform never enables."],
    v: "Pick a row and run its feature in a real runtime at the recorded first-supported version and the version before. Confirm it works on the first and fails or misbehaves on the second.",
    dep: []
  },
  "option-validation": {
    s: "Checks configuration against a schema before any file is processed, rejecting unknown, mistyped or conflicting options with a message naming the source.",
    d: "Each plugin and preset declares its options and their types. The validator walks the merged configuration, reports unknown keys with a nearest-match suggestion, checks ranges and enumerations, and detects combinations that cannot work together, such as two plugins that rewrite the same construct. It runs once per configuration, not per file. Errors cite the file and key where the setting was written. The difficulty is strictness: refusing unknown keys catches typos but breaks forward compatibility when a shared config is used by an older version.",
    k: ["Reject unknown options vs ignore them: rejection catches typos that silently disable a feature; ignoring allows shared configs across versions.", "Validate eagerly at load vs lazily on use: eager finds problems in the first second; lazy avoids loading plugins that a given run never uses."],
    p: ["A misspelled option name that is ignored leaves a safety transform disabled with no sign anything is wrong.", "Error messages that name the merged config rather than the source file send users searching the wrong place."],
    v: "Add a misspelled option name to a project config and confirm the run stops before translating, naming the file, the key and the closest valid option.",
    dep: ["config-loader", "plugin-api"]
  },
  "per-file-overrides": {
    s: "Rules that change options for files matching a pattern, so tests, generated code and legacy folders can use different transforms in one project.",
    d: "An override pairs a path pattern with option changes. When a file is processed, matching overrides are applied in order on top of the base configuration, which can add or remove plugins, switch module format or alter targets. Patterns are matched against paths relative to the configuration file. Overrides also let a repository mix source languages, such as typed and untyped files. The hard part is predictability: when several overrides match and each changes plugins, the final list depends on merge rules that users rarely hold in their heads.",
    k: ["Ordered overrides where later wins vs unordered merge: ordering is predictable and easy to explain, but forces authors to arrange files carefully.", "Overrides in the shared config vs in per-directory files: central rules are easy to audit; local files keep rules next to code but scatter them."],
    p: ["An override that replaces rather than extends a plugin list quietly drops required transforms for those files.", "Patterns relative to the working directory instead of the config file stop matching when the tool is run from elsewhere."],
    v: "Add an override for a tests folder that changes the target. Confirm the same construct in a test file and a source file translates differently, and the printed resolved config shows the override applied.",
    dep: ["config-loader", "option-validation"]
  },
  "plugin-api": {
    s: "The public contract a transform is written against: how it registers visitors, receives helpers and options, reports errors and declares what it needs.",
    d: "A plugin is a function that receives an API object and returns a description: a name, visitor functions keyed by node type, optional hooks that run before and after the traversal, and inherited options. The API object exposes builders, scope queries, helper injection and error creation, so plugins do not import engine internals. Because third parties rely on it, the contract changes slowly. The difficulty is deciding what is public: every function exposed lets plugin authors depend on behavior that the engine can then never change.",
    k: ["Small stable API vs full access to internals: a small surface keeps the engine free to change and plugins portable; some advanced transforms then need new API before they can exist.", "Declarative visitors vs imperative whole-tree scripts: declarative lets the engine merge traversals and order work; scripts are simpler to write but cannot be combined."],
    p: ["Plugins that reach into engine internals break on minor releases and block upgrades for the whole project.", "A plugin that mutates nodes it does not own corrupts other plugins' view of the tree."],
    v: "Write a plugin that renames one identifier using only the public API, run it on a fixture, and confirm the expected output and that it still works unchanged after a minor engine update.",
    dep: ["visitor-dispatch", "node-builders", "scope-tree", "helper-injection"]
  },
  "visitor-dispatch": {
    s: "The mechanism that walks the tree once and calls every interested plugin's handler for each node, on entry and on exit.",
    d: "Plugins register handlers per node type. The dispatcher merges them into a table so one traversal serves all plugins, calling each handler with a path object that knows the node, its parent and its container. Handlers can skip children, stop, or request re-traversal of replaced nodes. Entry handlers see the node before its children, exit handlers after. Merging traversals is the main performance win, since traversing once per plugin multiplies cost, but it means plugin order inside one pass determines what each plugin sees.",
    k: ["Single merged traversal vs one traversal per plugin: merged is much faster, but plugins see each other's intermediate states; separate is isolated and slow.", "Path objects with parent access vs bare nodes: paths make replacement and scope queries easy, at the cost of allocation per visit and a more complex API."],
    p: ["A handler that replaces its node without requeuing the new one leaves unprocessed constructs in the output.", "Handlers that mutate sibling nodes during iteration skip or revisit nodes unpredictably."],
    v: "Register two plugins that both match function declarations and log their calls. Confirm one traversal visits each node once, calls handlers in the documented order, and that the replacement node is visited too.",
    dep: ["ast-traversal", "node-replacement", "scope-tree"]
  },
  "plugin-ordering": {
    s: "The rules that decide in what order plugins run and how their visitors combine when several match the same node.",
    d: "Order comes from the configuration: plugins listed before presets, presets run in reverse list order in some designs, and each plugin may declare that it must run before or after another. The merged visitor then calls handlers for one node in that sequence. Order matters because transforms interact: one that turns arrow functions into regular functions must precede one that handles the this keyword. Mistakes show up as constructs left untranslated or translated twice, and are hard to diagnose because each plugin is correct alone.",
    k: ["Explicit user-controlled order vs declared dependencies the engine resolves: explicit is transparent and easy to override; declared dependencies prevent mistakes but hide the order behind a solver.", "Plugins before presets vs after: letting local plugins go first allows overrides, but surprises users who expect presets to establish a baseline."],
    p: ["Reordering two plugins in a config for tidiness changes output because one consumed syntax the other expected.", "Reversed preset order, documented in one place only, leads to configs that work by accident."],
    v: "Print the effective ordered plugin list for a config, swap two interacting plugins, and confirm the output for a fixture changes in the way the dependency predicts.",
    dep: ["plugin-api", "visitor-dispatch", "preset-composition"]
  },
  "pass-scheduler": {
    s: "Runs the pipeline in stages, such as parse, analysis, transform passes and generation, and decides when a pass must repeat until nothing changes.",
    d: "Some transforms need the whole tree shaped a certain way before they run, so the pipeline is split into ordered passes, each a full traversal with its own plugin set. A fixed-point loop repeats a pass while any plugin reports a change, up to a limit. Between passes, scope information is rebuilt or patched. Passes add cost, so the scheduler merges what it can. The difficulty is convergence: two transforms that undo each other loop forever, and a limit that hides the loop hides the bug.",
    k: ["Fixed number of passes vs iterate to a fixed point: fixed is predictable and fast; fixed-point handles cascading rewrites but needs a cap and loop detection.", "Rebuild scope between passes vs update incrementally: rebuilding is simple and always right; incremental is faster but every transform must keep scope data consistent."],
    p: ["Hitting the iteration cap silently returns partly transformed output that looks valid but still contains new syntax.", "A transform that always reports change makes the loop run to the cap on every file."],
    v: "Run a fixture whose rewrites cascade across three levels and confirm the output contains no remaining target-unsupported syntax, and that a deliberately conflicting plugin pair is reported as non-converging.",
    dep: ["visitor-dispatch", "scope-tree", "plugin-ordering"]
  },
  "preset-composition": {
    s: "Combines named bundles of plugins and options, from the project and from shared packages, into one deduplicated, ordered plugin list.",
    d: "A preset is a function returning plugins and nested presets. Composition expands nested presets recursively, applies option overrides from the user, removes duplicates by identity and name, and fixes the final order. Shared presets let an organization publish one baseline. A user can disable one plugin inside a preset by name or pass options through to it. The hard cases are duplicates and conflicts: the same plugin pulled in at two versions through two presets, or two presets that both transform the same construct.",
    k: ["Presets that expand to plugin lists vs opaque presets with their own pipeline: expansion is inspectable and overridable; opaque presets can optimize but cannot be tuned.", "Deduplicate by plugin identity vs by name: identity is exact but loads two copies when versions differ; name is simpler but can merge things that are not the same."],
    p: ["Two versions of one plugin both run, and the second sees the first's output, producing double transformation.", "Passing an option to the preset that it silently ignores gives the user false confidence."],
    v: "Compose two presets that share a plugin with different options, print the expanded list, and confirm the plugin appears once with the documented winner's options.",
    dep: ["plugin-api", "plugin-ordering", "option-validation"]
  },
  "node-replacement": {
    s: "The operations plugins use to change the tree: replace a node, insert siblings, remove, wrap, or hoist, while keeping parent links and scope data valid.",
    d: "Handlers do not edit parents directly. They call operations on the path, which update the container, fix parent and key information, register new bindings with the scope, and queue the new nodes for visiting. Replacing an expression with several statements requires the operation to find an enclosing statement list and insert there, creating a block when the context only accepts one statement. The difficulty is context: an expression that becomes a statement may be in a place no statement is allowed, and the operation has to restructure around it.",
    k: ["Operations on paths vs direct mutation of nodes: operations keep indexes and scope consistent and requeue work; direct mutation is easier to write but silently corrupts traversal state.", "Re-visit replaced nodes vs skip them: re-visiting lets rewrites chain naturally; skipping avoids loops but needs plugins to finish the job themselves."],
    p: ["Replacing a node in a loop header with statements produces output that is syntactically invalid.", "Newly inserted bindings not registered with scope are invisible to the renamer and get captured later."],
    v: "Replace an expression inside an arrow function body that has no block with a multi-statement sequence, and confirm the result is valid, a block is created, and the function still returns the same value.",
    dep: ["ast-traversal", "node-builders", "binding-table", "ast-validation"]
  },
  "compile-time-macros": {
    s: "Code evaluated or expanded by the transpiler itself, so calls to marked functions are replaced with generated code before the program ever runs.",
    d: "A macro is a function, imported by name, that the transpiler recognizes and runs at translation time with the call's arguments as tree nodes or constant values. Its return value replaces the call. Uses include inlining constants, embedding file contents, stripping debug code and generating boilerplate. Macros run inside the translation process, so they need a defined sandbox, dependency tracking for files they read, and stable output. The difficulty is trust and caching: arbitrary code runs during the build, and its inputs must be part of the cache key.",
    k: ["Syntactic macros over tree nodes vs value macros over constants: tree macros are powerful but couple authors to the tree shape; value macros are simple but limited.", "Run macros in-process vs in an isolated worker: in-process is fast and simple; isolation limits damage and leaks but adds serialization."],
    p: ["A macro that reads a file not tracked as a dependency leaves stale output after the file changes.", "Non-deterministic macros, such as ones embedding timestamps, make builds differ run to run."],
    v: "Use a macro that embeds a data file, change the file, rebuild with a warm cache, and confirm the output changes and reflects the new contents.",
    dep: ["plugin-api", "node-replacement", "cache-key-derivation"]
  },
  "semantic-preservation": {
    s: "The rule that translated code must behave the same as the original on the target, including evaluation order, error timing and observable edge cases, not just for typical inputs.",
    d: "Every transform trades fidelity against size and speed. A faithful lowering of a feature may be much larger and slower than a nearly equivalent one, and options such as loose modes let users choose approximate behavior. The decision shapes helpers, the amount of generated code and what tests must check. Some behaviors, like exact error messages or function name properties, are rarely relied on; others, like order of evaluation and temporal dead zones, are. The hard part is that the spec of the source is large and the edge cases are many.",
    k: ["Exact semantics by default vs approximate fast output by default: exact is safe for libraries and unknown consumers; approximate shrinks code but breaks code that relies on edge cases.", "Option per transform vs one global strictness: per-transform gives control but multiplies combinations to test; one switch is easy to explain but coarse."],
    p: ["A loose-mode transform quietly changes iteration or property-definition behavior that a dependency relied on.", "Treating the common case as the whole case ships a transform that breaks on getters, holes or symbols."],
    v: "Run a conformance fixture covering the transform's edge cases in the oldest target runtime, once with strict and once with loose output, and confirm strict passes all and the loose differences are the documented ones.",
    dep: ["execution-equivalence", "conformance-suite"]
  },
  "source-fidelity": {
    s: "The decision about how much of the original text, layout and comments the output retains, from full reprinting to editing only the changed spans.",
    d: "At one end, the printer ignores original layout and regenerates all code, which is simple and consistent but erases formatting and any hand-written alignment. At the other, only changed nodes are reprinted and the rest is copied verbatim, which requires exact positions and careful handling of surrounding trivia. This choice determines whether the tool suits a build step, where nobody reads output, or a codemod, where a human reviews a diff. It affects the AST, the printer and the testing strategy.",
    k: ["Reprint everything vs patch original text: reprinting is simpler and deterministic; patching keeps diffs minimal for people but needs trivia tracking and is much harder to get right.", "Keep comments and blank lines vs drop them: keeping serves readable output and license notices; dropping is smaller and removes attachment bugs."],
    p: ["A tool used for codemods that reprints everything produces diffs touching every line, so reviewers cannot find the real change.", "Dropping a legal notice comment during reprint creates a licensing problem."],
    v: "Run a transform that changes one expression in a hand-formatted file and compare input and output as a text diff. Confirm only the changed span differs when patch mode is chosen.",
    dep: ["format-preserving-reprint", "comment-attachment", "node-locations"]
  },
  "extensibility-boundary": {
    s: "The decision about what third parties may change: whether plugins see the tree, only configuration, or both, and which internals stay private.",
    d: "A closed transpiler with built-in transforms is fast and consistent but cannot add experimental syntax. An open one exposes the tree, scope and builders, and an ecosystem grows around that surface. The boundary determines version policy: node types, visitor names and helper names become public. It also determines performance, since a general plugin interface forces allocation and indirection that a fixed pipeline avoids. Where a tool is placed on this line governs how it is tested, documented and upgraded.",
    k: ["Open plugin ecosystem vs closed fixed transforms: openness enables experiments and unusual targets; closure allows aggressive optimization and guarantees of behavior.", "Stable tree format vs freedom to change it: stability protects plugins; freedom allows better representations and faster internals."],
    p: ["A public tree format with undocumented invariants lets plugins produce trees that print wrongly.", "Allowing plugins to read arbitrary internals makes every refactor a breaking change."],
    v: "Upgrade the engine by one minor version while keeping a set of third-party plugins fixed, and confirm their fixture outputs are unchanged.",
    dep: ["plugin-api", "node-type-definitions"]
  },
  "target-matrix": {
    s: "The set of runtimes, language editions and module systems the output must support, and the consequence that each added target multiplies testing and generated code.",
    d: "Each supported target adds transforms, helpers and test configurations. Supporting very old targets requires restructuring whole functions and shipping helper code to every user, including those on modern runtimes if one bundle serves all. Serving separate bundles to different targets reduces cost but doubles delivery logic. Targets also span module format, markup and type syntax. The matrix is a product decision as much as a technical one, and it should be explicit, versioned and checked against real usage.",
    k: ["One bundle for the oldest target vs bundles per target tier: one is simple and heavy; tiers ship less code to most users but need selection and double the testing.", "Broad support promise vs a narrow supported list: broad targets reach more users; narrow targets keep the transform set small and well tested."],
    p: ["Dropping a target from the list without telling consumers breaks them only when they upgrade.", "Testing only on the newest target hides failures that appear on the oldest."],
    v: "For each listed target, run the same compiled fixture suite in a real runtime at that version and confirm every case passes, including the oldest listed version.",
    dep: ["target-presets", "feature-matrix"]
  },
  "determinism": {
    s: "The property that the same input, options and tool version always produce byte-identical output, regardless of machine, file order or parallelism.",
    d: "Determinism makes caching, reproducible builds and change detection possible. Sources of variation include iteration order of hash tables, generated identifier counters that depend on processing order, timestamps, absolute paths embedded in maps, parallel scheduling and locale-sensitive sorting. The fix is discipline: sort before iterating, derive unique names from content or position instead of global counters, and normalize paths. It is cheap to build in and very expensive to retrofit once plugins have depended on unspecified order.",
    k: ["Content-derived identifiers vs global counters: derived names are stable under reordering; counters are shorter and simpler but change whenever file order or parallelism does.", "Normalize paths in output vs embed real ones: normalized paths make builds portable; real paths are easier to debug locally."],
    p: ["An iteration over an unordered collection yields output that differs between runs, defeating cache hits.", "Embedding the absolute project path in a source map makes artifacts differ across machines."],
    v: "Build the same commit on two machines with different checkout paths and file system ordering, then compare every output and map byte for byte.",
    dep: ["unique-id-generator", "parallel-workers", "source-map-generation"]
  },
  "error-policy": {
    s: "The decision about what happens when something is wrong: which problems stop translation, which warn, and how much of the original program is still emitted.",
    d: "A syntax error may abort, or the parser may recover and keep going to report more problems. A transform that finds unsupported syntax may throw, leave the construct untouched with a warning, or emit code that throws at runtime. Policy also covers plugin crashes, missing helpers and conflicting options. The right answer differs for a build, where failing fast is correct, and an editor, where partial results are useful. Messages need the original location, which depends on source maps and node locations surviving every transform.",
    k: ["Fail fast on first error vs collect many: fast stops wasted work and is simple; collecting gives complete feedback but needs recovery code that may report follow-on noise.", "Throw on unsupported syntax vs pass it through: throwing prevents broken output; passing through keeps builds green but moves failure to the user's runtime."],
    p: ["Warnings that never fail the build are ignored until the construct reaches production.", "A plugin crash reported as an internal stack trace rather than the file and node that triggered it wastes hours."],
    v: "Feed a file with an unsupported construct and confirm the chosen policy: the message names the original file, line and column, and the exit status or output matches the documented behavior.",
    dep: ["diagnostic-formatter", "error-recovery", "error-provenance"]
  }
});
