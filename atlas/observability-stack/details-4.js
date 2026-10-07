// Details for the observability stack plate, part 4: signal APIs and SDKs, context and metadata.
ATLAS.details("observability-stack", {
  "telemetry-api": {
    s: "A small, vendor-neutral interface that application and library code calls to create metrics, spans and logs, which does nothing until an SDK is installed behind it.",
    d: "The API defines the calls for getting a tracer, meter or logger, starting spans, recording measurements and reading the current context. Without a configured implementation it falls back to no-op objects, so libraries can instrument themselves with no cost or dependency on a backend. Applications choose the SDK and exporters at startup. Stability is the key property: the API must change rarely, because every library in every service depends on it, and mismatched versions in one process must not break the application.",
    k: ["Separate API from SDK vs one package: separation lets libraries instrument safely and keeps backends swappable, while one package is simpler and forces every library to pull in an implementation.", "No-op default vs failing without configuration: no-op never breaks the host, while failing loudly would reveal misconfiguration and break production."],
    p: ["Two copies of the API in one process, from different library versions, hold separate global state and one set of telemetry goes nowhere.", "A library that calls the SDK directly forces its choice of backend on every application that uses it."],
    v: "Run a library that is instrumented against the API with no SDK, confirm it behaves identically and records nothing, then install the SDK and confirm the same calls produce spans and metrics.",
    dep: []
  },
  "telemetry-sdk": {
    s: "The configurable implementation behind the API: it owns sampling, aggregation, batching, resource identity and exporters, and is set up once when the application starts.",
    d: "At startup the application builds providers for traces, metrics and logs, attaching a resource, a sampler, processors and exporters. The SDK creates spans, aggregates measurements into metric points on an interval, batches records and hands them to exporters asynchronously, so instrumentation never blocks request handling. Defaults are chosen for safety. It is hard because it runs inside every service: its memory use, queue limits and shutdown behavior directly affect the application, and spans still queued at exit are lost unless it flushes.",
    k: ["Asynchronous batching exporter vs synchronous export: asynchronous keeps request latency flat and may lose queued data on a crash, while synchronous is reliable and slows every request.", "Bounded queues that drop vs unbounded queues: bounded queues protect application memory and lose data under overload, while unbounded queues avoid loss until the process runs out of memory."],
    p: ["A process killed without a flush on shutdown loses the last spans, usually those around a failure.", "Sharing one provider across tenants in a multi-tenant application mixes their resource identity."],
    v: "Run a service that emits a fixed number of spans and metrics, shut it down cleanly and confirm all of them arrive, and under a blocked backend confirm queue size stays bounded and request latency is unchanged.",
    dep: ["telemetry-api","in-process-exporters","resource-attributes","head-based-sampling"]
  },
  "auto-instrumentation": {
    s: "Attaching instrumentation to common frameworks, clients and servers at startup, without editing application code, so requests, database calls and outgoing calls produce spans and metrics.",
    d: "An agent or startup hook patches known libraries at load time or through runtime hooks, wrapping entry points such as HTTP handlers, database drivers and message clients. Each wrapper starts spans, records standard attributes, propagates context on outgoing calls and measures durations. Configuration comes from environment variables, so operators enable it without developers. It gives broad coverage quickly. The cost is opacity: it adds overhead, can break on unusual library versions, and records technical detail but nothing of business meaning.",
    k: ["Automatic vs manual instrumentation: automatic gives wide coverage immediately and knows nothing about business operations, while manual shows what matters and covers only what developers wrote.", "Enable all supported libraries vs a chosen list: all gives maximum visibility and overhead, while a list limits cost and misses a path nobody enabled."],
    p: ["A library upgrade that changes internal names makes the wrapper silently stop producing spans.", "Automatic capture of database statements can record sensitive values in span attributes."],
    v: "Start an uninstrumented sample service with auto-instrumentation enabled, send one request that calls a database and another service, and confirm one trace with server, client and database spans and standard attributes.",
    dep: ["instrumentation-libraries","telemetry-sdk","semantic-conventions","context-propagation"]
  },
  "instrumentation-libraries": {
    s: "Reusable wrappers for specific frameworks and clients that create spans and metrics with standard names and attributes, installed by developers or loaded by automatic instrumentation.",
    d: "Each library knows one framework: how to find the route in a web request, which header carries context, how to name the span, and which attributes describe the call. It registers middleware or interceptors and uses only the telemetry API. Because they follow shared conventions, the data from services built on different frameworks looks alike. They are hard to maintain: frameworks change, each wrapper must stay light on the hot path, and high-cardinality values such as raw URLs must be turned into templates.",
    k: ["Maintained by the framework vs by a separate project: framework-owned is accurate and tied to its release cycle, while separate maintenance covers more frameworks and lags behind changes.", "Record route template vs raw path: templates keep cardinality bounded, while raw paths aid debugging and explode series count."],
    p: ["Using the raw URL as a span name or metric label creates unbounded distinct values.", "A wrapper that records full request bodies by default leaks personal data into telemetry."],
    v: "Call parameterized routes with many different identifiers and confirm span names and metric labels use one route template, and the count of distinct label values does not grow with identifiers.",
    dep: ["telemetry-api","semantic-conventions","span-api"]
  },
  "manual-instrumentation": {
    s: "Code written by developers that creates spans, records metrics and adds attributes around business operations that no library can recognize, such as placing an order or scoring a model.",
    d: "Developers wrap meaningful units of work in spans, name them for the operation, add attributes for identifiers and outcomes, and record counters and histograms for business events. They decide where context must be passed manually, such as into thread pools. Good manual instrumentation is sparse and consistent, focused on the questions the team asks during incidents. It is hard because it costs developer time, drifts as code changes, and is easily done badly with unbounded attributes or spans around every function.",
    k: ["Few spans at operation boundaries vs spans on every function: few spans keep traces readable and cheap, while many give detail and make traces huge and slow to render.", "Business attributes on spans vs on metrics: spans can carry high-cardinality identifiers for search, while metrics must keep labels bounded."],
    p: ["Wrapping a tight loop in a span adds measurable overhead and produces traces with thousands of children.", "Recording the user's email as an attribute puts personal data into every downstream store."],
    v: "Add a span and a counter around one business operation, perform it, and confirm a span with the expected name and outcome attribute and a counter increment appear, with overhead below the agreed budget.",
    dep: ["telemetry-api","span-api","counters","semantic-conventions"]
  },
  "counters": {
    s: "A metric that only increases, such as requests served or bytes sent, used to compute rates over time; it resets to zero only when the process restarts.",
    d: "The instrument keeps a running total per label set and exposes it either cumulatively or as the change since the last report. Consumers compute a rate by differencing samples over a window, and the query engine detects resets when a value goes down. Counters are easy to aggregate across instances by summing. They are hard in one respect: counting events with a value like duration or size needs a separate counter for sum and count, and a counter exposed with a label per user or path will be a cardinality problem.",
    k: ["Counters for events vs gauges that hold a rate: counters survive missed scrapes because the next sample includes the total, while a gauge rate loses whatever happened between samples.", "Monotonic sum vs up-down counter: monotonic sums allow clean reset handling, while up-down counters track in-flight items and cannot be turned into rates."],
    p: ["Using a counter label with an unbounded value such as an ID creates a new series per request.", "Taking a rate over a window shorter than two scrapes yields no data or wrong values."],
    v: "Increment a counter a known number of times per second, restart the process in the middle, and confirm the computed rate stays at the known value through the restart without a negative spike.",
    dep: ["telemetry-sdk","aggregation-temporality"]
  },
  "gauges": {
    s: "A metric that holds the current value of something that goes up and down, such as queue depth, memory in use or active connections, read at the moment of collection.",
    d: "A gauge reports a single value per label set at each collection, either set by code or read from a callback when sampled. It cannot be turned into a rate and loses what happened between samples, so a spike shorter than the interval is invisible. Aggregating across instances needs thought: summing fits queue depth, averaging fits utilization, and maximum fits worst-case. It is hard because the right aggregation depends on meaning, and gauges that represent a total should usually be a counter instead.",
    k: ["Gauge vs counter for a quantity: gauges report levels directly, while a counter of increments and decrements keeps the history and supports rates and sums.", "Callback-sampled vs set on change: callbacks cost nothing between samples and can miss peaks, while setting on change captures extremes only if also recording a maximum."],
    p: ["A short spike in queue depth between scrapes never appears on any graph.", "Averaging a gauge across instances that report different things produces a number with no meaning."],
    v: "Hold a gauge at a known value, move it to a new value for under one scrape interval and back, and confirm collected values show only the sampled levels, demonstrating the documented blind spot.",
    dep: ["telemetry-sdk","aggregation-temporality"]
  },
  "histograms": {
    s: "A metric that records the distribution of measurements, such as request durations, in buckets with counts, allowing quantiles to be computed later and combined correctly across instances.",
    d: "Each observation increments the count of the bucket it falls into, and a sum and total count are kept as well. Buckets can be fixed boundaries chosen in advance or exponential scales that adapt to the range of values. Because counts add, histograms from many instances merge exactly, and a quantile is estimated from the merged buckets at query time. It is hard because accuracy depends on bucket placement: with boundaries far from the target latency, a quantile can be off by a large factor.",
    k: ["Explicit fixed buckets vs exponential buckets: fixed buckets are simple and align with SLO thresholds, while exponential buckets cover wide ranges with bounded relative error and need support throughout the pipeline.", "Many buckets vs few: more buckets improve accuracy and multiply series by label combinations."],
    p: ["Default buckets that do not cover the service's real latencies put almost all observations in one bucket and make quantiles meaningless.", "Adding labels to a histogram multiplies series by the number of buckets."],
    v: "Record a known set of durations, compute the ninety-ninth percentile from the merged histograms of three instances, and confirm the estimate lies within the width of the true value's bucket.",
    dep: ["telemetry-sdk","aggregation-temporality","exemplar-capture"]
  },
  "summaries": {
    s: "A metric that computes quantiles inside the process over a sliding window and exposes them directly, giving accurate percentiles for one instance that cannot be combined across instances.",
    d: "The client keeps a compact sketch of recent observations and reports configured quantiles, such as the median and ninety-ninth percentile, plus sum and count. Values are precise for that process and window and cost CPU in the application. The quantiles are numbers, not distributions, so averaging or summing them across instances is mathematically wrong. They are useful for a single process or when exact per-instance percentiles are needed, and mostly replaced by histograms for fleets.",
    k: ["Summary vs histogram: summaries give accurate per-instance quantiles with no bucket tuning, while histograms aggregate across the fleet and need bucket choice.", "Quantiles chosen at instrumentation vs at query time: client-side choices are cheap to read and cannot be changed later, while query-time quantiles can be asked any way."],
    p: ["Averaging the ninety-ninth percentile reported by each instance gives a figure that is not the fleet's percentile.", "Sliding windows that differ from the scrape interval make short slow periods appear or vanish."],
    v: "Run two instances with different latency distributions, report quantiles from each, and confirm that the average of their percentiles differs from the true combined percentile computed from raw data.",
    dep: ["telemetry-sdk"]
  },
  "aggregation-temporality": {
    s: "Whether a metric reports the total since the start, or only the change since the previous report, which determines how backends compute rates and how well they tolerate restarts and lost reports.",
    d: "With cumulative temporality each report carries the running total, so a missed report loses nothing and resets are detectable from a falling value, and the SDK must keep state for every series. With delta temporality each report carries only the new amount, so the SDK can forget series after reporting and memory stays low, but a lost report loses that interval's data permanently. Backends and the pipeline must know which they receive. Mixing them silently produces wrong rates.",
    k: ["Cumulative vs delta: cumulative tolerates missed reports and holds state for each series forever, while delta uses less memory in the client and loses data on every dropped export.", "Convert in the pipeline vs at the SDK: pipeline conversion keeps clients simple and needs stateful translation, while SDK configuration avoids conversion and must match each backend."],
    p: ["A delta metric sent to a backend that expects cumulative values looks like a flat line near zero.", "Converting cumulative to delta in a stateless pipeline stage emits a huge bogus value after each restart."],
    v: "Send the same counter under both temporalities through the pipeline, drop one export, and confirm cumulative data shows no gap in the rate while delta data shows exactly the missing interval.",
    dep: ["telemetry-sdk"]
  },
  "structured-logging": {
    s: "Writing each log event as a record of named fields, such as level, message, service, trace ID and request attributes, instead of free text, so it can be filtered and aggregated reliably.",
    d: "The logging library emits one line per event, in a machine-readable format with a fixed set of core fields and arbitrary context fields. Loggers carry context such as request identifiers and attach it to every event written in that scope. Fields have stable names and types so queries do not depend on parsing sentences. The difficulty is discipline: field names and types drift across services, free-text messages with interpolated values defeat grouping, and verbose logging at high levels costs real CPU and IO.",
    k: ["Structured fields vs formatted text messages: fields are queryable and consistent, while text is readable by eye and requires fragile parsing.", "Constant message with variable fields vs interpolated message: constant messages group in analysis, while interpolated messages read naturally and make every line unique."],
    p: ["The same value logged as a number in one service and a string in another breaks field queries.", "Logging whole request objects puts sensitive data and huge payloads into the store."],
    v: "Log an event with two context fields from a test service and confirm the stored record has those fields as separate typed values, with trace ID, service name and timestamp present.",
    dep: ["log-bridge","resource-attributes","semantic-conventions"]
  },
  "log-bridge": {
    s: "An adapter that routes records from an application's existing logging library into the telemetry SDK, adding trace context and resource identity and exporting them through the same pipeline.",
    d: "Rather than replacing the logging calls developers already use, a handler attached to the logging library converts each event into a log record in the telemetry data model. It copies the level, message and fields, adds the active trace and span IDs from context, and hands the record to the SDK's batching and export. This gives logs the same resource attributes and delivery path as other signals. The difficulty is fidelity: exceptions, structured arguments and severity names map imperfectly, and logging from outside a request has no context to attach.",
    k: ["Bridge in the process vs write to files and tail: a bridge adds context and skips disk, while file tailing is independent of the application and cannot see in-memory trace context.", "Export logs through the SDK vs keep a separate shipper: one path shares configuration and resources, while separate shippers isolate failures and duplicate setup."],
    p: ["Log records emitted during startup, before the SDK is configured, are dropped without warning.", "Errors raised by the exporter being logged through the same bridge create a feedback loop."],
    v: "Write one log line inside an active span through the application's normal logging call and confirm the exported record carries that span's trace ID and span ID and the service's resource attributes.",
    dep: ["telemetry-sdk","structured-logging","context-propagation"]
  },
  "span-api": {
    s: "The calls for creating spans and describing them: name, kind, start and end, attributes, events, links, status and the parent relationship that builds the trace tree.",
    d: "Starting a span reads the current context to find a parent, assigns a span ID within the trace, and makes the new span current. The code adds attributes and timestamped events, records exceptions, sets status and ends the span, which hands it to the SDK. Span kind marks whether it is a server, client, producer, consumer or internal operation, which tracing tools use to draw dependencies. It is hard because spans must be ended on every path, including errors, and the active span must follow the code across threads and callbacks.",
    k: ["Context-managed active span vs passing spans explicitly: implicit context keeps code clean and breaks across asynchronous boundaries, while explicit passing is reliable and clutters every signature.", "Record exceptions as span events vs only set status: events keep the stack and detail, while status alone is smaller and gives no clue about the cause."],
    p: ["A span never ended on an error path stays open and is exported as a trace with a missing or huge duration.", "Starting a span on one thread and ending it on another without moving context corrupts the parent chain."],
    v: "Create nested spans with an error in the inner one and confirm the exported trace has correct parent links, kinds, an error status and an exception event on the inner span, and both spans are ended.",
    dep: ["telemetry-api","context-propagation"]
  },
  "in-process-exporters": {
    s: "SDK components that serialize finished spans, metric points and log records and send them out of the process, to a local agent, a collector or a backend, on a schedule or when a batch fills.",
    d: "An exporter takes batches from the SDK's processors, encodes them in the wire format, and transmits them with a timeout and limited retries. Common destinations are a local agent on loopback, which keeps application configuration trivial, or a remote endpoint with credentials. Metrics are exported on a periodic reader, spans and logs through a batching processor. It is hard because it runs in the application's process: a slow endpoint must never block request threads, and failures must be absorbed with bounded memory.",
    k: ["Export to a local agent vs directly to the backend: a local agent hides retries and credentials and is another process to run, while direct export has fewer parts and ties applications to backend availability.", "Short export interval vs long: short intervals give fresh data and more requests, while long intervals batch well and delay alerts."],
    p: ["A blocking export call on the request path turns a slow collector into slow user requests.", "Credentials embedded in every application's configuration are hard to rotate and easy to leak."],
    v: "Point the exporter at an unreachable endpoint under load and confirm application latency and memory stay flat, drop counters rise, and delivery resumes without restart when the endpoint returns.",
    dep: ["telemetry-sdk","batching","transport-security"]
  },
  "context-propagation": {
    s: "Carrying the trace identifiers and flags of the current request across process boundaries in headers or message properties, so spans in different services join one trace.",
    d: "Within a process, context is held in a scoped store that follows the request through calls and, with care, across threads. At each outgoing call a propagator injects trace ID, parent span ID and sampling flag into a standard header; the receiving service extracts them and starts its span as a child. Propagators can be composed to support several header formats. It is hard because any hop that does not forward the headers, such as a proxy, a thread pool or a legacy client, cuts the trace in two.",
    k: ["One standard header format vs supporting several: one format is simple and interoperable, while supporting several eases migration and creates ambiguity about which wins.", "Implicit context vs explicit parameter: implicit context keeps business code clean and loses it at asynchronous boundaries, while explicit passing is reliable and invasive."],
    p: ["A proxy or gateway that strips unknown headers breaks every trace passing through it.", "Context lost in a thread pool starts new root traces and the original trace shows a gap."],
    v: "Call through three services including one that uses a worker pool, and confirm all spans share one trace ID with correct parent links and the sampling flag is the same everywhere.",
    dep: ["span-api","telemetry-api"]
  },
  "queue-context-propagation": {
    s: "Passing trace context through message queues and background jobs by storing it in message metadata, so asynchronous work can be tied back to the request that caused it.",
    d: "The producer injects the current context into message headers or properties as it publishes. The consumer extracts it when the message is delivered and either continues the trace as a child or, for batches and long delays, starts a new trace linked to the original. Producer and consumer spans carry kinds that let tools show the queue as a hop. It is hard because queues break the assumption that a request is a single call: fan-out, batching, retries and delay mean one message can belong to many traces.",
    k: ["Child span of the producer vs a new trace with a link: child spans show one continuous trace and give odd durations for delayed work, while linked traces keep each unit short and need link-aware tools.", "Context in message headers vs in the payload: headers keep the payload clean and may be dropped by bridges, while payload fields always travel and pollute the schema."],
    p: ["A message broker or bridge that does not copy headers silently breaks the trace at the queue.", "Batch consumers that attach all messages as children create a trace with thousands of unrelated parents."],
    v: "Publish a message from a traced request, delay its consumption by a minute, and confirm the consumer's span either belongs to the same trace or links to it, with producer and consumer kinds set correctly.",
    dep: ["context-propagation","span-links","span-api"]
  },
  "baggage": {
    s: "Key-value pairs that travel with the request context across services, so a value set at the edge, such as a customer tier, is available to downstream telemetry without being passed in every call.",
    d: "Baggage is propagated in its own header alongside trace context and is readable by every service the request touches. A processor can copy selected entries onto spans, logs and metrics as attributes, so downstream data can be sliced by edge facts. It is carried on every request, so it adds bytes to every call. It is hard because it crosses trust boundaries: anything put in it is sent to every downstream service and to third parties, including ones outside the organization.",
    k: ["Propagate baggage broadly vs a small allowlist: broad propagation is flexible and leaks information and bloats headers, while an allowlist is safe and needs governance for each key.", "Copy baggage to attributes automatically vs on request: automatic gives universal slicing and can create cardinality, while selective copying controls cost and needs configuration."],
    p: ["Sensitive values placed in baggage are sent to every external service the request calls.", "Large baggage values grow every request header until a proxy rejects them."],
    v: "Set a baggage entry at the edge, call two downstream services, and confirm both can read it, the allowlisted entry appears as a span attribute, and a non-allowlisted entry does not leave the organization.",
    dep: ["context-propagation","redaction-and-scrubbing"]
  },
  "resource-attributes": {
    s: "Attributes describing the entity producing telemetry, such as service name, version, instance, host and region, attached once to everything it emits and used to identify and group data.",
    d: "At startup the SDK builds a resource from environment configuration, detectors that read the platform and explicit settings. Every span, metric and log carries it, though it is stored or sent once per batch rather than per item. Service name and version are the minimum, and the instance identity separates replicas. The backend uses resource attributes for routing, grouping and ownership. It is hard because missing or inconsistent resource data makes telemetry unattributable, and including volatile values such as a process ID turns every restart into a new series.",
    k: ["Detect automatically vs configure explicitly: detection is convenient and sometimes wrong in odd environments, while explicit configuration is exact and depends on every team setting it.", "Include instance identity on metrics vs drop it: instance identity enables debugging of one replica and multiplies series, while dropping keeps them low and hides outliers."],
    p: ["A service with no name set is reported as unknown and cannot be found by owner.", "A changing value such as a process ID in the resource creates a new series set at every restart."],
    v: "Start two instances of a service with different versions and confirm all signals carry service name, version and distinct instance identity, and querying by version separates the two instances' data.",
    dep: ["telemetry-sdk","semantic-conventions"]
  },
  "semantic-conventions": {
    s: "Agreed names, units and meanings for common attributes and metrics, such as HTTP status or database system, so data from different services, libraries and teams can be compared and queried the same way.",
    d: "A convention specifies, for each kind of operation, the span name format, required and optional attributes, types and units, and which values are bounded. Instrumentation libraries implement it, so a request in any framework produces the same attribute names. Dashboards and alerts written once then work for all services. The difficulty is evolution and discipline: conventions change as they mature, so telemetry from different library versions differs, and teams add custom attributes that collide with or duplicate standard ones.",
    k: ["Follow the shared convention vs team-specific names: shared names allow reusable dashboards and tooling, while local names are quick and make cross-team queries impossible.", "Adopt new convention versions immediately vs migrate gradually: immediate keeps data current and breaks existing queries, while gradual migration duplicates attributes during a long overlap."],
    p: ["Two services using different attribute names for the same concept make one dashboard show half the traffic.", "A convention rename silently breaks alerts that query the old attribute."],
    v: "Run services built on different frameworks, send the same type of request to each, and confirm the spans use identical attribute names, types and units and one shared query returns all of them.",
    dep: ["telemetry-schema-versions","resource-attributes"]
  },
  "span-links": {
    s: "References from one span to another span or trace that is related but not its parent, used for batches, fan-in, retries and asynchronous work where a tree does not fit.",
    d: "A link holds the trace ID and span ID of the related span, optionally with attributes describing the relationship. It is added when a span is created. A batch processing span might link to the producer span of each message it handles, and a retried operation can link to the previous attempt. Viewers show links as jumps between traces. They are hard because many tools display them poorly and because links point to traces that may have been sampled out, giving dangling references.",
    k: ["Link vs parent-child: a link keeps each trace small and independent, while a parent relationship gives a single view and creates very long or wide traces.", "Link every source in a batch vs a sample: all links keep full traceability and make large spans, while a sample bounds size and loses some references."],
    p: ["Linking to a span whose trace was not sampled leaves a link that leads nowhere.", "Hundreds of links on one span make it slow to store and to display."],
    v: "Process a batch of ten messages in one span with links to each producer and confirm the span has ten links and following each opens the correct originating trace.",
    dep: ["span-api","context-propagation"]
  },
  "exemplar-capture": {
    s: "Recording a trace and span ID alongside a metric measurement taken during a traced request, selected by the SDK so each metric point keeps a few representative links to traces.",
    d: "When a histogram or counter is updated inside a span, the SDK may retain the measurement with the current trace and span IDs and a timestamp, using a reservoir that keeps a small number per interval. Only measurements from sampled traces are useful, so a filter can restrict capture. Exemplars ride along with the metric point through export. The difficulty is selection and loss: reservoirs choose few examples, many pipelines and stores drop exemplars, and exemplars from unsampled traces are links to nothing.",
    k: ["Capture only from sampled traces vs from all: sampled-only guarantees the link works, while capturing all gives more candidates and many dead links.", "Reservoir per bucket vs per series: per bucket gives examples across the latency range, while per series is cheaper and shows whatever happened to be chosen."],
    p: ["An exemplar on an average-looking sample is not the slow request the graph spike suggested.", "Any aggregation or translation step that does not understand exemplars removes them silently."],
    v: "Record latency inside sampled and unsampled traced requests and confirm exported metric points carry exemplars only from sampled traces, with matching trace IDs and timestamps within the interval.",
    dep: ["histograms","span-api","telemetry-sdk"]
  },
  "telemetry-schema-versions": {
    s: "A versioned description of how attribute and metric names change between releases of the conventions, so consumers can translate older and newer telemetry into one form.",
    d: "Each telemetry source declares the schema version it follows, and a published schema file lists renames and changes between versions. A processor or query layer applies the transformations to convert data to a target version. Without this, a rename in the conventions is a breaking change for every dashboard and alert. It is hard because it only works if sources declare versions truthfully, the conversions are complete, and consumers actually apply them rather than hard-coding whichever names they saw first.",
    k: ["Translate to a canonical version in the pipeline vs leave data as emitted: translation gives consumers one stable form and adds a processing step, while leaving it forces every query to handle many names.", "Pin the schema version per team vs follow the latest: pinning keeps queries stable and delays benefits, while following the latest is current and breaks things on upgrade."],
    p: ["A source that does not declare its version is treated as the latest and its old names are never translated.", "A rename applied only to new data splits a series into two at the date of the change."],
    v: "Send the same operation from two services declaring different schema versions and confirm the pipeline output uses one target version's names and a single query returns both services' data.",
    dep: ["semantic-conventions","processors"]
  },
});
