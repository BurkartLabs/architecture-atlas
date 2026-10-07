// Details for the batch processing plate, part 1: programs and datasets, submission and observability.
ATLAS.details("batch-processing", {
  "driver-program": {
    s: "The user's program that builds the computation, submits jobs to the cluster and collects results. It holds the coordinating state of the whole application.",
    d: "The driver runs the user's main function, builds datasets and plans, and hosts the scheduler, the registry of executors and the location tables for shuffle output. Each action triggers a job. Because it coordinates everything, its memory and network are shared by all tasks: results returned to it, broadcast data served from it and task metadata all pass through one process. It can run on the submitting machine or inside the cluster, and its loss normally ends the application.",
    k: ["Driver inside the cluster vs on the client machine: in-cluster survives a laptop disconnect and sits close to executors; client mode gives interactive output and easier debugging.", "One central driver vs distributed coordination: a single coordinator keeps scheduling simple and consistent, but it is a bottleneck and a single point of failure."],
    p: ["Collecting a large result to the driver exhausts its memory and kills the whole application, not just that job.", "A driver on a flaky wide-area link loses executors with heartbeat timeouts even though the cluster is healthy."],
    v: "Run a job that returns a 10 GB result under a 2 GB driver limit and confirm it fails with a clear size error before memory is exhausted, while a job writing that data to storage succeeds.",
    dep: ["dag-scheduler", "job-submission"]
  },
  "partitioned-dataset": {
    s: "An immutable, distributed collection split into partitions that are processed in parallel, each by one task on one machine.",
    d: "A dataset is a handle, not data. It records how many partitions it has, how to compute each partition from its parents, which partitioner (if any) placed its rows, and where each partition prefers to run. Partitions are the unit of parallelism, scheduling, caching and recovery. Immutability means every transformation produces a new dataset, which is what lets a lost partition be recomputed from its definition. The difficulty is choosing partition counts and sizes: too many tiny partitions drown the scheduler, too few leave machines idle or run out of memory.",
    k: ["Immutable datasets vs in-place mutation: immutability makes recomputation and caching safe, but updates cost a full new dataset and extra memory.", "Partition as the single unit of work vs finer record-level tracking: coarse units keep bookkeeping tiny, but one oversized partition stalls the stage."],
    p: ["Reading many small files yields thousands of near-empty partitions and scheduler overhead larger than the work.", "Assuming partition order matches data order after a shuffle yields wrong results that vary between runs."],
    v: "Create a dataset from 64 input splits, assert it reports 64 partitions, run a count, and confirm the UI shows exactly 64 tasks with roughly equal input bytes.",
    dep: ["lineage-graph", "partitioner"]
  },
  "lineage-graph": {
    s: "The recorded graph of how each dataset was derived from its parents, kept so any lost partition can be recomputed instead of stored redundantly.",
    d: "Every transformation adds a node that remembers its parent datasets, the function applied and the dependency type. The graph is a directed acyclic graph rooted at data sources. The scheduler walks it to find stage boundaries, and recovery walks it backward from a lost partition to the nearest available input or cached copy. It is cheap to keep, but long chains from iterative algorithms grow without bound, and each step's closure must be serializable and deterministic for recomputation to give the same answer.",
    k: ["Lineage-based recovery vs replicating intermediates: lineage costs almost nothing during normal runs, but recovery after a late failure can repeat hours of work.", "Truncating lineage with checkpoints vs keeping full history: checkpoints bound recovery cost and graph size, but write the data to reliable storage."],
    p: ["An iterative loop with hundreds of steps builds a lineage so deep that serializing it overflows the stack.", "A transformation that reads the clock or random state yields different data on recompute, silently corrupting downstream results."],
    v: "Kill an executor holding a mid-job partition and confirm the job finishes with the same output, with the event log showing only the lost partition's lineage recomputed.",
    dep: ["partitioned-dataset", "narrow-wide-dependencies"]
  },
  "transformations": {
    s: "Operations such as map, filter, join and group that define a new dataset from existing ones without running anything.",
    d: "Each transformation returns a new dataset and records itself in lineage. Narrow ones, such as map and filter, work on one parent partition at a time and pipeline together. Wide ones, such as group, join and repartition, need rows from many parent partitions and force a shuffle. The engine can reorder, fuse and drop transformations because none have run. The hard part is that the user's function is a black box: the engine cannot see what it reads or mutates, so closures that capture external state behave differently when executed remotely.",
    k: ["Rich built-in operators vs arbitrary user functions: built-ins are optimizable and vectorizable, while opaque functions are flexible but block most optimization.", "Narrow-only fusion vs eager materialization per step: fusing avoids writing intermediates, but makes a failure harder to attribute to one step."],
    p: ["A closure captures a large local object, which is serialized into every task and swamps the network.", "Mutating a shared variable inside a map appears to work locally and produces wrong totals on a cluster."],
    v: "Chain a filter and a map on a billion-row dataset, view the plan, and confirm both run in one stage with no shuffle, then add a group and confirm exactly one shuffle appears.",
    dep: ["partitioned-dataset", "lazy-evaluation"]
  },
  "actions": {
    s: "Operations such as count, collect and write that force evaluation: they submit a job and return a value to the program or write output to storage.",
    d: "An action asks the scheduler to compute a dataset's partitions and combine the results. Each action is a separate job with its own stages, so two actions on the same unpersisted dataset compute it twice. Results flow back to the driver, are folded by a tree aggregation, or are written in parallel to storage by the tasks themselves. Actions are where lazy errors finally appear: a bad path or a type error written ten steps earlier fails only now, which makes debugging indirect.",
    k: ["Writing results from tasks vs collecting to the driver: parallel writes scale and avoid the driver bottleneck, but need an output commit protocol.", "One action per question vs reusing a cached dataset: separate actions are simple, but recompute everything unless the data is persisted."],
    p: ["Calling count and then write on an expensive dataset runs the entire pipeline twice, including side effects in user code.", "A schema error shows up only at the final action, far from the line that caused it."],
    v: "Call two actions on one dataset with a counter in the source reader and confirm the source is read twice; persist first and confirm it is read once.",
    dep: ["driver-program", "dag-scheduler", "lazy-evaluation"]
  },
  "dataframe-api": {
    s: "A table-like dataset with named, typed columns, whose operations the engine can inspect and optimize, unlike opaque functions over untyped records.",
    d: "A dataframe carries a schema, and its operations are expressed as column expressions rather than functions. That lets the engine build a logical plan, prune unused columns, push filters into files and store rows in a compact binary form. It is the main interface for most users and shares its plan machinery with SQL. The tradeoff is expressiveness: logic that does not fit the expression vocabulary must drop to a user function, and the engine then treats that part as a black box.",
    k: ["Expression-based API vs function-based API: expressions give the optimizer full visibility and speed, while functions allow arbitrary code but forfeit most optimization.", "Runtime-checked schema vs compile-time typed records: runtime checks keep the API flexible, but type errors surface late, at plan analysis or during the job."],
    p: ["Mixing in a user function on one column forces deserialization of whole rows and loses file-level filtering.", "Column name collisions after a join produce ambiguous-reference errors or, worse, silently pick the wrong column."],
    v: "Filter a columnar file on one column and select two, then check the plan shows the filter and only two columns pushed into the scan and the scan reports fewer bytes than the file size.",
    dep: ["logical-plan", "schema-and-types", "analyzer"]
  },
  "user-defined-functions": {
    s: "Custom per-row or per-group functions supplied by the user and called from the engine's operators, often running in a separate process.",
    d: "A user function plugs arbitrary logic into a plan. Scalar functions run once per row, aggregate functions fold groups, and table functions emit rows. In the engine's native runtime they run in-process; functions written in another language run in a worker process fed through a serialization channel, in rows or column batches. The optimizer cannot look inside, so it cannot push filters through or reorder them safely. They are hard to get right because they must be deterministic, serializable and resilient to null and malformed inputs.",
    k: ["In-process native functions vs out-of-process workers: native is fastest, but external-language workers let teams use their own libraries at the cost of serialization.", "Batch-at-a-time vs row-at-a-time invocation: batches amortize call overhead heavily, but need functions written to operate on whole columns."],
    p: ["A non-deterministic function in a filter is evaluated again on retry and drops different rows.", "An exception on one malformed row fails the whole task, then every retry of it."],
    v: "Run a function over ten million rows in row mode and in batch mode, and confirm results are identical while batch mode finishes in a fraction of the time with far fewer worker calls.",
    dep: ["serializers", "user-code-workers"]
  },
  "broadcast-variables": {
    s: "Read-only data sent once to each worker machine and shared by all tasks there, instead of being shipped with every task.",
    d: "The driver serializes a value and splits it into chunks, which workers fetch on first use, often from each other in a peer-to-peer tree so the driver is not flooded. The value is then cached in memory on the worker and shared by every task that runs there. It is the manual form of what the engine does for a small side of a join. It is hard because the value must fit in memory on every worker, and changes made after broadcasting are not seen anywhere.",
    k: ["Broadcasting a small table vs shuffling both sides: broadcast avoids moving the big side entirely, but fails when the small side is not actually small.", "Peer-to-peer chunk fetch vs everyone fetching from the driver: peer fetch scales to thousands of workers, with more moving parts when a peer dies."],
    p: ["Broadcasting a table that grows past the worker's memory fails mid-job, long after the plan looked fine.", "Mutating the source after broadcasting leaves workers with a stale copy no one notices."],
    v: "Broadcast a 100 MB lookup to 200 workers and confirm the driver sends only a few copies of it, while all tasks read the same in-memory object on each worker.",
    dep: ["block-manager", "serializers"]
  },
  "accumulators": {
    s: "Write-only counters that tasks add to and the driver reads, used for metrics and debugging, with merge rules that tolerate parallel updates.",
    d: "Each task keeps a local copy of the accumulator, updates it without locks and sends the delta back with its result. The driver merges deltas with an associative, commutative function. They are cheap, but their semantics are weak: updates inside transformations are applied once per task attempt, so retries, speculative duplicates and recomputation can count the same record repeatedly. Updates inside actions are applied once per successful task. They suit approximate statistics, not exact bookkeeping.",
    k: ["Updates in transformations vs in actions: transformations are convenient but may double-count on retry; actions give exactly-once application per task at the cost of structure.", "Custom accumulators vs reading results from output: accumulators avoid an extra pass, but their values are visible only to the driver and only after the job."],
    p: ["Counting bad records in a map step gives different totals on every run once retries occur.", "A custom merge that is not associative gives results that depend on task finish order."],
    v: "Count rows with an accumulator in an action, force a task failure and retry, and confirm the final count equals the true row count exactly, then repeat in a transformation and note the overcount.",
    dep: ["task-runner"]
  },
  "job-submission": {
    s: "The path by which a packaged application, with its configuration and resource request, is handed to the cluster and started.",
    d: "A client tool or service packages the application's code and dependencies, records configuration and asks the cluster manager to launch a driver. It may go through a gateway service that queues, authenticates and tracks submissions, or a workflow scheduler that triggers it on a timetable. Submission modes differ in where the driver runs and who restarts it. It is hard because configuration is spread over defaults, files, command-line flags and code, and the order of precedence determines what actually runs.",
    k: ["Direct submission vs a gateway service: direct is simple and fast, while a gateway centralizes authentication, quotas and history but is another service to run.", "Immutable per-run configuration vs shared cluster defaults: per-run is reproducible, but shared defaults let operators change behavior for everyone at once."],
    p: ["A flag silently overridden by code produces a job with the wrong memory and a confusing failure.", "A client that exits after submitting loses the application's final status unless it polls or the history is stored."],
    v: "Submit the same application twice with different executor counts and confirm the effective configuration shown in the job UI matches each submission, with the driver started on the requested node type.",
    dep: ["cluster-manager-interface", "dependency-packaging", "tuning-config"]
  },
  "job-ui": {
    s: "A live web view of running and finished jobs, stages, tasks, executors and storage, showing where time and data volume went.",
    d: "The driver serves pages built from its scheduler state and task metrics: a timeline of jobs, per-stage task distributions, shuffle read and write sizes, spill, garbage collection time and per-executor summaries. Skew shows up as a long tail in the task duration chart, and spill as a column of nonzero disk bytes. The challenge is scale: a job with a million tasks cannot show every task, so the display aggregates and samples, which can hide a single pathological task.",
    k: ["Live in-driver UI vs reconstructing from logs: in-driver is immediate and detailed, but disappears with the application unless events are also stored.", "Aggregated task summaries vs per-task detail: summaries stay responsive at large scale but hide outliers that matter most."],
    p: ["Reading average task time instead of the maximum hides a single straggler that sets the stage duration.", "A UI that retains too many tasks consumes driver memory and crashes long applications."],
    v: "Run a job with one deliberately oversized partition and confirm the stage view shows one task with maximum duration and input far above the median, matching the known cause.",
    dep: ["task-metrics", "event-log"]
  },
  "event-log": {
    s: "A durable, append-only record of scheduler and task events, used to rebuild the UI of finished applications and to analyze history in bulk.",
    d: "The driver writes each event, such as job start, stage completion, task end with metrics and executor added, to a log in shared storage. A history service replays logs to reconstruct the same views offline. Because it captures everything a job did, it also feeds cost and performance analysis across thousands of runs. The cost is volume: large jobs emit enormous logs, and a log not flushed on a crash is incomplete, so the history for the failed run is the least reliable one.",
    k: ["Full event stream vs sampled events: a full stream supports exact replay, while sampling keeps logs small but loses the tail you wanted to see.", "Per-application log files vs one central store: files are simple to retain and delete, while a central store is easier to query across applications."],
    p: ["Logs left in-progress after a driver crash are skipped by the history service, hiding the failures that matter most.", "No retention policy means the log store fills silently and writes begin failing."],
    v: "Run a job, stop the live driver, open the history service and confirm the stage timeline and task counts match what was seen live. Truncate the log and confirm the truncation is reported.",
    dep: ["task-metrics"]
  },
  "metrics-system": {
    s: "Counters, gauges and timers from drivers, executors and machines, published to monitoring systems so operators can alert and trend over time.",
    d: "Each process maintains metrics such as active tasks, memory pools, shuffle bytes, garbage collection time and heartbeat delays, and publishes them through pluggable sinks to a time-series store. Dashboards and alerts sit on top. Unlike the event log, which is per application and detailed, these are continuous and aggregate. The difficulty is choosing signals that reflect problems early: a healthy-looking average can coexist with one executor nearly out of memory, and cardinality explodes if every application and task is its own series.",
    k: ["Per-executor series vs cluster aggregates: per-executor localizes problems, but series count grows with cluster size and run history.", "Push to a collector vs scrape from endpoints: push works through short-lived jobs, whereas scrape is simpler to operate but misses jobs that end between scrapes."],
    p: ["Unique application identifiers in metric names create unbounded series and overload the monitoring store.", "Alerting on average memory misses the one executor that is about to be killed."],
    v: "Inject a memory leak on one executor and confirm its memory gauge and garbage collection time diverge from peers, and that an alert on per-executor heap fires before that container is killed.",
    dep: ["task-metrics", "executor-process"]
  },
  "explain-output": {
    s: "A textual or graphical display of the logical and physical plans, with chosen join strategies, pushed filters and, after running, actual row counts and times per operator.",
    d: "The engine can print the parsed, analyzed, optimized and physical plans, and annotate the physical plan with per-operator metrics after execution. It shows which filters reached the scan, which columns were read, where shuffles occur and how joins were executed. It is the main tool for diagnosing a slow query. It is hard to read for deep plans, and plans change at run time under adaptive execution, so the plan shown before the job may differ from what ran.",
    k: ["Plan before execution vs plan with run-time metrics: the first is available instantly and safely, the second shows what actually happened and where estimates were wrong.", "Textual tree vs interactive graph: text is scriptable and diffable, while graphs are easier to navigate for large plans."],
    p: ["Reading a pre-execution plan and assuming a broadcast join happened when adaptive execution later switched strategy.", "Comparing estimated and actual row counts is skipped, so the real cause, stale statistics, is missed."],
    v: "Run a query on a partitioned table and confirm the explain output lists the partition filter and pushed predicates, and that the scan metrics show fewer files read than exist.",
    dep: ["physical-plan", "logical-plan", "task-metrics"]
  },
  "tuning-config": {
    s: "The settings that control parallelism, memory sizes, shuffle behavior, speculation and many other engine decisions, set per application or per cluster.",
    d: "Hundreds of parameters shape behavior: executors, cores and memory per executor, default partition count, shuffle compression, spill thresholds, speculation timing and the adaptive features. Defaults are chosen to be safe on a small input and are usually wrong at scale. Tuning is mostly sizing: aligning partitions with data volume, memory with partition size and executor count with the cluster. It is hard because parameters interact and are workload-specific, and a setting that helps one job often hurts another.",
    k: ["Per-job tuning vs cluster-wide defaults: per-job fits each workload, but needs expertise from every team, while defaults protect everyone with less precision.", "Manual tuning vs adaptive features that tune at run time: adaptive adapts to actual data, but adds variability that makes runs harder to compare."],
    p: ["Copying a tuned configuration from a blog post sized for a different data volume makes a job slower than the defaults.", "Raising parallelism without raising memory per executor causes widespread out-of-memory failures."],
    v: "Run the same job at three partition counts and confirm one setting produces tasks of 100 to 200 MB each, no spill, and the lowest total runtime, with the others visibly worse in the stage view.",
    dep: ["memory-manager", "partition-count"]
  },
  "determinism-and-idempotence": {
    s: "Whether running a task twice, in a different order or on a different machine produces the same output, which recomputation, retries and speculation all assume.",
    d: "Lineage recovery, task retries and speculative copies are only correct if repeating a task yields identical results and effects. Pure functions over immutable partitions satisfy that. Random numbers, current time, unordered iteration, external calls, and operations whose result depends on the arrival order of shuffle data do not. Engines handle some of this by fixing random seeds per partition and sorting where needed, but user code can break it anywhere. The consequence is not a crash: the job completes with plausible, subtly wrong data.",
    k: ["Require determinism of user code vs tolerate nondeterminism by re-running whole stages: requiring is cheap but unenforceable, while re-running is safe but expensive.", "Seeded per-partition randomness vs true randomness: seeds keep recomputation consistent, but a change in partitioning changes the sample."],
    p: ["A retried task re-sends an email or increments an external counter a second time.", "Shuffle fetch order makes a floating-point sum differ in the last digits between runs, failing exact comparisons."],
    v: "Run a job with a random sample and a killed executor, repeat it with the same seed, and confirm the output is byte-identical. Then run a deliberately nondeterministic function and confirm the checker flags it.",
    dep: ["lineage-recomputation", "task-retry", "speculative-execution", "idempotent-writes"]
  },
  "data-skew": {
    s: "Uneven distribution of rows or work across keys or partitions, which makes one task far slower than the rest and sets the length of the whole stage.",
    d: "Real keys are rarely uniform: a few customers, null values or default codes can hold a large share of rows. A hash partitioner sends all rows of a key to one task, so that task processes much more data, spills, and runs long while the rest of the cluster idles. Skew also appears at read, from uneven file sizes, and at output. Detecting it needs per-partition size statistics, and fixing it needs a plan change such as salting, splitting hot keys or broadcasting. No setting removes it without trade-offs.",
    k: ["Splitting hot keys at run time vs salting keys in code: run-time handling is automatic but limited to certain join types, while salting works anywhere but needs code changes.", "More partitions vs targeted handling: more partitions help moderate imbalance but cannot split a single hot key."],
    p: ["A null join key sends millions of rows to one task, which runs out of memory or runs for hours.", "Diagnosing by average task time misses the single outlier task that dominates the stage."],
    v: "Join on a column where one key holds a fifth of the rows, compare the maximum and median task input sizes in the stage view, then enable skew handling and confirm the maximum drops near the median and the stage time shrinks.",
    dep: ["skew-handling", "partitioner", "adaptive-execution"]
  },
  "cost-model-and-statistics": {
    s: "The engine's beliefs about data size, distinct values and selectivity, which drive join strategy, partition counts and memory estimates, and which are often wrong.",
    d: "Choosing a broadcast over a shuffle join, a join order or a number of partitions all depend on estimated row counts and sizes. Estimates start from table statistics and propagate upward through filters and joins, with errors compounding at every step. After a few joins they can be off by orders of magnitude. Engines respond by collecting statistics, using histograms, and re-planning at run time using exact sizes measured at shuffle boundaries. Missing or stale statistics, not poor algorithms, cause most bad plans.",
    k: ["Static estimation vs run-time re-planning: static is available before any work, but compounds error, while run-time uses exact sizes and only helps after the first stage.", "Detailed statistics vs minimal ones: histograms improve selectivity estimates but cost time to collect and go stale as data changes."],
    p: ["Statistics gathered before a large load make the optimizer believe a table is empty and broadcast it.", "Correlated columns break the independence assumption and underestimate row counts severely."],
    v: "Compare the optimizer's estimated and actual row counts at each join in the explain output on a skewed dataset, then refresh statistics and confirm estimates move within a factor of two.",
    dep: ["statistics-collection", "cost-based-optimizer", "adaptive-execution"]
  },
  "serialization-boundaries": {
    s: "Every place where an object must become bytes: task shipping, shuffle, caching, broadcast and out-of-process workers. Each costs CPU, memory and compatibility.",
    d: "Data and code cross serialization boundaries repeatedly: closures are shipped from driver to executors, rows are written to shuffle files, cached partitions may be stored serialized, and data sent to other-language workers is encoded. Generic object serialization is slow and large; compact binary row formats and columnar batches are far faster. Boundaries are also where compatibility problems appear, because every process must agree on class versions and formats. Eliminating boundaries, by fusing operators and staying in binary form, is a major source of speed.",
    k: ["Generic serialization of arbitrary objects vs schema-specific binary encoding: generic handles anything, while schema-specific is much faster and smaller but only works for known types.", "Serialized caching vs live objects: serialized storage uses less memory and garbage collection, but pays decoding on every access."],
    p: ["A closure captures a non-serializable resource such as a connection and fails at submission on the cluster, not locally.", "Mixed library versions between driver and executors give class incompatibility errors only on certain tasks."],
    v: "Run a job with generic and compact serializers and compare shuffle write bytes and task time, confirming the compact one is substantially smaller and faster for the same result.",
    dep: ["serializers", "binary-row-format", "user-code-workers", "shuffle-write"]
  },
  "failure-domains": {
    s: "What a single failure takes down: a task, a process, a machine, a rack, a zone or the driver, and which of those the engine is built to survive.",
    d: "Task failures are retried, executor and machine loss triggers recomputation of lost shuffle files and cached data, and rack or zone loss does the same at larger scale. The driver is usually a single point of failure unless checkpointed. Storage failure is typically handled by the file system underneath. The design question is how much work a failure destroys: shuffle files on local disk die with the machine, so a late failure can force re-running upstream stages. Separating shuffle storage from compute narrows that blast radius.",
    k: ["Local-disk shuffle vs remote shuffle storage: local is fast and simple, but loses data with the machine, whereas remote survives machine loss at a cost in latency and infrastructure.", "Fail fast on repeated failures vs retry indefinitely: failing fast surfaces bad data or code quickly, while indefinite retry hides real defects behind wasted work."],
    p: ["A single bad host causes repeated task failures across many applications until it is excluded.", "A zone loss removes enough executors that recovery recomputes most of a long job."],
    v: "During a long job, terminate one worker machine and then one whole rack. Confirm the job completes both times and the event log shows only the lost stages' partitions recomputed.",
    dep: ["lineage-recomputation", "executor-loss", "node-exclusion", "external-shuffle-service", "driver-recovery"]
  },
  "multi-tenancy": {
    s: "Sharing one cluster among many teams and jobs, with fair resource shares, isolation of failures and data, and attribution of cost.",
    d: "Many applications compete for the same machines. Queues and quotas divide capacity, schedulers enforce fair share and priorities, preemption reclaims resources from over-share jobs, and containers limit memory and CPU. Within one application, job pools divide executor time among concurrent jobs. Isolation is imperfect: shared local disks, network links and the shuffle service are contended, and one tenant's skewed job can degrade everyone's latency. Authentication and access control on data are a separate, equally important dimension.",
    k: ["Strict quotas vs elastic sharing with preemption: quotas are predictable but waste idle capacity, while elastic sharing uses everything at the cost of killing some tasks.", "Shared long-lived clusters vs per-job clusters: shared is efficient and starts instantly, while per-job gives full isolation but pays startup time and idle waste."],
    p: ["A runaway job with no cap on executors takes the whole cluster and starves interactive users.", "Shared temporary directories fill the disk and fail unrelated applications' shuffles."],
    v: "Start a large job in one queue and a small job in another, and confirm the small one receives its guaranteed share within the stated time while the large one is held to its quota under contention.",
    dep: ["queues-and-quotas", "job-pools", "container-limits", "preemptible-nodes"]
  }
});
