// Details for the documentation generator plate, part 1: foundation, build and caching, inputs, source extraction.
ATLAS.details("doc-generator", {
  "filesystem-walker": {
    s: "Enumerates source and prose files under configured roots, applying include and exclude patterns and ignore rules, and returns a stable, sorted list of paths.",
    d: "The walker descends directories, matches names against glob patterns, honors ignore files and skips build output, dependency folders and hidden entries. It returns paths in a fixed order so later stages behave identically on every machine. Symbolic links, case-insensitive file systems and very deep trees are the difficult cases. Results feed source discovery, the prose loader and the watcher, so a wrong exclusion silently removes pages.",
    k: ["Glob patterns versus explicit file lists: patterns follow new files automatically; lists are predictable but go stale when someone adds a file and forgets to register it.", "Following symbolic links versus ignoring them: following finds linked shared sources; ignoring avoids cycles and duplicate pages, but hides content that lives behind a link."],
    p: ["Directory order differs between operating systems, so unsorted results produce pages in a different order on each machine.", "A broad pattern picks up generated or vendored files and documents code nobody owns."],
    v: "List the discovered files on two operating systems for the same checkout and compare the output byte for byte. Add a file matching an exclude pattern and confirm no page appears for it.",
    dep: []
  },
  "path-and-url-model": {
    s: "Represents file paths, page paths and URLs as distinct normalized types so that separators, relative references, case and encoding are handled in one place.",
    d: "Source paths use platform separators and may differ only by case. Page paths are logical, slash-separated and relative to the site root. URLs add percent-encoding, fragments, base paths and a trailing-slash policy. The model converts between these three and resolves relative links from the page that contains them. It is hard because a link that works from one page depth breaks from another, and because hosting rules for index files and trailing slashes vary.",
    k: ["Trailing-slash URLs versus file-extension URLs: directories with index files survive moving a host, but extension-based URLs work on any plain file server.", "One shared path type versus plain strings: types stop mixing platform paths with URLs, at the cost of conversion code everywhere."],
    p: ["Windows-style separators leak into generated links and every link on that build is broken.", "A site hosted under a sub-path generates root-relative links that point outside it."],
    v: "Build the same site with a root base path and a sub-path base, then crawl each. Every internal link resolves with status 200 and none points outside the chosen base.",
    dep: []
  },
  "text-encoding": {
    s: "Reads and writes text with a defined encoding and newline convention, detecting byte order marks and invalid sequences so source and output are consistent across platforms.",
    d: "Source files may carry a byte order mark, mixed line endings or invalid byte sequences. The reader decodes to a single internal form, remembers the original offsets so diagnostics point at the right line and column, and the writer emits one chosen encoding and newline style. Column numbers must count the same units that editors and compilers count, which differ for characters outside the basic range. Errors found here are easy to miss because the page still renders.",
    k: ["Normalizing newlines on read versus preserving them: normalizing simplifies parsing and hashing; preserving keeps byte-accurate source links and edit suggestions.", "Failing on invalid bytes versus replacing them: failing exposes bad files immediately; replacing keeps the build going with a replacement character in the output."],
    p: ["A byte order mark at the start of a file becomes visible text or breaks front matter detection.", "Column numbers counted in bytes instead of characters make source links and diagnostics point at the wrong place."],
    v: "Feed a file with a byte order mark, mixed line endings and a four-byte character in a comment. Confirm the page text is clean and a diagnostic on the following line reports the right line and column.",
    dep: []
  },
  "worker-pool": {
    s: "Runs independent tasks such as parsing files and rendering pages concurrently across processes or threads, with bounded memory and ordered, collected results.",
    d: "A coordinator splits work into units, sends them to workers, collects results and errors, and reassembles output in a deterministic order. Workers may be separate processes when the front end is not thread-safe. Sizing matters: too many workers exhaust memory because each holds a parsed program, too few waste cores. Serializing the model between workers has a cost that can erase the gain for small tasks.",
    k: ["Processes versus threads: processes isolate crashes and non-thread-safe parsers but pay serialization; threads share memory cheaply but one fault takes down the build.", "Static versus dynamic work division: static splitting is simple and predictable; dynamic queues balance uneven files but need more coordination."],
    p: ["Results collected in completion order make output differ between runs.", "Each worker loads the full project and memory grows with the worker count until the build is killed."],
    v: "Build the same project with one worker and with eight. Output files are byte-identical, wall time falls, and peak memory stays under the configured limit.",
    dep: ["filesystem-walker"]
  },
  "slug-generation": {
    s: "Turns headings, symbol names and titles into URL-safe identifiers that are unique within a page and stable across builds.",
    d: "A slug is derived by normalizing Unicode, lowercasing, replacing separators and removing characters unsafe in URLs. Duplicates within a page get a suffix. Names with punctuation, such as operators or generic parameters, need a deliberate mapping or they collapse into the same slug. Because slugs become anchors and file names, any change to the algorithm changes every published URL, so it is effectively a public interface.",
    k: ["Readable slugs versus numeric ids: readable slugs help people and search engines but change when a heading is edited; numeric ids are stable but opaque.", "Transliterating non-Latin text versus keeping it percent-encoded: transliteration yields clean ASCII but loses information; encoding keeps meaning and makes ugly links."],
    p: ["Two different operators or overloads map to the same slug and one page overwrites the other.", "Fixing a slug algorithm bug renames anchors and silently breaks every inbound link."],
    v: "Generate slugs for a set of headings and symbols containing duplicates, punctuation and non-Latin text. Verify uniqueness within each page and that the same input gives the same output after rebuilding.",
    dep: ["text-encoding"]
  },
  "http-fetcher": {
    s: "Downloads remote resources such as external link inventories and checked URLs, with timeouts, retries, caching and politeness limits.",
    d: "The fetcher issues HTTP requests with conditional headers, follows redirects up to a limit, caches bodies on disk keyed by URL and respects expiry. It rate limits per host and identifies itself. Builds depend on remote inventories and link checks, so the network is the least reliable input. Offline builds must still succeed with cached data, and a transient failure must not look like a permanently broken link.",
    k: ["Cache with revalidation versus always fetch: caching makes builds fast and works offline but can serve stale inventories; always fetching is fresh but slow and flaky.", "Fail the build on fetch errors versus warn: failing is safe for releases but makes a third-party outage break every unrelated build."],
    p: ["A flaky remote host makes the link check fail intermittently and the team learns to ignore it.", "No rate limit on one host triggers blocking, and every later check from that address fails."],
    v: "Build once online, then offline with the cache present. Confirm external references still resolve from cached inventories and no network call is attempted for unchanged entries.",
    dep: ["path-and-url-model"]
  },
  "build-graph": {
    s: "A dependency graph of build steps and their inputs and outputs, from source files through the doc model to each rendered page, used to decide what must run.",
    d: "Nodes are tasks such as parse file, resolve references, render page and build search index. Edges record which outputs a task reads. The graph is partly static, from configuration, and partly discovered while running, because a page learns which symbols it links to only after resolution. The scheduler orders tasks and runs independent ones in parallel. The difficulty is dynamic dependencies: missing one means stale output, and recording too many means rebuilding everything.",
    k: ["Declared dependencies versus recorded-at-run dependencies: declared is easy to reason about but incomplete; recorded is accurate but needs instrumentation in every task.", "Page-level versus whole-site granularity: fine granularity rebuilds little but costs bookkeeping; coarse granularity is simple and slow."],
    p: ["A missed dependency on a shared template or glossary leaves old text on some pages after an edit.", "A cycle between pages that link to each other is mistaken for a dependency cycle and the build deadlocks."],
    v: "Edit one doc comment and print the executed task list. Only the tasks for that declaration, the pages linking to it and the search index should appear, and the output equals a clean build.",
    dep: ["content-hashing","worker-pool"]
  },
  "incremental-builds": {
    s: "Rebuilds only the parts of the site affected by a change, reusing cached results for everything else, and produces output identical to a clean build.",
    d: "On each run the system compares current input hashes with those stored from the previous build, marks changed tasks and their dependents dirty, and reruns only those. Deleted sources must remove their pages and navigation entries. Output equality with a full build is the hard requirement: navigation, search indexes, backlinks and reference targets are global, so a small change can touch many pages. Many tools offer a periodic full build as a safety net.",
    k: ["Incremental by default versus clean by default: incremental is fast for authors but risks stale output; clean is always right and slow on large sites.", "Invalidate on any configuration change versus per-option tracking: whole-cache invalidation is safe and wasteful; per-option tracking is fast and easy to get wrong."],
    p: ["A removed source leaves its generated page behind and the site keeps documenting deleted code.", "A cache from an older tool version is reused and produces pages in a new format that does not match."],
    v: "Make a change, run an incremental build, then run a clean build into another folder and diff the two outputs. They must be identical, and the incremental run must touch far fewer files.",
    dep: ["build-graph","model-cache","content-hashing"]
  },
  "content-hashing": {
    s: "Computes stable digests of file contents, configuration and tool version to detect change precisely, instead of relying on modification times.",
    d: "Each input is hashed, and a task's key combines the hashes of its inputs, its own settings and the generator's version. Equal keys mean a cached result can be reused. Hashes of structured data such as the doc model must ignore irrelevant ordering and incidental details, or every run looks changed. The cost of hashing large trees is minor next to rendering, but the choice of what to include in the key decides whether caching is correct.",
    k: ["Content hashes versus modification times: hashes survive checkouts and copies and avoid false rebuilds; timestamps are cheap but wrong after version control operations.", "Hashing the doc model versus hashing source text: model hashes skip rebuilds after a whitespace edit; text hashes are simpler but rebuild on any change."],
    p: ["A key that omits the theme version reuses pages rendered with the old theme.", "Unordered maps hashed in iteration order give different digests for identical content and defeat the cache."],
    v: "Touch a source file without changing it and rebuild: no task reruns. Change a theme template and rebuild: every page using it reruns and no others do.",
    dep: ["text-encoding"]
  },
  "model-cache": {
    s: "Stores the serialized doc model per source unit so unchanged files are not reparsed, and per-version snapshots can be reloaded for comparison and cross-linking.",
    d: "After extraction each file or module contributes a model fragment. Fragments are written to a cache directory keyed by content hash and loaded on later builds. Reference resolution then runs over the merged model. Cache files must be versioned with the model format, and cleanup must remove entries for deleted files. The cache can be shared between CI runs, which makes it a trust and size concern as well as a speed one.",
    k: ["Per-file fragments versus one whole-project cache: fragments allow partial reuse; a single cache is simpler to validate but is invalidated by any change.", "Local cache versus shared remote cache: shared caches speed up fresh CI machines but need authentication and protection against poisoned entries."],
    p: ["A model format change without a cache version bump makes the loader crash or, worse, misread old data.", "The cache grows without bound as files are renamed and old entries are never evicted."],
    v: "Delete one source file, rebuild and inspect the cache directory. Its fragment is gone, the others are reused unchanged, and the site contains no page for the deleted file.",
    dep: ["doc-model-format","content-hashing"]
  },
  "parallel-rendering": {
    s: "Renders independent pages in parallel from a shared, read-only model, then writes them to the output tree in a fixed order.",
    d: "Once the model and navigation are final, each page depends only on read-only data, so pages render independently. The scheduler hands batches to workers, each applying templates and highlighting code. Shared outputs such as the search index and sitemap are merged afterward. Template engines with global mutable state, or plugins that modify the model during rendering, break this independence and cause intermittent differences between runs.",
    k: ["Freeze the model before rendering versus allow edits during rendering: frozen gives safe parallelism but forbids late fixes; mutable is flexible and makes ordering matter.", "Render all pages versus on demand: on-demand serves previews faster but cannot check links and search across the whole site."],
    p: ["A plugin appends to a shared list while rendering and pages occasionally show another page's data.", "Syntax highlighting loaded per worker multiplies startup time and memory."],
    v: "Render with one and with many workers, repeat several times and compare checksums of every output file. All runs must produce identical files.",
    dep: ["worker-pool","template-engine","page-model"]
  },
  "watch-mode": {
    s: "Watches inputs, rebuilds affected pages after each change and tells the browser to reload, so authors see results within seconds of saving.",
    d: "A file watcher batches change events, since editors write several files per save, then triggers an incremental build and pushes a reload message over a local socket. The preview server maps requests to the latest output and shows build errors in the page instead of the terminal. Reliability is the problem: watchers miss events on some network and virtual file systems, and a build error must keep the last good page visible.",
    k: ["Rebuild affected pages only versus full rebuild on change: partial is fast but shows stale navigation; full is always consistent and slow on large sites.", "Hot-swap page content versus full page reload: swapping keeps scroll position but can leave stale script state; reloads are slower and always correct."],
    p: ["The watcher silently stops receiving events and the author debugs a change that was never rebuilt.", "An error wipes the preview and the author loses the page they were editing."],
    v: "Start the server, edit a doc comment and save. The browser shows the new text within a few seconds without manual refresh. Introduce a syntax error and confirm the page shows it and recovers when fixed.",
    dep: ["incremental-builds","filesystem-walker"]
  },
  "plugin-hooks": {
    s: "Named extension points where plugins add pages, transform the model, register markup, or change output, with a defined order and error handling.",
    d: "Hooks run at stages such as after extraction, before reference resolution, after page generation and after output. Plugins receive the model or page and may add or change it. The system defines hook order, whether plugins can depend on one another, and how failures are reported. The hard parts are stability and isolation: a plugin written against internal structures breaks on every release, and one slow or faulty plugin can make output nondeterministic.",
    k: ["Stable narrow plugin interface versus direct model access: a narrow interface lets the tool evolve; direct access lets plugins do anything and locks internals in place.", "Plugins in-process versus separate processes: in-process is fast and simple; separate processes contain crashes but cost serialization."],
    p: ["A plugin that mutates the model after caching makes cached and fresh builds differ.", "Two plugins register the same markup name and the winner depends on load order."],
    v: "Install a plugin that adds a page and a tag. Confirm the page appears in navigation and search, the tag renders, and removing the plugin removes both after a rebuild.",
    dep: ["build-graph","declaration-model","page-model"]
  },
  "repo-checkout": {
    s: "The working copy of source and prose that a build reads, at a specific revision, with submodules and generated files made available.",
    d: "Documentation is built from a repository revision, often a tag or branch. For versioned documentation the system checks out several revisions, each built in isolation. Shallow clones, submodules and large-file storage affect what is available. The revision identifier is recorded in the output so a page can say exactly which code it describes and so source links stay accurate. Missing generated files make extraction see an incomplete project.",
    k: ["Build from a clean checkout versus the developer's working tree: clean builds are reproducible; working-tree builds include uncommitted edits that authors expect in a preview.", "Shallow versus full history: shallow is fast, but last-modified dates and version comparisons need history."],
    p: ["A shallow clone makes every page show the same last-modified date.", "Submodules are not initialized and a whole package silently vanishes from the reference."],
    v: "Build a tagged revision in a fresh directory. The output records that revision, and each source link opens the same lines at that revision on the hosting site.",
    dep: ["filesystem-walker"]
  },
  "project-config": {
    s: "A declarative file naming the project, its source roots, versions, locales, theme, plugins and checks, validated against a schema before any work begins.",
    d: "Configuration decides which packages are documented, which are private, where output goes and how strict the checks are. It is loaded, merged with command-line overrides and validated against a schema that rejects unknown keys with a suggestion. Defaults must be sensible so a minimal file works. It also carries the version of the tool it was written for. Settings that change output must be part of cache keys, or changing them has no effect.",
    k: ["Strict schema versus ignore unknown keys: strict catches typos at once but breaks older configs on upgrade; lenient hides misspelled options that then do nothing.", "Single file versus per-package configuration: one file is easy to audit; per-package files let teams own settings and can contradict each other."],
    p: ["A misspelled option is ignored and the author believes private symbols are hidden when they are published.", "An option that changes output is not hashed, so rebuilds reuse stale pages."],
    v: "Mistype an option name and confirm the build stops with a message naming the closest valid option. Change a valid output option and confirm affected pages rebuild.",
    dep: ["filesystem-walker"]
  },
  "prose-files": {
    s: "Hand-written pages in a lightweight markup: tutorials, guides, concept pages and landing pages that sit beside the generated reference.",
    d: "Prose files carry front matter, headings and body text and may include code, diagrams and reusable snippets. They are parsed with the same markup engine as doc comments so links and tags behave the same. Their navigation position comes from the manifest or from file layout. Prose changes more slowly than code but is more likely to go stale, because nothing forces it to follow API changes unless the quality checks do.",
    k: ["One markup dialect for comments and prose versus different ones: one dialect gives consistent links and behavior; separate dialects can suit each audience but double the maintenance.", "Prose beside the code versus in a separate repository: nearby prose is updated with the change; a separate repository lets writers work without code review but drifts."],
    p: ["Tutorials reference an API that was renamed and nothing flags them.", "A moved prose file breaks every inbound link because no redirect was created."],
    v: "Rename a function used in a tutorial. The build should report the tutorial's reference or example failing, and the page should not publish with the old name.",
    dep: ["filesystem-walker","text-encoding"]
  },
  "spec-inputs": {
    s: "Machine-readable descriptions of interfaces, such as HTTP API descriptions, schemas and protocol definitions, imported as an alternative to source code.",
    d: "Some reference documentation is generated from a schema document, not from source. The importer reads operations, parameters, response shapes and examples into the same declaration model, so they share templates, search and cross-references. Schemas contain references to other documents, which must be resolved and cycle-checked. Descriptions inside them use the same markup. The challenge is the mismatch: schema features have no counterpart in the model and must be preserved.",
    k: ["Generate docs from the description versus describe the implementation: the description is the contract, but the code may differ; implementation extraction is accurate and hides contract intent.", "Map into the shared model versus keep a separate pipeline: sharing gives one search and link space; a separate pipeline keeps schema-specific features intact."],
    p: ["The description drifts from the running service and the docs document behavior that does not exist.", "A circular schema reference sends the importer into infinite expansion."],
    v: "Import a description containing a circular schema reference and a shared example. Confirm the import finishes, each operation page lists its parameters, and the circular type is linked rather than expanded forever.",
    dep: ["declaration-model","doc-model-format"]
  },
  "example-sources": {
    s: "Complete sample programs and fragments stored as real files, which pages include by name so the examples can be compiled, run and kept current.",
    d: "Examples kept as files in a dedicated folder are built and run by the test system, then included into pages by marker or line range. Region markers inside the file let a page show only the relevant lines while the whole file compiles. Hidden setup lines may be compiled but not displayed. The difficulty is keeping a file that is correct as code also readable as an excerpt, and reporting a failure with the page that includes it.",
    k: ["Examples as real files versus inline in comments: files get compilers, formatters and tests; inline text is convenient and often wrong.", "Showing whole files versus marked regions: whole files are always correct but long; regions read well but depend on markers surviving edits."],
    p: ["An include references a region marker that was deleted and the page shows an empty block.", "Hidden setup lines make a snippet look simpler than it really is, and readers cannot reproduce it."],
    v: "Change an example so it no longer compiles. The test run must fail naming that file, and the page that includes it must not publish the broken code.",
    dep: ["filesystem-walker","text-encoding"]
  },
  "source-discovery": {
    s: "Determines which source files and packages make up the documented API, using configuration, build metadata and entry points.",
    d: "Discovery starts from entry points or package roots, follows imports to find what is public, and applies include and exclude rules. Build metadata can supply the exact file set and compiler options, so the front end sees the same code the compiler does. It must cope with conditional compilation, multiple targets and workspaces holding many packages. Getting this wrong omits real API or documents internal files.",
    k: ["Start from entry points versus document every file: entry points match what users can reach; every file also reveals internal code and bloats the site.", "Reuse the build system's file list versus an independent scan: reuse matches the compiler exactly but couples to its format; scanning is independent and can disagree."],
    p: ["Files compiled only for one platform are missed, so that platform's API is undocumented.", "Test and benchmark folders are picked up and appear in the public reference."],
    v: "Compare the set of documented modules with the set of exported entry points of the built package. Every exported symbol must have a page and no test-only module may appear.",
    dep: ["filesystem-walker","project-config","repo-checkout"]
  },
  "language-front-end": {
    s: "Parses source into a syntax tree and, where needed, runs enough of a compiler to know names, types and doc comment positions.",
    d: "Two approaches exist: a lightweight parser that reads declarations and nearby comments without full analysis, or the real compiler front end used as a library. The lightweight route is fast and tolerant of incomplete code but guesses at inferred types and imports. The compiler route knows exactly what a symbol means but needs a buildable project and runs more slowly. Either must preserve comment locations and source ranges for links and diagnostics.",
    k: ["Own parser versus the real compiler front end: an own parser works on broken or partial code; the compiler gives correct types and breaks when the project does not build.", "Single language versus pluggable front ends: one language allows deep integration; pluggable adapters cover polyglot projects and share a lowest-common-denominator model."],
    p: ["The parser lags behind a new language feature and silently drops declarations that use it.", "Comments attached to the wrong declaration after a syntax the parser does not model."],
    v: "Run extraction on a file using the newest syntax features and compare the list of extracted declarations with the compiler's own symbol listing. Any declaration missing from one is a defect.",
    dep: ["source-discovery","text-encoding","comment-attachment"]
  },
  "signature-resolution": {
    s: "Works out the full, readable signature of each declaration: parameter and return types, generics, constraints and default values, with types linked to their own pages.",
    d: "Types written by authors may be aliases, inferred, or imported from elsewhere. The resolver expands or preserves them as configured, records generic parameters with bounds, and links each type name to its declaration. It must decide how much to simplify: showing a fully expanded type can be unreadable, showing an alias hides what is really accepted. Cross-package types need the other package's model or an inventory.",
    k: ["Show aliases versus show expanded types: aliases are readable and conceal real shape; expanded types are exact and can run to many lines.", "Resolve inferred types versus omit them: resolving documents what callers get but depends on the compiler; omitting stays simple and leaves gaps."],
    p: ["A type from another package is left as plain text because its inventory was not loaded.", "A signature with many generic bounds renders as one unreadable line."],
    v: "Pick a function with generic parameters, a default value and an aliased return type. The rendered signature must match the source, with each named type linked to the correct page.",
    dep: ["language-front-end","symbol-table"]
  },
  "declaration-model": {
    s: "The language-neutral data structure describing packages, modules, types, functions, fields and constants with their signatures, docs, modifiers and source ranges.",
    d: "Every extractor produces nodes of a shared schema: kind, name, qualified name, parents, signature, modifiers, attached doc tree, source location and stability flags. Language-specific facts are kept as extension fields. The model is the interface between extraction and everything after it, so it must be rich enough for all languages while staying uniform enough for shared templates. Changes to it affect cache format, plugins and diffs.",
    k: ["One universal schema versus per-language models: a universal schema shares search, templates and diff tools; per-language models are accurate and multiply downstream code.", "Mutable model versus frozen after extraction: mutable lets plugins adjust docs; frozen makes caching and parallelism safe."],
    p: ["A language feature with no node type is flattened into a generic node and loses meaning.", "Qualified names that are not unique across packages cause one declaration to overwrite another."],
    v: "Extract two packages with an identically named type. Both appear in the model with distinct qualified names and both get separate pages.",
    dep: ["language-front-end","signature-resolution"]
  },
  "visibility-filter": {
    s: "Decides which declarations are public API, using language visibility rules, explicit export lists, doc tags and configuration, and removes the rest from the model.",
    d: "Visibility in code is not always visibility to users: a public item in an internal module, a symbol re-exported under another name, or an item marked internal by convention. The filter combines the language's own rules with tags such as internal or hidden, then prunes the model. Anything exposed in a public signature but filtered out must still be handled, because readers will meet its name.",
    k: ["Exclude by default versus include by default: exclude-by-default is safe and requires opt-in; include-by-default avoids missing API and leaks internals.", "Tags in comments versus a central list: tags travel with the code; a list is easy to audit and drifts from the source."],
    p: ["A private type appears in a public signature and its link dead-ends.", "A new public symbol is added and silently documented before anyone reviews its design."],
    v: "Mark one symbol internal and add one new public symbol. After a build, the internal one has no page and no search entry, and the new one appears and is reported in the change report.",
    dep: ["declaration-model","project-config"]
  },
  "reexports": {
    s: "Handles declarations exposed under more than one path, by alias, import or module re-export, choosing a canonical page and linking the others to it.",
    d: "Many packages expose symbols from a different location than where they are defined. The tool resolves each exported name to its original declaration, picks one canonical path, and either generates alias pages or redirects. Without this, the same item is documented twice, or users searching by the path they import cannot find it. Circular re-exports and wildcard exports make resolution iterative.",
    k: ["Document at the definition versus at the re-export path: definition pages are canonical; re-export pages match how users import and need care to avoid duplicates.", "Alias pages versus redirects: alias pages are findable by every name; redirects keep one page and may disorient readers."],
    p: ["The same type is documented at two paths with different text and readers trust the wrong one.", "A wildcard re-export exposes every symbol of an internal module."],
    v: "Re-export one type under a second path. Both paths resolve, both lead to a single canonical page, and search returns it once.",
    dep: ["declaration-model","visibility-filter"]
  },
  "generated-code": {
    s: "Deals with declarations produced by macros, templates, code generators or build steps, which do not appear verbatim in any source file.",
    d: "Code generated at build time is part of the public API but has no hand-written comment. The generator may carry a doc string forward, or the tool must read the expanded output. Generated sources live in build directories that discovery normally skips. The tool needs to expand macros to see real declarations and map them back to the user-written source for links. When expansion is not possible, an explicit annotation must stand in.",
    k: ["Read expanded output versus the macro invocation: expanded output shows what exists; the invocation shows what the author wrote and hides the result.", "Document generated items automatically versus require a hand-written stub: automatic is complete; stubs let authors explain the result and often go missing."],
    p: ["Generated members appear with no description and look like unfinished documentation.", "Source links for generated items point to a temporary build file that is not in the repository."],
    v: "Document a type whose accessors are generated by a macro. Each accessor appears in the reference, and its source link opens the macro invocation in the repository, not a build artifact.",
    dep: ["language-front-end","source-discovery","declaration-model"]
  },
  "compiled-metadata": {
    s: "Reads declarations and doc strings from compiled packages and libraries when source is not available, using embedded metadata, interface files or reflection.",
    d: "Some ecosystems ship binaries with type metadata, interface definitions or embedded documentation. The reader opens those, extracts the public declarations and builds the same model. This is how dependencies get documented without their source and how external inventories are produced. Detail is lower than from source: parameter names, comments and defaults may be missing, and the metadata format changes with the compiler version.",
    k: ["Read compiled metadata versus require source: metadata works for closed dependencies and loses comments and names; source is complete and may be unavailable.", "Reflection at run time versus static metadata parsing: reflection sees the real loaded API and requires executing code; static parsing is safe and sees less."],
    p: ["Parameter names come out as arg0 and arg1 and the signatures are unreadable.", "Loading a library to reflect on it runs its initialization code during a docs build."],
    v: "Document a package from its compiled form only. Compare its declaration list with the source-based build of the same revision. Names and types must match, and missing comments should be the only gap.",
    dep: ["declaration-model","signature-resolution"]
  },
  "doc-model-format": {
    s: "A versioned, serialized form of the declaration model and its doc trees, written to disk so it can be cached, diffed, shared and consumed by other tools.",
    d: "The model is written as structured data with a format version, tool version and source revision. A stable format lets different stages run in separate processes, lets a project publish its model so others can link to it, and enables API diffs without the original source. Evolution is the hard part: fields are added, renamed or removed, and readers of old files must still work or fail clearly.",
    k: ["Public stable format versus internal format: stable allows an ecosystem of tools but freezes the schema; internal evolves freely and breaks anyone who reads it.", "Compact binary versus readable text: binary is small and fast to load; text can be inspected, diffed and fixed by hand."],
    p: ["A new field is added without bumping the version and older readers misinterpret files.", "Absolute paths are written into the model and the cache is invalid on another machine."],
    v: "Write the model, load it in a separate process and render. Output must equal a build that went straight from extraction to rendering. Load a file with a newer version and confirm a clear error.",
    dep: ["declaration-model"]
  },
  "source-of-truth": {
    s: "The decision about where each fact lives: signatures in code, behavior in comments, concepts in prose, and which wins when they disagree.",
    d: "Documentation duplicates facts that exist elsewhere. If the signature is typed by hand in prose, it will diverge from the code. The cleanest rule is that every fact has exactly one origin and everything else is generated or checked against it: signatures from the compiler, examples from tested files, version numbers from the build. Where generation is impossible, a check must compare the copy with the origin. The layering of components follows from this rule.",
    k: ["Generate everything possible versus write by hand: generated facts never drift, but read mechanically; handwritten text reads well and rots.", "Comments as the source for behavior versus separate prose: comments stay near the code and change with it; prose can explain across many symbols and falls behind."],
    p: ["A parameter is documented in both a comment and a guide, the code changes, and only one gets updated.", "Each team decides differently where truth lives, so readers cannot predict which page to trust."],
    v: "Change a function signature and nothing else. Every page showing that signature must update on rebuild, and any copy typed by hand must be flagged by a check.",
    dep: ["declaration-model","runnable-examples"]
  },
  "link-stability": {
    s: "The policy that published URLs and anchors keep working across releases, renames and restructuring, enforced by redirects, stable slugs and checks.",
    d: "Inbound links come from search engines, issue trackers, tutorials and other sites, and cannot be edited by the project. Stability needs deterministic URL rules, a record of previously published URLs and a redirect for each removed or moved one. Symbol pages are the hard case, because renaming a function changes its URL. A long-lived site accumulates a redirect table that must itself be tested. Links to anchors are broken by edits to headings.",
    k: ["Permanent URLs for symbols versus URLs mirroring current names: permanent are stable and awkward to read; name-based are natural and move whenever code is renamed.", "Keep every old URL forever versus expire redirects: forever is kind to readers and grows the table; expiry is tidy and breaks old links."],
    p: ["A restructuring removes a hundred pages and no redirects are written, and search traffic ends in not-found pages.", "Redirect chains build up across releases and some end in a loop."],
    v: "Compare the list of published URLs of the previous release with the new build. Every previously published URL must either exist or redirect with a single hop to a page that exists.",
    dep: ["redirect-map","slug-generation","canonical-urls"]
  },
  "build-performance": {
    s: "The budget for how long a build may take, from an author's edit to a visible page and from a commit to a published release, and the techniques used to keep within it.",
    d: "Builds that take many minutes stop being run locally and checks get skipped. The budget is divided between extraction, resolution, rendering and indexing. Techniques include caching, incremental builds, parallelism and doing work lazily. Measuring each stage on every build is necessary, since the slow step moves as the project grows. Choices such as full compiler analysis, heavy highlighting or large search indexes each take a share of the budget.",
    k: ["Fast approximate local builds versus full-fidelity builds everywhere: approximate builds keep authors in flow but may miss errors; full builds catch everything and discourage frequent runs.", "Spend time on checks versus on rendering: strict checks protect quality and slow every build; skipping them speeds builds and hides rot."],
    p: ["Build time grows slowly until authors stop previewing locally and discover errors only in CI.", "Optimizing the wrong stage because nothing measures where time goes."],
    v: "Record per-stage timings for a clean build and for a one-line change. The incremental time stays within the stated budget on the largest supported project, and the report names the slowest stage.",
    dep: ["incremental-builds","parallel-rendering","model-cache"]
  },
  "versioning-policy": {
    s: "The rules for which releases get their own documentation, how they are named and how long they stay available.",
    d: "Projects choose whether to document every release, each minor line, or only the latest. The policy decides naming such as semantic versions or channels, how a development version is labeled, which version the default URL shows and when old versions are archived or frozen. It determines the number of site copies to build, store and search, and how fixes to old documentation are made. It also decides whether text in a page can be edited after a release.",
    k: ["Document every release versus only supported lines: every release serves all users and multiplies storage and builds; supported lines are cheaper and strand users of older versions.", "Latest as default versus stable as default: latest shows new features early; stable avoids confusing users on the version they actually have."],
    p: ["Readers land on documentation for a newer version than they run and use APIs that do not exist.", "Fixing a typo across twenty old versions is skipped, so the same error persists."],
    v: "List the published versions and confirm the version switcher, search filters, sitemap and canonical links all agree on the same set, and the default URL points at the version the policy names.",
    dep: ["version-model","version-aliases"]
  },
  "untrusted-content": {
    s: "The rule that doc comments, prose, plugins and remote inventories can contain hostile input, so rendering and processing must not execute or expose anything it should not.",
    d: "Documentation text is written by many contributors, some outside the organization, and may include HTML, scripts, links and references to remote files. Rendering must sanitize markup, escape template output, restrict includes to the project tree, and treat fetched inventories as data. Build-time plugins and example runners execute code, so they need sandboxing and credentials must be kept away from them. A docs site often shares a domain with other applications, which raises the impact of injected scripts.",
    k: ["Allow raw HTML in comments versus markup only: raw HTML gives flexibility and is a script-injection risk; markup-only is safe and limits layout.", "Run examples with full access versus sandboxed: full access is convenient and exposes secrets and the network; a sandbox needs setup and limits what examples can show."],
    p: ["An include path with parent-directory segments reads a file outside the project into a public page.", "A pull request from a stranger runs example code on a CI machine that holds deployment credentials."],
    v: "Submit a comment containing a script tag and an include of a file outside the project. The published page must contain neither the script nor the file contents, and the build must report the include.",
    dep: ["html-sanitizer","includes-and-snippets","runnable-examples"]
  },
  "output-determinism": {
    s: "The requirement that the same inputs always produce byte-identical output, regardless of machine, time, order of processing or number of workers.",
    d: "Determinism makes caching, review and diffing possible, because a change in output means a change in input. It is lost to hash-map iteration order, file listing order, timestamps embedded in pages, random identifiers, absolute paths and parallel completion order. Achieving it means sorting everywhere, normalizing paths, injecting build time from a fixed source and generating identifiers from content. It is cheap to design in and expensive to retrofit.",
    k: ["Embed build timestamps versus omit them: timestamps tell readers how fresh a page is and make every build differ; omitting keeps builds identical and loses the information.", "Sort every collection versus preserve discovery order: sorted is reproducible; discovery order follows author intent and varies between machines."],
    p: ["A generated identifier uses random values so every build changes every page and each deploy invalidates the whole CDN.", "Absolute paths in output reveal the build machine layout and differ per developer."],
    v: "Build twice on different machines from the same revision and compare every output file with a checksum tool. All files must be identical.",
    dep: ["content-hashing","worker-pool","path-and-url-model"]
  }
});
