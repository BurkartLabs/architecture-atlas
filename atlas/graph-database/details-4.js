// Details for the graph database plate, part 4: indexes and caching, distribution, operations.
ATLAS.details("graph-database", {
  "property-index": {
    s: "An ordered structure mapping property values on nodes or relationships of a label or type to their ids, used to find starting points by equality or range.",
    d: "Typically a balanced tree keyed by value with record ids as entries, scoped to one label and property. It serves equality, range and prefix lookups and ordered output. It is kept transactionally current: each write that changes an indexed value updates the tree and the log records the change. Uniqueness constraints reuse it. Its main value in a graph is not speeding up traversal, which needs no index, but finding where a traversal begins, so it has a large effect on plan quality.",
    k: ["Index per label and property vs one general index: scoped indexes are small and precise, but every new access path needs its own, adding write cost.", "Tree index vs hash index: trees support ranges and ordering, while hashes are faster for pure equality and cannot order."],
    p: ["Too many indexes slow every write to those labels and consume memory that the page cache needs.", "An index on a low-selectivity property is chosen by the planner and is no better than a scan."],
    v: "Create an index on a property, run an equality lookup, and confirm the plan uses an index seek and reads only matching records, then update the property and confirm the old value no longer finds the node.",
    dep: ["page-cache", "token-dictionary", "write-ahead-log"]
  },
  "label-scan-index": {
    s: "A structure listing all nodes that carry each label, so a query starting from a label can enumerate its members without reading the whole node store.",
    d: "A compact map from each label to the set of node ids having it, commonly a bitmap or ordered id list per label. Scans of a label read it sequentially. It is updated on every label change. Without it, finding all people would read every node record. It also gives exact counts per label for the statistics, and supports fast intersections when a query requires two labels. For a label covering most nodes, the structure adds little over a full scan, but it matters for rare labels.",
    k: ["Maintain a label scan index vs scan the node store: the index makes rare labels cheap to enumerate, while a full scan avoids write overhead and suits graphs with few labels.", "Bitmap vs sorted id list: bitmaps are compact for dense labels and fast to intersect, while lists are cheaper for rare labels."],
    p: ["Label changes on millions of nodes rewrite large portions of the structure in one transaction.", "Querying with no label scans every node even when a label would have narrowed it."],
    v: "Create ten nodes with a rare label among a million, run a label query, and confirm the plan reads about ten entries, not a million node records, and that removing a label updates the result immediately.",
    dep: ["node-store", "nodes-and-labels"]
  },
  "relationship-type-index": {
    s: "An index of relationships by type, optionally with properties, so queries that start from a kind of relationship can find them without traversing from nodes.",
    d: "Most traversals start at nodes, but some questions start with relationships: all transfers above a threshold, all edges of a type created yesterday. The index maps a type, and optionally a property value, to relationship ids with their endpoint nodes, so the plan starts at the relationship and then looks at its nodes. It is maintained per write. It also speeds counting relationships by type. It costs write throughput and space in proportion to the number of relationships, which are usually the most numerous elements.",
    k: ["Index relationships by type and property vs traverse from nodes: indexing makes relationship-first queries fast, but multiplies the work of every relationship write.", "Index only selected types vs all types: selective indexing limits cost, while indexing all enables flexible exploration."],
    p: ["Indexing a relationship type with billions of instances adds large write amplification during bulk loads.", "A planner that starts from relationships on a non-selective type reads everything."],
    v: "Index a relationship property, query for relationships with a rare value, and confirm the plan seeks into the index and reads only matching relationships and their two end nodes.",
    dep: ["relationship-store", "property-index"]
  },
  "composite-index": {
    s: "An index over several properties of one label at once, ordered by the first, used for queries that filter or sort on a combination of fields.",
    d: "Keys concatenate the property values in a declared order, so the index serves queries that give equality on a prefix of the properties and optionally a range on the next. Properties after a range cannot narrow further. Order of the columns matters, which makes the choice a design decision: put equality columns first and the range column last. A composite index can answer a query entirely by itself when all returned properties are in it, avoiding any read of the property store.",
    k: ["Composite index vs several single-property indexes: one composite is precise for multi-field filters, while separate indexes serve more query shapes and need intersections.", "Covering the returned fields vs only the filter fields: covering avoids property reads, at the cost of a larger index and higher write overhead."],
    p: ["Declaring the columns in the wrong order leaves the common query unable to use the index.", "A composite index that is never used still slows every write to its label."],
    v: "Create an index on two properties, run a query filtering the first by equality and the second by range, and confirm one seek handles both, while a query filtering only the second does not use it.",
    dep: ["property-index"]
  },
  "full-text-index": {
    s: "An inverted index over text properties that supports word and phrase search with relevance ranking, tokenization and language-aware normalization.",
    d: "Text is split into terms by an analyzer that lowercases, removes punctuation, applies stemming and optionally removes common words, and each term maps to the nodes or relationships whose property contains it. A query is analyzed the same way and returns matches with a score. It is usually updated near-real-time rather than synchronously, so a newly written node may not appear immediately. It complements the graph: text search finds an entry node by words and traversal then explores from there.",
    k: ["Eventually consistent updates vs synchronous updates: asynchronous indexing keeps write latency low, but searches briefly miss recent writes.", "Per-language analyzers vs one generic analyzer: language-aware analysis improves matching and needs configuration per property, while a generic one is simple and misses inflections."],
    p: ["A search immediately after a write returns nothing and is mistaken for data loss.", "Using different analyzers at index and query time makes obviously matching text not match."],
    v: "Write a node whose text contains a phrase, wait for the refresh interval, search for a stemmed variant of a word from it, and confirm the node is returned with a score above one from an unrelated node.",
    dep: ["property-store", "write-ahead-log"]
  },
  "spatial-index": {
    s: "An index over point or shape properties for queries by distance, bounding box or containment, using space-filling curves or tree structures over coordinates.",
    d: "Points are mapped to a one-dimensional key through a space-filling curve or inserted into a spatial tree, so that nearby locations have nearby keys and a query for a region becomes a small set of ranges over an ordered index. Distance queries first use the index to find candidates within a box, then compute exact distances to filter. Coordinate systems must match between data and queries. Combining with traversal gives questions such as which of my friends are within five kilometers.",
    k: ["Space-filling curve over an ordered index vs a dedicated spatial tree: curves reuse the ordinary tree machinery and are simple, while spatial trees fit shapes and uneven density better.", "Approximate candidates plus exact filtering vs exact index results: candidate filtering is fast and needs a second pass to be correct."],
    p: ["Mixing coordinate systems between data and queries returns plausible but wrong results.", "Queries spanning the antimeridian or poles return nothing if the index does not handle wraparound."],
    v: "Insert points at known distances from a center, query within a radius, and confirm exactly the points inside return, including one just inside and none just outside, matching a brute-force calculation.",
    dep: ["property-index", "property-values"]
  },
  "online-index-build": {
    s: "Builds a new index while the database keeps serving writes, by scanning existing data in the background and merging concurrent changes, then switching it to online.",
    d: "On creation the index enters a populating state. A scan reads existing nodes or relationships and inserts entries in bulk, while every concurrent write is also recorded and applied to the index so none is missed. When the scan finishes and the backlog drains, the index is validated, for uniqueness if needed, and marked online, at which point the planner may use it. The index must not be used while populating, and a failure leaves a failed state needing a drop and retry. Large builds compete with foreground work for I/O.",
    k: ["Build online vs offline: online keeps the database available, while offline is simpler and faster and needs downtime.", "Apply concurrent writes during the scan vs rescan after: applying concurrently converges quickly, but requires careful handling of changes to records already scanned."],
    p: ["A unique index built over data that has duplicates fails only at the end, hours later.", "Queries planned before the index is online ignore it, and the planner is not forced to replan afterward."],
    v: "Create an index on a million nodes while a writer continues inserting, wait for online, and confirm index entries equal a scan count including the nodes inserted during the build.",
    dep: ["property-index", "schema-catalog", "transaction-manager"]
  },
  "page-cache": {
    s: "A memory pool of fixed-size pages of the store files, with its own eviction, that serves nearly all reads and writes and flushes dirty pages in the background.",
    d: "Every store and index read goes through the page cache, which maps file pages to memory frames, pins a page while in use and writes back dirty pages at checkpoints. Managing it directly, rather than relying on the operating system's cache, lets the database control flushing order for durability and tune eviction to its access patterns. Traversals are random access, so the ratio of cache size to hot data decides whether a hop is a nanosecond memory read or a millisecond disk read.",
    k: ["Own page cache vs operating system cache: its own cache controls flush ordering and avoids double buffering, but takes memory configuration from the operator and needs careful tuning.", "Large cache and small heap vs balanced: caching more of the graph speeds traversals, while heap pressure from big results needs room."],
    p: ["A cache sized smaller than the hot set thrashes, and every traversal slows by orders of magnitude.", "Memory split wrongly between cache and query heap leads to out-of-memory failures despite free machine memory."],
    v: "Run a traversal workload with the cache larger than the data and then with a quarter of it, and confirm cache hit ratio and latency in the metrics show the difference, with faults per second rising sharply in the second.",
    dep: ["eviction-policy"]
  },
  "adjacency-cache": {
    s: "A cache of decoded neighbor lists for frequently traversed nodes, avoiding repeated chain walks and record decoding on hot paths.",
    d: "On top of raw pages, some engines keep a map from a node, type and direction to a ready array of neighbors, built the first time it is needed and used for later expansions. It speeds repeated traversals of popular nodes. It must be invalidated or updated when relationships change, which adds complexity and a consistency risk, and it uses heap memory that competes with queries. Many designs skip it because the page cache already makes chain walks fast enough, and rely on compressed arrays instead.",
    k: ["Object cache of neighbor lists vs only the page cache: decoded lists save repeated work on hot nodes, but need invalidation and use memory outside the page cache.", "Cache the whole list vs cache a bounded prefix: whole lists make supernodes huge, while prefixes are bounded and cannot answer complete expansions."],
    p: ["A missed invalidation after a relationship delete returns a neighbor that no longer exists.", "Caching a supernode's whole list takes more heap than the query budget allows."],
    v: "Expand a hot node repeatedly, delete one of its relationships, expand again, and confirm the deleted neighbor no longer appears while earlier expansions hit the cache, as shown by the hit counter.",
    dep: ["adjacency-chains", "page-cache"]
  },
  "result-cache": {
    s: "Stores the results of expensive read queries keyed by text and parameters, serving repeated requests without execution until the underlying data changes or a timeout passes.",
    d: "A result cache is useful for dashboards and recommendations that ask the same question many times. Keys combine the normalized query, parameters and the user's access scope, and entries record which labels and relationship types they read, so a write to any of them invalidates the entry. Coarse invalidation is safe and clears entries often on busy graphs. A time-to-live bounds staleness when exact invalidation is too costly. It must never serve a result to a user who lacks access to part of it.",
    k: ["Invalidate on any relevant write vs time-based expiry: write-based invalidation never serves stale data and clears often, while time-based expiry is simple and returns slightly old answers.", "Cache in the database vs in the application: database caching sees writes and security context, while application caching is flexible and can't know when data changed."],
    p: ["A cache keyed without the user's access scope shows one user another's restricted results.", "Frequent writes keep invalidating entries so the cache costs memory and never hits."],
    v: "Run a read query twice and confirm the second hit is served from the cache with zero database hits, then write to a label the query reads and confirm the next run executes and returns the new result.",
    dep: ["access-control", "plan-cache"]
  },
  "cache-warm-up": {
    s: "Loads the store files into the page cache after a start or restart, before traffic arrives, so the first queries do not each pay for cold disk reads.",
    d: "After a restart the cache is empty and the first traversals run at disk speed. Warm-up reads the node and relationship files, or just the pages that were hot, into memory in sequential order, which is much faster than letting random queries fault them in. Some systems save the list of cached pages at shutdown and reload exactly those. A replica should be warmed before it is put into rotation. Loading everything is pointless when the graph is larger than memory.",
    k: ["Warm everything vs replay the saved hot page list: warming all pages is simple but wasteful when the store exceeds memory, while the saved list is precise but can lag the real workload.", "Warm before accepting traffic vs concurrently: warming first avoids slow early queries and delays availability, while concurrent warming serves slowly and recovers faster."],
    p: ["A rolling restart brings nodes back cold and the cluster serves slow queries during each step.", "Warm-up of a store larger than memory evicts its own pages and wastes minutes."],
    v: "Restart the server, measure latency of a standard traversal workload with and without warm-up, and confirm the warmed run has a cache hit ratio near the steady state from the first query.",
    dep: ["page-cache", "node-store", "relationship-store"]
  },
  "eviction-policy": {
    s: "The rule that picks which cached pages to drop when the cache is full, balancing recency and frequency so one big scan does not throw out the hot working set.",
    d: "Plain least-recently-used eviction is vulnerable to scans: a full label scan touches every page once and pushes out the hot pages. Policies track both recency and frequency, or give scan-read pages a low priority so they are dropped first. Dirty pages cannot simply be dropped; they must be written first, so the evictor coordinates with the flusher. Graph workloads mix tiny random lookups with occasional large analytic scans, which is exactly the case where a naive policy fails.",
    k: ["Recency only vs recency and frequency: recency is simple and fast, while frequency awareness protects the hot set from scans and costs extra bookkeeping.", "Evict dirty pages on demand vs flush ahead: flushing ahead keeps eviction cheap and uses idle I/O, while on-demand flushing stalls the query that needed the frame."],
    p: ["One analytical full scan evicts the hot pages and transactional latency spikes for minutes after.", "Eviction blocked by many dirty pages stalls all queries until the flusher catches up."],
    v: "Warm a hot working set, run a full-store scan, then rerun the hot workload and confirm its hit ratio recovers immediately instead of dropping, as the policy keeps the frequently used pages.",
    dep: ["page-cache"]
  },
  "replication": {
    s: "Copies committed changes from a primary to other servers by shipping the transaction log, so reads can scale and the database survives the loss of a machine.",
    d: "Followers pull or are pushed log batches in commit order and apply them to their own stores. Synchronous modes wait for a quorum to confirm before acknowledging a commit, while asynchronous modes acknowledge immediately and risk losing the most recent commits on failover. Followers expose how far behind they are. Because commands are logical, replicas apply them to their own physical layout, which can differ. A consensus protocol, not ad hoc coordination, decides which log is authoritative.",
    k: ["Synchronous quorum commit vs asynchronous replication: quorum commit survives failover with no loss and adds a network round trip to each commit, while asynchronous is faster and can lose acknowledged writes.", "Ship the log vs ship store files: log shipping is incremental and continuous, while file copy is simple and suits initial seeding."],
    p: ["Failing over to an asynchronous replica that was behind silently drops acknowledged commits.", "A replica that falls too far behind needs a full store copy because the log was pruned."],
    v: "Commit a transaction on the primary with quorum mode on, kill the primary immediately, and confirm the new leader contains it, while repeating with asynchronous mode shows the window in which it may be absent.",
    dep: ["write-ahead-log", "leader-election", "transaction-manager"]
  },
  "leader-election": {
    s: "A consensus protocol that picks one writer for each database among replicas, keeps agreement on the log, and replaces the writer when it fails.",
    d: "Servers vote by term and a candidate with the most up-to-date log and a majority of votes becomes leader. The leader orders writes and replicates them; a commit counts once a majority has stored it. If the leader is unreachable for a timeout, an election begins. A server cut off from the majority must stop accepting writes, or two leaders could diverge. Elections take seconds, during which writes fail, so drivers must retry. Cluster size is odd, so a majority can always form.",
    k: ["Majority consensus vs a single primary with manual failover: consensus fails over automatically and safely, while manual failover is simpler and slow and error-prone under pressure.", "Short election timeout vs long: short timeouts recover fast and cause needless elections on network blips, while long ones tolerate hiccups and extend outages."],
    p: ["A two-server cluster cannot form a majority after one failure, so it stops accepting writes.", "Clock pauses or long garbage collection pauses on the leader trigger elections and flapping."],
    v: "Isolate the current leader from the other two servers and confirm a new leader is elected within the timeout, the isolated one stops accepting writes, and after healing it rejoins as a follower with no divergent log.",
    dep: ["replication"]
  },
  "read-replicas": {
    s: "Servers that apply the log and serve read queries only, scaling read throughput and placing data near readers, with an understanding that they may lag behind the writer.",
    d: "A replica applies the same commands from the leader without taking part in the write quorum, so it does not slow commits. Routing sends reads to replicas and writes to the leader. Lag means a client may not see its own recent write; bookmarks let a client ask for a replica that has applied at least a given transaction. Replicas have their own page caches, so different replicas can be dedicated to different workloads, such as analytics, without disturbing transactional traffic.",
    k: ["Read your own writes via bookmarks vs always read from the leader: bookmarks allow replica reads with causal consistency, while leader reads are simplest and limit scale.", "Dedicate replicas to analytics vs share them: dedication isolates heavy scans and caches, while sharing uses capacity better."],
    p: ["A user saves a record and immediately reads a stale page from a lagging replica.", "A long analytic query on a replica delays log application and increases lag for everyone it serves."],
    v: "Write on the leader, take the returned bookmark, read from a replica with it, and confirm the read waits until the write is applied and returns it, while a read without a bookmark may miss it.",
    dep: ["replication", "wire-protocol", "page-cache"]
  },
  "graph-partitioning": {
    s: "Divides the nodes and relationships of one logical graph across machines, trying to place connected nodes together so that traversals mostly stay on one shard.",
    d: "Hash partitioning spreads nodes evenly and cuts most relationships, because neighbors land on different shards at random. Partitioning by a domain key, such as a tenant or region, keeps related data together when the domain aligns with queries. Graph-aware partitioners minimize the number of cut relationships while balancing load, and need a full view of the graph and periodic rework. No partitioning is good for all queries, since a graph has no natural boundaries, which is why many deployments stay on one machine.",
    k: ["Hash partitioning vs partitioning by domain key: hashing balances load and makes almost every traversal cross shards, while a domain key keeps most traversals local and risks uneven shards.", "Replicate boundary nodes vs fetch on demand: replication makes crossings cheaper to read and costly to keep consistent."],
    p: ["Partitioning by a key unrelated to access patterns makes every multi-hop query a distributed one.", "A hot tenant fills a single shard while the others sit idle."],
    v: "Partition a graph with a known community structure by hash and by community, run the same traversal workload on each, and confirm the fraction of relationships crossing shards and the cross-shard calls per query are far lower in the second.",
    dep: ["shard-routing", "degree-skew"]
  },
  "shard-routing": {
    s: "Directs each query or part of a query to the shards that hold the data it needs, using a directory of which shard owns which nodes.",
    d: "A router receives a query, determines from the partition key or an identifier lookup which shards are involved, sends sub-queries and combines results. Directory information is cached by routers and refreshed when shards move. A query that names an entity by its key goes to one shard, while one that scans a label goes to all of them. Routing also covers write forwarding to each shard's leader. A stale directory sends requests to the wrong place, so shards must redirect or reject them.",
    k: ["Central directory vs computed placement from the key: a directory allows arbitrary moves and is another component to scale and secure, while computed placement needs no lookup and is hard to rebalance.", "Router in the client vs a separate tier: client routing saves a hop, while a tier keeps clients thin."],
    p: ["A stale routing table sends writes to a shard that no longer owns the node.", "Queries without a partition key fan out to every shard and make the slowest one dictate latency."],
    v: "Run a keyed lookup and a label scan with query tracing on, and confirm the first touches one shard and the second touches all of them, and that moving a node's range updates the routing without client restarts.",
    dep: ["graph-partitioning", "wire-protocol"]
  },
  "distributed-traversal": {
    s: "Executes a multi-hop query across shards by shipping partial results to the shards that own the next nodes, batching crossings to hide network latency.",
    d: "When an expansion reaches a node on another shard, the executor sends the frontier ids for that shard in a batch, the shard expands them locally and returns neighbors or continues. Each hop that crosses a boundary adds a network round trip, which costs far more than a local pointer, so planners prefer plans with fewer crossings and push filters to the data. Join results must be merged and deduplicated at a coordinator. Intermediate results can balloon over the network before filters apply.",
    k: ["Ship the frontier to the data vs pull the data to the query: shipping frontier ids moves little and keeps work local, while pulling is simple and can drag whole neighborhoods across.", "Coordinator-driven hop by hop vs shard-to-shard pipelining: pipelining reduces round trips and complicates cancellation and memory control."],
    p: ["A six-hop query crossing shards at each hop takes seconds where a single machine took milliseconds.", "A query's frontier on a hub grows into millions of ids, flooding the network."],
    v: "Run a three-hop query on a sharded graph with tracing, and confirm the number of cross-shard batches is at most the number of hops, results equal a single-machine run, and total bytes shipped match the frontier sizes.",
    dep: ["shard-routing", "expand-operator", "traversal-frontier", "graph-partitioning"]
  },
  "supernode-handling": {
    s: "Techniques that keep nodes with millions of relationships from dominating storage, locking and query time: grouped chains, sorted indexes on the relationships and degree-aware plans.",
    d: "A celebrity or a category node can have orders of magnitude more relationships than the average. Remedies include grouping its relationships by type and direction, indexing them by a property so a traversal can seek, caching its degree, splitting it into several nodes in the model, and warning when a query expands it unfiltered. Writers contend on its lock, so some systems batch or shard its relationship list. The best fix is often modeling: replace one hub with time-bucketed nodes.",
    k: ["Fix in the model vs in the engine: remodeling by bucketing or time slicing removes the hub entirely, while engine-level grouping preserves the model and only softens the cost.", "Count from stored degree vs walk the list: stored degrees answer count queries at once, but each write must update the counter and can contend."],
    p: ["A query that expands every neighbor of a hub only to filter them returns after minutes.", "Every writer linking to a popular node queues on one lock and write throughput collapses."],
    v: "Insert a node with five million relationships of several types, run a typed expand with a property filter and a count query, and confirm both avoid walking the unrelated groups and finish within a stated budget.",
    dep: ["dense-node-storage", "lock-manager", "relationship-type-index", "cardinality-estimation"]
  },
  "rebalancing": {
    s: "Moves ranges of nodes between shards when load or size becomes uneven, keeping the graph consistent and available while data is copied and ownership switches.",
    d: "A rebalancer picks a range of nodes to move, copies it with its relationships to the target while the source keeps serving, streams changes made during the copy, then briefly pauses writes for that range and flips ownership in the directory. Relationships between moved and unmoved nodes become cross-shard, which changes query cost. Moves must be throttled to avoid starving foreground work. Because the graph cuts differently after each move, rebalancing for size can worsen locality.",
    k: ["Online range moves vs offline reshard: online moves keep the service up and cost complexity and extra load, while offline resharding is simple and needs a maintenance window.", "Balance by data size vs by request load: size balancing is stable and simple, while load balancing tracks hot spots and moves data more often."],
    p: ["A move that cuts a dense community in two quietly raises the cross-shard rate of every query touching it.", "Copy traffic during a move saturates the network and slows production reads."],
    v: "Move a range of one million nodes under steady read and write load and confirm no query errors beyond a brief retry window, counts before and after match, and the directory points to the new owner.",
    dep: ["graph-partitioning", "shard-routing", "replication"]
  },
  "access-control": {
    s: "Authenticates users and decides which operations and which parts of the graph each role may read, traverse or write, down to labels, relationship types and properties.",
    d: "Users authenticate against a built-in store or an external directory and receive roles. Privileges are granted on actions, such as read, write, schema changes, on a database, a graph or specific labels and types. Fine-grained rules can hide nodes or properties: a traversal simply does not see a forbidden element, which complicates counting, since paths through hidden nodes disappear. Enforcement lives in the executor and in procedures, and the result cache must respect it. Auditing records who did what.",
    k: ["Label-based rules vs only database-level permissions: label rules protect sensitive subgraphs within one graph, while database-level permissions are simple and require separate databases for separation.", "Hide elements silently vs raise errors: hiding keeps applications working across roles, while errors expose that something exists."],
    p: ["A fine-grained rule that hides a node still leaks it through counts, error messages or path lengths.", "A procedure running with elevated rights lets a restricted user read forbidden data."],
    v: "Grant a role access to one label only, then run a traversal that passes through another label and confirm the path is not returned, counts exclude the hidden nodes, and the denial is written to the audit log.",
    dep: ["wire-protocol", "schema-catalog"]
  },
  "backup-restore": {
    s: "Takes consistent copies of the store and log online, and restores them to a point in time, so data survives operator mistakes and disasters that replication also copies.",
    d: "An online backup copies store files while writes continue and then adds the log covering that period, so the restored copy is consistent after replay. Incremental backups copy only the log since the last one. A restore creates a new store and replays to a chosen position. Replication does not replace backup, because a bad delete replicates instantly. Backups should be encrypted and restored regularly in a test, since an untested backup is only a hope.",
    k: ["Online backup with log vs offline file copy: online backup needs no downtime and relies on correct log replay, while offline copy is simple and requires stopping the service.", "Full plus incremental vs frequent full: incrementals save space and time and lengthen restore, while full copies restore in one step and cost more."],
    p: ["Backups never test-restored turn out to be unusable on the day they are needed.", "Backing up only from a lagging replica silently omits recent data."],
    v: "Back up a running database under write load, restore to a separate server, and confirm the consistency checker passes and the node and relationship counts match the source at the recorded log position.",
    dep: ["write-ahead-log", "checkpointing", "consistency-checker"]
  },
  "consistency-checker": {
    s: "An offline or online tool that walks the stores to verify pointers, chains, counts and indexes agree with each other, and reports specific corrupt records.",
    d: "It reads every node, relationship and property record and checks invariants: each relationship appears in both endpoint chains, pointers reference in-use records, chain links are mutual, property chains terminate, tokens exist, and indexes contain exactly the entries the data implies. A full check is I/O heavy and reads the entire store, so it is often run on a backup copy. Findings name record ids and the rule violated. It does not repair; repair means restoring or rewriting records with great care.",
    k: ["Check a copy vs the live store: a copy gives a stable view without load on production, while checking live data finds problems earlier and may report false errors from concurrent changes.", "Full check vs sampled check: full checks prove integrity and take hours on large stores, while sampling is quick and can miss rare corruption."],
    p: ["Running a full check on the production disk during business hours starves queries.", "Assuming a clean report means the data is correct, when it only proves the structure is consistent."],
    v: "Deliberately break a next-relationship pointer in a copy of a small store, run the checker, and confirm it reports that record id and the broken chain, while the unmodified copy reports no errors.",
    dep: ["node-store", "relationship-store", "property-store", "property-index"]
  },
  "query-logging": {
    s: "Records executed queries with timing, row counts, memory, page cache activity and user, so slow or heavy statements can be found and attributed after the fact.",
    d: "Entries are written at query end, or at start and end, with the normalized text, parameters if enabled, elapsed time split into planning and execution, rows returned, bytes and page hits and faults, and the user and client. A threshold limits volume to slow queries. Sampling and redaction of parameters protect privacy. Page faults per query are the graph-specific signal: a traversal with many faults is limited by disk, not by processor. Logs feed monitoring and let developers tie a slow request back to the exact query.",
    k: ["Log parameters vs redact them: parameters make slow cases reproducible, while redaction keeps personal data out of logs with weaker access control.", "Log every query vs only slow ones: complete logs support workload analysis and cost write volume, while thresholds are cheap and miss high-frequency cheap queries."],
    p: ["A query that never finishes is never logged unless there is also a running-query view.", "Logging literals for every statement writes passwords and personal data to disk."],
    v: "Run a deliberately slow traversal over a cold cache and confirm one log entry appears with planning time, execution time, page faults greater than zero and the user, and that a fast query below the threshold does not.",
    dep: ["page-cache", "access-control"]
  },
  "metrics-monitoring": {
    s: "Exposes counters and gauges for transactions, page cache hit ratio, checkpoint duration, log size, replication lag, active queries and memory to external monitoring systems.",
    d: "Metrics are published in a standard text or push format and are scraped or sent to a collector. The most useful for a graph store are page cache hit and fault rates, which predict traversal latency, query counts and durations as histograms, checkpoint time and size, lock waits, replication lag by follower and per-pool memory use. Dashboards and alerts built on them catch memory pressure and lag before users notice. Metric cardinality must be controlled, since per-query labels explode the series count.",
    k: ["Pull-based scraping vs push: scraping gives the monitor control of frequency and detects dead targets, while push works through firewalls and short-lived processes.", "Histograms vs averages: histograms show tail latency, which matters for traversals with heavy tails, while averages are cheap and hide the slow queries."],
    p: ["Alerting on average latency misses a small share of queries that take minutes.", "Putting query text in metric labels creates unbounded series and overwhelms the monitor."],
    v: "Induce a cache shortage by shrinking the page cache, then confirm hit ratio falls, fault rate rises and the latency histogram's upper buckets fill in the exported metrics, and the configured alert fires.",
    dep: ["page-cache", "replication", "query-logging"]
  },
  "store-upgrade": {
    s: "Changes the on-disk format of an existing store to a newer version, either in place or by migrating to a new store, with backup, validation and a way back.",
    d: "New releases may change record layouts, token handling or index formats. A migration reads the old store and writes a new one, or rewrites files in place, and rebuilds indexes if their format changed. It runs offline for large format changes and rolling in clusters when versions can interoperate during the transition. A pre-upgrade backup and a post-upgrade consistency check are standard. A format change that widens pointers can double the store size and invalidate sizing assumptions.",
    k: ["In-place migration vs write a new store: in-place is quick and cannot be undone without a backup, while a new store is slower, needs space and leaves the original untouched.", "Rolling upgrade vs full cluster stop: rolling keeps service up and requires wire and log compatibility between versions, while a full stop is simple and means downtime."],
    p: ["Upgrading without a verified backup leaves no way back when the migration fails halfway.", "A rolling upgrade mixes versions whose log formats differ and breaks replication."],
    v: "Migrate a copy of a populated store to the new format, run the consistency checker, compare node, relationship and property counts with the source, and run a sample of queries expecting identical results.",
    dep: ["node-store", "relationship-store", "consistency-checker", "backup-restore"]
  },
  "resource-governor": {
    s: "Limits what any one query or user can consume: run time, memory, concurrent queries and transaction size, and can terminate a query that exceeds its allowance.",
    d: "Settings define a maximum query time, a per-query memory cap, a per-transaction memory limit and a bound on the number of concurrent queries or connections. The governor tracks consumption and aborts offenders with a descriptive error, often at a safe point inside an operator. Priorities or separate pools can protect transactional traffic from analytics. Traversal queries are the main risk because path counts can explode, so a time limit and a memory cap together are the minimum defense against an accidental unbounded pattern.",
    k: ["Hard limits that kill queries vs soft limits that only warn: hard limits protect the server, while warnings avoid surprise failures and rely on someone reading them.", "Limits per query vs per user: per-query caps catch a single runaway, while per-user quotas stop many small queries from adding up."],
    p: ["No default time limit means the first unbounded traversal ties up a server until restart.", "Limits that are too tight break legitimate batch jobs and push people to disable them."],
    v: "Run an unbounded path query with a memory cap and a time limit set, and confirm it is terminated with an error naming the exceeded limit, memory is released, and other queries keep their normal latency.",
    dep: ["memory-and-spill", "query-logging", "access-control"]
  },
  "multi-database": {
    s: "Hosts several independent graphs in one server or cluster, each with its own stores, log, schema and access rules, that can be started, stopped and backed up separately.",
    d: "A system database holds catalog information about users, roles and the list of databases. Each user database has separate store files and its own transaction log and can have a different replication layout. Queries run against one database at a time, and moving data between them requires an export or a federated query. This separates tenants and environments with strong isolation, but divides cache and memory. Starting, stopping and creating databases are administrative operations coordinated across the cluster.",
    k: ["Database per tenant vs shared graph with a tenant property: separate databases give isolation and simple per-tenant backup, while a shared graph uses resources efficiently and relies on query discipline.", "One cluster for many databases vs a cluster per database: sharing saves cost and couples failure, while separate clusters isolate and cost more."],
    p: ["Hundreds of small databases each carry fixed memory and log overhead that dominates the machine.", "Cross-database relationships are impossible, so a model split too early cannot be queried together."],
    v: "Create two databases, load different data into each, stop one, and confirm queries to the other continue unaffected and a user granted access to only one is denied on the other.",
    dep: ["schema-catalog", "access-control", "replication"]
  },
  "data-model-choice": {
    s: "The choice between property graph, triples with a vocabulary, or a relational mapping decides what can be said, indexed and inferred, and shapes every query written afterward.",
    d: "Modeling decides what are nodes, relationships and properties, and each choice sets the shape of every query and the cost of every traversal. A property graph is natural for connected application data. Triples suit data integration and shared vocabularies with inference. A relational layout suits tabular reporting. Changing the model after loading means rewriting data and queries. The model should follow the questions: things asked about as units become nodes, and connections traversed often become relationships, so that common questions are short patterns.",
    k: ["Model for the questions vs model the real world faithfully: a query-shaped model gives short, fast patterns, while a faithful one is reusable and makes some questions long.", "Normalized graph vs denormalized shortcuts: shortcut relationships make frequent queries cheap, but duplicate facts that must be kept consistent."],
    p: ["Copying the relational schema one-to-one produces a graph whose queries are just joins.", "Late discovery that an important question needs a different model forces a full reload."],
    v: "List the ten most important questions, write each as a pattern against the model, and confirm every one is expressed in a short pattern with an index-backed starting point and no pattern needing a full scan.",
    dep: ["property-graph-model", "relational-mapper", "schema-catalog"]
  },
  "traversal-locality": {
    s: "How close in storage and in memory the records touched by one traversal are: contiguous neighbors cost one page, scattered ones cost a page read each.",
    d: "Pointer-following is only cheap when the pointed-to record is in memory. A traversal's speed depends on how many distinct pages it touches and whether they are cached, so layout that places a node near its neighbors, or relationships near each other, has a large effect. Locality comes from insertion order, from partitioning by community, from compaction that reorders records and from sorted adjacency. It decays as data changes, so graphs benefit from periodic rewrite. On a cluster, locality means keeping traversals within one shard.",
    k: ["Insert in traversal order vs insert in arrival order: loading in an order that follows structure gives locality at the start, while arrival order is simple and scatters over time.", "Reorganize for locality vs leave as is: rewriting restores contiguity and costs offline time, while leaving keeps availability and slowly degrades."],
    p: ["A store loaded in random order has every hop landing on a different page, so cold traversals are far slower than benchmarks.", "Benchmarks on a freshly loaded store overstate performance after a year of churn."],
    v: "Time the same traversal on a store loaded in random order and on a copy rewritten in traversal order, both cold, and confirm pages touched and latency are lower in the second.",
    dep: ["adjacency-chains", "page-cache", "graph-partitioning"]
  },
  "memory-residency": {
    s: "How much of the graph must be in memory for traversals to be fast, which sets hardware size and drives cache tuning, partitioning and the choice of storage layout.",
    d: "A cached hop is orders of magnitude cheaper than an uncached one, so the working set determines the machine. The structure of the graph, node and relationship records and the indexes, usually has to fit; properties and large values can often stay on disk. Sizing starts from record sizes times counts, plus indexes, plus headroom for the query heap. When the graph does not fit, options are a bigger machine, partitioning or accepting disk-bound latency for cold regions. Memory use then determines cost more than any other factor.",
    k: ["Fit the structure in memory and leave properties on disk vs fit everything: structure in memory gives fast traversal at moderate size, while full residency also speeds property filters and costs far more.", "Scale up memory vs partition the graph: a bigger machine keeps traversals local and has a ceiling, while partitioning raises the ceiling and adds cross-shard cost."],
    p: ["Capacity planned from data size alone forgets indexes and query heap, and the working set misses memory.", "Gradual growth crosses the memory boundary and latency steps up suddenly with no code change."],
    v: "Compute expected record store sizes from counts, compare with the actual file sizes, then plot latency while shrinking cache size, and confirm the knee falls where the structure no longer fits.",
    dep: ["page-cache", "node-store", "relationship-store", "property-index"]
  },
  "degree-skew": {
    s: "Real graphs have a few nodes with enormous numbers of relationships and many with few, which breaks averages in estimation, concentrates locks and unbalances shards and parallel work.",
    d: "Degree distributions typically follow a heavy tail. This makes cardinality estimates from average degree wrong exactly where it matters, makes one traversal step explode when it lands on a hub, serializes writers on hub locks, makes shards uneven, and leaves one thread with most of a parallel job. Defenses appear in every layer: grouped storage, degree statistics, hub-aware plans, query limits, model changes such as bucketing, and partitioning that splits hubs. Ignoring skew works in testing with uniform data and fails in production.",
    k: ["Treat hubs as a special case vs ignore skew: special handling adds code in every layer, while ignoring it makes the first popular node a production incident.", "Test with realistic skewed data vs synthetic uniform data: skewed data finds the failures early and takes more effort to generate."],
    p: ["Load tests with uniformly random edges pass and miss every hub-related problem.", "A traversal with a filter applied after an expand on a hub is cheap in test and slow on real data."],
    v: "Generate a graph with a heavy-tailed degree distribution, run the standard query set, and confirm per-query latency, lock waits and shard sizes are reported for the top one percent of nodes separately from the rest.",
    dep: ["supernode-handling", "cardinality-estimation", "graph-partitioning", "lock-manager"]
  },
  "consistency-model": {
    s: "What guarantees applications get about reads and writes across servers: strong consistency through the leader and quorum, or eventual consistency on replicas, and how a client can ask for more.",
    d: "On a single server, transactions give the isolation level chosen. In a cluster, writes go through the leader and a quorum, so committed data is durable; reads from followers may lag and are consistent only up to their applied position. Causal bookmarks let a client require a replica to catch up. Sharded graphs add the question of transactions spanning shards, which require a coordination protocol with a cost, or are limited to one shard. These choices appear in driver settings, so developers need to know them.",
    k: ["Strong reads from the leader vs lagging replica reads: leader reads are always current and limit scale, while replica reads scale and require tolerance of staleness.", "Cross-shard transactions vs single-shard only: cross-shard transactions keep application code simple and cost coordination and latency, while single-shard transactions are fast and push integrity into the application."],
    p: ["An application assumes reads see its writes after routing to a replica and shows stale state.", "A cross-shard write interrupted midway leaves relationships pointing at nodes that were never created."],
    v: "Run a writer and a reader through different servers, confirm reads without bookmarks may show older data within the measured lag, and reads with the writer's bookmark never do.",
    dep: ["isolation-levels", "replication", "read-replicas", "transaction-manager"]
  },
  "scale-up-versus-scale-out": {
    s: "Whether to make one machine larger or split the graph across many: traversals favor a single large machine, while capacity and write throughput eventually force distribution.",
    d: "A single server keeps every hop local and offers simple transactions, and modern machines hold graphs of billions of relationships in memory. Replication adds read scale and availability without splitting data. Splitting the graph adds capacity and write throughput and makes traversals crossing shards slow and transactions harder. The sound order is to scale up first, replicate for reads, and partition only when the data or write rate demands it, preferably along a domain boundary that queries respect.",
    k: ["Scale up first vs design for sharding from the start: scaling up delays complexity and has a hard ceiling, while early sharding adds cost in every query before it may be needed.", "Replicate for reads vs shard for everything: replication scales read-heavy workloads cheaply, while sharding is the only route for write volume and data beyond one machine."],
    p: ["Sharding a graph that would have fit on one machine multiplies latency and operational burden.", "Scaling reads with replicas while writes grow leaves the leader as an unfixable bottleneck."],
    v: "Benchmark the target workload on one large server, on one server with replicas and on a sharded layout, and confirm the choice made is the least complex layout that meets the latency and throughput goals.",
    dep: ["replication", "graph-partitioning", "page-cache"]
  },
});
