// Details for the feature store plate, part 4: computation and materialization.
ATLAS.details("feature-store", {
  "batch-transform-engine": {
    s: "Runs feature transformations over bounded input, such as a day of events or a full table, on a schedule or on demand, and writes results with event timestamps.",
    d: "Batch jobs read source tables for a time range, apply the transformation, aggregate and write rows keyed by entity and timestamp. They run on a distributed engine, using partition pruning to read only the interval needed. Batch is the simplest and cheapest path and the reference for correctness, since it sees complete data. Its limitation is latency: values are as fresh as the last run plus its runtime. Jobs must be restartable and produce the same output for the same inputs.",
    k: ["Full recompute versus incremental processing: full recompute is simple and self-correcting, incremental is cheaper and must handle late and corrected data carefully.", "Co-locating many views in one job versus separate jobs: one job reads sources once, separate jobs isolate failures and let schedules differ."],
    p: ["A job reads a source table while it is being rewritten and produces a mix of old and new data.", "Reruns are not idempotent and double-count when a job is retried after partial output."],
    v: "Run the job twice for one interval and confirm the output tables are identical; compare a sample of values with an independent query on the source data.",
    dep: ["compute-cluster", "batch-sources", "columnar-tables", "transformation-code", "workflow-orchestrator"]
  },
  "stream-transform-engine": {
    s: "Computes features continuously from event streams, keeping state per entity and emitting updated values within seconds of the events that cause them.",
    d: "A stream processor consumes events, groups by entity key, maintains state such as counts and sums over windows, and writes updates to the online store and, usually, to the offline store as well. It must handle out-of-order events, restarts and rebalancing without losing or double counting. Exactly-once effects come from checkpointed state and idempotent sinks. Streaming gives freshness that batch cannot, at a large operational cost: continuous jobs need monitoring and careful upgrades.",
    k: ["Streaming for all features versus streaming only where freshness pays: all streaming gives uniform freshness at high cost, selective streaming needs a way to tell what the freshness is worth.", "Same engine for batch and stream versus separate engines: one engine shares logic, separate ones are individually simpler and optimized and can diverge."],
    p: ["A job upgrade drops its state and restarts all counts from zero, so every windowed feature is wrong for hours.", "Consumer lag grows unnoticed after a traffic spike, and features silently become minutes old."],
    v: "Publish a known sequence of events for a test entity and confirm the online value updates to the expected result within the freshness target, and that killing and restarting the job leaves the value unchanged.",
    dep: ["stream-broker", "stream-state-store", "window-aggregations", "late-data-handling", "stream-sink-writer"]
  },
  "window-aggregations": {
    s: "Computes aggregates such as counts and sums over time windows ending at a given moment, for example a user's purchases in the last thirty days, in batch or streaming.",
    d: "Aggregations are among the most common and most expensive features. Windows can be tumbling, sliding or session-based. Long sliding windows computed naively touch each event many times, so engines keep partial aggregates in buckets and combine them. Correctness at training time requires the aggregate as of each historical moment, which means computing it for many past timestamps, not just the latest. Window boundaries, inclusive or exclusive, and time zones must be identical in all paths.",
    k: ["Exact sliding windows versus bucketed approximations: exact is correct and costly, buckets cut state and compute, but make values depend on bucket alignment.", "Precomputing windows versus aggregating on read: precomputing is fast to serve and costs materialization, on-read aggregation is flexible and adds latency."],
    p: ["Offline windows are closed on the right and streaming windows open on the right, so counts differ by the boundary events.", "Windows are evaluated at job time, not at the entity's reference time, so a backfill gives today's window for every row."],
    v: "For a test entity with events at known times, compute the thirty-day count at several timestamps in batch, stream and by hand, and confirm all three agree including on boundary events.",
    dep: ["batch-transform-engine", "stream-transform-engine", "stream-state-store", "event-time-and-watermarks"]
  },
  "stream-state-store": {
    s: "Holds the running state of streaming computations, such as partial aggregates per entity, in a local store with periodic checkpoints for recovery.",
    d: "Each stream worker keeps state keyed by entity in memory or on local disk and snapshots it to durable storage at checkpoints aligned with stream offsets. After a failure, workers restore the last checkpoint and replay events after it. State size grows with entities and window length, and can reach terabytes, so compaction, expiry and efficient serialization matter. Changing the shape of state when a definition changes is the hard operation: old state may not fit the new logic.",
    k: ["Local embedded state versus an external state database: local is fast and tied to partitioning, external simplifies rescaling and adds latency to every event.", "Frequent checkpoints versus infrequent: frequent ones shorten recovery and slow processing, infrequent ones recover slowly and replay more."],
    p: ["State for entities that stopped appearing is never expired, so memory grows until the job fails.", "A definition change reuses old state with a different meaning and produces plausible wrong values."],
    v: "Kill a worker mid-stream and confirm it recovers from its checkpoint, replays and produces final values identical to an uninterrupted run over the same events.",
    dep: ["object-storage", "compute-cluster", "stream-broker"]
  },
  "late-data-handling": {
    s: "Decides what happens to events that arrive after the system has already computed results for their time: update the result, drop the event or send it to a correction path.",
    d: "Events arrive late because of mobile devices, retries and slow upstream systems. A watermark estimates how complete the stream is for a given event time, and an allowed lateness extends how long windows accept updates. After that, late events are dropped, counted or applied to the offline store only through a correction job. Each choice trades the correctness of history against the stability of what was already served, because changing past values changes datasets built earlier.",
    k: ["Wait longer before emitting versus emit early and correct: waiting gives accurate results and adds delay, early results are fresh and are revised later.", "Applying late data to history versus freezing it: applying keeps history accurate and changes values models trained on, freezing keeps datasets stable and permanently omits some events."],
    p: ["Late events are silently dropped, and nobody measures how many, so a source change that adds delay erodes accuracy slowly.", "Corrections reach the offline store but not the online store, so the two disagree."],
    v: "Send an event with an event time two hours in the past and confirm it is applied, dropped or corrected according to the configured lateness, and that the dropped-event counter increments in the dropped case.",
    dep: ["event-time-and-watermarks", "stream-transform-engine", "backfill-engine"]
  },
  "backfill-engine": {
    s: "Recomputes historical feature values for a new or changed definition over a past time range, so training data and the offline store have complete history from the start.",
    d: "When a feature is created or its logic changes, history needs to be computed as if the new logic had always run. The engine splits the range into intervals, runs the batch transformation on each in parallel, writes the output to the offline store and, if needed, updates the online store with the latest values. It may need source data that has expired, and results depend on sources being as they were. Large backfills compete with production jobs for resources.",
    k: ["Backfill on definition change versus lazy computation when first requested: eager backfill makes history available at once and costs compute up front, lazy saves cost and delays the first training run.", "Overwrite the old history versus write a new version: overwriting is simple and invalidates datasets, a new version keeps old ones valid and doubles the storage."],
    p: ["A backfill uses the current state of a mutable dimension table, so historical values reflect today's data.", "A huge backfill is started on the production cluster and starves the online materialization jobs."],
    v: "Backfill a feature over ninety days and compare a sample of values with an independent computation as of those dates; confirm production freshness metrics were unaffected during the run.",
    dep: ["batch-transform-engine", "columnar-tables", "compute-cluster", "materialization-state", "approval-gates"]
  },
  "shared-transform-logic": {
    s: "Keeps a single implementation of each transformation that runs in batch, streaming and request-time paths, so the same definition cannot produce different values in each.",
    d: "The most reliable fix for training-serving skew is to avoid two implementations. Options are a declarative language translated to each engine, a function library called from each engine, or one engine that handles all modes. Each has limits: translation works for a subset of operations, and a shared function library still depends on how the engines hand it data. Whatever is chosen, equivalence is tested on the same inputs across paths in continuous integration.",
    k: ["Declarative translation versus shared function library: translation optimizes per engine and limits expressiveness, a library allows any logic and leaves null and type handling to each caller.", "One unified engine versus a best engine per path: unified removes drift and may be poor at one of the modes, per-path engines are efficient and need parity tests."],
    p: ["The batch path uses a vectorized library while streaming uses a row-by-row version, and they handle nulls and rounding differently.", "Parity tests cover a handful of hand-picked rows, not edge cases such as empty windows and leap days."],
    v: "Run the same input data through all paths a feature supports and compare outputs exactly, including nulls, empty windows and boundary timestamps; any difference outside the declared tolerance fails the build.",
    dep: ["transformation-code", "udf-runtime"]
  },
  "udf-runtime": {
    s: "The execution environment for user-written transformation functions: dependency management, resource limits, isolation and serialization between the engine and the function.",
    d: "Custom logic runs in a managed runtime inside batch workers, stream workers or the serving path. The runtime pins library versions, limits memory and time, and moves data between the engine's format and the function's. Crossing that boundary is often the bottleneck, so batches of rows are passed at once. Isolation prevents one bad function from crashing the host, and pinned dependencies keep results the same when libraries release new versions.",
    k: ["Isolated sandbox per function versus in-process execution: a sandbox contains failures and costs startup and data transfer, in-process is fast and risks the host.", "Pinned dependency sets versus a shared environment: pinning gives reproducibility and many images to maintain, a shared environment is easy and breaks when a library updates."],
    p: ["A function depends on an unpinned library, and a minor release changes a rounding mode, shifting values in the next run.", "A function loads a large model on every call because the runtime does not keep it warm."],
    v: "Run the same function twice from clean images built at different times and confirm identical outputs; submit a function that exceeds its memory limit and confirm it is killed without affecting other work.",
    dep: ["compute-cluster", "configuration-and-deploy"]
  },
  "embedding-generation": {
    s: "Produces dense vector features from text, images or interaction history by running a model, and manages when they are recomputed as the model changes.",
    d: "Embeddings are computed by running an encoder over source content, in batch for the corpus and incrementally for new items. They are stored as array features and sometimes indexed for similarity search. They are versioned by the model that produced them, because vectors from different model versions are not comparable. Changing the encoder means recomputing everything and retraining all consumers at the same time. Cost, in accelerator hours, is far higher than for ordinary features.",
    k: ["Precomputed embeddings versus computing at request time: precomputing is cheap to serve and stale for new content, request-time is current and costs accelerator latency.", "Pinning the encoder version versus upgrading in place: pinning keeps consumers consistent, upgrades improve quality and force coordinated retraining."],
    p: ["Embeddings from two encoder versions are stored in the same column, and similarity scores mix incompatible spaces.", "New items have no embedding until the next batch run, so they are invisible to retrieval for a day."],
    v: "Compute embeddings for a sample twice with the same encoder version and confirm identical vectors; confirm each stored vector carries the encoder version identifier and that a query only compares vectors with matching versions.",
    dep: ["batch-transform-engine", "compute-cluster", "vector-index", "definition-versioning"]
  },
  "incremental-computation": {
    s: "Updates feature values from only the new or changed input since the last run, instead of recomputing from scratch, to cut cost and latency.",
    d: "An incremental job tracks a high-water mark, such as the latest processed partition or change offset, reads only data beyond it and merges the result into existing aggregates. It works cleanly for additive aggregates and poorly for operations that need the full history, such as distinct counts or medians, without approximate sketches. Corrections to old data break the assumption, so a periodic full recompute is common. State kept between runs must be versioned with the code.",
    k: ["Incremental with periodic full refresh versus always incremental: periodic refresh repairs drift in the state, always-incremental is cheaper and accumulates errors.", "Exact incremental updates versus approximate sketches: exact needs more state per entity, sketches are compact and give bounded error."],
    p: ["A source partition is rewritten after the job has passed it, so incremental results permanently omit the correction.", "The high-water mark is advanced before the output is committed, and a crash loses a slice of data."],
    v: "Run incrementally over a week of daily increments and compare final values with a single full recompute over the same week; differences must be zero for exact aggregates or within the declared error for sketches.",
    dep: ["batch-transform-engine", "materialization-state", "window-aggregations"]
  },
  "materialization-scheduler": {
    s: "Decides when each view's computation and sync run, in what order and with what resources, based on schedules, upstream arrival and freshness targets.",
    d: "The scheduler creates a run per view per interval, orders them by dependency, and releases them when input data has arrived. It tracks which intervals are complete, retries failures and prevents overlapping runs of the same view. Event-driven triggering, such as on partition arrival, gives fresher results than clock schedules but needs reliable signals. It must also keep many views from running at once and exhausting the cluster at midnight.",
    k: ["Clock-based schedules versus data-arrival triggers: clocks are predictable and run on missing data, arrival triggers are exact and depend on a reliable completion signal.", "Per-view schedules versus a global cycle: per-view scheduling matches each freshness target and is harder to reason about as a whole."],
    p: ["Every daily view is scheduled at midnight, so they contend for resources and all finish late.", "A run starts before the upstream partition is complete and writes partial results as if they were final."],
    v: "Delay an upstream partition and confirm dependent runs wait, then start when it arrives; confirm no two runs of the same view overlap and that the freshness metric reflects the delay.",
    dep: ["workflow-orchestrator", "materialization-state", "freshness-tracking", "batch-transform-engine"]
  },
  "offline-to-online-sync": {
    s: "Copies the latest value per entity from the offline store to the online store, so serving reflects the most recent batch results.",
    d: "After a batch run, the sync reads the newest row per entity, converts it to the online layout and writes it in bulk to the key-value store, usually with a timestamp for ordering. Large views mean millions of writes in minutes, which can overload the store unless throttled. Some systems write to a new table and switch a pointer, so serving never sees a half-updated view. Failures partway leave some entities updated and others not.",
    k: ["Writing in place versus swap to a new table: in-place is simple and exposes mixed versions during the sync, swap gives an atomic cutover and doubles storage briefly.", "Full resync versus changed rows only: full is simple and self-healing, changed rows are cheaper and rely on correct change tracking."],
    p: ["A sync running at full speed saturates the online store, and serving latency rises for every model.", "A partial failure leaves half the entities on yesterday's values, with no marker saying so."],
    v: "Run a sync against a copy of a production-size view while serving traffic runs, and confirm serving latency stays within budget and that after completion every entity's online value equals the offline latest value.",
    dep: ["bulk-loader", "columnar-tables", "key-value-store", "write-idempotency", "materialization-state"]
  },
  "stream-sink-writer": {
    s: "Writes streaming results to the online store, and to the offline store as well, with ordering and batching that keep the two consistent and not overload either.",
    d: "As the stream job emits updated values, the sink groups them into small batches, deduplicates multiple updates to the same key, writes to the online store and appends to the offline tables. It applies backpressure when the store is slow. Dual writes can leave stores disagreeing if one fails, so many designs write to a log first and derive both outputs from it. Ordering matters: a stale update arriving after a newer one must not overwrite it.",
    k: ["Dual write from the job versus derive both from a log: dual write is simple and can diverge on partial failure, a log is consistent and adds a stage and latency.", "Large write batches versus tiny ones: large batches raise throughput and delay visibility, small ones are fresh and costly for the store."],
    p: ["The offline write fails and is retried much later, so the offline store has holes the online store does not.", "Unordered retries write an older value over a newer one."],
    v: "Stream a sequence of updates for one key including a deliberately replayed older update, and confirm both stores end with the newest value and the offline history contains each event once.",
    dep: ["key-value-store", "versioned-writes", "write-idempotency", "columnar-tables"]
  },
  "write-idempotency": {
    s: "Ensures that repeating a write, because of a retry or replay, has the same effect as doing it once, so failures can be retried safely.",
    d: "Retries are unavoidable, so writes are keyed and conditional. Rows carry a deterministic identity, entity plus event time plus view version, and stores accept an upsert that overwrites the same row with identical content. Online writes include a version or timestamp and are applied only if newer. Batch outputs are written to a temporary location and committed atomically by replacing a partition. Appends without keys cause duplicates, which silently double counts in later aggregations.",
    k: ["Upsert by key versus append and deduplicate later: upserts keep tables clean and need keyed storage, append is cheap and pushes deduplication into every reader.", "Atomic partition replace versus row-level merge: partition replace is simple and rewrites more data, row merges are precise and costly."],
    p: ["A retried batch appends its output again, and every later sum over that interval is doubled.", "Idempotency keys include the processing time, so a retry generates a new key and defeats the purpose."],
    v: "Run a materialization twice on the same interval, and again with a forced failure and retry mid-way; confirm row counts and checksums in both stores are identical after each case.",
    dep: ["versioned-writes", "columnar-tables", "key-value-store"]
  },
  "bulk-loader": {
    s: "Loads large volumes of rows into the online store efficiently, by building files or batches in the store's native format and ingesting them without per-row overhead.",
    d: "Writing hundreds of millions of rows one at a time is too slow and disturbs serving traffic. The loader partitions data by the store's sharding, produces sorted batches or native files, and ingests them in parallel with rate limits. It may stage data in object storage and instruct the store to import it. Throughput must be balanced with serving latency, which is hurt by compaction and memory pressure triggered by the load.",
    k: ["Import prebuilt files versus streaming writes: file import is fastest and requires store support and a staging step, streaming writes are universal and slower and noisier for serving.", "Aggressive loading versus throttled: aggressive finishes sooner and hurts latency, throttled is gentle and extends the window of mixed data."],
    p: ["The load triggers heavy background compaction in the store, and read latency doubles for an hour.", "The partitioning used for the files does not match the store's sharding, so each shard receives a flood of misrouted rows."],
    v: "Load a production-sized view into a staging store under simulated serving traffic and confirm p99 read latency stays within budget and row counts match the source.",
    dep: ["key-value-store", "sharding-and-replication", "object-storage"]
  },
  "ttl-and-expiry": {
    s: "Declares how long a feature value stays valid after its timestamp, and removes or ignores expired values in the online store and in point-in-time joins.",
    d: "A time-to-live is set per view, based on how long a value remains meaningful. The online store drops or hides rows older than the TTL, so serving returns not found, instead of arbitrarily old data. Offline, the TTL bounds the lookback of joins. It is also a safety net: when a pipeline silently stops, values expire and the model sees defaults rather than stale values, which is easier to detect. The TTL has to be longer than the refresh interval, with margin for delays.",
    k: ["TTL shorter than refresh interval plus slack versus longer: shorter is safe from stale data and expires values during minor delays, longer tolerates delays and keeps serving old data after a failure.", "Store-enforced expiry versus checked at read: store-enforced reclaims space, read-time checks keep data for inspection and are applied by every reader."],
    p: ["The TTL equals the refresh interval, so every delayed run causes a burst of not-found results.", "Offline and online TTLs are set separately and drift apart."],
    v: "Write a row, wait past its TTL and confirm the online lookup returns not found and the offline join treats it as null at timestamps after the TTL; then confirm the storage was reclaimed.",
    dep: ["ttl-eviction", "time-travel-lookback", "feature-views"]
  },
  "freshness-tracking": {
    s: "Records, per view, the event time and write time of the latest data materialized, so freshness can be measured, reported and used for scheduling decisions.",
    d: "After each run or stream checkpoint, the system stores the maximum event time seen, the time of the write and the interval completed. These watermarks feed freshness monitoring, give consumers a way to ask how current a view is and allow the training builder to reject datasets requested beyond available data. Tracking per partition or shard avoids one slow shard being hidden by fast ones. The value must be written after, not before, the data it describes.",
    k: ["Per-view timestamps versus per-entity timestamps: per-view is cheap and hides lagging subsets, per-entity is exact and large.", "Recording max event time versus min across shards: max looks fresh and hides stragglers, min is honest and is dominated by the slowest partition."],
    p: ["The watermark is updated at the start of a job, so a failed run still shows as fresh.", "A single idle shard holds the minimum back and falsely reports the whole view as stale."],
    v: "Complete a run and compare the recorded freshness with the maximum event time actually present in both stores; they must match. Fail a run midway and confirm the recorded value does not advance.",
    dep: ["materialization-state", "metadata-registry"]
  },
  "materialization-state": {
    s: "The record of which intervals of which views have been computed, with what code version and result, so reruns skip finished work and a failed run can resume.",
    d: "State is kept per view and interval: status, start and end times, code and definition version, input snapshot identifiers and output location. The scheduler consults it to decide what to run and the backfill engine to find gaps. Keeping it in a transactional store gives atomic transitions. A fingerprint of definition and inputs tells when previously computed intervals are no longer valid because the logic changed, which is what forces recomputation.",
    k: ["Tracking intervals versus a single high-water mark: intervals handle gaps and out-of-order completion, a mark is simpler and cannot represent holes.", "Fingerprinting inputs versus trusting code version only: fingerprints catch changed upstream data and cost extra reads, versions only detect code changes."],
    p: ["State says an interval is complete after the data was deleted or corrupted, so it is never recomputed.", "Two schedulers update state concurrently and mark the same interval done with different outputs."],
    v: "Delete one interval's output and confirm a state audit flags it as missing; change the definition and confirm the dependent intervals are marked as needing recomputation.",
    dep: ["metadata-registry", "definition-versioning"]
  },
  "failure-and-retry": {
    s: "The policies for what happens when a materialization step fails: how often to retry, when to stop, how to alert and how to avoid partial or duplicated output.",
    d: "Failures come from sources, compute capacity, the stores and bad data. Transient ones are retried with backoff and limits, while deterministic failures, such as a schema mismatch, are not retried but alerted. Jobs write to staging and commit at the end, so a failure leaves the previous values in place. Downstream runs are held until upstream succeeds. Long chains of retries can delay results beyond their usefulness, so a deadline decides when to give up and alert.",
    k: ["Retry automatically versus stop for a human: automatic retry heals transient errors, and repeats expensive jobs and masks real faults when the cause persists.", "Serve old values after failure versus expire them: serving old values keeps models running on stale input, expiry produces defaults that are visible."],
    p: ["An unfixable error is retried every hour for a week and generates a large bill and no alert.", "A retry runs against a half-written output location and fails again for a different reason."],
    v: "Inject a transient failure and a deterministic failure into two test runs; the first must succeed after retry with identical output, the second must stop after the limit and alert the owner.",
    dep: ["materialization-scheduler", "write-idempotency", "alert-routing"]
  },
});
