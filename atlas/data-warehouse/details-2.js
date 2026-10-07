// Details for the data warehouse plate, part 2: workload management, cost, planning, execution.
ATLAS.details("data-warehouse", {
  "cluster-sizing": {
    s: "Choosing how many workers a compute cluster has, usually as discrete t-shirt sizes where each step doubles the nodes and the hourly cost.",
    d: "A cluster size maps to a node count. Queries parallelize across nodes, so a larger cluster finishes a scan-heavy query faster, often at similar total cost because the work is billed by time times size. Small queries do not speed up and waste capacity. Memory per node matters for joins and sorts, so a query that spills on a small cluster may run far faster on a larger one. The hard part is that the right size depends on the data volume and concurrency, both of which change, and resizing affects running queries differently by platform.",
    k: ["Scale up one big cluster vs many small ones: big improves single-query latency and memory; many improves concurrency and isolation.", "Fixed sizes vs arbitrary node counts: fixed sizes are easy to reason about and bill; they force coarse steps where a smaller increase would do."],
    p: ["Every workload is put on an oversized cluster because it makes the slowest query faster, and idle capacity is billed all day.", "A query that spills is blamed on bad SQL when doubling memory would have fixed it."],
    v: "Run the same scan-heavy query on two sizes, confirm the larger finishes in about half the time with similar total credits, and that a trivial lookup shows no speedup.",
    dep: ["node-pool","task-scheduler"]
  },
  "multi-cluster-scaling": {
    s: "Adding and removing identical clusters behind one logical name as concurrent demand changes, so queries start without queueing while load is high.",
    d: "A multi-cluster group has a minimum and maximum cluster count. When queued statements exceed a threshold, the services layer starts another cluster of the same size; when load falls and clusters have been idle, it retires them. Statements are routed to the cluster with capacity. It scales concurrency, not single-query speed. Policies choose between starting clusters eagerly for latency or conserving credits by queueing a little. The hard part is cold caches on new clusters and the cost of a maximum set too high.",
    k: ["Eager scale-out vs economical scale-out: eager minimizes queue time; economical lets short queues build and saves credits.", "Scaling out vs scaling up: out handles many users with small queries; up helps few users with big queries, and mixing the two goals in one group does neither well."],
    p: ["A runaway dashboard refresh triggers scale-out to the maximum and the credits are gone before anyone sees an alert.", "New clusters start with empty caches, so the first queries after scale-out are much slower."],
    v: "Submit a burst of fifty concurrent queries to a group with minimum one and maximum four, confirm additional clusters start, queue time stays within the target, and they retire after the idle period.",
    dep: ["queueing-limits","node-pool","usage-metering"]
  },
  "auto-suspend-resume": {
    s: "Stopping a compute cluster after a period of inactivity and restarting it automatically on the next statement, so idle time is not billed.",
    d: "The services layer tracks the last activity of each cluster. After the configured idle time it releases the nodes and drops their local cache; the next query triggers resume, which acquires nodes from the pool in seconds. Billing usually has a minimum charge per resume. The trade-off is between idle cost and cold-start penalty: a short suspend interval saves credits but discards the cache each time, so repeated queries restart cold. The hard part is a steady trickle of queries that keeps the cluster awake for little work.",
    k: ["Short idle timeout vs long: short saves credits on bursty workloads; long preserves cache and avoids per-resume minimum charges.", "Auto-resume on any statement vs manual start: auto is convenient and invisible; it lets a stray query or monitoring ping wake an expensive cluster."],
    p: ["A health check polls every minute and keeps a large cluster running all night.", "Suspension drops the cache, so the first dashboard of the morning is slow and users blame the query."],
    v: "Leave a cluster idle past its timeout and confirm it reports suspended with billing stopped; issue a query and confirm it resumes, returns correct rows and shows a cold-cache read in the profile.",
    dep: ["node-pool","usage-metering","local-data-cache"]
  },
  "queueing-limits": {
    s: "Limits on how many statements run at once on a cluster and how long others wait, with queue timeouts and statement timeouts protecting the system from pileups.",
    d: "Each cluster has a concurrency limit derived from memory, since each running statement reserves some. Extra statements wait in a queue ordered by arrival or priority. Timeouts cancel statements that wait too long or run too long. Per-role or per-pool limits stop one team from taking all slots. The queue is the signal for scaling out. Hard parts are fairness, since a few huge queries can hold slots while many small ones wait, and mis-set timeouts that kill legitimate long jobs or let broken ones run for hours.",
    k: ["Fixed concurrency cap vs memory-based admission: a cap is predictable and simple; memory-based admission uses capacity better but varies with the query mix.", "Single queue vs priority classes: classes keep dashboards snappy during batch loads; they add configuration and can starve low-priority work."],
    p: ["A long-running report holds slots so interactive queries queue behind it for minutes.", "A global statement timeout set for dashboards kills the nightly batch halfway through."],
    v: "Saturate a cluster with long queries, submit a short one, and confirm it queues, shows queue time in history, and is cancelled with a clear error after the queue timeout if capacity never frees.",
    dep: ["task-scheduler","role-hierarchy"]
  },
  "query-acceleration": {
    s: "A shared pool of extra serverless compute that takes over the scan-heavy parts of eligible queries, so a modest cluster can handle occasional large queries.",
    d: "For queries with large scans and selective filters or aggregations, the planner offloads fragments of the scan to separate workers outside the cluster. They read partitions, apply filters and send reduced data back. The cluster handles the rest of the plan. It is billed separately per use and typically capped by a scale factor. It helps when most queries are small and a few are big. It does not help joins that are the bottleneck, and its benefit is hard to predict before running.",
    k: ["Offload to a shared pool vs resize the cluster: offload costs only when big queries appear; resizing speeds all queries but costs for every second of use.", "Automatic eligibility vs explicit opt-in: automatic needs no tuning; opt-in prevents surprise spend on unpredictable queries."],
    p: ["Assuming it speeds up every slow query, teams enable it and see charges without any improvement.", "Heavy use on a table with unselective filters moves the full data volume through the pool for no gain."],
    v: "Run a large selective scan with and without acceleration, and confirm the profile shows offloaded partitions, a lower elapsed time on the small cluster and a separate acceleration charge in metering.",
    dep: ["serverless-compute","scan-operators","usage-metering"]
  },
  "usage-metering": {
    s: "Continuous measurement of compute time, storage bytes, serverless activity and data transfer, converted to billable credits and exposed in queryable views.",
    d: "Compute is metered per cluster-second, often with a minimum on each resume, multiplied by size. Serverless features meter by the compute they consume. Storage is sampled daily as average bytes, including history and clones. Transfer is metered by region crossing. Usage events are written to an account-level ledger that views expose with a delay. The hard part is trusting it: reconciling credits to queries requires apportioning shared cluster time, and delayed or restated records can change a number after it was reported.",
    k: ["Per-second compute billing with minimums vs coarse billing: per-second matches use closely; minimums make very short bursts disproportionally costly.", "Delayed batch usage views vs real-time counters: batch is cheap and consistent; real-time guards would need streaming accounting."],
    p: ["Metering views lag by hours, so a runaway workload is invisible until after the damage.", "Cloned and historical data are counted as storage when someone assumed copies were free."],
    v: "Run a known workload for ten minutes on a cluster of known size and confirm the metering view reports credits matching size times duration, within the documented tolerance.",
    dep: ["metadata-store","cluster-sizing"]
  },
  "resource-monitors": {
    s: "Quotas on credit consumption per account or cluster over a period, with thresholds that notify, suspend new work or kill running queries when crossed.",
    d: "A monitor defines a credit quota for a day, week or month and a list of triggers, such as notify at seventy-five percent, suspend at one hundred and suspend immediately at one hundred and ten. It is attached to the account or to specific clusters. The services layer compares metered usage against the quota on a schedule. Because usage is metered with delay, enforcement overshoots by what runs between checks. It is a blunt tool: it stops workloads without knowing which are important.",
    k: ["Hard suspend vs notify only: suspend guarantees a ceiling; it can halt critical pipelines mid-month.", "One account-wide monitor vs per-team monitors: account-wide catches total spend simply; per-team ties limits to owners and avoids one team exhausting everyone's budget."],
    p: ["Enforcement lag lets a large cluster run for an hour past the quota before suspending.", "A monitor suspends the cluster that serves production dashboards, because a batch job on it used the budget."],
    v: "Set a small quota on a test cluster, run queries until it is crossed, and confirm the notification fires at the threshold, new statements are rejected after suspension and the overshoot is within the documented delay.",
    dep: ["usage-metering","auto-suspend-resume"]
  },
  "budgets-chargeback": {
    s: "Allocating metered cost to teams, projects and pipelines through tags and roles, then reporting it, setting budgets and billing internal customers.",
    d: "Cost is attributed by cluster dedicated to a team, by tags on queries, users or objects, or by apportioning shared cluster time by query execution time. Budgets compare attributed spend to a plan and alert on projected overrun. Chargeback exports a monthly statement per department. The hard part is shared resources: a cluster used by five teams has no exact split, so every allocation rule is a policy, and untagged work lands in an unowned bucket that nobody manages.",
    k: ["Dedicated clusters per team vs shared clusters with apportioning: dedicated gives exact attribution and isolation; shared uses capacity better but needs an allocation rule.", "Showback vs chargeback: showback builds awareness without disputes; chargeback creates real incentives and real arguments about the allocation."],
    p: ["Untagged queries make up a third of spend and no team owns it.", "An allocation rule that charges by query time penalizes teams whose queries wait behind others."],
    v: "Tag queries from three teams, run a known mix, and confirm the monthly report totals match metered credits within a small tolerance and that untagged spend is listed explicitly.",
    dep: ["usage-metering","query-cost-attribution"]
  },
  "query-cost-attribution": {
    s: "Estimating the credits each statement consumed on a shared cluster from its execution time and resources, to find expensive queries and owners.",
    d: "Query history records elapsed time, bytes scanned, partitions scanned, spill volume and the cluster used. Cost per query is estimated by proportioning the cluster's metered time across concurrent statements by their execution time. Reports rank by user, role, tag or repeated query shape. They show which dashboards or pipelines drive spend and whether a rewrite or clustering would help. It is an estimate: idle time, queueing and cache hits distort it, and a cheap query run a million times costs more than one expensive query.",
    k: ["Proportional by execution time vs by bytes scanned: time reflects occupied capacity; bytes ignore CPU-heavy queries that scan little.", "Per-statement cost vs per-fingerprint totals: per-statement finds outliers; fingerprint totals find the frequent cheap queries that dominate."],
    p: ["Optimizing the single slowest query while a lightweight query run every minute costs ten times more overall.", "Treating the estimate as an exact bill leads to disputes between teams over small differences."],
    v: "Run two distinct queries many times on an otherwise idle cluster and confirm the per-query estimates sum to within a few percent of the cluster's metered credits for that interval.",
    dep: ["usage-metering","query-profile"]
  },
  "parser-binder": {
    s: "Turns SQL text into a syntax tree, then resolves names, types, functions and permissions against the catalog to produce a validated logical query.",
    d: "The parser builds a tree from SQL following a standard grammar plus extensions. The binder resolves each table, column and function against the catalog, expands views and macros, infers types, inserts casts and checks privileges for the active role. Policies for row access and masking are injected here. Errors for ambiguity and unknown names are reported with positions. The difficulty is volume and reuse: very large generated queries and deep views produce huge trees, and bind time can dominate for fast queries.",
    k: ["Expanding views at bind time vs treating them as opaque: expansion lets the optimizer see through them; it multiplies plan size for deeply nested definitions.", "Strict type checking vs permissive implicit casts: strict catches mistakes early; permissive is friendlier for loosely typed sources but hides data problems."],
    p: ["A BI tool generates a ten-thousand-line statement and compile time exceeds execution time.", "Implicit casts on a join key silently prevent pruning and turn a point lookup into a full scan."],
    v: "Submit a query that references a view over two tables, a column the role cannot read and a misspelled column; confirm the plan shows the expanded view, the privilege error names the column, and the typo error points to its position.",
    dep: ["catalog-namespaces","role-hierarchy"]
  },
  "rewrite-rules": {
    s: "Logical transformations that produce a simpler but equivalent plan: predicate pushdown, projection pruning, subquery unnesting, constant folding and common expression elimination.",
    d: "The optimizer applies a set of rules repeatedly until the plan stops changing. Predicates move down toward scans so files can be pruned and fewer rows flow upward. Unused columns are dropped so the scan reads fewer column chunks. Correlated subqueries are rewritten as joins. Constants are evaluated once. Rules are independent of data statistics, which makes them cheap and always beneficial. The hard parts are correctness, since each rule must preserve semantics including nulls and duplicates, and interactions, where one rule enables or blocks another.",
    k: ["Rule-based rewrites before cost-based search vs a single unified search: separate rewrites are fast and predictable; a unified search can find better plans but explodes in cost.", "Aggressive subquery unnesting vs conservative: aggressive makes many queries much faster; null and duplicate semantics make some rewrites incorrect in edge cases."],
    p: ["A pushed-down predicate containing a non-deterministic function changes results between runs.", "A rule that does not fire for an unusual form of a subquery leaves a nested-loop execution that never finishes."],
    v: "Run explain on a query with a filter above a join and an unused column, and confirm the plan shows the filter at the scan and the unused column absent from the scanned column list.",
    dep: ["parser-binder"]
  },
  "cost-based-optimizer": {
    s: "Chooses among equivalent plans by estimating the rows and cost of each operator from statistics, picking the cheapest estimated plan.",
    d: "Using column statistics such as distinct counts, min and max, null counts and histograms, the optimizer estimates the selectivity of predicates and the cardinality of joins, then costs alternatives for access paths, join order, join methods and aggregation placement. In a separated-storage system, statistics come from the metadata that already describes each file, so they are cheap and always current. The hard part is estimation error: correlation between columns and skewed joins make estimates wrong by orders of magnitude, and errors compound through a deep plan.",
    k: ["Metadata-derived statistics vs separately gathered statistics: derived are free and fresh; they are coarse, with no histograms for some columns and sampling only for others.", "Trust estimates for plan shape vs adapt at runtime: trusting is simple and predictable; adapting corrects bad estimates but complicates execution."],
    p: ["Correlated filters are estimated as independent, so the optimizer thinks a join returns almost nothing and picks a plan that explodes.", "A recently loaded table with changed distribution produces a plan tuned for the old data."],
    v: "Compare the estimated and actual row counts in the profile for each operator of a multi-join query, and confirm the largest mismatch is flagged so it can be diagnosed.",
    dep: ["column-statistics","rewrite-rules","partition-metadata"]
  },
  "join-planning": {
    s: "Deciding the order in which tables are joined and how each join runs, by broadcast of a small side, partitioned hash exchange, or a join with a pre-filtered build side.",
    d: "For each join the planner picks a build side, usually the smaller after filtering, and a distribution strategy. A broadcast sends the small input to every worker; a partitioned join hashes both inputs on the key; co-located joins avoid movement when both are already distributed the same way. Join order search is limited by time, so large queries use heuristics. Semi-join filters can be pushed from the build side to the probe scan. The difficulty is skew and estimation: one hot key can overload a worker.",
    k: ["Broadcast the small side vs partition both: broadcast avoids shuffling the large side; it fails when the small side is not small after all.", "Exhaustive join-order search vs heuristics: exhaustive finds better plans for small queries; its cost grows factorially with the number of tables."],
    p: ["A broadcast table that grows past memory starts spilling and turns a quick query into an hours-long one.", "A skewed join key sends half the data to one worker while the rest of the cluster idles."],
    v: "Join a large table to a filtered small one, confirm explain shows the small side as the build side, and that the profile reports the small side's actual rows within an expected range.",
    dep: ["cost-based-optimizer","exchange"]
  },
  "pruning-planner": {
    s: "Using per-file column ranges in metadata to decide at plan time which micro-partitions can possibly contain matching rows, and scanning only those.",
    d: "For each filter predicate on a column, the planner compares the predicate's range against the min and max values stored for every micro-partition. Files whose range cannot match are skipped without being read. Pruning works best when data is clustered on the filter column so ranges are narrow and do not overlap. It extends to joins through runtime filters built from the other side. Effectiveness shows as the ratio of partitions scanned to total. The difficulty is that functions applied to the column, implicit casts or unclustered data make ranges useless.",
    k: ["Pruning from metadata alone vs adding index structures: metadata is nearly free to maintain; it prunes poorly on columns with wide overlapping ranges.", "Static pruning at plan time vs dynamic pruning at runtime: static is simple and early; dynamic reaches join-driven filters but only after part of the plan has run."],
    p: ["Wrapping the filter column in a function turns a pruned lookup into a full scan.", "A table loaded in random order has overlapping ranges, so every partition appears to match."],
    v: "Run a filter on a clustered column and read the profile: partitions scanned should be a small fraction of the total; run the same filter on an unclustered column and confirm the ratio is near one.",
    dep: ["partition-metadata","column-statistics","clustering-keys"]
  },
  "query-profile": {
    s: "A per-query record of the executed plan with timing, rows, bytes, spill, pruning and wait breakdown per operator, used to diagnose slow statements.",
    d: "During execution each operator records time by phase, rows in and out, bytes scanned, local and remote reads, spill volume and network transfer. At completion the data is kept as a graph linked to the statement. Analysts read it to spot the dominant operator, exploding joins, poor pruning and skew. It also feeds recommendations and cost attribution. The challenge is overhead and interpretation: the collection must be nearly free, and the reader needs to know that time by operator overlaps in a pipeline.",
    k: ["Always-on profiling vs on-demand: always-on lets you diagnose a slow run after the fact; it costs a little on every query and storage for the history.", "Per-operator aggregates vs per-worker detail: aggregates stay small and readable; per-worker detail exposes skew but is large."],
    p: ["Looking only at total time per operator hides that one worker took ten times longer than the others.", "Profiles expire before the weekly performance review so the slow query cannot be examined."],
    v: "Run a query with a known skew, open its profile and confirm it identifies the dominating operator, the row counts at each stage and a spill or pruning figure that matches the planted problem.",
    dep: ["metadata-store","vectorized-execution"]
  },
  "scan-operators": {
    s: "Operators that read only the needed column chunks of the selected files from cache or object storage, apply filters early and produce batches for the rest of the plan.",
    d: "A scan receives the list of surviving micro-partitions, fetches each file's footer, then reads only the needed column ranges with parallel requests, using the local cache when present. Decoding, filter evaluation on encoded data and projection happen close to the read. Prefetching hides storage latency. Remote reads are limited by request rate and throughput per worker. The hard parts are the many small requests that object stores handle poorly, the cold-cache penalty and balancing how many files each worker handles.",
    k: ["Fetch exact column ranges vs whole files: ranges cut bytes transferred for wide tables; many small requests add latency and request cost.", "Filter on encoded data vs decode first: encoded filtering is much faster for dictionaries and runs; it complicates every encoding."],
    p: ["Selecting all columns of a wide table reads far more data than the query needs.", "Hundreds of tiny files per query make the scan request-bound rather than bandwidth-bound."],
    v: "Run a select of two columns from a table of fifty and confirm bytes scanned in the profile is a small fraction of the table size, and a repeat on the same cluster shows most bytes from cache.",
    dep: ["object-store-layer","columnar-format","local-data-cache","pruning-planner"]
  },
  "vectorized-execution": {
    s: "Processing columns in batches of thousands of values at a time with tight loops over typed arrays, rather than one row at a time through interpreted expressions.",
    d: "Operators exchange batches of columns with selection vectors marking which rows survive. Expression evaluation runs kernels specialized by type that operate on contiguous arrays, keeping data in CPU cache and using wide vector instructions. Compilation can fuse several operators into one loop to avoid materializing intermediates. This yields an order of magnitude over row-at-a-time engines. The hard parts are null handling, variable-length types, which do not vectorize as cleanly, and user-defined code that forces a switch back to rows.",
    k: ["Vectorized interpretation vs compiled pipelines: vectorized is easier to build and debug; compiled fusion removes more overhead but adds a compiler and warm-up time.", "Large vs small batches: large amortizes overhead; small fits CPU cache and reduces memory use."],
    p: ["A function without a vectorized form drops the plan into row mode and slows the whole pipeline.", "Very wide strings make batches balloon and exceed the cache, losing the expected speedup."],
    v: "Compare a sum and filter over one billion integers using the engine against a row-at-a-time baseline on the same hardware, and confirm throughput of hundreds of millions of values per second per core.",
    dep: ["columnar-format","encoding-compression"]
  },
  "join-operator": {
    s: "The hash join that builds a table from one input and probes it with the other, with partitioned and broadcast variants and memory-aware spilling.",
    d: "The build phase reads the smaller input and constructs a hash table keyed on the join columns, often with a Bloom filter. The probe phase streams the other input in batches and looks up matches. When the table does not fit memory, both inputs are partitioned by hash and processed partition by partition, spilling to disk. Outer, semi and anti variants handle unmatched rows. Runtime filters from the build side prune the probe scan. Challenges are skew, null keys, many-to-many explosion of rows and memory estimation.",
    k: ["Hash join vs sort-merge join: hash is faster on unsorted data and simpler; merge shines when inputs are already sorted and memory is tight.", "Build-side Bloom filter vs none: the filter lets the probe scan skip rows early; it costs memory and a little build time when the join is unselective."],
    p: ["A join on a column with many nulls or a single hot value creates a few giant output partitions.", "A many-to-many join multiplies rows so a result of millions explodes to billions."],
    v: "Join a fact table to a filtered dimension and confirm the profile shows build rows, probe rows, output rows and a pushed filter reducing the probe scan; then force a memory limit and confirm correct results with spill reported.",
    dep: ["join-planning","spilling","exchange"]
  },
  "aggregation-operator": {
    s: "Group-by and distinct computation using partial aggregation on each worker, repartitioning by group key, and a final aggregation, spilling when the groups outgrow memory.",
    d: "Each worker aggregates its own rows into a hash table of partial states, which dramatically reduces the data to send. States are exchanged by hash of the group key and merged. Aggregates such as sum and count merge exactly; distinct counts need more state or approximate sketches. High-cardinality groupings can exceed memory and spill. Window functions sort by partition key and may be skew-sensitive. The hard parts are cardinality estimation, exact distinct counts and one group holding a huge share of rows.",
    k: ["Partial then final aggregation vs repartition first: partial cuts network traffic when groups are few; with nearly unique keys it adds overhead and saves nothing.", "Exact distinct count vs approximate sketch: exact is precise and memory-hungry; sketches are small and mergeable but carry a known error."],
    p: ["Grouping by a nearly unique key such as an event identifier spills heavily and runs very slowly.", "Using exact distinct counts on a billion values where an approximate one would do exhausts memory."],
    v: "Group ten billion rows by a column with one thousand values, confirm the profile shows partial aggregation reducing rows before the exchange, and the final answer matches a small-sample exact computation.",
    dep: ["exchange","spilling","vectorized-execution"]
  },
  "exchange": {
    s: "The network data movement between operators on different workers: hash repartition, broadcast and gather, with buffering, compression and backpressure.",
    d: "At plan fragment boundaries, producers partition output batches by a hash or broadcast them and send over the network to consumers' buffers. Consumers start work as soon as data arrives, giving pipelining. Compression reduces bytes at the cost of CPU. Backpressure slows producers when consumers lag so memory is bounded. In some designs intermediate data is written to an external shuffle store so a failed worker does not lose it. The difficulty is straggler workers, skew and network saturation on large shuffles.",
    k: ["Direct worker-to-worker streaming vs materialized shuffle: streaming is lower latency; materializing makes fault recovery cheap but adds writes.", "Compress exchange data vs raw: compressing saves bandwidth on slower networks; it burns CPU on fast ones."],
    p: ["One slow worker holds up a whole stage because every consumer waits for its partition.", "Shuffling a very wide row set that could have been projected down first saturates the network."],
    v: "Run a repartition join over a large table and confirm in the profile that network bytes per stage match the expected size and that no single consumer receives a share far above the average.",
    dep: ["task-scheduler","cache-affinity"]
  },
  "spilling": {
    s: "Writing operator state to local disk and, if needed, remote storage when memory runs out, so large joins and sorts finish slowly rather than failing.",
    d: "When a hash table, sort buffer or aggregation state grows past its allotment, the operator writes partitions to local SSD, continues with what remains, and later processes the spilled partitions one at a time. If local disk is also full, data spills to object storage, which is slower. Spill volumes are reported in the profile. Spilling preserves correctness but multiplies I/O, so a query can slow tenfold. The hard parts are choosing what to spill, avoiding repeated re-spilling and controlling how memory is shared among concurrent queries.",
    k: ["Spill to disk vs fail the query: spilling finishes more queries; it hides memory problems until costs and latency rise.", "Local SSD first then remote storage: local is fast but small; remote is large but slow, so tiering needs careful thresholds."],
    p: ["A query spills hundreds of gigabytes to remote storage and runs for hours before anyone notices.", "Concurrent large queries each grab memory, causing all of them to spill when running one at a time would not."],
    v: "Run a large join on a small cluster, confirm results equal a larger-cluster run, the profile shows local spill volume, and the query takes longer than its in-memory counterpart.",
    dep: ["local-disk-tier","node-pool"]
  },
});
