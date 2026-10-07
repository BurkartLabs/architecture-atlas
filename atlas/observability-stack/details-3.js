// Details for the observability stack plate, part 3: collector pipeline, sampling, collection and discovery.
ATLAS.details("observability-stack", {
  "local-agent": {
    s: "A small collector running beside each service, on the same host or in the same pod, that receives its telemetry locally, adds metadata and forwards it onward.",
    d: "The agent listens on a local port or socket so applications send telemetry without needing network configuration or retry logic of their own. It enriches data with host and orchestrator metadata, applies cheap processing such as batching and memory limits, and exports to a gateway or backend. It also scrapes local endpoints and tails local files. It is hard because it runs on every node, so its resource use is multiplied by fleet size, and an upgrade or bug affects every service at once.",
    k: ["Agent per host vs sidecar per service: per host uses less memory in total, while a sidecar isolates one service's load and configuration and multiplies instances.", "Send straight to the backend vs through an agent: direct is fewer moving parts, while an agent absorbs retries, centralizes credentials and decouples applications from backend changes."],
    p: ["An agent without a memory limit on a busy host competes with the service it is observing.", "A crashed agent drops locally buffered telemetry exactly when the host is unhealthy."],
    v: "Start a service sending to the local agent, stop the backend for a minute, restart it, and confirm the agent's buffer delivers the missing minute with original timestamps and its memory stays below its limit.",
    dep: ["receivers","exporters","batching","memory-limiter","metadata-enrichment"]
  },
  "gateway-collector": {
    s: "A pool of central collectors that receives telemetry from many agents, applies fleet-wide processing such as sampling and routing, and exports to the stores.",
    d: "Gateways sit behind a load balancer and accept data from agents and from services that cannot run one. They hold the policies that need a global view or that should change without touching every host: tail sampling, tenant tagging, redaction, rate limits and routing to different backends. They scale horizontally, with exceptions: components needing all spans of a trace require the same trace to reach the same gateway instance. Difficulty comes from that coupling and from being a shared choke point for all telemetry.",
    k: ["Stateless gateways behind a simple balancer vs trace-aware routing: stateless scales trivially and cannot do tail sampling, while trace-aware routing enables it and adds a hashing layer to operate.", "One gateway tier for all signals vs a tier per signal: a single tier is easier to run, while separate tiers isolate a log surge from trace sampling."],
    p: ["A gateway restart with an in-memory buffer drops every trace being assembled at that moment.", "A single shared tier lets one chatty tenant starve everyone's metrics."],
    v: "Send traffic from many agents, kill one gateway instance, and confirm agents retry to the others, no batch is lost beyond the documented window, and stored volume matches the sent volume.",
    dep: ["receivers","processors","exporters","tail-based-sampling","retry-and-persistent-queue"]
  },
  "receivers": {
    s: "The pipeline stage that accepts telemetry in some wire format from applications, agents or other collectors, and turns it into the pipeline's internal data model.",
    d: "A receiver listens for a protocol, such as RPC over HTTP with a binary or JSON body, a log forwarding protocol or a scrape of an endpoint, and decodes it. It validates and authenticates the request, applies size limits, passes the data downstream and returns acknowledgment that matches how far the data has progressed. It is hard because the acknowledgment contract decides durability: acknowledging before the data is safely queued risks loss, and acknowledging after downstream processing couples sender latency to the whole pipeline.",
    k: ["Acknowledge after enqueue vs after export: after enqueue is fast and safe if the queue is durable, while after export is simplest to reason about and ties senders to backend latency.", "Many protocol receivers vs a single standard protocol: many receivers ease migration of legacy senders, while one protocol is simpler to secure and operate."],
    p: ["Accepting unauthenticated or unlimited requests on a public listener lets anyone fill the pipeline.", "Decoding errors on one malformed record rejecting an entire batch drop good data with the bad."],
    v: "Send a batch containing one malformed record and confirm the valid records are accepted and delivered, the invalid one is counted in a rejection metric, and the sender receives a response that matches.",
    dep: ["protocol-translation","transport-security","memory-limiter"]
  },
  "processors": {
    s: "Pipeline stages that change telemetry in flight: adding or removing attributes, filtering, renaming, batching, sampling and redacting, applied in a configured order.",
    d: "Each processor takes data, transforms it, and passes it to the next in a chain. Common ones add resource attributes, drop health-check spans, rename metrics, hash or delete sensitive fields, group by attribute and apply sampling. Order matters: redaction must come before export, and sampling after enrichment that sampling rules depend on. It is hard because processors run on every item, so cost per item adds up, and a transformation applied to the wrong stage can change what rules later in the chain see.",
    k: ["Transform in the pipeline vs in the application: pipeline changes apply to every service without a deploy, while application changes keep data correct at the source and need coordination.", "Declarative rules vs scripted transforms: declarative rules are safe and limited, while scripts handle every case and are harder to review and test."],
    p: ["A filter placed before enrichment drops data using an attribute that does not exist yet, deleting nothing or everything.", "Heavy regular expressions on every log line make the processor the pipeline's bottleneck."],
    v: "Send test telemetry containing a health-check span, a secret field and a missing resource attribute, and confirm the export has no health span, the field removed and the attribute added.",
    dep: ["redaction-and-scrubbing","metadata-enrichment","batching"]
  },
  "exporters": {
    s: "The final pipeline stage that sends telemetry to a destination such as a store, another collector or a vendor-neutral endpoint, with connection management, compression and retries.",
    d: "An exporter converts the internal model to the destination's wire format, compresses it, sends it over a pooled connection and handles responses. It interprets errors: retryable failures go back to the queue, permanent ones are dropped and counted. One pipeline can have several exporters for fan-out to different backends. It is hard because slow or failing destinations hold data in memory, and exporters must not let one slow destination block delivery to the others.",
    k: ["Fan-out in one pipeline vs separate pipelines per destination: one pipeline is simple and couples destinations, while separate pipelines isolate failures and use more memory.", "Compress everything vs only large batches: compression saves bandwidth and costs CPU, which matters when the agent shares a small host."],
    p: ["A single slow destination fills the shared queue and starves the healthy ones.", "Treating every failure as retryable keeps resending a batch the backend will always reject."],
    v: "Export to two destinations, make one return errors, and confirm the healthy one still receives everything on time while the failing one's drops and retries appear in metrics.",
    dep: ["retry-and-persistent-queue","protocol-translation","transport-security"]
  },
  "protocol-translation": {
    s: "Converting between telemetry wire formats and the internal model, so a service speaking an older or different protocol can be accepted and forwarded to stores that expect another.",
    d: "Translators map one format's concepts onto another: metric types and temporality, label names, span kinds, status codes and units. Some concepts have no exact counterpart, so conversions are lossy or need defaults. A collector receiving scrape-format data may export it in a push format, and a log forwarding protocol may be converted to structured records. It is hard because subtle differences, such as how counters reset or whether histograms are cumulative, change the meaning of numbers if mapped carelessly.",
    k: ["Translate at the collector vs require senders to migrate: translation lets old services keep working, while forcing migration gives one clean format and a long tail of stragglers.", "Preserve unknown fields vs drop them: preserving avoids loss across hops and passes through data the next stage cannot interpret."],
    p: ["Converting delta metrics to cumulative without keeping state makes rates wrong after every restart.", "Label names invalid in the target format are rewritten, so two distinct names collide into one series."],
    v: "Send the same counter and histogram through each supported protocol into the store and confirm the stored series, types, units and bucket boundaries are identical to the native format.",
    dep: ["aggregation-temporality","semantic-conventions"]
  },
  "batching": {
    s: "Grouping many small telemetry items into larger requests before export, trading a short delay for far fewer network calls and better compression.",
    d: "A batcher accumulates items until it reaches a size or a timeout, whichever comes first, then sends them together. Larger batches compress better and cost less per item, but increase latency and memory use and enlarge the loss window if the process dies. Batch size must also respect the destination's maximum request size. The difficulty is tuning: a long timeout makes alerts late, a tiny one wastes requests, and one oversized batch can be rejected as a whole.",
    k: ["Large batches with long timeouts vs small and quick: large is efficient and slower to reach the store, while small gives freshness at higher request cost.", "Batch per tenant vs shared batches: per tenant keeps limits and routing simple, and many small tenants produce many small batches."],
    p: ["A batch bigger than the backend's request limit is rejected repeatedly and never delivered.", "Timeouts set to tens of seconds add that delay to every alert's detection time."],
    v: "Send items at a steady rate and confirm exports contain the configured size or arrive at the timeout, and measure that end-to-end delay never exceeds the timeout plus network time.",
    dep: ["memory-limiter"]
  },
  "retry-and-persistent-queue": {
    s: "Buffers between pipeline stages that hold data while a destination is down and resend it with backoff, optionally on disk so a process restart does not lose them.",
    d: "When an export fails with a retryable error, the item stays in a bounded queue and is retried with exponential backoff and jitter. A memory queue is fast and lost on crash; a disk-backed queue survives restart and is slower. When the queue fills, policy decides whether to drop new data, drop old data or push back on receivers. Retries give at-least-once delivery, so the destination must tolerate duplicates. It is hard because every queue is a decision about what to lose.",
    k: ["Disk-backed queue vs memory queue: disk survives restarts and long outages at the cost of IO and complexity, while memory is fast and loses everything buffered on a crash.", "Drop oldest vs drop newest when full: dropping oldest preserves recent state for alerts, while dropping newest keeps a contiguous history of the start of the incident."],
    p: ["Retries without jitter from a whole fleet hit a recovering backend at the same instant and knock it down again.", "A queue that retries a permanently rejected item forever blocks everything behind it."],
    v: "Stop the backend for five minutes under steady load, restart the agent mid-outage, and confirm after recovery the stored count equals the sent count with at most the documented duplicates.",
    dep: ["backpressure","exporters"]
  },
  "backpressure": {
    s: "The way a full or slow stage tells the stages before it to slow down, so overload turns into controlled delay or deliberate drops instead of memory exhaustion and crashes.",
    d: "Signals propagate upstream as blocked calls, throttling status codes or full queues. A receiver that cannot enqueue returns a retryable error with a hint, and well-behaved senders buffer and back off. Without it, the pipeline accepts everything until memory runs out. Where senders cannot buffer, such as applications that cannot block, the pipeline must shed load instead, preferably selectively. The hard part is that backpressure only works end to end: a single unbounded buffer or a sender that ignores the signal defeats it.",
    k: ["Block upstream vs drop at the edge: blocking preserves data and risks stalling the application, while dropping protects the application and loses telemetry.", "Propagate to senders vs absorb with large buffers: propagation keeps memory bounded, while big buffers ride out bursts and fail catastrophically when exhausted."],
    p: ["A tracing client that blocks application threads when the collector is slow turns a telemetry problem into a customer outage.", "One stage with an unbounded queue hides overload until the process is killed for memory."],
    v: "Slow the backend to a tenth of normal throughput under steady load and confirm throttling responses appear, memory stays flat, queue depth is bounded, and the application's latency is unchanged.",
    dep: ["memory-limiter","ingest-rate-limits"]
  },
  "memory-limiter": {
    s: "A guard stage that watches the process's memory and refuses or sheds new data when usage approaches a configured ceiling, protecting the collector from being killed.",
    d: "It samples memory use at a short interval and compares it with a soft and a hard limit. Above the soft limit it starts refusing new data, which should trigger backpressure upstream; above the hard limit it forces garbage collection and drops more. It belongs first in the chain so refused data costs nothing downstream. It is hard to calibrate: limits must sit below the container's cap with room for spikes, and memory growth outside the pipeline, such as in a cache, is invisible to it.",
    k: ["Refuse early with a soft limit vs run until the hard limit: early refusal keeps headroom and drops sooner, while late refusal uses all memory and risks an abrupt kill.", "Limit by percent of container memory vs absolute bytes: percent follows resizing automatically, while absolute values are predictable and need updating with the container."],
    p: ["Placing the limiter after a heavy processor lets the processor consume the memory it was meant to protect.", "A limit set equal to the container cap means the kernel kills the process before the limiter acts."],
    v: "Flood a collector with several times its normal load and confirm memory peaks below the container limit, refusals are counted in a metric, and the process is never restarted by the orchestrator.",
    dep: []
  },
  "remote-write": {
    s: "A protocol and sender that streams scraped metric samples from a local collector to a remote store, with sharded queues, retries and a write-ahead log for durability.",
    d: "A scraper writes samples to a local log, and a reader streams them to the remote endpoint in batches over multiple parallel shards. The number of shards adapts to the gap between incoming and sent samples. If the remote is unreachable, the sender keeps data on disk up to a limit, then falls behind and drops the oldest. Labels from the sender's identity are attached so multiple senders do not collide. It is hard because lag grows silently, and series changing quickly create a large amount of metadata to send.",
    k: ["Push samples to a central store vs query local stores: pushing gives a central view and needs buffering and bandwidth, while local queries need no transfer and make global views complicated.", "More parallel shards vs fewer: more shards keep up with high volume and use more memory and connections."],
    p: ["Sustained lag beyond the log's retention drops data without any visible error on the dashboard side.", "Two senders with identical external labels write the same series and produce interleaved, flapping values."],
    v: "Pause the remote endpoint for ten minutes, resume it, and confirm the sender catches up, the remote has no gap in a test series, and the lag metric returns to near zero.",
    dep: ["write-ahead-log","retry-and-persistent-queue","metrics-store"]
  },
  "head-based-sampling": {
    s: "Deciding at the start of a trace, before its outcome is known, whether to record it, usually by a fixed probability or rate, and passing that decision to every downstream service.",
    d: "The first service generates a trace and flips a weighted coin, or hashes the trace ID against a threshold, and records the decision in the trace context flags. Downstream services honor the flag, so a trace is either complete or absent. It is cheap, stateless and works inside the application, cutting cost at the source. Its limit is that it knows nothing about the result: the one-in-a-thousand error or slow request is dropped at the same rate as the rest, and a rare path is sampled out.",
    k: ["Probabilistic by trace ID hash vs random per service: hashing gives all services the same decision and complete traces, while independent randomness yields fragments.", "Low rate for cost vs high rate for coverage: low rates cut spend and lose rare events, while high rates keep detail at the cost of the bill."],
    p: ["Different services configured with different rates, with the decision not propagated, produce traces with random holes.", "Sampling at one percent leaves too few traces of a rare endpoint to debug anything."],
    v: "Send ten thousand requests with a ten percent rate and confirm close to one thousand complete traces are stored, each containing spans from every service, and none are partial.",
    dep: ["context-propagation","span-api","telemetry-sdk"]
  },
  "tail-based-sampling": {
    s: "Deciding whether to keep a trace after it has finished, based on its outcome such as errors or high latency, so the interesting traces are kept and routine ones are thinned.",
    d: "A collector holds the spans of each trace in memory until the trace is deemed complete, by a timeout, then evaluates policies: keep all with errors, keep those slower than a threshold, keep a small fraction of the rest. This requires all spans of a trace to reach the same collector, so earlier tiers route by trace ID. It gives much better data than head sampling and costs memory, routing complexity and delay. It is hard because completeness is a guess based on time.",
    k: ["Tail sampling vs head sampling: tail keeps errors and slow requests reliably and needs stateful collectors holding every span, while head is cheap and blind to outcomes.", "Longer decision wait vs shorter: longer waits include late spans and increase memory and delay, while shorter waits decide on incomplete traces."],
    p: ["A collector restart discards every trace in its buffer and the decision data with it.", "A trace longer than the wait window is judged on its first part and kept or dropped wrongly."],
    v: "Send a mix of fast successes, a few slow requests and a few errors at volume, and confirm every error and slow trace is stored complete while successes are kept at about the configured fraction.",
    dep: ["trace-assembly-buffer","gateway-collector","span-api"]
  },
  "adaptive-sampling": {
    s: "Adjusting sampling rates automatically from observed traffic, so each endpoint or service contributes a target number of traces per second regardless of how busy it is.",
    d: "A controller observes the volume per service and operation, computes the rate needed to hit a target throughput, and distributes it to samplers, either through configuration pulled by SDKs or as weights applied in collectors. Quiet endpoints are sampled heavily and loud ones lightly. Each stored trace carries its sampling probability so counts can be corrected when computing statistics. The difficulty is stability: reacting too quickly oscillates, and statistics that ignore the recorded probability are biased toward rare operations.",
    k: ["Target throughput per operation vs one global rate: per operation protects rare endpoints and complicates cost forecasts, while a global rate is predictable and drowns small ones.", "Record the sampling probability on each trace vs discard it: recording permits unbiased counts, while discarding saves a field and makes derived rates wrong."],
    p: ["A rate controller reacting to a traffic spike lowers sampling just as the interesting incident begins.", "Dashboards counting stored traces without weighting show rare endpoints as busier than they are."],
    v: "Generate traffic of one hundred requests per second on one endpoint and one per second on another, and confirm both yield about the target traces per second, with corrected counts within a few percent.",
    dep: ["head-based-sampling","trace-assembly-buffer","span-metrics-generation"]
  },
  "trace-assembly-buffer": {
    s: "A bounded in-memory store that gathers the spans of in-flight traces by trace ID until the trace can be judged complete, so decisions can be made on whole traces.",
    d: "The buffer maps trace IDs to lists of spans, with a timer per trace that restarts when new spans arrive. When the timer expires the trace is evaluated and flushed or dropped. Capacity is limited by memory, so a cap on traces or spans per trace evicts the oldest. It needs the same trace to land on the same instance, which is handled by hashing on trace ID in the load balancing stage. The hard parts are sizing, which depends on traffic and trace duration, and behavior during rebalancing when instances join or leave.",
    k: ["Time-based completeness vs root-span-based: timers handle any trace shape and guess wrong for long traces, while waiting for the root span is precise and fails if it is lost.", "Evict oldest when full vs refuse new traces: evicting oldest keeps newest traces and breaks old decisions, while refusing new traces preserves in-flight ones and drops fresh data."],
    p: ["Scaling the collector tier changes the hash ring and splits in-flight traces across two instances.", "Memory sized for average trace length overflows when a batch job emits traces with tens of thousands of spans."],
    v: "Replay a recorded set of traces at production rate through a two-instance tier, add a third instance mid-stream, and measure the fraction of traces judged incomplete against the documented bound.",
    dep: ["memory-limiter","gateway-collector"]
  },
  "log-filtering-and-sampling": {
    s: "Dropping, trimming or thinning log lines in the pipeline by level, source or content, so low-value volume such as debug output never reaches the store.",
    d: "Rules match on level, service, message patterns or fields, and then drop the line, remove fields, truncate long messages or keep only a fraction of repeats. Common patterns keep all warnings and errors, thin info lines, and drop debug in production, while allowing a dynamic switch to raise verbosity for a service temporarily. Deduplication collapses identical repeated lines into a count. It is hard because the line removed is often the one needed later, so policies should be visible and reversible.",
    k: ["Filter in the application vs in the pipeline: application filtering saves the most work and needs a deploy, while pipeline filtering can change instantly and pays to produce and ship first.", "Drop debug entirely vs keep short-lived: dropping saves the most, while short retention lets debug lines be searched after a surprise failure."],
    p: ["Sampling errors with the same rate as info lines hides the one failure that matters.", "A filter rule whose pattern also matches an important message silently removes it across the fleet."],
    v: "Emit lines at every level from a test service and confirm debug is dropped, info is kept at the configured fraction, errors are all kept, and the dropped counts per rule are reported.",
    dep: ["processors","log-tailer","pipeline-self-metrics"]
  },
  "edge-aggregation": {
    s: "Combining metric samples near their source, such as summing counters across instances or removing a label, to send fewer series and samples to the store.",
    d: "An aggregator receives raw samples, groups them by a reduced set of labels, applies an operation such as sum or histogram merge over a time window, and emits one result per group. It can drop high-cardinality labels like instance or pod before they reach storage. Aggregated series cannot be disaggregated later. It is hard because it needs a consistent view: if one collector sees only part of the instances of a service, partial sums are emitted and the total flaps.",
    k: ["Aggregate before storage vs store raw and aggregate at query time: before storage cuts cost sharply and discards detail, while raw storage keeps all options and pays for the series.", "Shard by the aggregation key vs by source: sharding by key gives complete sums and needs routing, while by source is simple and emits partial results."],
    p: ["A late-arriving sample after a window closes is dropped or double counted, depending on the implementation.", "Removing the instance label hides the single misbehaving instance that explains an incident."],
    v: "Send counters from fifty instances through the aggregator with the instance label removed and confirm the stored sum equals the total of the inputs and that the stored series count dropped by the expected factor.",
    dep: ["processors","aggregation-temporality","cardinality-limits"]
  },
  "span-metrics-generation": {
    s: "Computing request rate, error rate and duration histograms from spans before any sampling, and storing them as metrics, so statistics stay accurate when traces are sampled.",
    d: "A processor watches every span, groups by service, operation and status, counts them and records durations into histograms, then emits these as ordinary metrics. Because it runs before sampling, the numbers reflect all traffic, not the sampled subset. The metrics feed service maps, latency dashboards and SLOs, and can carry exemplars pointing to kept traces. The cost is cardinality: grouping by too many span attributes creates a large number of series, so the dimensions must be chosen deliberately.",
    k: ["Generate before sampling vs derive from stored traces: before sampling is accurate and costs per-span processing, while derived from stored traces is free and wrong by the sampling rate.", "Few dimensions vs many: few dimensions keep series count low, while many allow slicing and risk a cardinality explosion."],
    p: ["Including a raw URL path or user ID as a dimension creates millions of series.", "Computing metrics after the sampling stage makes request rates drop whenever the sampling rate changes."],
    v: "Send a known number of requests through a pipeline that samples at ten percent and confirm the generated request-rate metric equals the true count while only about ten percent of traces are stored.",
    dep: ["processors","histograms","exemplar-capture","cardinality-limits"]
  },
  "scrape-engine": {
    s: "The component that periodically requests each target's metrics endpoint, parses the response, attaches target labels and records the samples along with a signal of whether the scrape succeeded.",
    d: "For every discovered target the engine issues a request on a fixed interval with a timeout, parses the text exposition, applies relabeling and writes samples with the scrape timestamp. It records whether each scrape worked and how long it took, which doubles as a liveness signal. Scrapes are spread across the interval to avoid bursts. It is hard because the engine owns the timestamp, so a slow target gets a misleading one, and large targets produce huge responses that need limits.",
    k: ["Pull model vs push: pull gives a free liveness signal and central control of rate, while push suits short-lived jobs and firewalled networks.", "Short scrape interval vs long: short intervals show brief spikes and multiply storage and load, while long ones are cheap and blur short events."],
    p: ["A scrape timeout longer than the interval makes scrapes overlap and pile up on a slow target.", "A target exposing hundreds of thousands of series in one response overwhelms the scraper before limits apply."],
    v: "Run a target that returns known values, confirm samples arrive at the configured interval with correct labels, then stop the target and confirm the success signal drops to zero at the next scrape.",
    dep: ["service-discovery","target-relabeling","metrics-store"]
  },
  "push-ingest": {
    s: "An endpoint that accepts telemetry sent by clients, used when the source cannot be scraped: short-lived jobs, browsers, devices and traffic from outside the network.",
    d: "Clients send batches of metrics, logs or spans over HTTP or RPC to a load-balanced ingest endpoint, with credentials identifying the tenant. The endpoint validates, applies limits and writes to the pipeline. The sender controls timestamps and cadence, so ordering and duplicates are the receiver's concern. It is hard because it is a front door: unauthenticated push can be abused, there is no automatic liveness signal, and a misbehaving client can send at an unbounded rate.",
    k: ["Authenticate per client vs per tenant key: per client allows revocation and tracing of abuse, while a shared tenant key is simple and cannot be rotated without touching everything.", "Accept client timestamps vs stamp at receipt: client timestamps preserve event time and allow skew, while receipt time is consistent and wrong for delayed data."],
    p: ["A client with a skewed clock writes samples far in the future or past and they are rejected or misplaced.", "A leaked ingest credential lets an outsider fill a tenant's quota."],
    v: "Send batches from an authenticated test client and confirm they are stored under the correct tenant, then use a revoked credential and confirm it is rejected without affecting valid clients.",
    dep: ["receivers","tenant-quotas","transport-security","access-control"]
  },
  "service-discovery": {
    s: "Finding which targets exist right now, by watching an orchestrator, a registry, DNS or static files, so scraping and agents follow the fleet as it changes.",
    d: "Discovery providers watch a source of truth and emit a list of targets with metadata labels such as namespace, pod, port and annotations. The scrape engine consumes the list, updating as instances start and stop. Metadata is later turned into target labels by relabeling. It is hard because the fleet changes constantly: short-lived instances may disappear before their final samples are collected, and a failure in the discovery source can freeze or empty the target list.",
    k: ["Watch the orchestrator directly vs read a registry: direct watching is fresh and ties the monitor to that platform, while a registry decouples and adds a component that can go stale.", "Discover everything and filter by relabeling vs discover only opted-in targets: everything is simple and noisy, while opt-in is clean and misses forgotten services."],
    p: ["An error from the discovery source treated as an empty list stops monitoring the whole fleet.", "Annotations on only some services leave the rest unmonitored and nobody notices."],
    v: "Start and stop instances of a test service and confirm targets appear and vanish within the discovery delay, and that failing the discovery source keeps the last known list instead of emptying it.",
    dep: ["scrape-engine","target-relabeling"]
  },
  "target-relabeling": {
    s: "Rewriting a target's labels or dropping the target using rules applied after discovery and before scraping, and rewriting sample labels before storage.",
    d: "Rules take source labels, apply a regular expression and an action: keep or drop the target, set a label, copy one label to another, or hash a value. Discovery metadata becomes the stable labels users query, such as service and environment, and unwanted labels and targets are removed. A second round runs on scraped samples to drop or rewrite series. It is hard because rules are order-dependent and effectively a small program written in configuration, and a mistake silently drops or collides series.",
    k: ["Relabel at the scraper vs at the pipeline: scraper relabeling can skip targets and save requests, while pipeline relabeling is central and lets the scraper remain simple.", "Standardize labels centrally vs let teams choose: central rules give consistent queries and need a team to own them, while local freedom is quick and fragments names."],
    p: ["A rule that rewrites two different sources to the same label set merges their series and corrupts both.", "A drop rule with a loose pattern removes targets that were meant to stay."],
    v: "Apply the rules to a sample list of discovered targets using a dry run and confirm the resulting label sets match the expected output, including that excluded targets are absent.",
    dep: ["service-discovery","scrape-engine","naming-and-schema"]
  },
  "batch-job-gateway": {
    s: "An intermediary that holds the final metrics of short-lived jobs until a scraper collects them, since a job may exit before any scrape could reach it.",
    d: "A batch job pushes its metrics, such as duration and last success time, to the gateway when it finishes. The gateway stores the latest push per job and grouping labels and exposes it for scraping. The data persists until deleted, so the scraped value always shows the last run. It is meant for the outcomes of batch jobs, not as a general push path. It is hard because stale entries never expire, so a job removed from the schedule appears healthy forever.",
    k: ["Push through a gateway vs write to the push-ingest endpoint with timestamps: a gateway keeps scrape semantics and a single point of state, while direct push to a store is simpler and loses the last-value behavior.", "Explicit deletion vs expiry of entries: deletion is exact and relies on cleanup, while expiry removes stale data and can hide a job that is merely late."],
    p: ["A decommissioned job's last-success metric stays old but present, and an alert on age fires forever or never.", "Using the gateway for per-request metrics from long-running services turns it into a bottleneck and a single point of failure."],
    v: "Run a short job that pushes its duration and success time, confirm the values are scraped after the job exits, then delete the job's entry and confirm the series disappears.",
    dep: ["scrape-engine","push-ingest"]
  },
  "log-tailer": {
    s: "An agent function that reads log files or container output as they are written, tracks its read position, assembles multi-line events and ships lines with source metadata.",
    d: "The tailer watches files by path or by the runtime's log directory, remembers the offset of each file in a position file, and handles rotation and truncation without losing or repeating lines. It joins multi-line records such as stack traces by pattern, parses structured lines, attaches labels from the source, and forwards to the pipeline. It is hard because files are removed or rotated while being read, positions must survive restart, and a burst of output can outrun the read rate.",
    k: ["Tail files vs have the application send logs directly: tailing needs no application change and survives collector outages, while direct send avoids disk use and loses lines if the network drops.", "Multi-line assembly at the agent vs at ingest: agent assembly keeps events whole early, while central assembly is flexible and sees fragments in between."],
    p: ["File rotation by a name pattern the tailer does not recognize leaves it reading a deleted file forever.", "A lost position file on restart re-sends the whole file and floods the store with duplicates."],
    v: "Write numbered lines to a file, rotate it twice mid-stream and restart the agent, and confirm every number appears in the store exactly once and in order.",
    dep: ["metadata-enrichment","structured-logging","retry-and-persistent-queue"]
  },
  "system-and-host-collectors": {
    s: "Collectors that read host and platform statistics such as CPU, memory, disk, network and process state, and the metrics of common infrastructure components, without touching application code.",
    d: "A host collector reads counters from the operating system's interfaces and exposes them as metrics, including per-core CPU time, filesystem usage, network errors and load. Specialized collectors translate the statistics of databases, proxies and queues into the same format. They give a baseline view of every machine regardless of what runs on it. They are hard to keep useful: raw counters are many and noisy, collectors differ across operating system versions, and a collector's own failure looks like a healthy quiet host.",
    k: ["Run one collector per host vs embed in each service: per host is uniform and independent of applications, while embedded collection shows application-specific internals.", "Collect everything by default vs a curated list: everything is thorough and expensive in series, while a curated list is cheap and misses a metric needed in a surprise."],
    p: ["A host collector reporting inside a container sees the host's totals and not the container's limits.", "Default collection of per-device and per-interface series on large machines creates thousands of series per host."],
    v: "Generate a known CPU load of fifty percent on one core of a test host and confirm the CPU metrics show the matching utilization, and disk and network counters move when exercised.",
    dep: ["scrape-engine","metadata-enrichment","resource-attributes"]
  },
  "kernel-level-probes": {
    s: "Programs attached to the operating system kernel that observe system calls, network traffic and scheduling for every process, producing telemetry without changing or restarting applications.",
    d: "Verified, sandboxed programs run in the kernel at chosen hooks and aggregate events into in-kernel maps, which a user-space agent reads. They can measure request latency, connection errors, retransmits and file access for any process, and some can reconstruct protocol-level spans for uninstrumented services. Overhead stays low because aggregation happens in the kernel. It is hard because probes depend on kernel versions and features, see encrypted traffic only at the library boundary, and require elevated privileges.",
    k: ["Kernel observation vs library instrumentation: kernel probes cover every process with no code changes and see little business context, while instrumentation sees rich context and needs every service to adopt it.", "Aggregate in the kernel vs ship raw events: kernel aggregation is cheap and loses event detail, while raw events keep detail and may exceed budgets."],
    p: ["A probe tied to internal kernel structures breaks silently after a kernel upgrade.", "Running the agent with broad privileges gives a compromised collector the ability to read all host traffic."],
    v: "Run an uninstrumented service with a known injected latency and connection failure rate, and confirm the probe-derived metrics report both within a few percent without any application change.",
    dep: ["system-and-host-collectors","resource-attributes","access-control"]
  },
  "metadata-enrichment": {
    s: "Adding facts about where telemetry came from, such as host, orchestrator workload, region and release version, by looking them up from the platform and attaching them as attributes.",
    d: "A processor or agent function looks up the source of each piece of telemetry, by IP address, container ID or process, in a cache populated from the orchestrator's API or cloud metadata service. It attaches attributes like workload name, namespace, node, availability zone and version label. These attributes make telemetry searchable by the dimensions teams think in. It is hard because lookups must be correct at the time of the event: a pod can be rescheduled and its IP reused, so a stale cache labels data with the wrong owner.",
    k: ["Enrich at the agent vs at the gateway: agent enrichment has local facts and cheap access, while gateway enrichment is central and relies on IP addresses that can be ambiguous.", "Attach as resource attributes vs as per-item labels: resource attributes are sent once per batch and cheap, while per-item labels bloat every record."],
    p: ["A recycled IP address attributed to the previous workload sends telemetry to the wrong team's dashboards.", "Calls to the orchestrator's API from every agent overload it at fleet restart."],
    v: "Move a test workload to a new node and confirm data emitted afterward carries the new node and zone attributes, and none carries the old values beyond the cache refresh interval.",
    dep: ["resource-attributes","service-discovery"]
  },
});
