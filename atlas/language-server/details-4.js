// Details for the language server plate, part 4: query engine, index, operations, testing, cross-cutting.
ATLAS.details("language-server", {
  "query-engine": {
    s: "Computes analysis results on demand as functions of inputs and of other results, running a computation only when something asks for it and recording what it read.",
    d: "Each kind of result is a query with a key, such as a file's syntax tree or a body's types. Asking runs the function if no valid cached value exists, and while it runs, every query it calls is recorded as a dependency. Inputs, such as file text and the project model, are set by the main loop. The design removes the need to schedule analysis stages by hand. Hard parts are cancellation safety, cycles, memory growth and keeping query functions pure.",
    k: ["Pull-based demand vs push-based pipelines: demand computes only what a request needs, but makes the cost of any one request hard to predict.", "Fine-grained queries vs coarse ones: fine-grained maximizes reuse, but adds bookkeeping per result and more memory for dependency records."],
    p: ["A query that reads global mutable state returns different answers for the same inputs, and memoization hides the bug.", "Making queries too fine-grained spends more memory on tracking than on the results."],
    v: "Edit a function body and trace which queries rerun: only that body's inference and queries reading it should execute, while declaration summaries for the file stay cached, and results equal a cold run.",
    dep: ["memoization", "dependency-graph", "input-revisions", "early-cutoff", "snapshots"]
  },
  "memoization": {
    s: "Stores each query's result keyed by its arguments, with the revision it was verified at, so repeated requests are answered without recomputing.",
    d: "On first call the result is stored with the revision it was computed at and the revision it last changed. On later calls the engine checks whether any recorded dependency changed since the verification revision, recursively, and either reuses the stored value after marking it verified or recomputes. Storage is per query kind, keyed by interned arguments. The hard part is the tradeoff with memory: caching everything is fast but unbounded, so results need eviction policies, with some kept always and others recomputed cheaply.",
    k: ["Caching every query vs selected ones: all gives uniform speed, but memory grows with workspace size; selecting keeps memory bounded but needs per-query tuning.", "Deep verification on each read vs a global revision shortcut: shortcut is fast when nothing changed, but cannot skip work after any change."],
    p: ["Storing large intermediate values that are cheap to recompute makes memory the bottleneck for big workspaces.", "Keying results by values containing positions causes distinct entries for logically identical inputs."],
    v: "Call the same query twice without any edit and confirm the second performs zero recomputations and returns in microseconds; edit an unrelated file and confirm the result is verified, not recomputed.",
    dep: ["input-revisions", "dependency-graph", "interning"]
  },
  "dependency-graph": {
    s: "Records, for every computed result, the list of inputs and other results it read, forming the graph used to decide what an edit invalidated.",
    d: "During a query's execution a tracking frame collects each read. When the query finishes, its dependency list is stored with its value. After an input changes, the engine walks from each requested result through its dependencies, checking whether they changed, and recomputes only where needed. Dependency lists are compared after recomputation, since a result may now depend on different things. The challenge is cost: the graph can have millions of edges, so dependency records are compact and stale ones are dropped.",
    k: ["Recording dependencies automatically on reads vs declaring them: automatic never misses one, but adds overhead to every read; declared is cheaper, but wrong declarations cause stale answers.", "Tracking at the query level vs the field level: field level is more precise, but multiplies the records."],
    p: ["A read made outside the tracking frame, such as through a side channel, is not recorded and leaves a stale result.", "Dependency lists that only grow retain edges to results that no longer matter."],
    v: "Change one input and compare the set of recomputed queries against the true dependents computed by a naive full rerun diff: they must match, with no stale result and no unneeded recomputation.",
    dep: ["query-engine", "input-revisions"]
  },
  "early-cutoff": {
    s: "Stops invalidation from propagating when a recomputed result is equal to its previous value, so dependents are verified instead of recomputed.",
    d: "After an edit, a query is recomputed. If the new value equals the old one, the engine keeps the old change revision, and queries depending on it find nothing changed. Typing a space or editing inside a function body changes the file text and syntax tree but not the item summary, so declaration-dependent work is unaffected. It depends on cheap equality on values, which means designing results to exclude incidental data such as source positions, and it is the largest source of incremental speedup.",
    k: ["Comparing values on recompute vs always marking changed: comparing costs an equality check, but stops cascades; always marking is simple, but invalidates everything downstream.", "Stable abstractions with positions removed vs positions in results: removing positions makes equality useful, but requires separate maps to recover locations."],
    p: ["A result that embeds an offset never compares equal after an insertion above, defeating cutoff for everything.", "A costly equality check on large values can cost more than recomputing the dependents."],
    v: "Add a comment line at the top of a file and confirm the trace shows the file's syntax recomputed but no type inference for bodies, with every semantic query verified without rerunning.",
    dep: ["dependency-graph", "memoization", "item-tree"]
  },
  "input-revisions": {
    s: "A global counter incremented whenever any input changes, with each input and result stamped by the revision at which it last changed or was verified.",
    d: "Inputs such as file text, the module graph and settings are set through the engine, which bumps the revision on each change and records it on the changed input. Results compare stamps to decide freshness. Changes happen only through the main loop, which first waits for or cancels running readers, so a computation sees one consistent revision. The difficulty is the write barrier: setting an input must not race with readers, so it either blocks until they finish or cancels them.",
    k: ["Cancelling readers on input change vs waiting for them: cancelling keeps edits instantly applied, but wastes in-progress work; waiting is wasteful in latency.", "One global revision vs per-input versions: global is simple and cheap to compare, but cannot say which input changed without extra records."],
    p: ["Setting an input while a reader is mid-query without cancelling it exposes mixed old and new data.", "Bumping the revision for a no-op change invalidates verification for everything needlessly."],
    v: "Change the same input to an identical value and confirm no revision bump and no recomputation; change it to a new value while a long query runs and confirm the query is cancelled and restarted on the new revision.",
    dep: ["snapshots"]
  },
  "cycle-recovery": {
    s: "Detects a query that depends on itself, and substitutes a defined fallback result or error rather than recursing forever, so recursive code still gets analyzed.",
    d: "The engine tracks the stack of active queries; a request for a query already on it is a cycle. Some cycles are errors, such as a type containing itself by value; others are fixed-point computations, such as mutually recursive resolution, which iterate from a fallback until stable. Each query kind declares its policy. The challenge is that the answer for every query in a cycle depends on where it was entered, so results must be made consistent, and the error must be reported once.",
    k: ["Fallback values on cycle vs aborting: fallbacks keep analysis going and report an error, but add a fallback definition per query kind.", "Fixed-point iteration vs one-pass cycle detection: iteration supports legitimately recursive definitions, but needs a convergence rule."],
    p: ["Cycle results that depend on entry order give different diagnostics depending on which file was opened first.", "A cycle not handled as one unit overflows the stack on the first self-referential definition."],
    v: "Define two types that contain each other by value and confirm one cycle diagnostic appears regardless of which file is opened first, with other queries on those types still returning answers.",
    dep: ["query-engine", "dependency-graph"]
  },
  "snapshots": {
    s: "Immutable read views of the analysis state at one revision, handed to request handlers so they can run on worker threads while the main loop keeps applying edits.",
    d: "A handler receives a snapshot, a handle to the database fixed to the revision when it was taken. Reads are shared across threads and memoized results are shared. If the main loop applies an input change, snapshot holders are cancelled when they next read, since their revision is dead. This gives parallel reads with simple writes. What makes it hard is cancellation discipline: every long computation must read from the database regularly, or it will not notice that it was cancelled.",
    k: ["Cancelling snapshots on write vs copy-on-write snapshots: cancelling is cheap and simple, but wastes work; copy-on-write lets old readers finish, at heavy memory cost.", "Snapshot per request vs per batch: per request gives exact consistency, but batching shares setup costs."],
    p: ["A computation that never reads the database is never cancelled and keeps running on a dead revision.", "Holding a snapshot across an await in an asynchronous handler blocks input changes."],
    v: "Start a long query, apply an edit, and confirm the query's snapshot is cancelled within milliseconds, that the edit is applied without waiting for it, and that the retried query sees the new text.",
    dep: ["input-revisions", "query-engine", "cancellation"]
  },
  "interning": {
    s: "Maps repeated values such as names, paths and type structures to small integer ids with one stored copy, making equality and hashing cheap and saving memory.",
    d: "Identifiers, module paths and common type shapes are stored once in a table, and everything else holds the id. Equality becomes an integer compare, and ids serve as compact query keys. Tables grow monotonically within a revision, and sharing is across threads. The difficulty is lifetime: an interned value is only freed when no query result refers to it, so the table either leaks or needs garbage collection tied to result eviction, and ids must stay stable across the process lifetime.",
    k: ["Interning everything vs only hot values: everything is uniform and fast to compare, but the table grows without bound; hot-only is smaller, but adds inconsistent code paths.", "Per-revision tables vs global with collection: per-revision frees memory easily, but ids are not stable across revisions."],
    p: ["An ever-growing table of names from generated code leaks memory in a long session.", "Concurrent insertion without proper sharding makes the table a contention point on all cores."],
    v: "Run a long edit session adding and removing unique names, then trigger collection and confirm the table size returns near its baseline and ids held by live results remain valid.",
    dep: []
  },
  "memory-eviction": {
    s: "Drops memoized results to stay inside a memory budget, choosing by recency and recomputation cost, and relying on the engine to recompute them transparently when needed.",
    d: "A policy tracks results by size and last use. When memory crosses a threshold, it discards the least valuable, often syntax trees and body analyses of files not open or recently touched, while keeping cheap and critical summaries. Because results are functions of inputs, dropping one is safe and invisible except for latency. The tradeoff is thrashing: if the working set exceeds the budget, the server recomputes constantly. Choosing what is cheap to rebuild matters more than any specific recency rule.",
    k: ["Evicting syntax trees and bodies first vs everything uniformly: trees are large and quick to reparse, so dropping them saves the most for the least cost, but heavy analysis results are costlier to lose.", "Periodic sweeps vs reacting to allocation pressure: sweeps are predictable, but may lag a sudden spike."],
    p: ["Evicting results that an in-progress query needs makes it recompute repeatedly, lengthening its latency.", "A budget set below the working set causes continuous recomputation and high CPU."],
    v: "Open a large project, set a low memory budget, and confirm resident memory stays under it after a sweep, requests still return identical results, and latency rises only for files not recently used.",
    dep: ["memoization", "memory-accounting", "syntax-trees"]
  },
  "symbol-index": {
    s: "A compact, searchable table of every declaration's name, kind and location across the workspace and libraries, used by workspace symbols, import suggestions and candidate lookup.",
    d: "For each file, the indexer extracts declared names from the item tree and stores name, kind, container and range. Names are placed in a structure that supports fast prefix and fuzzy search across millions of entries, often a finite-state structure merged from per-file pieces. Updates replace one file's contribution. The hard parts are keeping it consistent with edits, since stale entries mislead, and sizing it for libraries, which dominate the count.",
    k: ["Per-file shards merged at query time vs one global structure: shards update cheaply on edit, but queries must search many pieces.", "Indexing syntax only vs resolved information: syntax-only is fast and available early, but cannot support semantic queries without follow-up analysis."],
    p: ["Entries from a deleted or renamed file stay in the index and navigation leads to nowhere.", "Indexing library bodies that are never searched inflates memory for no benefit."],
    v: "Rename a file's declaration and confirm the old name is absent and the new one present within one second, and that an index rebuilt from scratch produces an identical set of entries.",
    dep: ["item-tree", "syntax-trees", "name-matching", "index-invalidation"]
  },
  "reference-index": {
    s: "A per-file record of which names each file mentions, used to cheaply shortlist the files worth analyzing when finding references or renaming.",
    d: "While parsing, the indexer records identifiers each file contains, usually as a set of names or a filter structure. Finding references for a symbol looks up its name to get candidate files, then runs semantic analysis only on those. It does not need to be exact, only to never miss a file: false positives are removed by analysis. It stays small and quick to maintain. Its weakness is common names, which match everything, and names produced by macros or generated code, which text does not reveal.",
    k: ["Probabilistic name filters vs exact sets: filters are small and fast, but admit false candidates that must be analyzed and discarded.", "Indexing all identifiers vs declared and used names: all is simple and complete, but larger than structured usage records."],
    p: ["Names introduced by macro expansion never appear in file text, so uses are missed by the prefilter.", "A very common name makes the shortlist the whole workspace and the query slow."],
    v: "Compare the reference index shortlist with a brute-force scan on a corpus for sampled names, and confirm it always contains every file that truly references the symbol, with a small share of extras.",
    dep: ["syntax-trees", "index-invalidation"]
  },
  "persistent-index": {
    s: "A copy of indexes and expensive summaries stored on disk, so a restarted server loads them instead of recomputing from source.",
    d: "At safe points the server writes index data for libraries, and sometimes the workspace, into a cache directory keyed by content hashes, versions and settings. On startup it validates entries against file fingerprints and loads those that match, then updates the rest in the background. The aim is that startup on a large project drops from minutes to seconds. It is hard because of validity: the cache must be invalidated by any change in source, toolchain, flags or the server's own format, and must survive crashes during writes.",
    k: ["Content-hash validation vs modification times: hashes are exact, but cost reading every file; times are fast, but fooled by checkouts and clock changes.", "Incremental writes vs a single snapshot at shutdown: incremental survives crashes, but costs write amplification; snapshot is simple, but lost if killed."],
    p: ["A cache written by an older server version with a different format loads as garbage and crashes the server.", "A half-written cache file after a crash is trusted and gives wrong results."],
    v: "Restart the server on a large project after a clean shutdown and confirm indexes load without reindexing within seconds; corrupt one cache file and confirm it is detected, discarded and rebuilt.",
    dep: ["symbol-index", "reference-index", "index-invalidation", "virtual-file-system"]
  },
  "index-invalidation": {
    s: "Decides which index entries and cached summaries are out of date after a change to a file, setting, dependency or toolchain, and schedules their rebuild.",
    d: "Each index entry carries the fingerprint of what produced it: file content hash, its configuration, dependency versions and indexer version. A change recomputes the fingerprints of affected inputs and marks entries whose fingerprint differs. The index serves old data until the rebuild finishes, or marks it unavailable if correctness demands. It is hard because dependencies are indirect: a library update, a flag change or a macro definition change affects files that did not change.",
    k: ["Eagerly rebuilding changed entries vs lazily on query: eager keeps queries fast, but spends CPU on entries never used; lazy saves work, but delays the first query.", "Serving stale entries while rebuilding vs blocking: serving is responsive, but may return outdated results the user trusts."],
    p: ["A flag change that does not alter any file text leaves the index describing the previous configuration.", "Fingerprints that omit the indexer's own version load incompatible entries after an upgrade."],
    v: "Change a build feature flag without touching source and confirm affected files are re-indexed, while unaffected ones are not, and results match a fresh index.",
    dep: ["input-revisions", "virtual-file-system", "module-graph"]
  },
  "background-indexing": {
    s: "Builds the workspace-wide indexes on low-priority threads after startup and after changes, reporting progress and yielding to interactive requests.",
    d: "Once the project loads, a pool walks files in priority order, with open files and their neighbors first, parses and summarizes each, and merges results into the indexes. Work is chunked so it can be cancelled and resumed, and throttled by available cores and battery or load signals. Features that need the index return partial answers with a status flag meanwhile. The challenge is not harming the user: indexing competes for cores and memory with the editor and other tools.",
    k: ["Index everything vs on demand per directory: everything gives instant global search, but costs startup CPU and memory; on demand is light, but misses unvisited code.", "Fixed thread count vs adaptive: fixed is predictable, but wrong on small or loaded machines; adaptive adjusts, but is hard to tune."],
    p: ["Indexing that starts before the project model finishes loading indexes with the wrong configuration and must restart.", "An uncapped thread pool pegs every core and makes the editor unresponsive during startup."],
    v: "Open a large project and confirm indexing runs at reduced priority, the progress indicator completes, completion latency stays within budget meanwhile, and workspace symbols return full results afterwards.",
    dep: ["symbol-index", "reference-index", "priority-lanes", "progress-reporting", "project-reload"]
  },
  "prebuilt-library-index": {
    s: "Index and summary data for the standard library and common dependencies, computed once per version and shared across projects, so those never need analyzing locally.",
    d: "Libraries change rarely and are large, so their symbol tables, item summaries and sometimes resolved signatures are computed once, keyed by name, version and configuration, and stored in a shared cache directory used by every project on the machine. A project's analysis then references the cache instead of reparsing library sources. Cache management needs care: versions multiply, entries must be keyed by features and platform, and a corrupted shared entry affects every project.",
    k: ["Shared machine-wide cache vs per-project cache: shared saves time and disk across projects, but needs locking and a corruption story.", "Summaries only vs full analysis results: summaries are compact and quick to load, but deeper queries still reanalyze library code."],
    p: ["Two server processes writing the same cache entry concurrently produce a corrupted file.", "Keying only by library version ignores feature flags, so a project gets another project's configuration."],
    v: "Open two projects that use the same library version and confirm the second builds no new library index, and that results for both are identical to ones from analysis of the library sources.",
    dep: ["persistent-index", "toolchain-and-library-sources", "symbol-index"]
  },
  "name-matching": {
    s: "Scores how well a typed query matches a candidate name, supporting prefixes, substrings, initials of words and case hints, so global search is forgiving yet precise.",
    d: "A matcher takes the query and a candidate and returns a score or no match. Common rules: match characters in order, favor word-boundary and camel-case hits, prefer consecutive runs, and handle case smartly, treating uppercase in the query as a case-sensitive request. It runs against millions of candidates per keystroke, so it is preselected by index structure and the scoring itself is branch-light. The hard part is ranking taste: users judge matches by what they expected, which no formula captures fully.",
    k: ["Simple subsequence scoring vs edit-distance matching: subsequence is fast and predictable, but cannot forgive typos; edit distance finds typos, but costs more per candidate.", "Case-insensitive by default vs smart case: smart case lets users narrow quickly, but surprises those who type capitals casually."],
    p: ["Ranking purely by match quality ignores the project's own names, pushing library items above the ones the user wants.", "Unicode case folding differences make some names unmatchable by any query."],
    v: "Query initials of a camel-case class name and a mid-word substring, and confirm the expected symbol is in the top three, with total time under 30 ms over a million-name table.",
    dep: []
  },
  "crash-isolation": {
    s: "Keeps a failure in one request, one analysis or one helper from taking down the server, by catching it at a boundary and reporting an error for only that unit of work.",
    d: "Each request handler runs inside a guard that turns a panic or fatal error into an error response, and records the failure with its inputs. Risky components, such as macro expanders and build steps, run in separate processes. Analysis threads are written so one failing does not poison shared state. The server may also fall back to degraded behavior, like skipping a feature that crashes. It is hard because panics can leave locks held or memoized state half-written, so guards must restore invariants.",
    k: ["Catching failures per request vs crashing and restarting: catching preserves state and warm caches, but risks continuing with corrupted state; restarting is safe, but loses time.", "In-process guards vs process isolation: in-process is cheap, but cannot stop memory exhaustion or native crashes; isolation contains everything at the cost of messaging."],
    p: ["A panic during a memoized computation leaves a half-written entry that later queries read as valid.", "Swallowing every failure silently hides a bug that repeats on each request."],
    v: "Inject a failure into one feature handler and confirm that request returns an error, other requests keep succeeding, the failure is logged with a reproducer, and memory and results afterward match a clean run.",
    dep: ["json-rpc-dispatch", "out-of-process-helpers", "logging-and-tracing", "query-engine"]
  },
  "supervised-restart": {
    s: "A client-side or wrapper-side watchdog that restarts the server after an unrecoverable crash, with backoff and a limit, and resynchronizes all open documents on reconnect.",
    d: "The client observes the server's exit, and if unexpected, starts a new process, repeats initialization, resends open documents and settings, and resumes. The server comes back with warm persistent caches. Clients limit restarts in a time window to avoid loops, and tell the user what happened. The difficulty is state continuity: pending requests are lost, progress indicators must be cleared, and a crash that is triggered by a specific file will repeat unless the offending input is identified.",
    k: ["Automatic restart with a retry limit vs asking the user: automatic recovers quietly, but loops on deterministic crashes; asking is clear, but interrupts work.", "Resending all open documents vs relying on server persistence: resending is correct and simple, but costs time for many large buffers."],
    p: ["A deterministic crash on opening a file puts the client in a restart loop until the limit is reached.", "Pending requests from before the crash are never answered, leaving spinners in the editor."],
    v: "Kill the server process during use and confirm the client restarts it within seconds, reopens all documents with the right versions, features work again, and a repeated crash stops after the configured limit with a message.",
    dep: ["initialization", "document-synchronization", "persistent-index", "crash-isolation"]
  },
  "memory-accounting": {
    s: "Measures where the server's memory goes, by query kind, file and data structure, so that budgets, eviction decisions and leak reports rest on numbers.",
    d: "The server counts allocations by category using an instrumented allocator, size estimates attached to memoized values, or periodic sampling of the heap, and exposes totals through a status request or log. Eviction uses these counts to decide when to sweep and what to drop. Maintainers use the breakdown to find the dominating structure. Hard parts are overhead and accuracy: precise accounting slows allocation, estimates can be wrong, and shared structures are counted once but belong to many owners.",
    k: ["Allocator-level counting vs per-value size estimates: allocator counts are exact and automatic, but cannot attribute to queries; estimates attribute well, but are approximate.", "Always-on counters vs on-demand heap profiling: counters are cheap and continuous, but coarse; profiling is detailed, but disruptive."],
    p: ["Shared structures counted once under one owner hide their true cost in the breakdown.", "Counting only live results misses memory fragmentation, so the process footprint exceeds the budget."],
    v: "Request the memory breakdown on a large project and confirm the category totals add to within five percent of the process's resident size, with syntax trees and type results shown separately.",
    dep: ["memoization", "metrics-and-telemetry"]
  },
  "logging-and-tracing": {
    s: "Structured logs and timed spans describing what the server is doing, with levels adjustable at runtime, so users can attach a useful trace to a bug report.",
    d: "Logs go to a file or to the client's output channel, never to the protocol stream. Spans mark each request and major query with start, duration and parent, so a slow request can be decomposed into its queries. Levels and filters are set per component through settings. A dedicated mode can write the entire message exchange to disk for replay. The hard parts are volume and privacy: verbose logs slow the server, and traces contain source text and paths.",
    k: ["Always-on low-level logs vs opt-in verbose tracing: always-on is there when a bug occurs, but costs speed and disk; opt-in is cheap, but misses the first occurrence.", "Logging payloads vs only metadata: payloads make reports reproducible, but expose private source code."],
    p: ["Logging each message payload at normal level fills disks and leaks confidential code into shared reports.", "Logs written to standard output corrupt the protocol channel."],
    v: "Enable tracing, issue one slow request, and confirm the log shows a span tree whose durations sum to the request time and name the queries that dominated, while the protocol stream stays clean.",
    dep: ["json-rpc-dispatch", "settings-and-configuration"]
  },
  "metrics-and-telemetry": {
    s: "Counters and timing histograms of request latency, cache hit rates, memory and crashes, collected locally and, only if the user opts in, reported to maintainers.",
    d: "The server records latency percentiles per feature, recomputation counts per query kind, index status and failure counts. They are shown in a status view and may be exported if the user agrees. Maintainers use them to detect regressions that tests miss, such as a feature slow only on a particular layout. The difficulty is ethics and utility together: collection needs explicit consent and must exclude source text, and aggregated numbers still have to be specific enough to act on.",
    k: ["Local-only metrics vs opt-in upload: local-only is private and simple, but maintainers never see field behavior; upload shows reality, but requires consent, scrubbing and infrastructure.", "Percentile histograms vs averages: histograms expose tail latency that users feel, but take more space and care."],
    p: ["Reporting file paths or identifiers in telemetry leaks private project details.", "Averaged latency hides a slow tail, so a feature that is awful for one in twenty requests looks healthy."],
    v: "Run a session of mixed requests and confirm the local metrics show per-feature p50 and p99 matching the trace, and that with telemetry off no outbound traffic is produced.",
    dep: ["logging-and-tracing", "query-engine", "request-scheduler"]
  },
  "status-reporting": {
    s: "Tells the user what state the server is in, such as loading, indexing, ready or degraded, and why a feature is unavailable, through status messages and indicators.",
    d: "The server publishes a health value, with a short message and optional detail, through a protocol extension, a progress indicator or a status bar item. States cover project loading, failed build queries, missing toolchain, partial indexes and crashes recovered. It also answers on demand about which project each file belongs to. The importance is trust: when a feature returns nothing because analysis is incomplete, the user needs to know that, or they will assume the code has no matches.",
    k: ["Explicit status states vs silent best effort: explicit states explain gaps, but need UI space and discipline to keep accurate.", "Warnings as notifications vs a persistent indicator: notifications are seen, but annoy when repeated; indicators are quiet, but easy to overlook."],
    p: ["Reporting ready while the index is still filling makes empty search results look authoritative.", "A health state that never clears after recovery leaves a permanent warning users learn to ignore."],
    v: "Open a project with a broken manifest and confirm the status shows degraded with the failing command's message; fix it and confirm the status returns to ready without a restart.",
    dep: ["progress-reporting", "build-system-integration", "background-indexing"]
  },
  "profiling-hooks": {
    s: "Built-in ways to capture a CPU or allocation profile of the running server, or to time specific requests, so slow cases can be investigated without a special build.",
    d: "A command or setting starts a sampling profiler or span recorder for a bounded duration and writes the result for offline viewing. Per-request timing can be dumped when a request exceeds a threshold, with the queries it ran. Maintainers use these on the user's machine with the user's code, as many performance problems reproduce nowhere else. The hard part is low overhead when idle and safety when on: profiling must not change timing enough to hide the problem or write too much data.",
    k: ["Sampling profiling vs instrumented spans: sampling shows hot code with little overhead, but misses short events; spans show exact queries, but need manual placement.", "Automatic slow-request dumps vs manual capture: automatic catches rare events, but writes files users did not expect."],
    p: ["Profile output containing source text is attached to a public report without review.", "Always-on instrumentation slows hot paths by enough to change the behavior being measured."],
    v: "Start a ten-second profile during a known slow request and confirm the output attributes the majority of time to the expected query, while idle overhead measured with hooks disabled is under one percent.",
    dep: ["logging-and-tracing", "query-engine"]
  },
  "out-of-process-helpers": {
    s: "Separate processes for work that is slow, untrusted or crash-prone, such as running build steps, procedural macros or the real compiler, communicating over pipes with a simple protocol.",
    d: "The server starts a helper, sends it requests, such as expand this macro, and reads responses. Helpers can be restarted if they die, killed on timeout, and limited in memory and permissions. The server treats their output as untrusted data, validating it before use. Spawning and messaging cost time, so helpers are long-lived. The difficulties are lifecycle management, mismatched versions between the server and the helper's toolchain, and the risk of a hung helper blocking a request.",
    k: ["Long-lived helper vs one process per job: long-lived amortizes startup and shares caches, but accumulates state; per job is clean, but pays startup each time.", "Binary protocol vs text over pipes: binary is faster for big payloads, but harder to debug and version."],
    p: ["A helper that hangs without a timeout blocks every request that waits for its answer.", "Helper output used unchecked injects invalid trees into analysis and crashes the server."],
    v: "Kill the helper mid-request and confirm the request returns an error, the helper restarts on the next use, and the server's memory and responsiveness are unaffected; send an oversized response and confirm it is rejected.",
    dep: ["transport", "message-framing", "trust-boundaries"]
  },
  "recorded-session-replay": {
    s: "Captures the exact sequence of messages in a real editing session and plays it back against the server, checking responses and detecting crashes, drift or slowdowns.",
    d: "A recording mode writes every message with timestamps. A replay tool starts the server, feeds the messages in order, and compares responses against expected ones or checks invariants such as no crash, no unexpected errors and bounded latency. Recordings of bug reports become regression tests. Large-scale replay of many sessions after a change finds problems that hand-written tests do not. The difficulty is determinism: timing, background work and file system state vary, so replays need controlled clocks and fixtures.",
    k: ["Comparing to golden responses vs checking invariants: golden is exact, but breaks on every legitimate improvement; invariants are robust, but catch fewer subtle regressions.", "Replaying with original timing vs as fast as possible: original timing reproduces races, but is slow; fast replay is efficient, but hides timing bugs."],
    p: ["Recordings that include private source code cannot be shared or checked in without scrubbing.", "Nondeterministic background indexing makes replay results vary and trains people to ignore failures."],
    v: "Record a ten-minute session, replay it on the same build twice, and confirm identical responses ignoring timestamps; replay on a build with an injected bug and confirm the difference is reported at the first divergent message.",
    dep: ["json-rpc-dispatch", "logging-and-tracing", "document-synchronization"]
  },
  "conformance-tests": {
    s: "Tests that drive the server through the protocol as a real client would, checking handshake, capability use, message shapes and error behavior against the protocol specification.",
    d: "A test client speaks the wire protocol to the server process, running scenarios: initialize with various capability sets, open and edit documents, send each request type, cancel mid-flight, and shut down. It validates responses against the protocol's schemas and checks required behaviors such as exactly one response per request. It catches framing, versioning and ordering errors that feature-level tests cannot see. Maintaining it means tracking the specification and the quirks of real clients, which differ.",
    k: ["Schema validation of all messages vs spot checks: validation catches shape errors everywhere, but fails on legitimate extensions unless allowed for.", "Testing against a simulated client vs real editors: simulated is fast and deterministic, but misses real client quirks; real editors are authoritative, but slow and flaky."],
    p: ["A server tested only with one client's behavior fails with another client's differently ordered startup.", "Tests that ignore error responses pass while the server returns errors for valid requests."],
    v: "Run the scenario suite against the server with schema validation enabled and confirm every message validates, every request receives exactly one response, and a server that skips a response fails the suite.",
    dep: ["json-rpc-dispatch", "initialization", "capability-negotiation", "cancellation"]
  },
  "marked-up-fixtures": {
    s: "Test source files annotated inline with the expected result at specific positions, such as the expected type or completion list, so one file tests many cases clearly.",
    d: "A fixture contains source with markers for cursor positions and comments stating expectations: this hover is this type, this reference list is these locations, this error appears here with this text. A harness parses the markers, builds a project from one or several fixture files, runs the feature and compares. Because the input and expectation sit side by side, fixtures are easy to write, review and extend, and bug reports translate directly into them. The hard part is keeping the markup language small enough to learn.",
    k: ["Inline markers vs separate expectation files: inline keeps the case readable in one place, but pollutes the source and can change positions.", "Exact expectation matching vs containment checks: exact catches regressions, but is brittle when unrelated results change; containment is stable, but misses extras."],
    p: ["Markers that shift positions are inserted into the text being tested, giving offsets that differ from real usage.", "Large expectation lists get regenerated wholesale without review, so regressions get baked in."],
    v: "Add a fixture with a deliberately wrong expected type and confirm the harness fails and prints the actual type with the fixture line number; correct it and confirm it passes.",
    dep: ["hover", "completion", "diagnostics", "go-to-definition"]
  },
  "snapshot-tests": {
    s: "Tests that store the full output of an analysis, such as a syntax tree dump or inference results, as a reviewed file and fail when the output changes.",
    d: "The harness runs a component over an input and renders its output as stable text: trees, resolved names, types per expression, expansion results. The first run writes the file; later runs compare and show a diff, and a command accepts intended changes. They cover internal stages that have no protocol surface. The risk is review fatigue: large snapshots change for good reasons, and reviewers stop reading them, so output should be compact, deterministic and free of incidental detail.",
    k: ["Whole-output snapshots vs targeted assertions: snapshots cover everything with little code, but changes are noisy; targeted assertions are focused, but miss unexpected differences.", "Auto-accepting updates vs manual review: auto is fast, but turns the tests into a record of whatever the code does."],
    p: ["Snapshots containing unstable ordering or ids fail randomly and are then regenerated without thought.", "A huge snapshot hides the one meaningful line that changed in the diff."],
    v: "Change the parser's recovery rule for one construct and confirm only the snapshots for inputs with that construct differ, each showing the changed tree nodes in the diff.",
    dep: ["syntax-trees", "error-tolerant-parsing", "type-inference", "name-resolution"]
  },
  "parser-fuzzing": {
    s: "Feeds the lexer and parser large volumes of random, mutated and truncated input to find crashes, hangs and invariants broken by malformed code.",
    d: "A fuzzer generates inputs by mutating real files, truncating at every position, deleting random tokens, or building from grammar fragments. Each run checks properties: no panic, termination in bounded time, token text reconstructs the input exactly, and incremental reparse equals a full reparse. Failing inputs are minimized and added to the regression corpus. It is valuable since users type invalid code constantly, and the parser must be total, so rare input shapes are the typical cause of crashes in production.",
    k: ["Mutation of real code vs grammar-based generation: mutation finds realistic breakage cheaply, but explores narrowly; generation explores widely, but produces unrealistic code.", "Checking only for crashes vs checking round-trip properties: crash checks are simple, but properties find silent corruption such as dropped tokens."],
    p: ["A recovery loop that consumes no input hangs on one specific truncation and is found by users first.", "Fuzzing without time limits reports hangs as passes when the run is killed."],
    v: "Truncate every file in the corpus at every byte offset, parse each, and confirm zero panics, a bounded parse time, and exact reproduction of the original text from the tree for every prefix.",
    dep: ["lexer", "error-tolerant-parsing", "incremental-parsing", "syntax-trees"]
  },
  "latency-benchmarks": {
    s: "Automated measurements of request times and memory on realistic large projects, run on every change to catch slowdowns before users do.",
    d: "A benchmark loads a fixed large project, then performs scripted actions, such as typing in a file, requesting completion, and finding references, and records time and memory. Results are compared against a baseline with noise thresholds, and a regression fails the check or opens a report. Inputs include both synthetic and real code. They matter because performance regressions arrive as many small changes and are never visible in unit tests. The difficulty is noise: shared machines and caches make single measurements unreliable, so runs are repeated and compared statistically.",
    k: ["Wall-clock time vs instruction counts: wall-clock matches user experience, but is noisy; counts are stable, but miss waiting and cache effects.", "Synthetic projects vs real ones: synthetic is controllable and shareable, but unrepresentative; real is truthful, but harder to distribute."],
    p: ["Running benchmarks on a loaded shared machine produces random failures that teach people to ignore them.", "Benchmarks on warm caches miss the cold-start path that users hit after every restart."],
    v: "Introduce a deliberate ten percent slowdown in completion and confirm the benchmark flags it with a statistically significant difference, while two unchanged runs differ by less than the threshold.",
    dep: ["recorded-session-replay", "metrics-and-telemetry", "memory-accounting"]
  },
  "latency-budgets": {
    s: "A decision about how long each kind of response may take, such as tens of milliseconds for completion, which fixes what work each layer is allowed to do.",
    d: "Interactive requests have limits users feel: completion and hover within about a hundred milliseconds, edits applied within one frame, diagnostics within a second or two of a pause. Budgets are allocated downward: a feature gets a time slice, queries get shares of it, and anything that cannot fit is moved to the background, cached or returned partially. They determine scheduling lanes, the granularity of queries, and which analysis is allowed on the hot path. They are only real when measured on large projects.",
    k: ["Strict budgets with degraded answers vs completeness: strict budgets keep the editor responsive, but sometimes give incomplete answers; completeness is correct, but can freeze typing.", "Budgets per feature vs one global target: per feature reflects different user expectations, but needs separate measurement and ownership."],
    p: ["A budget that is never measured on large inputs is met only on the small ones the team develops on.", "A feature quietly grows past its budget over many releases because each increase was small."],
    v: "Replay a recorded session on a large project and confirm that the p95 latency of each interactive feature is within its stated budget, and that exceeding one fails the benchmark.",
    dep: ["request-scheduler", "priority-lanes", "partial-results", "latency-benchmarks", "debounce-and-throttle"]
  },
  "memory-limits": {
    s: "A decision about how much memory analysis may hold, typically a few times the source size, which dictates what is cached, what is evicted and what is recomputed.",
    d: "Source code, syntax trees, resolved names, types and indexes together can outgrow the editor's own memory by many times for a large workspace. A limit is chosen, or detected from the machine, and every layer is designed to work within it: trees compacted, bodies analyzed lazily, library data shared or loaded from disk, and results evictable. The limit sets the speed of the common case against the cost of recomputation. Memory also has to be bounded per request, since one query must not exhaust it.",
    k: ["A fixed budget vs a fraction of available memory: fixed is predictable and testable, but wastes big machines or pressures small ones; adaptive fits, but varies behavior.", "Evict-and-recompute vs refuse the work: eviction keeps features available at some latency cost, but refusal protects the machine."],
    p: ["Memory growth appears only after hours of editing, so tests that start fresh never see it.", "A limit enforced only at sweeps allows one huge request to exceed it between sweeps."],
    v: "Run an eight-hour scripted edit session on a large project and confirm resident memory stays under the configured limit with no upward trend, and that results remain identical to a fresh server.",
    dep: ["memory-eviction", "memory-accounting", "interning", "syntax-trees"]
  },
  "error-tolerance": {
    s: "A decision to treat wrong, incomplete code as the normal input: every stage must produce partial results and avoid cascades rather than stop at the first problem.",
    d: "In an editor, code is invalid most of the time it is being changed. Parsing recovers and keeps structure, resolution returns unresolved markers, inference uses unknown types, and diagnostics suppress consequences of earlier errors. Features are written to work on partial information, such as completion in a function with unresolved calls. The contrast with a batch compiler is that stopping at the first error is acceptable there. Error tolerance has to be designed into data structures from the start, since adding it afterward touches everything.",
    k: ["Total functions with error values vs failing early: error values keep every feature available on broken code, but every consumer must handle them; failing early is simpler, but disables features exactly when they are needed.", "Suppressing secondary errors vs reporting all: suppression keeps feedback useful, but may hide a real second problem."],
    p: ["One stage that aborts on error turns a single typo into the loss of every downstream feature.", "Unknown values treated as real ones produce confident but wrong hover and completion results."],
    v: "Take a corpus of real files, truncate and corrupt each in many ways, and confirm every feature returns a sensible answer near the damage without panic and without an error flood.",
    dep: ["error-tolerant-parsing", "name-resolution", "type-inference", "diagnostics"]
  },
  "snapshot-consistency": {
    s: "A decision that every answer describes one consistent version of all files and settings, never a mixture of old and new, even while edits keep arriving.",
    d: "Requests run against a snapshot taken at one revision of all inputs. If an edit arrives, work on the old snapshot is cancelled rather than finished against mixed state, and ranges returned to the client refer to a known document version. The consequence is that reads are parallel and writes are serialized, and the client must be ready to retry cancelled requests. It governs the file system layer, the query engine and the response rules. The cost is wasted work at every cancellation.",
    k: ["Cancel on change vs let readers finish on the old version: cancelling gives fresh results and cheap writes, but wastes work; finishing is complete, but returns outdated answers.", "Strict consistency vs best effort: strict gives trustworthy edits such as rename, but requires cancellation everywhere; best effort is simpler, but can produce a broken edit."],
    p: ["A response that combines types from one revision and ranges from another points to wrong text.", "A code path that does not read from the database cannot be cancelled and breaks the guarantee by finishing late."],
    v: "Fire an edit in the middle of a rename computation and confirm the rename is cancelled or completes entirely against the pre-edit text with its version stated, never as a mixture.",
    dep: ["snapshots", "input-revisions", "cancellation", "stale-request-handling"]
  },
  "laziness-versus-precomputation": {
    s: "A decision about how much to compute ahead of requests: on-demand analysis starts quickly and uses less memory, while precomputed indexes answer global queries instantly.",
    d: "On-demand analysis computes only what the cursor needs, so startup is fast and memory small, but any whole-workspace question is slow. Precomputation moves cost to startup or to disk caches, giving instant global answers at the price of CPU, memory and invalidation complexity. Real servers blend: lazy per-function analysis, an eager lightweight index, and disk caches for libraries. The mix determines startup time, idle CPU use, answer completeness during warmup and how much invalidation logic is needed.",
    k: ["Lazy computation vs eager index: lazy is light and always fresh, but global features are slow; eager is fast to query, but costs resources and risks staleness.", "Warming caches at startup vs on first use: startup warming makes the first request fast, but delays readiness and wastes work if unused."],
    p: ["An eager design hits a monorepo's size and burns minutes of CPU before any feature works.", "A lazy design makes the first find-references on a large project take so long users cancel it."],
    v: "Measure time to first completion, time to complete workspace symbols and idle CPU after warmup on a small and a large project, and confirm each lies within the design's stated targets.",
    dep: ["query-engine", "background-indexing", "persistent-index", "memoization"]
  },
  "trust-boundaries": {
    s: "A decision about which code the server executes and how far it is trusted, since opening a project can run build scripts, macros and tools supplied by that project.",
    d: "A language server reads untrusted source and may run code from it: build steps, procedural macros, compiler plugins and configured external tools. The boundaries decide what runs automatically, what needs a one-time user approval, and what is sandboxed with limited files, network and time. Output of helpers is validated. Editors commonly add a workspace trust prompt that gates this execution. Choices affect safety and convenience: more automation gives better analysis at once, but means opening a malicious folder can run arbitrary code.",
    k: ["Run project code automatically vs require approval: automatic gives full analysis immediately, but exposes users to hostile repositories; approval is safer, but degrades features until granted.", "Sandboxed helpers vs trusting the user's machine: sandboxing limits damage, but is complex and platform-specific, and some builds break inside it."],
    p: ["Running generation steps from a downloaded repository on open executes unreviewed code with the user's permissions.", "Treating a helper's output as trusted lets a crafted result crash or confuse the server."],
    v: "Open an untrusted folder with a build step that writes a marker file, confirm that the step does not run before approval, and confirm after approval it runs inside the limits set for it.",
    dep: ["out-of-process-helpers", "build-script-output", "macro-expansion", "settings-and-configuration"]
  },
});
