// Details for the time-series database plate, part 1: data model, ingestion, rules.
ATLAS.details("time-series-database", {
  "series-and-labels": {
    s: "A series is one stream of timestamped values, identified by a metric name plus a set of label key-value pairs. Every distinct label combination is a separate series.",
    d: "Labels such as host, region or endpoint let one metric name describe thousands of streams that can be filtered and grouped at query time. The full sorted label set is the identity of the series: change one value and it is a new series with its own index entry, chunks and memory. This makes labels cheap to query and expensive to create. The hard part is discipline: values that grow without bound, such as user ids, request ids or timestamps, turn the series count into the dominant cost.",
    k: ["Labels (indexed tags) vs fields (unindexed values): labels give fast selection and grouping; every new value costs index and head memory, while fields cost nothing to index but cannot be selected on.", "Metric name as a reserved label vs separate concept: treating it as a label simplifies the index and matchers; it also lets a bad query match across every metric."],
    p: ["Putting an unbounded value in a label creates millions of short-lived series, and memory and index size grow until the node is killed.", "Renaming a label or changing its case silently splits history into two disconnected series."],
    v: "Write the same metric with one label taking 1,000 distinct values and watch the head series count and memory rise by about 1,000 times the per-series cost; stop writing and confirm they fall after the next head truncation.",
    dep: []
  },
  "samples-and-fields": {
    s: "A sample is one timestamp and one value for a series. Some models group several named fields, each with its own value, under a shared label set and timestamp.",
    d: "In the label model each series carries a single value, usually a 64-bit float, and a wide measurement is several series that share labels. In the field model one point carries many typed values (float, integer, boolean, string) under one tag set and timestamp, stored together or as one series per field. Timestamps have a fixed resolution, often milliseconds or nanoseconds. The difficulty is typing: a field that changes type between writes must be rejected or split, and a 64-bit float cannot hold every large integer exactly.",
    k: ["One value per series vs multi-field points: single values keep the engine simple and compress well; multi-field points save index entries and keep related values atomically together.", "Millisecond vs nanosecond timestamps: coarse timestamps compress better and bound range arithmetic; fine ones preserve ordering for high-rate events but widen every timestamp delta."],
    p: ["Writing the same field first as an integer and later as a float is rejected or corrupts the series, depending on how strictly types are enforced.", "Large counters stored as floats lose precision above 2^53, so small increments vanish."],
    v: "Write a point with mixed field types, read it back, and confirm each value round-trips exactly. Write a conflicting type to the same field and confirm a clear rejection rather than a silent coercion.",
    dep: ["series-and-labels"]
  },
  "metric-types": {
    s: "Conventions for what a value means: a counter only increases, a gauge goes up and down, and histograms and summaries describe distributions. The type decides which functions make sense.",
    d: "The storage layer usually sees only floats; the type is a convention carried in metadata or naming. A counter must be queried as a rate of increase and tolerates resets to zero when a process restarts. A gauge is read as-is or averaged. A histogram is a family of cumulative bucket counters plus a sum and count. Metadata about type and unit may be stored per metric or dropped. The difficulty is that the database cannot enforce the contract, so applying an average to a counter or a rate to a gauge produces confident, wrong graphs.",
    k: ["Type stored as metadata vs implied by name: metadata enables validation and correct defaults but must be shipped and kept consistent; naming conventions need no plumbing but are unchecked.", "Cumulative vs delta counters: cumulative values survive lost samples because the next one recovers the total; delta values need no reset handling but lose data when a sample is dropped."],
    p: ["Averaging a counter across a window gives a number with no meaning, and the graph still looks plausible.", "Changing a metric from gauge to counter without renaming breaks every dashboard that reads it."],
    v: "Restart an instrumented process so its counter resets to zero and confirm the rate query shows no negative spike and no dip beyond one evaluation step.",
    dep: ["samples-and-fields"]
  },
  "exemplars": {
    s: "Exemplars attach a trace or request identifier to a specific sample, so an aggregated latency spike can be traced back to one concrete request.",
    d: "An exemplar is a small record of labels, a value and a timestamp that rides alongside a sample, typically on histogram buckets or counters. The database keeps them in a bounded in-memory ring buffer per series or per tenant, separate from sample chunks, and serves them through a dedicated query endpoint. Visualization tools overlay them on graphs. The difficulty is volume: exemplars are high-cardinality by nature, so they must not enter the index, and the buffer needs a hard size limit so they cannot crowd out ordinary data.",
    k: ["Separate bounded buffer vs storing with samples: a ring buffer protects memory and avoids index growth, but exemplars age out quickly and are lost on restart unless logged.", "Exemplars on every sample vs sampled: full capture links any point to a trace, but multiplies ingest bytes; sampled capture is cheap and usually enough to find a representative request."],
    p: ["Exemplar labels carrying large payloads inflate write requests and are dropped by size limits without warning.", "A trace id that points to a trace already removed by the tracing system gives a dead link."],
    v: "Write a histogram sample with an exemplar, query the exemplar endpoint for that series and time range, and confirm the trace id and value come back; confirm the series count did not change.",
    dep: ["series-and-labels", "samples-and-fields"]
  },
  "native-histograms": {
    s: "Compact representations of a whole distribution in one sample: exponential-bucket histograms or mergeable sketches that replace a fixed set of separate bucket series.",
    d: "Classic histograms need one series per bucket with boundaries fixed at instrumentation time. A native histogram stores sparse buckets on an exponential scale, plus count, sum and a zero bucket, as one sample in one series, so resolution can be much higher at lower cost. Sketches provide similar mergeable quantile estimates with a bounded relative error. They aggregate correctly across series by adding buckets, which averaging precomputed quantiles never does. The hard parts are reconciling bucket schemas of different resolutions and extending the encoding, query functions and wire protocols.",
    k: ["Exponential native buckets vs configured fixed buckets: native buckets need no tuning and give uniform relative error; fixed buckets give exact boundaries for service-level thresholds but explode series count.", "Mergeable sketches vs client-side quantiles: sketches allow aggregation across instances; precomputed quantiles are cheaper but cannot be combined without large error."],
    p: ["Averaging per-instance 99th percentiles instead of merging buckets produces a number that is not the fleet's 99th percentile.", "Mixed bucket resolutions across versions force lossy downscaling at query time if not planned."],
    v: "Ingest the same latency distribution as a native histogram from two instances, merge them in a query, and compare the estimated 99th percentile to the exact value from raw data; the error should stay within the stated bound.",
    dep: ["samples-and-fields", "histogram-chunk-encoding"]
  },
  "event-records": {
    s: "Discrete occurrences with many attributes, such as requests, deployments or errors, stored as rows with a timestamp rather than as sampled numeric series.",
    d: "An event has a timestamp, a set of typed columns and often high-cardinality values like user ids or URLs that would be ruinous as labels. Events are written once, rarely updated, and queried by time range, filters and aggregation over columns. Some databases model them as the same data as series with tags and fields; others keep a separate columnar store. Boundaries get blurry when events are counted into metrics. The difficulty is not forcing event data through a label index, which makes cardinality, not volume, the limit.",
    k: ["Events in the series model vs a dedicated columnar store: one model is simpler to operate; a columnar store handles high-cardinality columns without index growth but is another engine to run.", "Store raw events vs pre-aggregated counts: raw events answer questions nobody planned for; aggregates are far cheaper and bound storage, but the detail is gone."],
    p: ["Using a request id as a tag turns every event into its own series.", "Treating an event stream as sampled data causes duplicates or drops when a late event arrives with an old timestamp."],
    v: "Write one million events with a unique id column and confirm storage grows linearly in rows and the series count stays flat; then filter by that id and confirm the query returns one row quickly.",
    dep: ["columnar-segments"]
  },
  "text-exposition-format": {
    s: "A line-oriented text format in which a target lists its current metrics with names, labels, values and optional type and help lines, read by a scraper over HTTP.",
    d: "A scraper requests a path on the target and parses lines like name, braces with label pairs, then the value and an optional timestamp. Comment lines carry type and help metadata. Escaping rules for label values and special float tokens such as not-a-number and infinity are part of the format. Because it is plain text and carries no state, anyone can serve it by hand or inspect it with a browser. The difficulty is parsing speed at scale, since parsing text dominates scrape cost, and strict handling of malformed lines.",
    k: ["Text format vs binary protocol: text is human-readable and trivial to implement in any client; binary is smaller and faster to parse but needs generated code and tooling.", "Target-supplied timestamps vs scrape time: scrape time is consistent and cannot be spoofed; target timestamps preserve the true observation time but invite clock skew and out-of-order data."],
    p: ["One malformed line makes a strict parser reject the whole scrape, so a single bad metric hides all the target's data.", "Targets that generate metric names from request paths expose unbounded series in plain sight."],
    v: "Fetch a target's metrics page by hand, scrape it, and confirm every line becomes a sample with the right labels. Inject one bad line and confirm the scrape is marked failed with a parse error recorded.",
    dep: ["series-and-labels", "samples-and-fields"]
  },
  "line-protocol-ingest": {
    s: "A compact line-based text protocol for pushing points over HTTP, one line per point with measurement, tags, fields and an optional timestamp.",
    d: "Each line names the measurement, a comma-separated tag set, a space, the field set with typed values, and an optional integer timestamp. Clients batch many lines in one request body, often compressed. The server parses, validates field types against the schema it has seen, assigns the current time when no timestamp is given, and routes points into the write path. It is popular for devices and agents because it needs no client library. The difficulty is escaping of spaces and commas, type inference from literal syntax, and silent partial writes.",
    k: ["Server assigns time when omitted vs client must send it: server time is simple for devices without clocks; client time keeps retries idempotent and keeps event order correct.", "Per-line errors that skip bad lines vs rejecting the request: partial writes keep most data flowing; atomic rejection avoids silent loss but makes one bad point block a batch."],
    p: ["Retrying a request without explicit timestamps writes the same points again at new times, creating duplicate data.", "A response that reports partial success is ignored by the client, so dropped lines are never noticed."],
    v: "Send a batch containing one malformed line and one valid one, and confirm the response names the rejected line and the valid point is queryable with the correct type.",
    dep: ["batching-and-backpressure", "samples-and-fields"]
  },
  "binary-push-protocol": {
    s: "A compressed, schema-based protocol for pushing batches of series and samples from agents or other databases, usually carried over HTTP.",
    d: "The request body is a serialized message listing series, each with its label set and an array of samples, then compressed as a whole. The receiver decodes it, checks limits, and hands the series to the write path. The same message format is used for forwarding between a database and its upstream, which makes it the basis of remote write. Versioned headers let senders and receivers negotiate features such as metadata, exemplars and native histograms. The hard parts are compatibility across versions and sending large batches without exceeding body or memory limits.",
    k: ["Whole-body compression vs per-series compression: whole-body gives better ratios and one pass; it requires buffering the entire request in memory before parsing.", "Send labels with every series vs a string table: repeating labels is simple and stateless; a table shrinks requests but needs coordinated versioning."],
    p: ["Senders that ignore retry hints amplify an overload with a retry storm.", "A receiver that does not recognize a newer field drops exemplars or histograms silently, so data seems to vanish."],
    v: "Send the same batch from a test client and confirm the sample count in the receiver's metrics matches the client's. Send a request over the size limit and confirm a clear rejection status.",
    dep: ["batching-and-backpressure", "series-and-labels"]
  },
  "pull-scraper": {
    s: "A component that fetches metrics from a list of targets on a fixed interval, attaches target labels, records whether each fetch succeeded, and writes the results.",
    d: "Targets come from service discovery or static lists. For each target a scrape loop runs on a schedule with a timeout, fetches and parses the page, applies relabeling, appends samples at the scrape timestamp, and records synthetic series such as an up value and scrape duration. When a series that existed last scrape is absent now, the scraper writes a staleness marker so queries stop looking back to old values. Scrape offsets spread load. The difficulty is scale: tens of thousands of targets, slow targets holding connections, and reload without gaps.",
    k: ["Pull vs push: pull makes down targets visible and centralizes control of rate; push works through firewalls and for short-lived jobs but cannot distinguish silence from failure.", "Fixed interval vs adaptive: fixed intervals make rate math predictable; adaptive intervals save cost on quiet targets but complicate queries and alerts."],
    p: ["Scrape timeouts longer than the interval pile up overlapping scrapes against a slow target.", "A discovery outage that returns an empty target list marks every series stale at once."],
    v: "Stop a target and confirm its up series drops to zero within one interval and that instant queries for its other series return nothing after the staleness marker, not stale values.",
    dep: ["text-exposition-format", "relabeling", "appender-transaction"]
  },
  "relabeling": {
    s: "Rules that rewrite, add, drop or hash labels on targets before scraping and on samples before storage, controlling what enters the database and with what identity.",
    d: "Each rule matches a regular expression against a joined set of source labels and then replaces, keeps, drops, maps or hashes a label. Target relabeling shapes scrape jobs and attaches metadata from discovery. Sample relabeling runs after parsing and is the usual place to drop expensive metrics or strip high-cardinality labels. Rules apply in order and each sees the previous result. The difficulty is correctness and cost: a regex mistake silently drops or merges series, and relabeling runs per sample on the hot path.",
    k: ["Drop at ingest vs drop at query: ingest-time drops save all storage and memory but are irreversible; query-time filtering keeps the data but still pays for it.", "Rewriting identity labels vs adding new ones: rewriting hides origin and can collide series; adding preserves information but increases the label set."],
    p: ["Two series relabeled to the same label set collide, and their interleaved samples look like a single flapping series.", "A rule that removes the instance label merges every target into one series with duplicate timestamps."],
    v: "Apply a drop rule to one metric name, scrape a target that exposes it, and confirm the series is absent from the index and storage while the target's other series remain.",
    dep: ["series-and-labels"]
  },
  "batching-and-backpressure": {
    s: "Grouping samples into larger requests on the way in, and signaling senders to slow down or retry when the node cannot keep up.",
    d: "Clients buffer points and send them in batches because per-request overhead dominates small writes. The server accepts a batch, appends it as one transaction, and returns once it is in the log. When the log, head or memory is saturated, the server returns an overload or rate-limit status with a retry hint, and well-behaved senders back off and queue. Queues are bounded, so a long outage drops the oldest data. The difficulty is choosing batch size and delay: bigger batches improve throughput but raise latency and the cost of a failed retry.",
    k: ["Large batches vs low latency: large batches amortize parsing and syncing; they delay visibility and make partial failure harder to attribute.", "Bounded sender queue vs unbounded: bounded queues protect the sender but drop data during long outages; unbounded ones lose nothing until the sender runs out of memory."],
    p: ["A sender that retries immediately on every error turns a brief stall into sustained overload.", "A batch that fails validation on one point is retried forever if the sender treats all errors as transient."],
    v: "Throttle the node's disk until the log stalls and confirm clients receive overload responses with retry hints, queue growth is bounded, and writes resume without duplication after the throttle is removed.",
    dep: ["write-ahead-log", "quotas-and-rate-limits"]
  },
  "out-of-order-ingest": {
    s: "The policy for a sample whose timestamp is older than the newest one already stored for that series: reject it, accept within a window, or insert it into history.",
    d: "Many engines assume timestamps within a series only increase, because it allows append-only chunks and strong compression. Real systems send late data: buffered agents reconnect, batches are reordered, clocks differ. The policy is a window: a sample is accepted if its age against the series maximum is within a configured limit, otherwise rejected as too old. Accepted samples go to a separate buffer and are merged at compaction. A sample with the same timestamp and a different value is a conflict and is rejected or the first value wins.",
    k: ["Strict in-order vs a window: strict ordering keeps the hot path and compression simple; a window recovers real late data but needs extra memory and a merge step at query time.", "Reject duplicates vs overwrite: rejecting is deterministic and protects stored history; overwriting lets corrected data replace bad data but breaks cached results and downsamples."],
    p: ["A shared timestamp between two agents writing the same series causes constant out-of-order and duplicate rejections.", "Raising the window to hours to absorb one slow agent inflates memory for every series."],
    v: "Write samples at t, t+60 and then t+30, and confirm the third is accepted or rejected according to the configured window, a counter records the outcome, and an accepted sample appears in the correct order in queries.",
    dep: ["out-of-order-buffer", "time-semantics"]
  },
  "rule-scheduler": {
    s: "Runs groups of rules at a fixed interval, in order within a group, with evaluation timestamps aligned to the interval and independent between groups.",
    d: "Rules are organized into groups that share an evaluation interval and execute sequentially so a later rule can use the output of an earlier one. The scheduler staggers groups to avoid thundering herds, aligns evaluations to wall-clock multiples of the interval, and records how long each took. A group that takes longer than its interval skips cycles and reports missed iterations. In a cluster, rule groups are sharded across rulers so each runs on one replica at a time. The difficulty is making results reproducible and avoiding gaps when the owning node changes.",
    k: ["Sequential rules in a group vs parallel: sequential order lets rules chain with no race; parallel gives speed but needs explicit dependencies.", "Evaluate at aligned timestamps vs at wall-clock start: alignment makes results line up for graphs and dedupe; it adds a small delay and can cause bursts on startup."],
    p: ["A slow rule delays every rule after it in the group and misses evaluations silently if the missed counter is not watched.", "Moving a rule group to another node can evaluate it twice or not at all around the handoff."],
    v: "Define a group with a thirty-second interval, let it run, and confirm the output series has samples at aligned timestamps with no gaps and the evaluation duration metric stays below the interval.",
    dep: ["query-api", "appender-transaction"]
  },
  "recording-rules": {
    s: "Rules that evaluate a query on a schedule and write the result back as a new series, so expensive aggregates are computed once and read cheaply.",
    d: "A recording rule has an output metric name, an expression and optional extra labels. Each evaluation runs the query at the evaluation time and appends one sample per resulting series. Dashboards then read the cheap precomputed series instead of aggregating thousands of raw series on every refresh. Naming conventions encode the level, labels kept and operation. The difficulty is that results are fixed at evaluation time: a rule cannot be corrected after the fact without backfilling, and it adds series that cost storage themselves.",
    k: ["Precompute with a rule vs compute at query: rules make dashboards fast and predictable; they add stored series and freeze the aggregation choice.", "Aggregating away labels vs keeping them: dropping labels cuts cardinality sharply; it makes later drill-down by those labels impossible."],
    p: ["A rule that aggregates a counter's rate and is then rated again gives a meaningless result.", "Rules fed from a lagging replica evaluate on incomplete data and write permanently wrong values."],
    v: "Create a rule summing a counter's rate across instances, then compare its output series to the same expression run ad hoc over the same period; the values should match at every evaluation timestamp.",
    dep: ["rule-scheduler", "aggregation-operators"]
  },
  "continuous-queries": {
    s: "Standing queries that run as data arrives or on a schedule, writing aggregates into another measurement or retention tier, mainly for downsampling.",
    d: "A continuous query selects from a source, groups by time interval and optionally tags, applies an aggregate, and writes into a destination, often in a longer-retention tier. It can run on a timer over the most recent complete interval or incrementally on ingest. This is how rollups were traditionally produced before storage-level downsampling. The difficulty is late data: an interval already aggregated does not change when a late point arrives unless the query re-runs over a trailing window, and a missed run leaves a permanent gap.",
    k: ["Timer-driven re-aggregation vs incremental on ingest: timers are simple and tolerate late data with a lookback; incremental is cheaper at scale but must hold partial state.", "Writing results to a new series vs the same one: separate output avoids collisions and lets retention differ; it doubles the names users must know."],
    p: ["Running only over the latest interval produces a hole for every interval where the node was down.", "Late points never reach the rollup, so long-range and short-range graphs disagree."],
    v: "Write raw points across several intervals, run the query, and compare the rollup series to an ad hoc aggregate over the raw data; then write a late point and confirm the rollup updates only if the lookback window covers it.",
    dep: ["rule-scheduler", "rollup-aggregates"]
  },
  "alerting-rules": {
    s: "Rules whose expression selects the series currently violating a condition; each result is a candidate alert with labels, annotations and a required duration.",
    d: "An alerting rule evaluates a boolean-style query each interval. Every returned series becomes an alert instance keyed by its labels. If the condition holds, the alert is pending; after it has held for the configured duration it fires. Labels and annotations can be templated from the query result. The engine writes synthetic series recording alert state. The difficulty is correctness near missing data: a series that vanishes makes the expression return nothing, which looks identical to healthy, so absence needs its own rule.",
    k: ["Require a hold duration vs fire immediately: a duration removes flapping and brief spikes; it delays the page by that amount and resets whenever one evaluation misses.", "Alert on symptoms vs causes: symptom alerts match user impact and have fewer false positives; cause alerts help diagnosis but fire for harmless internal changes."],
    p: ["An alert on a metric that disappears when its target dies never fires, because no series means no violation.", "Evaluating against a replica missing recent data creates false alerts that resolve themselves."],
    v: "Force a condition true for longer than the hold duration and confirm the alert goes pending then firing at the expected time; kill the data source and confirm the absence rule fires.",
    dep: ["rule-scheduler", "query-api"]
  },
  "alert-state-and-notify": {
    s: "Tracks each alert's pending, firing and resolved state across evaluations and hands firing alerts to a separate notification service, resending until resolved.",
    d: "The evaluator keeps state per alert instance, including when it became active and when it last fired, and persists it so a restart does not reset hold timers. Firing alerts are posted to one or more notification endpoints at a regular resend interval, with a resolved message when the condition clears. Grouping, silencing and routing live in the notification service, not here. The difficulty is state across restarts and handoffs: lost state means pending alerts restart their timers, and duplicate evaluators send duplicates.",
    k: ["Persisted alert state vs recomputed: persistence preserves hold timers across restarts; recomputation is stateless and simple but delays alerts after every restart.", "Evaluator resends vs notifier tracks: resending makes delivery self-healing; it requires the notifier to deduplicate and coalesce."],
    p: ["Two replicas of the evaluator both send the same alert, and without deduplication people are paged twice.", "A failed notification endpoint is retried only at the resend interval, so a real alert arrives late."],
    v: "Trigger an alert, restart the evaluator while it is pending, and confirm it still fires on its original schedule and that the notification service received exactly one grouped alert.",
    dep: ["alerting-rules"]
  },
  "rule-backfill": {
    s: "Evaluating a recording rule over a past time range to create the series it would have produced, so a new rule has history.",
    d: "A newly added recording rule only produces data from the moment it starts. Backfill runs the expression at each past evaluation step against stored data, aligns steps to the rule interval, and writes the output as blocks that are then imported. It must read data at the resolution that existed then and avoid overlapping with the live rule's output. The difficulty is cost and consistency: the range may span months of raw data, and results can differ from what a live rule would have produced if data arrived late or was since deleted.",
    k: ["Write backfill as new blocks vs through the normal write path: blocks avoid head memory and out-of-order limits; they must not overlap live data or compaction will merge them oddly.", "Backfill with current data vs skip history: backfill makes new dashboards useful at once; it can take hours of read load on production nodes."],
    p: ["Backfilled blocks overlapping the live rule's range produce duplicate samples with slightly different values.", "Running a wide backfill on the live query path starves interactive queries."],
    v: "Backfill a rule for the previous week, then compare each output sample against the same expression run ad hoc at that timestamp; values should agree, and no overlap warnings should appear in compaction logs.",
    dep: ["recording-rules", "backfill-import"]
  },
});
