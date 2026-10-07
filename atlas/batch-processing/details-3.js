// Details for the batch processing plate, part 3: scheduling, task execution, shuffle and partitioning.
ATLAS.details("batch-processing", {
  "dag-scheduler": {
    s: "Turns a job into a graph of stages, submits stages whose inputs are ready, and reacts to stage completion and failure.",
    d: "On each action the scheduler walks the plan or lineage backward, cuts it at shuffles into stages, and builds a dependency graph. It submits a stage when all parent stages have produced their output, tracks which map outputs exist and where, and resubmits stages when outputs are lost. It hands each ready stage's tasks to the task scheduler. It is a single-threaded event loop in the driver, so its throughput limits how many tiny stages and tasks a job can sustain. Its correctness depends on exact bookkeeping of output locations.",
    k: ["Stage-level scheduling vs task-level dataflow: stage barriers are simple and make shuffle boundaries clean, but leave idle capacity while stragglers finish.", "Single event loop vs concurrent scheduling threads: one loop avoids races in the shared state, but becomes a bottleneck for jobs with very many tasks."],
    p: ["A job producing a million tiny tasks saturates the event loop, so cluster utilization is low while the driver is at 100% CPU.", "Stale output-location data after an executor loss causes repeated fetch failures."],
    v: "Submit a job with a three-stage chain, kill an executor holding stage-one output during stage two, and confirm the scheduler resubmits only stage-one tasks that lost output and then resumes stage two.",
    dep: ["stage-construction", "task-scheduler", "physical-plan"]
  },
  "stage-construction": {
    s: "Divides the plan into stages at shuffle boundaries, so each stage is a set of identical tasks running a pipeline of narrow operators.",
    d: "Starting from the final dataset, the builder walks dependencies. Narrow dependencies stay in the current stage, and each wide dependency ends the stage and begins a parent shuffle map stage. Each stage becomes one task per partition. Stages that read the same shuffle output or cached data can be shared or skipped when their results are already available. It is hard to see from user code where boundaries fall, and a small change in a program, such as one extra key-based operation, adds a whole new stage and a full shuffle.",
    k: ["Cutting only at shuffles vs also at caches and checkpoints: shuffle-only is minimal, while extra cuts shorten lineage but add materialization cost.", "Skipping stages with existing output vs always recomputing: skipping saves work across jobs, but depends on shuffle files being kept and valid."],
    p: ["Reusing a dataset in two actions recomputes its stages unless shuffle files happen to be retained.", "A stage with one slow operator holds up many fast ones fused in the same task."],
    v: "Build a program with two wide operations, confirm the UI lists exactly three stages, and run a second action on the same data to confirm earlier stages show as skipped.",
    dep: ["narrow-wide-dependencies", "physical-plan"]
  },
  "task-scheduler": {
    s: "Assigns a stage's tasks to free slots on executors, respecting locality preferences, resource requirements and fairness between concurrent jobs.",
    d: "Executors advertise free cores. The scheduler offers them to pending tasks in priority order, preferring slots on machines that already hold the task's input. It tracks running attempts, collects results and failures, applies retry limits and launches speculative copies. Task descriptions are shipped with serialized closures, so very large tasks cost network time. The difficulty is the balance between waiting for a local slot and starting anywhere now, and doing all of it with low overhead at tens of thousands of tasks per second.",
    k: ["Wait for locality vs launch immediately: waiting reduces network use but idles a slot, while launching immediately uses the slot and pays for remote reads.", "Push tasks to executors vs executors pull work: push allows global decisions, while pull scales better but loses placement control."],
    p: ["A long locality wait on a stage of short tasks leaves most of the cluster idle.", "A very large serialized task is re-sent to every executor and saturates the driver's network."],
    v: "Run a stage whose input is on 20 machines, and confirm the UI shows most tasks marked node-local, with a few downgraded to any after the configured wait.",
    dep: ["data-locality", "executor-process", "job-pools"]
  },
  "data-locality": {
    s: "Preference for running a task on the machine, rack or zone that already holds its input, to avoid moving data across the network.",
    d: "Each partition reports preferred locations: machines holding the file block, a cached copy or shuffle output. The scheduler tries levels in order: process-local, node-local, rack-local, then any, falling to a coarser level after a configurable wait. With disaggregated storage, where data lives in an object store, locality of input is mostly irrelevant but locality of cache and shuffle data still matters. It is hard because locality competes with balance, and the right wait is workload-dependent.",
    k: ["Strict locality vs balance: strict locality minimizes traffic, while relaxing it keeps all machines busy and tolerates hot spots.", "Locality to storage nodes vs locality to caches: storage locality matters with co-located disks, while cache locality matters when data is remote."],
    p: ["Hot data on a few nodes concentrates tasks there while others sit idle.", "A locality wait tuned for slow tasks stalls a workload of short ones."],
    v: "Compare a run with locality waits at zero and at three seconds on co-located storage, and confirm network read bytes and runtime differ in the expected direction, with the locality levels visible per task.",
    dep: ["task-scheduler", "block-manager", "split-planning"]
  },
  "speculative-execution": {
    s: "Launches a duplicate of a task that is running much slower than its peers, and takes whichever copy finishes first.",
    d: "The scheduler compares each running task's progress time with the median of completed tasks in its stage. When a task exceeds a multiple of the median and enough tasks have finished, it launches another attempt on a different machine. The first to finish wins and the other is killed. It masks slow disks, noisy neighbors and degraded machines. It does not help with skew, because a duplicate does the same large amount of work, and it requires tasks and their output commits to tolerate two concurrent attempts.",
    k: ["Speculate on slow tasks vs wait for them: speculation shortens the tail from machine problems, but wastes resources and can double load on an already stressed cluster.", "Aggressive thresholds vs conservative: aggressive trims the tail more but duplicates healthy tasks, while conservative rarely helps."],
    p: ["Speculating a skewed task duplicates its large input and gains nothing.", "A task with external side effects runs twice and writes duplicate output."],
    v: "Slow one machine's disk during a stage and confirm a speculative copy of its tasks launches elsewhere, the stage ends at the speculative copy's time, and the output has no duplicate records.",
    dep: ["task-scheduler", "idempotent-writes", "output-commit"]
  },
  "job-pools": {
    s: "Divides executor capacity among concurrent jobs in one application by weight and minimum share, instead of strict first-in first-out order.",
    d: "By default, jobs are scheduled in submission order, so a big job blocks small ones behind it. With fair scheduling, jobs are placed in pools, each with a weight and minimum number of cores, and the scheduler offers slots round-robin weighted by share. It enables interactive queries to run alongside large batch ones within one long-lived application. It works only among jobs that are submitted together, not across applications, and it does not preempt running tasks, so fairness is reached as tasks finish.",
    k: ["FIFO vs fair pools: FIFO maximizes throughput for the first job, while fair pools bound latency for small jobs at the cost of slowing large ones.", "Per-application pools vs cluster-level queues: pools are cheap and local, but cannot arbitrate between separate applications."],
    p: ["A long job with thousands of tasks holds all slots, so a small interactive job waits minutes without pools.", "Pool weights are set but tasks are long, so share is reached only slowly."],
    v: "Start a large job, then submit a small job in a second pool and confirm the small job's tasks start within a task duration of the minimum-share rule and finish well before the large one.",
    dep: ["task-scheduler", "queues-and-quotas"]
  },
  "gang-scheduling": {
    s: "Starts all tasks of a stage together or not at all, for work such as distributed training where tasks must communicate and run at the same time.",
    d: "Ordinary tasks are independent and can run in waves. Barrier stages require every task to be running simultaneously so they can exchange data directly and synchronize at barriers. The scheduler launches the stage only when enough slots are free for all tasks. If any task fails, the whole stage is restarted. It enables tightly coupled computation inside a batch engine, but sacrifices flexibility: it cannot run in waves, speculation is disabled, and it needs the cluster to have enough free capacity at once.",
    k: ["All-or-nothing launch vs incremental launch: all-or-nothing enables direct communication among tasks, but can wait indefinitely for capacity.", "Restart the whole stage on one failure vs fine-grained recovery: whole-stage restart is simple and correct for coupled tasks, but wastes work."],
    p: ["A barrier stage requested with more tasks than total slots never starts.", "One failed task restarts all and loses hours of tightly coupled computation."],
    v: "Submit a barrier stage requiring 32 tasks on a cluster with 16 free slots and confirm it waits rather than starting partially, then starts all 32 together when capacity is available.",
    dep: ["task-scheduler", "dynamic-allocation"]
  },
  "executor-process": {
    s: "A long-lived worker process on a cluster machine that runs tasks in parallel threads, holds cached data and shuffle output, and reports to the driver.",
    d: "Each executor registers with the driver, receives serialized tasks and runs them in a pool of threads, one per core. It hosts the memory manager, the block manager and shuffle files. It sends heartbeats and metrics, and the driver declares it lost after a timeout. Reusing one process for many tasks avoids startup cost and allows caching. It is hard because all tasks share one heap, so one task's memory use can kill the process and every other task, and garbage collection pauses of a large heap look like failures.",
    k: ["Few large executors vs many small ones: large executors share broadcast data and caches efficiently, but have longer garbage collection pauses and larger failure impact.", "Long-lived executors vs a fresh process per task: long-lived reuse caches and avoid startup, but accumulate leaks and share fate."],
    p: ["A pause from garbage collection exceeds the heartbeat timeout, and the driver marks a healthy executor dead.", "One task's memory spike kills the container and all concurrently running tasks."],
    v: "Run a job at 4, 8 and 16 cores per executor, and confirm total memory, garbage collection time and failure behavior match expectations, and that a deliberately killed executor is detected within the heartbeat timeout.",
    dep: ["task-runner", "memory-manager", "block-manager"]
  },
  "task-runner": {
    s: "The code that deserializes a task, runs its operator pipeline over one partition, and returns a result or writes shuffle output.",
    d: "A task arrives with its serialized function and partition description. The runner loads shared resources such as broadcasts, reads the input partition through an iterator, runs the pipeline, and either returns a small result, writes shuffle files or writes output. It registers memory with the manager, updates metrics and accumulators, and handles interrupts when a task is killed. It is hard because tasks are untrusted user code running inside a shared process: they can loop forever, throw, leak memory or hold threads, and the runner must contain and report all of these.",
    k: ["Cooperative kill checks vs forced thread termination: cooperative is safe, but a task in a tight native loop does not stop, while forced termination can corrupt shared state.", "Return results inline vs via storage: inline is fast for small results, while large results must go through the block store to avoid overloading the driver."],
    p: ["A task ignoring interrupts keeps running after the stage is cancelled and holds memory.", "Exceptions from deep inside user code lose the original context when serialized back to the driver."],
    v: "Cancel a job with a running infinite-loop task and confirm the task stops within the configured interrupt timeout, its memory is released, and the executor remains usable for later tasks.",
    dep: ["operator-pipeline", "execution-memory", "accumulators", "task-metrics"]
  },
  "operator-pipeline": {
    s: "A chain of operators in one task through which rows or batches flow without being materialized between steps, until a boundary forces a write.",
    d: "Within a stage, scan, filter, project and partial aggregate are composed so that each row or batch moves through all of them before the next is read. This avoids storing intermediates and keeps data in cache. Pipeline breakers, such as sorts, hash builds and shuffle writes, must consume all input before producing any output and are where memory is needed. The interface between operators determines performance: a pull model with one virtual call per row is flexible but slow, while fused code or batches amortize costs.",
    k: ["Pull-based iterators vs push-based fused code: pull is simple and composable, while push-based fused code is faster but harder to generate and debug.", "Row at a time vs batch at a time: rows are simple and low-latency, while batches amortize overhead and enable vector instructions."],
    p: ["A single pipeline breaker in the middle of a stage holds the whole partition in memory.", "Operators that buffer unexpectedly, such as a sort hidden in a window, cause spills that the plan view does not show."],
    v: "Run a scan-filter-project-aggregate stage and confirm from task metrics that peak memory stays near the aggregation state size, not the partition size, showing nothing was materialized between operators.",
    dep: ["vectorized-execution", "hash-aggregation", "external-sort"]
  },
  "vectorized-execution": {
    s: "Processes data in batches of a few thousand values per column, using tight loops that the processor can run with vector instructions and good cache use.",
    d: "Instead of one row at a time, operators receive a batch of column vectors and apply a simple kernel to each, such as comparing a column to a constant and producing a selection vector. Loops are small, have no per-row calls and can use wide vector instructions. Input from columnar files fits this directly. It is hard because it changes every operator's implementation, handles nulls and variable-length data with extra structures, and mixes poorly with row-oriented user functions, which require conversion at each boundary.",
    k: ["Vectorized batches vs row-at-a-time code generation: batches are simpler to write and tune per operator, while generation can fuse an entire pipeline into one loop.", "Large batches vs small ones: large amortize overhead, while small stay in cache and give lower latency."],
    p: ["Conversion between columnar batches and rows at every user-function boundary erases the gain.", "Batches too large for the cache cause the loop to spill out of cache and run no faster than rows."],
    v: "Run the same filter and aggregation over a columnar file with vectorization on and off and confirm identical results with substantially lower CPU time per row on the vectorized path.",
    dep: ["columnar-formats", "binary-row-format", "operator-pipeline"]
  },
  "hash-aggregation": {
    s: "Groups rows by key using an in-memory hash table that holds one running state per group, falling back to sorting when memory runs out.",
    d: "For each input row the operator finds its group's state in a hash table, and updates it in place: adding to a sum, increasing a count, tracking a maximum. At the end it emits one row per group. The table lives in execution memory, so group count times state size must fit. When it does not, the operator spills sorted partial tables and merges them, or switches to a sort-based path. It is hard because state size varies, and collecting aggregates, such as lists, grow with the data.",
    k: ["Hash-based vs sort-based aggregation: hash is faster when groups fit in memory, while sort-based uses bounded memory but sorts all input.", "Partial aggregation before the shuffle vs only after: partial cuts network volume, but costs memory on the map side and gains little for near-unique keys."],
    p: ["A collect-list aggregate over a hot key holds a very large list in memory and kills the task.", "High-cardinality keys make the hash table exceed memory and trigger repeated spilling."],
    v: "Aggregate 500 million rows by a column with ten million distinct values under a small memory limit, and confirm the job completes with spill metrics nonzero and the result matching a reference computed on a smaller sample.",
    dep: ["execution-memory", "spilling", "binary-row-format"]
  },
  "external-sort": {
    s: "Sorts data larger than memory by writing sorted runs to disk and merging them, so a task can sort any partition size.",
    d: "The sorter accumulates rows, with a prefix of the sort key stored beside a pointer for fast comparison, and sorts them in memory when the budget is reached. It writes the sorted run to a local file. At the end it merges all runs with a priority queue, producing one sorted stream. Sorting underlies sort-merge joins, windows, ordering and range partitioning. It is hard because memory is shared with other operators in the task, comparison of variable-length or complex keys is slow, and merge fan-in is limited by open file counts.",
    k: ["Sort with key prefix and pointers vs sort whole rows: prefix sorting is cache-friendly and fast, but needs tie-breaking on long keys.", "Single-pass wide merge vs multi-pass merge: single pass minimizes I/O, but needs many open files and buffers."],
    p: ["Sorting with too little memory produces thousands of tiny runs and a slow multi-pass merge.", "Sorting on a string column with long common prefixes defeats the prefix optimization."],
    v: "Sort a partition three times larger than its memory budget and confirm the output is correct and ordered, spill bytes are reported, and the number of runs matches the budget division.",
    dep: ["execution-memory", "spilling", "binary-row-format"]
  },
  "user-code-workers": {
    s: "Separate processes that run user functions written in another language, fed with data from the executor over a local channel.",
    d: "For languages that do not run in the engine's own runtime, the executor starts worker processes, sends them serialized functions and streams input rows or column batches through a pipe or socket, and reads results back. Workers may be reused across tasks to avoid startup. Moving data across the boundary is the main cost, mitigated by columnar batches. The challenge is operational: worker memory sits outside the engine's memory accounting, so a container can be killed for memory the engine never knew it used.",
    k: ["Out-of-process workers vs embedding the other runtime: separate processes isolate crashes and allow independent libraries, but pay copying and serialization for every batch.", "Reuse workers across tasks vs fresh per task: reuse avoids startup and keeps loaded libraries, but leaks state between tasks."],
    p: ["Worker memory is not counted in the executor limit, so the container is killed unexpectedly.", "A worker leaks state across reused tasks and produces results that depend on prior tasks."],
    v: "Run a job with a function that allocates 2 GB in the worker and confirm the container's memory limit accounts for it, and that a crash in the worker fails only that task and is retried.",
    dep: ["serializers", "container-overhead", "executor-process"]
  },
  "task-metrics": {
    s: "Per-task measurements of time, input and output bytes, records, shuffle volume, spill and garbage collection, reported to the driver when the task ends.",
    d: "Each task records timers and counters in a metrics object that is sent with its result. The driver aggregates them per stage, shows distributions in the UI and writes them to the event log. They support finding skew, spill, slow I/O and wasted time. They are also what adaptive execution and autoscaling read. They are cheap, but can mislead: wall time includes waiting for locks and fetches, garbage collection time is attributed to whoever was running, and metrics from failed or speculative attempts need separate handling.",
    k: ["Fine-grained per-task metrics vs coarse totals: fine-grained shows outliers, but increases result size and driver memory at a large task count.", "Metrics sent with the result vs streamed during execution: with-result is simple, while streaming allows live progress and detection of stuck tasks."],
    p: ["Adding up task times as if they were wall time overstates cost for parallel work.", "Metrics from failed attempts are dropped, hiding the wasted work."],
    v: "Run a stage with known input size and confirm the sum of per-task input bytes equals the file size, shuffle write equals total shuffle read in the next stage, and a forced spill appears in the spill metric.",
    dep: ["task-runner"]
  },
  "partitioner": {
    s: "The function that decides which output partition each row belongs to, based on a hash or range of its key.",
    d: "A hash partitioner computes a hash of the key modulo the partition count, spreading keys evenly if the hash is good. A range partitioner uses sampled boundaries so each partition holds a contiguous key range, which is needed for global ordering. Custom partitioners can place related keys together. Rows with equal keys always go to the same partition. If two datasets use the same partitioner and count, joining them needs no shuffle. The risk is imbalance: popular keys, and the number of partitions itself, determine task size.",
    k: ["Hash vs range partitioning: hash balances load for varied keys and is cheap, while range gives ordered output but needs sampling and can be unbalanced.", "Reuse an existing partitioner vs repartition: reuse skips a shuffle, but requires both sides to agree exactly on function and count."],
    p: ["Hashing a key with low entropy sends most rows to a few partitions.", "Range boundaries sampled from too few rows put half the data into a single partition."],
    v: "Partition a dataset by hash and range, then compare partition sizes: confirm hash sizes are within a small factor of each other and range partitions are ordered and non-overlapping.",
    dep: ["partition-count"]
  },
  "partition-count": {
    s: "The number of partitions at each stage, which sets the parallelism, the size of every task and the number of shuffle blocks.",
    d: "Input partitions come from file splits. Shuffle outputs have a configured or adaptive number. Too few partitions produce large tasks that spill or fail and leave cores idle; too many make tasks tiny, overwhelm the scheduler, and multiply shuffle blocks as mappers times reducers. A common target is partition sizes in the low hundreds of megabytes, and two to four tasks per core. The right number changes with data volume, so a fixed default tuned for a test dataset is wrong in production.",
    k: ["Fixed default vs derived from input size: fixed is predictable but wrong whenever data volume changes, while derived adapts but changes between runs.", "More partitions for parallelism vs fewer for lower overhead: more partitions even out stragglers, but shuffle block count grows with the product of both sides."],
    p: ["A default of 200 partitions applied to 10 TB gives 50 GB tasks that spill and fail.", "A million small shuffle partitions create trillions of blocks and the shuffle service stalls."],
    v: "Run a shuffle at 50, 500 and 5,000 partitions and confirm the median task size falls proportionally, while total runtime is lowest at the setting giving 100 to 200 MB tasks.",
    dep: []
  },
  "shuffle-write": {
    s: "The map side of a shuffle: each task partitions its output by target reducer, serializes it and writes it to local disk.",
    d: "As a map task produces rows, it assigns each to a reducer partition, buffers them in memory and spills sorted or grouped chunks to disk when the budget is full. At the end it merges chunks into one data file with an index of byte ranges per reducer, and registers the output location with the driver. Optional compression and map-side combining cut volume. It is hard because it creates a lot of disk I/O and file metadata, and because the files must outlive the task so reducers can fetch them.",
    k: ["Sort-based shuffle with one file per task vs hash-based with one file per reducer: one file per task scales with fewer files, while per-reducer files are simpler but create mappers times reducers files.", "Compress shuffle output vs not: compression cuts network and disk bytes, but spends CPU, which dominates on fast networks."],
    p: ["A map task with a huge number of reducers keeps one buffer per reducer and runs out of memory.", "Local disks fill with shuffle files from long jobs and kill tasks with disk-full errors."],
    v: "Run a shuffle and confirm each map task produces exactly one data file and one index file, the index byte ranges sum to the file size, and total write bytes match the next stage's read bytes.",
    dep: ["partitioner", "spilling", "shuffle-file-layout", "serializers"]
  },
  "shuffle-fetch": {
    s: "The reduce side of a shuffle: each task requests its slice from every map output over the network, then merges the pieces it receives.",
    d: "A reduce task asks the driver where its input blocks are, then issues fetch requests to many remote servers in parallel, limiting bytes in flight and concurrent connections. Small blocks are batched, and blocks that fit in memory are kept there, while large ones stream to disk. Data is decompressed and merged or aggregated. It is hard because every reducer talks to every mapper, so connection counts and tiny random reads become the bottleneck at scale, and any unreachable mapper causes a fetch failure that the scheduler must handle.",
    k: ["Limit bytes in flight vs fetch as fast as possible: limiting protects memory and the network, but caps throughput on fast links.", "Fetch remotely from executors vs from a dedicated shuffle service: executor-hosted is simple, but a busy or dead executor stalls reducers."],
    p: ["Fetching millions of tiny blocks makes the job dominated by round trips.", "A reducer reading a block into memory without a size check causes out-of-memory on a large block."],
    v: "Run a shuffle with 1,000 mappers and reducers and confirm fetch wait time is a small share of task time, remote bytes read match the written totals and no task holds more than the in-flight limit in memory.",
    dep: ["shuffle-write", "shuffle-file-layout", "external-shuffle-service"]
  },
  "shuffle-file-layout": {
    s: "How shuffle output is arranged on disk: a data file per map task with an index file giving each reducer's byte range.",
    d: "A map task writes its partitioned output sequentially into one data file ordered by reducer, and a small index file records the offsets. A reducer's request becomes a seek and a sequential read of one range. This keeps file count at the number of map tasks rather than mappers times reducers. Files live in local directories spread across disks and are deleted when the application ends or the data is no longer referenced. The layout is hard to change because the shuffle service, recovery and the cleanup logic all depend on it.",
    k: ["One data file with an index vs file per reducer: one file scales to many reducers with sequential reads, but needs an index and careful concurrent access.", "Local disks vs remote storage for shuffle files: local is fast, while remote survives machine loss at the cost of latency and bandwidth."],
    p: ["Cleanup tied to application end lets long-running applications accumulate shuffle files until disks fill.", "Spreading files across disks without balancing leaves one disk full while others are idle."],
    v: "After a shuffle stage, list the local directories and confirm one data file and one index file per map task, with the index's final offset equal to the data file's length.",
    dep: ["shuffle-write"]
  },
  "external-shuffle-service": {
    s: "A long-running server on each machine that serves shuffle files independently of the executors that wrote them.",
    d: "Normally executors serve their own shuffle files, so when an executor exits, its files vanish. A separate service on the node, with access to the same directories, serves them instead. Executors can then be released while their output remains available, which is essential for dynamic allocation. It also offloads fetch handling from executors. It must be deployed and upgraded with the cluster, is shared by all applications on the node and still loses data if the machine itself fails.",
    k: ["Separate service vs executor-served shuffle: a service lets executors leave without losing data, but is another component to deploy, secure and keep compatible.", "Per-node service vs remote shuffle cluster: per-node is simple and local, while a remote cluster survives node loss but adds network hops."],
    p: ["Version mismatch between service and application breaks fetch for only some applications.", "Files of finished executors accumulate with no owner to remove them until the application ends."],
    v: "Remove an idle executor after its map stage and confirm reducers still fetch its output through the node service, with no stage resubmission and no fetch failures in the log.",
    dep: ["shuffle-file-layout", "shuffle-fetch"]
  },
  "map-side-combine": {
    s: "Partially aggregates rows by key inside each map task before the shuffle, so far fewer rows are written and sent.",
    d: "For associative and commutative aggregations such as sum, count, min and max, each map task keeps a hash table of partial results by key and emits one partial row per key per task instead of every input row. Reducers merge the partials. For repeated keys the shuffle volume drops by orders of magnitude. It does not apply to operations that need all values, such as a median or collect, and it wastes memory and CPU when keys are mostly unique, so engines may switch it off adaptively.",
    k: ["Combine before the shuffle vs shuffle raw rows: combining reduces network and disk volume sharply for repeated keys, but costs memory and gains nothing for unique keys.", "Fixed-size combine table that flushes when full vs unbounded: flushing bounds memory but may send multiple partials per key."],
    p: ["Combining unique keys doubles the work with no volume reduction.", "A non-associative user-supplied function gives different results depending on how rows were grouped into partials."],
    v: "Sum a column grouped by a key with 1,000 values over a billion rows and confirm shuffle write is on the order of tasks times 1,000 rows, not a billion, with identical totals to the uncombined run.",
    dep: ["hash-aggregation", "shuffle-write"]
  },
  "skew-handling": {
    s: "Splits oversized partitions or hot keys across several tasks, or replicates the small side of a join, so no single task dominates a stage.",
    d: "After a shuffle, the engine compares each partition's size to the median. An oversized partition in a join is split into several sub-partitions, each joined with a full copy of the matching other-side partition. In user code, salting appends a random suffix to a hot key and aggregates in two steps. Broadcasting avoids shuffling the large side at all. The approaches are limited: splitting works for some join types but not full outer joins, and an aggregate on a single hot key still needs a combining step.",
    k: ["Automatic run-time splitting vs manual salting: automatic needs no code change but covers only some join shapes, while salting works anywhere but complicates queries.", "Isolate hot keys in a separate plan vs treat all keys alike: isolation handles known hot values efficiently, but needs knowing them in advance."],
    p: ["Salting a key but forgetting to un-salt in the second aggregation gives partial results.", "Splitting a skewed partition replicates the opposite side, which becomes the new bottleneck when it is also large."],
    v: "Join on a column with one key holding 20% of the rows, and confirm the stage's maximum task duration falls to within about twice the median with skew handling enabled, and the output matches the unsplit run.",
    dep: ["adaptive-execution", "partitioner", "join-algorithms"]
  },
  "partition-coalescing": {
    s: "Merges many small adjacent shuffle partitions into fewer, larger ones after measuring their actual sizes, so the next stage runs sensible task sizes.",
    d: "A fixed shuffle partition count is usually too high for small data and too low for large data. After map output sizes are known, the adaptive layer groups adjacent reducer partitions until each group reaches a target size, and launches one reduce task per group. This removes thousands of tiny tasks and files at no loss of correctness. It cannot go below parallelism needed for other reasons and does not split large partitions on its own; that is the skew handler's job.",
    k: ["Coalesce adjacent partitions vs leave the configured count: coalescing right-sizes tasks automatically, but reduces parallelism and the plan differs from the static one.", "Target size set high vs low: high produces fewer larger tasks with less overhead, while low keeps more parallelism and less memory per task."],
    p: ["Coalescing leaves a stage with fewer tasks than cores, wasting the cluster.", "Output file counts change with coalescing, surprising downstream consumers that expected fixed files."],
    v: "Run an aggregation producing 200 default shuffle partitions of a few kilobytes each and confirm the reduce stage runs a handful of tasks of the target size, with the same output rows.",
    dep: ["adaptive-execution", "partition-count"]
  },
  "bucketing": {
    s: "Pre-partitions a table by a key into a fixed number of files at write time, so later joins and aggregations on that key need no shuffle.",
    d: "When writing a table, rows are hashed by the bucket column into a set number of buckets, and each task writes sorted files per bucket. A later join between two tables bucketed on the same key and count can match bucket i to bucket i directly, with no shuffle on either side. Aggregations on the key can also skip the exchange. The cost moves to write time and to rigidity: bucket count and column are fixed, both tables must agree, and any change requires rewriting the data.",
    k: ["Pay the shuffle once at write time vs at every read: bucketing amortizes across many joins, but taxes ingestion and locks the layout.", "Few large buckets vs many small ones: few keep file counts low but limit parallelism, while many raise parallelism but create small files."],
    p: ["Different bucket counts on the two tables silently disable the optimization and shuffle both sides.", "Changing the hash function between writer versions mismatches buckets and yields wrong join results."],
    v: "Join two tables bucketed identically on the join key and confirm the physical plan has no exchange on either side, and runtime and shuffle bytes drop against the unbucketed version.",
    dep: ["partitioner", "output-writers", "metastore-catalog"]
  }
});
