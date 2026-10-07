// Details for the graph database plate, part 2: analytics, planning, execution.
ATLAS.details("graph-database", {
  "path-algorithms": {
    s: "Algorithms that find shortest or cheapest routes between nodes, using breadth-first search for unweighted edges and priority-queue methods when relationships carry costs.",
    d: "Breadth-first search finds fewest-hop paths and can run from both ends at once, meeting in the middle to touch far fewer nodes. Weighted variants keep a priority queue ordered by accumulated cost and need non-negative weights, with heuristics such as straight-line distance to guide the search. Variants return the k best paths or all equally short ones. They run on the live store for single queries or on a projection for many sources. The challenge is that frontier size grows exponentially with depth in dense graphs.",
    k: ["Bidirectional search vs single-direction search: meeting in the middle explores a tiny fraction of the nodes, but needs relationships traversable in reverse and a clean stopping rule.", "Exact shortest paths vs approximations with landmarks: exact is simple to reason about, while landmark methods answer fast on huge graphs with bounded error."],
    p: ["Negative or missing weights make the priority-queue method return wrong paths or never terminate.", "A hop limit omitted on a disconnected pair makes the search explore the whole component before answering none."],
    v: "On a graph with a known shortest route of four hops and a longer cheaper weighted route, confirm the unweighted search returns the four-hop path and the weighted search returns the cheaper one.",
    dep: ["traversal-frontier", "graph-projection", "relationships"]
  },
  "centrality": {
    s: "Scores that rank nodes by importance in the structure: how many connections, how often they lie on shortest paths, or how connected their neighbors are.",
    d: "Degree counts direct connections. Betweenness counts how often a node lies on shortest paths between others and is expensive, usually approximated by sampling sources. Iterative measures such as eigenvector and random-walk ranking repeatedly pass scores along relationships until values stabilize. Results are written back as properties or streamed out. They are costly because they touch the whole graph, often many times, so they run on an in-memory projection and are scheduled apart from transactional work.",
    k: ["Exact betweenness vs sampled estimates: exact is cubic in the worst case and impractical beyond thousands of nodes, while sampling trades a known error for hours saved.", "Writing scores back to the graph vs streaming them: stored scores are queryable and indexable, but they go stale and add write load."],
    p: ["A ranking computed once and left in properties continues to drive decisions long after the graph changed.", "Running iterative scoring directly on the transactional store slows live queries."],
    v: "Run ranking on a small star graph and confirm the hub scores highest, scores converge within the iteration limit, and results match an independent calculation on the same data to a stated tolerance.",
    dep: ["graph-projection", "bulk-synchronous-engine"]
  },
  "community-detection": {
    s: "Finds groups of nodes more densely connected to each other than to the rest of the graph, and assigns each node a community or component identifier.",
    d: "Connected-component analysis finds nodes reachable from each other. Modularity-based methods merge or move nodes between groups to improve a density score, in several levels. Label propagation lets nodes adopt the most common label among neighbors, repeating until stable. Triangle counting measures clustering. Most results depend on random tie-breaking and traversal order, so repeated runs differ. The output is a property per node, which downstream queries then group and filter by.",
    k: ["Deterministic seeding vs random initialization: seeding makes results repeatable and testable, but may lock in a poor local optimum that random restarts would escape.", "Overlapping vs disjoint communities: disjoint assignment is simple to store and query, but forces nodes with several roles into one group."],
    p: ["Treating community labels as stable identifiers breaks when a rerun renumbers every group.", "One bridge node connecting two groups can merge them into a single giant community under some methods."],
    v: "Build two cliques joined by one edge, run detection, and confirm each clique receives one community id and the ids differ, then confirm the component method places all nodes in one component.",
    dep: ["graph-projection", "bulk-synchronous-engine"]
  },
  "node-similarity": {
    s: "Scores how alike two nodes are by comparing their neighbors or properties, to find near-duplicates, recommend items and suggest missing relationships.",
    d: "Neighborhood methods compare the sets of neighbors two nodes share, using overlap measures such as the ratio of shared to total neighbors. Comparing every pair is quadratic, so implementations use top-k selection, sampling of neighbors and sorting to prune pairs with no shared neighbor. Embedding-based similarity compares vectors learned from structure. Results are written as new similarity relationships with a score, or streamed. It is used for recommendation and for entity resolution candidates.",
    k: ["Neighborhood overlap vs embedding distance: overlap is exact, explainable and cheap to update, while embeddings capture indirect similarity and need training and a vector index.", "Materialize similarity relationships vs compute on demand: materialized results are fast to query but are stale and large, as each node keeps its top matches."],
    p: ["Hub neighbors shared by everyone make unrelated nodes look similar unless they are down-weighted.", "Comparing all node pairs on a large graph never finishes."],
    v: "Create two nodes sharing three of four neighbors and one sharing none, run similarity, and confirm the first pair scores 0.6 under the overlap measure, the second pair scores zero and produces no relationship.",
    dep: ["graph-projection", "graph-embeddings"]
  },
  "graph-projection": {
    s: "A compact in-memory copy of selected nodes, relationships and properties, laid out for fast whole-graph algorithms and separate from the transactional store.",
    d: "A projection reads chosen labels and relationship types from the store, maps node ids to a dense range starting at zero, and builds compressed adjacency arrays, often with only the properties an algorithm needs, such as weights. It lives in a memory pool apart from the page cache and is named so several algorithms can reuse it. It is a snapshot: later writes do not appear unless it is rebuilt. Memory estimation before creating one prevents the surprise of exhausting the machine.",
    k: ["Projecting a subset vs the whole graph: a subset fits memory and runs faster, but the algorithm only sees what was projected and the choice of filter shapes the answer.", "Snapshot copy vs running on the live store: a copy gives stable repeatable results and speed, while live access avoids copy time and memory and sees concurrent changes."],
    p: ["Creating a projection without a memory estimate exhausts the heap and takes the server down.", "Analysts run an algorithm on a projection built last week and report its answers as current."],
    v: "Estimate memory for a projection, create it, and confirm the reported node and relationship counts equal a count query with the same filters, and memory used lies within the estimate.",
    dep: ["node-store", "relationship-store", "adjacency-chains", "page-cache"]
  },
  "graph-embeddings": {
    s: "Learned fixed-length vectors for nodes that capture their position and neighborhood in the graph, for use in similarity search and downstream machine learning.",
    d: "Methods generate random walks and learn vectors from node co-occurrence, or aggregate neighbor features through repeated propagation. The vectors are computed on a projection and stored as properties, then indexed for nearest-neighbor search. Dimension and walk parameters trade quality for cost. Embeddings are a function of the graph at training time: new nodes need a method that can embed unseen nodes or a retraining pass. They are not directly interpretable, which makes errors hard to explain.",
    k: ["Transductive embeddings vs inductive methods: transductive training is simple and accurate for known nodes, but cannot embed new nodes without rerunning, unlike inductive methods that need node features.", "High vs low dimension: more dimensions capture finer structure and cost storage and search time, with diminishing returns."],
    p: ["Using stale embeddings after large structural changes makes similarity results quietly wrong.", "Embeddings stored as properties inflate the property store and slow scans that read other properties."],
    v: "Embed a graph with two known clusters, then confirm that the average distance between nodes in the same cluster is clearly less than between clusters, and that a nearest-neighbor query returns same-cluster nodes.",
    dep: ["graph-projection", "bulk-synchronous-engine"]
  },
  "bulk-synchronous-engine": {
    s: "A vertex-centric execution model in which each node processes incoming messages, updates its state, and sends messages along relationships, in synchronized rounds until nothing changes.",
    d: "Computation proceeds in supersteps. In each, every active node reads messages sent in the previous round, updates its value, and sends messages to neighbors; a barrier then separates rounds, and the run ends when no node is active. Ranking, components and shortest paths fit this shape. The engine partitions nodes over threads or machines and batches messages between them. The barrier makes it simple but slow rounds wait on the slowest worker, and skewed degree makes one worker carry most of the messages.",
    k: ["Synchronous rounds vs asynchronous updates: rounds are deterministic and easy to reason about, while asynchronous updates converge faster in practice but give order-dependent results.", "Combining messages at the sender vs delivering all: combining cuts network and memory use for sums or minimums, but only works for associative operations."],
    p: ["A node with millions of neighbors sends millions of messages in one round and stalls the barrier.", "Algorithms that do not converge on some inputs run forever without an iteration cap."],
    v: "Run a component-finding job on a graph with three known components and confirm it halts in a number of supersteps not exceeding the longest shortest path, and yields exactly three labels.",
    dep: ["graph-projection", "parallel-execution"]
  },
  "semantic-analysis": {
    s: "Resolves names in the syntax tree to variables, labels, types and functions, checks that expressions are well-typed and rewrites the tree into a normalized form.",
    d: "After parsing, this phase binds each variable to the pattern element that introduced it, checks that referenced variables are in scope across clause boundaries, resolves labels and property keys through the token dictionary, and type-checks expressions. It reports an unknown function or misuse of an aggregate. It also performs rewrites: expanding pattern shorthand, constant folding and moving filters closer to the pattern they constrain. Property types are often unknown until runtime, so many checks are partial, which is a consequence of flexible schemas.",
    k: ["Static typing vs runtime type checks: static checking catches mistakes before execution, but with optional schema most property types are unknown, so runtime checks remain necessary.", "Resolving names early vs lazily: early errors are clear and cheap, while lazy resolution tolerates a label that does not exist yet."],
    p: ["A misspelled label returns an empty result instead of an error, because absent labels are legal.", "Scope rules at clause boundaries drop variables not carried forward and surprise users."],
    v: "Submit a query referencing a variable dropped by the previous clause and confirm the analysis rejects it with the variable name and clause, before any planning or execution starts.",
    dep: ["query-parser", "token-dictionary", "schema-catalog"]
  },
  "logical-plan": {
    s: "An abstract tree of operators such as scan, expand, filter, join and aggregate that describes what a query computes, independent of the physical algorithms that will run it.",
    d: "The planner translates the analyzed query into relational-style operators plus graph-specific ones, notably expand, which follows relationships from a bound node. Rewrite rules push filters down, drop unneeded projections, merge adjacent steps and simplify predicates. The logical plan is what the optimizer searches over, since the same result can be reached by starting from different pattern elements. Keeping it separate from physical choices lets the same rules serve different execution engines.",
    k: ["Rule-based rewrites vs cost-based search: rules are fast and predictable, while cost-based exploration finds better plans for complex patterns at higher planning time.", "A graph-specific operator set vs plain relational joins: native expand reflects how storage works and plans well, while relational operators reuse mature optimizer machinery."],
    p: ["A rewrite that is valid only for non-null input changes results when nulls are present.", "Pushing a filter below an optional match turns it into a required match."],
    v: "Explain a query with a filter on the end node and confirm the plan applies the filter before expanding further where legal, with identical results to the unoptimized version on a test graph.",
    dep: ["semantic-analysis"]
  },
  "graph-statistics": {
    s: "Counts and distributions the planner reads: nodes per label, relationships per type and direction, property value histograms and average degrees.",
    d: "Label and relationship-type counts are cheap to maintain exactly with each write. Property statistics, such as distinct counts and histograms, are sampled or computed on demand and stored with indexes. Degree statistics, how many relationships of a type leave a node of a label, are the most valuable because they predict how many rows an expand produces. Statistics are refreshed after enough changes rather than on every write. Their staleness is the usual cause of plans that were good yesterday and are bad today.",
    k: ["Exact counts vs sampled estimates: exact counts per label are free to keep and always right, while sampled property statistics scale to large data at the cost of accuracy.", "Refresh by change threshold vs by schedule: thresholds react to real churn, and schedules are predictable, but both can fall behind a sudden bulk load."],
    p: ["A bulk load grows a label tenfold before statistics refresh, and every plan keeps assuming the old size.", "Average degree hides a heavy tail, so an expand from the one celebrity node is estimated as cheap."],
    v: "Load one million nodes, then check that the reported label count matches within the staleness threshold, and confirm the statistics version advanced after the change count crossed the refresh trigger.",
    dep: ["node-store", "relationship-store", "token-dictionary"]
  },
  "cardinality-estimation": {
    s: "Predicts how many rows each operator will produce, by combining statistics and selectivity assumptions, so the optimizer can compare plans without running them.",
    d: "For a scan, the estimate is the label count. For a filter it multiplies by a selectivity from a histogram or a default guess. For an expand it multiplies the input rows by the average degree for that relationship type and direction. Errors multiply along a plan, so a small mistake on the first operator becomes a large one by the fifth. Independence assumptions fail in graphs, where neighbors correlate strongly: friends of friends overlap far more than a random draw would.",
    k: ["Independence assumption vs correlation-aware estimates: independence is simple and usually good enough for small plans, but is badly wrong for dense or clustered neighborhoods.", "Single average degree vs per-type, per-label degree: finer degrees give better estimates and need more statistics to store and keep fresh."],
    p: ["Estimating a query on a supernode with the global average degree picks a plan that explodes at runtime.", "Compounding small errors across many hops produces estimates off by orders of magnitude."],
    v: "Run a profile on a three-hop pattern and compare estimated and actual rows at each operator, and confirm the estimate at the first operator is exact and later errors are within a documented ratio.",
    dep: ["graph-statistics", "logical-plan"]
  },
  "join-ordering": {
    s: "Chooses the order in which parts of a pattern are matched and combined, and whether to expand along relationships or join separately matched fragments.",
    d: "A pattern with several relationships can be matched left to right, right to left, or from the middle, and independent fragments can be matched separately then joined by a hash join. The optimizer enumerates connected sub-patterns with dynamic programming for small queries and falls back to heuristics for large ones, scoring each by estimated rows processed. Starting from a selective node and expanding outward is usually best. The hard part is the search space growing quickly with pattern size.",
    k: ["Exhaustive dynamic programming vs greedy heuristics: exhaustive finds the cheapest plan for up to a dozen pattern elements, but its cost explodes beyond that, where greedy is fast and sometimes poor.", "Expand-only plans vs allowing joins of fragments: expand-only uses direct pointers and low memory, while joins win when two selective ends meet in a dense middle."],
    p: ["A long pattern exceeds the exhaustive limit and gets a greedy plan starting from the wrong end.", "Planning time itself becomes significant for queries that run for only milliseconds."],
    v: "Explain a pattern with a highly selective filter at its far end and confirm the plan starts there and expands toward the unselective side, with actual rows an order of magnitude lower than the reverse order.",
    dep: ["cardinality-estimation", "logical-plan", "anchor-selection"]
  },
  "anchor-selection": {
    s: "Chooses the node or set of nodes where matching starts, using an index seek, a label scan or an identifier lookup, since every later step depends on this starting set.",
    d: "Traversal is cheap once it has a starting node, so the planner looks for the pattern element with the smallest estimated set: a node given by identifier, a unique property lookup, a range seek in an index, a label scan, or in the worst case a scan of every node. It compares each candidate's estimated rows against the cost of expanding from it. If no usable index exists, the planner has no choice but a scan, which makes missing indexes the largest cause of slow queries.",
    k: ["Seek on a selective index vs scan a smaller label: a seek is cheap when the value is rare, while a scan of a tiny label can beat an index lookup returning most of the table.", "Multiple anchors with a join vs one anchor and expand: two anchors meeting in the middle can shrink the work, with extra join cost and memory."],
    p: ["A property filter wrapped in a function, such as a lowercase comparison, cannot use the index and forces a full label scan.", "A parameter type mismatch, such as string versus number, silently disables the seek."],
    v: "Run a lookup by an indexed property and confirm the plan shows an index seek with one actual row read, then drop the index and confirm it changes to a label scan reading every node of the label.",
    dep: ["property-index", "label-scan-index", "graph-statistics", "cardinality-estimation"]
  },
  "plan-cache": {
    s: "Stores compiled plans keyed by normalized query text, so repeated queries skip parsing and planning, and invalidates them when statistics or schema change.",
    d: "Planning is expensive relative to a short query, so the first run produces a plan that is stored under the normalized text and parameter types. Later runs reuse it. Entries expire when statistics change enough that a better plan may exist, when an index or constraint is added or dropped, or when the cache fills and evicts the least recently used. Replanning is deliberately delayed to avoid thrashing. The danger is a plan chosen for one parameter value being reused for very different ones.",
    k: ["Cache by normalized text vs plan every time: caching saves milliseconds on each run for high-frequency queries, but risks serving a plan that no longer fits the data.", "Replan on a data-change threshold vs on every change: thresholds avoid planning storms on busy systems, but allow a stale plan to run for a while."],
    p: ["Queries with literals instead of parameters flood the cache with one-off entries and evict useful ones.", "A plan cached just after a restart, when statistics are empty, stays poor until the threshold is reached."],
    v: "Run the same parameterized query a hundred times with different values and confirm one cache entry with a hit count of ninety-nine, then add an index and confirm the entry is invalidated and replanned using it.",
    dep: ["query-parser", "graph-statistics", "schema-catalog"]
  },
  "explain-and-hints": {
    s: "Commands that show the chosen plan without running it, and annotations that let a user force an index, a start point or a join strategy when the planner chooses badly.",
    d: "Explain returns the operator tree with estimates, while a profiling form runs the query and adds actual counts. Hints name a specific index to use, a variable to start from, or a join to insert, overriding the cost-based choice for that query. They exist because estimates fail on skewed data. Hints are fragile: they bind a query to a physical design, so when the index is renamed or dropped, or data shifts, the hinted plan can fail or become the slow option.",
    k: ["Allow hints vs forbid them: hints rescue a production query immediately, but accumulate and freeze plans that would improve on their own.", "Hints as errors when unusable vs ignored: failing loudly exposes dropped indexes, while ignoring keeps queries running with an unnoticed plan change."],
    p: ["A hint added during an incident stays for years and blocks a later, better plan.", "Hinting an index that does not exist makes the query fail in production after a schema change."],
    v: "Force a start variable on a query and confirm the explain output shows the plan beginning there, results match the unhinted plan, and removing the index named in a hint yields a clear error.",
    dep: ["logical-plan", "join-ordering", "property-index"]
  },
  "expand-operator": {
    s: "The core graph operator: from each input node, follows its relationships, filtered by type and direction, and emits a row per relationship with the neighbor on the far end.",
    d: "For each incoming row the operator reads the node record, follows the pointer to its first relationship record and walks the chain, or reads the node's segment of a compressed array, checking type and direction and optionally filters on relationship properties. Each match produces an output row. Its cost is proportional to the number of relationships it inspects, not the size of the graph, which is why traversals stay fast as data grows. It becomes slow when it must inspect many relationships that it then discards for the wrong type.",
    k: ["Walk one mixed chain and filter vs separate chains by type and direction: a single chain is compact and simple, while grouped chains skip irrelevant types and cost more to maintain.", "Expand into a known node vs expand to find the node: an expand-into checks one specific neighbor by scanning the smaller side, which is cheaper than enumerating all neighbors."],
    p: ["Expanding by a rare relationship type from a node with millions of other types walks them all.", "Reading each neighbor's full record to check a label forces random disk reads."],
    v: "Profile an expand over a node with ten relationships of the wanted type among a thousand other and confirm database hits stay proportional to relationships inspected, not to graph size, doubling the graph without changing hits.",
    dep: ["adjacency-chains", "relationship-store", "node-store", "page-cache", "dense-node-storage"]
  },
  "multiway-intersection": {
    s: "A join that finds nodes satisfying several relationship constraints at once by intersecting sorted neighbor lists, which keeps cyclic patterns such as triangles from exploding.",
    d: "Matching a triangle by expanding one edge at a time can produce far more intermediate rows than final results. A multiway join instead binds one variable at a time and picks its candidates by intersecting the sorted neighbor lists of all already-bound neighbors that constrain it. The work is bounded by the output size rather than by intermediate blowup. It requires adjacency available in sorted order, which suits compressed arrays better than pointer chains, and it needs the planner to recognize cycles in the pattern.",
    k: ["Worst-case optimal join vs pairwise expansions: intersection avoids the intermediate explosion in cyclic patterns, but needs sorted adjacency and a planner that detects cycles.", "Intersect sorted lists vs probe a hash set: sorted merge uses no extra memory and works well on large lists, while hashing helps when one side is tiny."],
    p: ["Pointer-chain storage with unsorted neighbors makes the intersection require a sort first, losing the advantage.", "The planner does not detect the cycle and falls back to pairwise expansion on a triangle query."],
    v: "Count triangles on a dense graph both with pairwise expansion and with intersection, and confirm identical counts with the intersection plan processing far fewer intermediate rows and running faster.",
    dep: ["expand-operator", "adjacency-chains", "logical-plan"]
  },
  "hash-join": {
    s: "Combines two independently produced row streams on a shared variable by building a hash table of one side and probing it with the other.",
    d: "When two pattern fragments are matched separately, for example from two selective anchors, their rows are joined on the shared node. The smaller input builds a table keyed by the node identity, and the other streams past it. Variants handle optional matches by emitting unmatched rows with nulls. If the build side exceeds its memory grant the operator partitions both sides and spills to disk. It makes sense when both sides are highly selective and the connecting region is dense; otherwise expand is cheaper.",
    k: ["Hash join vs nested expansion: hashing is better when both sides are small and the middle is dense, while expansion wins when one side's rows can seek directly into the other.", "Build on the estimated smaller side vs always the left: building on the smaller input saves memory, but a wrong estimate builds on the larger one."],
    p: ["A mis-estimated build side holds hundreds of millions of rows in memory and spills heavily.", "Joining on a node with many duplicates in the build side multiplies output beyond expectations."],
    v: "Run a query matching two fragments at selective anchors, profile it, and confirm the join builds on the smaller side, output rows equal the expected count, and a forced low memory grant triggers spilling with identical results.",
    dep: ["memory-and-spill", "join-ordering", "batched-execution"]
  },
  "traversal-frontier": {
    s: "The set of nodes reached so far and still to be expanded during a multi-hop search, with a visited set that prevents re-expanding nodes and cycling forever.",
    d: "Breadth-first traversal holds the current frontier, expands every node in it to produce the next one, and records visited nodes so each is expanded at most once. Representation matters: a bitmap over node ids is compact for large frontiers, a list for small ones, and many engines switch between them depending on frontier size. Depth-first traversal uses a stack and little memory, and returns paths. Frontier growth is the key cost driver, since in well-connected graphs it reaches a large share of the graph within a few hops.",
    k: ["Breadth-first vs depth-first: breadth-first finds shortest paths and bounded depth results but needs memory for the whole frontier, while depth-first uses little memory and may go deep unproductively.", "Bitmap vs list for the visited set: bitmaps give constant-time membership in tiny space for dense ids, but cost memory proportional to the id range."],
    p: ["Missing visited tracking on a cyclic graph makes traversal loop or revisit nodes exponentially often.", "A frontier covering most of the graph at hop three exhausts memory for queries that asked for six hops."],
    v: "Traverse to depth six from a node in a graph with known reachable counts per depth, and confirm each node is expanded once, counts per depth match, and peak frontier size is reported and within the memory grant.",
    dep: ["expand-operator", "memory-and-spill"]
  },
  "batched-execution": {
    s: "Passes rows between operators in groups of hundreds or thousands instead of one at a time, reducing per-row overhead and enabling prefetching of the records the next step needs.",
    d: "Operators pull or push chunks of rows through the plan. Within a chunk, an expand can collect all the node ids it will visit and sort or prefetch the page accesses, turning scattered reads into ordered ones and overlapping disk latency. Per-row function calls and virtual dispatch costs are amortized. Chunk size balances cache efficiency and latency to first row. Compared with row-at-a-time, the code is more complex, and early termination such as a limit must stop work already queued in the chunk.",
    k: ["Batched vs row-at-a-time execution: batches cut per-row overhead and enable prefetching, but add latency to first results and complicate operators.", "Large vs small batch size: large batches amortize better and risk spilling out of the processor cache, while small ones keep data hot but spend more on overhead."],
    p: ["A limit of one still computes a full chunk of a thousand expansions first.", "Non-uniform fan-out makes one chunk balloon into millions of output rows."],
    v: "Run an expansion-heavy query with batch sizes of one and one thousand and confirm identical results and a measurable drop in elapsed time and page cache lookups per row with the larger batch.",
    dep: ["expand-operator", "page-cache"]
  },
  "path-uniqueness": {
    s: "The rule that decides whether a path may repeat nodes or relationships, enforced during traversal so cycles do not produce unbounded or duplicate results.",
    d: "Common semantics are no repeated relationship within one pattern match, which allows revisiting nodes, or no repeated node, which gives simple paths. Enforcement tracks the relationships already used by the current partial path and rejects an expansion that would repeat one. Some engines offer walks, which allow anything, and trails or simple paths as options. The semantic chosen changes both answers and cost, and the standardized query language defines modes to make the choice explicit.",
    k: ["Relationship-unique vs node-unique matching: relationship uniqueness is cheaper to check and gives more results, while node uniqueness matches intuitive paths and is costlier.", "Per-path state vs a global visited set: per-path tracking is required to enumerate all paths, while a global set is only valid for reachability."],
    p: ["Assuming no repeated nodes when the engine only forbids repeated relationships returns paths that loop through a node.", "Per-path uniqueness bookkeeping grows memory with every concurrent partial path."],
    v: "On a graph with a triangle, match a path of length three from one corner and confirm relationship-unique semantics returns the loop back to start while node-unique semantics does not, per the documented rule.",
    dep: ["expand-operator", "variable-length-paths"]
  },
  "memory-and-spill": {
    s: "Tracks memory used by each query's operators against a budget, and spills sort, hash and aggregate state to disk, or aborts the query, when the budget is exceeded.",
    d: "Each query gets a memory pool from which operators draw for hash tables, sort buffers, collected lists and traversal frontiers. A tracker counts allocations and, at the limit, either spills to temporary files or terminates the query with an out-of-memory error rather than harming others. Spilling operators partition data and process it piecewise. Traversal state, such as path sets, is harder to spill because it is mutated randomly, so those queries are simply bounded and cancelled.",
    k: ["Spill to disk vs fail the query: spilling lets large analytical queries finish slowly, while failing fast protects the machine and surfaces bad queries sooner.", "Per-query budget vs one shared pool: per-query limits isolate tenants, but shared pools use memory more efficiently with the risk of one query starving others."],
    p: ["Memory accounted only for operator state misses result buffers, and the process still runs out.", "Spilled data written to a small temp volume fills it and breaks unrelated queries."],
    v: "Run an aggregation larger than its memory grant and confirm it completes via spilling with correct results while temp files are created and removed, and that a query exceeding the hard limit is aborted with a clear error.",
    dep: ["resource-governor"]
  },
  "parallel-execution": {
    s: "Runs one query's operators on several threads by splitting input, such as ranges of node ids or batches of rows, and merging the results.",
    d: "Parallelism can be inter-query, running different queries on different threads, or intra-query, splitting a single scan or expansion across workers. A scheduler hands morsels, small ranges of work, to threads as they become free, which balances uneven work. Operators with shared state, such as hash tables or visited sets, need concurrent structures or per-thread partitions merged at the end. Graph workloads are hard to parallelize evenly: a worker given a supernode does far more work than the others.",
    k: ["Morsel-driven dynamic scheduling vs static partitioning: dynamic scheduling balances uneven work, but adds scheduling overhead and makes memory use less predictable.", "Per-thread visited sets vs a shared concurrent set: per-thread sets avoid contention, but may repeat work across threads before merging."],
    p: ["One morsel containing a supernode runs alone for minutes while other threads sit idle.", "Parallel writes in one transaction contend on locks and run slower than a single thread."],
    v: "Run a full-label aggregation with one and with eight workers and confirm identical results with near-linear speedup on the scan, then confirm a skewed expansion reports its slowest worker's share of the time.",
    dep: ["batched-execution", "degree-skew"]
  },
});
