// Details for the vector database plate, part 2: filtering, hybrid search, exact search, approximate indexes, quantization.
ATLAS.details("vector-database", {
  "metadata-store": {
    s: "Holds the structured attributes attached to each vector, such as category, owner, timestamp and tags, in a form the engine can filter on and return with results.",
    d: "Each point carries a payload of typed fields. The store keeps it keyed by internal point number, either in a row-oriented file for fast fetch of a whole payload or in columns for fast scans of one field. Filters read from it directly or through payload indexes built on top. Updates to payload do not require touching the vector index. The difficulty is keeping payload and vector consistent: a hit found in the index must map to the right payload version, and a schema-less payload invites inconsistent types across points that break filters.",
    k: ["Row-oriented versus columnar payload layout: rows return a whole payload in one read, columns scan a single field much faster for filtering.", "Typed schema versus free-form payload: a schema enables indexes and early errors, free-form is flexible and lets one point hold a string where another holds a number."],
    p: ["The same field holding numbers in some points and strings in others, so range filters silently skip part of the data.", "Payload updates applied to the live store while the index still points at the pre-update segment."],
    v: "Update one field on a point and run a filtered search on that field; confirm the point appears under the new value and not the old, immediately and after a restart.",
    dep: ["payload-storage", "id-mapping"]
  },
  "payload-indexes": {
    s: "Secondary indexes on payload fields, such as inverted lists for equality, sorted structures for ranges and bitmaps for tags, which let the engine find all points matching a condition quickly.",
    d: "An inverted index maps each value to the sorted list of point numbers that have it. Range indexes use ordered structures; geographic and text predicates use their own. The engine combines conditions by intersecting or merging these lists, often as compressed bitmaps, producing the set of allowed points or a cheap membership test the vector search can call. These indexes also provide counts for selectivity estimates. The difficulty is space and update cost on high-cardinality fields, and that the allowed-set must be consulted inside the vector search loop at very low cost.",
    k: ["Index every field versus only declared ones: indexing everything speeds any filter and bloats memory and slows writes, declared indexes keep cost visible and punish forgetting one.", "Materialized bitmap per query versus per-point predicate check: a bitmap is fast to probe, and costly to build for large sets."],
    p: ["A filter on an unindexed field degrading to a scan of all payloads without any warning.", "A high-cardinality field such as a unique ID indexed as a tag, producing millions of tiny lists."],
    v: "Filter on an indexed and an unindexed field with the same matching fraction; confirm the indexed one is much faster, the trace names the index used and the counts agree with a full scan of the payloads.",
    dep: ["metadata-store", "filter-selectivity-estimation"]
  },
  "pre-filtering": {
    s: "Applies the metadata filter first to build the allowed set, then searches only those points, giving exact filter semantics and perfect recall within the set.",
    d: "The engine resolves the filter through payload indexes into a list or bitmap of matching points. If the list is small, it scores them all with exact distances. For larger sets, it runs index search restricted to the allowed points. Results never contain a non-matching point and never come back short because of filtering. The cost is the filter evaluation up front and a scan proportional to the set size. The difficulty is the mid-size set: too big to scan, too small for graph search to find its way, because the allowed points are sparsely connected.",
    k: ["Pre-filter then exact scan versus pre-filter then index search: exact is perfectly accurate and linear in set size, index search is faster for large sets and can miss matches.", "Building the allowed set eagerly versus lazily during traversal: eager is simple and wastes work when the search stops early."],
    p: ["A graph search restricted to a sparse allowed set that cannot reach most of it from the entry point, returning fewer than k results.", "Expensive filter evaluation repeated for every segment when it could be shared."],
    v: "Run a filter matching 1,000 of 10 million points and compare results to exact search over just those points; confirm identical top-10 and latency that scales with set size rather than collection size.",
    dep: ["payload-indexes", "flat-scan"]
  },
  "post-filtering": {
    s: "Runs the vector search first and discards hits that fail the filter afterward, oversampling to compensate, which is fast when the filter passes most points and fails when it is selective.",
    d: "The index returns candidates for an enlarged k, and each is checked against the payload. If too few survive, the search is repeated deeper. It keeps the index path simple and needs no filter-aware structures. When the filter matches ten percent of points, the engine must fetch roughly ten times as many candidates, and for one in a million it will almost never find a match. The difficulty is knowing how much to oversample, since the answer depends on selectivity and on how the filter correlates with the query.",
    k: ["Fixed oversample factor versus adaptive deepening: a fixed factor has predictable cost and fails on selective filters, adaptive deepening keeps correctness and latency can balloon.", "Post-filter everywhere versus only for permissive filters: restricting it to high-selectivity cases avoids its worst behavior."],
    p: ["Returning fewer than k results with no indication that the filter eliminated the candidates.", "Silent recall loss when the oversample is too small for a filter correlated with the query."],
    v: "Run queries with filters matching 50, 5 and 0.1 percent of points using post-filtering; confirm the count of results returned and latency at each, and compare against exact filtered search to show where recall collapses.",
    dep: ["beam-search", "payload-indexes", "search-strategy-selector"]
  },
  "filtered-graph-traversal": {
    s: "Searches the graph index while checking the filter at each visited node, keeping non-matching nodes as stepping stones but only returning matching ones.",
    d: "A plain restricted search that skips invalid nodes can get stuck because valid points are not connected to each other. Filter-aware traversal walks through invalid nodes to reach valid ones and tracks only valid nodes as results. Variants add extra edges between points that share common payload values, or build per-value sub-graphs for frequent values, or widen search depth as the filter becomes more selective. The difficulty is the extra distance computations spent crossing invalid regions, and that gain over pre-filtering shrinks as selectivity rises.",
    k: ["Traverse through invalid nodes versus skip them: traversing keeps the graph connected and wastes work, skipping is cheap and loses recall.", "Extra filter-aware links at build time versus none: they speed selective queries, and cost memory, build time and apply only to filters anticipated in advance."],
    p: ["Recall that is good unfiltered and poor for one rare category because those points were never well linked.", "Search depth fixed for unfiltered queries and never widened for selective ones."],
    v: "Measure recall and distance computations for a filter matching 1 percent, comparing in-traversal filtering with exact filtered search; confirm recall meets target and the trace shows widened depth.",
    dep: ["graph-index", "beam-search", "payload-indexes"]
  },
  "filter-selectivity-estimation": {
    s: "Predicts how many points a filter will match before running it, from payload index counts or samples, so the planner can pick a strategy.",
    d: "For a single indexed value the count is exact from the index. For combined conditions the estimator multiplies fractions under an independence assumption, or samples points, or keeps histograms of ranges. The planner uses the estimate to choose between exact scan of the allowed set, filtered traversal and post-filtering. Estimates are cheap compared to executing the filter. The difficulty is correlation between fields and between the filter and the query region, which make independent estimates badly wrong, and a wrong estimate sends the query down a plan that is slow or loses recall.",
    k: ["Independence assumption versus sampling: independence is instant and wrong for correlated fields, sampling is more accurate and adds cost per query.", "Exact counts from indexes versus approximate cardinality sketches: exact is simple for small indexes and sketches scale to huge ones."],
    p: ["Two fields, such as country and language, that are highly correlated, giving an estimate far smaller than reality.", "Counts that include deleted points make a selective filter look permissive."],
    v: "For a suite of filters with known true match counts, compare estimates to actuals; confirm the planner's strategy matches the one an oracle with exact counts would pick for the large majority of cases.",
    dep: ["payload-indexes", "tombstones-and-deletes"]
  },
  "lexical-index": {
    s: "A text index that maps terms to the documents containing them and scores matches by term statistics, giving keyword precision that embedding similarity lacks.",
    d: "Text is split into tokens, normalized and stored in an inverted index with term frequencies. Queries are scored by a ranking function that rewards rare terms and normalizes for document length, and the index can be scanned with skip structures for speed. It excels at exact names, codes and rare words, which embeddings blur. In a vector database it sits beside the vector index, shares point IDs and often shares filters. The difficulty is operating two index families with different update behavior, tokenization and language handling in one engine.",
    k: ["Built-in lexical index versus an external search system: built-in simplifies consistency and filtering, external offers richer text analysis and doubles operations.", "Shared point IDs and segments versus separate stores: shared makes hybrid queries one pass, and constrains how each index can evolve."],
    p: ["Different tokenization at index and query time, so exact terms fail to match.", "Rare-word queries returning nothing from the vector side and being drowned out when scores are fused naively."],
    v: "Query an exact product code that embeddings cannot distinguish and confirm the lexical index returns the right document first; then confirm a reworded paraphrase is found by vectors instead.",
    dep: ["id-mapping", "immutable-segments"]
  },
  "sparse-vectors": {
    s: "High-dimensional vectors with mostly zeros, produced by learned term-weighting models or term counts, stored as index and weight pairs and searched with an inverted index.",
    d: "A sparse vector lists only its nonzero dimensions, often thousands of possible dimensions per vocabulary with tens to hundreds present. Search uses an inverted index from dimension to points with weights, scoring by dot product and pruning with upper bounds so low-contribution lists are skipped. Learned sparse vectors capture term importance and some expansion of meaning while keeping the exactness of term matching. The difficulty is that graph indexes work poorly on them and the lists for common dimensions are long, so pruning heuristics trade recall for speed.",
    k: ["Learned sparse vectors versus classic term scoring: learned weights improve relevance and need a model at index and query time.", "Exact top-k with bound-based skipping versus approximate pruning: exact is correct and slower on long lists, approximate gains speed and drops tail documents."],
    p: ["A very common dimension whose posting list holds most points and dominates query time.", "Index-time and query-time models mismatched, giving weights from different vocabularies."],
    v: "Run sparse queries with exact and approximate pruning on a labeled set and compare results to a brute-force dot product; confirm exact mode is identical and approximate recall and speedup are reported.",
    dep: ["lexical-index", "distance-metrics"]
  },
  "hybrid-score-fusion": {
    s: "Combines ranked lists from vector search and lexical or sparse search into one list, using rank-based or score-based fusion so both signals contribute.",
    d: "Dense and lexical scores live on different scales, so adding them directly is brittle. Reciprocal rank fusion sums the inverse of each item's rank across lists, needing no score calibration. Weighted score fusion normalizes each list and applies a tunable weight, giving finer control and requiring calibration per collection. Both searches run in parallel with the same filter and candidate depth, and the fused list may feed a rerank stage. The difficulty is tuning: the best weight depends on query type, and fusion hides which retriever produced a hit, making failures hard to diagnose.",
    k: ["Rank-based fusion versus score-based fusion: rank-based is robust and ignores score magnitude, score-based can use confidence information and needs normalization that drifts with data.", "Fusing in the database versus in the application: inside saves a round trip and shares filters, outside allows custom logic and multiple sources."],
    p: ["Normalizing scores using the min and max of the current result list, so the same document scores differently in different queries.", "Retrievers searching to different depths, so a strong hit in one list is simply absent from the other."],
    v: "On a labeled query set with exact-match and paraphrase queries, compare vector-only, lexical-only and fused results; confirm fusion matches or beats the best single retriever on both query types.",
    dep: ["lexical-index", "search-endpoint", "scatter-gather-merge"]
  },
  "distance-metrics": {
    s: "The functions that define similarity between vectors: Euclidean distance, inner product, cosine similarity, and Hamming distance for binary vectors, chosen to match how the embedding model was trained.",
    d: "Euclidean measures straight-line distance, inner product rewards both direction and magnitude, and cosine ignores magnitude and is inner product on normalized vectors. Binary vectors use bit differences, computed fast with popcount. Indexes are built for a specific metric, since graph and partition structure encode its geometry; changing it means rebuilding. Many systems convert everything to inner product or Euclidean internally after normalization. The difficulty is that the wrong metric still returns plausible results, so a mismatch with the model's training objective goes unnoticed while quality drops.",
    k: ["Cosine via normalization at write time versus computing cosine per query: normalizing once makes search a plain inner product and changes the stored values, per-query avoids that and costs extra math.", "One metric per collection versus per query: per collection lets the index specialize, per query adds flexibility and forces a rebuild or a slow path."],
    p: ["Using Euclidean distance on vectors trained for inner product, which ranks high-magnitude vectors wrongly.", "Treating distance and similarity as the same sign, so results arrive in reverse order."],
    v: "On known vectors with computed distances, confirm each metric returns the expected values and ordering; then run a labeled retrieval set under each metric and confirm the one the model documents scores best.",
    dep: ["vector-normalization"]
  },
  "vector-normalization": {
    s: "Scales vectors to unit length when written, so cosine similarity can be computed as a plain inner product and magnitudes do not distort distances.",
    d: "Dividing each vector by its norm takes it onto the unit sphere. For such vectors, cosine, inner product and Euclidean distance give the same ordering, which lets the engine use a single fast kernel. Normalization happens at write, and queries are normalized too. Zero vectors have no direction and need a defined behavior. Some models already emit normalized vectors, and normalizing again is harmless but wasted. The difficulty is losing information: if magnitude carried meaning, such as confidence or popularity, normalization discards it.",
    k: ["Normalize inside the database versus require normalized input: inside protects against mistakes and alters stored values, requiring input keeps stored data faithful and shifts the burden to clients.", "Store the original norm alongside versus discard it: keeping it allows reconstruction and costs space."],
    p: ["Normalizing documents but not queries, so scores differ from what the model intended.", "A zero vector causing a divide by zero and a NaN that corrupts index distances."],
    v: "Write unnormalized vectors to a cosine collection and read them back; confirm stored norms are one, scores equal the cosine of the originals, and a zero vector is rejected with a clear error.",
    dep: ["distance-metrics"]
  },
  "flat-scan": {
    s: "Computes the distance from the query to every stored vector and keeps the best k, with perfect recall and cost proportional to the collection size.",
    d: "Vectors are stored contiguously, so the scan is sequential memory access that vector units and multiple threads handle at memory bandwidth, hundreds of millions of floating-point operations per core per millisecond. It needs no index build, no tuning and handles updates trivially. It is the ground truth for recall measurement and the best strategy for small collections, small filtered sets and tenants with few vectors. The difficulty is scale: a billion 768-dimension vectors is terabytes to read for each query, so only batching and compression keep it viable for large sets.",
    k: ["Flat scan versus building an index: flat has no build cost or recall loss and linear query time, index trades build time and memory for sublinear queries.", "Scan quantized data versus full precision: quantized reads far less memory and then needs an exact rerank to recover accuracy."],
    p: ["Using flat scan on a collection that grew past the point where it is fast, with no alert when latency crosses its budget.", "Scanning through non-contiguous or fragmented storage, which loses the sequential-bandwidth advantage."],
    v: "Time flat scans at 100 thousand, one million and ten million vectors and confirm latency grows linearly and approaches the machine's memory bandwidth; confirm results define 100 percent recall for comparison.",
    dep: ["simd-distance-kernels", "vector-file-layout", "distance-metrics"]
  },
  "simd-distance-kernels": {
    s: "Hand-tuned routines that compute many distances at once using the processor's wide vector instructions, selected at run time for the machine's capabilities.",
    d: "A distance kernel processes sixteen or more floats per instruction, and low-precision or integer kernels pack more. The engine detects supported instruction sets at start and dispatches to the best one, with a portable fallback. Kernels exist for each metric and element type and are tuned for alignment, loop unrolling and prefetching so the memory system stays busy. Bit-level kernels use population-count instructions. The difficulty is correctness across variants: floating-point results differ slightly between kernels due to summation order, which can reorder near-ties and make results depend on the machine.",
    k: ["Run-time dispatch versus compile-time targeting: dispatch lets one binary run well everywhere and costs a branch and testing effort per variant.", "Lower-precision arithmetic versus full float: halves memory traffic and speeds up, while introducing rounding error that matters for near-ties."],
    p: ["Results that differ between nodes with different instruction sets, breaking comparisons between replicas.", "Unaligned vectors that force slow loads or crash a kernel that assumes alignment."],
    v: "Run every kernel variant on the same random vectors and confirm distances agree within a stated tolerance of a scalar reference and the dispatched kernel is the widest supported on the machine.",
    dep: ["distance-metrics", "float-precision-formats"]
  },
  "gpu-distance-kernels": {
    s: "Offloads large distance computations and index builds to accelerator cards, which have far higher arithmetic and memory bandwidth for batched work.",
    d: "Vectors are copied to device memory and queries are scored as large matrix multiplications, which accelerators do extremely well. Graph and partition index builds also benefit, cutting build time from hours to minutes. For serving, the gain depends on batch size: single queries cannot fill the device and pay a transfer cost. Device memory is small relative to host memory, so large indexes are split or streamed. The difficulty is cost and operations: accelerators are expensive, need drivers and capacity planning, and the speedup for low-latency single-query traffic is often smaller than expected.",
    k: ["Accelerators for build only versus for serving: build-only captures most of the value at lower cost, serving helps high-throughput batched workloads and needs resident data.", "Keep vectors resident on device versus stream from host: resident is fast and limited by memory, streaming handles larger sets and pays transfer time."],
    p: ["Serving single queries from an accelerator where transfer and launch overhead exceed the compute it saves.", "A node that loses its device falling back to a CPU path that is far too slow for the traffic."],
    v: "Compare queries per second and latency for batch sizes of 1, 32 and 1,000 on CPU and accelerator for the same collection, confirming identical top-k and showing the batch size above which the device wins.",
    dep: ["batch-search", "simd-distance-kernels"]
  },
  "multi-vector-scoring": {
    s: "Represents one item by several vectors, such as one per token or image patch, and scores a query by combining the best matches across them.",
    d: "Late-interaction models produce a set of vectors for each document and each query. The score sums, over query vectors, the highest similarity with any document vector. Search first retrieves candidate documents using an approximate index over all stored vectors, then scores candidates exactly with the full set. Storage grows by the number of vectors per item, often by tens or hundreds, so compression is usual. The difficulty is cost: the index covers far more vectors than items, candidate scoring touches many vectors, and results must be aggregated back to items.",
    k: ["Multi-vector scoring versus one pooled vector: multi-vector finds fine-grained matches and costs tens of times more storage and compute, pooled is cheap and blurs detail.", "Retrieve candidates by index then rescore versus exhaustive scoring: candidate retrieval scales and can miss items whose best match is weak."],
    p: ["Storage planned per item when it is actually per item times vectors per item.", "Aggregation that counts the same item several times in the candidate set, crowding out other items."],
    v: "On a labeled set, compare single-vector retrieval with multi-vector scoring and confirm the exact scoring of candidates equals an exhaustive computation for the same pairs, with the quality gain and storage cost reported.",
    dep: ["named-vectors", "flat-scan", "product-quantization"]
  },
  "exact-rerank": {
    s: "Recomputes true distances for the candidate set using stored full-precision vectors, so the approximate index only needs to find the right neighborhood, not the exact order.",
    d: "An index over compressed vectors returns, say, 100 candidates for k of 10. The engine fetches each candidate's original vector, computes the exact metric and sorts. This corrects ranking errors from quantization and from approximate graph distances. Original vectors usually sit on SSD or in a slower tier, so the fetch is the main cost and benefits from parallel, batched reads. The difficulty is the balance between memory saved by compression and the disk reads rerank requires, and making sure the rerank actually sees the same data version as the index.",
    k: ["Keep full vectors on SSD versus in memory: SSD cuts memory cost several times and adds random-read latency to every query, memory is fast and expensive.", "Rerank every candidate versus rerank only uncertain ones: pruning by score margin saves reads and requires a calibrated error bound."],
    p: ["Issuing candidate fetches serially, so rerank time scales with candidate count times disk latency.", "Reranking against a vector that was updated after the index entry was made."],
    v: "Compare recall at k of 10 for a quantized index with and without exact rerank at oversample factors of 1, 4 and 10; confirm recall rises with the factor and show the added read count per query.",
    dep: ["vector-file-layout", "ssd-io-scheduler", "flat-scan"]
  },
  "graph-index": {
    s: "A proximity graph over the vectors, where each point links to nearby points, searched by walking from an entry point toward the query through neighbors that get progressively closer.",
    d: "Each node stores a bounded list of neighbors, typically sixteen to a few hundred. Hierarchical variants add sparse upper layers for long jumps and a dense bottom layer for precision. Search visits only a few hundred or thousand nodes out of millions, so queries take under a millisecond when the graph is in memory. Graph indexes give the best recall per unit of latency for medium and large collections. The difficulty is memory, since links add hundreds of bytes per vector on top of the vectors, and that deletes and updates leave structural damage that is hard to repair.",
    k: ["Graph index versus partition-based index: graphs give better recall at low latency and use more memory with expensive updates, partitions are cheaper to build and scale on disk and need more probing.", "Hierarchical layers versus a flat graph with good entry points: layers are robust and add memory and complexity, flat graphs are simpler and depend on entry-point quality."],
    p: ["Heavy deletion leaving unreachable regions that can never be returned.", "A graph built for one metric reused after the metric changed, yielding confidently wrong neighbors."],
    v: "Build a graph on a dataset with exact neighbors known; confirm recall at k of 10 meets target at the configured search depth with sub-millisecond latency, and that every node is reachable from the entry point.",
    dep: ["graph-construction", "beam-search", "graph-entry-points", "index-parameters"]
  },
  "graph-construction": {
    s: "Builds the proximity graph by inserting points one at a time, searching the existing graph for each new point's neighbors and linking them in both directions.",
    d: "For each point, the builder runs a search with a construction-time depth to find candidate neighbors, applies a selection rule to keep a diverse set of links, and adds reverse links, pruning neighbors that exceed the degree limit. Quality depends on that depth and on insertion order. Large builds are parallelized with locks or by batching, which adds nondeterminism. Building a hundred-million-point graph takes hours and many cores. The difficulty is the cost-quality trade-off and the memory during build, which can exceed the final index size.",
    k: ["Higher construction depth versus lower: higher gives a better graph and slower builds, and the gain flattens beyond a point.", "Sequential versus parallel insertion: sequential is deterministic and slow, parallel is fast and can yield a slightly different graph each time."],
    p: ["A build that finishes but with hubs of low-quality neighbors because insertion order was sorted by a cluster.", "Out-of-memory failure during build while the final index would fit."],
    v: "Build the same dataset twice at different construction depths and compare recall at a fixed search depth and build time; confirm higher depth gives higher recall and the degree limit is never exceeded.",
    dep: ["neighbor-selection-heuristic", "beam-search", "index-parameters"]
  },
  "graph-entry-points": {
    s: "The nodes where every search starts: a single top-layer node, a set of sampled points or one near the data's center, from which the walk toward the query begins.",
    d: "A bad entry point wastes hops crossing the dataset, and in clustered data a single entry may be far from the query's region. Hierarchical graphs descend through sparse layers to reach a good starting place on the bottom layer. Flat graphs often keep several entry points chosen by clustering or sampling, and pick the closest to the query. Entry points must be updated when nodes are deleted or a segment is merged. The difficulty is robustness: the entry point is a single point of failure for reachability, and filtered queries may need entries inside the allowed set.",
    k: ["One global entry versus many entries chosen per query: one is simple and can start far away, many cut hops and need a quick selection step.", "Layered descent versus clustered entry table: layers are self-maintaining, a table can be tuned to the data and must be rebuilt."],
    p: ["Deleting the entry node without electing a replacement, making the whole index unreachable.", "Filtered queries starting from an entry outside the allowed region and spending the search budget before reaching it."],
    v: "Delete the current entry point and confirm search still works with recall unchanged; then compare average hops for queries in distant clusters with one entry versus several.",
    dep: ["graph-index", "tombstones-and-deletes"]
  },
  "beam-search": {
    s: "The search procedure that keeps a bounded list of the best candidates seen so far, repeatedly expanding the closest unvisited one until no candidate can improve the result.",
    d: "The searcher maintains a candidate queue ordered by distance and a result list of size equal to the search depth, often called the beam width or ef. It pops the closest candidate, computes distances to its neighbors, and inserts those that beat the worst in the result list. It stops when the closest candidate is worse than the worst result. A larger beam increases recall and cost roughly linearly. A visited set prevents recomputing. The difficulty is that this is a pointer-chasing loop with random memory access, so each hop can wait on cache or disk, and tuning the beam is the main recall-latency control.",
    k: ["Larger beam versus smaller: recall rises with diminishing returns while latency rises roughly linearly.", "Visited set as a bitmap versus a hash set: a bitmap is fast and large for big collections, a hash set is compact and slower."],
    p: ["A default beam width tuned on a small test set producing low recall on the production collection.", "Visited-set memory allocation per query becoming the dominant cost at high query rates."],
    v: "Sweep beam width from 10 to 500 on a fixed dataset and plot recall against latency; confirm monotonic recall gain and identify the smallest width that meets the recall target.",
    dep: ["graph-index", "distance-metrics", "recall-latency-tradeoff"]
  },
  "neighbor-selection-heuristic": {
    s: "The rule for choosing which links to keep for a node, preferring neighbors that cover different directions over a cluster of near-duplicates, which keeps the graph navigable.",
    d: "Given candidate neighbors sorted by distance, the heuristic accepts a candidate only if it is closer to the node than to any already-accepted neighbor. This favors diversity and links to different regions, and it connects clusters that pure nearest-neighbor links would leave isolated. A relaxation factor allows slightly longer edges for better long-range reachability. The same rule prunes links when a node exceeds its degree limit. The difficulty is that it is local and approximate: it improves navigability while it can drop an edge that was the only path to a region.",
    k: ["Diversity heuristic versus keeping the nearest links: diversity gives better long-range navigation and slightly worse local accuracy, nearest links are simple and tend to form cliques.", "Strict versus relaxed pruning: relaxed keeps more long edges and increases memory and distance computations."],
    p: ["Pruning that removes the sole bridge between two clusters after many inserts.", "Using a heuristic tuned for Euclidean data on inner-product vectors with large magnitude differences."],
    v: "Build graphs with and without the heuristic on a clustered dataset and compare recall at a fixed search depth and the count of unreachable nodes; confirm the heuristic improves both.",
    dep: ["graph-construction", "distance-metrics"]
  },
  "inverted-file-index": {
    s: "Divides the vectors into clusters around learned centroids and stores each cluster's members in a list, so a query scans only the lists nearest to it.",
    d: "A clustering step finds thousands of centroids; each vector is assigned to its closest one. At query time the engine ranks centroids by distance to the query, takes the closest few, and scans just those lists, perhaps one to five percent of the data. Lists can hold compressed vectors for speed. Build is fast and memory use is low, and updates are simple appends to a list. The difficulty is boundary effects: a true neighbor sitting in a neighboring cluster is missed unless more lists are probed, and clusters drift as data changes.",
    k: ["Inverted file versus graph: inverted file has cheap builds, easy updates and compact memory, and needs more distance computations for the same recall.", "Many small clusters versus few large: many small scan less and require more centroid comparisons and raise the chance of missing a neighbor across a boundary."],
    p: ["Centroids trained on an early sample drift away from the data as the distribution changes, unbalancing lists.", "A hot cluster that holds a large share of vectors and dominates every query."],
    v: "Build the index, measure the fraction of data scanned and recall for 1, 8 and 64 probed lists, and confirm recall rises with probes while scanned fraction matches the list sizes.",
    dep: ["coarse-quantizer", "partition-probing", "flat-scan"]
  },
  "coarse-quantizer": {
    s: "The component that maps a vector to its nearest centroid, either by trained clustering or by a small graph over the centroids, and so decides which list holds each point.",
    d: "Centroids come from running a clustering algorithm over a sample, with a number of centroids around the square root of the collection size. Assigning a vector requires finding the nearest centroid, which is itself a nearest-neighbor search; with many centroids a small graph index over them makes assignment and query probing fast. The quality of the centroids sets list balance and recall. The difficulty is training: it needs a representative sample, it is run again when data shifts, and re-assigning every vector is a full rewrite.",
    k: ["Train on a sample versus on all data: a sample is fast and may miss rare clusters, all data is thorough and slow.", "Flat centroid scan versus a graph over centroids: flat is exact and costs more per query when there are many centroids, a graph is fast and approximate at the first step."],
    p: ["Training on a sample taken only from early data, then adding vectors from a different distribution.", "Updating centroids without re-assigning points, leaving points in lists that no longer match their nearest centroid."],
    v: "Compute list size distribution after assignment and confirm no list holds more than a small multiple of the mean; confirm each sampled vector's assigned centroid is its true nearest centroid.",
    dep: ["codebook-training", "distance-metrics"]
  },
  "partition-probing": {
    s: "Chooses how many of the nearest cluster lists to scan for a query, the main knob trading recall for latency in partition-based indexes.",
    d: "The engine computes distances from the query to all centroids and scans the closest few lists. The probe count can be fixed or adaptive: adaptive schemes keep probing until the next centroid is too far to hold a better result than the current top-k, using a bound on distance. Probed lists are scanned in parallel. In sharded or disk-based systems, the probe count also decides how many partitions or files are read. The difficulty is queries near cluster boundaries need many probes, while those near centers need few, so a fixed count wastes work or loses recall.",
    k: ["Fixed probe count versus adaptive stopping: fixed is predictable, adaptive spends effort where queries are hard and has variable latency.", "Probe by count versus by distance threshold: count bounds work, threshold bounds quality."],
    p: ["A probe count tuned on average queries failing for boundary queries that make up the tail of user complaints.", "Scanning probed lists sequentially instead of in parallel, leaving cores idle."],
    v: "Sweep probe counts on a labeled query set, plot recall and latency, and confirm adaptive stopping reaches target recall with a lower average scanned fraction than a fixed count at the same recall.",
    dep: ["inverted-file-index", "coarse-quantizer", "recall-latency-tradeoff"]
  },
  "tree-and-hash-indexes": {
    s: "Alternative approximate structures: random-projection trees that split space with hyperplanes, and locality-sensitive hashing that maps similar vectors to the same bucket.",
    d: "Tree indexes build several random trees; a query descends each and merges the leaves it reaches, which gives good recall with a small memory footprint and memory-mappable, read-only files. Hash indexes use many hash functions so that near vectors collide with high probability, then check the bucket members exactly. Both are simple to build and parallel. Their recall at a given cost is generally lower than graph indexes in high dimensions, but they can be easier to share between processes and to rebuild. The difficulty is tuning the number of trees or hash tables, which multiplies memory.",
    k: ["Many trees versus few: many raise recall and memory use in proportion, few are compact and miss neighbors on the other side of a split.", "Tree or hash index versus graph: trees and hashes are simple, static and cheap to share, graphs achieve better recall and need more memory."],
    p: ["Using a hash index tuned for low dimension on high-dimensional embeddings, where buckets become either empty or enormous.", "Static trees that must be rebuilt for each batch of updates."],
    v: "Build tree and graph indexes over the same data, compare recall at equal latency and memory, and confirm the tree files can be memory-mapped by two processes at once.",
    dep: ["flat-scan", "distance-metrics"]
  },
  "disk-graph-index": {
    s: "A graph index designed to live on SSD, keeping compressed vectors in memory for navigation and full vectors with neighbor lists on disk, so billions of vectors fit on one node.",
    d: "Memory holds a quantized copy of every vector, used for distance estimates while walking the graph. Each node's full-precision vector and its neighbor list are stored together in one aligned disk page, so a single read provides both. The search fetches the pages for nodes it expands, in batches issued concurrently, and reranks with the full vectors. Latency is a few milliseconds and set by the number of reads. The difficulty is that updates are costly, graphs are built in-memory in pieces and merged, and performance depends heavily on SSD queue depth.",
    k: ["Disk graph versus all-in-memory graph: disk cuts memory cost by ten times or more and costs milliseconds of latency, memory is faster and limits scale.", "Compressed vectors in memory versus none: they cut disk reads by guiding the search and use memory proportional to collection size."],
    p: ["Latency tails when many concurrent queries saturate SSD queue depth.", "Sharing an SSD with a compaction or snapshot job, which starves query reads."],
    v: "Load a collection with ten times more vector bytes than RAM, run queries at target concurrency and confirm recall meets target, reads per query equal the expected count, and p99 stays within budget.",
    dep: ["page-aligned-layout", "ssd-io-scheduler", "product-quantization", "graph-index"]
  },
  "index-parameters": {
    s: "The settings that fix an index's shape and quality: graph degree, construction depth, number of lists, quantization bits and search depth defaults.",
    d: "Build-time parameters such as degree and construction depth are baked into the index and need a rebuild to change. Query-time parameters such as beam width and probe count can be set per request. Good values depend on dimension, data distribution, metric and the recall target. Defaults are a compromise; production tuning measures recall and latency on a representative sample and records the chosen set with the index. The difficulty is the large space of interacting settings and the risk that a value found on a sample behaves differently as the collection grows by ten times.",
    k: ["Few exposed knobs with sensible defaults versus full control: defaults protect most users and frustrate experts, full control lets experts hit exact targets and be wrong.", "Build-time parameters set once versus tuned automatically from a recall target: automatic tuning needs a measurement loop and spares users the search."],
    p: ["Tuning parameters on a small sample and assuming they hold at full scale.", "Changing a build-time setting in configuration and expecting existing indexes to follow without a rebuild."],
    v: "Run a parameter sweep on a representative sample at two collection sizes and confirm the stored configuration with each index matches what was used and the recall reported meets the target at the chosen settings.",
    dep: ["recall-measurement"]
  },
  "scalar-quantization": {
    s: "Maps each floating-point component to a small integer, typically eight bits, using a per-dimension range, which cuts vector memory fourfold with small accuracy loss.",
    d: "The system finds the minimum and maximum of each dimension, or a clipped range that ignores outliers, and divides it into 256 levels. Distances are computed directly on integers with fast integer instructions, or by decoding. Four-bit variants halve memory again with more loss. Because the error per component is small and random, ranking is largely preserved, and an exact rerank recovers the rest. The difficulty is the range: outliers stretch it and waste levels, and a range fixed from early data clips values that appear later.",
    k: ["Eight-bit versus four-bit codes: eight is nearly lossless in ranking, four halves memory and needs more reranking.", "Per-dimension range versus global range: per-dimension uses levels efficiently and costs a small table, global is simpler and wastes levels on dimensions with narrow ranges."],
    p: ["Calibrating the range on a tiny sample so later out-of-range values saturate and lose all distinction.", "Mixing quantized and unquantized segments with scores that are not comparable."],
    v: "Quantize a dataset to eight bits and compare top-10 results with full precision; confirm overlap is above the target without rerank and memory use is a quarter of the original.",
    dep: ["float-precision-formats", "simd-distance-kernels"]
  },
  "product-quantization": {
    s: "Splits each vector into sub-vectors and replaces each with the index of its nearest entry in a small learned codebook, compressing a vector to a few dozen bytes.",
    d: "A 768-dimension vector might be cut into 96 segments of 8 dimensions, each coded by one byte choosing among 256 centroids learned for that segment. Compression is thirty-two times or more. Distances are estimated by building a lookup table of distances from the query's sub-vectors to each centroid, then summing table entries per code, which is fast and cache-friendly. Accuracy is lower than scalar quantization, so it needs a rerank. The difficulty is codebook training on representative data and that codebooks are tied to the model and distribution.",
    k: ["More sub-vectors versus fewer: more raises accuracy and memory use and lookup cost, fewer compress harder and lose detail.", "Product quantization versus scalar: product reaches far higher compression and loses more precision, scalar is simpler and keeps accuracy."],
    p: ["Codebooks trained on one model's vectors then used after a model change.", "Skipping the rerank and expecting full recall from codes alone."],
    v: "Compress a dataset and compare estimated distances with exact ones, reporting error and top-10 overlap with and without rerank; confirm the memory footprint matches the code size times vector count.",
    dep: ["codebook-training", "asymmetric-distance"]
  },
  "binary-quantization": {
    s: "Reduces each component to a single bit, its sign, so a vector becomes a bit string compared by counting differing bits, with thirty-two-fold compression and very fast scans.",
    d: "Distance becomes Hamming distance, computed with one exclusive-or and a population count per word, which scans hundreds of millions of vectors per second per core. It works best for high-dimensional embeddings, from about 768 up, where the sign pattern preserves much of the ranking, and for models trained for it. Used as a first stage, it selects a large candidate set that is reranked with full precision. The difficulty is that quality varies by model and dimension, and low-dimensional data loses too much.",
    k: ["Binary first stage with rerank versus direct binary search: rerank gives near full-precision quality and needs full vectors on disk, direct search is the cheapest and noticeably worse.", "Sign thresholding at zero versus at the learned mean: learned thresholds balance bits and improve ranking for off-center data."],
    p: ["Applying it to a low-dimensional or poorly centered embedding, where recall drops sharply.", "Using too small a candidate set for rerank, which locks in binary-stage errors."],
    v: "Compare recall of binary search with 5x and 20x oversampling and rerank against full-precision search on the same data; confirm the speed and memory gains and find the oversampling that reaches the recall target.",
    dep: ["rerank-stage", "distance-metrics", "simd-distance-kernels"]
  },
  "residual-quantization": {
    s: "Encodes a vector as its coarse centroid plus a compressed version of the difference from that centroid, which gives finer detail for the same code size.",
    d: "In a partition index, each vector is stored relative to the centroid of its list, since the residual has smaller magnitude and variance. The residual is then quantized with scalar or product methods, so the same bits capture finer variation. Distance estimates add the centroid contribution and the residual contribution. Multi-stage versions quantize the leftover error repeatedly. The difficulty is that decoding depends on the centroid, so changing centroids invalidates the codes, and lookup tables must be rebuilt for each probed list.",
    k: ["Quantizing residuals versus raw vectors: residuals give higher accuracy per bit and tie codes to the cluster structure.", "More stages versus a single stage: more stages approach full precision with extra decode time and more complex code."],
    p: ["Re-clustering for balance without re-encoding residuals, producing wrong distances with no error.", "A table-per-list cost that makes probing many small lists slower than expected."],
    v: "Encode the same data with raw and residual product quantization at equal code size and compare estimated-distance error and recall; confirm residual coding is more accurate.",
    dep: ["coarse-quantizer", "product-quantization"]
  },
  "codebook-training": {
    s: "Learns the centroids used for coarse partitions and quantization codes by clustering a representative sample, a one-time step that the stored codes depend on.",
    d: "A sample, often tens of thousands to a few million vectors, is clustered with an iterative algorithm to produce centroids for each sub-vector or for the partition step. Training quality depends on the sample being drawn from the distribution of data and queries. The resulting codebook is versioned and stored with each segment so codes can be decoded later. Retraining requires re-encoding all data. The difficulty is drift and the cold start: an empty collection has no sample, and a collection that changes character needs retraining without downtime.",
    k: ["Train once up front versus retrain periodically: once is stable, periodic follows drift and rewrites data and needs versioned codebooks.", "Share codebooks across segments versus one per segment: shared makes scores comparable and slows adaptation, per-segment adapts and complicates cross-segment merging."],
    p: ["A codebook trained on a few hundred vectors from the first day, then used for millions with a different mix.", "Merging segments that were encoded with different codebooks and comparing their approximate scores directly."],
    v: "Train on samples of 1 percent and 10 percent and compare reconstruction error and downstream recall on held-out vectors; confirm each segment records its codebook version.",
    dep: ["model-version-tracking", "index-build-pipeline"]
  },
  "asymmetric-distance": {
    s: "Estimates distance between a full-precision query and a compressed stored vector, keeping the query exact so only one side carries quantization error.",
    d: "Compared with encoding the query too, which doubles the error, asymmetric computation keeps the query exact and looks up its distance to each code's centroid in a table precomputed per query. The table build costs a small fixed amount per query and each stored code then needs only lookups and additions. For scalar codes the query is scaled instead of the data decoded. The difficulty is making the table lookups cache-friendly and fast, since table size grows with sub-vectors and centroids, and fitting it in the fastest cache.",
    k: ["Asymmetric versus symmetric distance: asymmetric is more accurate and needs a per-query table, symmetric uses a precomputed table of centroid pairs and loses accuracy.", "Float lookup tables versus quantized tables: smaller tables fit in registers and add rounding error."],
    p: ["A table that does not fit in cache turning each lookup into a memory read and erasing the speedup.", "Comparing asymmetric estimates from one index against exact values from another without noting the error."],
    v: "Compute estimated distances for sampled query-vector pairs with asymmetric and symmetric methods against exact values and confirm asymmetric error is lower and per-vector cost stays within the stated bound.",
    dep: ["product-quantization", "simd-distance-kernels"]
  },
  "dimension-truncation": {
    s: "Uses only the first part of vectors from models trained so that leading dimensions carry the most information, shrinking storage and compute by cutting the rest.",
    d: "Some embedding models are trained with nested objectives, so a prefix of 256 of 1024 dimensions is still a useful embedding. The database can store truncated vectors for the first-stage index and keep full vectors for rerank, or offer a collection setting that cuts on write and on query. Memory and distance cost fall in proportion to the kept fraction. The difficulty is that it only works for models trained for it; truncating an ordinary embedding destroys quality, and the usable length depends on the task.",
    k: ["Truncate for first stage and rerank with full vectors versus truncate permanently: staged keeps quality and storage, permanent saves the most and cannot be undone.", "Truncating in the database versus in the application: in the database keeps one rule for writes and queries, in the application leaves control with the model owner."],
    p: ["Truncating vectors from a model never trained for it and seeing a sharp quality collapse.", "Truncating stored vectors but not queries, or to different lengths."],
    v: "Evaluate retrieval quality on a labeled set at full length and at 25, 50 and 75 percent prefixes; confirm the chosen length stays within the quality budget and queries are cut identically.",
    dep: ["embedding-model-binding", "dimension-and-type-config"]
  }
});
