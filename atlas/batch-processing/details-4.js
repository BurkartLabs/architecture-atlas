// Details for the batch processing plate, part 4: memory management, caching, fault tolerance.
ATLAS.details("batch-processing", {
  "memory-manager": {
    s: "Divides each executor's memory between task execution and cached data, grants memory to operators on request and forces spilling or eviction when the budget is exhausted.",
    d: "A fixed pool is shared by all concurrently running tasks. Operators such as sorts and hash tables ask for memory in pages and must release it or spill when refused. A task is guaranteed a minimum share, roughly an equal fraction of the pool, so one task cannot starve the rest. The boundary between execution and storage memory is soft: either can borrow the other's unused space, and execution can evict cached blocks, but not the reverse. It is hard because accounting covers only memory the engine tracks, not everything the process uses.",
    k: ["Soft boundary between execution and storage vs fixed split: soft use adapts to workload and wastes nothing, while fixed is predictable but leaves space idle.", "Per-task fair share vs first come first served: fair share avoids starvation, but gives a lone large task less than it could use when others are idle."],
    p: ["Memory held by untracked objects, such as user-code buffers, is invisible to the manager and the process is killed.", "Many concurrent tasks each get a small share, forcing frequent spills even though total memory is ample."],
    v: "Run eight concurrent tasks each needing 2 GB on a 4 GB pool and confirm each is granted a fair share, spill counters rise for each, no task fails, and results equal a run with ample memory.",
    dep: ["execution-memory", "storage-memory", "off-heap-memory"]
  },
  "execution-memory": {
    s: "The part of the memory budget used by running operators for sort buffers, hash tables and shuffle buffers, which is released when a task ends.",
    d: "Operators acquire execution memory in pages from the manager, which tracks usage per task. When a request cannot be satisfied, the operator is asked to spill some of its data to disk and release pages. Pages are returned at task end or when an operator finishes. Unlike cached data, execution memory cannot be evicted without losing in-progress work, so it takes priority over storage memory. It is hard because operators differ in how finely they can spill, and an operator that cannot spill at all fails the task.",
    k: ["Page-based allocation vs per-object allocation: pages keep accounting cheap and avoid fragmentation, but waste space for small structures.", "Operators spill themselves on request vs the manager evicting directly: self-spill uses operator knowledge of what is cheapest to write, but needs every operator to implement it correctly."],
    p: ["An operator that does not support spilling, such as collecting one huge group, fails with out-of-memory regardless of pool size.", "Large pages allocated per task waste memory when many tasks hold few rows each."],
    v: "Run a sort of a partition larger than its execution memory and confirm the task spills, finishes, peak execution memory stays under the limit and spill bytes appear in the task metrics.",
    dep: ["memory-manager", "spilling"]
  },
  "storage-memory": {
    s: "The part of the memory budget used to hold cached partitions and broadcast values, which may be evicted when execution needs the space.",
    d: "Cached blocks occupy storage memory until they are explicitly released or evicted. The block manager tracks sizes and, when a new block does not fit, evicts least recently used blocks of other datasets, dropping them or writing them to disk depending on persistence level. Execution can reclaim storage memory that exceeds a protected fraction. The tradeoff is constant: memory kept for cache is unavailable for processing, so aggressive caching can cause spills in running tasks.",
    k: ["Protect a minimum cached fraction vs let execution take all: protection keeps hot data resident, while taking all favors running tasks and loses cache.", "Cache deserialized vs serialized: deserialized is fastest to read, but serialized fits more data per byte of memory."],
    p: ["Caching a dataset read once wastes memory that tasks needed, causing spills.", "Cache that does not fit is partly evicted and recomputed on each use, making the job slower than no caching."],
    v: "Cache a dataset that exceeds the storage pool and confirm the storage view shows a partial cached fraction, and that a second action recomputes only the missing partitions.",
    dep: ["memory-manager", "block-manager"]
  },
  "off-heap-memory": {
    s: "Memory allocated outside the managed heap by the engine itself, used for large buffers and binary data to avoid garbage collection cost and overhead.",
    d: "The engine can allocate raw memory directly and manage it explicitly, storing rows, hash tables and sort buffers there. Because the collector never scans it, large working sets add no pause time, and accounting is exact. Network buffers and some file readers also use direct memory. The costs are manual lifetime management, where a leak is not cleaned up by a collector, and the need to size and reserve it separately in the container, since it counts against the container limit without being part of the heap.",
    k: ["Off-heap storage vs managed heap: off-heap avoids garbage collection and gives exact accounting, but needs explicit freeing and separate sizing.", "Engine-managed pools vs per-object native allocations: pools are fast and bounded, but need the engine to implement its own allocator."],
    p: ["Off-heap size is left out of the container request, and the container is killed for exceeding its limit.", "A leaked off-heap buffer is never reclaimed and grows until the executor dies."],
    v: "Enable off-heap execution, run a large aggregation, and confirm garbage collection time drops, the container's resident memory stays under its limit and off-heap usage returns to baseline after the job.",
    dep: ["memory-manager", "container-overhead", "binary-row-format"]
  },
  "spilling": {
    s: "Writing in-memory data to local disk when memory is exhausted and reading it back later, so tasks slow down rather than fail.",
    d: "When an operator cannot get more memory, it sorts or serializes some of its contents, writes them to a temporary file and frees the pages. Later it reads the spilled data back, merging runs for sorts and joins or re-aggregating partial tables. Spill turns a hard memory limit into a performance cliff: runtime can grow several times when data is mostly on disk. Spill files use local disks that are shared with shuffle files, and they are removed at task end. Large spill is the clearest sign a partition is too big.",
    k: ["Spill and continue vs fail the task and retry with more memory: spilling always completes, but may be very slow, while failing is fast but requires reconfiguration.", "Compress spill files vs write raw: compression reduces disk I/O but spends CPU, which pays off on slow disks."],
    p: ["A job that spills heavily completes but takes ten times longer, and no one notices as it did not fail.", "Spill and shuffle files fill the same local disk, and the task fails with no space left."],
    v: "Run a sort with the memory limit at a tenth of the data size and confirm the task completes with spill bytes of about the data size, correct output, and spill files removed afterwards.",
    dep: ["execution-memory", "serializers"]
  },
  "serializers": {
    s: "Code that converts objects and rows to bytes and back for shuffle, caching, task shipping and broadcast, with trade-offs between speed, size and generality.",
    d: "A general-purpose serializer handles any object graph, writing class information and handling references, which is flexible but slow and bulky. A registered-class serializer writes compact identifiers. Schema-aware encoders for rows write only values in a fixed layout. Which is used depends on the boundary: tasks and closures need generality, while shuffle and cache of known schemas can use compact forms. It is hard because failures are late and obscure: a non-serializable object appears only when a task is actually shipped, and class version mismatches surface across processes.",
    k: ["General serialization vs registered classes: general is convenient for any type, while registration is smaller and faster but needs every class listed.", "Binary compact vs self-describing format: compact is smaller and faster, while self-describing tolerates schema changes between versions."],
    p: ["An object reachable from a closure that is not serializable fails the job only on the cluster.", "Using a serializer without class registration inflates shuffle sizes several-fold."],
    v: "Shuffle one gigabyte of rows with the general and the compact serializer and confirm both give identical results, with the compact one writing fewer bytes and using less CPU time.",
    dep: ["binary-row-format"]
  },
  "binary-row-format": {
    s: "A compact in-memory layout for rows with fixed-width fields stored inline and variable-length data behind offsets, so rows can be compared and hashed without creating objects.",
    d: "Each row is a contiguous byte region: a null bitmap, an 8-byte slot per field holding either the value or an offset and length, then variable-length data. Operators read and write fields directly by offset, hash and compare raw bytes and copy rows as blocks. This eliminates per-object headers and keeps the garbage collector out of the data path, cutting memory several-fold against object representations. It is hard because every operator must work with the layout, nested types complicate offsets, and debugging requires decoding bytes by hand.",
    k: ["Binary rows vs language objects: binary is compact, cache-friendly and avoids garbage collection, but every operator needs layout-aware code.", "Row layout vs columnar layout in memory: rows suit whole-row operations such as shuffle and joins, while columns suit scans and aggregates."],
    p: ["Reading a field with the wrong offset after a schema change returns garbage without any error.", "Alignment assumptions break on platforms that fault on unaligned access."],
    v: "Store ten million rows of a known schema in the layout and compare the memory footprint against an object representation, confirming several times less memory, with exact round-trip of every field including nulls.",
    dep: ["schema-and-types"]
  },
  "container-overhead": {
    s: "Memory a container needs beyond the engine's heap: thread stacks, native libraries, direct buffers, off-heap use and worker processes, which must be reserved or the container is killed.",
    d: "A cluster manager enforces a hard memory limit per container and kills it on excess, with no chance to spill or clean up. The engine therefore asks for heap plus an overhead allowance for everything outside it, typically a fraction of the heap with a minimum. Needs vary: other-language workers, large shuffle buffers and native readers consume substantially more. It is hard because the right allowance depends on the workload, and the symptom, a container killed without any out-of-memory error from the engine, is easy to misdiagnose as a driver or cluster problem.",
    k: ["Generous overhead vs lean heap-only requests: generous prevents kills but wastes capacity and raises cost, while lean packs more containers and risks kills.", "Fixed fraction vs explicit per-component sizing: a fraction is simple, but explicit sizing of off-heap and worker memory is accurate for known workloads."],
    p: ["Containers repeatedly killed for exceeding limits while the heap shows free space, because overhead was too small.", "Doubling heap without raising overhead makes kills more frequent."],
    v: "Run a job using other-language workers with the default overhead and confirm kills occur, then raise overhead to cover measured worker memory and confirm no kills, with the resident memory trace under the limit.",
    dep: ["off-heap-memory", "container-limits", "user-code-workers"]
  },
  "gc-pressure": {
    s: "Pauses and CPU time lost to automatic memory reclamation in the managed heap, which grow with the number of live objects rather than the amount of work done.",
    d: "Engines running on a managed runtime hold large amounts of data. If data is stored as many small objects, the collector must trace them all, and pauses lengthen, sometimes beyond the heartbeat timeout, which gets the executor declared dead. Cached data kept deserialized and boxed values in collections make it worse. Remedies are storing data in binary form or off-heap, using fewer larger objects, giving the heap enough headroom and choosing a low-pause collector. Task metrics show garbage collection time as a share of task time.",
    k: ["Large heaps per executor vs many smaller ones: large heaps share data but have longer pauses, while smaller ones pause shorter but duplicate broadcasts.", "Keep data as objects vs binary: objects are easy to use, while binary avoids collector work at the price of explicit encoding."],
    p: ["A collector pause over the heartbeat timeout makes the driver treat a live executor as lost and recompute its work.", "Memory pressure causes back-to-back full collections that consume most CPU, so tasks crawl without failing."],
    v: "Run a job with cached deserialized data and again with binary storage, and confirm the share of task time spent in collection drops from a large fraction to a few percent, with no heartbeat timeouts.",
    dep: ["binary-row-format", "off-heap-memory", "executor-process"]
  },
  "persistence-levels": {
    s: "The options for how a dataset is kept for reuse: in memory as objects or bytes, on disk, or both, with or without replication.",
    d: "Calling persist marks a dataset to be kept the first time it is computed. The level chooses memory only, memory spilling to disk, disk only, serialized or not, and optionally a second replica on another machine. Memory-only is fastest but partitions that do not fit are recomputed. Disk levels are slower but never recompute. Replication speeds recovery after executor loss but halves capacity. It is hard because the best level depends on size, cost to recompute and how often the data is reused.",
    k: ["Memory-only vs memory-and-disk: memory-only is fastest when it fits, but recomputes evicted partitions, while memory-and-disk reads back from disk instead of recomputing.", "Replicated cache vs single copy: replication shortens recovery, but halves the data that fits."],
    p: ["Persisting a dataset used once adds write cost and memory pressure with no benefit.", "Forgetting to unpersist keeps large datasets in memory for the rest of the application."],
    v: "Persist a dataset at memory-only and memory-and-disk with a pool smaller than the data and confirm the second reads all partitions from cache or disk while the first recomputes evicted ones.",
    dep: ["storage-memory", "block-manager", "serializers"]
  },
  "block-manager": {
    s: "The per-executor store that holds cached partitions, broadcast chunks and shuffle blocks in memory or on disk, and serves them to other executors.",
    d: "Every stored piece of data is a block with an identifier. The block manager tracks which are in memory or on disk, enforces storage limits, evicts under pressure and answers remote requests from other executors. A master component in the driver records which executor holds each block so tasks can find them. It underlies caching, broadcast and, in some designs, shuffle serving. It is hard because block locations are distributed state that goes stale when executors die, so lookups must tolerate and report missing blocks.",
    k: ["Central location registry vs peer discovery: a registry gives immediate answers, but is a bottleneck and must be updated precisely on every change.", "Fetch blocks from other executors vs recompute locally: fetching is cheap for large expensive blocks, while recompute may be faster for small simple ones."],
    p: ["After executor loss, the registry still lists blocks there, and tasks fail with timeouts until it is corrected.", "A block larger than the memory limit cannot be cached and is silently dropped."],
    v: "Cache a dataset across 10 executors, remove one, and confirm the registry drops its blocks, the next action recomputes just those partitions and cached partitions on other executors are reused.",
    dep: ["storage-memory", "eviction-policy"]
  },
  "eviction-policy": {
    s: "The rule for choosing which cached blocks to remove when new data needs space, usually least recently used, with protection against evicting a dataset to cache its own parts.",
    d: "When storage is full, the manager scans blocks in recency order and removes enough to make room, writing them to disk or dropping them according to the persistence level. It never evicts blocks belonging to the dataset currently being cached, which would thrash. Execution memory pressure can also evict blocks above the protected fraction. LRU is simple, but suits poorly when a job scans a dataset larger than the cache repeatedly, since each pass evicts what the next needs.",
    k: ["LRU vs cost-aware eviction: LRU is cheap and predictable, while cost-aware keeps data that is expensive to recompute but needs per-dataset cost tracking.", "Evict to disk vs drop: evict-to-disk saves recompute but uses disk bandwidth, while dropping is instant."],
    p: ["A repeated scan larger than the cache evicts each block just before it is needed, giving zero hits.", "Evicting the blocks of a dataset in the middle of using them causes recomputation storms."],
    v: "Cache two datasets that together exceed the pool, access them alternately, and confirm hit and miss counters match LRU expectations, with no thrashing within a single dataset's own blocks.",
    dep: ["storage-memory", "block-manager"]
  },
  "exchange-reuse": {
    s: "Detects identical subplans or shuffles within one query and computes them once, reusing the output instead of repeating the work.",
    d: "A query may reference the same table subquery twice, for example in a self-join or when a view is used in two branches. The planner canonicalizes subtrees, finds those that are semantically identical and replaces the duplicates with references to one shared node. The shuffle or broadcast output is then produced once and read multiple times. It saves I/O and CPU but needs the shared output to stay available, and it only works within one query, unlike an explicit cache across actions.",
    k: ["Automatic reuse of identical subplans vs explicit user caching: automatic needs no code but only within one query, while explicit caching spans actions but needs user knowledge.", "Reuse a shuffle output vs recompute per consumer: reuse saves work, but ties the consumers' scheduling together."],
    p: ["Two subplans that look alike but differ in a nondeterministic function are wrongly considered identical.", "A reused exchange kept for a long time pins its shuffle files and disk."],
    v: "Run a self-join over an expensive aggregation and confirm the physical plan lists one shared exchange referenced twice, with the scan and aggregate executed once according to the stage metrics.",
    dep: ["physical-plan", "shuffle-write"]
  },
  "remote-data-cache": {
    s: "A local-disk cache of file ranges read from remote storage, so repeated reads of hot data avoid network and storage latency.",
    d: "When data lives in an object store, each read crosses the network with high latency per request. A cache on each worker's local disk or memory stores recently read file blocks, keyed by file, version and range. Later tasks, even in other applications on the same node, read from local storage. It benefits repeated scans of hot tables and small metadata reads. It is hard because cached data must be invalidated when files change, schedulers should place tasks where the cache is warm, and cache space competes with spill and shuffle.",
    k: ["Block-level cache at the file layer vs dataset-level cache in memory: file-level is transparent to all queries, while dataset-level is faster but explicit.", "Cache keyed by file version vs by path: versioned keys are always correct, while path keys serve stale bytes after overwrite."],
    p: ["A cache keyed by path serves stale bytes after a file is overwritten in place.", "Cold-cache runs are used for benchmarking and compared to warm-cache runs, giving false improvements."],
    v: "Scan the same remote table twice, and confirm the second scan shows a high cache hit rate, far fewer remote requests, and lower runtime. Then overwrite a file and confirm the next scan reads the new bytes.",
    dep: ["object-store-connector", "data-locality"]
  },
  "cache-invalidation": {
    s: "Deciding when a cached dataset is no longer valid because its source changed, so later reads do not return stale results.",
    d: "A cached partition is a function of its inputs at the time it was computed. If the underlying files or table are modified, the cache still holds old values, and the engine does not know unless told. Mechanisms include explicit unpersist or refresh commands, version checks against table formats that expose snapshots, file-modification times, and time-based expiry. Within a single application, immutability makes the problem small; it becomes real with long-lived interactive sessions and shared caches.",
    k: ["Explicit refresh by the user vs automatic version checks: explicit is cheap but easy to forget, while automatic is safe but costs a metadata check at each use.", "Time-to-live expiry vs exact invalidation: time expiry is simple and bounded, but serves stale data for up to its duration."],
    p: ["A session caches a table, a pipeline overwrites it, and the session continues to answer from old data for days.", "A refresh drops the cache but not the metadata, so file listings are still stale."],
    v: "Cache a table, append rows through another process and confirm a default read still shows the old count. Refresh and confirm the new count appears, with the cache rebuilt from fresh files.",
    dep: ["persistence-levels", "table-format-integration"]
  },
  "lineage-recomputation": {
    s: "Recovers lost data by re-running only the tasks that produced the missing partitions, following recorded lineage back to surviving inputs.",
    d: "When a partition is lost to executor or machine failure, the scheduler consults lineage to see how it was made. If its inputs exist, it re-runs that one task. If they were also lost, such as shuffle files from the failed machine, it recurses upstream to the nearest surviving data or the source. No intermediate data needs to be replicated during normal running. Recovery cost depends on how much was lost and how wide the dependencies are: a wide shuffle can require re-running every mapper of the stage.",
    k: ["Recompute from lineage vs replicate intermediates: recompute has no steady-state cost but a variable recovery cost, while replication pays up front for fast recovery.", "Recompute only what is needed vs whole stage: partition-level recovery wastes little, but needs exact tracking of what exists."],
    p: ["A failure late in a long job after wide shuffles cascades into recomputing much of the job.", "Non-deterministic upstream tasks give different data on recompute, making already-consumed outputs inconsistent."],
    v: "Kill a machine late in a three-stage job and confirm the event log shows only tasks for the lost partitions re-run, that downstream stages resume, and that output equals the failure-free run.",
    dep: ["lineage-graph", "dag-scheduler", "shuffle-file-layout"]
  },
  "task-retry": {
    s: "Re-runs a failed task on another attempt, up to a limit, treating failures as transient unless they repeat.",
    d: "A task can fail from an exception, an executor loss or a timeout. The scheduler records the failure, delays slightly and launches a new attempt, preferably elsewhere. After a configured number of failures of the same task, the stage and job are aborted, since a deterministic error such as bad data will fail every time. Retries make jobs resilient to flaky machines. They require tasks to be repeatable, and the limit balances persistence against wasted work, with different treatment for task-level and stage-level failures.",
    k: ["Few retries vs many: few surfaces real bugs fast, while many hides transient faults on large unreliable clusters.", "Retry on a different node vs same node: a different node avoids a bad machine, but loses data locality."],
    p: ["A deterministic bad record fails every attempt, burning four retries and minutes before the job aborts.", "A retried task re-sends output already committed by the failed attempt."],
    v: "Inject a one-time failure in a task and confirm the second attempt succeeds and the job completes with correct output. Inject a permanent failure and confirm the job aborts after exactly the configured attempts.",
    dep: ["task-scheduler", "idempotent-writes", "node-exclusion"]
  },
  "fetch-failure-recovery": {
    s: "When a reducer cannot fetch a map output, the scheduler marks that output lost and re-runs the producing map tasks, then the stage that was waiting.",
    d: "A fetch failure signals that shuffle data is missing, unlike an ordinary task error. The scheduler removes that machine's outputs from the location table, resubmits the map stage for the lost partitions and re-runs the failed reduce stage afterward. It treats several failures from the same machine as one event. The difficulty is distinguishing a dead machine from a transient network error, limiting repeated resubmission loops, and doing it while other reducers continue.",
    k: ["Treat any fetch failure as output loss vs retry fetch first: immediate loss recovery is simple, while retrying first tolerates blips but delays real recovery.", "Re-run only lost map tasks vs the whole map stage: partial reruns save work, but depend on exactly tracking which outputs remain."],
    p: ["A flapping network causes repeated stage resubmission that never converges.", "Many reducers reporting the same failure trigger multiple overlapping resubmissions of one map stage."],
    v: "Delete one machine's shuffle files mid-stage and confirm reducers report fetch failures, only that machine's map tasks re-run, and the job completes with the correct output.",
    dep: ["shuffle-fetch", "dag-scheduler", "lineage-recomputation"]
  },
  "checkpointing": {
    s: "Writes a dataset to reliable storage and truncates its lineage there, so recovery restarts from the saved copy instead of from the beginning.",
    d: "A checkpoint materializes a dataset to the distributed file system, often as a separate job, and replaces its lineage with a reference to the files. It bounds recovery cost for long iterative jobs and keeps lineage graphs small. It differs from caching, which is lost with the executor and keeps lineage. The price is a full write and read of the data. Streaming-like and iterative algorithms use it periodically, at a frequency chosen by comparing write cost to expected recomputation cost.",
    k: ["Checkpoint frequently vs rarely: frequent bounds loss but spends I/O, while rare is cheap but exposes long recomputation.", "Reliable storage vs local storage: reliable survives machine loss but is slower, while local is fast but lost with the node."],
    p: ["Checkpointing without caching first computes the dataset twice, once for the checkpoint and once for use.", "Checkpoint files left behind accumulate indefinitely in storage."],
    v: "Run an iterative job with a checkpoint every 10 iterations, kill an executor at iteration 47 and confirm recovery restarts from the checkpoint at iteration 40, not iteration zero.",
    dep: ["lineage-graph", "object-store-connector", "output-writers"]
  },
  "executor-loss": {
    s: "Detects that an executor has died or become unreachable, and re-schedules its running tasks and any data that existed only there.",
    d: "The driver watches heartbeats and connection state. On timeout or disconnect it marks the executor lost, fails its running tasks for retry elsewhere, removes its cached blocks from the registry, and treats its shuffle output as gone unless an external service holds it. It also decides whether the loss was caused by the application, for instance memory overuse, or by the environment, such as preemption, which determines whether it counts against the failure limits.",
    k: ["Short heartbeat timeout vs long: short detects real failures fast, but misclassifies pauses from garbage collection, while long tolerates pauses and delays recovery.", "Count losses against job failure limits vs not: counting protects against endless loops, but unfairly penalizes jobs on preemptible machines."],
    p: ["A long garbage collection pause leads to a healthy executor being declared lost, and its tasks run twice.", "Loss of an executor holding all cached data forces full recomputation."],
    v: "Kill an executor process mid-stage and confirm the driver detects loss within the timeout, reschedules its tasks, removes its blocks from the registry and the job finishes.",
    dep: ["executor-process", "task-retry", "block-manager"]
  },
  "driver-recovery": {
    s: "Restarting the driver after a failure and resuming from saved state, in the cases where the application can do so at all.",
    d: "The driver holds the job state, so its loss normally ends the application and all executors. Some cluster managers restart it automatically with a limited number of attempts. A restarted driver starts the program again from the beginning, so true resumption needs the program to record its own progress, for example through checkpoints, committed output markers or a workflow orchestrator that restarts at the failed step. Interactive sessions cannot be resumed at all. It is the weakest link in fault tolerance.",
    k: ["Rely on an external orchestrator to rerun failed jobs vs recover inside the engine: external rerun is simple and visible, while in-engine recovery saves work but is complex and rarely complete.", "Restart from scratch with idempotent output vs resume mid-job: restart is easy to reason about, but wastes the work done before the crash."],
    p: ["A driver restart reruns an earlier non-idempotent step and duplicates output.", "A driver killed for memory restarts, runs the same action and is killed again, looping."],
    v: "Kill the driver partway through a job in a mode with automatic restart and confirm the application restarts, completes, and produces exactly one complete copy of the output.",
    dep: ["driver-program", "output-commit", "checkpointing"]
  },
  "output-commit": {
    s: "The protocol that makes a job's output appear atomically: tasks write to temporary locations and only successful attempts are promoted to the final location.",
    d: "Each task attempt writes to a private temporary path. When it finishes, it asks the driver to commit; the first attempt to be approved has its files moved or marked final, and duplicates are discarded. When all tasks commit, the job writes a success marker. On object stores, where rename is a slow copy, special committers write directly to final locations through multipart uploads that become visible only on commit. It is hard because rename-based commit is neither atomic nor fast on many stores, and failures between steps leave partial output.",
    k: ["Rename-based commit vs manifest or multipart commit: rename works on file systems with atomic rename, but is slow and unsafe on object stores, while multipart commit avoids copies.", "Commit per task vs at job end only: per task spreads the work, but exposes partial results to readers unless markers are used."],
    p: ["A job fails during final rename on an object store and leaves a mix of old and new files.", "Speculative duplicates both write and both are committed, duplicating rows."],
    v: "Kill the job halfway through commit and confirm readers see either none or all of the new output according to the success marker, and that rerunning produces no duplicate files.",
    dep: ["object-store-connector", "output-writers", "idempotent-writes"]
  },
  "idempotent-writes": {
    s: "Designing outputs so that writing the same result twice leaves the same final state, which makes retries and duplicate attempts harmless.",
    d: "Retries, speculation and driver restarts can all execute a write more than once. Idempotent writes make this safe: overwriting a partition by key instead of appending, writing to deterministic file names, using upserts keyed by a unique identifier, or committing through a transactional table format. For external systems, writes carry a batch identifier so repeats are recognized. It is hard because append-only sinks and counters are naturally non-idempotent and because correctness depends on a deterministic task output.",
    k: ["Overwrite by partition vs append: overwrite is safe to repeat but replaces data, while append is cheap but duplicates on retry.", "Deterministic file names vs unique names: deterministic names make repeats overwrite, while unique names avoid collisions but leave duplicates."],
    p: ["Retrying an append job after partial success doubles part of the data.", "A write to an external service without an idempotency key charges a customer twice on retry."],
    v: "Run the same write job twice, and kill and rerun it halfway, and confirm the final row counts and checksums equal one clean run in every case.",
    dep: ["output-writers", "table-format-integration"]
  },
  "node-exclusion": {
    s: "Stops scheduling tasks on machines or executors that have failed repeatedly, so one bad host does not fail the job.",
    d: "The scheduler counts task failures per executor, per node and per stage. After a threshold, the executor or node is excluded from that task, that stage or the whole application for a time. This isolates bad disks, broken network interfaces and misconfigured machines. Excluded resources can be returned after a timeout. The risk is excluding too much: on a small cluster, aggressive exclusion leaves nothing to run on, and failures caused by bad data look the same as failures caused by bad nodes.",
    k: ["Aggressive exclusion vs tolerant: aggressive routes around bad hosts quickly, but can remove healthy capacity on a small cluster.", "Exclude per task or stage first vs application-wide: narrow exclusion avoids punishing hosts for one bad task, while application-wide protects all later work."],
    p: ["A data-dependent failure is blamed on each node in turn until the whole cluster is excluded.", "A bad host is never excluded because failures are spread thinly across many tasks."],
    v: "Break one node's local disk and confirm after the configured failures that node is excluded, tasks run elsewhere, the job completes, and the node is retried only after the timeout.",
    dep: ["task-retry", "task-scheduler", "executor-loss"]
  }
});
