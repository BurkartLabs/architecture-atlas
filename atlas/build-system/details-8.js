// Details for the build system plate, part 8: test execution and caches.
ATLAS.details("build-system", {
  "test-runner": {
    s: "Runs test targets as actions: launches each test binary in a prepared environment, enforces its timeout, collects exit status and logs, and records a pass or fail result.",
    d: "A test target is an executable plus data files. The runner stages them in a test working directory, sets environment variables telling the program where to write results and temporary files, runs it, and interprets the exit code. Results flow into the event stream with logs and structured reports. Several tests run in parallel under resource limits. It is hard because tests are the least hermetic code in most repositories: they use the network, clocks, shared ports and temporary files, and each such habit turns into flakiness at scale.",
    k: ["Tests as ordinary cacheable actions vs a separate runner outside the graph: caching, remote execution and dependency tracking come free, but test programs must meet action rules.", "One process per test target vs per test case: simple and isolated, but granular reporting needs a protocol between runner and framework."],
    p: ["A test that writes into the source directory passes once and corrupts later runs.", "A test reading the current time passes in the morning and fails after midnight."],
    v: "Run one passing and one failing test target. Confirm results with per-target logs and exit status are in the event stream, and a rerun of the passing one with unchanged inputs is reported as cached.",
    dep: ["actions", "test-environment", "build-event-stream"]
  },
  "test-environment": {
    s: "The directories, variables and resources a test is given: a private temporary directory, an output location for reports, a data directory and controlled external access.",
    d: "Before running a test, the runner creates a clean scratch directory, sets variables for it, for the report path, for shard information and for random seeds, and arranges data dependencies at known relative paths. Network, ports and devices may be blocked, or allocated uniquely. Environment cleanup follows the run. It is hard because the contract has to be stable across local, sandboxed and remote runs, and because tests assuming fixed ports or home directories collide when run in parallel.",
    k: ["A private scratch directory per test vs a shared one: no interference and easy cleanup, but disk churn for large fixtures.", "Blocking network by default vs allowing it: hermetic and deterministic tests, but integration tests need explicit exemptions and tags."],
    p: ["Two tests bind the same fixed port and fail only when scheduled together.", "A test reads its home directory's config and behaves differently per developer."],
    v: "Run the same test in parallel ten times. Each instance should receive a distinct scratch directory and none should fail from collisions; list the environment from inside one and confirm only expected variables appear.",
    dep: ["environment-control", "sandboxing"]
  },
  "test-sharding": {
    s: "Splits one slow test target into several parts that run in parallel, each executing a different subset of its cases, and merges the results.",
    d: "The runner sets variables telling each instance its shard index and the total shard count, and the test framework selects its cases by index. All shards run as separate actions, possibly on different machines, and the engine combines their statuses and reports. Sharding cuts wall-clock time for suites that dominate the critical path. It is hard because the split must be deterministic and balanced, with each case in exactly one shard, and because a shard assignment that depends on case count changes when cases are added.",
    k: ["Static hash-based shard assignment vs dynamic work queue: simple and deterministic, but uneven when case durations vary; a queue balances load but needs coordination.", "More shards vs fewer: lower latency, but each shard repeats fixed startup costs and uses more machines."],
    p: ["One shard receives the three slowest cases and sets the finish time, so adding shards does not help.", "A test framework that ignores the shard variables runs every case in every shard."],
    v: "Run a target with four shards and verify the union of executed case names equals the full suite with no duplicates, and that wall time is well below the single-run time.",
    dep: ["test-runner", "parallel-scheduler", "test-environment"]
  },
  "test-timeouts-and-sizes": {
    s: "Declared size classes and timeouts that bound how long and how heavy a test may be, with the runner killing tests that exceed them.",
    d: "Each test carries a size such as small, medium or large, or an explicit timeout, which sets its default limit and sometimes its resource request. When the limit passes, the runner kills the process tree and reports a timeout with the partial log. Sizes feed scheduling decisions and let teams enforce that fast tests stay fast. It is hard because a timeout set too tight causes flakes on loaded machines and one set too loose lets hangs hold a worker for an hour.",
    k: ["Size classes with defaults vs per-test numbers: easy conventions and uniform enforcement, but coarse; explicit numbers fit exactly but drift.", "Wall-clock timeouts vs CPU-time limits: simple and catches hangs, but a loaded machine causes false timeouts."],
    p: ["A timeout calibrated on a fast desktop fires constantly on shared CI workers.", "A test marked small grows over time into a ten-minute integration run, and nobody notices."],
    v: "Run a test with an infinite loop and a five-second limit. It should be killed in about five seconds with status timeout and a captured partial log, and the worker should be free afterward.",
    dep: ["test-runner", "resource-aware-scheduling"]
  },
  "flaky-test-handling": {
    s: "Detects tests that pass and fail on the same inputs, retries them under policy, quarantines the worst, and reports flakiness as data.",
    d: "A flaky test is one whose result is not a function of its inputs. The runner can rerun failures a bounded number of times and mark a pass after failure as flaky rather than green. Records of outcomes by action key reveal tests with mixed results on identical keys. Policies then retry, quarantine or alert owners. It is hard because retries hide real intermittent bugs, quarantine becomes a graveyard, and the root causes, such as races, time, ordering or shared state, are different each time.",
    k: ["Automatic retries vs failing immediately: fewer false alarms, but they mask real races and encourage ignoring flakiness.", "Quarantining flaky tests vs keeping them blocking: protects the main branch, but quarantined tests stop protecting anything unless someone owns them."],
    p: ["Retrying a test three times turns a one-in-ten failure into a one-in-a-thousand one that nobody can reproduce.", "A quarantine list grows monotonically because fixing the test has no deadline."],
    v: "Run a deliberately racy test fifty times with identical inputs and confirm the flakiness report shows mixed outcomes under one action key, with the pass-after-retry marked flaky, not passed.",
    dep: ["test-runner", "test-result-caching", "build-event-stream"]
  },
  "test-result-caching": {
    s: "Stores a passing test's result under its action key so an unchanged test is not run again, and re-reports the stored pass.",
    d: "A test is an action whose key covers the test binary, its data, its configuration and declared environment, so a rerun with unchanged inputs is a cache hit. Only successes are normally cached; failures rerun. Tests that depend on outside state are marked to opt out of caching and always run. It is hard because caching assumes determinism: a test that reads the network or clock returns a stale pass, and the cache faithfully hides a regression the outside world introduced.",
    k: ["Caching passes only vs also caching failures: failures rerun to confirm they are real, but a persistent failure costs full time every run.", "Opt-out tag for external tests vs caching everything: tests on live services stay honest, but the tag must be applied by authors who know."],
    p: ["A test calling a live service is cached as passing for weeks while the service is broken.", "A test reading an undeclared file is cached, and edits to the file never rerun it."],
    v: "Run a test, then run it again unchanged: the second should report cached without executing. Change one data file declared by the test and confirm it reruns. A test tagged external must always execute.",
    dep: ["action-key", "local-action-cache", "test-runner"]
  },
  "coverage-collection": {
    s: "Instruments tests to record which code ran, collects the per-test data and merges it into a coverage report across targets.",
    d: "Coverage is a variant configuration that adds instrumentation to compile actions and tells the runner to gather coverage files from each test's environment. The engine merges them after the run, possibly after sharding, into a combined report by source file. Because instrumented outputs differ from ordinary ones, they use their own cache entries. It is hard because it multiplies build and run time, because merging must map paths from sandboxes and remote workers back to the repository, and because generated and external code needs excluding.",
    k: ["Separate instrumented configuration vs always instrumenting: normal builds stay fast, but coverage runs rebuild everything.", "Per-test coverage vs aggregated only: pinpoints which tests cover which code and enables selection, but data volume is large."],
    p: ["Coverage paths from sandboxes do not match source paths, so the report shows zero for correctly tested files.", "Instrumented binaries are cached together with normal ones and a regression slips in under the wrong key."],
    v: "Run a test target with coverage on, then open the merged report and confirm that a function the test calls is covered and one it never calls is not, with paths pointing at repository files.",
    dep: ["test-runner", "debug-release-variants", "output-collection"]
  },
  "local-action-cache": {
    s: "A persistent record, on one machine, mapping each action key to the outputs it last produced, so unchanged actions are skipped on later builds.",
    d: "After an action runs, the engine stores its key and its output digests in a database in the output base. On the next build, if the key is the same and outputs on disk still match, the action is a hit and nothing runs. If the action's outputs are missing, they can be restored from the disk cache. The record also holds depfile data and discovered inputs. It is hard because it must survive crashes without corruption, be consistent with the actual files, and avoid growing without bound as keys change.",
    k: ["Recording state in a database vs inferring from file timestamps: exact and portable, but another store whose integrity matters.", "Single writer per workspace vs concurrent writers: simple consistency, but parallel builds of one workspace must queue."],
    p: ["A crash during writing leaves records pointing at partly written outputs.", "Deleting the output tree but not the database causes false hits that skip needed actions."],
    v: "Build, delete one output file, and rebuild. The action should rerun or restore it. Delete the whole database and rebuild: all actions should rerun and the outputs should be identical.",
    dep: ["action-key", "output-directory", "digest-cache"]
  },
  "cache-key": {
    s: "The identifier under which results are stored and looked up: for an action cache, the action key; for stored blobs, the content digest.",
    d: "Two layers of keys exist. The action key identifies a computation (command, inputs, platform), and a content digest identifies bytes. The action cache maps action keys to a result record naming output digests, and the blob store maps digests to bytes. Because the key is a hash of a canonical description, the same computation always finds the same entry across machines. It is hard because key stability determines every cache hit: instability from paths, times or environment shows only as misses, and a collision or an unhashed input shows as wrong output.",
    k: ["Keys derived purely from content and description vs including a cache version or machine name: sharing across everyone, but a poisoned entry affects all.", "Salting keys with a version number: lets a team invalidate everything after a tool bug, but a bump discards the whole cache."],
    p: ["A key missing the compiler version serves objects built by the old compiler after an upgrade.", "A key including an absolute path means each checkout location caches separately."],
    v: "Compute the key for the same action on two machines in different directories. They must be equal. Change the compiler digest and confirm the key differs.",
    dep: ["action-key", "content-addressable-store"]
  },
  "action-result": {
    s: "The stored outcome of an action: exit code, digests of output files and directories, and references to captured standard output and error.",
    d: "An action result is a small record that lets a cache hit reconstruct everything the original run produced. It lists each output path with its digest and mode, directory outputs as tree digests, the exit code, and the digests of the log blobs. It may also record execution metadata such as worker, queue time and duration. Results with a nonzero exit code can be stored separately or not at all. It is hard because the record must be portable across machines, and incomplete records lead to cache hits that cannot be reconstituted.",
    k: ["Storing only digests vs the bytes inline: tiny records that dedupe well, but each hit needs fetches of the referenced blobs.", "Caching failed results vs not: avoids rerunning known failures, but failures from environment problems stick."],
    p: ["A result references a blob that was evicted, so a hit turns into an error until the action reruns.", "Metadata such as duration included in the compared record makes identical runs look different."],
    v: "Fetch an action result by key and confirm every listed output digest exists in the blob store; reconstruct the outputs from it and compare them with the original files.",
    dep: ["content-addressable-store", "output-collection", "cache-key"]
  },
  "local-disk-cache": {
    s: "A content-addressed directory on one machine holding action results and output blobs, shared across workspaces and consulted before the network.",
    d: "On a miss in the local action record, the engine checks the disk cache by action key; on a hit it copies or links outputs from it. After running an action it can write results and blobs into it. Several workspaces on one machine share the cache, so switching branches or checkouts finds old results. A size limit with eviction keeps it bounded. It is hard because concurrent builds read and write it at the same time, and because eviction must not delete blobs that a live result still names.",
    k: ["A shared disk cache across workspaces vs per-workspace: more reuse, but one corrupt entry or runaway size affects everything.", "Linking cached files into outputs vs copying: fast and space efficient, but later modification of an output corrupts the cache entry."],
    p: ["A build that edits an output in place mutates the hard-linked cache entry for every future hit.", "No size limit lets the cache fill the disk until builds fail with unrelated errors."],
    v: "Build in one checkout, then in a second checkout of the same revision with an empty output tree. The second build should take nearly no compile time, served entirely from the disk cache.",
    dep: ["local-action-cache", "content-addressable-store", "cache-eviction"]
  },
  "remote-cache-protocol": {
    s: "The network protocol by which clients look up action results by key and upload or download blobs by digest from a shared cache service.",
    d: "A standard set of calls covers: get an action result for a key, update an action result, check which blobs are missing, upload blobs and download blobs, often in batches and streamed for large files. Clients check the cache before running an action and upload results after. Compression and range reads reduce transfer. It is hard because latency and bandwidth dominate: a cache lookup per action over a slow link can cost more than running a short action, so batching, parallelism and skipping lookups for trivial actions matter.",
    k: ["A cache lookup before every action vs local-first heuristics: maximum reuse, but each lookup adds latency for cheap actions.", "A standard open protocol vs a custom one: many client and server implementations interoperate, but features outside the standard are limited."],
    p: ["Thousands of tiny serial lookups on a slow link make a fully cached build slower than a local one.", "A client without timeouts hangs the whole build on a stalled connection."],
    v: "Build with the remote cache enabled and observe the request log: one lookup per action and uploads for misses. Rebuild from clean and confirm downloads match, with no action executed.",
    dep: ["cache-key", "action-result", "content-addressable-store", "digest-cache"]
  },
  "remote-cache-service": {
    s: "The server side of the shared cache: stores results and blobs, serves lookups at high concurrency, enforces access control and evicts old data.",
    d: "The service holds an action-result index and a blob store, usually on fast storage with a larger slower tier behind it. It authenticates clients, separates read and write permissions, and tracks last-access times for eviction. Deployments may sit near the build machines, use proxies at offices, and layer caches. It is hard because load is bursty, with a full CI wave arriving at once, and because the service is a shared trust boundary: writes from any client become inputs to every other.",
    k: ["A central cache vs regional replicas: simple and consistent, but remote offices see high latency; replicas fix latency but delay freshness.", "Separate read-only and write credentials vs one: limits who can poison the cache, but clients need two modes."],
    p: ["A cache sized for the average load collapses when a toolchain bump makes every client miss at once.", "A developer's laptop with write access uploads a bad output that every machine then downloads."],
    v: "Send concurrent lookups and uploads at the service's expected peak and confirm latency stays within target. Attempt an upload with read-only credentials and confirm it is rejected.",
    dep: ["remote-cache-protocol", "content-addressable-store", "cache-eviction", "cache-upload-policy"]
  },
  "cache-upload-policy": {
    s: "Rules for who may write results to a shared cache and which results are eligible, so a bad or untrusted build cannot contaminate everyone else.",
    d: "Typically only CI with known, hermetic configuration uploads results, while developers only read. Uploads can also be limited to actions that passed reproducibility checks, to successful results, and to those not marked untrusted, such as actions that ran unsandboxed or with network access. Some setups sign results or partition caches by trust level. It is hard because tight policy lowers hit rates for developers' own work, while loose policy lets one misconfigured machine poison a global cache with outputs that look legitimate.",
    k: ["Only CI writes vs everyone writes: protects integrity, but local work is never shared and developers wait for CI to warm the cache.", "Uploading everything vs only trusted action kinds: maximum sharing, but actions with hidden inputs spread wrong results."],
    p: ["A developer builds with a modified compiler and uploads results keyed as if from the standard one.", "Results from unsandboxed actions are uploaded, and the hidden dependency they carry reaches everyone."],
    v: "Build from a developer account and confirm no uploads occur. Build from CI and confirm uploads occur only for actions that ran sandboxed, and that an unsandboxed action's result is excluded.",
    dep: ["remote-cache-service", "sandboxing", "hermeticity"]
  },
  "output-elision": {
    s: "Avoids downloading intermediate outputs from the remote cache or workers unless something actually needs the bytes, passing around digests instead.",
    d: "When an action result comes from a remote source, the engine records output digests and defers fetching the files. A downstream remote action can use the digests directly, since the bytes are already in remote storage. Only final outputs, tests that must run locally, or files a user asks for are downloaded. This slashes network traffic for large graphs of intermediate files. It is hard because outputs vanish from disk, so local tools, debuggers and later local actions find nothing, and eviction of a remote blob can break a build already underway.",
    k: ["Downloading only on demand vs always: far less bandwidth and faster builds, but intermediate files are absent locally.", "Pinning referenced blobs during a build vs trusting retention: safer builds, but pins add protocol work and storage pressure."],
    p: ["A blob evicted between result lookup and use turns a cached build into a hard failure partway through.", "A developer expects intermediate object files on disk and finds none."],
    v: "Build with elision on, then list the output tree: only requested final outputs should be present. Ask for one intermediate and confirm it is then downloaded with the expected digest.",
    dep: ["remote-cache-protocol", "action-result", "content-addressable-store"]
  },
  "cache-eviction": {
    s: "Policy that removes old or large entries from a cache when it exceeds its size limit, ideally without breaking results that still refer to them.",
    d: "Caches track last access time and size per entry, and when the total passes a limit, remove the least recently used first. Action results refer to blobs, and blobs can be shared among results, so eviction must keep those consistent: either results are evicted with their blobs or blobs are refreshed whenever a result is touched. It is hard because a dangling result is a hit that fails, because hot toolchain blobs must not age out merely because lookups of the result are infrequent, and because cold data is still expensive to rebuild.",
    k: ["Least recently used vs cost-aware eviction: simple and predictable, but a cheap hot entry can push out one that took an hour to build.", "Refreshing blobs on result access vs relying on blob timestamps: keeps results complete, but each lookup becomes a write."],
    p: ["A result survives while its blob is evicted, so a hit turns into a failed download.", "Eviction runs at peak load and slows every client."],
    v: "Fill a cache past its limit and confirm the oldest entries disappear while a result touched recently still has all its blobs. A fetch of a surviving result must succeed completely.",
    dep: ["content-addressable-store", "action-result"]
  }
});
