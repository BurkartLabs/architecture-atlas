// Details for the build system plate, part 4: the target graph, the action graph and dependency discovery.
ATLAS.details("build-system", {
  "target-graph": {
    s: "The directed graph of declared targets, with an edge from each target to each target named in its dependency attributes. It says what depends on what, not how anything is built.",
    d: "Nodes are targets from loaded packages and edges come from label-valued attributes. The graph is built lazily by loading packages as dependencies are discovered, so only the transitive closure of the requested targets is ever loaded. It is acyclic by requirement, and it is configuration-independent until conditional attributes are resolved. It is the structure that queries, visibility checks and impact analysis run over. It is hard to keep accurate: the declared edges are written by people and may omit dependencies the code actually uses, or keep ones it no longer needs.",
    k: ["Coarse declared dependencies vs fine-grained ones: easy to write and fewer edges, but more rebuilds and a graph that hides real structure.", "Loading only the needed closure vs the whole repository: fast starts, but whole-repository queries must pay the full loading cost."],
    p: ["Unused dependencies accumulate because nothing fails when they are left in, and rebuilds spread further than needed.", "A target depends on something only transitively and breaks when an intermediate removes it."],
    v: "Query the dependencies of one target and compare with the includes in its sources. Every direct include's owner should appear as a declared edge, and removing an edge should fail a strict build.",
    dep: ["targets", "dependency-declaration", "package-loading"]
  },
  "action-graph": {
    s: "The directed graph of concrete commands and files: each action consumes input files and produces output files, and its edges are the files that flow between actions.",
    d: "Analysis converts every configured target into actions registered by its rule. The action graph has file nodes and action nodes, and it is what the scheduler runs. It is bipartite: outputs of one action are inputs of another. It is usually orders of magnitude larger than the target graph, since each target expands into many compile, link and packaging actions. It is hard because its size drives memory and analysis time, and its edges, being declared by rules, can omit inputs a command reads, which breaks both correctness and caching.",
    k: ["Materializing the whole action graph vs creating actions lazily during execution: simple scheduling and queries, but memory and analysis time grow with the whole closure.", "Fine actions per file vs batched actions: better caching and parallelism, but more per-action overhead and process starts."],
    p: ["An action that reads a file it never declared passes locally and breaks under sandboxing or remote execution.", "Several actions that declare the same output path produce a conflict that surfaces only on certain target sets."],
    v: "Dump the action graph for one target and confirm each action's inputs list every file its command reads, by running it in a sandbox containing only those files and observing success.",
    dep: ["analysis-phase", "actions", "target-graph"]
  },
  "analysis-phase": {
    s: "The step between loading and execution: for each target in the configured graph, runs its rule implementation to produce providers and register actions, without running any command.",
    d: "Analysis walks the target graph from the requested targets, applies configuration and transitions, resolves toolchains, calls each rule's implementation function and collects the actions it registers. It is memoized per target and configuration. Errors, such as visibility violations, missing attributes or type mismatches, are reported here, before any compile starts. It is hard because analysis time is paid on every build that touches changed rules or configuration, and because it can dominate small incremental builds in a large repository if rules are written inefficiently.",
    k: ["Separating analysis from execution vs interleaving them: errors surface early and execution can be planned, but the full graph must be built before any work begins.", "Memoizing per configuration vs per target: avoids repeat work across configurations, but memory grows with the number of configurations."],
    p: ["Analysis of a huge dependency closure delays the first compile by minutes even when nothing changed on the critical path.", "A rule implementation with accidental quadratic behavior is invisible in small repositories and cripples large ones."],
    v: "Change a flag that affects one target's actions and rebuild with profiling. Confirm analysis re-runs only for that target and its dependents, and that the profile shows analysis time separately from execution.",
    dep: ["target-graph", "rule-definitions", "toolchain-resolution", "build-configuration"]
  },
  "analysis-cache": {
    s: "The retained results of analysis, so that configured targets whose rule, attributes, dependencies and configuration are unchanged are not analyzed again.",
    d: "Each analysis result is keyed by target label and configuration and holds the providers and registered actions. When an input of that analysis changes, such as a dependency's providers, an attribute or a loaded rule module, the entry is invalidated and recomputed; otherwise it is reused. In some designs it is persisted to disk so a fresh server starts warm. It is hard because it is the largest memory consumer in a big repository, and because anything that changes the configuration, even a flag no rule reads, can invalidate large parts of it.",
    k: ["Keeping the cache in memory only vs persisting it: simple and fast, but a restart pays the full analysis again; persistence adds serialization cost and format versioning.", "Discarding analysis results after execution vs keeping them: lower memory, but the next build re-analyzes everything."],
    p: ["Changing an unrelated flag changes the configuration of every target and drops the entire analysis cache.", "Persisted caches from an older engine version load with subtly wrong results unless versioned."],
    v: "Run a no-op rebuild and confirm the profile shows zero analysis work. Then change one rule's source and confirm only targets of that rule kind and their dependents are re-analyzed.",
    dep: ["analysis-phase", "in-memory-graph", "incremental-engine"]
  },
  "dependency-declaration": {
    s: "The act and discipline of listing, in build files, every target a target needs, so the graph reflects what the code actually uses.",
    d: "Dependencies are listed as label-valued attributes, often split by role: compile-time, link-time, runtime and tool dependencies. The build system uses these edges to decide ordering, what to make available to an action, and what to rebuild. Strictness controls whether code may use something it depends on only transitively. It is hard because the source code already says what it needs, so the declaration is duplicated information that can drift, and keeping them aligned is either done by hand, by automated fixers, or by checking.",
    k: ["Requiring direct dependencies vs allowing transitive ones to leak: refactors are safe and the graph is honest, but every include needs a declared edge.", "Hand-maintained edges vs generated from source analysis: reviewable intent, but drift; generated edges are accurate, but hide design decisions."],
    p: ["A dependency available only transitively works until an intermediate library drops it, breaking an unrelated target.", "Dependencies declared at too coarse a level cause rebuilds of everything for a change to a single file."],
    v: "Enable strict direct-dependency checking and build. Any source that includes from an undeclared library should fail with a message naming the missing dependency, and adding it should fix the build.",
    dep: ["target-graph", "attributes-and-labels"]
  },
  "header-scanning": {
    s: "Reads source files to find which headers they include, directly and transitively, so the build can know a compile action's inputs before it runs.",
    d: "A scanner parses include directives, resolves them against the include search path and recurses, producing a set of files an action may read. Results can be computed before execution to declare inputs for sandboxing and remote execution, or approximated by a conservative over-estimate. It must handle conditional inclusion, computed includes and generated headers. It is hard because exact answers require the preprocessor, a cheap scanner over-approximates, and an under-approximation leaves out a file the compiler reads, which fails in a sandbox or on a remote worker.",
    k: ["Cheap textual scanning vs running the real preprocessor: fast and parallel, but over-approximates by ignoring conditionals and may include unneeded files in the input set.", "Scanning before execution vs discovering after: inputs known for remote execution, but every missed header is a hard failure."],
    p: ["A computed include is invisible to the scanner and the remote action fails with a missing file.", "An over-approximate scan adds large unused headers to inputs, uploading far more than necessary."],
    v: "Compile a file in a sandbox containing only the scanner's input set. It must succeed. Add an include behind a conditional and confirm it is either in the set or reported as potentially missing.",
    dep: ["discovered-inputs", "depfiles", "dependency-declaration"]
  },
  "depfiles": {
    s: "Dependency files emitted by a compiler during compilation, listing every file it actually read, which the build records for the next run's change detection.",
    d: "The compiler is asked to write a small file next to its output with the output name and the list of inputs it consumed. After the action succeeds, the build parses it and records the file list and their digests. On the next build, changes in any listed file mark the action dirty, even though the build file never declared them. It is hard because depfiles are known only after the first run, so the first build is not hermetic, and because they list paths as seen by the compiler, which differ under sandboxes and remote workers.",
    k: ["Trusting compiler-reported inputs vs requiring declared ones: accurate incremental builds with little configuration, but not usable for remote execution without extra work.", "Parsing into a database vs re-reading the file each time: less I/O per build, but the database becomes state that must stay consistent."],
    p: ["A header deleted since the last build is still in the depfile, so the action fails to find it instead of rebuilding.", "Path forms in the depfile do not match those in the sandbox, so change detection misses edits."],
    v: "Build a file, edit a header listed only in its depfile, and rebuild. Confirm the object file's action reruns. Delete a listed header and confirm the build reruns rather than erroring.",
    dep: ["discovered-inputs", "actions", "digest-cache"]
  },
  "discovered-inputs": {
    s: "Inputs an action turns out to need that were not declared beforehand, learned by scanning or from tool output, and added to its input set for later runs.",
    d: "Some actions cannot declare every input in advance, so the engine runs a first phase that determines the extra inputs, typically through header scanning or a prior depfile, adds them to the action, and then runs or looks it up in the cache with the full set. The discovered set becomes part of the action key. It is hard because discovery adds a step before execution, may itself need generated inputs, and a wrong set either wastes upload time or yields a command that fails in isolation.",
    k: ["Discover-then-run vs run-then-record: complete inputs for caching and remote execution up front, but the extra pass costs time on every action.", "Persisting the discovered set vs recomputing: faster incremental builds, but stale sets must be invalidated when files change."],
    p: ["A discovered input set that includes a generated file not yet built makes the action unrunnable.", "Discovery finds inputs from the host's system directories, which differ on remote workers."],
    v: "Run an action with discovery, inspect its recorded inputs, and confirm they match the files the tool opened according to a trace. Run it remotely and confirm it succeeds without missing-file errors.",
    dep: ["header-scanning", "depfiles", "action-key"]
  },
  "dynamic-dependencies": {
    s: "Dependencies that cannot be known until some other action has run, such as module build order or generated file lists, resolved during execution instead of beforehand.",
    d: "The graph is extended while the build runs: an action produces a description of further dependencies, and the engine then schedules those additional actions and re-runs or completes the dependent one. A common case is languages where the module dependency order is only learned by scanning sources. The engine must restart a suspended computation when new results arrive, and avoid redoing finished work. It is hard because it breaks the clean separation between planning and running, complicates cycle detection and remote execution, and makes the graph differ between runs.",
    k: ["Dynamic edges vs conservative static ones: precise ordering and no over-building, but a more complex engine and harder-to-reason-about failures.", "Restarting the dependent computation vs suspending it: simple and correct, but wasted work when the restarts are frequent."],
    p: ["A dynamic dependency loop appears only when a particular file is edited, and the report lacks the path.", "Remote workers cannot see files discovered after upload, so dynamic steps fail unless inputs are re-sent."],
    v: "Build a target whose module order is discovered by an earlier action. Confirm the graph in the event stream shows the later actions added during execution, and a second build skips them from the cache.",
    dep: ["action-graph", "incremental-engine", "discovered-inputs"]
  },
  "cycle-detection": {
    s: "Finds and reports circular dependencies in the target or action graph, with the exact path of the cycle, instead of deadlocking or recursing forever.",
    d: "While the graph is traversed during loading and analysis, the engine tracks the current path. When a node is reached that is already on the path, it stops and reports the chain. The same check applies to loads between modules and to dynamic dependencies discovered later. Cycles among targets are errors; cycles among source files within a target are tolerated by some languages and handled by grouping. It is hard because the graph is built lazily and in parallel, so the cycle is found by some thread in some order, and a useful message must show the shortest or most readable path.",
    k: ["Detecting at load time vs execution: early failure with a clear path, but dynamic edges can still introduce cycles later.", "Rejecting cycles vs allowing strongly connected groups: a clean acyclic model, but some mutually dependent languages need workaround targets."],
    p: ["A cycle reported without the full chain forces engineers to search the graph by hand.", "Parallel evaluation reports different cycle paths on different runs, which makes the failure look flaky."],
    v: "Create a three-target cycle and build. Confirm the build fails quickly and prints all three labels in order. Break the cycle and confirm the same command succeeds.",
    dep: ["target-graph", "load-and-import"]
  }
});
