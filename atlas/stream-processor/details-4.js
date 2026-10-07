// Details for the stream processor plate, part 4: snapshots, recovery, cluster control, observability.
ATLAS.details("stream-processor", {
  "checkpoint-coordinator": {
    s: "The job-level component that triggers snapshots on a schedule, collects acknowledgments from every task, and declares a checkpoint complete only when all state handles are durable.",
    d: "At each interval the coordinator checks that all tasks are running and no limit is exceeded, assigns a checkpoint id, and asks the sources to inject barriers. Tasks acknowledge with handles to their uploaded state. When every task has acknowledged, the coordinator writes a metadata record, marks the checkpoint complete and notifies tasks so sinks can commit. A checkpoint that exceeds its timeout or is declined is aborted. It limits concurrency and enforces a minimum pause between checkpoints. It is a single process per job, so its speed bounds how many tasks it can manage.",
    k: ["Short interval vs long: short intervals mean less replay and lower commit latency for transactional sinks, but more overhead and more load on storage.", "Failing the job on checkpoint failure vs tolerating a few failures: strict failure keeps recovery points fresh, tolerance rides out transient storage errors."],
    p: ["A timeout shorter than the real snapshot duration under load makes every checkpoint fail while the job looks healthy.", "A coordinator handling tens of thousands of tasks becomes the bottleneck of the job."],
    v: "Watch the checkpoint history for an hour: each checkpoint should show start, end-to-end duration, size and every task's acknowledgment, and a task killed mid-checkpoint must cause that checkpoint to be aborted, not completed.",
    dep: ["barrier-injection", "checkpoint-storage", "job-master"]
  },
  "barrier-injection": {
    s: "Sources insert numbered barrier markers into their streams at the instant the coordinator requests a snapshot, splitting each stream into records before and after the snapshot.",
    d: "When a source receives a trigger for checkpoint n, it records its current read position in state and emits barrier n to all outputs, in order with the data. Everything emitted before the barrier belongs to the snapshot and everything after belongs to the next. Barriers flow through the graph like records, and each operator snapshots when the barrier passes. Because they travel in the data channels, they are delayed by backpressure. Injection must happen at a point where the source's position and emitted data agree.",
    k: ["Barriers in the data stream vs a stop-the-world pause: no global pause and a consistent cut, but barrier latency equals data latency under load.", "Sources decide the injection moment vs coordinator timing: injecting at record boundaries keeps position consistent, but the coordinator cannot control exact timing."],
    p: ["Heavy backpressure delays barriers so far that checkpoints time out, even though nothing failed.", "A source recording its position out of step with emitted records produces a snapshot that loses or repeats data."],
    v: "Trigger a checkpoint and log at one source: the stored position must equal the offset of the last record emitted before the barrier, and the record after the barrier must be the next offset.",
    dep: ["checkpoint-coordinator", "split-readers", "replayable-offsets"]
  },
  "barrier-alignment": {
    s: "A task with several inputs waits until it has received barrier n on every input before snapshotting, holding back faster inputs so the snapshot reflects a consistent cut.",
    d: "When barrier n arrives on one input channel, the task blocks that channel, because records behind it belong after the snapshot. Other channels continue until their barriers arrive. Once all have arrived, the task snapshots its state, forwards the barrier and unblocks. This keeps exactly-once state semantics without recording in-flight data. The cost is waiting: blocked channels stop and cause backpressure, so skew in arrival times between inputs lengthens alignment. Exactly-once mode requires it, at-least-once skips it.",
    k: ["Aligned barriers vs at-least-once without alignment: aligned gives exact state with no in-flight data stored, while skipping lowers latency and may double count after recovery.", "Blocking input channels vs spilling their data: blocking is cheap and bounded by the skew, but it adds backpressure."],
    p: ["A single slow upstream channel stalls alignment so the whole task idles, and the checkpoint takes minutes.", "Alignment under backpressure becomes a feedback loop that makes later checkpoints slower too."],
    v: "Delay one of two inputs by thirty seconds and take a checkpoint: the alignment duration metric must be thirty seconds, the faster input must show backpressure, and the snapshot must still restore exactly.",
    dep: ["input-gates", "barrier-injection", "snapshot-async-phase"]
  },
  "unaligned-checkpoints": {
    s: "Barriers overtake queued data and the in-flight buffers become part of the snapshot, so checkpoints complete quickly even under heavy backpressure, at the cost of larger snapshots.",
    d: "When the first barrier reaches a task's input, the task forwards it immediately to the outputs ahead of queued buffers, then snapshots its state together with the input and output buffers that the barrier jumped over. On restore, those buffers are replayed into the pipeline. This removes alignment waiting, so checkpoint time no longer depends on backpressure. Snapshots grow with the amount of in-flight data and so with buffer sizes. Records may be reordered across the overtaken region, which limits it to operators that tolerate it. Often it is enabled only after an alignment timeout.",
    k: ["Unaligned vs aligned: finishes under backpressure and keeps recovery points fresh, but stores in-flight data, so snapshots grow and writes increase.", "Switch to unaligned after a timeout vs always unaligned: pay the cost only when alignment is slow, but behavior varies between checkpoints."],
    p: ["Large buffers or high parallelism make each snapshot gigabytes of in-flight data and slow the job.", "Changing serializers or buffer formats between versions makes in-flight data in an old snapshot unreadable."],
    v: "Create heavy backpressure and compare: aligned checkpoints must time out or take minutes while unaligned ones finish in seconds with a larger size, and a restore from an unaligned one must give the same results as a failure-free run.",
    dep: ["barrier-alignment", "network-buffer-pool", "input-gates"]
  },
  "snapshot-async-phase": {
    s: "Splits a snapshot into a short synchronous step that captures a consistent view of state and a background step that uploads it, so processing resumes almost immediately.",
    d: "On a barrier, the task thread briefly captures the state: the in-memory backend makes a copy-on-write view, the embedded store takes a point-in-time reference to its immutable files. The task then forwards the barrier and keeps running. A background thread serializes and uploads the captured data to durable storage, and acknowledges to the coordinator when done. The synchronous part is proportional to what must be copied, not to state size. The upload competes for network and disk with normal processing.",
    k: ["Short sync capture with async upload vs fully synchronous: the task is paused only briefly, but extra memory or disk is held until upload ends.", "Upload parallelism high vs low: faster uploads shorten checkpoints, but can saturate network and slow the data path."],
    p: ["Copy-on-write retention doubles memory for write-heavy state while a slow upload runs.", "Uploads share bandwidth with shuffles and make processing latency spike at every checkpoint."],
    v: "Time the synchronous phase and the whole checkpoint for a large state: the synchronous part must be milliseconds while the total can be minutes, and record processing must continue throughout.",
    dep: ["state-backend-interface", "checkpoint-storage"]
  },
  "incremental-checkpoints": {
    s: "Upload only the state files created since the previous checkpoint and reference the unchanged ones, so checkpoint cost scales with change rate and not total state size.",
    d: "The embedded store writes immutable sorted files. At a checkpoint, the backend lists its current files, uploads those not already in durable storage, and records a manifest referencing both new and old files. Old files are reference-counted and deleted when no retained checkpoint uses them. Compaction creates new files from old ones, which then are uploaded as well. Restore downloads every file in the manifest. It makes large-state checkpoints practical, but a restore needs the whole chain of files and cleanup becomes complicated.",
    k: ["Incremental vs full snapshots: cost follows the churn and not the size, but restoring needs many shared files and failures in cleanup leak storage.", "Aggressive compaction vs less: compaction reduces the restore size, but rewrites files so each checkpoint uploads more."],
    p: ["A deleted shared file still referenced by a retained checkpoint makes that checkpoint unrestorable.", "Heavy compaction churn makes incremental checkpoints almost as large as full ones."],
    v: "Run a job with 500 GB state and a small change rate: incremental checkpoints should upload megabytes after the first one, and a restore from the latest must read the referenced files and match the live state.",
    dep: ["embedded-kv-backend", "checkpoint-storage", "checkpoint-retention"]
  },
  "checkpoint-storage": {
    s: "The durable location, a distributed file system or object store, where snapshot data and metadata are written so that any new worker can read them after a failure.",
    d: "Tasks upload state files directly to the storage under a directory per job and checkpoint id. Small state may be embedded inside the metadata record to avoid tiny files. The coordinator writes a final metadata file, atomically, to mark the checkpoint complete. The storage must be reachable from every worker, durable beyond the cluster and consistent for listing and renames. Its throughput and request limits decide checkpoint duration. Object stores with eventual consistency or rate limits need care in file layout.",
    k: ["Remote durable storage vs local disk: survives machine loss and allows any worker to restore, but upload speed limits snapshot time.", "Many small files vs few larger files: small files parallelize uploads but hit request limits, larger files reduce request counts but delay completion."],
    p: ["Request rate limits on the object store throttle uploads and produce checkpoint timeouts at scale.", "Metadata written non-atomically leaves half-complete checkpoints that look valid."],
    v: "Kill the whole cluster after a completed checkpoint and start a new one pointed at the storage: the job must restore from the metadata file alone and continue with consistent state.",
    dep: ["checkpoint-coordinator"]
  },
  "checkpoint-retention": {
    s: "Policies for how many completed checkpoints to keep, when older ones are deleted, and whether the latest is kept when the job is cancelled.",
    d: "After a new checkpoint completes, the coordinator subsumes older ones beyond the retention count, deleting their files unless shared with newer checkpoints. Retaining more than one lets operators fall back if the latest is corrupt. On cancellation, the policy decides whether to keep the last checkpoint for manual restore, and on failure it is always kept. Retained checkpoints are owned by the engine or by the user depending on mode, which decides who must delete them. The risk is orphaned data that is never cleaned and grows quietly.",
    k: ["Keep several checkpoints vs only the latest: a fallback if the newest is damaged, but more storage and slower cleanup.", "Engine-owned vs user-owned retained checkpoints: engine ownership cleans up automatically, user ownership allows long-term reuse and needs manual deletion."],
    p: ["Retained checkpoints kept after cancel are never deleted and storage costs grow for months.", "Deleting a checkpoint directory by hand removes files that newer incremental checkpoints share."],
    v: "Run with retention of three and complete five checkpoints: only the last three must remain in storage, and files shared by them must not have been deleted.",
    dep: ["checkpoint-coordinator", "incremental-checkpoints"]
  },
  "savepoints": {
    s: "A user-triggered snapshot in a portable format, designed for planned operations: upgrade, rescale, migrate and fork a job, never deleted automatically.",
    d: "A savepoint is a checkpoint that is always full and self-contained, written in a canonical format independent of the backend, and owned by the user. It is triggered through the client, optionally with a stop of the job so no records are processed after the snapshot, which gives a clean handover with no replay. The new job version starts from it, mapping state by operator identity. Savepoints are slower and larger than incremental checkpoints and are used infrequently. Their key value is portability across backends and program versions.",
    k: ["Portable full format vs backend-native incremental: restoring across versions and backends works, but the cost grows with total state.", "Stop-with-savepoint vs savepoint then cancel: stopping gives exactly-once handover with no gap, while separate commands can reprocess a window of data."],
    p: ["A savepoint taken without stopping the job, then restored later, reprocesses records and commits duplicates in non-idempotent sinks.", "Savepoints deleted with the cluster or storage are not found when the upgrade needs them."],
    v: "Stop a job with a savepoint, start a modified version from it, and compare the sink: the output must continue without gap or duplicate at the handover point.",
    dep: ["checkpoint-coordinator", "operator-uids", "checkpoint-storage"]
  },
  "offline-state-processing": {
    s: "Reads, modifies and writes snapshots as ordinary datasets with a batch program, to inspect state, bootstrap it from history or repair it, without a running streaming job.",
    d: "A library exposes the contents of a savepoint as tables or datasets: for each operator uid and state name, entries by key. A batch program can read, join, filter and write a new savepoint, including creating state for an operator from scratch. This allows bootstrapping a new stateful job from historical data and fixing corrupt state. It depends on knowing the state's types and names, and on an unchanged key-group scheme. It is a powerful but sharp tool because mistakes only appear when the job starts.",
    k: ["Offline rewrite of state vs reprocess history through the job: much faster for backfill, but the author must reproduce the logic by hand and keep it consistent.", "Reading with the job's own classes vs a generic reader: exact semantics, but requires the job's code and versions."],
    p: ["A bootstrapped state that differs subtly from what the live job would build produces wrong results for months.", "Writing state with a different max parallelism makes the savepoint unrestorable."],
    v: "Read a savepoint's keyed state into a table, count entries per key and compare with the live job's state metrics; then write a modified savepoint and confirm the job starts from it with the edit visible.",
    dep: ["savepoints", "state-schema-evolution", "key-groups"]
  },
  "failure-detection": {
    s: "Notices dead tasks and workers through exceptions, missed heartbeats and lost connections, then reports them to the coordinator so recovery can begin.",
    d: "A task failure is reported directly with its exception. Worker and coordinator processes exchange periodic heartbeats; missing them for a timeout marks the peer dead. The cluster manager may also report container loss. The timeout trades fast detection against false positives caused by long pauses or network stalls. Distinguishing a slow worker from a dead one is impossible in general, so the system declares it dead and fences its output. Failures are classified, for example as user errors or infrastructure errors, to drive restart policy.",
    k: ["Short heartbeat timeout vs long: fast recovery from real failures, but long garbage pauses or network blips trigger needless restarts.", "Classifying failures vs restarting for all: user errors can stop retrying early, but classification needs reliable signals."],
    p: ["A heartbeat timeout shorter than a full garbage collection pause restarts healthy workers repeatedly.", "A zombie worker that was declared dead keeps writing to a sink."],
    v: "Freeze a worker process for longer than the heartbeat timeout: the coordinator must mark it lost, release its slots and restart affected tasks, and the revived process must be refused further work.",
    dep: ["job-master", "task-manager"]
  },
  "failover-regions": {
    s: "Restarts only the connected group of tasks affected by a failure, rather than the entire job, when the data exchanges between groups allow it.",
    d: "The execution graph is split into regions, sets of tasks connected by pipelined edges. When a task fails, its whole region must restart together since pipelined consumers hold partial data. Other regions continue if their inputs are unaffected. For embarrassingly parallel jobs, each region is a single pipeline and a failure costs one pipeline. For jobs with all-to-all shuffles, the whole job is one region. Blocking exchanges separate regions and let finished upstream results be reused.",
    k: ["Region restart vs whole-job restart: far less disruption for independent pipelines, but regions require exchange boundaries that exist only in some graphs.", "Restoring regional state from the checkpoint vs full state: only the failed region reads storage, but consistency with exactly-once sinks needs coordination."],
    p: ["Assuming one failure restarts one task when an all-to-all shuffle makes the whole job a single region.", "Restarting one region while others keep committing output can break transactional sinks that span regions."],
    v: "Kill one task in a job of eight independent pipelines: only that pipeline's tasks should restart, the other seven should keep their processed counts rising, and output should remain correct.",
    dep: ["execution-graph", "result-partitions", "restart-strategies"]
  },
  "restart-strategies": {
    s: "Policies controlling whether and when a failed job or region restarts: fixed delay, exponential backoff, failure-rate window or no restart.",
    d: "After a failure is detected, the strategy decides to restart after a delay, or to fail the job permanently. Fixed delay allows a number of attempts. Exponential backoff increases the wait up to a ceiling and resets after a stable period. Failure-rate limits restarts within a time window. The delay gives external systems time to recover and avoids hot-loops. A job that always fails on the same record will exhaust any policy, so the real fix is outside of it. The choice shapes the behavior on transient faults and poison input.",
    k: ["Exponential backoff vs fixed delay: avoids overloading a recovering dependency, but extends downtime on short outages.", "Unlimited retries vs bounded: unlimited keeps the job alive through long outages, bounded surfaces permanent faults to an operator."],
    p: ["A poison record makes the job restart in a loop forever while consumer lag grows.", "Immediate restarts hammer a database that is the reason for the failure."],
    v: "Make a dependency fail for a minute: with backoff the restart attempts should spread out and then resume normal operation after recovery, and with a bounded fixed delay the job must go to failed state after the set number of attempts.",
    dep: ["failure-detection", "job-master"]
  },
  "rescaling": {
    s: "Changing the parallelism of a running job by snapshotting, redistributing key groups and operator state, and restarting at the new size.",
    d: "Parallelism is changed by taking a savepoint or checkpoint, stopping the job, and starting it with a new parallelism. During restore, every new instance reads the key-group ranges it now owns from the snapshot and receives its share of operator state. The job is unavailable for the duration. Adaptive scheduling can do this automatically as resources change. Limits are the max parallelism, source partition count, and the time to read state, which grows with its size. Rescaling an unbalanced job may not help if the bottleneck is a hot key.",
    k: ["Stop-and-restore rescaling vs live repartitioning: simple and correct with any state, but needs downtime proportional to restore time.", "Scale on metrics automatically vs by operator: reacts to load, but restarts can cause oscillation if thresholds are tight."],
    p: ["Scaling above the number of source partitions leaves extra tasks idle.", "Frequent automatic rescaling with a large state spends more time restoring than processing."],
    v: "Rescale from 4 to 8 and back under load: the job must resume with identical per-key results, throughput should rise after scale-up, and downtime should match the state read time measured at restore.",
    dep: ["key-groups", "operator-state", "savepoints", "parallelism-and-max-parallelism"]
  },
  "local-recovery": {
    s: "Keeps a copy of each task's latest snapshot on its worker's local disk, so after a restart on the same worker state loads from disk and not over the network.",
    d: "While uploading a snapshot to durable storage, the task also keeps the local copy. When a task restarts on the same worker, it restores from that copy, which avoids downloading the full state. If the worker was lost, restore falls back to remote storage. The scheduler tries to place tasks back on their previous workers when this is enabled. It reduces recovery time for large state at the cost of local disk space and sticky scheduling constraints.",
    k: ["Local copies with sticky scheduling vs remote-only restore: much faster recovery for large state, but extra disk and less scheduling freedom.", "Keep local copies for the latest checkpoint only vs several: less disk, but a fallback to remote if the latest was not completed."],
    p: ["Sticky placement waits for a specific worker that never returns, delaying recovery.", "Local copies of discarded checkpoints are not cleaned, filling the disk."],
    v: "Kill and restart a task on the same worker with 100 GB state, then compare recovery time with remote restore: the local one should be many times faster and use no network reads from storage.",
    dep: ["incremental-checkpoints", "scheduler", "task-manager"]
  },
  "savepoint-upgrades": {
    s: "The procedure for deploying a new version of a job: stop with a savepoint, start the new code from it, and rely on operator identity and state compatibility to carry state over.",
    d: "A planned change stops the old job with a savepoint, so no output is produced after the snapshot. The new program is submitted pointing to that savepoint. State is matched to operators by identity, so unchanged operators keep their state, new ones start empty, and removed ones' state is dropped or rejected by policy. Types must be compatible or migratable. This allows logic changes, parallelism changes and bug fixes. Not all changes are possible: altering key types, state names or the keying of an operator breaks state.",
    k: ["State carried across versions vs reprocessing from scratch: preserves months of history and gives continuity, but constrains what code changes are allowed.", "Strict check for unmatched state vs allowing it to be dropped: strict catches mistakes, permissive makes intentional removals easy."],
    p: ["Renaming or reordering an operator without a stable identity loses its state silently on restore.", "Changing the key selector of a stateful operator leaves state under the wrong keys."],
    v: "Stop a running job with a savepoint, change the logic of one stateless operator, restore: all stateful counters must carry on unchanged, and the sink must show no gap or overlap at the handover.",
    dep: ["savepoints", "operator-uids", "state-schema-evolution"]
  },
  "operator-uids": {
    s: "Stable, explicit identifiers assigned to stateful operators so snapshot state can be matched to the right operator after the program changes.",
    d: "If no identifier is set, the system generates one from the graph structure, so adding, removing or reordering operators changes the generated ids and state no longer matches. With an explicit uid, an operator's state is identified by it regardless of position. The uid is stored in every snapshot. Setting uids on all stateful operators is a basic discipline for any job meant to be upgraded. Names used for display are separate and can be changed freely.",
    k: ["Explicit uids vs generated ids: state survives refactoring, but authors must set and never change them.", "Hash-based uid from structure vs author-chosen: generated is zero effort and breaks easily, authored is stable and requires convention."],
    p: ["Copying an operator and keeping its uid makes two operators claim the same state.", "Leaving uids unset on a stateful operator is only discovered at the first upgrade."],
    v: "Reorder two stateful operators in the program and restore from a savepoint: with explicit uids each operator must find its own state, and without them the restore must fail or mismatch.",
    dep: ["stream-graph", "savepoint-upgrades"]
  },
  "dispatcher": {
    s: "The cluster entry point that accepts job submissions, starts a job master for each job, keeps the list of running and finished jobs, and serves the control interface.",
    d: "The dispatcher receives the packaged job graph over the control interface, persists it so it can be recovered, and spawns a job master. It tracks job status, exposes operations such as cancel, savepoint and status, and keeps archived results for finished jobs. In high-availability setups, a dispatcher is elected leader and standbys wait; on takeover the new leader recovers submitted jobs from the persisted graphs. In some deployment modes, there is one per cluster, in others one per job.",
    k: ["Shared dispatcher for many jobs vs per-job cluster: better utilization and fast submission, but jobs share a failure domain and control plane.", "Persisting job graphs vs holding in memory: recovery after dispatcher failure, at the cost of storage and cleanup."],
    p: ["A crash between accepting and persisting a job loses it while the client believes it was submitted.", "Too many concurrent submissions overload the single leader."],
    v: "Submit a job, kill the leading dispatcher, and observe the standby: it must take over, find the job in the recovered list and keep it running without resubmission.",
    dep: ["job-master", "high-availability-services"]
  },
  "job-master": {
    s: "The per-job coordinator that deploys tasks, tracks their state, triggers checkpoints, reacts to failures, and talks to the resource manager for slots.",
    d: "One job master exists for each running job. It builds the execution graph from the job graph, requests slots, deploys tasks to workers, and tracks their state changes. It runs the checkpoint coordinator and the failover logic, and holds the split enumerators of sources. All events are processed on a single main thread to avoid races. Heartbeats with each worker and with the resource manager detect loss. It is a single point for the job, so its memory and event load limit job size, and its failure must be recoverable.",
    k: ["Job master per job vs shared coordinator: isolation and independent failure, but extra processes and memory per job.", "Single-threaded event loop vs concurrent handling: simple, race-free logic, but large jobs queue events behind slow handlers."],
    p: ["Heavy checkpoint or enumerator work on the main thread delays failure handling.", "A very large job exhausts the job master's heap and loses all progress tracking."],
    v: "Run a job with ten thousand tasks and kill a worker: the job master must detect it, restart affected tasks within the configured time, and its event queue length metric should stay near zero.",
    dep: ["execution-graph", "scheduler", "checkpoint-coordinator", "slot-pool"]
  },
  "execution-graph": {
    s: "The job master's runtime model: one vertex per parallel task instance with state, attempt history, assigned slot and the partitions that connect them.",
    d: "Expanding each job graph vertex by its parallelism creates one execution vertex per task, and each connection becomes a set of partitions and edges. Every vertex records its state, from created through scheduled, deploying, running and finished, plus failed attempts and the slot used. The scheduler and failover logic read and update this structure. It also defines pipelined regions. Its size is the product of parallelisms and edges, so very wide all-to-all jobs make it large and slow to build.",
    k: ["Materializing every parallel instance vs lazy expansion: simple tracking and precise state, but memory grows with parallelism and edge count.", "Keeping attempt history vs only the current attempt: history aids debugging, but costs memory in long-running jobs with many restarts."],
    p: ["An all-to-all edge between very wide stages makes the graph enormous and slows startup and failover.", "Unbounded retention of failed attempts leaks memory in flapping jobs."],
    v: "Inspect the job in the status interface: the vertex count must equal the sum of parallelisms, every task must show its current attempt and slot, and a restart must increment the attempt number.",
    dep: ["job-graph", "failover-regions"]
  },
  "scheduler": {
    s: "Decides when each task is deployed and where, in dependency order for batch and all at once for streaming, honoring slot sharing, locality and region boundaries.",
    d: "For streaming, all pipelined regions are scheduled together once enough slots exist, since the tasks run simultaneously. For batch, regions are scheduled when their inputs are complete, so stages run in sequence. It requests slots, assigns tasks to them respecting sharing groups, and prefers placing a task where its state or input already is. On failure it reschedules the affected region. Hard parts are waiting for resources, deadlock when slots are partially acquired, and speculative execution for slow batch tasks.",
    k: ["Gang scheduling a whole region vs task-by-task: avoids deadlock and partial pipelines, but waits for all resources before starting anything.", "Locality preference vs fastest placement: local state and data cut network and recovery cost, but waiting for the preferred worker delays start."],
    p: ["Acquiring part of the needed slots and waiting for the rest wastes resources, and a competing job can deadlock the cluster.", "Strict locality waits for a lost worker."],
    v: "Submit a job needing 16 slots on a cluster with 10: it must stay in a waiting state with a resource shortage reason, then start all tasks at once when workers are added.",
    dep: ["execution-graph", "slot-pool", "failover-regions"]
  },
  "adaptive-scheduler": {
    s: "Starts a job with whatever resources are available and adjusts parallelism up or down as workers join or leave, instead of failing when the requested resources are missing.",
    d: "Instead of requiring a fixed number of slots, the job declares a range of acceptable resources. The scheduler waits for a minimum, picks the highest parallelism the slots allow, and builds the execution graph accordingly. When resources change, it checkpoints, stops and rescales within the allowed range, subject to a stabilization delay. It enables autoscaling and graceful handling of lost workers. The cost is restarts, which for large state take time, and key-group limits on how much it can scale.",
    k: ["Elastic parallelism vs fixed: tolerates resource changes and supports autoscaling, but every change is a restart.", "Short stabilization delay vs long: reacts quickly to capacity, but flapping resources cause repeated restarts."],
    p: ["Autoscaling loops where each rescale restores slowly, so the job never reaches steady state.", "Elastic parallelism makes capacity and per-task load change, which complicates performance comparison."],
    v: "Start a job requesting 8 to 16 slots with only 10 available, then add workers: it must start at 10 and rescale to 16 after the stabilization delay, with correct state afterward.",
    dep: ["scheduler", "rescaling", "resource-manager"]
  },
  "slot-pool": {
    s: "The job master's local ledger of slots it has been offered or has requested, used to assign tasks and to return slots when tasks finish or fail.",
    d: "The slot pool sends slot requirements to the resource manager, receives offers of slots from workers, and keeps them available for allocation by the scheduler. It tracks which slots are free or in use, releases idle slots after a timeout, and handles requests that cannot be met immediately, failing them after a wait limit. When a worker is lost its slots are removed and affected tasks fail. It separates the scheduler from details of resource acquisition.",
    k: ["Keeping idle slots for a while vs releasing at once: faster restarts after failure, but holds resources other jobs might want.", "Declaring requirements vs requesting individual slots: simpler resource accounting and elastic handling, but less precise placement."],
    p: ["Idle slot timeout shorter than restart delay returns slots just before they are needed.", "A request that waits forever hides a cluster with no capacity."],
    v: "Fail a task and watch the pool: the freed slot must stay allocated to the job for the idle timeout so the restart reuses it without asking the resource manager.",
    dep: ["resource-manager", "task-slots"]
  },
  "resource-manager": {
    s: "The cluster-level broker between jobs and the infrastructure: tracks available workers and slots, allocates them to jobs, and starts or stops workers through the cluster manager.",
    d: "Workers register their slots with the resource manager. Jobs declare requirements, and the manager matches them with free slots or asks the underlying cluster manager to start more workers. It detects lost workers through heartbeats and reports them. When no workers are needed, it releases them. Implementations exist for standalone clusters, container orchestrators and batch schedulers. The hard parts are slot fragmentation, start-up delay, quotas, and handling a cluster manager that is slower or less reliable than expected.",
    k: ["Dynamic worker allocation vs a fixed pool: pay only for what jobs need, but start-up delay affects job latency and failures.", "Evenly spread slots vs packed: spread improves failure tolerance and balance, packing allows releasing whole workers."],
    p: ["A quota limit in the cluster manager leaves requests unmet and the job waiting without a clear reason.", "Packing slots onto few workers makes one failure take down a large part of the job."],
    v: "Submit two jobs on a small cluster in an orchestrator: workers must be requested for the first, released after it ends, and the second job must wait with a clear message when the quota is exhausted.",
    dep: ["slot-pool", "task-manager", "deployment-modes"]
  },
  "high-availability-services": {
    s: "Elect a leader among redundant control processes and store the metadata needed to recover: job graphs, checkpoint pointers and leader addresses, in a coordination service.",
    d: "The control processes compete for leadership through the coordination service, and the leader publishes its address so workers and clients find it. Job graphs and pointers to the latest completed checkpoints are stored in the service or in durable storage referenced from it. On leader loss a standby takes over, recovers jobs and re-establishes contact with workers, which keep running tasks. Fencing tokens prevent an old leader from acting after losing leadership. Hard parts are split-brain, session timeouts and cleanup of stale metadata.",
    k: ["Leader election via a coordination service vs a single control process: surviving control failure without losing jobs, but another distributed system to operate.", "Storing small pointers in the service and bulk data in durable storage: keeps the service light, but recovery depends on both being consistent."],
    p: ["A stale leader that has not noticed its session expired issues commands and interferes with the new leader.", "Metadata not cleaned after a job ends leaves recovery pointers that resurrect finished jobs."],
    v: "Kill the leading control process during a running job: a standby must be elected within the session timeout, the job must continue without task restarts, and checkpoints must continue to complete.",
    dep: ["dispatcher", "job-master", "checkpoint-storage"]
  },
  "deployment-modes": {
    s: "The ways of starting the cluster: one long-lived shared cluster, one cluster per application, or one per job, trading isolation against startup cost and utilization.",
    d: "In session mode, a long-lived cluster accepts many jobs, so submission is fast and resources are shared, but jobs interfere and a bad job can harm others. In per-application or per-job mode, a cluster is created for the program, which gives isolation, separate resource accounting and independent upgrades, at the cost of startup time and fixed overhead. Orchestrators, virtual machines and standalone scripts are different launch targets. Mode decides where user code is run and how dependencies are packaged.",
    k: ["Cluster per job vs shared session cluster: strong isolation and independent upgrades, but slower start and more fixed overhead.", "Client-side vs cluster-side program execution: running on the cluster keeps heavy dependencies off the client and makes submission reproducible, but needs the code shipped."],
    p: ["Many short jobs in per-job mode spend most time starting clusters.", "A memory leak in one job's code destabilizes all other jobs in a shared cluster."],
    v: "Submit the same job in session and per-job modes and compare: start time, resource accounting and the effect of killing the job's processes on a second job must show the isolation difference.",
    dep: ["resource-manager", "dispatcher"]
  },
  "client-submission": {
    s: "The client-side path that builds the job graph, packages user code, submits it to the cluster, and offers commands for status, cancel, savepoints and stop.",
    d: "The client runs the program's main method to build the graph, or ships the program to the cluster to do so. It uploads the code archive and graph through the control interface and receives a job id. Afterward it can poll status, request a savepoint, cancel or stop, and fetch results. Detached submission returns at once; attached waits for completion. Clients must hold compatible versions of the serialization formats. Hard parts are dependency conflicts between user code and the engine, and large graphs shipped over limited channels.",
    k: ["Attached vs detached submission: attached gives immediate status and exit codes in scripts, detached frees the client but needs separate polling.", "Building the graph on the client vs in the cluster: client build is simple, cluster build avoids shipping all dependencies and heavy planning to a laptop."],
    p: ["Dependency versions in user code conflicting with the engine's own libraries cause class errors at runtime.", "A client that dies mid-submission leaves a job running that nobody tracks."],
    v: "Submit a job detached, close the client, then reconnect with the job id from another machine: status, savepoint and cancel commands must work and show the same job.",
    dep: ["dispatcher", "job-graph"]
  },
  "metrics-system": {
    s: "Counters, gauges, meters and histograms registered by the runtime and user code, scoped by job, task and operator, and exported to external monitoring systems.",
    d: "Every component registers metrics in a hierarchy of groups, for example worker, job, task, operator, subtask. Built-in ones cover records in and out, bytes, watermarks, checkpoint duration and size, state size, restarts, and memory. User code can add its own. Reporters push or expose them to monitoring systems at an interval. The challenge is cardinality: per-subtask and per-channel metrics multiply with parallelism, and labels with unbounded values such as keys cause explosions.",
    k: ["Fine-grained per-subtask metrics vs aggregated: precise localization of skew and slow tasks, but high cardinality and storage costs.", "Push to a gateway vs expose for scraping: push suits short-lived jobs, scraping suits long-lived and simpler networks."],
    p: ["A user metric labeled with a key creates millions of series and takes down the monitoring system.", "Reading cumulative counters as rates without handling restarts shows false drops."],
    v: "Run a job and query the monitoring system for per-operator input rate, watermark, checkpoint duration and restarts: values must match the job's known throughput, and a forced restart must show up as a restart count change.",
    dep: ["task-manager", "job-master"]
  },
  "latency-markers": {
    s: "Periodic markers injected at the sources and timed at each operator, measuring transit latency through the graph, separate from event-time lag and from the wait in queues.",
    d: "Sources emit marker records at an interval, carrying the emission time and source id. They flow through operators like normal records, without invoking user functions, and each operator or sink records the elapsed time in a histogram. The result shows how long records take, including buffer queuing and backpressure. They add overhead per marker per path, so granularity is usually coarse, and they reflect the markers' path, not each record's. Clock differences between machines distort multi-host measurements.",
    k: ["Markers for latency vs sampling real records: simple, uniform and cheap, but they do not pass through user functions so miss slow code paths.", "Per-operator histograms vs sink-only: localizes where latency arises, but multiplies metrics."],
    p: ["Clock skew between hosts shows negative or inflated latencies.", "Treating marker latency as end-to-end event-time freshness hides waiting inside windows and source lag."],
    v: "Add a one-second sleep to a middle operator and read per-operator latency histograms: the latency should step up by about one second at that operator and after, and not before it.",
    dep: ["metrics-system", "backpressure"]
  },
  "busy-and-backpressure-time": {
    s: "Per-task metrics of the share of each second spent processing, waiting for output buffers, or waiting for input, which locates the bottleneck in a running job.",
    d: "The mailbox loop measures time in three states: busy executing user code, backpressured waiting for an output buffer, and idle waiting for input. Reported as milliseconds per second, they show which operator limits throughput: the bottleneck is busy near 1000, with upstream tasks backpressured and downstream tasks idle. A task chain reports a single value, so chains can hide the slow operator inside. Values are samples over an interval, so short stalls are smoothed. Together with the buffer queue metrics, this answers most performance questions.",
    k: ["Time-based task states vs sampling thread stacks: cheap, always on, and directly interpretable, but granularity is the whole task.", "Reporting per task vs per operator in a chain: lower overhead, but the operator within a chain must be found with profiling."],
    p: ["Looking at the backpressured operator and tuning it, when the bottleneck is the first busy task downstream.", "Averages over minutes hide periodic stalls such as checkpoint pauses."],
    v: "Add a delay to a middle operator: that task must show busy time near 1000 ms per second, the upstream tasks must show backpressure and the downstream ones idle time.",
    dep: ["metrics-system", "mailbox-thread-model", "backpressure"]
  },
  "event-time-test-harness": {
    s: "Test utilities that feed an operator records, watermarks and processing-time advances in a controlled order and assert on its output, state and timers without a cluster.",
    d: "A harness wraps a single operator or function, allows pushing elements with timestamps, injecting watermarks, advancing a fake processing clock, and taking and restoring snapshots. Outputs, side outputs and the registered timers can be inspected. It makes event-time behavior deterministic: late data, out-of-order arrival, window firing and cleanup become unit tests. Because it runs one operator, it does not exercise shuffles, parallelism or the real state backend unless configured, so those need separate tests.",
    k: ["Operator-level harness vs full pipeline test: fast, deterministic, and precise on time logic, but misses integration issues such as serialization and partitioning.", "Fake clocks vs real waiting: tests run instantly and are not flaky, but cannot reveal real-time interactions."],
    p: ["Testing windows only with in-order data misses all late-record behavior.", "A test with no snapshot and restore step misses state bugs that only show up on recovery."],
    v: "Write a test that pushes records, advances the watermark past a window end, restores from a snapshot mid-way and asserts the window result: it must pass and fail when the operator's cleanup logic is mutated.",
    dep: ["window-operator", "timer-service", "operator-lifecycle"]
  },
  "mini-cluster-tests": {
    s: "Starts a complete small cluster inside the test process, with real scheduling, shuffles, state and checkpoints, to test a whole job on small data.",
    d: "An embedded cluster runs the coordinator and a few workers as threads in the test's process. Tests build a real job, run it to completion or until a condition, and read results from collecting sinks. Checkpointing, restore and rescaling can be exercised with real components. It is slower than operator tests but finds integration failures: serialization, partitioning, key-group handling and sink behavior. Tests must avoid shared static state and port clashes, and use bounded inputs or explicit stop conditions so they terminate.",
    k: ["Embedded cluster vs a deployed test cluster: fast and easy in continuous integration, but without real network, disk or resource manager behavior.", "Bounded sources for determinism vs unbounded with timeouts: bounded tests terminate by themselves, unbounded ones test streaming behavior but need careful stop signals."],
    p: ["Static fields in user code shared between parallel tasks make tests pass in the cluster but fail in production.", "Tests that wait for wall-clock time flake under load."],
    v: "Run a keyed job at parallelism 4 on the embedded cluster with a checkpoint and a forced restart: collected output must match a single-threaded reference computed over the same input.",
    dep: ["job-master", "task-manager", "checkpoint-coordinator"]
  },
  "failure-injection-tests": {
    s: "Tests that kill tasks, workers and coordinators, delay storage and drop connections while a job runs, then verify that output stays exactly as in a failure-free run.",
    d: "A test job with a deterministic input and a checkable result runs while a fault injector throws exceptions at random record counts, kills processes, pauses them to trigger timeouts, and slows storage. After many restarts, the output of sinks is compared with the expected one. Checks include no loss, no duplicates in committed output, and consistent state. These tests find defects in barrier handling, transactional sinks and recovery paths that normal runs never reach. Randomized seeds must be logged for reproduction.",
    k: ["Random faults over many runs vs scripted scenarios: random finds unexpected interactions, scripted ones are reproducible and show specific recovery paths.", "Verifying final output vs verifying invariants during the run: final comparison is simple, while online invariants find the moment of corruption."],
    p: ["Injecting only task exceptions misses worker pauses and storage delays, which are the common production faults.", "A failing seed that was not logged can never be reproduced."],
    v: "Run a counting job for an hour with a fault every thirty seconds, including a kill between prepare and commit in a transactional sink: the committed output must equal the failure-free result exactly.",
    dep: ["checkpoint-coordinator", "two-phase-commit-sink", "restart-strategies", "failure-detection"]
  },
  "delivery-guarantees": {
    s: "Which promise the job makes about output after failures: at-most-once, at-least-once, exactly-once within the engine, or exactly-once end to end, and what each costs.",
    d: "The guarantee comes from several parts together: replayable sources, snapshots with or without barrier alignment, and transactional or idempotent sinks. At-least-once skips alignment and may repeat records into state. Exactly-once for state needs alignment or unaligned snapshots. End to end also needs the sink to commit atomically with snapshots, which adds latency of one checkpoint interval. Side effects in user code are outside the boundary. The guarantee must be chosen first because it determines connectors, checkpoint settings and what consumers must tolerate.",
    k: ["Exactly-once with transactions vs at-least-once with consumer deduplication: clean output with higher latency and operational care, vs fast output and burden on consumers.", "One guarantee for the whole job vs per-sink: simple reasoning, but a single weak sink downgrades the entire pipeline's story."],
    p: ["Claiming exactly-once for a pipeline that calls an external service in a map function.", "Consumers reading uncommitted output defeat the sink's transactions."],
    v: "Kill workers repeatedly during a long run and diff the committed output against a failure-free reference; also read the sink as a read-committed consumer and check it never saw a record that later disappeared.",
    dep: ["end-to-end-exactly-once", "barrier-alignment", "two-phase-commit-sink", "replayable-offsets"]
  },
  "time-model": {
    s: "The choice of clock that defines results: event time for reproducible answers, processing time for lowest latency, and how late data is handled, which every time-based operator inherits.",
    d: "Choosing event time commits the job to timestamp extraction, watermark strategy, lateness limits and idleness handling. Choosing processing time avoids all that and loses reproducibility and the ability to backfill with the same code. Mixed designs exist. The model should be chosen with the consumers' needs: dashboards may accept approximations, billing cannot. It also determines whether the same program can run over history as a bounded stream. Changing it later alters results and usually requires a new job and state.",
    k: ["Event time with a lateness budget vs processing time: correct and replayable results, but latency depends on disorder and the watermark needs tuning.", "One watermark strategy for the whole job vs per source: simple and consistent, but sources with different delays hold each other back."],
    p: ["Using processing time for a metric that is later compared with event-time batch results produces permanent discrepancies.", "A watermark delay tuned once in testing and never revisited as traffic patterns change."],
    v: "Run the same program live and over a recorded replay at high speed: event-time results must be identical, and the count of late records must match the lateness budget assumptions.",
    dep: ["event-time", "watermark-propagation", "late-data-policy", "processing-time"]
  },
  "state-size-and-placement": {
    s: "How much state the job holds, per key and in total, and where it lives, which decides the backend, memory layout, checkpoint cost, recovery time and the feasible parallelism.",
    d: "State size grows with the number of keys, the retention of windows and joins, and the data kept per key. Small state fits in memory with the in-memory backend and fast snapshots. Large state needs the embedded store, incremental checkpoints and local recovery to keep checkpoint and restore time acceptable. Placement across key groups should be even. The estimate should be done at design time, since time-to-live, retention and aggregation choices can reduce state by orders of magnitude and are hard to change after months of data exist.",
    k: ["Retain everything vs bounded retention with time-to-live: complete answers on late or old keys, vs bounded and predictable state at the risk of lost matches.", "Large state in the job vs external store lookups: fewer moving parts and local speed, but longer recovery, against remote latency and a second system."],
    p: ["State that grows slowly passes testing and fails after weeks, when the backend or storage fills.", "Recovery time scales with state size, so a job with terabytes of state cannot meet a short recovery objective."],
    v: "Project state size from per-key bytes and key count, then compare with the measured state size after a week and after a full restore: restore time must meet the stated recovery objective.",
    dep: ["state-backend-interface", "incremental-checkpoints", "state-ttl", "key-groups"]
  },
  "latency-versus-throughput": {
    s: "Settings and designs trade fast individual results against high total rate: buffer flush timeouts, checkpoint interval, alignment, batching, chaining and the mode of sinks all move the balance.",
    d: "Larger network buffers and longer flush timeouts raise throughput and add latency. Frequent checkpoints lower replay but cost throughput, and transactional sinks make results visible only at checkpoints, so latency is at least the checkpoint interval. Chaining and unaligned snapshots reduce delay. Mini-batching and local aggregation raise throughput for aggregates and add delay. The right point depends on the use: fraud detection and billing reports need different settings. Settings should be treated as per-job design choices with measured targets.",
    k: ["Low flush timeout vs high: low latency at low rates, but more small packets and CPU, versus fuller buffers and better throughput.", "Frequent vs infrequent checkpoints: shorter replay and fresher committed output, but higher steady overhead."],
    p: ["Defaults tuned for throughput are used for a latency-sensitive job, so results arrive seconds late for no reason.", "Reducing the checkpoint interval to seconds on large state makes checkpoints overlap and slows the job."],
    v: "Measure the end-to-end latency percentile and the maximum sustained rate at two flush timeouts and two checkpoint intervals: the results must show the tradeoff and one setting that meets the stated target.",
    dep: ["network-buffer-pool", "checkpoint-coordinator", "operator-chaining", "two-phase-commit-sink"]
  },
  "upgrade-compatibility": {
    s: "Whether a job running for months can be changed, rescaled or moved without losing state, which depends on operator identities, serializers, key design and max parallelism chosen before the first snapshot.",
    d: "Compatibility is created at the start: explicit operator uids, evolvable serialization formats, a generous max parallelism and stable key selectors. Later changes then use savepoints. Breaking changes, such as a different key or state type, force reprocessing from history, which needs replayable sources with enough retention or an offline bootstrap. Engine version upgrades also need snapshot format compatibility. The cost of ignoring this appears once, at the first urgent change, and can be days of backfill.",
    k: ["Investing in uids and evolvable types up front vs shipping fast: free upgrades later, but slower early development and a little overhead per record.", "In-place upgrade via savepoint vs blue-green with reprocessing: continuity and no duplication, versus freedom to change anything at the cost of backfill and cutover."],
    p: ["Discovering at the first bug fix that generated operator ids changed and state cannot be restored.", "A key change forces a full backfill that the source's retention cannot support."],
    v: "Periodically perform a rehearsal: take a savepoint, apply a typical code change plus a parallelism change, restore in a test environment, and check results against the running job for equality.",
    dep: ["operator-uids", "savepoint-upgrades", "state-schema-evolution", "parallelism-and-max-parallelism"]
  },
  "resource-isolation": {
    s: "How much one job, task or tenant can affect others: slot memory isolation, shared CPU and network, per-job clusters, and noisy neighbors inside one worker process.",
    d: "Slots isolate managed memory but share CPU, heap and network inside a worker process, and all jobs in a session cluster share the control plane. Stronger isolation comes from per-job clusters or dedicated workers, with higher overhead. Within a job, slot sharing groups and chain breaking separate heavy operators. Checkpoint storage, network and the coordination service are shared infrastructure as well. Isolation decisions are driven by trust in user code, the number of tenants, and the cost of idle resources.",
    k: ["Shared session cluster vs cluster per job: high utilization and fast submission, versus strong isolation and independent failure at higher fixed cost.", "Many small slots vs fewer larger isolated workers: finer packing, versus fewer interference channels between tasks."],
    p: ["One tenant's job saturating shared storage or network slows everyone's checkpoints.", "Untrusted user code in a shared process can read or crash other jobs' tasks."],
    v: "Run a deliberately heavy job beside a latency-sensitive one in each deployment mode and compare the latter's latency percentile and checkpoint durations: isolation should show as an unchanged result for the sensitive job.",
    dep: ["task-slots", "deployment-modes", "slot-sharing", "managed-memory"]
  }
});
