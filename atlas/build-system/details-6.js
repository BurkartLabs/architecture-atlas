// Details for the build system plate, part 6: the incremental engine and scheduler.
ATLAS.details("build-system", {
  "incremental-engine": {
    s: "A memoizing computation framework in which every result is a node that records what it read, so a change recomputes only the nodes that transitively depended on it.",
    d: "Each node is a function of a key: load a package, analyze a target, run an action, read a file digest. When a node runs, it requests other nodes, and the engine records those edges. If a node requests something not yet computed, it is suspended and restarted later. After an edit, changed leaf nodes are marked dirty; dirtiness spreads to dependents, which are re-verified, and recomputed only if an input actually changed. It is hard because correctness depends on every read going through the engine, and a side-channel read creates an unrecorded dependency that is never invalidated.",
    k: ["A generic memoizing graph vs a per-phase hand-written cache: one invalidation mechanism for everything, but all code must be written in a restartable style.", "Restarting suspended computations vs blocking threads: threads are never idle on a dependency, but computations that do work before a missing dependency repeat it."],
    p: ["Reading a file directly inside a rule bypasses the engine, so edits to it never trigger a rebuild.", "A long computation that restarts for each of many dependencies repeats its prefix quadratically."],
    v: "Change one source file and rebuild with tracing. Confirm only nodes on the path from that file to the requested outputs are re-verified, and that unaffected packages show zero node evaluations.",
    dep: ["invalidation", "minimal-rebuild", "in-memory-graph"]
  },
  "invalidation": {
    s: "Marks results as stale when something they read changed, by learning of changes from file events or by checking file state at the start of a build.",
    d: "Invalidation begins at the leaves: files, directory listings, environment values and flags. A watcher or a pre-build scan reports changed leaves, and the engine marks them and their transitive dependents as possibly dirty. Dirty nodes are then re-checked: if a dirty node's inputs have the same values as before, it is declared clean without recomputation. The cost is proportional to the changed region, not the repository, when changes are pushed by a watcher. It is hard because without a trustworthy change feed the engine must stat everything, and because missed events cause stale builds.",
    k: ["Event-driven invalidation vs scanning all inputs at build start: instant for small edits, but a missed event produces a wrong build; scanning is slower but self-correcting.", "Marking dirty then verifying vs recomputing eagerly: avoids work when values are unchanged, but needs the previous values stored."],
    p: ["A watcher overflow loses events during a mass file change, and the build keeps using stale results.", "A leaf the engine does not track, such as an environment variable read by a tool, never invalidates."],
    v: "Edit a file with the watcher on, then again with the watcher disabled and scanning on. Both builds should rebuild the same set of actions; touching a file without changing contents should rebuild nothing.",
    dep: ["file-watcher", "incremental-engine", "content-hash-change-detection"]
  },
  "minimal-rebuild": {
    s: "The property that after a change, only actions whose inputs actually differ are run again, and everything else is reused.",
    d: "The engine compares each action's key against the one recorded when its outputs were produced. If the key is the same and the outputs exist and match, the action is skipped. Combined with early cutoff, a change that does not alter an intermediate output stops propagating at that point. Minimality depends on accurate, fine-grained input declarations: too coarse and extra actions run; missing inputs cause under-rebuilds that are worse. It is hard because it is only as good as the weakest rule or declaration in the chain.",
    k: ["Strict input fidelity vs convenient coarse inputs: truly minimal rebuilds and cache sharing, but work for each rule author.", "Checking outputs on disk for each skipped action vs trusting the record: catches tampered or deleted outputs, but adds a stat per output on every build."],
    p: ["A rule that lists the whole source tree as input makes any edit rebuild everything.", "A deleted output with a still-valid record leaves a dependent action running against a missing file."],
    v: "Change a comment in one source file and rebuild: the compile action reruns. Then change nothing and rebuild: zero actions should run. Measure the action counts from the build summary.",
    dep: ["incremental-engine", "action-key", "early-cutoff"]
  },
  "early-cutoff": {
    s: "Stops propagating a change once a rebuilt action produces output identical to the previous one, so dependents are not rerun.",
    d: "After an action runs, the engine compares the digest of each output with the recorded one. If all match, the action's result is reported as unchanged, and dependents whose other inputs also did not change are skipped. For example, editing a comment recompiles one file, yields an identical object file, and skips the link. It requires content digests of outputs, not timestamps, and deterministic tools. It is hard because any nondeterministic byte, such as an embedded timestamp or path, defeats it, and the digest of every output must be computed after each action.",
    k: ["Comparing output digests vs propagating on any rerun: skips large downstream work after trivial edits, but costs hashing every output and needs reproducible tools.", "Per-output cutoff vs per-action: finer reuse when only some outputs change, but more bookkeeping per action."],
    p: ["A tool embedding a build timestamp makes every output new, so cutoff never triggers and edits cascade.", "Outputs hashed lazily on first use show up as changed later and surprise a downstream action."],
    v: "Edit a comment in one file of a library and rebuild. Confirm that the compile action ran, its output digest matched, and the link and everything downstream was reported as not rerun.",
    dep: ["content-hash-change-detection", "incremental-engine", "reproducibility"]
  },
  "parallel-scheduler": {
    s: "Runs ready actions concurrently, up to configured resource limits, and starts a new one whenever a running action finishes and its dependents become ready.",
    d: "An action is ready when all its inputs exist. Ready actions go to a queue and are dispatched to execution strategies, local or remote, up to limits on jobs, CPU and memory. Completion events update the graph and release dependents. Threads for loading and analysis run alongside execution, so work overlaps across phases instead of waiting for each to finish. It is hard to balance: too much parallelism exhausts memory or disk and makes everything slower, while too little leaves cores idle behind a long single-threaded step.",
    k: ["Overlapping loading, analysis and execution vs strict phases: lower wall-clock time, but more complex state and harder diagnosis.", "A fixed job count vs adapting to load: predictable behavior, but poor use of machines whose free capacity varies."],
    p: ["Setting jobs to the core count plus remote capacity floods the machine with memory-hungry linkers and triggers swapping.", "Local actions starve because remote slots are exhausted, and nothing reports which queue is the bottleneck."],
    v: "Build a wide graph with two job limits and check the profile's parallelism counter. Total time should fall with more jobs until the critical path dominates, then stop improving.",
    dep: ["action-graph", "critical-path-scheduling", "resource-aware-scheduling", "execution-strategies"]
  },
  "critical-path-scheduling": {
    s: "Chooses which ready action to start first by favoring those on the longest chain of remaining work, so the build's slowest chain is never kept waiting.",
    d: "When more actions are ready than slots are free, order matters. The scheduler assigns each action a priority from estimated remaining path length, using historical durations or heuristics such as the number of dependents, and starts the highest first. Long link and code generation steps that gate much downstream work run early; leaf work fills gaps. It is hard because durations are estimates that vary with cache hits and machine load, and because aggressive reordering can raise peak memory when many large actions run together.",
    k: ["Prioritizing by remaining path length vs first-come order: lowers wall time when the path binds, but needs duration history that fresh builds lack.", "Static heuristics such as fan-out vs measured durations: no history required, but crude on graphs with a few very long actions."],
    p: ["Duration estimates from cache hits make the true expensive action look free and get it scheduled last.", "A priority scheme that always starts the largest actions first can run many memory-heavy links at once."],
    v: "Record action durations from one build, then rebuild cold with and without priority scheduling. The build with priorities should finish measurably sooner on a graph with one long chain and many short actions.",
    dep: ["critical-path-analysis", "action-graph", "build-profile"]
  },
  "resource-aware-scheduling": {
    s: "Limits concurrent actions by declared resource needs, such as memory, CPU threads or exclusive devices, so heavy actions do not overload the machine.",
    d: "Actions may declare estimated or measured resource use, and tests may be tagged exclusive or sized. The scheduler holds a budget for each resource and starts an action only if its request fits. Rules for linkers or code generators often carry high memory estimates; tests needing a single device are serialized. Some schedulers learn from past runs. It is hard because estimates are guesses, because memory use varies with the input, and because too conservative a budget leaves machines idle while too optimistic a one triggers out-of-memory kills.",
    k: ["Declared estimates vs measured usage: simple and predictable, but wrong estimates waste capacity or overload the machine.", "Counting resources only locally vs globally with remote workers: easy to implement, but remote pools can be overloaded by independent clients."],
    p: ["An action killed for memory is retried at the same concurrency and fails again, wasting the run.", "A test that needs a shared port runs in parallel with another that uses it and fails intermittently."],
    v: "Run a build with several memory-heavy actions on a memory-limited machine. Peak memory should stay below the budget and no action should be killed; raising concurrency without budgets should reproduce the failures.",
    dep: ["parallel-scheduler", "actions", "test-environment"]
  },
  "failure-handling": {
    s: "Decides what happens when an action fails: stop immediately, or keep going to build everything that does not depend on it and report all failures together.",
    d: "By default a failure stops scheduling new work and drains running actions, giving fast feedback. A keep-going mode continues with independent branches, so one run reports every compile error and every failing test. Failed actions are not cached as successes; some systems record failures briefly to avoid retrying. Errors are attributed to targets and tools, and exit codes distinguish categories. It is hard because partial results must remain consistent, because transient infrastructure failures should be retried and real failures not, and because noisy output from many failures hides the first one.",
    k: ["Stop at first failure vs keep going: fast feedback and little wasted work, versus all errors in one pass at the cost of more compute.", "Retrying failed actions automatically vs reporting once: transient failures vanish, but flaky tools are hidden."],
    p: ["Keep-going output prints hundreds of downstream failures that are all caused by one earlier error.", "An infrastructure failure, such as a lost worker, is reported as a compile error and sends developers hunting in their code."],
    v: "Introduce two independent compile errors and a dependent link. With stop-on-failure the build reports one and exits; with keep-going it reports both errors, skips the link, and exits with a build-failure code.",
    dep: ["parallel-scheduler", "actions", "build-event-stream"]
  }
});
