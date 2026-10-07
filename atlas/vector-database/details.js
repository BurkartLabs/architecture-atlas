// Details for the vector database plate, part 1: client API, tenancy, operations, query planning.
ATLAS.details("vector-database", {
  "grpc-and-http-api": {
    s: "The network endpoints through which applications create collections, write vectors and run searches, usually a binary streaming protocol for throughput and a plain HTTP and JSON form for convenience.",
    d: "Requests are authenticated, decoded, validated against the collection schema and handed to the write path or the query planner. Vectors are large: a thousand 1536-dimension float vectors is about six megabytes, so encoding matters, and binary framing avoids the cost of parsing decimal text. Streaming calls let a client upload in batches with back-pressure. The hard parts are keeping the two protocol surfaces identical in behavior, versioning the request schema without breaking old clients, and bounding request size so a single call cannot starve the node.",
    k: ["Binary protocol only versus a second JSON surface: one surface is simpler to keep correct, but a JSON form makes debugging and quick scripts easy and costs a second code path to maintain.", "Synchronous acknowledgment versus asynchronous accept: waiting for durable write gives clear semantics, while accepting early gives throughput but needs a way for clients to learn when data is searchable."],
    p: ["Sending vectors as decimal text multiplies payload size and CPU, and rounding in text can change the stored values.", "Unbounded request bodies let one client allocate gigabytes of buffers and take the node down."],
    v: "Upload one thousand vectors through both protocol surfaces and read them back by ID; confirm the returned values are bit-identical and an oversized request is rejected with a size error rather than accepted.",
    dep: ["schema-validation", "query-timeouts-and-limits"]
  },
  "client-libraries": {
    s: "Language bindings that wrap the API with connection pooling, retries, batching helpers and typed request builders so applications do not hand-roll the protocol.",
    d: "A client holds connections to one or more nodes, discovers the cluster topology, retries transient failures and splits large uploads into batches that fit the server's limits. Good clients expose the tuning knobs of the server, such as search depth and filter expressions, in a typed form. They also carry embedding helpers that call a model and write the result in one step. Difficulty comes from retry safety: a retried write must be idempotent, so the client needs stable IDs, and a retried search should not multiply load on an already overloaded cluster.",
    k: ["Smart client that routes to the owning node versus a thin client behind a load balancer: smart routing saves a hop but must track topology changes.", "Automatic retries versus surfacing errors: retries hide blips but can amplify an overload into a storm unless they use backoff and budgets."],
    p: ["Retrying an upsert with generated IDs creates duplicates that differ only in ID.", "A client default for search depth that is tuned for a small demo collection silently gives low recall on a large one."],
    v: "Kill the connected node mid-upload and confirm the client reconnects, resumes, and the final collection count equals the number of distinct IDs sent, with no duplicates.",
    dep: ["grpc-and-http-api"]
  },
  "write-endpoints": {
    s: "Operations that insert, replace, partially update and delete points, each carrying an ID, one or more vectors and a metadata payload, with batch forms for throughput.",
    d: "An upsert names a point by ID: if it exists, it is replaced. A partial update changes payload fields without resending the vector, which avoids touching the index at all. Deletes by ID or by filter are turned into tombstones. Each call validates dimensions and types, appends to the write-ahead log, and returns when the configured durability level is met. The hard part is semantics under concurrency: two writers updating the same ID need a defined winner, and a delete by filter must say which snapshot of the data it applies to.",
    k: ["Upsert as the only write verb versus separate insert and update: upsert is idempotent and safe to retry, but it hides accidental overwrites.", "Payload-only updates that skip the index versus full rewrite: much cheaper, but they require payload and vector to be stored and versioned separately."],
    p: ["A delete by filter evaluated while writes continue can miss points inserted a moment later, leaving data that was meant to be removed.", "Partial updates that read-modify-write on the client overwrite concurrent changes to other fields."],
    v: "Upsert a point, update only its payload, then search: confirm the vector is unchanged, the payload shows the new value, and the index build counter did not increase.",
    dep: ["write-ahead-log", "schema-validation", "id-mapping"]
  },
  "search-endpoint": {
    s: "The call that returns the top-k nearest points to a query vector, with optional filters, a score threshold, search-depth settings and a choice of which fields to return.",
    d: "The request names a collection and a query vector, or text to be embedded, plus k, filters and per-query overrides of index parameters. The planner chooses a strategy, segments are searched in parallel, and the merged top-k is returned with scores and requested payload. Pagination is awkward because similarity ranking has no stable cursor: deep offsets mean searching for offset plus k. The difficulty is giving callers enough control to tune recall and latency while keeping defaults safe, and being clear that scores depend on the metric and are not comparable across collections.",
    k: ["Offset pagination versus a keep-searching cursor: offsets are simple but cost grows with depth, while cursors need server state or a score-and-ID boundary.", "Exposing search-depth knobs per query versus fixing them per collection: per-query lets callers choose speed or accuracy, but invites misuse."],
    p: ["Asking for a very large k to paginate client-side makes every request slow and memory-heavy.", "Comparing scores from different metrics or models, or treating a similarity score as a calibrated probability."],
    v: "For a collection with known brute-force answers, issue one hundred queries with default settings and compare to exact results; confirm the measured recall meets the documented target and the response includes the requested fields.",
    dep: ["query-planner", "query-parser", "result-shaping"]
  },
  "batch-search": {
    s: "Runs many queries in one call so the server can share work, amortize network and scheduling cost, and keep memory-bound scans efficient.",
    d: "A batch carries tens to thousands of query vectors. The server can scan segment data once and score all queries against each block, turning memory-bound dot products into matrix multiplication that CPU vector units or accelerators handle well. For graph indexes, batching mostly saves per-request overhead and lets queries run on a thread pool. Results come back in order with per-query errors. The difficulty is fairness and memory: a huge batch can hog all workers, and one slow query should not hold up the rest of the response.",
    k: ["Scanning once for the whole batch versus independent searches: shared scans raise throughput several times, but add latency for the fastest query and need extra memory for score buffers.", "Fail the whole batch on one error versus per-query results: partial results are friendlier but make client code handle mixed outcomes."],
    p: ["A batch sized for offline evaluation sent to a serving cluster crowds out interactive traffic.", "Per-query filters that differ widely defeat shared scanning, so the batch gets none of the advertised speedup."],
    v: "Run 1,000 queries once as a batch and once individually on a flat collection; confirm identical results and measure throughput gain, and confirm a malformed query yields one error entry, not a failed batch.",
    dep: ["search-endpoint", "flat-scan", "query-timeouts-and-limits"]
  },
  "result-shaping": {
    s: "Controls what comes back with each hit: the score, the ID, selected payload fields, optionally the stored vector, and grouping so one document does not fill the list with its own chunks.",
    d: "After the top-k is chosen, the server fetches only the requested fields from payload storage, which can cost more than the search itself for large payloads. Grouping collapses hits by a key such as a document ID and returns the best few per group, which needs the search to look deeper than k. Score thresholds drop weak hits. Returning vectors costs bandwidth and is rarely needed. The difficulty is that these features change how deep the index search must go, so shaping options feed back into the plan.",
    k: ["Fetch payload during search versus after the final merge: after is cheaper because only k rows are read, but filtering on payload must still happen during.", "Group-by in the server versus in the client: server grouping looks deeper once and returns less data, but adds a stateful step to the merge."],
    p: ["Requesting every payload field for each of a hundred hits turns a millisecond search into a slow disk-bound request.", "A score threshold chosen on one model's score scale silently returns nothing after a model change."],
    v: "Query for ten hits grouped by document ID over chunked data; confirm ten distinct documents are returned, each with its best chunk, and compare against client-side grouping of a much larger result list.",
    dep: ["payload-storage", "top-k-heap-merge"]
  },
  "query-timeouts-and-limits": {
    s: "Hard limits on search time, result size, filter complexity, batch size and concurrent requests, so a single heavy query cannot degrade the whole service.",
    d: "Each request carries a deadline. Search loops check it between graph hops or partition scans and return partial results or an error when it passes. Admission control caps concurrent searches per node and queues or rejects the rest. Limits on k, filter depth and batch size keep worst-case cost known. The work is done in cooperative checks rather than thread kills, because killing a thread that holds a lock or a memory-mapped page is unsafe. The difficulty is choosing limits that protect the cluster without breaking legitimate large queries, and making rejection fast.",
    k: ["Return partial results at the deadline versus fail: partial answers keep user interfaces responsive but can hide that recall dropped, so the response must say so.", "Per-tenant concurrency caps versus a global cap: per-tenant isolates neighbors but wastes capacity when others are idle."],
    p: ["A deadline checked only between segments lets one huge segment run for seconds past it.", "Queueing instead of rejecting under overload makes every request slow, then every request time out."],
    v: "Send a query with a one-millisecond deadline against a large collection and confirm it returns promptly flagged as partial or timed out, then saturate the node and confirm excess requests are rejected quickly with a retry hint.",
    dep: ["metrics-and-latency", "quotas-and-rate-limits"]
  },
  "multi-tenancy-models": {
    s: "The choice of how customers share a deployment: one collection each, one partition each, a tenant field on a shared index, or separate clusters, trading isolation against cost.",
    d: "A shared index with a tenant filter is cheapest but every query pays for neighbors it must exclude, and one tenant's load affects others. A partition or namespace per tenant gives a separate small index, which keeps queries fast and deletion simple but costs fixed memory and metadata per tenant, which hurts at hundreds of thousands of tenants. Whole clusters per tenant give the strongest isolation at the highest cost. Real systems mix: large tenants get dedicated partitions and small ones share. The difficulty is that tenant sizes follow a heavy-tailed distribution, so no single model fits all.",
    k: ["Index per tenant versus shared index with filter: separate indexes give exact isolation and fast deletes but fixed per-tenant overhead; shared indexes scale to many tiny tenants but filtered search can lose recall.", "Static assignment versus automatic promotion of large tenants: promotion saves operators work but moves data while serving."],
    p: ["A shared index with a filter that matches a tiny fraction of points degrades graph search into near-random traversal.", "Per-tenant indexes for a hundred thousand mostly empty tenants exhaust memory on index headers alone."],
    v: "Load one very large tenant and ten thousand tiny ones; confirm a tiny tenant's query latency and recall stay within target while the large tenant runs a heavy load.",
    dep: ["namespace-per-tenant", "metadata-tenant-filter"]
  },
  "namespace-per-tenant": {
    s: "A separate partition or index for each tenant inside one collection, so a query only touches that tenant's vectors and deleting a tenant is dropping a unit.",
    d: "Writes name a namespace, and the system routes them to that tenant's segments. A query searches only those segments, so cost scales with the tenant's size, not the total. Namespaces can be lazily created, loaded on demand and evicted from memory when idle, which allows far more tenants than fit in RAM at once. Small tenants may use a flat scan since their data is tiny. The difficulty is the cold start: the first query after eviction must load an index from disk or object storage, and the metadata for many namespaces must itself stay manageable.",
    k: ["Load tenants on demand versus keep all resident: on-demand saves memory for a long tail of idle tenants but adds first-query latency.", "One physical index per namespace versus a shared structure with tenant-aware partitions: separate is simpler to delete, shared uses memory more evenly."],
    p: ["A scheduled report that touches thousands of idle tenants in sequence thrashes the cache and evicts hot ones.", "Dropping a namespace must also remove it from caches, backups and replicas, or deleted data lingers."],
    v: "Create ten thousand namespaces, query a random cold one and record first-query latency, then query it again; confirm both meet target and that dropping the namespace makes its data unreachable on every replica.",
    dep: ["immutable-segments", "hot-warm-cold-tiers", "collection-schema"]
  },
  "metadata-tenant-filter": {
    s: "Isolates tenants on a shared index by attaching a tenant field to each point and adding it as a mandatory filter to every query.",
    d: "The tenant ID is stored as an indexed payload field, and the query layer injects the filter automatically from the caller's credentials so users cannot omit it. Search then uses the filtered path: restricted graph traversal or pre-filtering when the tenant is small. It scales to millions of tiny tenants with one index. The difficulty is correctness and performance together: a missed injection leaks data across tenants, and for selective filters the plan must switch strategy or the graph search finds few valid neighbors.",
    k: ["Injecting the filter on the server from credentials versus trusting clients to add it: server injection prevents leaks, at the cost of coupling the query layer to identity.", "Filter during traversal versus separate per-tenant sub-indexes for large tenants: the hybrid keeps small tenants cheap and large ones fast."],
    p: ["An administrative or internal code path that bypasses the filter injection exposes every tenant's data.", "Low-selectivity tenants get poor recall because the graph neighbors reached from entry points mostly belong to other tenants."],
    v: "With two tenants holding near-identical vectors, query as one and confirm no returned point belongs to the other, including via batch search and grouped results; then check recall for a tiny tenant against exact search.",
    dep: ["payload-indexes", "filtered-graph-traversal", "authn-and-roles"]
  },
  "authn-and-roles": {
    s: "Verifies who is calling and what they may do: API keys or tokens mapped to roles with rights per collection and operation, such as read, write and administer.",
    d: "Each request carries a credential that resolves to an identity, a tenant scope and a set of permissions. The check runs before planning and again at the data layer for operations like export or filter-by-field. Roles are typically coarse: read, write, admin, with optional per-collection scoping. Keys are stored hashed and rotated. Auditing records administrative actions. The difficulty is that a fine-grained policy, such as per-record access, conflicts with a shared index: access rules would have to be applied as filters during search, which costs recall and latency.",
    k: ["Coarse collection-level roles versus per-record access control: coarse is cheap and auditable, while per-record rules need filters on every query and complicate caching.", "Long-lived keys versus short-lived tokens: keys are convenient for services, but tokens limit the damage of a leak and need an issuer."],
    p: ["A read-only role that can still call an export or snapshot endpoint can copy the entire dataset.", "A cache keyed by query but not by caller serves one user's results to another."],
    v: "Create a read-only key and confirm writes, deletes and snapshot calls are refused while searches succeed; revoke the key and confirm requests fail within the documented time.",
    dep: ["grpc-and-http-api"]
  },
  "quotas-and-rate-limits": {
    s: "Per-tenant caps on stored vectors, request rate, concurrent queries and write throughput that keep one customer from consuming shared resources.",
    d: "Counters track vectors stored, bytes, requests per second and in-flight queries per tenant or key, usually with token buckets enforced at the edge and a lightweight check on the storage side. Quotas on storage are checked on write, rate limits on every request. Excess requests get a clear status and a retry hint. Costs can also be metered for billing: stored dimensions, queries and index builds. The difficulty is enforcing limits across a cluster without a central bottleneck, and making sure background work such as compaction and reindexing is charged and throttled sensibly.",
    k: ["Strict enforcement versus soft limits with alerts: strict protects shared capacity but can break a customer at peak; soft limits need a human to react.", "Local counters per node versus a shared counter: local is fast and approximate, shared is exact and adds latency and a failure point."],
    p: ["Approximate per-node limits let a tenant exceed its quota by the number of nodes.", "A tenant reindexing its collection consumes the cluster's build capacity while the quota counts only user requests."],
    v: "Set a storage quota of one million vectors, upload past it and confirm writes are refused at the limit with the quota error, existing data stays searchable, and the usage report matches the stored count.",
    dep: ["authn-and-roles", "metrics-and-latency"]
  },
  "tenant-deletion-and-export": {
    s: "Removes or extracts all of one tenant's data completely, including vectors, payloads, index structures, caches, replicas and backups, to meet contractual and legal requirements.",
    d: "On a dedicated namespace this is dropping segments and metadata. On a shared index it means tombstoning every point with the tenant's ID, then waiting for compaction to physically remove them, and for snapshots to age out. Export streams points in a portable form, ideally from a consistent snapshot. Deletion needs a verifiable state: a tenant marked deleting stops serving, then deleted. The difficulty is physical erasure: deleted vectors can remain in old segments, replicas, caches and backups long after queries stop returning them.",
    k: ["Immediate physical purge versus logical delete then compaction: purging is verifiable and slow to run, while logical deletion is instant but leaves data on disk for hours.", "Export from live data versus from a snapshot: live is simple but inconsistent while writes continue."],
    p: ["Declaring a tenant deleted while backups and replicas still hold its vectors.", "A shared-index delete that tombstones points but never triggers compaction keeps the data on disk indefinitely."],
    v: "Delete a tenant on a shared collection, force compaction, then scan the raw segment files and every replica for the tenant's IDs and payload bytes and confirm none remain; confirm a restore from the oldest retained backup is flagged.",
    dep: ["tombstones-and-deletes", "segment-merge-compaction", "backup-and-snapshots"]
  },
  "metrics-and-latency": {
    s: "Counters and histograms for request rates, latency percentiles, errors, queue depths, memory and disk use, broken down by collection and operation.",
    d: "Each search records its total latency and its phases: planning, per-segment search, filter evaluation, merge and payload fetch. Percentiles matter more than means, because tail latency is set by the slowest segment or shard. Resource metrics track resident index memory, cache hit rate, page faults and disk reads per query. Alerts fire on error rates and latency objectives. The difficulty is that latency alone is misleading for approximate search: a system can get faster by silently returning worse results, so latency metrics must be paired with a quality signal.",
    k: ["Per-collection metrics versus per-tenant: per-tenant explains noisy neighbors, but cardinality explodes with many tenants.", "Sampling phase timings versus recording all: sampling is cheap and good enough for trends, while full recording helps debug rare slow queries."],
    p: ["A latency improvement after a parameter change celebrated without checking that recall fell.", "Averaging latency across collections of very different size hides one collection's regression."],
    v: "Run a mixed workload and confirm the dashboard shows p50, p99, cache hit rate and per-phase time, then slow one shard artificially and confirm the p99 for affected queries rises while others do not.",
    dep: ["query-tracing"]
  },
  "recall-measurement": {
    s: "Continuously estimates how often approximate search returns the true nearest neighbors, by comparing sampled live queries against exact search.",
    d: "A sample of production queries is replayed against an exact flat scan, and the overlap of the top-k sets gives recall at k. This runs in the background on a replica or off-peak so it does not hurt serving. A fixed evaluation set with stored ground truth supports comparing parameter changes and index versions. Recall can also be broken down by filter selectivity, tenant or segment. The difficulty is that ground truth is expensive on large collections and goes stale as data changes, and that average recall hides queries, often filtered ones, where it is far lower.",
    k: ["Sampling live queries versus a fixed evaluation set: live reflects real traffic and drift, fixed makes versions comparable.", "Overlap-based recall versus rank-aware metrics: overlap is simple and answers whether neighbors were found, while rank-aware metrics penalize ordering errors that matter to downstream ranking."],
    p: ["Evaluating recall only on unfiltered queries while production traffic is mostly filtered.", "Ground truth computed once and reused after the data changed, so recall appears to fall or rise for no reason."],
    v: "Sample five hundred live queries, compute exact top-10 by flat scan and compare with served results; confirm the reported recall equals the measured overlap and that a deliberate reduction in search depth lowers it.",
    dep: ["flat-scan", "metrics-and-latency"]
  },
  "query-tracing": {
    s: "Per-request traces showing which segments and shards were searched, how many vectors were scored, how many graph hops or partitions were visited and how long each stage took.",
    d: "A traced query records the chosen strategy, the filter's estimated and actual selectivity, distance computations per segment, cache hits and misses, and the time spent in each node of a cluster. Traces are sampled, or triggered by a debug flag or a slow-query threshold. They explain why one query was slow, for example because it fell back to scanning, and why another returned few results, because the filter pruned the traversal. The difficulty is overhead on the hot path and joining spans across shards.",
    k: ["Always-on counters versus sampled full traces: counters are nearly free but coarse, traces explain individual cases at a cost.", "Tracing in the server versus the client: server traces see internals, client traces see end-to-end including network."],
    p: ["Tracing on every request adds measurable latency to the queries being measured.", "Traces that omit the chosen plan make a fallback to brute force invisible."],
    v: "Send a query known to trigger a fallback scan and confirm its trace names the strategy, the number of distance computations equals the segment size, and the stage times sum to the total.",
    dep: ["search-strategy-selector", "metrics-and-latency"]
  },
  "index-health-reports": {
    s: "Reports on each index and segment: size, number of vectors, fraction deleted, graph connectivity, build parameters and age, so operators can see when rebuilds or merges are due.",
    d: "The system tracks per-segment statistics such as live and tombstoned counts, how long since a merge, the quantization codebook version and graph degree distribution. It can sample for unreachable nodes, whose absence from the graph means they can never be returned. Reports flag segments with a high deleted fraction, indexes built with outdated parameters, and tenants with too many tiny segments. The difficulty is that degradation is gradual: heavy deletes and incremental inserts slowly erode graph quality with no error to alert on.",
    k: ["Reporting derived health scores versus raw statistics: scores are actionable but hide assumptions, raw numbers let experts decide.", "Checking graph connectivity during idle time versus never: it finds real problems but costs a traversal of the whole index."],
    p: ["A graph that has accumulated deletes keeps serving, yet recall quietly sinks until a user complains.", "Reports computed from segment metadata that disagrees with the actual files after a crash."],
    v: "Delete forty percent of a segment's points and confirm the report flags its deleted fraction, then run the merge and confirm the fraction returns to zero and measured recall matches the pre-delete level.",
    dep: ["tombstones-and-deletes", "segment-merge-compaction", "recall-measurement"]
  },
  "backup-and-snapshots": {
    s: "Point-in-time copies of collections that can be restored on the same or another cluster, built from immutable segment files plus the log position they cover.",
    d: "Because segments are immutable, a snapshot is mostly a list of segment files plus the metadata and log position, so it can be made quickly and copied to object storage incrementally, with unchanged segments shared between snapshots. Restoring either copies files back and replays the log, or attaches them in place. Snapshots can be taken per shard and must be coordinated across a cluster to be consistent. The difficulty is consistency across shards and across the index and payload, and the time and bandwidth to move terabytes.",
    k: ["Segment-file snapshots versus logical export of vectors: file snapshots are fast and exact but tied to the version and index parameters, while logical export is portable and requires rebuilding indexes.", "Cluster-wide coordinated snapshot versus per-shard snapshots: coordinated gives one consistent view, per-shard is simpler and may be mutually inconsistent."],
    p: ["Restoring a snapshot into a build that cannot read its format or quantization version.", "A backup that has never been restored, found to be missing payload files only during an incident."],
    v: "Snapshot a collection, delete it, restore into an empty cluster and run a fixed query set; confirm results and counts equal those from before the snapshot and the restore time meets the stated objective.",
    dep: ["immutable-segments", "object-storage-tier", "write-ahead-log"]
  },
  "capacity-planning": {
    s: "Estimates memory, disk, CPU and network needs from vector count, dimension, index type, quantization, replication factor and query rate, before data is loaded.",
    d: "Raw vector memory is count times dimensions times bytes per element; a graph index adds neighbor lists, often another few hundred bytes per vector; quantization divides the vector part; replication multiplies everything. Query load sets the CPU: each search costs a certain number of distance computations, which depends on target recall. Planning tools combine these into node counts and show the effect of choices such as moving vectors to disk. The difficulty is that recall target and filter patterns change the cost, so estimates should be checked by a benchmark on representative data, not a formula.",
    k: ["Formula-based estimates versus measured benchmarks: formulas are instant and miss workload effects, benchmarks are accurate and take time.", "Sizing for peak versus average query rate: peak avoids saturation at higher cost, while average relies on autoscaling that may lag."],
    p: ["Sizing memory for vectors alone and forgetting graph links, payload indexes and the cost of a rebuild running alongside serving.", "Planning from random synthetic vectors, whose behavior in graph search differs from clustered real embeddings."],
    v: "Predict memory for ten million vectors from the planner, load them and compare with measured resident size; confirm the estimate is within ten percent including the index and payload overhead.",
    dep: ["memory-vs-disk-economics", "index-parameters"]
  },
  "admin-and-migration-tools": {
    s: "Command-line and API tools for creating collections, changing settings, moving data between clusters or versions and inspecting internal state.",
    d: "Operators need to copy a collection into another cluster, change replication, rebuild an index with new parameters and inspect segment files. Migration tools stream points and payloads from a source to a target, usually through a snapshot, and track progress so they can resume. Version upgrades must read old segment formats or rebuild them. Safe tools default to dry runs and refuse destructive actions without confirmation. The difficulty is doing large changes online: a migration must tolerate writes arriving during the copy and verify the final counts and sample queries match.",
    k: ["Copy-then-catch-up with a log tail versus a stop-the-world copy: catch-up avoids downtime but needs a replayable change feed.", "Letting tools read raw segment files versus only the public API: raw access is fast and tied to internal formats."],
    p: ["A migration that copies vectors but not the aliases, payload indexes or quantization settings, giving a collection that works but searches slower.", "A destructive command run against the production cluster because the context name was not shown."],
    v: "Migrate a live collection to a new cluster while writes continue; after cutover confirm point counts match, a fixed query set returns the same top-10 and no writes from the migration window are missing.",
    dep: ["backup-and-snapshots", "collection-aliases"]
  },
  "query-parser": {
    s: "Decodes a request into an internal query: vector or text, k, filter expression tree, fusion settings and index overrides, validating each against the collection's schema.",
    d: "Filters arrive as a tree of conditions over payload fields: equality, ranges, set membership, geographic or text predicates, combined with and, or, not. The parser checks that fields exist, types match and the vector dimension equals the collection's. It normalizes the filter, for example flattening nested ands and pushing negations down, so the planner can estimate its cost. Text queries are routed to the embedding hook or the lexical index. The difficulty is a filter language rich enough for applications yet safe: an unbounded expression is itself a denial-of-service vector.",
    k: ["A structured filter tree versus a SQL-like string: trees are easy to validate and compose in code, strings are friendlier for people and need a real parser.", "Strict schema checking versus permissive: strict catches typos like a misspelled field, which would otherwise silently match nothing."],
    p: ["A filter on a misspelled field name that matches nothing and returns an empty result instead of an error.", "Deeply nested boolean expressions that take longer to plan than to execute."],
    v: "Submit a query with a wrong-dimension vector, an unknown filter field and a type mismatch; confirm each gets a specific error before any search work starts, and that a valid nested filter is normalized as documented.",
    dep: ["collection-schema", "schema-validation"]
  },
  "query-planner": {
    s: "Chooses how to run a query: which segments to include, which index or scan to use in each, how deep to search and in what order to apply filters.",
    d: "For each segment the planner knows its size, index type, payload indexes and statistics. It estimates how many points the filter matches, then picks a strategy per segment: a flat scan for small segments or very selective filters, filtered graph traversal or pre-filtering for others. It sets search depth from the requested k and recall target, and may oversample when a later rerank or grouping step needs more candidates. Its output is a set of per-segment tasks run in parallel. The difficulty is that cost estimates are approximate, and a wrong choice can be orders of magnitude slower or lose recall.",
    k: ["Rule-based thresholds versus cost-model-based choice: thresholds are predictable and easy to explain, a cost model adapts to data but needs good statistics.", "Plan once per query versus adapt per segment: per-segment decisions fit mixed segment sizes but add planning overhead."],
    p: ["A threshold tuned on one dataset sending a different selectivity range to the slow strategy.", "Stale statistics after a bulk delete cause a plan that assumes many matches where few remain."],
    v: "Run the same vector query with filters matching 90, 10 and 0.1 percent of points; confirm the trace shows different strategies and that each meets its recall and latency target against exact results.",
    dep: ["search-strategy-selector", "filter-selectivity-estimation", "immutable-segments"]
  },
  "search-strategy-selector": {
    s: "The decision rule inside the planner that picks between exact scan, index search with in-traversal filtering, and pre-filtered scan based on collection size and expected filter matches.",
    d: "If the set that passes the filter is smaller than a threshold, scanning just those points exactly is both faster and perfectly accurate, so the selector uses it. If the filter passes most points, searching the graph and discarding failures works. In between, filtered traversal with extra search depth or special neighbor links is used. Thresholds depend on dimension, quantization and hardware. Some systems pick a strategy per query and others per segment. The hard case is correlation: a filter correlated with the query region leaves graph neighbors mostly invalid.",
    k: ["Fixed cutoff on matching fraction versus learned or adaptive cutoff: fixed is simple, adaptive handles hardware and data differences and needs feedback from past queries.", "Falling back to exact scan automatically versus warning the caller: automatic keeps results correct, but latency can jump with data growth."],
    p: ["A threshold that sends a growing collection to exact scan until latency suddenly doubles when it crosses the limit.", "Correlated filters, such as a category that matches the query's neighborhood, misclassified by an estimator assuming independence."],
    v: "Sweep the filter's matching fraction from 100 percent to 0.01 percent on a fixed collection and plot latency and recall; confirm the selector switches strategy near its documented cutoff without recall dipping below target.",
    dep: ["filter-selectivity-estimation", "flat-scan", "filtered-graph-traversal", "pre-filtering"]
  },
  "query-router": {
    s: "Sends a query to the shards or partitions that can contain answers, and to a chosen replica of each, balancing load and avoiding unhealthy nodes.",
    d: "With random or hash sharding every shard must be searched, so routing means picking a healthy replica per shard. With a partition key or a coarse clustering of the vector space, the router can skip shards that cannot contain relevant vectors, trading some recall for less work. Routing tables come from the cluster membership and are refreshed on topology changes. Replica choice considers load and recent latency. The difficulty is hedging: sending a duplicate request when one replica is slow cuts tail latency but increases load.",
    k: ["Search every shard versus prune by partition: all-shard is exact in coverage and costs more; pruning saves work and can miss neighbors outside the probed partitions.", "Hedged requests versus single attempts: hedging cuts p99 and raises total load."],
    p: ["A stale routing table sends queries to a node that no longer owns the shard and returns empty results without an error.", "Always preferring the fastest replica concentrates load until it becomes the slowest."],
    v: "Take a replica out of rotation during a load test and confirm queries continue with no failures and routing tables update in the documented time; compare results before and after to confirm unchanged recall.",
    dep: ["cluster-membership", "replica-sets", "shard-partitioning"]
  },
  "scatter-gather-merge": {
    s: "Sends a query to many shards in parallel, waits for their local top-k lists and combines them into one global ranking.",
    d: "Each shard returns its best k candidates with scores. The coordinator merges them and keeps the global top k, which is correct because any global top-k hit must be in its own shard's top k. Latency is set by the slowest shard, so deadlines and straggler handling matter. Coordinators may request more than k from each shard when a rerank or grouping step needs depth. Scores must be comparable across shards, which they are when metric and quantization match. The difficulty is partial failure: when a shard times out, the system must choose between returning incomplete results and failing.",
    k: ["Wait for all shards versus return after a quorum or deadline: waiting gives complete answers, a deadline bounds latency and may omit a shard's hits.", "Fetching payloads at the shard versus at the coordinator: shard-side saves moving data that the merge discards, coordinator-side avoids duplicating fetch logic."],
    p: ["Shards on different quantization or index versions producing scores that are not comparable, which corrupts the merged order.", "A single slow shard pushing the whole cluster's p99 latency."],
    v: "On a sharded collection, compare merged top-10 with a flat scan across all data using exact settings; confirm they are identical, then stall one shard and confirm the response is flagged incomplete within the deadline.",
    dep: ["top-k-heap-merge", "query-router", "query-timeouts-and-limits"]
  },
  "top-k-heap-merge": {
    s: "Maintains a bounded priority queue of the best k candidates while segments, partitions or shards stream results in, discarding anything that cannot beat the current worst.",
    d: "A max-heap of size k keyed by distance holds candidates; a new candidate is admitted only if it beats the heap's worst. The current worst distance can also be shared with the segments still running, which lets them stop earlier because they cannot contribute. Ties are broken deterministically by ID so repeated queries give stable output. Results from deleted points are dropped before admission. The difficulty is correctness with concurrency and with approximate segments: one segment's candidates may be excellent while another returned nothing.",
    k: ["Shared global bound across segments versus independent local top-k: sharing prunes more work, and adds synchronization and makes results depend on timing unless carefully ordered.", "Deterministic tie-breaking versus arrival order: deterministic ordering costs little and makes tests and pagination reproducible."],
    p: ["Duplicate points present in two segments after an update both appearing in the result.", "Using the tombstone check after the merge lets deleted hits push live ones out of the top k."],
    v: "Insert duplicates of the same vector across segments with distinct IDs and run repeated queries; confirm identical ordering every time, no deleted point ever appears, and the result matches a single-segment exact scan.",
    dep: ["tombstones-and-deletes", "distance-metrics"]
  },
  "query-cache": {
    s: "Stores results of recent searches keyed by the query, filter and collection version, so repeated identical or near-identical queries are answered without searching.",
    d: "Exact-match caching helps where users repeat searches, but with high-dimensional vectors exact repeats are rare unless the query comes from a short text that is embedded identically. Semantic caches accept a query whose vector is within a small distance of a cached one, trading correctness for speed. Entries are invalidated by collection version so writes are never hidden. Segment-level caches of hot index pages and quantized vectors are more broadly useful. The difficulty is staleness and cost: a cache that returns old results after a write can violate freshness expectations, and near-match caches can return results for a different intent.",
    k: ["Exact-key cache versus near-match cache: exact is always correct for a given version, near-match gets more hits and can serve a subtly wrong answer.", "Invalidating on any write versus on affected segments only: whole-collection invalidation is simple and wastes hits on busy collections."],
    p: ["A semantic cache threshold set loosely enough that distinct questions share one answer.", "Caching a filtered result without including the caller's tenant or permissions in the key."],
    v: "Run a query, write a new nearest point, then run the same query again; confirm the new point appears, the first repeat without writes is a cache hit, and cache keys differ across tenants.",
    dep: ["immutable-segments", "authn-and-roles"]
  },
  "rerank-stage": {
    s: "A second scoring pass over the candidates from approximate search, using exact vectors or a heavier model to put the final top-k in a better order.",
    d: "Search over compressed vectors fetches more candidates than needed, often four to ten times k. The rerank stage reloads each candidate's full-precision vector, usually from SSD, and recomputes exact distances, which restores ranking quality lost to quantization. A cross-encoder or other model can rerank beyond similarity, but that call usually lives outside the database. Candidate fetch is random I/O, so the number of candidates directly sets tail latency. The difficulty is tuning oversampling: too few candidates leaves recall on the table, too many makes rerank the dominant cost.",
    k: ["Oversample factor high versus low: high recovers recall and costs random reads and CPU, low keeps latency down and hits a recall ceiling set by compression.", "Rerank inside the database versus in the application: inside has local access to full vectors, in the application allows richer models and spreads cost."],
    p: ["Reranking with vectors stored in a different precision than the ones used to define ground truth gives inconsistent scores.", "Candidate vectors fetched one at a time with synchronous reads, which makes each rerank step wait on the disk."],
    v: "Search a quantized index with and without rerank at the same oversample setting and compare recall against exact search; confirm rerank restores recall close to the full-precision index and measure the added latency.",
    dep: ["exact-rerank", "binary-quantization", "vector-file-layout"]
  }
});
