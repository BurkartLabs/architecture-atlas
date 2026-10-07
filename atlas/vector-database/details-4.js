// Details for the vector database plate, part 4: storage, cluster, cross-cutting concerns.
ATLAS.details("vector-database", {
  "vector-file-layout": {
    s: "How vectors are laid out in a segment file: fixed-stride contiguous arrays addressed by internal number, with a header recording dimension, type and checksums.",
    d: "Vector number i lives at offset header plus i times stride, so lookup is arithmetic and scans are sequential. Stride is padded to alignment for vector instructions. The file is typically memory-mapped or read in blocks, and quantized copies are stored in separate files so a search can read the small copy and fetch full vectors only for rerank. Headers carry the format version, metric and codebook references. The difficulty is evolution: a layout fixed in billions of files must still be readable after format changes, and the file must tolerate partial writes.",
    k: ["Contiguous fixed-stride array versus per-vector records with metadata: contiguous is fastest to scan and needs side files for everything else, records are self-describing and slower.", "Separate files for full and quantized vectors versus interleaved: separate keeps the hot data compact, interleaved needs one read for both."],
    p: ["A format change that makes old segments unreadable and forces a full rewrite during an upgrade.", "Padding that differs between writer and reader, shifting every vector by a few bytes."],
    v: "Write a segment, read vector 12,345 directly from the file by computed offset and compare with the API result; open files written by the previous format version and confirm they load.",
    dep: ["float-precision-formats", "checksums-and-integrity"]
  },
  "float-precision-formats": {
    s: "The numeric formats used to store vector components: 32-bit float, 16-bit float, brain-style 16-bit float, 8-bit integer and single bits, each trading range, precision and size.",
    d: "Full 32-bit floats are the reference. Half-precision formats halve memory and bandwidth, and differ in how they split bits between range and precision, which matters for models with large outliers. Eight-bit integers need a scale. Conversion happens on write and kernels read the narrower type directly or widen in registers. Choosing a format is a quality decision as well as a storage one. The difficulty is that rounding changes distances slightly and can reorder near ties, and that hardware support for each format varies.",
    k: ["Narrow types everywhere versus narrow only for the first stage: everywhere saves the most and is irreversible, first-stage keeps full vectors for rerank at a storage cost.", "Floating-point 16-bit versus integer 8-bit with scale: floats handle varied ranges, integers pack tighter and need calibration."],
    p: ["A format whose limited range overflows on a model with large component values, producing infinities.", "Comparing distances computed in different formats on different replicas."],
    v: "Store the same vectors in each format and compare distances to 32-bit references and retrieval quality on a labeled set; confirm no value overflows and the memory per vector matches the format.",
    dep: ["dimension-and-type-config"]
  },
  "columnar-vector-blocks": {
    s: "Stores vectors in blocks transposed so one dimension of many vectors is contiguous, which suits compression and some scoring kernels that process many vectors at once.",
    d: "In a block of, say, 32 vectors, the first components of all 32 are stored together, then the second components. Distance accumulation then runs across vectors in vector-unit lanes. Quantized codes are often stored in this block-interleaved form so a lookup-table scan can score a whole block with a few instructions. Blocks are the unit of disk reads and of skipping, with per-block statistics. The difficulty is that random access to a single vector requires gathering from across the block, so rerank and point reads are slower than with the row layout.",
    k: ["Block-transposed layout versus row layout: transposed makes scans of compressed codes much faster, row layout makes point reads cheap.", "Block size of 16 versus 64: larger blocks suit wider vector units and make partial blocks wasteful for small segments."],
    p: ["Reading single vectors for rerank from a transposed layout, multiplying read cost.", "Partial last blocks padded with garbage that is scored as if it were data."],
    v: "Scan quantized codes in row and block layouts and compare throughput; confirm both produce identical scores and that the padded tail never appears in results.",
    dep: ["vector-file-layout", "simd-distance-kernels", "product-quantization"]
  },
  "memory-mapped-files": {
    s: "Maps segment files into the process's address space so the operating system pages data in on demand and shares one cached copy among readers.",
    d: "Reads become memory accesses: touching an unloaded page triggers a page fault and a disk read, and the operating system's cache keeps hot pages. This simplifies code and lets indexes larger than RAM work, with performance that degrades gracefully. The cost is lack of control: eviction follows the operating system's policy, faults on the query path block threads, and a fault storm after restart makes queries slow until the cache warms. The difficulty is predictability, since the system cannot tell which accesses will fault.",
    k: ["Memory mapping versus an explicit buffer manager: mapping is simple, shares the cache and gives up control over eviction and read scheduling, a buffer manager gives control and more code.", "Pre-faulting hot files at startup versus lazy loading: pre-faulting avoids a slow warm-up and delays readiness."],
    p: ["A cold restart where every query faults in pages one by one and latency is ten times normal for minutes.", "Other processes' file activity evicting index pages from the shared cache."],
    v: "Restart a node, run steady queries and chart latency against time and page faults; confirm the warm-up completes within the documented time, and compare to a pre-faulted start.",
    dep: ["vector-file-layout", "buffer-cache"]
  },
  "buffer-cache": {
    s: "An explicitly managed pool of memory holding hot index pages and vectors, with its own eviction policy tuned to search access patterns instead of the operating system's.",
    d: "Pages are looked up by file and offset, pinned while in use and evicted by a policy such as least recently used with scan resistance, so a large scan does not flush the graph's hot upper layers. It can prefetch neighbors of visited nodes and issue reads asynchronously in batches. Pinning key structures, such as entry points and centroids and quantized vectors, guarantees they stay resident. The difficulty is sizing and accounting: the cache competes with index memory, queries and merges for the same RAM.",
    k: ["Own cache versus the operating system's: own cache allows pinning, prefetch and fair accounting, and duplicates caching if not bypassing the system cache.", "Large cache with few resident indexes versus smaller cache with many: depends on the access skew, and a poor choice evicts working sets."],
    p: ["A scan job evicting the hot pages of every index and causing a latency spike for all tenants.", "Double caching, with the same pages held in both the buffer cache and the operating system's cache."],
    v: "Run a hot query workload, then a one-time full scan; confirm the cache hit rate for the hot workload stays above target through the scan and pinned structures never leave memory.",
    dep: ["memory-mapped-files", "ssd-io-scheduler"]
  },
  "object-storage-tier": {
    s: "Keeps segments as objects in cheap remote storage as the durable copy, with local disks and memory acting as caches in front of it.",
    d: "Finished segment files are uploaded; the object store is the source of truth, and nodes download or read ranges on demand. Latency per request is tens of milliseconds, so reads are large and batched, and indexes designed for this keep navigation structures local and fetch bulk data in big ranges. It makes replication cheap, scaling elastic and snapshots trivial. The difficulty is the latency and cost per request: a naive graph walk over remote objects is unusably slow, and many small reads cost money.",
    k: ["Object store as primary versus a replica of local data: primary reduces storage cost and cold-query latency becomes the weak spot, replica keeps local speed at higher cost.", "Range reads of needed pages versus whole-segment download: ranges start faster and cost per request, whole downloads amortize and delay first query."],
    p: ["A cold query on an evicted segment taking seconds because every hop is a remote read.", "Request costs growing larger than storage costs at high query rates."],
    v: "Evict a segment from local cache and query it; confirm the number of remote requests and the latency of the first query match expectations, and the second query is served locally.",
    dep: ["hot-warm-cold-tiers", "immutable-segments"]
  },
  "hot-warm-cold-tiers": {
    s: "Places data on memory, local SSD or object storage according to how often it is queried, trading cost against latency per collection or per tenant.",
    d: "Hot data has its index and vectors resident in memory; warm keeps compressed vectors in memory and full data on SSD; cold lives in object storage and is loaded on first access. Movement between tiers is driven by access statistics or explicit settings, and tenants or segments can be demoted when idle. This allows a deployment to hold many times more vectors than RAM at a controlled latency per tier. The difficulty is promotion and demotion without thrash, and making tier behavior visible to application owners who see only latency.",
    k: ["Automatic tiering by access versus explicit placement: automatic follows usage and surprises operators, explicit is predictable and needs attention.", "Promote on first access versus after repeated access: first-access is responsive and lets a scan pollute the hot tier."],
    p: ["A nightly batch job promoting cold tenants and demoting hot ones.", "A tenant's first query of the day timing out because its data was demoted overnight."],
    v: "Leave a tenant idle until demoted, then query it and record latency, tier and promotion; confirm hot tenants' latency is unaffected and the tier counters match the move.",
    dep: ["object-storage-tier", "buffer-cache", "namespace-per-tenant"]
  },
  "page-aligned-layout": {
    s: "Arranges each graph node's vector and neighbor list into one fixed-size, page-aligned record so expanding a node costs exactly one disk read.",
    d: "A node record holds the full vector, its neighbor count and neighbor IDs, padded to a multiple of the device's page size, often 4 kilobytes. Nodes are addressed by number times record size. Search fetches records for the nodes it expands, in batches. Good layouts also place nodes likely to be visited together near each other, or cache the neighbors' compressed vectors so the next hop needs no extra read. The difficulty is that records for high-dimension vectors may exceed a page, and wasted padding raises disk use.",
    k: ["One record per node versus separate vector and link files: one record halves reads per hop and wastes space on padding, separate files pack tightly and double the reads.", "Locality-aware node ordering versus build order: locality reduces distinct pages touched and costs a reorder step."],
    p: ["Records straddling page boundaries, doubling reads silently.", "A format that fixes record size at build time, so raising the graph degree requires rebuilding."],
    v: "Trace disk reads for a batch of queries and confirm reads per query equal visited nodes at one page each; check that no record spans a page boundary and compare with a misaligned build.",
    dep: ["disk-graph-index", "vector-file-layout"]
  },
  "ssd-io-scheduler": {
    s: "Issues many reads at once with deep queues, using asynchronous I/O, so SSD parallelism is used and one query's reads overlap with others.",
    d: "SSDs deliver their rated throughput only with many outstanding requests. The scheduler batches reads from a search's frontier, submits them through an asynchronous interface, and continues work on other queries while they complete. It prioritizes interactive reads over merge and snapshot traffic and caps queue depth to keep tail latency bounded. Direct I/O avoids double caching. The difficulty is balancing throughput and latency: deeper queues raise throughput and increase waiting time, and background jobs can ruin the tail.",
    k: ["Deep queues versus shallow: deep saturates the device for throughput and increases latency per request, shallow keeps latency low and underuses the SSD.", "Priority classes for queries versus fair sharing: priorities protect latency and can starve compaction."],
    p: ["A snapshot upload or merge reading at full speed and pushing query p99 up tenfold.", "Synchronous reads inside the search loop, so a single query uses only one outstanding request."],
    v: "Run queries at fixed concurrency while a merge runs and record read queue depth and p99; confirm query p99 stays within budget with priorities on and rises sharply with them off.",
    dep: ["buffer-cache"]
  },
  "checksums-and-integrity": {
    s: "Per-block and per-file checksums on logs, segments and indexes, verified on read or in background scrubs, so corruption is detected before it returns wrong results.",
    d: "Each block of a segment file carries a checksum written with it; reads verify it, and a background scrubber verifies all files periodically. The log checksums each record so replay stops at the first torn write. Index structures such as graph links are bounds-checked to avoid crashes from corrupted values. On detecting corruption the system quarantines the segment and recovers it from a replica or object storage. The difficulty is cost on the hot path, since verifying every read adds CPU, and acting on detection, since a corrupt graph link gives wrong results without any failure.",
    k: ["Verify on every read versus scrub in background: every read catches problems at once and costs CPU, scrubbing is cheap and leaves a window.", "Checksum raw bytes versus checksums of logical content: raw is simple, logical catches software bugs in encoding."],
    p: ["A flipped bit in a vector that changes its distances slightly and is never noticed.", "A torn log record at the end of the file being replayed as valid data."],
    v: "Flip one byte in a segment file and in a log tail on a test node; confirm reads detect the segment error, quarantine and repair it from a replica, and replay stops cleanly at the torn log record.",
    dep: []
  },
  "payload-storage": {
    s: "The durable store for each point's payload, often a compact serialized record or key-value store addressed by internal number, read after search to build results.",
    d: "Payloads can be large: text chunks of a few kilobytes, nested attributes, links. They are stored apart from vectors so scans and rerank do not read them. Fetching ten payloads after a search is ten random reads unless they are cached, and results can dominate latency. Compression helps text. Fields used for filters are copied into payload indexes, so filter evaluation does not need to read full records. The difficulty is update cost, since modifying a payload rewrites its record, and keeping it consistent with the vector's version.",
    k: ["Payload alongside vectors versus separate store: alongside gives one read, separate keeps scans fast and needs a join by internal number.", "Store source text in the database versus a pointer to an external store: inside is convenient and enlarges storage, pointer keeps the database lean and adds a dependency."],
    p: ["Returning full payloads for many hits, turning cheap searches into slow disk reads.", "A payload store updated without the vector segment, leaving a point whose metadata describes different content."],
    v: "Search with and without returning payloads and compare latency and bytes read; update a payload and confirm every replica returns the new value on the next search.",
    dep: ["immutable-segments", "id-mapping"]
  },
  "shard-partitioning": {
    s: "Decides which shard holds each point: by hash of the ID, by tenant, by a partition key or by clustering in vector space, shaping both write balance and query fan-out.",
    d: "Hash partitioning spreads points evenly and forces every query to visit every shard. Tenant or key partitioning confines a query to one shard and risks hot shards when tenants differ in size. Vector-space partitioning groups similar vectors so queries probe a few shards, and needs a trained partitioning and rebalancing as data drifts. The number of shards is hard to change later, so it is often set larger than needed and mapped to nodes. The difficulty is skew and the cost of resharding.",
    k: ["Hash versus key-based partitioning: hash balances load and every query hits all shards, key-based reduces fan-out and creates hot spots.", "Few large shards versus many small: few have less merge overhead and rebalance coarsely, many allow fine balance and add per-shard cost."],
    p: ["A tenant that outgrows its shard and cannot be split without resharding.", "Choosing too few shards at creation and discovering that growth requires rewriting the collection."],
    v: "Load a skewed workload and chart shard sizes and per-shard query load; confirm skew stays within the target ratio, and that a query touches the expected number of shards for the chosen scheme.",
    dep: ["id-mapping", "multi-tenancy-models"]
  },
  "shard-placement": {
    s: "Assigns shards and their replicas to nodes, spreading them across failure domains and balancing memory, disk and query load.",
    d: "A placement algorithm considers node capacity, current load, rack or zone, and constraints such as keeping replicas apart. It records the assignment in cluster metadata, from which routers read. Placement decisions react to node additions, failures and imbalance. It must account for memory-resident indexes, since one large shard can need a whole node. The difficulty is multi-dimensional balance: memory, disk I/O and CPU rarely align, and moving a shard means copying gigabytes.",
    k: ["Static placement versus continuous automatic balancing: static is predictable, automatic follows load and causes background data movement.", "Spread replicas across zones versus keep them together: spreading survives zone loss and adds cross-zone traffic and latency."],
    p: ["Two replicas of a shard landing on the same node or rack and failing together.", "Balancing by shard count while shard sizes differ widely, leaving one node out of memory."],
    v: "Add a node and kill a zone in a test cluster; confirm replicas of each shard are in different zones before and after, load evens out within the target ratio, and data remains available.",
    dep: ["cluster-membership", "replica-sets", "shard-partitioning"]
  },
  "replica-sets": {
    s: "Multiple copies of each shard on different nodes, for availability and for spreading read load, kept up to date by replicating the write log or segment files.",
    d: "Writes go to a leader or to any replica, depending on the design, and are replicated by shipping log entries or by copying finished segments. Replicas build their own indexes, or receive index files built by one node, which saves CPU and ensures identical results. Reads can go to any in-sync replica. A new replica is created by copying a snapshot and catching up. The difficulty is replication lag, which makes replicas return different results to the same query, and the cost of memory for every copy.",
    k: ["Replicate the log and build indexes on each replica versus copy segment files: log replication is flexible and repeats build work and gives slightly different graphs, file copy is exact and cheaper in CPU.", "More replicas for read throughput versus more shards: replicas scale reads and multiply memory, shards scale data."],
    p: ["Replicas returning different results for the same query and users noticing inconsistency.", "A lagging replica promoted to leader after a failure, losing recent writes."],
    v: "Write to a leader, query each replica and compare the time until the write is visible; stop the leader and confirm a promoted replica has every acknowledged write and the same top-10 as before.",
    dep: ["write-ahead-log", "consistency-levels", "cluster-membership"]
  },
  "consistency-levels": {
    s: "Settings for how many replicas must acknowledge a write and how fresh a read must be, trading latency and availability against seeing the latest data.",
    d: "A write can be acknowledged by one replica, a majority or all. Reads can go to one replica, which may lag, or require a quorum or the leader. Most vector workloads accept eventual visibility of new vectors, since a few seconds of delay in similarity search rarely matters, but deletes, permissions and tenant erasure may need stronger guarantees. Levels can be set per request. The difficulty is that approximate indexes make staleness hard to bound, since a replica may be serving an older index version, and weaker levels risk losing acknowledged writes on failure.",
    k: ["Eventual versus strong reads: eventual is faster and available during partitions and may miss recent writes, strong costs latency and availability.", "Acknowledge on one replica versus a majority: one is fast and may lose the write on failure, majority survives a single failure at higher latency."],
    p: ["A delete acknowledged by one replica and then served from another, which still returns the deleted point.", "Assuming read-your-writes without selecting a level that provides it."],
    v: "Write at one-replica acknowledgment, kill that replica immediately and check for the point; repeat at majority acknowledgment and confirm the point survives, then measure latency of both settings.",
    dep: ["replica-sets", "write-ahead-log"]
  },
  "cluster-membership": {
    s: "Tracks which nodes are alive and which shards they own, with a consistent view maintained by a small coordination service or gossip, so routers and placement agree.",
    d: "Nodes heartbeat to a coordinator or exchange state with peers. Failure detection marks unresponsive nodes and triggers replica promotion and re-replication. Metadata such as the shard map, schemas and aliases is stored in a strongly consistent store and cached by nodes with versions. Changes propagate to routers within seconds. The difficulty is false positives and splits: a slow node can be declared dead and then return, and during a partition two groups can each believe they are in charge.",
    k: ["Strongly consistent metadata store versus gossip: strong consistency avoids split-brain and is a scaling and availability limit, gossip scales and converges eventually.", "Aggressive versus conservative failure detection: aggressive recovers faster and triggers needless re-replication on slow nodes."],
    p: ["A paused node declared dead and then writing with an old view of ownership.", "Routers with a stale shard map sending queries to nodes that no longer hold the shard."],
    v: "Partition one node away from the cluster and confirm it stops accepting writes, the shard map updates on routers within the documented time, and the node rejoins without duplicating data.",
    dep: ["shard-placement"]
  },
  "shard-rebalancing": {
    s: "Moves or splits shards between nodes when load, size or membership changes, copying data while serving queries and then switching ownership.",
    d: "A move copies a shard's segments to the target while the source keeps serving, catches up on the log, then flips ownership in cluster metadata and removes the source. Splitting a shard divides its points, which requires rebuilding indexes for each half. Throttling keeps the transfer from starving queries. Rebalancing triggers include a new node, a hot or oversized shard and a failed node. The difficulty is that data movement is large and slow, memory on the target must hold the index before the flip, and mistakes cause outages.",
    k: ["Automatic versus operator-triggered rebalancing: automatic reacts quickly and can move data at bad times, operator-triggered is controllable and slow.", "Move whole shards versus split shards: moving is cheap and coarse, splitting balances finely and needs an index rebuild."],
    p: ["Rebalancing during peak traffic, slowing queries because copy traffic shares the network and disks.", "A flip performed before the target finished loading the index into memory, causing slow queries."],
    v: "Trigger a shard move under load; confirm queries stay within latency target, there is no period without a serving copy, and counts and top-10 results are identical before and after.",
    dep: ["shard-placement", "replica-sets", "ssd-io-scheduler"]
  },
  "compute-storage-separation": {
    s: "Splits stateless query and index-building nodes from durable storage in object storage, so compute can scale and be replaced independently of data.",
    d: "Segments live in object storage as the durable copy. Query nodes cache the segments they serve on local disk and memory and are assigned shards by the placement logic, and can be added or removed without copying data from other nodes. Writers append to a log service and flush segments to storage; builders produce indexes asynchronously. A new query node warms by loading its assigned segments. The difficulty is cold-start latency and cache efficiency, and the log and metadata services that remain stateful.",
    k: ["Separated compute and storage versus nodes owning local data: separation scales and recovers easily and adds remote-read and cache-warming costs, local ownership gives the lowest latency and ties scaling to data movement.", "Shared cache nodes versus per-node caches: shared improves hit rate and adds a network hop."],
    p: ["A scale-out event that adds nodes with empty caches and temporarily raises latency for everyone.", "Underestimating the load on the log and metadata services when compute scales out."],
    v: "Add a query node during load and chart its cache warm-up, assigned shards and latency; remove a node and confirm its shards are served by others without data copying and with no failed queries.",
    dep: ["object-storage-tier", "cluster-membership", "hot-warm-cold-tiers"]
  },
  "failure-recovery": {
    s: "Detects failed nodes and restores service: promotes replicas, replays logs, reloads indexes and re-replicates under-copied shards back to the target replication factor.",
    d: "When a node fails, routers stop sending it queries and a replica takes over its shards. If no replica exists, recovery loads segments from object storage and replays the log from the last flushed position. After restart, a node validates files by checksum, replays the log and rejoins. Re-replication then restores the target copy count in the background. Recovery time is dominated by loading indexes into memory. The difficulty is correlated failures and the window during which a shard has only one copy.",
    k: ["Re-replicate immediately versus wait for the node to return: immediate restores safety and moves large amounts of data for transient outages, waiting avoids churn and risks a second failure.", "Hot standby replicas versus rebuild from storage: standby recovers in seconds and costs memory, rebuild is cheap and takes minutes."],
    p: ["Recovery traffic overloading surviving nodes and causing a cascade of failures.", "A restart that replays a huge log because truncation had stalled, taking the node out for hours."],
    v: "Kill a node holding shard replicas under load; confirm queries continue, a replica takes over within the stated time, the replication factor is restored and results equal the pre-failure results.",
    dep: ["replica-sets", "write-ahead-log", "checksums-and-integrity", "cluster-membership"]
  },
  "autoscaling": {
    s: "Adds or removes nodes automatically based on query rate, latency, memory and storage use, within limits, keeping cost proportional to load.",
    d: "A controller watches metrics such as CPU, queue depth, p99 latency and cache hit rate, and requests more query nodes when they cross thresholds. Scale-in drains a node's shards first. Because new nodes start cold, scaling reacts slowly: warming caches takes minutes, so predictive or scheduled scaling helps with daily peaks. Storage and memory growth often need provisioning ahead, since moving data is slow. The difficulty is flapping, and tuning that avoids both overload during warm-up and paying for idle capacity.",
    k: ["Reactive versus scheduled or predictive scaling: reactive follows actual load and lags by the warm-up time, scheduled prepares for known peaks and fails on surprises.", "Scale on latency versus on resource use: latency tracks user impact and reacts late, resource use is an early signal and can mislead."],
    p: ["Scaling in during a lull and then being unable to handle the next burst while caches warm.", "Scaling query nodes while the real bottleneck is the log or metadata service."],
    v: "Ramp load to twice the current peak; confirm new nodes are added, p99 stays within target after warm-up, and after the load falls, nodes are drained and removed without failed queries.",
    dep: ["cluster-membership", "compute-storage-separation", "metrics-and-latency"]
  },
  "recall-latency-tradeoff": {
    s: "Every approximate index exposes knobs that trade the fraction of true neighbors found against time per query, so the target recall must be chosen explicitly and measured continuously.",
    d: "Search depth, probe count, quantization and rerank oversampling all move along one curve: more work gives more recall, with diminishing returns near the top. The right operating point depends on the application: a retrieval step feeding a downstream model may tolerate 90 percent, a deduplication job may need 99. Recall differs by query: filtered, rare and boundary queries sit lower than the average. The decision shapes index choice, hardware and cost, and tuning must be repeated as data grows or changes. Without a recall measurement, optimizing latency silently lowers quality.",
    k: ["High target recall versus low: high costs several times more compute and memory for a few points of quality, low is cheap and can hurt downstream results.", "One global setting versus per-query or per-tenant settings: one is simple, per-use settings match needs and multiply the cases to monitor."],
    p: ["Reporting average recall while the worst ten percent of queries have far lower recall.", "Tuning once at launch and never again as the collection grows tenfold."],
    v: "Plot recall versus p99 latency across a sweep of settings on representative queries, including filtered ones; confirm the chosen operating point meets the stated recall target for each query class.",
    dep: ["recall-measurement", "beam-search", "partition-probing", "index-parameters"]
  },
  "memory-vs-disk-economics": {
    s: "The central cost decision: how much of the vector and index data must sit in RAM, versus SSD or object storage, given that RAM costs an order of magnitude more per byte than SSD.",
    d: "Full-precision vectors and a graph for a billion points take terabytes, which in RAM means many large machines. Quantization shrinks the in-memory part, disk-resident indexes keep only compressed vectors in memory, and tiering keeps only active tenants resident. Each step saves cost and adds latency and complexity. The choice depends on latency requirements, query rate and how skewed access is. It determines index type, hardware and rebuild times, and it is hard to change after data is loaded. Capacity plans must include index structures, caches and rebuild headroom.",
    k: ["All in memory versus compressed in memory with data on SSD: memory gives the lowest latency at the highest cost, SSD designs cut cost severalfold and add milliseconds and I/O sensitivity.", "Dedicated memory per tenant versus shared pooled memory: dedicated is predictable, pooled gets more value from idle tenants."],
    p: ["Sizing memory for the data and ignoring graph links, caches and the extra memory a rebuild needs.", "Moving to a disk-based design for cost and discovering the latency target cannot be met at peak concurrency."],
    v: "Load the target data size with each design under the target query rate and compare p99 latency, recall and cost per month; confirm the chosen design meets all three.",
    dep: ["disk-graph-index", "product-quantization", "hot-warm-cold-tiers", "capacity-planning"]
  },
  "embedding-model-coupling": {
    s: "A vector database's content is only meaningful relative to the model that produced it, so dimension, metric, normalization and every index inherit the model's identity, and changing it means rebuilding.",
    d: "Distances compare coordinates that have meaning only within one model's learned space. The model decides dimension, the right metric, whether truncation is allowed, how well quantization works and how queries must be preprocessed. Upgrading a model means re-embedding all source content, building a new index and cutting over, which needs the source to be kept and the budget for the compute. Systems that treat vectors as opaque data hide this coupling, so it must be made explicit in schemas and version tracking.",
    k: ["Keep source content versus only vectors: keeping the source enables re-embedding and costs storage, vectors alone cannot be migrated.", "Coupling the database to a model service versus staying model-agnostic: coupling makes consistency automatic, agnostic keeps flexibility and puts the burden on clients."],
    p: ["Updating the model in the application while old vectors stay in the index, so queries compare across spaces.", "Discovering after launch that the stored vectors cannot be regenerated because the source was discarded."],
    v: "Query a collection with embeddings from a different model of the same dimension and confirm the version check refuses it; then run a full re-embedding rehearsal and measure its time and cost.",
    dep: ["embedding-model-binding", "model-version-tracking", "shadow-reindex"]
  },
  "freshness-vs-read-performance": {
    s: "Approximate indexes are fastest when built once and left alone, so every design for making new writes searchable sooner costs read speed, write throughput or both.",
    d: "A write can be searchable at once if the engine scans a small buffer, at the cost of extra work per query. It can be indexed quickly in a mutable structure that is slower and degrades, or batched into segments that wait for a merge. Deletes are visible at once through tombstones that slow searches until compaction. The balance sets segment counts, merge schedules and background builder capacity. Applications decide how many seconds of staleness they can accept, and that decision should be explicit, since freshness requirements drive cost.",
    k: ["Immediate visibility via a scanned buffer versus batched indexing with delay: immediate costs query time and bounded buffer size, delay is cheap and surprises users who just wrote data.", "Frequent small merges versus rare large merges: frequent keeps the index fresh and tidy at the cost of write amplification, rare is efficient and degrades between merges."],
    p: ["Promising real-time freshness on a path that only provides it after a batch window.", "Letting the buffer or unindexed data grow under write bursts until every query slows."],
    v: "Write a point and measure the time until it is returned by search under idle and heavy-write conditions; confirm the observed delay stays within the documented freshness bound.",
    dep: ["memtable-buffer", "segment-merge-compaction", "background-index-builder"]
  },
  "data-distribution-and-dimensionality": {
    s: "Behavior of every index depends on the real distribution of the vectors: high dimensions flatten distance contrast, clusters create hubs and boundaries, and synthetic data misleads tuning.",
    d: "In high dimensions the nearest and farthest points are not very different in distance, which makes pruning hard and exact answers unstable. Real embeddings lie on lower-dimensional structure with clusters and varying density, so graph and partition indexes do better than the worst case but behave unevenly: dense clusters need more probes, isolated points are hard to reach, and outliers affect quantization ranges. Duplicates and near-duplicates crowd result lists. Tuning must use real vectors and real queries, since random data gives misleading recall, and distributions drift.",
    k: ["Tune on real data versus public benchmarks: real data reflects your clusters and queries, benchmarks are comparable and unrepresentative.", "Deduplicate at write versus keep all points: deduplication keeps results diverse and costs a lookup and loses distinct metadata."],
    p: ["Benchmarking on uniformly random vectors, where graph search behaves very differently than on clustered embeddings.", "A large group of near-duplicate points filling the whole top-k so results show one item many times."],
    v: "Measure the distribution of distance to nearest versus tenth-nearest neighbor and of list sizes on real data and on random data; confirm the tuned parameters meet recall targets on the real distribution.",
    dep: ["index-parameters", "recall-measurement", "drift-detection"]
  },
  "consistency-and-failure-semantics": {
    s: "The promises about what a client sees after a write, a delete or a failure, covering durability, visibility and consistency between replicas, vectors, payloads and indexes.",
    d: "A vector database has several copies of each point, in the log, buffer, segments, indexes, payload indexes, caches and replicas, and updates reach them at different times. Guarantees must say when a write is durable, when it is searchable, whether a delete can still return the point, and what happens on partial shard failure: an incomplete answer or an error. Weak, documented guarantees are workable, vague ones cause incidents. Erasure and access control need the strongest promises and are the hardest to provide across caches, replicas and backups.",
    k: ["Strong guarantees versus eventual: strong simplifies applications and costs latency and availability, eventual is fast and pushes handling of anomalies to clients.", "Fail on partial results versus return flagged incomplete answers: failing is safe and brittle, partial answers keep the product usable and risk undetected quality loss."],
    p: ["Assuming a successful delete means the data cannot be returned from any replica or cache.", "Returning incomplete results from a down shard without marking the response, so users and downstream systems trust it."],
    v: "Inject node failures, network partitions and delayed replicas during writes, deletes and queries; confirm each observed behavior matches the documented guarantee, including flagged partial results.",
    dep: ["consistency-levels", "failure-recovery", "tombstones-and-deletes"]
  }
});
