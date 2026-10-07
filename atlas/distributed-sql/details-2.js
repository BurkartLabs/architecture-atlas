// Details for the distributed SQL plate, part 2: execution, SQL-to-key-value mapping, transactions.
ATLAS.details("distributed-sql", {
  "physical-plan-distribution": {
    s: "Decides which nodes run which parts of a plan, placing scans, filters and partial work on the nodes that lead the ranges being read.",
    d: "For each scan the planner resolves the key spans to ranges and their leaseholders, then groups spans by node. Processors for filtering, partial aggregation and joins are placed beside the scans, and a final stage on the gateway merges results. A cost threshold decides whether distribution is worthwhile at all, since for small queries the setup cost of remote flows exceeds the saving. The difficulty is that range boundaries and leases move during planning, so the plan is a best guess and the executing nodes must cope when data is elsewhere.",
    k: ["Distribute only above a threshold vs always: a threshold avoids setup cost on small queries; the estimate can wrongly keep a large query local.", "Planning by current leaseholder vs by replica locality: leaseholder planning gets consistent reads; a lease move makes the work remote after planning."],
    p: ["Planning from a stale range cache sends flows to nodes that no longer hold the data.", "Keeping a large aggregate local on the gateway makes one node the bottleneck for a cluster-wide query."],
    v: "Run a full-table aggregate on a multi-node cluster and confirm the plan shows scans on each node holding data, partial aggregates there, and only a small final merge on the gateway.",
    dep: ["range-cache", "cost-based-optimizer", "leaseholder"]
  },
  "flow-scheduler": {
    s: "Sets up, runs and tears down the remote processor graphs of a distributed query, limiting concurrency and cleaning up on cancel or failure.",
    d: "The gateway sends each remote node its portion of the plan as a flow specification. The node creates the processors, connects them with streams, and starts them. Inbound streams wait for peers with a timeout. Flows count against a per-node concurrency limit and memory budget, and queue when exceeded. Canceling a statement or a node failure must tear down flows everywhere. The hard part is failure: a single flow dying must fail the query promptly, and a gateway that vanishes must not leave remote flows running.",
    k: ["Queueing flows at a limit vs rejecting: queueing keeps throughput under load; a long queue adds latency invisibly to the client.", "Failing the whole query on a flow error vs retrying a flow: failing is simple and consistent; retry would need idempotent, restartable processors."],
    p: ["A lost cancel message leaves a flow consuming memory until its inbound timeout.", "Too many concurrent flows exhaust memory on a node while the gateway sees only one query."],
    v: "Start a large distributed query, kill the gateway, and confirm remote flows terminate within their timeout and the node's flow and memory counters return to baseline.",
    dep: ["physical-plan-distribution", "vectorized-engine"]
  },
  "vectorized-engine": {
    s: "Processes rows in column-oriented batches with tight loops per operator, reducing per-row overhead for scans, filters, joins and aggregates.",
    d: "Rows read from storage are decoded into batches of columns. Operators such as filter, projection, hash join and sort work on a whole batch, with type-specialized code and selection vectors to skip rows. Large operators track memory and spill to disk when over budget. A row-at-a-time engine remains for unsupported cases and the two interoperate through adapters. It is difficult because both engines must give identical results, including nulls and overflow, and because spilling needs the operator to stay correct when it can only hold part of its state.",
    k: ["Batch-at-a-time vs row-at-a-time: batches amortize overhead and use CPU caches better; they add code per type and complicate small, latency-sensitive queries.", "Spilling to disk vs failing at the memory limit: spilling completes big queries; it makes them slow and adds disk I/O on a node serving other work."],
    p: ["Differences in overflow or null handling between the engines produce different answers for the same query.", "A spilling sort on a busy disk slows foreground transactions on that node."],
    v: "Run a join and aggregate over data larger than the memory budget, and confirm results equal the row engine's output byte for byte, with spill counters above zero and the query completing.",
    dep: ["key-encoding"]
  },
  "distributed-joins": {
    s: "Joins tables spread over many ranges using lookup joins, hash joins on rows redistributed by key, or merge joins on ordered inputs.",
    d: "A lookup join takes rows from one side and issues key lookups into the other table's index, ideal when one side is small. A hash join redistributes both inputs across nodes by the join key so matching rows meet on the same node, then builds and probes. A merge join exploits existing order. Co-located joins avoid moving data when both tables are partitioned the same way. The optimizer picks among them by estimated row counts. It is hard because the exchange of rows is the dominant cost and skewed keys overload one node.",
    k: ["Lookup join vs hash join: lookups touch few rows and need no shuffle; thousands of lookups across regions are slower than one scan.", "Redistribute by hash vs broadcast the small side: broadcast avoids moving the large table; it fails when the small side is not actually small."],
    p: ["A single very common join key sends most rows to one node and stalls the query.", "A bad estimate chooses a lookup join over millions of rows and issues millions of remote requests."],
    v: "Join a ten-row table to a hundred-million-row table and confirm a lookup or broadcast plan runs in milliseconds; join two large tables and confirm a redistributing hash join uses every node roughly equally.",
    dep: ["physical-plan-distribution", "vectorized-engine", "index-keyspace"]
  },
  "distributed-aggregation": {
    s: "Computes grouped aggregates in two phases: partial aggregation next to the data on every node, then a final combine on fewer nodes.",
    d: "Each node scanning a range of the table aggregates its rows locally, producing one partial result per group. Partials are routed by group key to nodes that finalize them, or to the gateway when there are few groups. Aggregate functions must be decomposable: averages travel as sum and count, and distinct counts need either an exact set or an approximate sketch. The approach cuts network traffic from every row to every group. It is hard when groups are numerous, when state is large, and when functions are not decomposable.",
    k: ["Two-phase partial aggregation vs shipping raw rows: partials cut network volume when groups are few; with nearly unique groups they add work and no savings.", "Exact distinct sets vs approximate sketches: exact results are required for some uses; sketches use constant memory but are inexact."],
    p: ["Partial aggregation on a high-cardinality key doubles memory use without reducing rows.", "A non-decomposable custom aggregate is silently run on the gateway, pulling all rows."],
    v: "Group a billion rows into a thousand groups and confirm network bytes between nodes are about the partial state size, not the table size, and the totals equal a single-node computation.",
    dep: ["physical-plan-distribution", "vectorized-engine"]
  },
  "point-lookup-fast-path": {
    s: "Executes single-row reads and writes by key directly against one range, skipping planning of distributed flows and extra round trips.",
    d: "When a statement is a primary-key lookup or a single-row write with all values known, the gateway builds the key and sends one request to the range's leaseholder using the range cache. Cached plans, one-phase commit and avoided flow setup shorten the path to a few microseconds of local work plus one network round trip. Most OLTP traffic takes this path. It is hard because correctness requirements are unchanged: it must still check constraints, maintain every index and respect schema versions.",
    k: ["Special-case fast path vs one general executor: the fast path gives low latency to the dominant workload; a second code path must stay behaviorally identical.", "Caching the range location vs resolving each time: caching saves a lookup; a stale entry costs a redirect."],
    p: ["A fast path that skips a constraint check lets invalid rows in when a new constraint is added.", "Range cache misses after a split send each request to the wrong node first."],
    v: "Run a million single-row primary-key reads and confirm the median latency approaches one network round trip, with the statement stats showing no distributed flow and one range touched.",
    dep: ["range-cache", "leaseholder"]
  },
  "key-encoding": {
    s: "Turns column values into byte strings whose lexicographic order matches the SQL order of the values, so ordinary key ranges serve range queries.",
    d: "A key starts with a table identifier and an index identifier, followed by the encoded primary or index columns. Integers, strings, decimals, timestamps and nulls each have an order-preserving form, with descending columns inverted and terminators so that composite keys compare correctly. The value holds the remaining columns. Because order is preserved, a range scan or a prefix lookup is a contiguous key span. It is hard to evolve: encodings are persisted forever and any change must stay readable by older data.",
    k: ["Order-preserving encodings vs compact encodings: order preservation lets scans use key ranges directly; encodings are larger and costlier to decode.", "Table prefix in every key vs per-table keyspaces: a shared keyspace allows one ordered store and range model; every key repeats the prefix, which prefix compression recovers."],
    p: ["A collation or null-ordering change would reorder existing data without rewriting it.", "Very long string keys bloat indexes and slow comparisons."],
    v: "Encode a set of values of mixed types, including nulls and descending columns, sort the byte strings, and confirm the order equals the SQL ORDER BY result for the same values.",
    dep: []
  },
  "row-families": {
    s: "Groups columns of a row into separate key-value pairs, so rarely updated large columns do not rewrite small hot ones.",
    d: "By default all columns of a row live in one value under the row's key. A table can define families that store subsets of columns in separate values with the same key prefix plus a family number. Updating one family writes only that pair, and two transactions that update different families of one row need not conflict. Wide rows with large text next to counters benefit. It is hard to choose well: more families mean more pairs to read for a full row and more writes per insert.",
    k: ["One value per row vs multiple families: one value is cheap to read and write whole; a hot column rewrites everything and forces false conflicts.", "Few families vs many: few keep full-row reads quick; many reduce write amplification for narrow updates."],
    p: ["Splitting columns used together into different families makes every read fetch several pairs.", "Assuming families are independent transaction units; they still belong to one row and one transaction."],
    v: "Update a counter in a table whose large text column is in a separate family and confirm bytes written per update equal the counter's size, not the row's, and that concurrent updates to each family do not conflict.",
    dep: ["key-encoding"]
  },
  "index-keyspace": {
    s: "Stores each secondary index as its own sorted key span pointing back to the primary key, spread across ranges like any other data.",
    d: "An index entry has the indexed columns followed by the primary key, so entries are unique and ordered. Covering indexes also store extra columns to avoid a lookup back to the primary row. Inverted indexes map each element of a document or array to rows. Because index entries live in different ranges from the row, writing one row can touch several ranges and require a distributed transaction. Indexes speed reads but add a cross-range write for each one, and in a multi-region cluster each copy may be far from the row.",
    k: ["Covering indexes vs lookup back to the primary: covering avoids a second hop; the index is larger and rewritten when stored columns change.", "Many indexes vs few: many indexes serve more queries; every one adds write latency and a range to coordinate on commit."],
    p: ["An unused index still costs a cross-range write on every insert.", "An index on a monotonically increasing column creates a single hot range."],
    v: "Insert one row into a table with three indexes and confirm the trace shows one write per index, in the index's own range, committed atomically with the row.",
    dep: ["key-encoding", "ordered-keyspace"]
  },
  "uniqueness-and-fk-checks": {
    s: "Enforces unique and foreign-key constraints inside the writing transaction by reading the keys that would conflict, at the same isolation as the write.",
    d: "A unique index enforces itself because a duplicate would collide on the same key. Uniqueness that cannot be expressed as one key, such as uniqueness within a partition or across a hidden shard column, needs a check read of other possible locations. Foreign keys read the referenced row, locking it so it cannot be deleted before commit. These checks add reads to writes and must be ordered so the check sees the transaction's own changes. It is hard because checks across regions are slow and because a missed lock leaves a write-skew hole.",
    k: ["Checks inside the transaction vs deferred validation: inline checks are correct and simple; they add latency, sometimes across regions.", "Locking the referenced row vs only reading it: locking prevents a concurrent delete; it makes parent rows a contention point."],
    p: ["A uniqueness check done without a lock lets two concurrent transactions each insert a duplicate.", "A foreign key on a popular parent row serializes all child inserts."],
    v: "Run two concurrent transactions inserting the same unique value through a hash-sharded index and confirm exactly one commits, and the other fails with a uniqueness violation.",
    dep: ["index-keyspace", "serializable-isolation", "lock-table"]
  },
  "hash-sharded-indexes": {
    s: "Prefixes an index key with a hash of its value so that sequential inserts spread over many ranges instead of one.",
    d: "A sequential key such as a timestamp always writes to the last range of its index. A hash-sharded index adds a computed shard column, the hash modulo a bucket count, as the first key column, so consecutive values land in different buckets and therefore different ranges. Writes spread across nodes. Range queries now need to read every bucket and merge, and the bucket count is fixed at creation unless rebuilt. The choice trades write scalability for scan cost.",
    k: ["Hash prefix vs plain sequential key: hashing spreads writes across ranges; range scans must fan out to every bucket.", "More buckets vs fewer: more buckets spread load wider; scans and checks touch more ranges."],
    p: ["Too few buckets leave a hot range anyway once traffic grows.", "Queries that do not include the shard column in their predicates scan all buckets."],
    v: "Insert increasing timestamps at a high rate with and without sharding and confirm the hot range report shows one hot range without it and an even spread across nodes with it.",
    dep: ["index-keyspace", "hot-range-report"]
  },
  "row-id-generation": {
    s: "Produces unique primary key values without a central counter, using time and node-based identifiers or random UUIDs.",
    d: "A single incrementing counter would be a cross-cluster bottleneck and a hot range. Instead, identifiers combine a timestamp, a node identifier and a local counter, or a random value, so any node can mint keys independently. Sequences still exist for applications that need them, backed by a replicated counter and cached in batches per node, which leaves gaps. The identifiers sort roughly by time, which brings back some write locality problems, so random or sharded forms are preferred for high insert rates.",
    k: ["Time-ordered ids vs random ids: time-ordered ids keep recent rows together and indexes small in cache; they concentrate inserts on one range.", "Cached sequence batches vs strict sequences: batches avoid a round trip per value; gaps and non-monotonic order appear across nodes."],
    p: ["Applications that expect gap-free ordered numbers are surprised by gaps and interleaving.", "Time-ordered ids from clocks that jump backward can produce duplicates unless a counter is used."],
    v: "Insert from many nodes concurrently and confirm no duplicate ids across a million rows, with insert throughput scaling with node count and no single range holding most writes.",
    dep: ["hybrid-logical-clock", "key-encoding"]
  },
  "transaction-coordinator": {
    s: "The gateway-side component that sends a transaction's reads and writes to ranges, tracks what it has written, heartbeats its record and drives commit or abort.",
    d: "Every transaction has a coordinator on its gateway. It assigns the transaction an id and a provisional timestamp, routes each request to the right range, remembers the keys it wrote so they can be resolved later, and keeps the transaction record alive with heartbeats. On commit it either sends the commit directly to a single range, runs a parallel commit, or does the full two-step. If a read must advance its timestamp it triggers a refresh. It is the main place state is held, so a gateway failure aborts its transactions.",
    k: ["Coordinator on the gateway vs a separate service: no extra hop and no service to scale; a gateway crash aborts every transaction it was running.", "Tracking written keys in memory vs on disk: memory is fast; a very large write set must be compressed into spans, which resolves more than necessary."],
    p: ["A transaction writing millions of keys exhausts coordinator memory tracking them.", "A client that abandons a transaction without closing leaves its intents until the record expires."],
    v: "Run a transaction writing to ten ranges, kill the gateway before commit, and confirm the transaction aborts, its intents are cleaned up, and no partial writes are visible.",
    dep: ["transaction-record", "write-intents", "range-cache"]
  },
  "transaction-record": {
    s: "A small durable record on one range that holds a transaction's status, which alone decides whether all its writes count as committed.",
    d: "Each transaction's status lives in a record stored on the range of its first write: pending, staging, committed or aborted. All intents of the transaction point at it. Readers who meet an intent look up the record to learn whether the intent's value should be used. Committing flips the record and, once done, the transaction is atomic everywhere, since one write on one range decided it. The record also carries heartbeat time, so others can abort an abandoned transaction. The hard part is that it is the single point where many requests converge.",
    k: ["One decisive record vs per-range commit votes: one write gives atomicity with a single consensus round; the record range becomes a dependency of all participants.", "Record at the first write's range vs a dedicated range: no extra coordination up front; a hot range may host many records."],
    p: ["A record range that is unavailable stalls resolution of every intent that points to it.", "Cleaning records too early lets a late reader misread an intent as abandoned."],
    v: "Commit a multi-range transaction, then read from another node while the commit is only staged, and confirm readers resolve the outcome from the record and see either all writes or none.",
    dep: ["write-intents", "quorum-commit"]
  },
  "write-intents": {
    s: "Provisional versions of a value, marked with the writing transaction's id, that are invisible as committed data until the transaction commits.",
    d: "A transactional write places a versioned value that carries a pointer to its transaction record, in the same place a committed value would go. Other transactions encountering it check the record: if committed they treat it as a normal value, if aborted they ignore it, if pending they wait or push. The intent also acts as an exclusive lock on the key. Intents are replicated like any write, so a lock survives leaseholder failure. The hard part is cleanup, since intents left behind slow every reader that meets them.",
    k: ["Locks stored as intents in the data vs a separate in-memory lock service: intents are replicated and survive failures; every conflicting read must check the record.", "Eager cleanup at commit vs lazy cleanup on encounter: eager cleanup keeps reads fast; lazy cleanup lets commit return sooner."],
    p: ["An abandoned transaction leaves intents that every reader must push and resolve, adding latency to a hot key.", "Large transactions create millions of intents whose cleanup competes with foreground work."],
    v: "Write a value in an open transaction and confirm a second transaction's read blocks or pushes, then commit and confirm the second sees the new value without any intent remaining after cleanup.",
    dep: ["mvcc-versions", "transaction-record", "lock-table"]
  },
  "parallel-commits": {
    s: "Commits a multi-range transaction in one consensus round trip by writing a staging record in parallel with the last writes and treating it committed once all of them succeed.",
    d: "The coordinator marks the transaction record staging, listing every write it still has in flight, while those writes proceed in parallel. When all writes and the staging record have succeeded the transaction is implicitly committed, and the client can be told immediately; the record is formally marked committed afterward. Any reader can determine the status by checking that every listed write exists. This cuts commit latency from two sequential rounds to one, which is critical across regions. Recovery logic must handle a coordinator crash mid-way.",
    k: ["Implicit commit vs explicit two-step commit: one round trip instead of two; the commit state must be inferred by checking a list of writes.", "Parallel commit for all transactions vs only some: always on is simple; transactions with one write gain nothing and use the one-phase path."],
    p: ["A reader that cannot verify one listed write must recover the transaction, which can stall it behind a dead range.", "Writes retried after the commit was implied can duplicate effects without write sequence numbers."],
    v: "Commit a transaction spanning three ranges in different regions and confirm the client's commit latency equals one cross-region consensus round trip, and a crash injected after the staging record leaves the transaction recoverable as committed.",
    dep: ["transaction-record", "write-pipelining", "quorum-commit"]
  },
  "intent-resolution": {
    s: "Rewrites a transaction's intents into ordinary committed or deleted values after the outcome is known, releasing the locks they represent.",
    d: "After commit or abort, the coordinator sends resolve requests for each key or key span it wrote, asynchronously so the client is not delayed. Each range replaces the intent with a plain version at the commit timestamp, or removes it. Readers that stumble on an old intent can also resolve it themselves after reading the record. Batching groups many intents per range. It is difficult because the lock stays held until resolution, so lag here is lag for waiting transactions, and a lost coordinator needs another party to finish the job.",
    k: ["Asynchronous resolution vs waiting for it before acknowledging commit: asynchronous gives lower commit latency; waiters see lock release a moment later.", "Coordinator resolves its own intents vs anyone resolves: the coordinator knows all keys; others can finish for a dead one."],
    p: ["A backlog of unresolved intents makes reads of recent data slow even though all transactions finished.", "Resolving by spans instead of keys touches far more data than was written."],
    v: "Commit a transaction writing a thousand rows and confirm all intents become plain versions within a short time, and a concurrent reader blocked on one is released the moment its intent resolves.",
    dep: ["write-intents", "transaction-record", "range-cache"]
  },
  "write-pipelining": {
    s: "Lets a transaction send a write and continue without waiting for it to replicate, tracking the pending writes and confirming them before commit.",
    d: "Normally a statement waits for each write to be durable. With pipelining the coordinator returns immediately after sending a write, proceeds with the next statement, and remembers the in-flight write. It proves them all before commit, or earlier if a later read touches the same key. Intermediate writes thus overlap their consensus rounds, so a ten-statement transaction pays closer to one round trip than ten. The hard part is correctness: a failed write must fail the transaction, and a read must see its own pending writes.",
    k: ["Asynchronous in-flight writes vs waiting for each: overlapping rounds cuts transaction latency; failures are discovered later than the statement that caused them.", "Proving all writes at commit vs at each dependent read: proving at commit is simpler; a read of a pending key must wait for that proof."],
    p: ["A write that failed late surfaces as an error at commit that appears to come from an unrelated statement.", "A read that depends on an in-flight write stalls the pipeline, removing the benefit."],
    v: "Run a transaction of ten sequential inserts across a high-latency link and confirm total time is near two round trips rather than ten, and that a deliberately failed write aborts the commit.",
    dep: ["transaction-coordinator", "write-intents", "raft-log"]
  },
  "lock-table": {
    s: "A per-range in-memory table of the locks and queued waiters on keys, built from intents and explicit locking reads, that orders conflicting requests.",
    d: "The leaseholder keeps a structure keyed by lock holder and key, populated when a request finds an intent or takes a lock. A request that would conflict joins that key's wait queue instead of retrying in a loop. When the holder releases, the front waiter is released. The table is a cache of durable state and rebuilds itself on a lease change from encountered intents; unreplicated locks are lost and must be retaken. It is hard to keep fair, bounded in memory, and quick to react to a release.",
    k: ["In-memory lock table over durable intents vs only durable locks: in-memory queues make waiting cheap and fair; the table is lost on lease transfer and must be rebuilt lazily.", "Per-key queues vs a global queue: per-key queues limit false waiting; many hot keys can use much memory."],
    p: ["Locks held only in memory vanish when the lease moves, silently breaking a lock the application relied on.", "An unbounded queue behind a hot key holds a lot of memory."],
    v: "Have ten transactions update the same key and confirm they wait in a queue and commit one at a time in arrival order, with the lock table showing the queue and the holder at any moment.",
    dep: ["write-intents", "leaseholder"]
  },
  "wait-queues": {
    s: "Orders conflicting requests behind a lock holder, deciding whether each waiter blocks, pushes the holder's timestamp or aborts it, based on priority and state.",
    d: "A waiting request periodically checks the holder's transaction record. If the holder is still pending, a waiter of lower priority keeps waiting; a higher-priority waiter may push the holder's timestamp or abort it. If the holder is abandoned, anyone may abort it and clean up. Queues also track dependency edges between waiters, which feeds deadlock detection. Read-only requests push the holder's timestamp rather than blocking when serializable semantics allow. The art is making lock handoff fast and avoiding thundering herds.",
    k: ["Block the waiter vs push the holder's timestamp: pushing lets readers proceed without waiting; the pushed writer may need to refresh and can fail.", "Priority-based abort vs first-come waiting: priorities let important transactions win; low-priority ones can starve."],
    p: ["Releasing every waiter at once on a hot key causes a stampede that all but one lose.", "Starvation of a long, low-priority transaction that is repeatedly pushed."],
    v: "Hold a lock in one transaction, issue a read and a write against it, and confirm the read proceeds below the holder's timestamp while the write queues, with both visible in the contention view.",
    dep: ["lock-table", "transaction-record", "deadlock-detection"]
  },
  "deadlock-detection": {
    s: "Finds cycles of transactions each waiting on a lock the next one holds, and aborts one so the rest can proceed.",
    d: "Waiting transactions report which transaction they wait on to a distributed registry of dependency edges. A detector follows chains of these edges from a waiter; if a chain returns to the starting transaction there is a cycle. One transaction, chosen by priority or age, is aborted. Because the transactions' locks are spread across ranges, no one node has the whole graph, so detection proceeds by pushing the dependency information along the chain. It is hard because false positives abort innocent transactions, and detection delay lets a cycle block work for a while.",
    k: ["Detect cycles actively vs rely on timeouts: detection resolves in milliseconds and picks a victim sensibly; timeouts need no graph but waste seconds.", "Distributed edge-chasing vs a central graph: chasing scales and needs no coordinator; the victim may be chosen after the cycle has changed."],
    p: ["Phantom cycles from stale edges abort a transaction that was not deadlocked.", "A tight loop of transactions deadlocking on the same two rows wastes cycles retrying in lockstep."],
    v: "Run two transactions updating rows A then B and B then A, and confirm exactly one is aborted with a deadlock error within a short interval while the other commits.",
    dep: ["wait-queues", "transaction-record"]
  },
  "admission-control": {
    s: "Queues and orders work at each node by priority and available CPU, I/O and storage capacity, so overload degrades gracefully instead of collapsing.",
    d: "Before a request uses CPU, a replica write path or storage-engine bandwidth, it takes tokens from a queue per resource. Queues order by transaction priority, tenant fairness and age, and tokens refill at rates computed from observed CPU use and storage-engine health such as read amplification. Overloaded nodes slow low-priority work first, so foreground transactions keep their latency while bulk jobs wait. The hard part is feedback: the controller must react to overload without oscillating and without starving background maintenance.",
    k: ["Queueing at admission vs unbounded concurrency: queuing keeps latency stable under load; excess work waits and can time out at the client.", "Resource-based token rates vs fixed concurrency limits: adaptive rates track real capacity; they react after the overload has started."],
    p: ["Treating all work equally lets a bulk import starve user transactions on the same node.", "Over-aggressive throttling of internal work such as intent cleanup lets debt build until it hurts reads."],
    v: "Run a bulk import beside a latency-sensitive workload on one node and confirm the foreground p99 stays near baseline while the import is slowed, with the queue length and wait time visible in metrics.",
    dep: ["lsm-engine", "metrics-timeseries"]
  },
});
