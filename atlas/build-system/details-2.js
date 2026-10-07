// Details for the build system plate, part 2: observability and the build language.
ATLAS.details("build-system", {
  "build-event-stream": {
    s: "An ordered, structured stream of events describing a build: targets requested, actions started and finished, test results, cache outcomes and the final summary.",
    d: "The engine publishes typed events as things happen, each with an identifier and a list of the events it is a child of, forming a tree. Consumers include the console, upload services that give every build a shareable result page, and analysis pipelines. Streams can be written to a file or sent to a server. It is hard because events come from many parallel threads yet must be consumable in a stable order, because a build that crashes must still close the stream cleanly, and because the schema becomes a compatibility contract for every consumer.",
    k: ["A structured schema vs plain log lines: consumers can build dashboards and diffs reliably, but the schema must be versioned and every new fact needs a field.", "Streaming live vs writing once at the end: live progress pages for long builds, but a network sink can slow or stall the build unless buffered and bounded."],
    p: ["A slow upload endpoint backs up the stream and delays the build's own completion.", "Events with large embedded logs bloat the stream, so storage costs surprise the team."],
    v: "Run a build with the stream written to a file, parse it, and confirm every executed action has a start and a completion event and that the final summary's counts match the console output.",
    dep: ["actions", "incremental-engine"]
  },
  "build-profile": {
    s: "A timeline trace of what each thread and phase of the build did, with durations, so slow loading, analysis, execution and idle gaps can be seen visually.",
    d: "The engine records spans for phases (loading, analysis, execution), individual actions, cache lookups, uploads and downloads, and scheduler waits, written in a trace format that a timeline viewer opens. Each span has a thread or worker lane, and counters track parallelism and memory over time. It is hard because recording must be cheap enough to leave on, and reading it requires knowing the difference between work that is slow and work that is merely waiting for a dependency that is slow.",
    k: ["Always recording a coarse profile vs enabling only on request: any slow build is explainable after the fact, but recording overhead and disk use are constant.", "Per-action spans vs sampled spans: exact attribution, but a large build produces traces too big for most viewers."],
    p: ["Reading a long action as the problem when it was blocked waiting for the network, not computing.", "A trace taken on a busy laptop is compared to one taken on idle CI, and the difference is blamed on code."],
    v: "Build with profiling on, open the trace, and confirm the phases appear in order with per-thread action lanes. Add a deliberate sleep to one action and confirm it shows as the widest span.",
    dep: ["build-event-stream", "parallel-scheduler"]
  },
  "critical-path-analysis": {
    s: "Identifies the chain of dependent actions whose summed durations set the minimum possible build time, showing where more parallelism will not help.",
    d: "After a build, the system walks the executed action graph, weighting each action by its measured duration, and finds the longest path from inputs to the final outputs. It reports each action on that path with its time and what it waited on. Actions off the path have slack and can be slowed without lengthening the build; actions on it cannot. It is hard because durations vary by cache hit, remote queue time and machine load, so the path for one run may differ from the next, and a cached action contributes nothing.",
    k: ["Measuring the path from the last run vs predicting from historical durations: exact for what happened, but unrepresentative of a cold build.", "Including queue and transfer time in action duration vs counting only execution: shows true latency, but blurs compute cost with infrastructure delay."],
    p: ["Adding workers does nothing for a build dominated by a single link step on the path, and the team keeps buying capacity.", "Optimizing a large action with slack changes nothing."],
    v: "Run a clean build and list the critical path. Speed up one action on the path and confirm total build time falls by about that amount, then speed up one off the path and confirm it does not.",
    dep: ["build-profile", "action-graph", "critical-path-scheduling"]
  },
  "cache-hit-reporting": {
    s: "Summaries of how many actions were satisfied from each source (in-memory, local disk, remote cache, remote execution, fresh run) and what the misses had in common.",
    d: "Each action finishes with an outcome tag recording where its result came from. The summary aggregates counts and bytes by tag and by action kind, and can list the largest misses by time. A build that expected near-total hits but shows many misses points to an unstable cache key, such as a timestamp or absolute path in the inputs. It is hard because a miss has many causes (new input, changed flag, different platform, evicted entry) and the summary alone cannot tell them apart without comparing keys.",
    k: ["Reporting per action kind vs per target: points at the responsible rule or tool, but target owners need the per-target view to act.", "Counting hits by number of actions vs by time saved: simple, but a thousand cheap hits hide one expensive miss."],
    p: ["A high hit rate on trivial actions masks that the expensive link and test steps all missed.", "A cache that was warmed by one configuration looks healthy for a developer who builds another."],
    v: "Build once to warm the cache, clean the local state, and rebuild. Confirm the report shows nearly every action as a remote hit. Change one flag and confirm the affected actions show as misses.",
    dep: ["build-event-stream", "cache-key", "remote-cache-protocol"]
  },
  "execution-log": {
    s: "A detailed record of every executed action's command, environment, inputs with digests and outputs, which can be compared between two builds to find why they differ.",
    d: "The engine writes one entry per action containing the exact command line, environment variables, platform properties, the digest of every input file, and the digests of outputs. Two logs from builds that should be identical are sorted and compared, and the first differing action is the root cause: a changed input, a different tool version, or a nondeterministic output. It is hard because logs are large, and because the interesting difference is the earliest one in dependency order, not the loudest one.",
    k: ["Recording full input digests vs only the action key: lets a diff name the exact changed file, but the log grows with the size of every action's input set.", "Logging on every build vs on demand: complete history for any investigation, but disk and slowdown costs on all builds."],
    p: ["Comparing logs by position rather than by action identity yields a diff full of noise from reordering.", "The log omits the environment, so a difference due to a variable cannot be explained."],
    v: "Build the same revision on two machines, diff their execution logs, and confirm any difference is attributable to a named input digest. With identical setups the logs should compare equal.",
    dep: ["actions", "action-key", "content-hash-change-detection"]
  },
  "rebuild-explanations": {
    s: "Reports why a specific action or target was rebuilt: which input, flag, tool or configuration value differed from the previous build.",
    d: "The engine keeps enough of the previous run's state, or can recompute it, to compare the old and new action key component by component. The explanation names the first difference: a source file digest, a command line change, an environment variable, a toolchain digest or a missing output. Developers use it when a build rebuilds more than expected. It is hard because the immediate reason (a dependency was rebuilt) hides the root cause several steps up, and because tracking old state for every action costs memory and disk.",
    k: ["Storing full key components per action vs only a hash: precise explanations, but more memory and larger caches on disk.", "Explaining the nearest cause vs the root cause: the nearest is cheap, but a developer needs the earliest changed input to act."],
    p: ["An explanation of 'dependency changed' repeated across a thousand targets without ever naming the file at the origin.", "Explanations compare against the last build of a different configuration and mislead."],
    v: "Touch one header, build with explanations on, and confirm the report for a dependent object file names that header's digest change as the cause, while unrelated actions report no change.",
    dep: ["action-key", "invalidation", "execution-log"]
  },
  "reproducibility-checking": {
    s: "Verifies that building the same inputs twice produces identical outputs, by rebuilding in a clean environment and comparing digests of results.",
    d: "A checker builds a target twice, ideally on different machines or paths, with caches disabled, then compares output digests. Differences are traced to the action that first produced a differing file and classified: embedded timestamps, absolute paths, unordered iteration, random seeds or locale. Some systems run it continuously on a sample of actions. It is hard because reproducibility failures are rare per action but common across a large graph, and each source of nondeterminism lives in a different tool.",
    k: ["Checking all actions on a schedule vs sampling on every build: complete coverage, but expensive; sampling is cheap but misses rare causes.", "Treating mismatch as a build failure vs a warning: protects the cache from poisoning, but blocks teams on tool bugs they do not own."],
    p: ["A single nondeterministic action makes every dependent cache key unique, so downstream cache hits drop to zero.", "Builds are compared on the same path and machine, hiding path and host dependencies."],
    v: "Build a target in two different checkout directories with caches off, then compare the digests of all outputs. Any mismatch should be traceable to one named action and a named cause.",
    dep: ["reproducibility", "execution-log", "content-addressable-store"]
  },
  "build-files": {
    s: "The files, one per package or directory, in which engineers declare targets: what exists, its sources, and what it depends on.",
    d: "A build file lists target declarations as calls to rules, each with named attributes, plus loads of shared definitions. It sits next to the source it describes, so ownership is local and changes are reviewed with the code. The system finds a package by locating the file and evaluating it into a set of targets. It is hard because the file is code that must stay readable by humans and machine editors alike, and at scale most edits are mechanical, so formats and tooling for automatic update matter.",
    k: ["One build file per directory vs one per repository: local ownership and small evaluations, but many files to load and keep consistent.", "Hand-written declarations vs files generated from source scanning: always accurate, but the generated form hides intent and complicates review."],
    p: ["A declaration that lists too few dependencies passes locally from stale outputs and fails on a clean checkout.", "Copy-pasted build files drift apart, so the same library builds with different flags in different directories."],
    v: "Add a target to a build file, run a query on its package, and confirm the new label appears with the declared attributes. Remove a required dependency and confirm a clean build fails.",
    dep: ["build-language", "package-loading"]
  },
  "build-language": {
    s: "The small programming language in which build files and rule definitions are written, with variables, functions, lists and dictionaries but no unrestricted side effects.",
    d: "The language is typically a dialect resembling a familiar scripting language, with a deliberately reduced feature set: no global mutable state, no recursion in some designs, no reading arbitrary files or the clock. Values become immutable after a module finishes loading, so they can be shared safely between threads. The same language expresses build files, macros and rule implementations. It is hard because users expect a full language and keep asking for features, while every addition risks nondeterminism, slowness or an evaluation that cannot be cached.",
    k: ["A restricted purpose-built language vs an embedded general-purpose one: determinism and parallel evaluation are guaranteed, but users hit limits and write awkward workarounds.", "Static types vs dynamic: errors caught earlier and better tooling, but a steeper learning curve and a migration cost for existing files."],
    p: ["Users write long computations in macros because loops are allowed, making every load slow.", "A feature added for convenience, such as environment access, silently makes build evaluation depend on the developer's machine."],
    v: "Write a build file that tries to read the clock or an arbitrary file, and confirm evaluation fails or is refused. Evaluate a legitimate file twice and confirm identical target sets.",
    dep: ["restricted-evaluation"]
  },
  "restricted-evaluation": {
    s: "The set of rules that keep evaluation deterministic and cheap: no ambient I/O, immutable results, bounded loops and no dependence on the order of evaluation.",
    d: "The evaluator exposes only functions that are pure or that go through the engine, such as listing files by glob or reading a declared file, so each access is tracked as a dependency. After a module's top level runs, its values are frozen, and later modules see them read-only. Some designs limit recursion and loop iterations or measure execution steps. It is hard because the same restrictions that make the system predictable are what users find limiting, and because a leak, like hash iteration order, quietly breaks determinism.",
    k: ["Freezing values after load vs allowing mutation: safe sharing across parallel loads, but a module cannot adjust a value it imported.", "Step limits vs trusting authors: runaway evaluations are stopped early, but legitimate large generators must be restructured."],
    p: ["Iterating over an unordered collection produces a different target order on each run, giving unstable cache keys.", "A helper that shells out during evaluation works locally and breaks in the remote environment."],
    v: "Evaluate the same package on two machines and diff the serialized target lists. They should be identical byte for byte, including order, and a deliberate non-pure call should be rejected.",
    dep: []
  },
  "package-loading": {
    s: "The phase that finds a package's build file, evaluates it and produces the set of targets, with its dependencies on globs and loaded modules recorded.",
    d: "Given a package name, the loader locates the build file, evaluates the loads at its top, runs the file's body to create targets, and expands any globs by listing the directory. The result is a package object keyed by its path. Loading is parallel across packages and memoized, and its inputs (file contents, directory listings, loaded modules) are recorded so a change invalidates exactly the affected packages. It is hard because loading is the part of the build that cannot be skipped for a changed file, and a slow loader dominates the latency of small edits.",
    k: ["Loading lazily on demand vs eagerly loading the whole repository: only needed packages are paid for, but discovering dependencies interleaves loading with analysis.", "Memoizing evaluated packages vs re-evaluating each build: huge savings after small edits, but memory grows and invalidation must be exact."],
    p: ["A glob over a large directory is re-run on every directory change, so builds slow down when unrelated files appear.", "A package that fails to load poisons every target that transitively depends on it."],
    v: "Edit one build file and rebuild with the daemon warm. Confirm the profile shows only that package reloading, and that a no-op rebuild after it loads zero packages.",
    dep: ["build-files", "glob-expansion", "load-and-import", "incremental-engine"]
  },
  "load-and-import": {
    s: "The mechanism by which one build file imports definitions, such as macros and rules, from another module, with a single evaluation per module and tracked dependencies.",
    d: "A load statement names a module by label and binds chosen symbols into the current file. Each module is evaluated once, its frozen values shared by every importer, and import cycles are rejected. The loader treats modules as inputs of the packages that load them, so editing a shared module invalidates all of its importers. It is hard because a widely shared module touches thousands of packages at once, and because transitive loads form a graph of their own that can become deep and slow.",
    k: ["Many small modules vs a few large ones: edits invalidate fewer packages, but there are more files and more loading overhead.", "Allowing loads from external repositories vs restricting to the workspace: reuse of shared rules, but rule versions become another dependency to pin."],
    p: ["A one-line change to a shared helper reloads every package in the repository, taking minutes.", "A module that imports back from its importer creates a cycle that only appears on certain load orders."],
    v: "Edit a leaf module and count reloaded packages: only its importers should reload. Introduce an import cycle and confirm the loader reports the cycle path rather than hanging.",
    dep: ["build-language", "incremental-engine"]
  },
  "glob-expansion": {
    s: "Expands file patterns in a build file into the list of matching sources, as a tracked dependency on the directory contents.",
    d: "A glob names include and exclude patterns relative to the package. Expansion lists directories, matches names, and returns a sorted list so that results are deterministic. The directory listing is recorded as an input, so adding or removing a matching file re-evaluates the package. Globs do not cross into subdirectories that are themselves packages. It is hard because a glob hides dependencies: files appear or vanish without any build file edit, and on large trees the listing cost and the case sensitivity of file names vary by platform.",
    k: ["Globs vs explicit source lists: no edits when files are added, but accidental inclusion of stray or generated files and unstable inputs.", "Following symlinks vs ignoring them: supports linked source trees, but risks cycles and surprising extra files."],
    p: ["A backup or editor temporary file matching a pattern is compiled into the target and breaks the build for one developer.", "A glob over a generated directory yields different results before and after the generator runs."],
    v: "Add a new file matching a glob and rebuild without touching the build file. Confirm the target includes it. Add a file in an excluded pattern and confirm the target is unchanged.",
    dep: ["package-loading", "digest-cache", "file-watcher"]
  }
});
