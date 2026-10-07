// Details for the build system plate, part 1: command line, daemon, IDE, query and CI integration.
ATLAS.details("build-system", {
  "command-line-interface": {
    s: "The user-facing commands for building, testing, running and querying, with a shared flag system that selects targets, configuration, caches and execution strategy.",
    d: "A small client parses the command, merges flags from the command line, per-project and per-user configuration files and named profiles, and sends a request to the build server. Commands share one option set so that a flag valid for building also applies to testing. The client streams the server's progress to the terminal and exits with a code that distinguishes build failure, test failure, bad usage and infrastructure error. It is hard to keep stable: every flag becomes a contract that scripts depend on, and flags interact in ways that change cache keys.",
    k: ["One shared flag set across commands vs per-command flags: consistent behavior and fewer surprises, but a huge flag surface that is difficult to deprecate.", "Layered configuration files vs explicit flags only: teams share defaults, but a build's behavior depends on files the person running it may not have noticed."],
    p: ["Flags set in a personal configuration file make a local build differ from CI, so a failure cannot be reproduced.", "A script parses human-readable output, and a cosmetic change breaks it; exit codes and structured events are the only stable interface."],
    v: "Run the same build with and without a profile that sets a flag, and confirm the printed effective options differ. Force a compile error, a failing test and a bad flag, and confirm three distinct exit codes.",
    dep: ["build-daemon", "target-patterns"]
  },
  "build-daemon": {
    s: "A long-lived server process that holds the loaded graph and caches in memory between commands, so repeated builds skip loading and analysis work.",
    d: "The first command starts a server bound to one workspace and one output directory. Later commands connect over a local socket, and the server reuses its in-memory graph, parsed build files and file digests, doing only the work that changed. It serializes commands per workspace, since two builds writing the same outputs would corrupt each other, and shuts itself down after idle time or when memory is short. The difficulty is lifecycle: stale servers, option changes that force a restart, memory growth over days, and crash recovery that must not leave half-written outputs.",
    k: ["Persistent server vs fresh process per command: warm commands are many times faster, but state can go stale or leak and failures become harder to reproduce.", "One server per workspace vs shared across checkouts: isolation is simple, but each checkout pays its own memory cost."],
    p: ["A flag that changes the server's startup options silently restarts it and throws away the warm graph, making the next build unexpectedly slow.", "A server left running for days holds gigabytes and gets killed by the operating system, losing cached analysis."],
    v: "Run a no-op build twice on a large workspace. The second should finish in a small fraction of the first, and the server's process id should be unchanged between the two runs.",
    dep: ["in-memory-graph", "incremental-engine"]
  },
  "in-memory-graph": {
    s: "The server's resident representation of loaded packages, targets, analysis results and action nodes, kept so that a small edit touches only a small part of it.",
    d: "Each node records its computed value, the nodes it read, and the version at which it was last verified. Nodes are created lazily as a command demands them and deduplicated so shared dependencies exist once. Memory is dominated by the target and action graphs, and the system trades their size against the cost of recomputation: nodes can be dropped when not needed for the current command or kept for the next. It is hard because a monorepo graph has millions of nodes, and any per-node overhead multiplies, so compact interning of strings and paths matters.",
    k: ["Keeping all nodes resident vs discarding after use: instant incremental builds, but memory is proportional to the whole repository rather than the requested targets.", "Interned, shared representations vs plain objects per node: much smaller footprint, but more complex code and slower debugging."],
    p: ["A rule that stores large lists per target multiplies across thousands of targets and exhausts memory, and the cause is invisible without a heap report.", "Nodes holding references to old values keep stale data alive after invalidation, leaking memory across builds."],
    v: "Load a large set of targets, then query the server's memory report and confirm node counts by type. Edit one source file and confirm only that file's dependents are marked dirty.",
    dep: ["incremental-engine", "target-graph", "action-graph"]
  },
  "target-patterns": {
    s: "The syntax users write to select what to build: a single target, every target in a directory, a recursive subtree, or a subtraction of one set from another.",
    d: "A pattern is resolved against the package structure into a set of target labels. Wildcards expand by listing packages on disk, recursive patterns walk directory trees while honoring ignore rules, and a leading negation removes matches from earlier ones. Patterns can also select by rule kind or tag. Resolution happens before analysis, so a malformed or empty pattern is a loading error, not a build failure. It is hard because wildcard expansion touches the file system and every package it finds must load, so a sloppy pattern can force loading the whole repository.",
    k: ["Recursive wildcards vs explicit lists: convenient and complete, but they pull in every target including broken or expensive ones.", "Failing on a pattern that matches nothing vs succeeding quietly: catches typos, but breaks scripts that legitimately run on possibly empty sets."],
    p: ["Building the whole tree from the root loads every package, so one broken package blocks unrelated work unless keep-going is on.", "A pattern with a typo that matches nothing succeeds, and CI reports a green build that built nothing."],
    v: "Resolve a recursive pattern with one subdirectory excluded and list the expanded labels. Confirm the excluded subtree is absent and that a pattern naming a nonexistent package fails with a clear loading error.",
    dep: ["package-loading", "target-graph"]
  },
  "console-output": {
    s: "The terminal view of a running build: progress, the actions currently executing, warnings from tools, and a final summary of what succeeded, failed or was served from cache.",
    d: "The server emits structured events that the client renders as a live status area plus a scrolling log of completed work. Tool output is captured per action and shown only on failure or when requested, so successful actions stay quiet. The summary reports counts of actions run, cache hits by kind, and the slowest critical path. It is hard to get right because many actions run at once, so their output must not interleave, and the display must degrade gracefully when output is a file rather than a terminal.",
    k: ["Capture and replay each action's output vs streaming it live: output stays grouped and readable, but a long action shows nothing until it ends.", "Quiet on success vs verbose by default: less noise to scan, but the evidence for what ran lives only in logs."],
    p: ["Warnings from cached actions are not shown on the second build, so the team stops seeing them and they accumulate.", "Progress that counts actions discovered so far swings backward as the graph expands, and the percentage misleads."],
    v: "Run a build where one action prints a warning and one fails. Confirm the warning and the failing output appear grouped under their targets, and rerun to confirm the summary reports the cached count.",
    dep: ["build-event-stream", "build-daemon"]
  },
  "output-layout": {
    s: "The directory structure where outputs are written, separated by configuration so that debug, release and cross-compiled results coexist without overwriting each other.",
    d: "Outputs go to a tree outside the source directories, with one subtree per configuration and per kind (generated sources, binaries, test logs). Convenience symlinks in the workspace point at the latest results for the default configuration. Paths are derived from the configuration's identity, so two builds with different options never collide. It is hard because path length limits, case-insensitive file systems and tools that embed absolute paths in outputs all make the layout part of the build's observable behavior, and changing it invalidates everything.",
    k: ["Per-configuration output subtrees vs one shared tree: switching configurations costs nothing and keeps both warm, at the price of disk space for each.", "Convenience symlinks vs only printing paths: friendly for people, but scripts that follow them can pick up results from the wrong configuration."],
    p: ["A configuration hash in the path makes it unpredictable, so scripts hard-code a path that breaks when an option changes.", "Absolute output paths embedded in binaries make outputs differ by checkout location, defeating shared caches."],
    v: "Build the same target in two configurations and confirm both output trees exist side by side with different binaries. Switch back and confirm the first rebuild is a no-op.",
    dep: ["output-directory", "build-configuration"]
  },
  "artifact-publishing": {
    s: "Takes built outputs and delivers them: packaging into archives or images, signing, uploading to a repository, and recording what was published and from which source version.",
    d: "Publishing is modeled as targets whose actions package outputs, or as commands run after a successful build against a specific set of results. Inputs are the exact outputs of a recorded build, so what is published is what was tested. The step attaches provenance: source revision, configuration, toolchain identity and the digest of every input. It is hard because publishing has side effects the cache cannot replay, so it must be kept outside the cached action graph and made idempotent, with credentials never entering action inputs.",
    k: ["Publishing as a cached build action vs as a separate post-build step: caching makes packaging fast, but side effects like uploads must never be replayed or skipped.", "Publishing exactly the tested outputs vs rebuilding for release: one verified artifact, but release builds cannot use different flags without a second test pass."],
    p: ["A release rebuilt from the same revision with a different toolchain version produces different bytes than the tested artifact.", "Credentials reachable from action inputs get recorded in caches and logs."],
    v: "Publish an artifact, then fetch it and compare its digest to the one recorded in the build's output manifest. Confirm the provenance record names the source revision and the configuration.",
    dep: ["action-result", "reproducibility", "hermeticity"]
  },
  "compile-command-database": {
    s: "A machine-readable list giving the exact compiler command for each source file, which editors and analysis tools read to understand includes, flags and macros.",
    d: "Each entry names a source file, its working directory and the full command line. The build generates it from the action graph, either as a side output of a normal build or from a dedicated command that analyzes without compiling. Tools use it to configure completion, navigation and static analysis exactly as the compiler sees the file. It is hard because the commands in a remote or sandboxed build refer to paths that do not exist on the developer's machine, and because generated headers must exist before analysis tools parse files that include them.",
    k: ["Generating from analysis alone vs from executed actions: instant and no compile needed, but generated headers may be missing until a build runs.", "One database for the whole repository vs per target: simple for tools, but huge and slow to refresh in a monorepo."],
    p: ["Entries point at sandbox or remote paths, so editors cannot find headers and show false errors.", "A stale database after a flag change gives completion and diagnostics for the wrong configuration."],
    v: "Generate the database, pick one file, run its recorded command by hand from the recorded directory, and confirm it compiles with the same flags as the build. Open the file in an editor and confirm includes resolve.",
    dep: ["action-graph", "generated-sources"]
  },
  "ide-project-sync": {
    s: "Produces or refreshes the editor's own project model from build definitions, so that the editor's indexing, debugging and run buttons agree with what the build does.",
    d: "A plugin or exporter queries the build for the targets in scope, their sources, include paths, dependency edges and generated files, then writes the project files an IDE expects or answers its requests live. Sync runs when build files change and must finish quickly or developers stop trusting it. It is hard because the IDE's model is usually coarser than the build's: it has one set of flags per module, while the build may compile the same file differently for each configuration, so something is always lost in translation.",
    k: ["Importing a snapshot into IDE project files vs querying live: snapshots work offline and fast, but drift from the build until the next sync.", "Syncing the whole repository vs only chosen targets: complete navigation, but minutes of sync time and large indexes."],
    p: ["The IDE compiles with its own settings and reports errors the real build does not, so developers learn to ignore it.", "A sync that fires on every build file edit blocks the editor for large repositories."],
    v: "Add a new source file to a target, run sync, and confirm the IDE resolves symbols from it. Change a define in the build and confirm the IDE's indexed value updates after sync.",
    dep: ["graph-query-tools", "compile-command-database"]
  },
  "build-server-protocol": {
    s: "A standard message protocol between an editor and the build system, used to list targets, request builds and tests, and receive diagnostics, independent of how the build works.",
    d: "The editor acts as a client and the build system as a server over a local stream. Typical requests are: list workspace targets, get sources and dependencies for a target, compile a set of targets, run a test, and stream diagnostics and progress back as notifications. The protocol deliberately describes results, not internals, so one editor plugin works against many build systems. It is hard because the protocol must stay minimal while real builds have concepts it cannot express, and long requests need cancellation and incremental diagnostics without blocking.",
    k: ["A generic protocol vs build-specific plugins: one editor integration serves many tools, but build-specific features go unexposed or arrive as extensions.", "Pushing diagnostics as they appear vs returning them at the end: editors update live, but ordering and deduplication across parallel actions become the server's job."],
    p: ["Two editors and a command line build share one server, and their requests contend for the same output directory.", "Diagnostics from a cached action are never re-sent, so the editor shows a clean file that still has warnings."],
    v: "Connect a client, request the target list, then compile one target and confirm diagnostics arrive as notifications tied to file paths. Cancel a long build and confirm it stops and the server stays responsive.",
    dep: ["build-daemon", "graph-query-tools", "build-event-stream"]
  },
  "graph-query-tools": {
    s: "Commands that interrogate the graphs without building: what a target depends on, what depends on it, why one depends on another, and which actions would run.",
    d: "A small expression language composes set operations over targets: dependencies, reverse dependencies, paths between two nodes, filtering by rule kind or attribute, and intersections. Variants run against the target graph (declared structure), the configured graph (after configuration is applied) or the action graph (commands and files). Results print as labels, structured data or a graph description. It is hard because the three graphs answer different questions, and answering about the configured graph requires choosing a configuration and doing real analysis work.",
    k: ["Querying the unconfigured target graph vs the configured one: fast and configuration-independent, but it over-approximates because conditional edges are all included.", "A dedicated query language vs a general scripting interface: concise and safe, but it cannot express every analysis people want."],
    p: ["A reverse-dependency query on the unconfigured graph reports dependents that never build in the current configuration, causing needless test runs.", "Queries over a huge repository load everything and take minutes unless scoped by a universe."],
    v: "Ask for the reverse dependencies of a low-level library, then change that library and build everything. Confirm the set of rebuilt targets matches the query's result for the build configuration.",
    dep: ["target-graph", "action-graph", "in-memory-graph"]
  },
  "graph-export": {
    s: "Writes the dependency structure in a form other tools can render or analyze, such as a graph description, a list of edges, or a structured data dump.",
    d: "An exporter walks the target or action graph and emits nodes with attributes and the edges between them, often after filtering to a neighborhood of chosen targets. Output feeds layout tools for diagrams, dependency-rule checkers, code search indexes and impact analysis. It is hard because a real graph is too large to draw: useful exports focus on a slice, collapse nodes by package or layer, and highlight violations, while the full graph can contain millions of edges that no viewer handles.",
    k: ["Exporting the complete graph vs a filtered slice: complete data for programmatic analysis, but unreadable if rendered, so each consumer must filter itself.", "Target-level vs action-level granularity: target edges match how teams think, but action edges expose the actual file-level dependencies."],
    p: ["A rendered diagram of the whole repository is a hairball that nobody can read, so it is used once and abandoned.", "An export taken in one configuration is treated as the dependency structure of all configurations."],
    v: "Export the neighborhood of one target to a graph file, load it into a layout tool, and confirm that every direct dependency listed in the build file appears as an edge.",
    dep: ["graph-query-tools", "target-graph"]
  },
  "watch-mode": {
    s: "Keeps the build running after a result and rebuilds automatically when a source file changes, so a developer gets feedback by saving the file.",
    d: "A watcher subscribes to changes in the files the last build read. When events arrive, it debounces them for a short window so one editor save does not trigger several builds, marks the affected nodes dirty and starts an incremental build for the same targets. Because the graph is warm in memory, most rebuilds only recompile the changed files. It is hard because editors save through temporary files and renames, because bursts of changes from a branch switch should coalesce, and because a build still running when the next change arrives must be cancelled or queued.",
    k: ["Cancelling the running build on a new change vs finishing it first: feedback reflects the latest edit sooner, but partial work may be thrown away.", "Watching exactly the inputs of the last build vs a broad directory: minimal event noise, but a new file in a glob may not trigger a rebuild."],
    p: ["A branch switch fires thousands of events and triggers a full rebuild when the developer only wanted to pause.", "Generated outputs inside a watched directory trigger the next build, which regenerates them, looping forever."],
    v: "Start watch mode on a target, edit one source file and save. Confirm a rebuild starts within a second, recompiles only that file's actions, and does not loop on its own outputs.",
    dep: ["file-watcher", "minimal-rebuild", "build-daemon"]
  },
  "ci-integration": {
    s: "How a continuous integration system drives the build: choosing what to build for a change, supplying credentials and caches, and reporting results back to reviewers.",
    d: "CI runs the same commands as developers with a CI profile: remote cache and execution enabled, upload permitted, stricter hermeticity and a fixed toolchain. For a change, it computes affected targets by comparing the graph before and after, then builds and tests only those. It publishes the build event stream so results link to logs, and caches results between jobs. It is hard because CI is the trusted writer of shared caches, so its credentials and sandboxing matter, and because computing affected targets correctly requires covering every way a change can propagate.",
    k: ["Building only affected targets vs everything: far less CI time, but a gap in the impact analysis lets a breakage through unnoticed.", "Ephemeral workers with remote caches vs persistent workers with warm local state: clean, reproducible jobs, but every job depends on network cache speed."],
    p: ["A change to a configuration file that is not modeled as an input affects nothing in the analysis, so no tests run.", "CI and developers use different flags, and a build that passes locally fails in CI for reasons nobody can reproduce."],
    v: "Open a change that modifies one low-level library. Confirm CI selects exactly that library's reverse dependencies, runs them, and posts results that link to the event stream and logs.",
    dep: ["graph-query-tools", "build-event-stream", "remote-cache-protocol", "cache-upload-policy"]
  }
});
