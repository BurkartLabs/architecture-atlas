// Details for the observability stack plate, part 2: signal stores, retention and tenancy, profiling.
ATLAS.details("observability-stack", {
  "metrics-store": {
    s: "A time-series store that ingests labeled numeric samples, compresses them heavily, and serves range queries by label, holding recent data in memory and older data in blocks.",
    d: "Each unique label set is a series with a stream of timestamped values. Incoming samples go to a write-ahead log and an in-memory head, where timestamps and values are delta-encoded and compressed to a byte or two per sample. Periodically the head is cut into immutable blocks with an inverted index from label pairs to series. Queries resolve matchers through the index, then decode only the needed chunks. Memory use scales with the number of active series, which is why label cardinality is the central operational problem.",
    k: ["Memory-resident head with periodic blocks vs write-through to disk: the head gives fast ingest and queries on recent data, while a crash needs log replay and memory must hold all active series.", "Single-node store vs horizontally sharded: single-node is simple and fast up to a ceiling, while sharding scales out and adds replication, rebalancing and query merging."],
    p: ["A label holding a user or request ID creates millions of short-lived series and exhausts memory in minutes.", "Slow log replay after a crash leaves a long window with no recent data to alert on."],
    v: "Ingest a known number of series and samples, restart the store, and confirm it replays to the same series count, and a query returns the original values with no gap beyond the restart.",
    dep: ["write-ahead-log","object-storage-blocks","cardinality-limits"]
  },
  "log-store": {
    s: "Storage for log lines as compressed chunks grouped by stream, with a small index, optimized for high write volume and scanning selected streams rather than searching everything.",
    d: "Incoming lines are grouped by their label set into streams, appended to in-memory chunks and flushed as compressed objects once they reach a size or age. A small index maps label sets and time ranges to chunk locations. Queries use the index to pick chunks, then decompress and scan them in parallel. Writes are cheap and storage is dominated by compressed text. The difficulty is the other side: searching broad time ranges without a good selector costs a full scan, and many tiny streams create many tiny chunks.",
    k: ["Small label index plus scan vs full-text index: the small index makes ingest and storage cheap, while queries without selective labels are slow compared with an inverted text index.", "Large chunks vs small chunks: large chunks compress better and cost less to store, but delay data from reaching durable storage and are slower to read for narrow searches."],
    p: ["Labels with high cardinality fragment data into huge numbers of small chunks and slow every query.", "Chunks held in memory before flush are lost with the process if the log in front of them is not replicated."],
    v: "Write a known volume of lines across several streams, query one stream for a fixed hour, and confirm the line count matches what was written to that stream and that the other streams were not read.",
    dep: ["log-label-index","object-storage-blocks","write-ahead-log"]
  },
  "log-label-index": {
    s: "A small index over stream labels, such as service, environment and level, that finds which chunks to read without indexing the contents of the log lines themselves.",
    d: "The index maps each label name and value to the set of streams that carry it, and each stream to its chunks by time range. It is small because it covers only labels, not words. Query planning intersects label matchers to get streams, then time bounds to get chunks. It only works if labels are few in value count and stable per source. The hard cases are labels derived from content, such as a request path, which turn the cheap index into an expensive one with the same cardinality problem as metrics.",
    k: ["Index labels only vs index fields in the lines: label-only keeps the index tiny and cheap to run, while field indexing speeds up searching on values at much higher cost.", "Few stable labels vs rich labels per line: few labels keep chunks large and queries predictable, while rich labels give precise selection and fragment the data."],
    p: ["Promoting a high-cardinality field such as a user ID to a label multiplies streams and can make the store unusable.", "Inconsistent label names between services, such as app and service, make one selector miss half the logs."],
    v: "Query by a selector that matches one service in one environment and confirm the plan reads only that service's chunks, and that adding a new label value creates exactly one new stream.",
    dep: ["log-store","write-ahead-log"]
  },
  "log-full-text-index": {
    s: "An inverted index over the words or tokens in log lines, allowing fast needle-in-haystack searches across large volumes at a significant cost in storage and ingest work.",
    d: "Each line is tokenized, and each token maps to a posting list of the documents that contain it. Searches intersect posting lists, rank or filter results and fetch the matching documents. Indexes are split into segments that are written once and merged in the background. The index often exceeds the size of the compressed raw text and dominates ingest cost. It is hard to size: the work scales with volume and the number of distinct tokens, and a burst of unique values such as identifiers inflates it quickly.",
    k: ["Full-text index vs label index and scan: the full index answers arbitrary searches quickly, but storage and ingest cost can be several times higher.", "Index everything vs a selected subset of fields: everything is convenient for investigation, while a subset keeps cost bounded and makes unindexed searches slow."],
    p: ["Indexing every line of verbose debug logging multiplies cost for data that is almost never searched.", "Segment merges during heavy ingest steal capacity and slow both writes and searches."],
    v: "Index a known corpus containing one line with a rare token, search for that token, and confirm exactly that line is returned within the latency target while index size stays within the planned ratio.",
    dep: ["object-storage-blocks","write-ahead-log"]
  },
  "trace-store": {
    s: "Storage for spans grouped into traces, usually columnar and compressed, optimized for very high write rates and for retrieving a whole trace by its identifier.",
    d: "Spans arrive from collectors, are buffered, and are written in blocks sorted or indexed by trace ID, often in a columnar layout so attribute searches read only the needed columns. Whole-trace lookup uses an index or bloom filter to find which blocks might hold the ID. Retention is short and volume is high. It is hard because spans of one trace arrive over seconds from many services, so blocks must tolerate late arrivals, and attribute search over cold blocks is scanning work that cost grows with.",
    k: ["Columnar blocks with scan vs row store with secondary indexes: columnar is cheap to write and good at attribute filters, while secondary indexes speed specific lookups and slow ingest.", "Short retention with all data vs long retention of sampled data: short full retention supports debugging recent incidents, while long sampled retention supports trend analysis of representative traces."],
    p: ["Late spans written to blocks already sealed show up as separate partial traces.", "Retention set in days against terabytes per day pushes storage cost beyond the rest of the stack combined."],
    v: "Emit a trace spanning three services with deliberate delays between spans, wait past the late-arrival window, and confirm lookup by trace ID returns all spans in one trace.",
    dep: ["trace-id-lookup-index","object-storage-blocks","write-ahead-log"]
  },
  "trace-id-lookup-index": {
    s: "A structure that maps a trace identifier to the blocks containing its spans, usually bloom filters or sorted ID ranges, so lookup does not scan all stored data.",
    d: "Each block records a bloom filter over the trace IDs it holds, or the range of IDs if sorted. A lookup tests the filters, reads the blocks that might contain the ID, and discards false positives after reading. Because IDs are random, they cannot be range-partitioned for locality, so the index is a cost of every lookup. Tuning trades filter size against false positive rate. It is hard because lookups from a link in a log line happen at any age, including in cold storage where each extra block read is slow.",
    k: ["Bloom filters per block vs a global ID index: filters are small and cheap to write and cause extra reads, while a global index gives exact lookups and costs ingest and storage.", "Larger filters vs more false-positive reads: larger filters cut wasted reads and consume memory or cache, while smaller ones are cheap and slow."],
    p: ["Filters sized for the expected volume degrade sharply when a traffic burst fills blocks with many more IDs than planned.", "Lookups on an ID older than retention return nothing and look like a broken link rather than expired data."],
    v: "Store a million traces, look up a sample of one thousand IDs including some unknown ones, and confirm all known IDs are found and the average number of blocks read per miss stays near the designed false-positive rate.",
    dep: ["trace-store","object-storage-blocks"]
  },
  "object-storage-blocks": {
    s: "Immutable blocks of compressed telemetry and their indexes written to cheap object storage, which holds the bulk of the data for every signal and lets compute scale separately.",
    d: "Stores flush their in-memory data as blocks with a small metadata file, upload them, and later compact many small blocks into larger ones to reduce read cost. Queriers fetch block indexes, cache hot ones locally and read byte ranges from objects as needed. A background process enforces retention by deleting expired blocks. Because object storage has high latency per request and charges per request, block size and layout matter. The difficulty is consistency: compaction, deletion and queries run concurrently against an eventually visible listing.",
    k: ["Shared object storage vs local disks on each node: object storage is cheap, durable and lets nodes be disposable, while local disks are faster for reads and tie data to node lifetime.", "Aggressive compaction vs minimal: compaction speeds up queries and lowers request counts, while using compute and temporarily doubling storage."],
    p: ["Compaction deleting source blocks while a long query still reads them fails that query halfway through.", "Many tiny blocks from a short flush interval make queries slow and request charges high."],
    v: "Flush data, run compaction, and confirm queries over the same range return identical results before and after, and that the number of objects read per query decreases by the expected factor.",
    dep: []
  },
  "write-ahead-log": {
    s: "An append-only record of incoming data on local disk, written before data is acknowledged, so a crash can be recovered by replaying what was in memory but not yet flushed.",
    d: "Each incoming batch is appended to a log segment and synced according to policy, then applied to the in-memory structure. On restart the store replays segments from the last checkpoint to rebuild memory. Segments are truncated once their contents are safely in blocks. In replicated designs several nodes each hold the log so a single failure loses nothing. Recovery time grows with the amount of un-flushed data, which means a large head means a slow restart and a longer gap in availability.",
    k: ["Sync on every write vs periodic sync: every write survives power loss and limits throughput, while periodic sync is fast and may lose the last moments.", "Replicate the write path vs rely on one node's log: replication survives node loss and costs network and consistency work, while a single log loses data with the disk."],
    p: ["A full disk stops the log, and the store then rejects or silently drops incoming writes.", "A corrupted tail segment after a crash can block startup unless replay tolerates and truncates it."],
    v: "Kill the store process abruptly during ingest, restart it, and confirm every acknowledged sample is queryable and replay time stays under the stated recovery target.",
    dep: []
  },
  "retention-tiers": {
    s: "Policies that keep recent telemetry on fast storage at full resolution and move older data to cheaper storage at lower resolution or in sampled form, until it is deleted.",
    d: "A typical layout keeps days of full-resolution data in hot storage, weeks to months in object storage with downsampling, and perhaps a year of aggregates. Different signals get different tiers: logs are kept shorter than metrics and traces shorter still. Policies can differ by tenant, environment or label. A background process moves and deletes data. It is hard because each tier changes what can be asked: an old query may silently run on coarser data, and compliance rules may require longer or shorter retention than is cheap.",
    k: ["Long retention at low resolution vs short at full resolution: long coarse data supports capacity planning, while short full data supports detailed debugging of recent events.", "Uniform retention vs per-tenant or per-label: uniform is simple to explain and operate, while per-class retention matches value and cost and must be maintained."],
    p: ["Engineers query last quarter's incident and find only coarse aggregates that cannot answer their question.", "A retention change that applies only to new data leaves old data at the previous policy without anyone noticing."],
    v: "Write data with known timestamps across all tiers, advance the policy clock, and confirm each age range is served from the expected tier at the expected resolution and expired data is gone.",
    dep: ["object-storage-blocks","downsampling"]
  },
  "downsampling": {
    s: "Replacing old raw samples with aggregates at coarser intervals, such as five-minute and one-hour minimum, maximum, sum and count, so long-range queries are cheap and storage shrinks.",
    d: "A background job reads raw blocks and writes new series per aggregate for each interval, keeping several aggregates because no single one answers every question. The query layer chooses the resolution to match the requested step and range. Counters are handled by storing counts and resets correctly. Histograms must keep bucket counts. It is hard because the original samples cannot be recovered, a quantile cannot be computed from averages, and a spike shorter than the interval can vanish if only averages were kept.",
    k: ["Keep min, max, sum and count vs only average: multiple aggregates preserve spikes and allow correct rates, while average-only is one quarter the size and hides extremes.", "Automatic resolution selection vs user-selected: automatic is convenient and sometimes surprising, while explicit selection is predictable and puts the burden on the user."],
    p: ["Averages of per-instance averages produce numbers that no instance experienced, misleading capacity planning.", "A short outage disappears from downsampled data, so a later review concludes there was none."],
    v: "Ingest a signal with a two-minute spike, downsample to five-minute intervals, and confirm the maximum aggregate shows the spike while the average shows it diluted by the expected factor.",
    dep: ["metrics-store","retention-tiers"]
  },
  "cardinality-limits": {
    s: "Hard caps on the number of active series, label values or label names per tenant or per metric, enforced at ingest to stop one mistake from exhausting the store.",
    d: "The ingest path tracks the number of active series per tenant and per metric name, and rejects or drops new series beyond a limit, returning a clear error to the sender. Limits may also cap label counts, label value length and the number of distinct values for a label. They are set from observed need and adjusted through a request process. The difficulty is that rejection is a data-loss decision: the first series refused are the newest, which may be the ones that matter, and the sender must learn about it.",
    k: ["Reject new series over the limit vs drop oldest or sample: rejecting is simple and protects the store, while dropping oldest keeps new data and loses history unpredictably.", "Per-tenant limit only vs per-metric limits as well: tenant-wide limits are easy to explain, while per-metric limits stop one metric from consuming the whole allowance."],
    p: ["A rejected-series counter that nobody alerts on lets teams lose data for weeks without knowing.", "Limits raised repeatedly on request become meaningless and the store hits its real ceiling."],
    v: "Send series above the configured limit from a test tenant and confirm excess series are rejected with an error naming the limit, a rejection metric rises, and other tenants are unaffected.",
    dep: ["metrics-store","ingest-rate-limits","pipeline-self-metrics"]
  },
  "cardinality-analysis": {
    s: "Tools that show which metrics and labels contribute the most series, how fast they grow, and which label combinations are responsible, so cardinality problems can be fixed at the source.",
    d: "The analysis reads the store's index to count series per metric name, per label and per label value, and tracks growth over time. A report lists the top contributors and what share of the total each represents, and may name the owning team from labels. The same view guides removing or aggregating labels in the pipeline. It is hard because the heaviest label is not always the culprit: cardinality is a product of labels, so the real cause is often a pair that individually look harmless.",
    k: ["Continuous analysis vs on-demand reports: continuous tracking catches growth early and costs index scans, while on-demand is cheap and finds problems after they hurt.", "Attribute to a team automatically vs report by metric name: team attribution makes action possible, while name-only reports leave ownership a manual search."],
    p: ["Looking only at per-label counts misses a combination of two moderate labels that multiplies into millions.", "A report run after an incident ended shows clean data because the offending series have already expired."],
    v: "Add a label with one thousand values to a test metric and confirm the analysis names that metric and label within one refresh interval with a series count close to one thousand times the existing count.",
    dep: ["metrics-store","cost-attribution"]
  },
  "cost-attribution": {
    s: "Measuring how much storage, ingest and query capacity each team or service consumes, so the cost of telemetry can be shown back to the people who create it.",
    d: "The pipeline and stores emit usage per tenant and per label: bytes ingested, active series, log volume, spans per second and query cost. These are converted to money using the unit costs of storage and compute, and reported to teams on a regular basis with trends. Some organizations charge back; others only show. The difficulty is allocation: shared infrastructure, derived data such as recording rules, and queries that touch many teams' data all need agreed rules for who pays.",
    k: ["Showback of cost vs actual chargeback: showback builds awareness with little friction, while chargeback creates real incentives and arguments about allocation.", "Attribute by ingested volume vs by value retrieved: ingested volume is easy to measure, while attributing by use rewards data that is actually read and is harder to compute."],
    p: ["Costs reported by team name from a label that is optional leave a large unattributed share nobody owns.", "Reports delayed by a month show a spike only after the budget is gone."],
    v: "Send a known volume of logs from a labeled test service for one day and confirm the cost report attributes that volume, in bytes and in money, to the service's owning team within a few percent.",
    dep: ["multi-tenancy","pipeline-self-metrics","resource-attributes"]
  },
  "multi-tenancy": {
    s: "Serving many teams or customers from one platform with isolated data, separate limits and per-tenant access, identified by a tenant ID carried on every write and read.",
    d: "Each request carries a tenant identity set by a trusted front door, not by the client. Stores partition data by tenant and queries are scoped to one or an explicit set of tenants. Limits, retention and rules are configured per tenant, and noisy-neighbor protections such as shuffle sharding limit the blast radius of one tenant's behavior. The challenge is strict isolation without duplicating the platform: caches, indexes and query queues must not leak or let one tenant starve another.",
    k: ["Shared platform with logical isolation vs separate stacks per tenant: shared is far cheaper and needs rigorous isolation, while separate stacks are simple to reason about and multiply operations.", "Tenant per team vs per environment: per team matches ownership and budgets, while per environment separates production from test and splits one team's view of its service."],
    p: ["A cache keyed without the tenant ID returns one tenant's results to another.", "A client allowed to set its own tenant header reads or writes data that belongs to someone else."],
    v: "Write distinct data as two tenants and confirm each can query only its own data, a cross-tenant query is refused without permission, and one tenant exceeding its quota does not slow the other.",
    dep: ["access-control","tenant-quotas","metrics-store","log-store","trace-store"]
  },
  "tenant-quotas": {
    s: "Per-tenant limits on ingest rate, stored volume, query concurrency and query cost, applied so that one tenant's surge cannot degrade the platform for everyone else.",
    d: "Quotas are values in a per-tenant configuration enforced at the distributors for writes and at the query frontend for reads. Limits cover samples or bytes per second, burst size, series count, query time range and concurrent queries. Exceeding a quota returns a distinct error so clients can back off, and usage is exported for dashboards. The difficulty is calibration: limits too low cause data loss during normal growth, too high protect nothing, and they must be adjustable without a deploy.",
    k: ["Hard limits vs soft limits with warnings: hard limits protect the platform predictably and cause loss on a surge, while soft limits avoid loss and rely on people reacting in time.", "Static quotas vs automatic scaling with spend caps: static quotas are simple to reason about, while automatic scaling adapts and can create surprise bills."],
    p: ["A quota error returned as a generic failure leads clients to retry harder and make the overload worse.", "Limits tuned from last month's traffic reject legitimate growth during a launch."],
    v: "Push a tenant above its write quota and confirm requests receive the documented throttling response, the quota-exceeded metric increments for that tenant, and another tenant's latency is unchanged.",
    dep: ["multi-tenancy","ingest-rate-limits","query-frontend"]
  },
  "ingest-rate-limits": {
    s: "Limits at the edge of the platform on how fast data can enter, with burst allowance, which shed load deliberately instead of letting stores fall over.",
    d: "Distributors apply token buckets per tenant and globally, counting samples, log bytes or spans. Over-limit requests receive a retryable status with a retry hint, and clients or collectors honor it by queuing and slowing down. Limits are tuned to what the stores can absorb, and some systems shed lower-priority data first. It is hard because rate limits are only half the protocol: the senders must understand and obey throttling, or the limit simply converts overload into data loss.",
    k: ["Reject with a retry hint vs accept and queue internally: rejecting pushes buffering to clients that can persist it, while internal queues hide overload until memory runs out.", "Priority shedding vs uniform: priority keeps critical signals during overload and needs classification, while uniform shedding is fair and drops important data equally."],
    p: ["Clients that retry immediately and without backoff turn a short throttle into a sustained flood.", "Limits that count only requests and not size let a few huge batches overload the stores."],
    v: "Send traffic at twice the limit and confirm throttling responses with retry hints begin immediately, accepted volume stays at the limit, and a well-behaved collector delivers everything after its queue drains.",
    dep: ["backpressure","pipeline-self-metrics"]
  },
  "profiler-agents": {
    s: "Low-overhead samplers that periodically record the call stacks of running processes, producing profiles of where CPU time, memory and locks are spent, collected continuously in production.",
    d: "An agent samples stacks at a fixed rate, often a hundred times per second, either from inside the process through a runtime hook or from outside through kernel-level sampling. Stacks are aggregated into counts per unique call path, labeled with service, version and host, and uploaded every few seconds or minutes. Allocation and lock profiles need different mechanisms. It is hard because overhead must stay near one percent, and symbol resolution is needed to turn addresses into function names, which can fail for stripped or optimized binaries.",
    k: ["In-process sampling vs system-wide kernel sampling: in-process sees runtime frames and needs a library per runtime, while kernel sampling covers everything with no code changes and weaker symbolization.", "High sampling rate vs low: high rates resolve short functions and cost more overhead, while low rates are nearly free and need long aggregation to be useful."],
    p: ["Binaries built without frame information produce truncated stacks that attribute time to the wrong function.", "A profiler left at a debugging sample rate adds noticeable latency to production services."],
    v: "Run a service with a known hot function consuming about half its CPU and confirm the uploaded profile attributes that share to the function within a few percent, with profiler overhead measured below the budget.",
    dep: ["resource-attributes","kernel-level-probes","transport-security"]
  },
  "profile-store": {
    s: "Storage for aggregated stack samples over time, labeled like metrics, supporting queries by service and time range and merging of many profiles into one.",
    d: "Profiles are stored as sample counts per stack with labels, in a block layout where identical stacks and function names are deduplicated through a symbol table. Queries select profiles by labels and a time range and merge them by adding counts. Because each profile is large, the store relies on aggressive deduplication and on object storage for the bulk. It is hard because merging thousands of profiles on every query is costly, and symbol data for old builds must be kept long enough to read old profiles.",
    k: ["Store raw sampled stacks vs pre-aggregated profiles: raw allows arbitrary later queries at high storage cost, while pre-aggregation is compact and fixes the questions.", "Resolve symbols at ingest vs at query time: ingest resolution makes queries fast and cannot be redone, while query-time resolution works with later-uploaded symbols and is slower."],
    p: ["Symbol files for old releases are deleted before their profiles, so old data shows only raw addresses.", "Unbounded label cardinality on profiles produces the same series explosion as in the metrics store."],
    v: "Upload profiles for two versions of a service, query a merged profile for a fixed hour, and confirm sample totals equal the sum of the uploaded profiles and function names resolve for both versions.",
    dep: ["object-storage-blocks","write-ahead-log","multi-tenancy"]
  },
  "flame-graph-queries": {
    s: "Queries that merge profiles over a chosen service and time range and render them as a flame graph, or diff two ranges to show what got slower between releases.",
    d: "A query selects profile data by labels, merges stacks, and returns a tree where each node's width is its share of samples. The viewer draws it as stacked bars so hot paths stand out, and supports zoom, search and a table of top functions. A comparison query subtracts one merge from another, such as before and after a deploy, to highlight growth. It is hard because the merged view hides variance, and comparing ranges with different load needs normalization to be meaningful.",
    k: ["Merge all samples in the range vs filter to one trace or request: merging finds systemic costs, while filtering explains one slow case and needs trace-linked samples.", "Absolute sample counts vs normalized by traffic: absolute counts are exact and mislead across different load, while normalized comparisons need a trustworthy load measure."],
    p: ["A flame graph over a long range averages away a periodic spike that causes the problem.", "Diffing two profiles from different load levels shows a large regression that is only extra traffic."],
    v: "Deploy a change that adds a known function costing about ten percent of CPU, run a diff of the hours before and after, and confirm that function appears as the largest positive difference.",
    dep: ["profile-store","query-frontend"]
  },
  "profile-trace-linking": {
    s: "Attaching span identifiers to profile samples so the time a slow span spent on the CPU can be viewed as a profile of exactly that request or endpoint.",
    d: "While a span is active, the runtime labels the sampling thread with the span or endpoint identifier, so each stack sample records which request it served. The trace viewer then shows a profile filtered to that span, and profile queries can be restricted to one route. The links work only for sampled spans and only for work on the profiled thread. It is hard because asynchronous work moves across threads, so labels must follow the context, and storing per-span labels on every sample increases cost sharply.",
    k: ["Label samples per span vs per endpoint: per span is exact for one request and expensive to store, while per endpoint is cheap and answers route-level questions only.", "Link every profile vs only sampled traces: linking everything is complete and heavy, while linking sampled traces keeps cost low and leaves most requests without a profile."],
    p: ["Work handed to another thread pool loses the label and its time appears unattributed.", "Profiles for a trace that was sampled out do not exist, so the link in the viewer opens an empty graph."],
    v: "Make one request known to spend most of its time in a specific function, open its trace, follow the profile link, and confirm the flame graph is dominated by that function.",
    dep: ["profile-store","span-api","context-propagation","trace-viewer"]
  },
});
