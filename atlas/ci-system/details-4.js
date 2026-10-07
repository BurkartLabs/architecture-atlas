// Details for the continuous integration plate, part 4: capacity, caching and artifacts, logs and test reporting.
ATLAS.details("ci-system", {
  "queue-depth-autoscaler": {
    s: "Adds and removes runner capacity in response to the number and age of waiting jobs, so developers rarely wait and idle machines are shut down quickly.",
    d: "A controller reads queue metrics per pool: waiting jobs, their requirements, oldest age and running count. It computes a target number of machines, requests creation through the provider, and removes idle ones after a cooldown. Because machines take time to start, it scales ahead of observed demand using recent trends and schedules, such as working hours. It is hard because the signals are late and bursty: a push to a monorepo creates hundreds of jobs at once, and scaling up costs a minute while scaling down too eagerly causes thrashing.",
    k: ["Reactive scaling on queue depth versus predictive scaling on schedule and history: reactive is simple and always late; predictive hides startup delay and wastes money when it guesses wrong.", "Aggressive scale-down versus long idle cooldown: aggressive saves cost and forces frequent cold starts; long cooldown keeps caches warm and pays for idle time."],
    p: ["Scaling on queue depth alone ignores jobs that cannot run on any current machine type, so the fleet grows without helping.", "A provider quota or capacity error leaves the autoscaler retrying while the queue grows unnoticed."],
    v: "Submit one hundred jobs to an idle pool and measure time to first job start, machines created and time until all are removed after the queue drains, comparing against the stated targets.",
    dep: ["job-queue", "warm-pools", "ephemeral-runner-lifecycle"]
  },
  "warm-pools": {
    s: "A reserve of pre-created idle machines or runners, ready to take jobs immediately, trading some idle cost for much lower start-up latency.",
    d: "The pool keeps a configured number of booted runners with images already pulled and agents registered, or stopped machines that resume quickly. When a job arrives it is assigned to a warm runner and the pool starts a replacement. Pool size follows demand patterns. Virtual machine and large-image workloads benefit most, as boot and pull can exceed the job itself. The tradeoffs are cost and staleness: warm machines hold older image versions and fill with idle spend overnight.",
    k: ["Fixed warm pool versus demand-driven size: fixed is simple and wasteful off-hours; demand-driven follows usage and can be empty exactly when a burst arrives.", "Stopped machines versus running idle machines: stopped are cheap and slower to resume; running are instant and cost full price."],
    p: ["A warm pool holding an old image keeps serving jobs with a toolchain the team believes was replaced.", "Warm runners registered with a credential that expires leave a pool full of machines that cannot take a job."],
    v: "Drain the pool to its target, submit a job and measure the time to start, then submit a burst larger than the pool and confirm the overflow starts at the cold start time while replacements appear.",
    dep: ["vm-executor", "runner-image-management"]
  },
  "preemptible-capacity": {
    s: "Uses discounted machines that the provider can reclaim with little notice, relying on retry and checkpoints so interrupted jobs are not reported as failures.",
    d: "Surplus capacity can cost a fraction of normal prices but may be revoked at any time with a short warning. The runner watches for the notice, tells the control plane the job was interrupted, and the scheduler requeues it as an infrastructure failure without charging the retry budget. Short jobs absorb interruption well. Long jobs lose their work unless they checkpoint. The difficulty is separating interruption from real failure and not letting heavy preemption increase total cost and latency beyond the discount.",
    k: ["Preemptible for all jobs versus only short, restartable ones: all jobs saves the most and risks long jobs never finishing; restricting protects them and gives up part of the discount.", "Fall back to regular capacity after repeated interruption versus keep retrying: fallback guarantees completion and costs more; retrying is cheap and can starve."],
    p: ["An interrupted job counted as a code failure sends authors to debug a nonexistent bug.", "A burst of reclaims empties a pool in a region at once and queues everything."],
    v: "Simulate a reclamation notice during a job and confirm the job is requeued with an interruption reason, does not consume its retry budget, and completes on another machine.",
    dep: ["retry-policy", "queue-depth-autoscaler"]
  },
  "capacity-quotas": {
    s: "Limits on how much runner time or concurrency each team, project or pool may use, preventing one tenant from consuming the whole fleet or the whole budget.",
    d: "Quotas are expressed as concurrent jobs, minutes per period or spend per period, at project, group or organization level. The scheduler consults them when assigning jobs, and usage meters accumulate from finished jobs. Breaches either queue the work, reject it or alert. They tie technical limits to budgets and make costs visible to the teams causing them. They are hard to set fairly: a flat limit punishes the large teams, an unlimited one lets a runaway loop spend a month's budget overnight.",
    k: ["Hard limits versus soft limits with alerts: hard limits stop runaway usage and block legitimate bursts; soft limits keep work flowing and rely on someone reading the alert.", "Per-team quota versus global fair share: quotas give predictable budgets and strand unused capacity; fair share uses everything and removes planning certainty."],
    p: ["A pipeline that triggers itself in a loop spends the month's quota in an hour before anyone is alerted.", "A quota exhausted in the middle of a release blocks the very work that cannot wait."],
    v: "Set a small concurrency quota on a project, submit more jobs than the quota, and confirm the excess waits with a visible reason while another project's jobs proceed unaffected.",
    dep: ["job-queue", "cost-attribution"]
  },
  "cost-attribution": {
    s: "Measures compute time, storage and network used by each pipeline and job, and attributes the bill to the teams that cause it.",
    d: "Every job records machine type, duration and queue time. Storage systems report artifact and cache bytes per project, and egress is attributed by traffic. These roll up into reports by team, repository and job. The numbers drive decisions: which test suite costs most per merge, which matrix is oversized. It is hard to be fair with shared costs, such as idle warm pools and cache storage, and because cost per job depends on how machines were packed, which no single job controls.",
    k: ["Charge by job duration versus by reserved machine time: duration is easy to explain and ignores idle capacity; reserved time is accurate and penalizes teams for the platform's inefficiency.", "Showback reports versus chargeback to budgets: showback informs without friction and often changes nothing; chargeback changes behavior and creates disputes."],
    p: ["Ignoring storage costs hides that retained artifacts exceed compute spend.", "Allocating idle pool cost by usage share makes small teams subsidize a few heavy ones."],
    v: "Run a known job of one hour on a known machine type and confirm the report charges that team about one hour of that type, with queue time shown separately.",
    dep: ["metadata-database", "trend-analytics"]
  },
  "fleet-health-and-drain": {
    s: "Detects runners that are failing, stale or unhealthy and removes them from service, draining running jobs before shutdown and for upgrades.",
    d: "Health checks look at heartbeat, disk space, time skew, recent failure rate and results of a canary job. A runner showing problems is marked draining: it finishes its current job and takes no more, then is replaced. Upgrades roll through the fleet the same way, a few at a time. A bad host shows up as many unrelated failures with the same machine in common, so the control plane tracks failures by runner. The hard part is not making things worse: draining too many at once collapses capacity.",
    k: ["Automatic quarantine versus operator decision: automatic removes bad hosts quickly and can remove healthy ones on a spurious signal; manual review is safer and slower.", "Rolling upgrade in small batches versus replace the fleet at once: batches keep capacity and take long; replacing at once is fast and risks a total outage."],
    p: ["A runner with a full disk fails every job it takes, quickly, and so is assigned more jobs than any healthy one.", "A drain that waits indefinitely for a stuck job never completes the upgrade."],
    v: "Fill one runner's disk and confirm it is flagged, drains after its current job, is replaced, and that failure rate for jobs on that pool returns to normal.",
    dep: ["runner-agent", "queue-depth-autoscaler"]
  },
  "dependency-cache": {
    s: "Stores downloaded libraries and tool packages between runs, restoring them at job start so builds do not fetch the same files every time.",
    d: "A job declares paths and a key. At the start the runner looks for an entry with that key, or a fallback prefix, and extracts it; at the end it uploads a new entry if none existed. Entries live in object storage or on the runner's local disk. It cuts minutes of network time and shields builds from registry outages. Its difficulty is correctness and size: the archive can contain stale or poisoned files, large entries cost more to restore than to download again, and many keys fill storage.",
    k: ["Remote shared cache versus local disk on the runner: remote is available everywhere and costs transfer time; local is fastest and only helps when the same runner is reused.", "Cache the package download directory versus the installed result: downloads are safe and still pay installation; installed trees are fast and can embed stale or platform-specific state."],
    p: ["Restoring a cache created by another operating system or tool version breaks the build with errors that vanish on a clean run.", "A restore larger than the download it replaces makes the job slower."],
    v: "Run a build twice with no dependency changes and confirm the second restores from cache and shows near-zero network fetch time, then change a dependency and confirm it misses and rebuilds the entry.",
    dep: ["cache-key-design", "object-store"]
  },
  "cache-key-design": {
    s: "The rule that names a cache entry from the inputs it depends on, such as lock file hash, tool version and platform, so entries are reused exactly when valid.",
    d: "A key is built from content hashes and identifiers: the hash of a lock file, the compiler version, the operating system. A hit means every input matches; a miss triggers a rebuild and a new entry. Restore keys allow falling back to the nearest older entry, which is then refreshed. Good keys make caching invisible; bad ones make it a source of mysterious failures. The difficulty is capturing every input that matters while keeping hits frequent: too narrow a key never hits, too broad a key serves wrong content.",
    k: ["Exact-hash keys versus prefix fallback restores: exact keys guarantee validity and miss on every change; fallback restores most of the work and may restore stale content.", "Include tool and platform in the key versus share across them: including them avoids incompatible reuse and splits the cache; sharing saves space and breaks."],
    p: ["A key based on the branch name makes every branch start cold and fill storage.", "A key that omits the tool version restores outputs built by a different compiler."],
    v: "Change only a comment in source and confirm the key is unchanged and hits; change the lock file and confirm a miss; change the compiler version and confirm a miss rather than a restore of old outputs.",
    dep: ["dependency-cache"]
  },
  "cache-scoping-and-trust": {
    s: "Rules on which runs may read and write which cache entries, so an untrusted change cannot plant content that a trusted pipeline later restores.",
    d: "Cache entries are namespaced by trust tier and branch. Runs from forks and feature branches can read entries written by the default branch and write only to their own namespace; protected branches never read entries from untrusted writers. The cache is a persistence channel across jobs and so a classic route for supply-chain attacks. It is hard because separating namespaces lowers hit rates, and some cache content, such as executable build tools, is as dangerous as source code.",
    k: ["Write only from trusted branches versus anyone writes: trusted-only writes keep the cache clean and make feature branches slower; anyone-writes gives fast builds and lets an attacker poison the cache.", "Read-through from default branch to branches versus isolated caches: read-through gives branches warm starts and needs write isolation; isolation is safe and cold."],
    p: ["A pull request that writes the shared cache can change the compiler binary later used by a release build.", "Cache keys that ignore the trust tier let a fork's entry satisfy a protected job's key."],
    v: "From an untrusted run write a modified file into a cache with the key a release job uses, then run the release job and confirm it does not restore that entry.",
    dep: ["trust-tiers", "dependency-cache"]
  },
  "build-layer-cache": {
    s: "Reuses unchanged steps of image and package builds by caching each intermediate layer by content, so only steps after a change are redone.",
    d: "An image build is a list of steps, each producing a layer identified by its inputs and the previous layer. If all inputs match, the layer is reused. In CI, where each job starts on a fresh machine, the cache must be exported to a registry or storage and imported next time. Ordering matters: put rarely changing steps first. It is hard because layers include whatever the step touched, including timestamps and downloaded files, so nominally identical rebuilds can differ and defeat reuse.",
    k: ["Registry-backed layer cache versus local only: registry-backed cache survives ephemeral runners and costs push and pull time; local is instant and only works on persistent hosts.", "Cache all intermediate layers versus final image only: all layers maximize reuse and bloat storage; final only is small and recompiles more."],
    p: ["A step that copies the entire source tree early invalidates every later layer on any change.", "Cached layers hold an old security patch level because the install step never reran."],
    v: "Rebuild an image after changing only the final application files and confirm earlier layers report as cached, with total time reduced, and that changing the dependency list rebuilds from that step on.",
    dep: ["container-executor", "object-store"]
  },
  "remote-build-cache": {
    s: "A shared store of build action outputs keyed by their inputs, so any machine that needs the same compile or test result downloads it instead of recomputing.",
    d: "A build tool computes a digest for each action from its command, environment and the digests of its input files. It asks the cache whether an output exists, downloads it on a hit, or runs the action and uploads the result. With remote execution, the actions themselves run on a cluster. It works only if actions are hermetic: any hidden input yields poisoned entries. Writes are typically restricted to CI on trusted branches while developers read, and the service must be near the runners to beat recomputation.",
    k: ["Cache plus local execution versus remote execution cluster: caching is easy to add and still builds on the runner; remote execution scales far and requires full hermeticity and a service.", "Allow developer writes versus CI-only writes: developer writes increase hits and risk contamination from unclean environments; CI-only writes are trusted and slightly colder."],
    p: ["An action reading a file outside its declared inputs stores results valid only on one machine.", "A cache far from the runners makes downloading outputs slower than rebuilding."],
    v: "Build the same revision on two machines and confirm the second reports nearly all actions as remote cache hits, with matching output digests, and a deliberately impure action is flagged.",
    dep: ["object-store", "cache-scoping-and-trust", "reproducibility-and-hermeticity"]
  },
  "workspace-handoff": {
    s: "Passes files from one job to later jobs in the same run, such as compiled output, so each stage need not rebuild what an earlier stage produced.",
    d: "Because jobs may run on different machines, a job uploads selected paths to storage and dependent jobs download them before starting. It is scoped to the run, expires quickly and is selected by explicit dependency. The pattern splits a pipeline into build, test and package stages without duplicating compilation. It is easy to overuse: transferring a gigabyte between stages can cost more time than recompiling, and unclear dependencies lead to jobs picking up outputs from the wrong job.",
    k: ["Pass files through storage versus run everything in one job: passing allows parallel test jobs on different machines and adds transfer time; one job has no transfer and no parallelism.", "Pass by explicit dependency list versus everything from previous stages: explicit is precise and verbose; implicit is convenient and pulls unnecessary bytes."],
    p: ["A downstream job receiving outputs from a retried upstream job can read the earlier failed attempt's files.", "Passing a very large workspace between jobs makes the pipeline slower than building twice."],
    v: "Run build then three parallel test jobs and confirm each test job receives exactly the build outputs it depends on, with the transfer time shown separately in the job log.",
    dep: ["artifact-upload", "stages-and-dependency-graph"]
  },
  "artifact-upload": {
    s: "Stores files produced by a job, such as binaries, reports and screenshots, in durable storage linked to the run, for download, later stages or publishing.",
    d: "The job declares paths and patterns; the runner compresses and uploads them, often in parallel chunks, to object storage and registers metadata with the control plane: name, size, digest and expiry. They are downloadable from the interface and API and can be referenced by other jobs. Large uploads are slow and can fail midway, so uploads must be resumable and verified by digest. Artifacts can also contain secrets or personal data from the build, so access control and scanning matter.",
    k: ["Upload from the runner directly to object storage versus through the control plane: direct scales and requires signed URLs; proxying is simpler and makes the control plane a bottleneck.", "Upload on failure as well as success: keeping failure artifacts such as screenshots greatly speeds diagnosis and uses more storage."],
    p: ["A glob that matches nothing uploads nothing and the job still passes, so the artifact is missing when needed.", "Artifacts of public projects readable by anyone can expose configuration files the build bundled by accident."],
    v: "Run a job that produces a 500 MB output with a known checksum, interrupt the upload once, and confirm the stored artifact has the same checksum and is downloadable by an authorized user.",
    dep: ["object-store", "metadata-database", "access-control"]
  },
  "artifact-retention": {
    s: "Policies for how long artifacts and caches are kept, by type and branch, with exceptions for releases, balancing storage cost against the need to investigate old runs.",
    d: "Each artifact gets an expiry from its job or default policy: days for test output, longer for builds, indefinite for marked releases. A background process deletes expired objects and their metadata, and quotas evict the oldest when a limit is hit. The latest successful artifact of each branch can be exempt. It must stay consistent: deleting the object but not the record, or the reverse, produces broken links, and a deletion bug destroys evidence or a release that people still need.",
    k: ["Short default expiry with opt-in keep versus long default: short bounds cost and deletes things someone later wants; long is safe and storage grows without limit.", "Delete by age versus by quota and usage: age is predictable; quota-based eviction protects the budget and can remove recent items first when a project is noisy."],
    p: ["Release binaries stored as ordinary artifacts expire and the deployment cannot be rebuilt identically.", "Retention measured from creation rather than last download removes an artifact that is still in daily use."],
    v: "Create artifacts with a one-day expiry and one marked keep, advance the retention clock and confirm the first is removed from storage and metadata together while the kept one remains.",
    dep: ["retention-and-garbage-collection", "artifact-upload"]
  },
  "release-publishing": {
    s: "Moves a verified build output out of CI to its consumers: package registries, image registries, download sites, with versioning, signing and immutability.",
    d: "A release job takes the artifact from the tested run, assigns a version, signs it, and pushes it to a registry or storage with credentials issued only to this job. It records the revision and run so the release is traceable, and may create a release page with notes. Publishing is the irreversible step of a pipeline, so it runs only from protected references, never rebuilds what was tested, and treats versions as immutable. The hard part is partial failure: a package pushed to one registry and not another leaves an inconsistent release.",
    k: ["Publish the tested artifact versus rebuild at release: publishing exactly what was tested guarantees what shipped was verified; rebuilding is simpler to orchestrate and can differ.", "Immutable versions versus overwritable tags: immutability protects consumers and requires a new version for any fix; overwriting is convenient and breaks reproducibility."],
    p: ["A retry after partial failure republishes an already pushed version and is rejected, or silently overwrites it.", "Publishing credentials available to the test stage let any test job release a package."],
    v: "Run a release from a tag, verify the published package's digest equals the tested artifact's, confirm the signature checks, and that attempting to publish the same version again fails.",
    dep: ["build-provenance", "protected-environments", "artifact-upload"]
  },
  "log-streaming": {
    s: "Carries job output from the runner to viewers while the job is still running, in order and with low delay, so people can watch and diagnose without waiting for completion.",
    d: "The runner buffers output in small chunks with offsets and sends them to the control plane, which appends them to temporary storage and pushes updates to open viewers. Chunks carry sequence numbers so retries and reconnects neither lose nor repeat text. It handles terminal control characters, timestamps and collapsible sections. It is hard because jobs can print megabytes per second, viewers may reconnect at any point, and the runner may die before its last chunk is sent, so the tail of the log, usually the cause of the failure, is the most at risk.",
    k: ["Small frequent chunks versus larger batched uploads: small chunks feel live and load the control plane; batches are efficient and lag.", "Append-only with offsets versus resend whole log: offsets make retries cheap and need careful server logic; resending is simple and wasteful for long jobs."],
    p: ["A runner killed before flushing loses the final lines that explain the failure.", "A job printing a progress bar with carriage returns produces megabytes of nearly identical lines."],
    v: "Run a job that prints a numbered line every second, kill the connection for ten seconds mid-run, and confirm the viewer shows every number once in order after reconnect, including the final lines.",
    dep: ["job-polling-protocol", "control-plane-api"]
  },
  "log-storage": {
    s: "Keeps finished job logs durably and cheaply, compressed and addressed by job, with size limits and retention, and serves them back for viewing and search.",
    d: "When a job ends, the temporary chunks are assembled, compressed and written to object storage under the job's id, and the temporary copy is removed. Logs are served by range so a large file can be paged. A size cap truncates runaway output with a clear marker. They are the largest data the system stores by volume, so retention is usually shorter than for metadata. Hard parts include masked content having to be settled before storage, and access control matching the project.",
    k: ["Store compressed objects per job versus in a log database: objects are cheap and simple and weak at search; a database or search index supports queries and costs far more.", "Hard size cap with truncation versus unlimited: caps protect storage and cut off the evidence; unlimited keeps everything and invites abuse."],
    p: ["A cap that truncates the beginning instead of the end hides the start of the problem or the final error.", "Logs deleted by retention before an incident review is finished remove the only evidence."],
    v: "Finish a job that prints 200 MB, confirm the stored log is compressed, truncated with a visible marker at the cap, retrievable by range, and removed on schedule with its metadata.",
    dep: ["object-store", "log-masking", "retention-and-garbage-collection"]
  },
  "test-result-ingestion": {
    s: "Collects structured test reports from jobs, parses them into per-test results with names, status, time and failure messages, and stores them for views and analysis.",
    d: "Jobs upload report files in a common format, typically XML or JSON, listing every test case. A parser turns them into records keyed by suite and test name, linked to the run, revision and job, and tolerates malformed or huge files. The data feeds failure summaries on the review page, history per test and flaky detection. Its difficulty is identity: a stable test name across runs, parameterized tests, retries of the same test within a run, and tools producing slightly different fields.",
    k: ["Parse standard report formats versus integrate each test tool: standard formats work with any tool and lose detail; native integration is rich and needs one adapter per tool.", "Store every test case result versus only failures: every result enables rates and trends and costs storage; failures only are cheap and lack the denominator."],
    p: ["A report written to a path the job never uploads yields a green job with zero tests recorded.", "Test names containing run-specific values, like timestamps, create a new test every run and defeat history."],
    v: "Upload a report with 1,000 cases including a failure, a skip and a retry, and confirm the stored counts match, the failure shows its message on the run page, and the history for that test name links to previous runs.",
    dep: ["object-store", "metadata-database"]
  },
  "test-sharding": {
    s: "Splits a large test suite into parts that run in parallel on separate machines, balanced by past timing so the slowest shard does not dominate wall-clock time.",
    d: "The system obtains historical duration per test, assigns tests to N shards so total time is balanced, and starts one job per shard, each running its subset. When timing is unknown it falls back to splitting by file or name. After the run the new timings feed the next split. It cuts a long suite to minutes. It is hard because tests may not be independent, new tests have no history, and a single huge test sets a floor: more shards then add cost without reducing time.",
    k: ["Static split by name versus dynamic work-stealing from a shared queue: static is simple and unbalanced when durations vary; dynamic balances well and requires a coordinating service.", "Split by test versus by file or package: finer splits balance better and expose shared-state bugs; coarse splits are safer and lumpy."],
    p: ["Tests that depend on order or shared fixtures pass in one big run and fail when separated.", "A shard that gets no timing history for new tests takes ten times longer than the others."],
    v: "Run a suite at 1, 4 and 8 shards and confirm every test runs exactly once overall, wall-clock time falls, and the slowest shard is within about 20 percent of the mean.",
    dep: ["matrix-expansion", "test-result-ingestion", "dynamic-pipeline-generation"]
  },
  "coverage-collection": {
    s: "Gathers code coverage data from test jobs, merges it across shards and runs, and reports the percentage and the lines changed by a patch that remain untested.",
    d: "Instrumented tests write raw coverage files. A collector uploads and merges them across shards into one report, maps paths to repository files, and computes overall and per-change figures. The review page shows coverage for the lines touched by the change, which is more actionable than the total. Thresholds may gate merges. It is hard because merging is only valid for the same revision and instrumentation, and it is easy to game: coverage proves code was executed, not that behavior was checked.",
    k: ["Gate merges on a total threshold versus on changed lines: totals are simple and let a large codebase absorb untested changes; patch coverage targets the change and penalizes small edits near untested code.", "Instrument every run versus a dedicated coverage job: always is complete and slows tests; dedicated keeps main runs fast and lags."],
    p: ["Merging reports from different revisions of the same file shows covered lines that no longer exist.", "A hard threshold leads to tests written only to execute lines."],
    v: "Run sharded tests on a change that adds ten lines with six exercised, and confirm the merged report shows 60 percent patch coverage with the four missed lines highlighted on the right files.",
    dep: ["test-sharding", "check-annotations", "object-store"]
  },
  "failure-grouping": {
    s: "Clusters failures from many jobs and runs by cause, using normalized error text and stack, so one underlying problem is seen once instead of in hundreds of failed jobs.",
    d: "When jobs fail, the system extracts a signature from the first error or failing assertion, stripping paths, addresses, timestamps and numbers, and groups matching signatures across runs. A group shows first and last occurrence, affected branches and count, and can be assigned or linked to an issue. It turns a red dashboard into a short list of causes. The hard part is the signature: too specific and a single bug splits into hundreds of groups, too general and different bugs merge and hide.",
    k: ["Group by normalized error message versus by failing test name: messages find shared causes across tests; test names are stable and miss a common infrastructure error.", "Automatic clustering versus manual rules: automatic scales and is sometimes wrong; manual rules are accurate and need constant care."],
    p: ["A generic timeout message merges unrelated failures into one giant group nobody investigates.", "A group not linked to an owner stays on the dashboard for months."],
    v: "Cause the same assertion failure in ten jobs on three branches and one different failure in two, and confirm exactly two groups appear with correct counts, first-seen revision and affected branches.",
    dep: ["test-result-ingestion", "log-storage"]
  },
  "flaky-test-detection": {
    s: "Finds tests that pass and fail on the same code by looking at results across retries and reruns on one revision and across runs without relevant changes.",
    d: "A test is flaky when its outcome differs for the same revision. The detector flags tests that failed then passed on retry in one run, or that fail intermittently on the default branch where code has not changed. It computes a flake rate over a window and ranks tests by cost: reruns, blocked merges and wasted minutes. Output goes to owners as work, and to quarantine. Real flakiness is hard to separate from genuine order-dependent bugs and from infrastructure faults affecting many tests at once.",
    k: ["Detect via automatic reruns versus statistics over history: reruns give immediate certainty and cost compute; history is free and needs enough runs and takes time.", "Rank by flake rate versus by impact: rate finds the worst tests, while impact, such as blocked merges, finds the ones that cost the most."],
    p: ["A test that fails only when a particular machine is overloaded is blamed on its author rather than on the pool.", "A passing retry hides a real race that later reaches production."],
    v: "Seed a test that fails one time in five, run it fifty times on one revision, and confirm it is flagged with an estimated rate near twenty percent and linked to its failing runs.",
    dep: ["test-result-ingestion", "retry-policy"]
  },
  "quarantine-and-reruns": {
    s: "Handles known flaky tests by running them without blocking merges, or rerunning only the failed ones, while tracking them until fixed, so the signal of the rest stays trustworthy.",
    d: "Quarantined tests still run and report but do not fail the job. Owners are notified, a time limit applies, and a test that stays quarantined is escalated or deleted. Selective rerun repeats only failed tests rather than the whole suite and reports the result with a flaky marker. The mechanism must not become a dumping ground: without an owner and deadline, quarantine hides defects permanently and coverage of important behavior silently drops.",
    k: ["Quarantine automatically on detection versus by human decision: automatic keeps the pipeline green fast and can hide real regressions; human decision is deliberate and slow.", "Rerun only failed tests versus the whole job: selective rerun saves time and misses failures caused by interaction among tests; whole-job rerun is thorough and expensive."],
    p: ["A quarantined test covering a critical feature stays muted for a year, and a real regression goes unnoticed.", "Rerunning on the same machine reproduces the machine-specific failure and wrongly confirms the test as broken."],
    v: "Quarantine a failing test and confirm the job passes while the report still lists it as quarantined with an owner and expiry, and that it begins failing the build again when the expiry passes.",
    dep: ["flaky-test-detection", "merge-gates"]
  },
  "metadata-database": {
    s: "The durable relational store for projects, runs, jobs, states, runners, settings and results, and the system of record all other components read and write.",
    d: "Every pipeline, job and its history are rows with foreign keys and indexes by repository, branch and time. Scheduling queries, queue leases and state transitions run against it, so it must support transactions and high write rates, with job-state updates as the hot path. Old runs are archived or partitioned by time. The challenge is growth: billions of job rows, frequent small updates, and a queue that must be consistent with state, which together demand partitioning and careful indexing to avoid scans on the busiest tables.",
    k: ["Queue inside the database versus separate broker: in-database queues are transactional with state and limit throughput; a separate broker scales and risks inconsistency.", "Partition by time versus a single large table: partitioning makes retention and queries cheap and needs routing logic; a single table is simple and slows with age."],
    p: ["A missing index on a status column turns the scheduler's query into a full scan under load.", "Long transactions held by reports delay vacuum and bloat the hottest tables."],
    v: "Load the database with a year of synthetic runs and confirm the scheduler's ready-job query and the dashboard's list query each stay under their latency targets while a burst of state updates runs.",
    dep: ["high-availability-and-recovery"]
  },
  "object-store": {
    s: "Durable blob storage for logs, artifacts, caches and images, addressed by key and accessed directly by runners through short-lived signed URLs.",
    d: "Large objects are kept in a scalable store, with metadata in the database pointing to them. Runners upload and download with time-limited URLs so bytes bypass the control plane. Lifecycle rules expire data by prefix, and storage classes lower cost for old data. It is the cheapest, most durable layer and the main cost driver in practice. Pitfalls are many small objects, inconsistent listing after writes in some stores, egress charges, and access policies that accidentally make a prefix readable by anyone.",
    k: ["Direct signed-URL access versus proxy through the control plane: signed URLs scale and require careful expiry and scope; proxying is simple and carries all traffic.", "Content-addressed keys versus run-based paths: content addressing deduplicates and complicates deletion by owner; run paths are easy to expire and store duplicates."],
    p: ["A signed URL with a long expiry posted into a log works as a permanent download link.", "Millions of tiny cache and log objects make storage requests cost more than the bytes."],
    v: "Upload an object with a signed URL, confirm a second user's URL for another prefix fails, an expired URL is rejected, and the lifecycle rule removes the object on schedule.",
    dep: []
  },
  "event-bus": {
    s: "The internal stream of events such as run created, job started and job finished, that decouples the scheduler from reporting, notifications, analytics and integrations.",
    d: "State transitions publish events to a durable log or queue. Subscribers consume at their own pace: status reporting posts to the code host, notifications alert people, analytics aggregate, webhooks call out to customers. Each event carries a stable id and a version so consumers can deduplicate and handle ordering per run. It decouples components and failure domains. The difficulty is delivery guarantees: at-least-once delivery means every consumer must be idempotent, and a slow or stuck consumer must not block the others.",
    k: ["At-least-once with idempotent consumers versus exactly-once delivery: at-least-once is simple and robust and puts duplicate handling on every consumer; exactly-once is harder to build and still leaky at the edges.", "Transactional outbox versus publish after commit: the outbox never loses events and adds a relay; publish after commit is simple and loses events on a crash between steps."],
    p: ["A consumer that fails on one malformed event retries it forever and stops processing everything behind it.", "Events published before the database commit reach consumers that cannot yet read the new state."],
    v: "Finish a job and confirm exactly one status update, one notification and one analytics record result, then replay the event and confirm none of the consumers produce a duplicate effect.",
    dep: ["metadata-database"]
  },
  "control-plane-api": {
    s: "The service layer that exposes runs, jobs, runners and settings to the interface, runners and automation, enforcing authentication, authorization, rate limits and versioning.",
    d: "A set of stateless services behind a load balancer handle reads and writes from three audiences: people through the web interface, runners through the polling protocol, and scripts through the public API. They validate input, check permissions, update the metadata database and publish events. Because the same service handles huge numbers of tiny runner calls and heavy interface queries, traffic classes are separated and rate limited. The hard part is isolating them so a thundering herd of runners cannot make the interface unusable.",
    k: ["One API for all callers versus separate runner and user APIs: a single API is simpler to maintain and lets one class of traffic starve the other; separate APIs isolate load and duplicate logic.", "Stateless horizontally scaled services versus stateful schedulers: stateless services scale and defer correctness to the database; stateful ones are fast and need leader election."],
    p: ["After an outage every runner reconnects at once and overwhelms the service that is trying to recover.", "Unlimited page sizes on list endpoints let one dashboard query take down the database."],
    v: "Generate runner polling load at ten times normal while loading the interface and confirm interface latency stays within target and runner calls beyond the limit receive backoff responses rather than errors.",
    dep: ["metadata-database", "event-bus", "access-control"]
  },
  "access-control": {
    s: "The identities, roles and permission checks that decide who can see runs, change settings, read secrets, register runners and approve deployments.",
    d: "Users, groups and service accounts get roles on projects and organizations, evaluated on every request. Authentication comes from an identity provider with single sign-on, tokens or job-scoped credentials. Permissions are fine-grained: view logs, retry jobs, edit variables, manage runners. The model must align with the code host's repository permissions or the two diverge. It is hard because it has many callers and a high cost of mistakes: a missed check on one endpoint, such as artifact download or log search, leaks private data.",
    k: ["Inherit permissions from the code host versus own roles: inheriting stays consistent with repository access and depends on the host's model; own roles are flexible and drift.", "Central policy engine versus checks in each endpoint: central policy is consistent and auditable and adds latency and coupling; per-endpoint checks are fast and get forgotten."],
    p: ["A new endpoint shipped without its permission check exposes data until someone notices.", "A removed team member's personal tokens keep working after removal from the project."],
    v: "Revoke a user's access to a private repository and confirm they immediately lose run list, log, artifact and search results for it, and that their existing tokens are refused.",
    dep: []
  },
  "audit-log": {
    s: "An append-only record of security-relevant actions: logins, setting and secret changes, approvals, manual runs, runner registrations and permission changes, with who, what and when.",
    d: "Every sensitive action emits an audit record with actor, target, action, time, source address and result. Records are written to a store that ordinary operators cannot alter, and can be exported to a security system. Retention is long, as investigations may need months. It answers who changed this variable or approved this deploy. The challenge is completeness and integrity: events bypassed by internal paths are missing, and a log administrators can edit is not evidence.",
    k: ["Write synchronously with the action versus asynchronously: synchronous guarantees every action is recorded and slows it and can block on failure; asynchronous is fast and can lose records.", "Store in the same database versus separate append-only store: same database is simple and editable by the same admins; separate storage resists tampering and needs its own operations."],
    p: ["Actions taken through the internal service path are never logged, leaving a blind spot.", "Audit records without the acting identity of an automation token cannot say who really triggered a deploy."],
    v: "Change a protected variable, approve a deployment and register a runner, and confirm three records appear with the correct actors, times and targets, and that no interface or API can edit or delete them.",
    dep: ["metadata-database", "object-store"]
  },
  "retention-and-garbage-collection": {
    s: "Background jobs that delete expired runs, logs, artifacts, caches, runner images and orphaned objects, keeping storage and database size bounded.",
    d: "Retention rules set how long each class of data lives. Collectors scan for expired items, delete the object first and then the record, or mark and sweep, and reconcile mismatches between metadata and storage in both directions. They run slowly to avoid disturbing the live system. Without them, storage grows indefinitely and queries slow. They are risky: a bug that deletes too much cannot be undone, and one that deletes too little only shows as a bill.",
    k: ["Mark and sweep with a grace period versus immediate delete: a grace period lets mistakes be undone and holds storage longer; immediate deletion is cheap and irreversible.", "Reconcile storage against metadata regularly versus trust deletes: reconciliation finds orphans from crashes and costs scans; trusting deletes is cheap and leaks slowly."],
    p: ["A collector deleting objects still referenced by a running job breaks it halfway through.", "Orphaned objects with no metadata row are never found and accumulate for years."],
    v: "Create expired and unexpired items plus an orphaned object, run collection, and confirm only the expired items and the orphan are gone and counts in metadata and storage match afterward.",
    dep: ["metadata-database", "object-store"]
  },
  "high-availability-and-recovery": {
    s: "The redundancy, backup and failover design that keeps CI running through machine, zone and service failures and restores it after data loss.",
    d: "Control plane services run in several zones behind load balancers, the database has a standby with automatic failover, and storage is replicated. Backups of the database and configuration are tested by restoring them. Runners are disposable and recreated, but queued and running jobs must survive a failover: leases expire and jobs are requeued. Developers cannot merge when CI is down, so CI is effectively on the critical path of the business. The hard part is recovering state coherently, including jobs that finished during the outage.",
    k: ["Active-active across zones versus active-passive with failover: active-active has no failover gap and needs conflict-free design; active-passive is simple and loses seconds to minutes in the switch.", "Restore from backup versus rebuild from the code host: backups restore history and secrets and may be stale; rebuilding from repositories is clean and loses all run history."],
    p: ["A backup never test-restored turns out to be incomplete when needed.", "After failover the runners and database disagree about running jobs, so some run twice and some never finish."],
    v: "Fail the primary database during a busy period and confirm failover completes within target, no job is lost or duplicated, and a restore of last night's backup into a clean environment passes the same checks.",
    dep: ["metadata-database", "object-store"]
  },
  "untrusted-code-threat-model": {
    s: "The assumption that anyone who can propose a change can run code on your infrastructure, and the layered controls built on that assumption in every component.",
    d: "A CI system's purpose is to execute whatever the repository says, including code from forks, dependencies and build tools nobody on the team wrote. The threat model names what an attacker could try: stealing secrets, poisoning caches and artifacts, moving between jobs, abusing the runner's network, and changing the pipeline that checks them. Controls appear at every layer: trust tiers, sandboxes, scoped tokens, protected branches and signed provenance. Its difficulty is that every convenience feature, caching, shared runners and richer permissions, tends to weaken it.",
    k: ["Assume breach and limit blast radius versus prevent execution of untrusted code: limiting damage works with open contribution and needs many controls; preventing execution is simple and blocks the testing that CI exists for.", "Strong boundaries by default versus relaxed with opt-in: strong defaults protect everyone and make some builds harder; relaxed defaults are friendly and rely on each team to harden."],
    p: ["Reviewing application code carefully while letting anyone edit the pipeline file leaves the gate itself unprotected.", "A control that exists in documentation but is not enforced in the runner is assumed present by everyone."],
    v: "Run a deliberately hostile change that tries to read secrets, write a shared cache, reach internal hosts and edit its own required checks, and confirm every attempt is blocked and appears in logs.",
    dep: ["trust-tiers", "sandbox-boundary", "secret-scoping"]
  },
  "reproducibility-and-hermeticity": {
    s: "The property that building the same revision twice gives the same result, which depends on pinning inputs, isolating the environment and controlling time, network and randomness.",
    d: "A result is reproducible if its inputs are fully declared: source, dependencies, toolchain, environment variables and configuration. Hermetic builds forbid anything undeclared, such as network access, machine-specific paths and the current time. Reproducibility makes caching correct, lets failures be reproduced locally and allows independent verification of binaries. It is hard to achieve fully: tools embed timestamps and absolute paths, test suites depend on ordering and external services, and the runners themselves drift unless images are versioned.",
    k: ["Strict hermetic builds versus pragmatic builds with a network: hermetic builds are cacheable and verifiable and need all dependencies declared; pragmatic builds are easy to start and unreliable to cache.", "Verify by building twice and comparing versus assume: comparing finds sources of drift and costs compute; assuming is free and wrong without notice."],
    p: ["An embedded build timestamp makes two identical builds differ, so the cache never hits and verification fails.", "A test that reaches a live external service passes today and fails when that service changes."],
    v: "Build the same revision on two different machines on different days and compare the output digests; any difference points at an undeclared input to remove.",
    dep: ["dependency-pinning", "runner-image-management", "remote-build-cache"]
  },
  "latency-versus-cost": {
    s: "The standing trade between fast feedback for developers and a lower infrastructure bill, which sets idle capacity, parallelism, caching and how much each change must test.",
    d: "Developers lose time every minute they wait, and an engineer's hour usually costs more than a machine's. But parallelism, warm pools and large matrices multiply spend, and the fastest feedback is idle capacity paid for in advance. Decisions throughout depend on this: what runs on every push versus nightly, how many shards, how large the warm pool is, whether to use discounted capacity. It is a negotiation, not an optimum. The hard part is measuring it: both waiting and spending are easy to ignore until they are large.",
    k: ["Run more per change versus run less and catch it later: running more finds problems early and costs every commit; running less is cheap and moves breakage to nightly or production.", "Pay for idle capacity versus accept cold starts: idle capacity gives fast starts all day; cold starts are cheap and add delay to every first job."],
    p: ["Optimizing cost alone doubles queue time, and the lost developer hours exceed the saving.", "Optimizing speed alone with large matrices and warm pools produces a bill nobody planned for."],
    v: "Track median time from push to final status and cost per merged change together over a month, and confirm a deliberate change, such as halving the warm pool, moves both numbers in the expected direction.",
    dep: ["queue-depth-autoscaler", "test-sharding", "cost-attribution"]
  },
  "multi-tenancy": {
    s: "Many teams, and sometimes many customers, share the same system, so every layer must separate their data, permissions, capacity and failures.",
    d: "Isolation is needed in data and access control, in runner capacity and queues, in secrets and caches, and in the blast radius of a bad job or a bad pipeline template. Models range from a single shared system with logical separation to a separate installation per tenant. Shared systems use hardware well and require quotas, fairness and a hard line between tenants' runners. The pressure points are noisy neighbors, support access across tenants, and configuration shared across everyone, such as templates and images, where one change affects all.",
    k: ["Shared infrastructure with logical separation versus dedicated stacks per tenant: sharing is efficient and one bug can cross tenants; dedicated stacks isolate fully and multiply operations.", "Shared runner pools versus per-tenant pools: shared pools pack well and need strict cleanup and quotas; per-tenant pools isolate and strand capacity."],
    p: ["A cache or runner shared between tenants lets one team's job influence another's builds.", "A global template change breaks every tenant at the same moment."],
    v: "As tenant A, attempt to read tenant B's runs, logs, artifacts, cache entries and runners through the interface, the API and a job, and confirm every attempt is refused and recorded.",
    dep: ["access-control", "capacity-quotas", "trust-tiers"]
  },
  "failure-and-retry-semantics": {
    s: "How the system distinguishes a failed job, a failed platform and an interrupted run, and the rules for retrying, resuming or reporting each, so results are honest and work is not duplicated.",
    d: "A red result may mean the code is wrong, a test is flaky, a runner died, the network dropped or the provider reclaimed the machine. Each needs different handling: report, retry, requeue or page the platform team. Components need consistent answers: the runner reports exit status and cause, the scheduler records the failure class, notifications and statistics read it, and retry applies only where safe. Idempotency of jobs and of reporting underlies everything. The difficulty is that causes are often ambiguous, and wrongly blaming code or infrastructure erodes trust either way.",
    k: ["Classify failures precisely versus treat all as failures: classification enables safe automatic retry and honest statistics, and needs every layer to carry a cause; a single failure state is simple and blurs everything.", "At-least-once execution with idempotent jobs versus at-most-once: at-least-once survives lost runners and may repeat side effects; at-most-once never repeats and can lose work."],
    p: ["Infrastructure faults reported as test failures send authors debugging code that is correct.", "Retrying a job that already published, because its result was lost, duplicates the release."],
    v: "Inject a runner crash, a test failure, a timeout and a provider reclaim, and confirm each is recorded with a distinct cause and receives the documented handling, including whether retried and whether counted against the author.",
    dep: ["run-state-machine", "retry-policy", "timeouts-and-watchdog"]
  },
  "self-observability": {
    s: "Treating the CI system as a production service: measuring queue latency, success of its own operations, capacity and error rates, with alerts and a status page.",
    d: "Developers experience CI outages as work stopped. The operators therefore track service level indicators: time from event to run start, queue wait per pool, runner start success, API errors, status-report delay, log delivery lag. Metrics, traces and logs from every component feed dashboards and paging, and synthetic canary pipelines run continuously to prove the whole path works. It is hard because failures are spread across many pieces, and CI users cannot tell a platform fault from their own failing code unless the platform says so.",
    k: ["Synthetic canary pipelines versus relying on real traffic metrics: canaries detect failure when nobody is pushing and cost a little; real metrics are free and silent at night.", "Publish a status page and platform failure signals to users versus keep internal: openness reduces support load and builds trust; internal is simple and leaves users guessing."],
    p: ["The CI system's own alerts depending on a pipeline that runs in the broken CI never fire.", "Averages hide that the ninety-ninth percentile of start time is ten minutes."],
    v: "Stop the scheduler during a test and confirm the canary pipeline fails within its interval, a page is sent, and the status page shows the incident before users report it.",
    dep: ["trend-analytics", "event-bus", "control-plane-api"]
  },
});
