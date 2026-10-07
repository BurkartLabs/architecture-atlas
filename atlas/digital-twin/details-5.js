// Details for the digital twin plate, part 5: history, ingestion and data quality.
ATLAS.details("digital-twin", {
  "time-series-store": {
    s: "A database specialized for timestamped values, sustaining very high write rates and answering range queries by asset, property and time efficiently and compactly.",
    d: "Data is partitioned by time and by series, written in append-only blocks, and compressed using the fact that successive values and timestamps are close. Indexes map series identity to blocks, and queries scan only the ranges asked for. It stores value, timestamp and quality together. It supports aggregation pushdown. The hard part is cardinality and balance: millions of series with small writes stress the index and write path, while long-range analytical reads want large sequential blocks.",
    k: ["Purpose-built time-series engine vs general database with time partitioning: purpose-built is faster and cheaper per point; a general database is familiar and weaker at scale.", "Wide rows per asset vs one series per property: per asset reads whole-asset snapshots quickly; per property supports sparse and independent sampling."],
    p: ["A tag naming scheme that embeds changing values explodes the series count and the index.", "Out-of-order writes into already compressed blocks force costly rewrites."],
    v: "Write the target rate of points for a day, then query one series over a month and an asset's properties at one instant, and confirm write latency, query latency and storage per point meet stated limits.",
    dep: ["message-broker", "telemetry-schema", "quality-flags"]
  },
  "rollups-and-downsampling": {
    s: "Precomputed summaries such as minimum, maximum, mean and count over fixed intervals, so long-range charts and reports read small tables instead of raw points.",
    d: "Background jobs aggregate raw data into one-minute, hourly and daily summaries, keeping several statistics per interval so spikes survive. Queries pick the coarsest level that fits the requested resolution. Late data triggers recomputation of affected buckets. Rollups also feed retention: raw data may expire while summaries stay. The hard part is choosing statistics: a mean alone hides excursions, and summaries of derived or discrete signals, such as states, need different rules than analog values.",
    k: ["Several statistics per bucket vs mean only: several preserve extremes and cost storage; mean only is compact and misses spikes.", "Continuous incremental rollups vs scheduled batch: incremental keeps summaries current and complicates late data; batch is simple and lags."],
    p: ["Averaging a discrete status signal produces fractional states that mean nothing.", "Late data arrives and old summaries are not refreshed, so charts disagree with raw queries."],
    v: "Compare a month-long rollup chart with a raw-point query over the same range and confirm minimum and maximum match exactly, and that adding a late point updates the affected bucket.",
    dep: ["time-series-store", "late-and-out-of-order-data"]
  },
  "retention-and-tiering": {
    s: "Rules for how long data is kept at each resolution and where it lives, moving it from fast storage to cheaper storage and eventually deleting it.",
    d: "Policies are set per data class: raw high-rate data for weeks, summaries for years, events and alarms for the regulatory period. Data ages from memory or fast disk to cheaper object storage and to a cold archive, staying queryable at lower speed. Expiry runs as background jobs and honors holds placed for investigations. The hard part is predicting need: analytics and incident reviews often want raw data from long ago, and deleted data cannot be recovered.",
    k: ["Aggressive expiry of raw data vs long raw retention: aggressive saves storage and prevents later reanalysis; long retention is costly and keeps options.", "Transparent tiering vs explicit archive restore: transparent queries are simple and unpredictably slow; explicit restore is predictable and inconvenient."],
    p: ["Raw data for an incident expires before the investigation begins.", "A legal hold is not respected by the automatic expiry job."],
    v: "Age a test series past each tier boundary and confirm it stays queryable with the documented latency, that raw points expire on schedule while rollups remain, and that a held series is not deleted.",
    dep: ["time-series-store", "rollups-and-downsampling", "twin-lifecycle"]
  },
  "event-and-alarm-log": {
    s: "An append-only record of discrete things that happened: alarms, state changes, commands, operator actions, maintenance and model changes, each with time, asset and cause.",
    d: "Unlike sampled values, events have a start, an end or a moment, a type and attributes. The log stores them indexed by time, asset and type, and joins them to time-series data for context. It is the evidence for investigations, the source for availability calculations and the label store for learning. The difficulty is completeness and consistency: events come from many systems with different clocks and definitions, and a missing stop event leaves an alarm active forever.",
    k: ["One unified event log vs per-source logs: unified allows cross-system timelines and needs normalization; per-source is simple and hard to correlate.", "Events with durations vs separate start and end events: durations are easy to query and need closing logic; separate events are faithful and need pairing."],
    p: ["A lost clear event leaves an alarm shown as active for months, distorting availability.", "Operator actions are logged in a different system and never appear on the incident timeline."],
    v: "Reconstruct a known incident from the log alone and confirm every alarm, operator action and command appears in order with the right asset, and that every start has a matching end.",
    dep: ["message-broker", "time-alignment", "audit-and-change-history"]
  },
  "point-in-time-reconstruction": {
    s: "Rebuilds the complete state of the twin as it was at any past moment, including model structure, values, quality and modes, not just the values.",
    d: "Reconstruction starts from the nearest earlier snapshot, applies recorded changes forward to the target time, and resolves the model version in force at that time. Values are taken with the quality they had then, and later corrections are available as an option. Both what the platform believed then and what it now knows to be true can be requested. The hard part is bitemporal accuracy: corrections, late data and model changes mean the past can be rewritten.",
    k: ["As-known-then vs as-corrected-now: as-known-then reproduces the decision context; as-corrected shows the truth and cannot explain why people acted.", "Reconstruct on demand vs store full state continuously: on demand is compact and slower; continuous storage is fast and large."],
    p: ["Reconstruction uses today's model structure for last year's data, and assets appear in places they never were.", "A correction made later changes what an incident review shows without notice."],
    v: "Reconstruct the twin at a recorded incident time and confirm values, structure and model version match the snapshot taken then, and that requesting the corrected view shows the differences explicitly.",
    dep: ["state-snapshots", "time-series-store", "event-and-alarm-log", "schema-versioning"]
  },
  "replay-engine": {
    s: "Plays recorded history through the twin as if it were live, at adjustable speed, driving views, rules, analytics and simulations to reproduce or investigate past events.",
    d: "The engine reads recorded inputs in time order from a chosen start, feeds them into an isolated copy of the processing pipeline, and advances a virtual clock. Views, detectors and models respond exactly as they would have. Replays are used for incident review, for testing new analytics against real history and for training operators. The hard part is isolation and determinism: replay must never trigger real actions, and components that use wall-clock time or random numbers give different results each run.",
    k: ["Replay recorded inputs vs recompute from stored outputs: replaying inputs tests new logic; showing stored outputs shows what actually happened.", "Real-time pacing vs accelerated: real-time pacing is faithful for training; acceleration is efficient and stresses components with time-dependent logic."],
    p: ["A replayed alarm triggers a real notification or command because isolation was incomplete.", "A component reads the system clock and produces results that differ on every replay."],
    v: "Replay a recorded day twice through the same code version in isolation, confirm the two runs produce identical alerts, and confirm no external notification or command is sent.",
    dep: ["point-in-time-reconstruction", "time-series-store", "event-and-alarm-log", "tenant-isolation"]
  },
  "historical-query-engine": {
    s: "Answers analytical questions over history, such as values over a range, aggregates by asset group and conditions across assets, with the right resolution picked automatically.",
    d: "The engine plans a query against raw data, rollups and the event log, pushes filters and aggregations down to storage, joins with the asset hierarchy to resolve groups, and returns results aligned to a requested grid. It enforces limits and permissions and caches common queries. The hard part is the shape of queries: a question about all pumps in a region over a year touches thousands of series, and the planner must keep it from scanning everything.",
    k: ["Query by asset context vs by raw series id: asset context is natural and requires the hierarchy at plan time; series ids are direct and fragile.", "Exact results vs approximate for speed: exact is trustworthy and slower; approximate is interactive and not usable for audit."],
    p: ["A fleet-wide query without a time limit holds the store for minutes and slows live views.", "Results mix quality-flagged and good data without saying so."],
    v: "Run a query over all assets of one type across a year, and confirm the answer matches an independent computation on a sample and completes within the stated time with flagged data counted separately.",
    dep: ["time-series-store", "rollups-and-downsampling", "asset-hierarchy", "event-and-alarm-log"]
  },
  "backfill-and-reprocessing": {
    s: "Loads historical data from old systems and recomputes derived data when logic, models or corrections change, without disturbing live processing.",
    d: "Backfill brings years of records from historians or files into the store at a controlled rate, mapped to the current model. Reprocessing reruns pipelines, such as rollups, indicators and classifications, over affected ranges using the new logic and versions the outputs. It runs alongside live ingestion and must not overwrite newer data. The hard part is scale and consistency: reprocessing months of data is expensive, and live consumers should see the old or new result, never a mixture.",
    k: ["Recompute in place vs write new versions and switch: in place is simple and exposes partial results; versioned outputs are safe and double storage during the switch.", "Throttled background backfill vs fast dedicated window: throttled protects live service and takes long; a window is quick and needs downtime or isolation."],
    p: ["Backfilled history overwrites newer corrected values with older source data.", "A reprocessing run changes past KPIs without any record of why."],
    v: "Backfill a known historical extract, then confirm point counts and checksums match the source, live ingest was not delayed beyond limits, and rerunning produces no duplicates.",
    dep: ["time-series-store", "batch-and-file-ingest", "point-mapping", "data-lineage-and-provenance"]
  },
  "message-broker": {
    s: "A durable, partitioned stream between devices and the platform that decouples producers from consumers and holds data while downstream components are slow or restarting.",
    d: "Gateways publish readings to topics keyed by device or asset, the broker persists them in ordered partitions and consumers read at their own pace with tracked positions. It provides replay of recent data, retention in hours or days, and per-key ordering. Several consumers, such as storage, state and analytics, read the same stream independently. The hard part is sizing and hot keys: a handful of very chatty assets can overload one partition while others sit idle.",
    k: ["Partition by asset vs by arrival: by asset preserves per-asset order and risks hot partitions; by arrival balances load and loses ordering.", "Long retention for replay vs short retention for cost: long allows reprocessing after a bug; short saves storage and removes the safety net."],
    p: ["One consumer's lag is not monitored and it silently falls beyond retention, losing data.", "A malformed message blocks a partition if consumers retry it forever."],
    v: "Publish a known set of messages, stop one consumer midway, restart it, and confirm it resumes from its recorded position with no loss and per-asset order preserved.",
    dep: ["store-and-forward"]
  },
  "point-mapping": {
    s: "The table that ties each raw tag, register or message field from a device to a property on an asset in the model, with scaling and unit conversion.",
    d: "Devices report values by address or name with no knowledge of the model. The mapping assigns each to an asset property, applies scaling such as raw counts to engineering units, offsets, inversion and enumerations, and records the source system. Mappings are generated during provisioning, reviewed and versioned. A change to a PLC program or device template changes addresses and the mapping must follow. The hard part is correctness at scale: thousands of mappings are done once, rarely re-checked, and wrong ones feed plausible nonsense.",
    k: ["Mapping in the platform vs mapping at the edge: in the platform is central and auditable; at the edge keeps raw systems out of the model and spreads configuration over many sites.", "Generated from naming conventions vs hand-maintained: generated is fast and wrong when conventions are broken; hand-maintained is exact and costly."],
    p: ["A scaling factor entered wrongly makes a flow ten times too high and nobody notices until a model disagrees.", "After a controller program change, addresses shift and values land on the wrong properties."],
    v: "Force a known value at a device point, trace it through the mapping to the property, and confirm the displayed engineering value matches an independent reading at the instrument.",
    dep: ["telemetry-schema", "units-and-semantics", "device-registry"]
  },
  "payload-decoding": {
    s: "Turns device-specific binary and text payloads into structured readings, handling byte order, bit fields, packing, compression and versions of the format.",
    d: "Decoders are selected by device type and payload version and extract fields from binary frames, text lines or structured messages, converting to typed values with timestamps. Failures are routed for inspection, not dropped. Decoders are tested against recorded samples and hot-deployable. The hard part is variety and change: devices from many suppliers use many formats, firmware updates alter layouts without notice, and a wrong decoder yields valid-looking numbers.",
    k: ["Declarative decoder definitions vs code: declarative are safe and reviewable and limited in expressiveness; code handles any format and requires sandboxing.", "Decode at the edge vs in the platform: at the edge reduces bandwidth and spreads decoder updates; in the platform is central and moves raw bytes."],
    p: ["Byte-order confusion yields wrong values within a plausible range.", "A firmware release changes the layout and the old decoder keeps running on new data."],
    v: "Run the decoder against a library of recorded payloads from each firmware version and confirm decoded values equal the device's own displayed values, and that an unknown version is rejected to the dead-letter queue.",
    dep: ["message-broker", "telemetry-schema", "dead-letter-queue"]
  },
  "stream-processing-engine": {
    s: "Runs continuous computations over incoming readings, such as filters, windows, joins and rules, with managed state and results emitted as new streams.",
    d: "Operators are connected into a dataflow, partitioned by key, with state such as windows and counters checkpointed so that processing resumes after failure without loss or double counting. Time is event time driven by watermarks. It hosts rules, derived properties, quality checks and feature calculations. The hard part is correctness under failure and lateness, and state size: long windows over many assets hold a lot of memory.",
    k: ["Exactly-once with checkpoints vs at-least-once with idempotent writes: exactly-once is simplest for users and costs throughput; at-least-once is faster and needs careful design downstream.", "Event-time processing vs processing-time: event time gives correct results with late data and needs watermarks; processing time is simple and wrong when delayed."],
    p: ["Unbounded state from a window per asset grows until a node runs out of memory.", "A slow operator creates backpressure that stalls unrelated pipelines on the same node."],
    v: "Kill a processing node mid-stream and confirm that outputs afterward contain no gaps or duplicates relative to a reference run, and that a delayed batch lands in the correct window.",
    dep: ["message-broker", "backpressure-and-buffering", "time-alignment"]
  },
  "stream-enrichment": {
    s: "Adds context to each reading as it flows through: asset identity, hierarchy path, operating mode, shift and limits, so downstream consumers do not each look it up.",
    d: "A raw reading knows only a device and a tag. Enrichment joins it with the model to add asset id, type, location path and unit, and with reference data such as the production schedule. Lookups are served from a cached copy of the model that updates when the model changes. The hard part is staleness and cost: a reading enriched with an outdated hierarchy is attributed to the wrong parent forever, and per-message lookups at high rates need local caches.",
    k: ["Enrich at ingest and store the result vs enrich at read: at ingest is fast to query and freezes the context; at read is flexible and re-evaluates each time.", "Cached model copy vs lookup per message: cached is fast and briefly stale; lookup is exact and does not scale."],
    p: ["After a machine moves, new readings are enriched with the old parent for minutes.", "Context lookup failures are swallowed and readings pass through unlabelled."],
    v: "Move an asset in the model during a live stream and confirm readings after the change carry the new path within the stated delay, and that a lookup failure routes the reading to a visible error path.",
    dep: ["point-mapping", "asset-hierarchy", "stream-processing-engine"]
  },
  "deadband-and-compression": {
    s: "Reduces data volume by sending or storing only meaningful changes, using deadbands, exception reporting and swing-door style compression, while bounding the error introduced.",
    d: "A value is passed on only when it moves more than a tolerance from the last reported one, or after a maximum interval. Compression can apply at the device, the edge and the store, each with its own tolerance. The reconstructed signal differs from the original by at most the tolerance. It cuts bandwidth and storage greatly on slow signals. The hard part is tolerances: set too wide they erase what analytics need, and they compound when several stages each apply their own.",
    k: ["Compress at the source vs store raw: at the source saves network and storage and cannot be undone; raw is flexible and expensive.", "Fixed tolerance vs tolerance tied to sensor accuracy: fixed is simple; tied to accuracy removes noise only and needs sensor data."],
    p: ["Two stages each apply a tolerance and the combined error exceeds what the models expected.", "A flat line from compression is read as a frozen sensor and triggers a false flag."],
    v: "Compress a recorded signal at the configured tolerance, reconstruct it, and confirm the maximum deviation from the original stays within the tolerance and that reduction meets the expected ratio.",
    dep: ["edge-gateway", "time-series-store", "flatline-and-dropout-detection"]
  },
  "batch-and-file-ingest": {
    s: "Loads data that arrives as files or extracts, such as historian exports, lab results and inspection logs, with validation, mapping and idempotent re-loading.",
    d: "Files are picked up from drops or interfaces, parsed against a declared format, validated, mapped to model properties and written with their original timestamps. Each file is tracked so it is processed once, and failures are quarantined with a reason. Manual data such as lab samples and inspection readings enters this way. The hard part is irregular sources: formats change quietly, time zones are implied, and the same file arrives twice or partly overlapping.",
    k: ["Strict format contracts vs tolerant parsing: strict catches changes immediately and rejects data; tolerant keeps flowing and loads wrong data silently.", "Idempotent load by file hash vs by record key: file hash is simple and misses overlapping files; record key handles overlap and needs stable keys."],
    p: ["A file in local time without a zone is loaded as UTC and shifted by hours.", "A partially written file is picked up and half its rows are lost."],
    v: "Load the same file twice and an overlapping second file, and confirm point counts equal the union without duplicates, with each value timestamped in the correct zone.",
    dep: ["point-mapping", "time-series-store", "dead-letter-queue", "data-lineage-and-provenance"]
  },
  "backpressure-and-buffering": {
    s: "The mechanisms that keep ingestion stable when data arrives faster than it can be processed: bounded buffers, flow control, shedding by priority and visible lag.",
    d: "Each stage has a bounded queue. When one fills, upstream is slowed through flow control or, if it cannot be slowed, lower-priority data is dropped or sampled while critical signals and alarms are protected. Buffers at the edge absorb link outages. Lag per stage is exported as a metric. The hard part is policy: deciding what is safe to drop in an incident, when data volume peaks, and ensuring a backlog drains afterward without starving fresh data.",
    k: ["Block producers vs drop data: blocking preserves everything and can stall devices; dropping keeps the system moving and loses information.", "Priority classes vs uniform treatment: classes protect alarms and complicate every queue; uniform is simple and lets noise displace what matters."],
    p: ["A backlog after an outage replays at full speed and starves live data.", "Unbounded buffers hide a slow stage until memory is exhausted."],
    v: "Overload ingestion at twice its capacity and confirm alarm and safety-relevant signals still arrive within their latency target, dropped data is counted by class, and lag returns to normal after the load ends.",
    dep: ["message-broker", "store-and-forward", "platform-observability"]
  },
  "dead-letter-queue": {
    s: "A holding area for messages that cannot be decoded, mapped or validated, kept with the reason so they can be inspected, fixed and reprocessed instead of lost.",
    d: "When a stage cannot process a message after limited retries it moves it, with error, source and attempts, to a separate queue. Operators can browse and group failures, fix the decoder or mapping, and replay messages into the pipeline. Counts and age are monitored, since a growing queue means a broken source. The hard part is operational: dead-lettered data is invisible to users unless somebody owns the queue, and replaying after a fix must preserve original times.",
    k: ["Retry before parking vs park immediately: retries recover transient errors and delay the real problem; immediate parking is fast and parks recoverable messages.", "Keep payloads indefinitely vs expire: keeping allows late fixes and may hold sensitive data; expiring saves space and loses evidence."],
    p: ["Nobody watches the queue, and a month of data from a new device type sits unprocessed.", "Reprocessed messages are stamped with replay time, not original time."],
    v: "Send a message with an unknown format, confirm it lands in the queue with the reason, deploy a fixed decoder, replay it, and confirm the reading appears in history at its original timestamp.",
    dep: ["message-broker", "platform-observability"]
  },
  "range-and-rate-checks": {
    s: "Basic plausibility tests on each reading: within physical limits, not changing faster than the process allows, and consistent with its declared type and unit.",
    d: "Limits come from the telemetry schema or the asset type: absolute minimum and maximum, maximum rate of change and allowed discrete values. Readings that fail are flagged, not deleted, and the flag travels with the value. Checks run in the stream, and cross-signal checks compare related values, such as outlet temperature above inlet. They catch gross errors cheaply. The hard part is choosing limits: tight limits flag real excursions as bad data, and loose ones let faults through.",
    k: ["Flag and keep vs discard: flagging preserves evidence and puts the burden on consumers to respect flags; discarding is clean and loses genuine extreme events.", "Static limits vs mode-dependent limits: static is simple and wrong at startup; mode-dependent is accurate and relies on mode detection."],
    p: ["A real emergency excursion beyond limits is flagged as a sensor fault and ignored.", "Limits copied from a different asset size reject normal values."],
    v: "Send values just inside and just outside each limit and a step change faster than the allowed rate, and confirm each is flagged correctly and passes through with the reason recorded.",
    dep: ["telemetry-schema", "stream-processing-engine", "quality-flags"]
  },
  "flatline-and-dropout-detection": {
    s: "Detects sensors that stop updating, repeat the same value, or report implausibly constant readings, and distinguishes a quiet process from a dead instrument.",
    d: "A series is checked for gaps longer than its expected interval, and for identical values over a window longer than natural variation allows for that signal and mode. Detection also uses the sensor's noise floor: a real analog signal always jitters. Findings mark the property as stale or suspect and raise a maintenance item. The hard part is context: a steady process legitimately holds a constant value, and a compressed or deadbanded signal looks flat by design.",
    k: ["Per-signal expected interval vs one default: per-signal reduces false flags and needs configuration; one default is simple and wrong for slow signals.", "Alert on first gap vs after confirmation: first gap is quick and noisy; confirmation is calmer and keeps stale values in use longer."],
    p: ["A frozen sensor keeps showing its last value as live, and models act on it.", "Deadband compression upstream makes healthy slow signals look frozen."],
    v: "Freeze a test signal and confirm the property is marked stale within its configured window, while a legitimately steady but noisy signal and a deadbanded signal are not flagged.",
    dep: ["time-series-store", "deadband-and-compression", "quality-flags", "operating-mode-detection"]
  },
  "redundant-sensor-voting": {
    s: "Combines readings from duplicate or related sensors, using voting or consistency checks to reject the faulty one and produce a single trusted value.",
    d: "Where two or three sensors measure the same quantity, the platform compares them, selects the median or a weighted value, and identifies an outlier. Where no duplicate exists, analytic redundancy uses model relationships between different sensors, such as flow, pressure and valve position. The result is a validated value with a confidence. The hard part is common-cause faults: sensors sharing a power supply, a wiring path or a calibration error fail together and agree with each other.",
    k: ["Median of three vs average: median rejects one bad sensor outright; averaging smooths noise and is pulled by a bad value.", "Physical redundancy vs analytic redundancy: physical is robust and costs hardware; analytic needs no extra sensors and depends on model correctness."],
    p: ["Two sensors on one impulse line fail identically and outvote a correct third.", "Voting silently continues with a single sensor after the others failed."],
    v: "Corrupt one of three sensors in a test, confirm the output stays within tolerance of the true value, the corrupted sensor is named, and the system warns when only one healthy sensor remains.",
    dep: ["quality-flags", "range-and-rate-checks", "physics-based-models"]
  },
  "calibration-drift-tracking": {
    s: "Tracks how sensors' accuracy changes over time by comparing against references, peers and models, and records calibration events so measurements can be corrected or trusted less.",
    d: "Drift appears as a slow bias between a sensor and a reference such as a redundant sensor, a model prediction or a periodic manual check. The platform trends the bias, estimates the sensor's uncertainty, schedules recalibration and records each calibration with its before and after values. Corrections can be applied to history. The hard part is attribution: apparent drift can come from the process, the model or the sensor, and applying a correction to the wrong one makes things worse.",
    k: ["Correct drift in the data vs only widen uncertainty: correcting restores accuracy and rewrites history; widening is honest and leaves analytics noisier.", "Scheduled calibration vs condition-based: scheduled is simple and wasteful; condition-based saves visits and relies on drift estimates."],
    p: ["A recalibration shifts a series by a step that analytics read as a real change.", "Calibration records live in a maintenance system and are never linked to the data."],
    v: "Take a sensor whose calibration is known to have drifted, run it against a reference, and confirm the platform estimates the bias within tolerance and attaches the calibration event to the affected period.",
    dep: ["redundant-sensor-voting", "time-series-store", "work-order-integration", "quality-flags"]
  },
  "quality-flags": {
    s: "A quality status carried with every value, such as good, uncertain, substituted or bad, so every consumer can tell how far to trust a number and why.",
    d: "Each reading has a quality code with reason bits: source reported bad, failed range check, stale, imputed, manually overridden. Flags are set by devices and by the quality components, combined by worst-case rules when values are aggregated, and kept in storage next to the value. Analytics, views and models read them and decide whether to use, show or ignore. The hard part is discipline: if any stage drops the flag, the information is lost for good.",
    k: ["Rich reason codes vs a simple good/bad flag: rich codes support precise handling and make every consumer more complicated; simple is easy and loses cause.", "Propagate worst quality through aggregates vs ignore bad inputs: worst-case is safe and often marks everything uncertain; ignoring gives clean numbers."],
    p: ["A rollup drops flags and a chart shows a repaired value as measured.", "Consumers ignore the flag and train models on bad data."],
    v: "Inject a bad reading, then follow it through storage, a rollup, a view and a model input, confirming each stage shows or honors the flag and an aggregate over it is marked.",
    dep: ["time-series-store", "telemetry-schema"]
  },
  "gap-filling-and-imputation": {
    s: "Fills missing values using interpolation, models or carry-forward, marking every filled value so downstream users know it is an estimate, not a measurement.",
    d: "Short gaps may be filled by linear interpolation or holding the last value, longer gaps by model-based or correlation-based estimates from related signals. Filled values get a substituted flag and an uncertainty. Whether to fill at all depends on the consumer: charts may show gaps, while a simulation needing a continuous input must have something. The hard part is false authority: a filled value looks like data, and decisions on invented values can be dangerous.",
    k: ["Fill in storage vs fill at use: filling in storage is consistent for all consumers and hides gaps from those who want them; at use lets each choose.", "Simple interpolation vs model-based imputation: interpolation is predictable and bad over long gaps; model-based is better and can reinforce its own assumptions."],
    p: ["A long outage is bridged by a straight line and analytics report calm operation.", "Imputed values train a model that then learns to predict the imputation rule."],
    v: "Remove segments of known data of different lengths, run the filler, and compare with the true values to confirm error grows as expected with gap length and every filled point is flagged substituted.",
    dep: ["quality-flags", "time-series-store", "physics-based-models"]
  },
  "data-lineage-and-provenance": {
    s: "Records where each value and derived result came from: the source device, the mapping, every transformation and the model or code version, so results can be explained and reproduced.",
    d: "Lineage metadata is captured as data moves: source system, decoder and mapping versions, quality actions, rollup and model versions. A result such as a health score can be traced back to raw readings and the exact code that produced it. It supports audits, debugging and trust in analytics. The hard part is overhead and completeness: tracing every point is expensive, so systems record lineage at the level of pipelines and ranges, and gaps in tracking defeat the purpose.",
    k: ["Per-value lineage vs per-pipeline lineage: per-value gives exact answers and large metadata; per-pipeline is compact and approximate for individual points.", "Lineage captured automatically vs declared by developers: automatic is complete for what it sees and misses custom code; declared is flexible and often forgotten."],
    p: ["A transformation step that does not record its version makes a result unreproducible.", "Lineage is stored apart from the data and drifts out of step."],
    v: "Take a reported health score, trace it back through the platform to the raw readings, mapping version and model version, then rerun with those versions and confirm the same score.",
    dep: ["point-mapping", "stream-processing-engine", "schema-versioning"]
  },
});
