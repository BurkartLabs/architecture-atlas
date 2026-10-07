// Details for the change data capture plate, part 5: operations, monitoring and cross-cutting concerns.
ATLAS.details("change-data-capture", {
  "connector-runtime": {
    s: "The process or framework that hosts capture and sink tasks: it starts them, supplies configuration and offset storage, restarts failures and exposes status.",
    d: "A runtime hosts connectors as long-lived tasks in one or more worker processes, either embedded in an application or as a cluster with a control interface. It owns lifecycle: start, pause, resume, restart with backoff, and shutdown with a final offset flush. It provides offset storage, the transport client, metrics and a status endpoint. Tasks within a runtime share memory and CPU, so one hot connector affects its neighbors. Hard because stateful singletons, one reader per log, do not scale by adding workers and must fail over cleanly.",
    k: ["Shared cluster runtime vs one process per connector: shared uses resources efficiently and lets one connector starve others, isolated costs more and fails independently.", "Embedded in an application vs standalone service: embedded has fewer moving parts and ties capture lifecycle to the application, standalone is operated separately."],
    p: ["A restart loop with no backoff hammers the source with reconnects.", "Shutdown without a final offset flush replays an hour of events on each deploy."],
    v: "Stop a worker gracefully and confirm the task's final offset is flushed and another worker, or the same one on restart, resumes with no events lost and only the documented duplicate window.",
    dep: ["connector-config", "offset-store"]
  },
  "connector-config": {
    s: "The declarative description of a pipeline: source connection, captured tables, snapshot mode, transforms, sink and tuning, kept in version control and applied to the runtime.",
    d: "Configuration is a set of named properties validated against a schema, with defaults. Changing some of them is safe at any time, such as batch size, while changing others, such as the captured table list or the key, changes what the pipeline means and may require a snapshot. Configuration is stored in version control and applied by an API or file. Secrets are referenced rather than inlined. Hard because properties interact, some changes need a new position, and a typo can silently select a default.",
    k: ["Configuration as code applied by automation vs edited through a console: code gives review, history and rollback, while console edits are fast and drift.", "Rejecting unknown properties vs ignoring them: rejecting catches typos and can break upgrades, ignoring tolerates old files and hides mistakes."],
    p: ["A misspelled property is ignored and the pipeline runs with a default that captures nothing useful.", "Adding a table to the include list does not snapshot it, so existing rows are missing."],
    v: "Validate a configuration with a deliberate typo and confirm it is rejected naming the property, and apply a valid change and confirm the running pipeline reports the new effective value.",
    dep: ["secrets-and-credentials"]
  },
  "task-assignment": {
    s: "Decides which worker runs which capture or sink task, and rebalances when workers join or leave, subject to the constraint that a log has one reader.",
    d: "Sink tasks scale by splitting stream partitions among workers. Capture tasks usually cannot be split: one log, one reader. Some sources offer several logs, such as shards, each with a task. The assigner balances load, avoids moving tasks needlessly and prevents two workers running the same capture task. Rebalances pause the affected tasks. Hard because a rebalance during a transaction or a flush can duplicate or drop work, and a task wrongly considered dead can run twice.",
    k: ["Eager rebalance of all tasks vs incremental moves: eager is simple and pauses everything, incremental moves only what changes and is harder to get right.", "Static assignment vs dynamic: static is predictable and needs manual action on failure, dynamic recovers on its own and moves tasks at inconvenient times."],
    p: ["A worker paused by garbage collection is declared dead, its task is reassigned and both write.", "Every deploy triggers a full rebalance and a pause across all connectors."],
    v: "Kill a worker holding a capture task and confirm exactly one other worker takes it within the target time, with the stored offset used and no concurrent duplicate writers.",
    dep: ["connector-runtime", "leader-election"]
  },
  "leader-election": {
    s: "Ensures exactly one active instance reads a given log at a time, using a lease or lock in shared storage, so a standby can take over when the active one fails.",
    d: "Instances compete for a lease that must be renewed within a timeout. The holder reads and publishes; the others wait. If the holder stops renewing, another acquires the lease after the timeout and resumes from the stored offset. Fencing tokens let the downstream reject writes from a stale former leader. Timeouts trade failover speed against false takeovers. It is hard because the old leader may still be running when the new one starts, and without fencing both write.",
    k: ["Short lease timeout vs long: short fails over quickly and misfires on pauses, long is stable and slow to recover.", "Fencing tokens vs trusting the lease: tokens make a stale leader harmless, while trusting the lease is simpler and fails in a pause-and-resume race."],
    p: ["A paused process resumes after its lease expired and writes events alongside the new leader.", "The lock store becomes unavailable and every instance stops, halting capture although everything else is healthy."],
    v: "Suspend the active instance past its lease, confirm the standby becomes active, resume the old one and confirm its writes are rejected by fencing and it steps down.",
    dep: ["offset-store", "connector-runtime"]
  },
  "standby-failover": {
    s: "A warm second instance of the pipeline, ready to take over from the stored position, so capture resumes within seconds of the active instance failing.",
    d: "The standby has the same configuration and access, its schema history loaded and its connection ready or prepared. On takeover it reads the offset, validates the position in the source log, and resumes streaming. Replay of the unacknowledged window is expected and consumers handle duplicates. Hot standby reading the log in parallel without publishing shortens takeover further. Hard because the standby's idleness is untested until needed, so drift in configuration, credentials or network rules turns a drill into an outage.",
    k: ["Warm standby vs cold restart: warm recovers in seconds and costs a running instance, cold is cheap and takes minutes.", "Standby reading the log vs idle: reading shortens failover but holds a second slot or connection and load on the source."],
    p: ["The standby's credentials expired months ago and it fails on its first real takeover.", "Both instances hold slots and the unused one retains log indefinitely."],
    v: "Kill the active instance during a write load and measure the time until events resume from the standby, and confirm the stream has no gap and duplicates only within the replay window.",
    dep: ["leader-election", "resume-logic", "schema-history-store"]
  },
  "source-failover-handling": {
    s: "Behavior when the source database itself fails over to a replica: reconnecting to the new primary and finding the right place in its log.",
    d: "After promotion, the new primary's log differs from the old: positions may be different, some committed changes may be lost if replication was asynchronous, and replication slots may not exist there. If positions are global, the pipeline reconnects and resumes. Otherwise it must locate the equivalent point, using a transaction identifier, or re-snapshot. It must also cope with events the old primary emitted for changes that were later lost. Hard because the pipeline may have already published changes that no longer exist on the new primary.",
    k: ["Resuming by global transaction identifiers vs re-snapshotting: identifiers resume cheaply when engines support them, re-snapshot is universal and expensive.", "Synchronous replication vs asynchronous: synchronous means no committed change is lost on failover, asynchronous is faster and can leave published events with no source counterpart."],
    p: ["The new primary lacks the slot and the pipeline cannot resume without a reload.", "The old primary had committed changes not yet replicated, so the stream contains events for data that no longer exists."],
    v: "Promote a replica during a write load and confirm the pipeline reconnects, reports whether its position was valid, and that after reconciliation the sink equals the new primary's data.",
    dep: ["resume-logic", "replication-slot-management", "reconciliation-checks"]
  },
  "rolling-upgrades": {
    s: "Upgrading the pipeline, the stream or the schemas without stopping delivery or breaking consumers, in an order that keeps old and new versions compatible.",
    d: "A connector upgrade stops, flushes offsets, starts the new version, and resumes. Event format changes follow compatibility rules so old consumers keep working: add fields, never repurpose. Consumers upgrade before producers when they must read new fields. Source upgrades require checking the log format support first. It is hard because the pipeline holds state, offsets and schema history, whose formats can change between versions, and rollback after state migration may be impossible.",
    k: ["Upgrading consumers first vs producers first: consumers first is safe for added fields, producers first is simpler and can feed old consumers data they cannot read.", "Stop-the-world upgrade vs rolling with a standby: stopping is simple and creates lag, rolling uses the standby and needs a mixed-version period."],
    p: ["A new version rewrites the offset format and cannot be rolled back after the first commit.", "A producer upgrade changes the event shape and an old consumer fails on every record."],
    v: "Upgrade the connector under load and confirm lag peaks at less than the target, the event format is compatible for an unchanged consumer, and a rollback in a rehearsal restores service.",
    dep: ["standby-failover", "schema-compatibility-policy"]
  },
  "secrets-and-credentials": {
    s: "How passwords, keys and certificates for the source, the transport and the sinks are stored, delivered to the pipeline and rotated without outage.",
    d: "Configuration references secrets by name, and a provider injects them at runtime from a secret store, so they are never in version control or logs. Credentials are least-privilege and distinct per connector. Rotation means the pipeline can accept a new credential while old connections continue, then reconnect. The streaming connection lives for days, so rotation must be planned, not discovered. Hard because credentials appear in error messages, thread dumps and configuration echo endpoints, and expired ones fail at unattended hours.",
    k: ["External secret provider vs environment variables: a provider gives rotation, audit and short-lived credentials, while environment variables are simple and visible to anyone who can read the process.", "Short-lived credentials vs long-lived: short-lived limit exposure and force renewal logic, long-lived are simple and risky if leaked."],
    p: ["A password rotation is done at the source and the pipeline keeps failing to reconnect after the next blip.", "The configuration status endpoint prints credentials in plain text."],
    v: "Rotate the source credential and confirm the pipeline reconnects with the new one without restart and the old one is rejected, and search logs and status output for the secret value and find none.",
    dep: []
  },
  "lag-measurement": {
    s: "Measures how far the pipeline is behind the source, both as time and as distance in the log, at each stage from capture to sink.",
    d: "Lag in time is the commit time of the most recent event processed versus now. Lag in bytes or positions is the head of the source's log minus the pipeline's position. Each stage has its own: source to capture, capture to stream, stream to sink. A quiet table gives misleading time lag, since no events means no timestamp, so heartbeats provide a recent reference. Hard because time lag depends on clocks, and a pipeline that is stuck reports no lag if it measures only processed events.",
    k: ["Lag in time vs in log distance: time speaks to users and is wrong on idle sources, distance is exact and hard to interpret as delay.", "Measuring at each stage vs end to end: per stage finds the bottleneck, end to end is what users feel and does not say where."],
    p: ["A stuck connector emits no events, so the time-lag metric stays at its last value and no alert fires.", "Clock skew between source and pipeline makes lag read negative or double."],
    v: "Pause the sink for five minutes and confirm lag at the sink stage rises by about 300 seconds while capture-stage lag stays low, and returns to near zero after resuming.",
    dep: ["heartbeat-events", "source-position-metadata"]
  },
  "slot-retention-alerts": {
    s: "Alerts on how much log the source is holding for the pipeline and how soon that will fill the disk or pass the retention limit.",
    d: "The source reports the retained size per slot or per consumer, and the oldest position still available. The monitor computes growth rate and time to a threshold, such as disk percent or retention expiry, and pages before it is reached. It also flags slots with no active connection and slots whose consumer has been gone for days. It is critical because a stalled pipeline can take down the source database, which is a worse outage than the pipeline's own.",
    k: ["Alerting on retained bytes vs on estimated time to full: bytes are simple and miss rate changes, time to full is actionable and needs a good growth model.", "Auto-dropping stuck slots vs paging a human: auto-drop protects the source and discards the pipeline's place, paging is safer for the data and slow."],
    p: ["The alert threshold is a fixed disk percent that arrives too late for a fast-growing log.", "An inactive slot from a retired test environment is nobody's and no one is paged."],
    v: "Pause a test pipeline under write load and confirm the retained size and projected time to threshold are reported and an alert fires before the threshold is reached.",
    dep: ["replication-slot-management", "log-retention-interaction"]
  },
  "throughput-metrics": {
    s: "Rates and sizes at each stage: events and bytes per second, batch sizes, queue depths, write latencies and error counts, used to find bottlenecks and plan capacity.",
    d: "Counters and histograms are exported per connector, table and stage: events read, filtered, sent, acknowledged; queue occupancy; time spent reading, decoding, sending; sink write latency. The relation between queue depths shows the bottleneck: a full internal queue with an empty source buffer means the sender is slow. Per-table counts show which tables dominate. Hard because averages hide bursts, high cardinality per table labels overload the monitoring system, and metrics on events say nothing about events never seen.",
    k: ["Per-table metrics vs per-connector only: per table identifies hot tables and multiplies metric cardinality, per connector is cheap and coarse.", "Histograms vs averages: histograms show tail latency, which is where problems are, and cost more to store."],
    p: ["Averages look fine while a one-minute burst each hour pushes lag past the target.", "Per-table labels on thousands of tables overwhelm the metrics store."],
    v: "Generate a known load of ten thousand events per second and confirm the reported rate at each stage equals it within a few percent, and that queue depths move as expected when a stage is slowed.",
    dep: ["internal-event-queue"]
  },
  "heartbeat-events": {
    s: "Periodic synthetic changes written to a small table on the source and captured like any other, to keep the position moving and give a recent timestamp even when real tables are quiet.",
    d: "A scheduled job updates a heartbeat row every few seconds or the pipeline writes to it itself. The change flows through the log, and its arrival confirms the whole path works and gives a fresh position to commit, which lets the source release log when captured tables are idle but other tables in the database are busy. Without heartbeats the committed position sits still, retaining log while the rest of the database produces gigabytes. Hard because heartbeats need write access and add trivial but constant load.",
    k: ["Heartbeat written by the pipeline vs by a scheduled source job: pipeline-written needs write rights and is self-contained, a source job needs no pipeline privileges and can fail unnoticed.", "Short interval vs long: short gives fine-grained lag and more events, long is cheap and slow to detect a stall."],
    p: ["A database with one quiet captured table and one busy uncaptured table retains log forever without heartbeats.", "The heartbeat job is disabled during a maintenance window and its absence is read as a pipeline failure."],
    v: "Stop writes to captured tables while other tables stay busy, and confirm the committed position still advances every heartbeat interval and retained log on the source does not grow.",
    dep: ["log-reader", "offset-commit"]
  },
  "end-to-end-latency-probe": {
    s: "A canary that writes a marker row at the source and measures how long until it appears at each destination, giving a true end-to-end latency rather than an inferred one.",
    d: "The probe inserts or updates a row with a unique value and the current time, then polls each sink or reads from the stream until it sees the marker, recording the elapsed time. It measures the whole path including every queue and batch delay, and detects a path that is broken but shows no errors. Results feed a latency histogram and an alert for missing probes. Hard because the probe row must be in a captured table with correct filters, and polling intervals add noise to the measurement.",
    k: ["Synthetic probe vs deriving latency from event timestamps: a probe tests the real path and generates load and traffic, derived latency is free and says nothing when no events flow.", "One probe per sink vs a single one: per sink catches sink-specific faults and costs more, a single probe is cheap and covers only part of the topology."],
    p: ["The probe table is excluded by a filter change, and the alarm goes quiet while the path is dead.", "Probe polling at the sink is so frequent that it adds load to the destination."],
    v: "Insert a probe, record the time to appear at each destination, then break one sink and confirm the probe for that sink alarms within the missing-probe timeout while others stay green.",
    dep: ["lag-measurement", "heartbeat-events"]
  },
  "errors-and-dead-letters": {
    s: "Capturing events that cannot be processed, such as undecodable values or rejected writes, into a separate stream with the reason, instead of blocking or dropping them.",
    d: "On a failure the pipeline retries for transient causes and routes permanent failures, with the original event, error and context, to a dead-letter stream. Policy decides whether to fail the task, skip, or dead-letter. Operators inspect dead letters, fix the cause and replay them. Because processing continues past a failed event, order for that key is broken. Hard because a dead-lettered event blocks all later events for the same key logically, and dead letters pile up unseen if nobody monitors them.",
    k: ["Dead-letter and continue vs stop on first error: continuing keeps throughput and breaks ordering for that key, stopping preserves correctness and halts the pipeline.", "Retrying with backoff before dead-lettering vs immediate: retries handle transient faults and delay the stream, immediate keeps moving and dead-letters recoverable events."],
    p: ["A deploy bug dead-letters every event for an hour and nobody looks at the stream.", "A dead-lettered update is replayed after later updates and overwrites newer data."],
    v: "Inject a bad record and confirm it appears in the dead-letter stream with the error, original payload and position, an alert fires, and replay after a fix applies it correctly.",
    dep: ["event-transport", "throughput-metrics"]
  },
  "reconciliation-checks": {
    s: "Periodic comparison of the source and each destination, by counts, checksums or sampled rows, to detect silent loss, duplication or drift that no error reported.",
    d: "Because every component can be correct and the total still wrong, a separate check compares data. Cheap checks compare row counts and aggregates at a consistent position or a quiesced window. Stronger ones compute per-range checksums and drill into mismatches, or compare samples. Since the destination lags, the comparison must be at the same source position, or must ignore recent changes. Hard because large tables are expensive to scan, the source and destination types hash differently, and moving data complicates exact comparison.",
    k: ["Counts and aggregates vs full checksums: counts are cheap and miss compensating errors, checksums find any difference and cost a full read on both sides.", "Comparing at a quiesced point vs ignoring a recent window: quiesced is exact and needs pause, ignoring recent changes is non-intrusive and can hide real recent loss."],
    p: ["The check compares live tables at different times and reports noise that teaches operators to ignore it.", "Counts match while two differing rows cancel each other out."],
    v: "Delete one row at the sink behind the pipeline's back and confirm the next reconciliation reports the key range, row count difference and a repair suggestion, and a clean run reports zero differences.",
    dep: ["consistent-snapshot-point", "audit-and-lineage"]
  },
  "audit-and-lineage": {
    s: "Records of what each event was, where it came from and where it went, so a value at a destination can be traced to its source change and the transform steps it passed.",
    d: "Every event carries its source position and transaction identifier. The pipeline can log, or write to an audit stream, each event's identifier with timestamps at stages: captured, sent, applied. Lineage metadata says which source tables feed which streams and sinks and through which transforms. Auditors use it for investigations and compliance. Hard because full per-event audit doubles the traffic and storage, and because lineage must be updated when configuration changes or it lies.",
    k: ["Per-event audit trail vs sampled or aggregate: per event is complete and expensive, sampled is cheap and cannot answer questions about a specific record.", "Lineage from configuration vs from observed traffic: configuration is declared and may be stale, observation is real and misses paths with no recent events."],
    p: ["Lineage is generated once and never updated, so it shows a topology that was replaced months ago.", "Audit records contain the sensitive values the pipeline masks elsewhere."],
    v: "Pick one destination row and trace it back, using only audit records, to its source transaction, the transforms applied and the times it was captured and applied.",
    dep: ["source-position-metadata"]
  },
  "ordering-and-consistency": {
    s: "The decision about what order and what atomicity consumers can see: per-row order, per-transaction grouping, or a global order, and what states they may observe in between.",
    d: "The source has one commit order. The pipeline can keep it entirely on one partition and one writer, with a throughput ceiling, or keep it per key across partitions, losing cross-key order, or group by transaction to give consistent snapshots. Each choice propagates: consumers need markers, buffers or tolerance for intermediate states. The decision must be stated and tested, since each layer can accidentally weaken it, through retries, parallel writers, rebalances and merges across shards.",
    k: ["Per-key order vs global order: per-key scales and suffices for state mirroring, global is simple to reason about and caps throughput at one writer.", "Transactional consistency for readers vs eventual convergence: transactional views need markers and buffering, convergence is simple and exposes states that never existed."],
    p: ["A retry or parallel writer reorders updates to one key and the sink converges to the wrong value.", "Consumers assume transaction atomicity that the pipeline does not provide."],
    v: "Under injected faults, apply a long random workload and compare the sink state to the source at the same position, and verify that every consumer-visible state is one the source also passed through when atomic mode is promised.",
    dep: ["ordering-guarantees", "commit-order-sequencing", "transaction-boundary-events"]
  },
  "delivery-semantics": {
    s: "The promise about loss and duplication: at most once, at least once, or effectively exactly once, and which component is responsible for each part of the promise.",
    d: "Capture to stream is at-least-once by committing offsets after acknowledgment. Stream to sink is at-least-once by the same rule. Exactly-once effect comes from idempotent writes, position-guarded writes or transactions covering both data and offset. The guarantee is only as strong as the weakest hop and must be stated per hop. A decision affects offset commit, sink design, event format and deduplication, so it has to be taken first and tested by killing components at random points.",
    k: ["At-least-once with idempotent sinks vs transactional exactly-once: idempotent is portable and puts the burden on sinks, transactional is clean and limited to systems that support it.", "Never losing data vs never duplicating it: you can have both only at the destination, through deduplication or atomic commit, not in the transport."],
    p: ["The stated guarantee covers one hop and consumers assume it covers all.", "Duplicate handling exists in design but was never tested with a real crash."],
    v: "Run a fault-injection test that kills each component at random times during a counted workload and confirm no event is missing and every duplicate is neutralized at the destination.",
    dep: ["offset-commit", "at-least-once-delivery", "exactly-once-processing"]
  },
  "source-impact": {
    s: "How much the pipeline may cost the system it watches, in CPU, I/O, connections, locks and retained log, and the controls that keep that within what the source's owners accept.",
    d: "The pipeline adds a streaming connection, decoding work on some engines, retained log while it lags, snapshot reads, heartbeats and sometimes triggers or extra log detail. These costs fall on the production database. A source owner usually sets a budget, and every layer must respect it: throttled snapshots, reading from a replica, limiting retention risk through alerts and heartbeats. The tradeoff is freshness against safety, as a throttled or paused pipeline protects the source and extends lag and retention.",
    k: ["Capturing from the primary vs from a replica: primary is fresh and adds load, a replica isolates load and adds lag and a failure mode.", "Stricter limits vs faster completeness: strict limits protect production and prolong snapshots and retention, relaxed limits finish sooner and risk the source."],
    p: ["An initial load runs unthrottled at peak and the application degrades.", "A stalled pipeline retains log and fills the source's disk, causing an outage in the primary system."],
    v: "Measure source CPU, I/O, connection count and retained log with and without the pipeline running under production-like load, and confirm each stays inside the budget agreed with the source's owners.",
    dep: ["source-impact-limits", "slot-retention-alerts", "replica-reading"]
  },
  "data-sensitivity": {
    s: "Change events carry entire rows, including personal and secret data, so every stage must treat the stream as sensitive and decide what is dropped, masked, encrypted and retained.",
    d: "The stream is a second copy of the database in motion and at rest, often with longer retention and more readers. Controls: capture only needed tables and columns, mask before the stream, encrypt in transit and at rest, authorize per stream, expire data, and handle erasure requests, which need deletion from retained streams and sinks. Schema history, dead letters, logs and before images are secondary copies with the same data. The decision must be made at capture, because later stages cannot recall what has already been copied.",
    k: ["Mask at capture vs at consumers: capture-side keeps raw data out of every downstream copy, while consumer-side is flexible and widens the exposure.", "Long retention for replay vs short retention for privacy: long retention enables recovery and holds personal data, short is safer and limits replay."],
    p: ["A deletion request is honored in the database while the same record persists in stream retention and the lake.", "Dead-letter streams and logs contain unmasked payloads under weaker access control."],
    v: "Insert a record with known sensitive values, run it through every stage, and then search the stream, dead letters, logs, schema history and every sink; only the approved forms may appear, and an erasure request removes it from each.",
    dep: ["masking-and-redaction", "table-and-column-filters", "network-and-tls"]
  },
  "failure-and-recovery-model": {
    s: "The decision about what can fail, what each failure costs and how the pipeline returns to correct: replay from offsets, re-snapshot, or reconcile and repair.",
    d: "Components fail independently: the capture process, the stream, a sink, the source, the network, the offset store. Each has a recovery path: restart and resume, replay from retained events, re-snapshot when the log is gone, reconcile when a silent error is found. The model states the recovery point and time targets, which retained data enables them, and who decides. It forces the early choices on retention lengths, offset durability and snapshot ability, because recovery capability cannot be added after the failure happens.",
    k: ["Rely on replay vs rely on re-snapshot: replay is cheap and bounded by retention, re-snapshot is always available and expensive and cannot reproduce deletes.", "Automatic recovery vs operator-approved: automatic restores service sooner and may do expensive or destructive things unprompted."],
    p: ["Retention is shorter than the realistic outage, and the first long incident requires a full reload nobody planned.", "Recovery procedures exist on paper and have never been rehearsed."],
    v: "Rehearse each failure in a staging environment, including loss of the offset store and of the log, and record the time to correct state and the data loss, if any, against the targets.",
    dep: ["resume-logic", "rewind-and-replay", "resnapshot-trigger", "standby-failover"]
  },
  "latency-versus-throughput": {
    s: "The tension between delivering each change within moments and moving large volumes efficiently, settled by batch sizes, commit intervals and where buffering is allowed.",
    d: "Every stage chooses between sending now and batching. Small batches and frequent offset commits give low latency and low efficiency; large batches raise throughput and delay freshness, lengthen the replay window and make failures costlier. Different consumers want different points: a cache invalidator wants milliseconds, a warehouse wants minutes. The decision shapes buffer sizes, flush intervals, partition counts and transaction handling, and it should be set per sink rather than once for the whole pipeline.",
    k: ["One tuning for all consumers vs per-sink tuning: one is simple and wrong for most, per-sink fits each use and multiplies configuration.", "Buffering to protect the sink vs forwarding immediately: buffering absorbs bursts and adds delay, immediate forwarding is fresh and passes spikes through."],
    p: ["A batch interval set for the warehouse makes the cache invalidation sink stale for seconds.", "Throughput tuning raises the replay window so far that failures replay minutes of data."],
    v: "Plot end-to-end latency percentiles against offered load for each sink at its chosen settings, and confirm both the latency target at normal load and the throughput target at peak are met.",
    dep: ["batching-and-bulk-load", "internal-event-queue", "backpressure"]
  }
});
