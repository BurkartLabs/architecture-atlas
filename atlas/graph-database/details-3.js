// Details for the graph database plate, part 3: data model, transactions, storage.
ATLAS.details("graph-database", {
  "property-graph-model": {
    s: "The data model of labeled nodes connected by typed, directed relationships, where both nodes and relationships carry key-value properties.",
    d: "Entities are nodes, connections between them are first-class relationships with their own type, direction and properties, and nodes carry one or more labels. Relationships are stored, not computed, so a connection is a fact the database holds directly. There is no required schema: two nodes with the same label may have different properties. Compared with triples, the model attaches properties to relationships naturally, but it has no built-in vocabulary or inference. The difficult modeling work is deciding what becomes a node, what a relationship and what a property.",
    k: ["Property graph vs triple model: property graphs attach data to relationships and read naturally, while triples are uniform and support standard inference and global identifiers.", "Reify an event as a node vs as a relationship with properties: a node can connect to many parties and be queried independently, while a relationship is simpler and faster for binary facts."],
    p: ["Storing a many-party event as a relationship property loses the ability to connect it to more than two nodes.", "Modeling a categorical value as a property instead of a node makes grouping queries scan everything."],
    v: "Model one purchase as a node connecting buyer, seller and product, and confirm queries can start from any of the three and reach the others in one hop, which a binary relationship could not express.",
    dep: ["nodes-and-labels", "relationships", "property-values"]
  },
  "nodes-and-labels": {
    s: "Nodes represent entities; labels are tags on nodes, several per node, used to classify them, scope indexes and constraints, and give scans a starting set.",
    d: "A node has an internal identifier, zero or more labels, a pointer to its first relationship and a pointer to its properties. Labels are stored as small integer tokens. A node can gain and lose labels over its life, which makes labels more like roles than table membership. Label membership drives the planner's choice of scan and index. Heavily used labels become the starting points of most queries, so the label scan structure must be fast and a node with many labels needs inline or overflow label storage.",
    k: ["Many labels per node vs one type per node: multiple labels model roles and overlapping classes flexibly, but index and constraint choices multiply and statistics fragment.", "Labels vs a type property: labels are indexable and planner-visible directly, while a property is more flexible but invisible to label scans."],
    p: ["Using labels as data, such as one label per customer, floods the dictionary and the schema.", "Adding a label to millions of nodes in a single transaction holds locks and bloats the log."],
    v: "Create nodes with two labels each, query by each label alone and both together, and confirm each returns the right set and that removing a label immediately removes the node from that label's scan and indexes.",
    dep: ["node-store", "token-dictionary", "label-scan-index"]
  },
  "relationships": {
    s: "A relationship connects exactly two nodes, has one type and a direction, and may carry properties; it is stored once but traversable from either end.",
    d: "Each relationship record holds its type token, the identifiers of its start and end nodes, pointers into the lists of both nodes, and a property pointer. Direction is part of the data but traversal works both ways, so a query can follow it forward, backward or ignore direction. Relationships have no independent existence without both nodes. Many queries use a type as the first filter, so engines group or index by type. A common mistake is mixing semantically different connections under one generic type, which defeats filtering.",
    k: ["Specific relationship types vs one generic type with a kind property: specific types let traversal skip irrelevant edges cheaply, while a generic type with properties forces a check on each.", "Direction chosen by meaning vs by convenience: meaningful direction clarifies queries, though symmetric facts must be modeled in one direction or both, with trade-offs for storage and consistency."],
    p: ["Storing a symmetric fact twice, once per direction, lets the two copies drift apart.", "A single generic CONNECTED type turns every traversal into a property-filter scan."],
    v: "Create a relationship from A to B and confirm it is found from A going outgoing, from B going incoming, from either ignoring direction, and that deleting node A without detaching is refused.",
    dep: ["relationship-store", "adjacency-chains", "token-dictionary"]
  },
  "property-values": {
    s: "The typed values held on nodes and relationships: numbers, strings, booleans, temporal values, points and homogeneous lists, with rules for comparison, null and coercion.",
    d: "Each property is a key and a value of a supported type, with lists of one type allowed, but typically not nested maps. Values are encoded compactly: small integers and short strings inline in the record, longer ones in an overflow store. Comparison rules across types are defined by the language, and null means unknown, which makes comparisons with it neither true nor false. Because the type belongs to the value, not the key, the same key can hold different types on different nodes unless a constraint forbids it.",
    k: ["Typed values per property vs declared column types: per-value types allow flexible data, but a query on a key holding mixed types needs defined comparison rules and index behavior.", "Flat values vs nested structures: flat values index and compare cleanly, while nested ones need flattening into nodes or serialization into strings."],
    p: ["A number stored as a string on some nodes is skipped by numeric range filters.", "Temporal values stored without a time zone make comparisons across regions inconsistent."],
    v: "Store an integer on one node and the same number as text on another under one key, then run an equality query with an integer parameter and confirm only the integer matches and the index behaves identically.",
    dep: ["property-store", "large-value-store"]
  },
  "schema-catalog": {
    s: "The catalog of labels, relationship types, property keys, indexes and constraints, stored transactionally and consulted by the planner, completion tools and the enforcer.",
    d: "Names are mapped to token ids in a dictionary, and index and constraint definitions are stored as catalog entries with state, such as populating, online or failed. Changes to the catalog are transactional so a transaction sees a consistent set of rules, and they invalidate cached plans. The catalog is also read by tools to suggest names and draw schemas. Even in a mostly schemaless database it is the single place where optional structure is declared, so it must be durable and replicated like data.",
    k: ["Schema changes inside transactions vs separate administrative operations: transactional changes are consistent and rollbackable, but long index builds do not fit inside one and need their own lifecycle.", "Optional schema vs mandatory schema: optional schema lets a model evolve cheaply, while mandatory schema catches errors earlier and enables better planning."],
    p: ["Dropping an index while queries are planned against it fails them until they replan.", "Catalog state out of step between cluster members yields different plans on different servers."],
    v: "Create an index, query its state until online, drop it, and confirm the catalog listing, the cached plans and the planner's chosen anchors all change accordingly with no restart.",
    dep: ["token-dictionary", "transaction-manager"]
  },
  "constraints": {
    s: "Declared rules the database enforces on writes: unique property values, required properties, property types and, in some designs, key combinations or relationship endpoint rules.",
    d: "A uniqueness constraint is backed by an index so each write checks for an existing holder of the value. Existence constraints reject nodes missing a property, and type constraints reject values of the wrong type. Creating a constraint on existing data first validates the data and fails if violations exist. Enforcement occurs at commit, which matters with concurrency: two transactions inserting the same key must be serialized by a lock on the index entry, and the loser either waits and fails or retries.",
    k: ["Enforce in the database vs in the application: database enforcement is atomic and universal across all writers, while application checks are flexible and are racy and bypassed by other tools.", "Constraint backed by an index vs scan-based checking: indexes make checks constant time and also speed queries, but cost write throughput and storage."],
    p: ["Creating a constraint over data that has violations fails after a long scan, or leaves a half-built index.", "Bulk importers that skip transactions skip constraints too and load violating data."],
    v: "Create a uniqueness constraint, then run two concurrent inserts of the same value and confirm one commits and the other fails with a constraint violation, with exactly one node holding the value afterward.",
    dep: ["property-index", "lock-manager", "schema-catalog"]
  },
  "internal-identifiers": {
    s: "Compact numeric ids that locate a node or relationship record directly in its store file, used by pointers and exposed to users with careful caveats.",
    d: "In a native store, a record's id is its position: multiply by the fixed record size to find its byte offset, which makes every pointer follow a single calculation. Ids are allocated from a counter and recycled after deletion. Because they depend on layout, they are meaningless across systems and can change with a store rebuild. Applications should use their own stable keys. Exposing internal ids is convenient for debugging and dangerous for anything stored externally.",
    k: ["Physical position ids vs generated stable ids: positional ids give single-step pointer access and compact records, but they are reused and change with compaction, while stable ids cost an indirection.", "Id reuse vs never reuse: reuse keeps files dense, while never reusing keeps old references unambiguous and lets files grow."],
    p: ["An application storing internal ids as foreign keys follows them to an unrelated node after reuse.", "Assuming ids are dense and ordered by creation breaks after deletes and reuse."],
    v: "Create a node, record its internal id, delete it, create another node, and confirm the id is reused per policy, and that a lookup by the old id now returns the new node and not an error.",
    dep: ["node-store", "relationship-store", "record-id-reuse"]
  },
  "transaction-manager": {
    s: "Starts, tracks and ends transactions, buffers each one's changes, coordinates validation, locking and logging at commit, and makes the outcome atomic and durable.",
    d: "A transaction collects its writes in a private state until commit. At commit the manager validates constraints, acquires locks, assigns a commit identifier, writes the changes to the log, flushes it for durability, then applies the changes to the store and releases locks. Reads see a snapshot or locked data according to the isolation level. Long traversals matter here: a transaction that walks millions of records holds its snapshot or locks that long, which blocks cleanup and writers.",
    k: ["Write buffering until commit vs update in place: buffering makes rollback trivial and reads isolated, at the cost of memory for large transactions.", "One writer per commit pipeline vs concurrent commit: serialized commit is simple and gives a clear order, while concurrent commit raises throughput and complicates the log."],
    p: ["A huge write transaction exhausts memory because every change is held until commit.", "An open read transaction left idle pins old versions and delays cleanup indefinitely."],
    v: "Begin a transaction, write, kill the process before commit, restart, and confirm none of the changes appear; repeat after commit and confirm all appear, including after a kill immediately following the acknowledgment.",
    dep: ["write-ahead-log", "lock-manager", "isolation-levels", "constraints"]
  },
  "isolation-levels": {
    s: "The guarantees about what concurrent transactions can see of each other's changes, usually read committed or snapshot-based, with stronger serializable modes less common.",
    d: "Read committed lets each statement see data committed before it began, so a traversal repeated within a transaction can see changes. Snapshot isolation fixes one view for the whole transaction and detects write conflicts. Serializable adds protection against write skew. Graph workloads add a quirk: a traversal reads a chain of related records, and a concurrent writer inserting a relationship must not make the chain inconsistent mid-walk. Isolation level is a per-database choice, often with a default tuned for throughput.",
    k: ["Read committed vs snapshot isolation: read committed is cheap and sees fresh data, but results can change within a transaction, while snapshots give repeatable traversals and hold versions longer.", "Lock-based vs version-based isolation: locks give strictness without version storage, but readers block writers, while versions let both proceed."],
    p: ["Assuming repeatable reads under read committed makes a two-pass computation inconsistent.", "Write skew under snapshot isolation breaks an invariant spanning two nodes, such as a total across a pair."],
    v: "Run a transaction that counts a node's relationships twice while another commits an addition between the counts, and confirm the two counts differ under read committed and match under snapshot isolation.",
    dep: ["transaction-manager", "mvcc-versioning", "lock-manager"]
  },
  "mvcc-versioning": {
    s: "Keeping several versions of records so readers see a consistent snapshot while writers create new versions, with cleanup of versions no transaction can still see.",
    d: "Each change creates a new version stamped with the committing transaction's id. A reader with a snapshot ignores versions newer than its start and takes the latest older one. Versions live in the store, in a side area or in memory, depending on the design. A background process removes versions older than the oldest active snapshot. Relationship chains complicate this, since an insertion must thread a new relationship through two nodes' lists without confusing a reader mid-walk.",
    k: ["In-place update with a version chain vs append-only new versions: chains keep the main store compact and the latest data hot, while append-only simplifies concurrency and leaves more garbage.", "Eager vs lazy version cleanup: eager cleanup keeps space tight at the cost of write-path work, while lazy cleanup defers cost and risks bloat."],
    p: ["A long-running reader prevents cleanup and the store grows without bound.", "Old versions of a supernode's relationship list make traversal slow while many versions are retained."],
    v: "Start a read transaction, commit one hundred updates to a node from another connection, and confirm the reader still sees the original values, then end the reader and confirm old versions are reclaimed within the cleanup interval.",
    dep: ["transaction-manager", "node-store", "relationship-store"]
  },
  "lock-manager": {
    s: "Grants shared and exclusive locks on nodes, relationships and index entries so concurrent writers do not corrupt each other's changes, and detects the deadlocks locking can cause.",
    d: "A writer that adds a relationship locks both endpoint nodes, since both of their lists change. Locks are taken as needed and held until commit, which is the standard way to get serializable writes. A lock table maps resources to holders and waiters. When a waiter would complete a cycle, the manager detects the deadlock and aborts one transaction, which the client must retry. Supernodes are the hot spot: every writer adding a relationship to the same node queues on one exclusive lock.",
    k: ["Fine-grained locks on records vs coarse locks on subgraphs: fine locks maximize concurrency and cost more bookkeeping and more deadlock chances, while coarse locks are simple and serialize unrelated work.", "Wait with a timeout vs detect cycles: detection aborts only true deadlocks, while timeouts are simple and abort slow but healthy waiters."],
    p: ["Concurrent loaders connecting to one popular node deadlock repeatedly or serialize completely.", "Applications that treat a deadlock abort as fatal rather than retrying lose work under load."],
    v: "Run two transactions that lock nodes A and B in opposite orders and confirm exactly one is aborted with a deadlock error within the detection interval, the other commits, and a retry of the aborted one succeeds.",
    dep: ["node-store", "relationship-store", "transaction-manager"]
  },
  "write-ahead-log": {
    s: "A sequential file recording every committed change before it is applied to the store, so committed work can be replayed after a crash and sent to replicas.",
    d: "At commit, the transaction's changes are appended as a command batch with a transaction id and checksum, and the file is forced to stable storage before the commit is acknowledged. Applying changes to store pages happens afterward and lazily. Sequential appends are fast. The log is rotated into segments and pruned after a checkpoint makes older segments unnecessary, except those needed by replicas or backups. Group commit batches the flush for several transactions together, trading a little latency for throughput.",
    k: ["Flush at every commit vs periodic flush: flushing every commit guarantees no acknowledged loss, while periodic flush is faster and can lose recent commits on power failure.", "Physical page logging vs logical command logging: logical commands are small and replicable, but replay depends on the store layout being deterministic."],
    p: ["A disk that acknowledges flushes it has not performed loses committed data on power loss.", "Retaining log for a stalled replica fills the disk."],
    v: "Commit a transaction, cut power or kill the machine immediately after the acknowledgment, restart, and confirm the change is present; then flip the last byte of the log and confirm recovery stops at the corrupt batch.",
    dep: ["transaction-manager"]
  },
  "checkpointing": {
    s: "Periodically forces dirty pages to the store files and records a position in the log, bounding how much log recovery must replay and allowing old log to be removed.",
    d: "A checkpoint finds the modified pages in the cache, writes them to the store files, flushes the files, and then writes a marker naming the log position up to which the store is current. Crash recovery starts from the last marker. Checkpoints trigger on time, on log size or on shutdown. Writing many pages in a burst competes with foreground I/O, so it is throttled and spread out. Frequent checkpoints shorten recovery and cost steady I/O; infrequent ones do the opposite.",
    k: ["Frequent vs infrequent checkpoints: frequent ones shorten recovery and shrink the log but add continuous write load, while infrequent ones batch writes and lengthen crash recovery.", "Throttled background flushing vs a burst at checkpoint time: throttling smooths latency, whereas bursts finish faster and stall foreground queries."],
    p: ["A checkpoint burst saturates the disk and causes latency spikes at predictable intervals.", "A checkpoint marker written before the page flush is durable makes recovery skip needed replay."],
    v: "Write steadily for ten minutes with checkpointing on, kill the server, and confirm restart replays only the log since the last marker and finishes in the time that interval predicts.",
    dep: ["write-ahead-log", "page-cache", "node-store"]
  },
  "crash-recovery": {
    s: "On startup after an unclean shutdown, replays the log from the last checkpoint to bring the store to the state of the last committed transaction and discards anything partial.",
    d: "The recovery process reads the checkpoint marker, then reads log batches in order, verifying checksums and reapplying each transaction's commands to the store. Application must be idempotent, since a command may have already reached the store before the crash. It stops at the first incomplete or corrupt batch and treats the rest as never committed. Afterward it rebuilds anything derived, such as counts, and may need to repopulate indexes that were mid-build. Recovery time grows with log since the checkpoint.",
    k: ["Idempotent replay vs tracking which commands were applied: idempotent commands are simpler and robust, but demand careful design of each command type.", "Stop at the first bad batch vs skip and continue: stopping preserves a consistent prefix, while continuing could apply changes whose dependencies were lost."],
    p: ["Torn page writes in the store without a repair mechanism leave a record half old and half new.", "An index that was populating at crash time comes back marked online but incomplete."],
    v: "Kill the process mid-bulk-write several times in a loop, restart each time, and confirm the consistency checker passes and the node and relationship counts equal the count of acknowledged commits.",
    dep: ["write-ahead-log", "checkpointing", "consistency-checker", "node-store", "relationship-store"]
  },
  "node-store": {
    s: "A file of fixed-size node records holding label references, the pointer to the node's first relationship and the pointer to its first property, addressed by id.",
    d: "Each record has a flag for in-use, a pointer to the first relationship, a pointer to the first property and a label field or pointer. Because every record is the same size, the record's position is its id times that size, and reading a node touches one page. The file is accessed through the page cache. Small and uniform records keep the file dense and make scans sequential. Keeping the node record tiny, with relationships and properties elsewhere, is what allows a large share of the graph's skeleton to stay in memory.",
    k: ["Fixed-size records vs variable-length records: fixed-size gives direct addressing and fast scans, while variable-length saves space but needs an index to find a record.", "Inline small labels vs always a pointer: inline labels save a read for common cases, but limit how many labels fit without overflow."],
    p: ["A record size change between versions requires a full store migration.", "Pointer fields sized too small cap the maximum number of nodes at a limit nobody noticed."],
    v: "Create a node, read its id, compute its byte offset from the record size and read those bytes directly with a store inspection tool, confirming the in-use flag and the first-relationship pointer match the node's relationships.",
    dep: ["page-cache"]
  },
  "relationship-store": {
    s: "A file of fixed-size relationship records, each holding start and end node ids, a type, pointers into both endpoints' relationship lists and a pointer to its properties.",
    d: "A relationship record is the heart of native storage. It names both nodes, so the relationship can be followed in either direction, and contains the previous and next pointers in the start node's list and in the end node's list, forming two doubly linked chains threaded through the same records. Creating a relationship is therefore a handful of pointer updates on records that already exist. Records are larger than node records, and they hold most of the file's bytes in most graphs.",
    k: ["One record in two chains vs separate records per direction: one record halves storage and keeps the two directions consistent, but updates touch up to four neighboring records.", "Type and direction inline vs grouped by type: inline is compact for sparse nodes, while grouping speeds up nodes with many types."],
    p: ["Inserting into a chain requires locking the neighboring records, so hot nodes become write bottlenecks.", "Pointer fields sized too small cap the number of relationships the store can hold."],
    v: "Create a relationship and use a store inspection tool to confirm its record names both nodes, that following the next pointers in either node's chain reaches it, and that deleting it unlinks it from both chains.",
    dep: ["node-store", "page-cache"]
  },
  "adjacency-chains": {
    s: "The linked lists of relationships hanging off each node, through which a traversal walks its neighbors without searching any index.",
    d: "A node record points at the first relationship in its chain, and each relationship record points at the next. Walking costs one record read per neighbor, independent of how large the whole graph is, which is the property called index-free adjacency. The walk is a sequence of dependent reads, so on cold storage it is bound by latency, and relationship records for one node may be scattered across the file. Alternatives store neighbors contiguously in sorted arrays, which scan faster and make intersections cheap but cost more to update.",
    k: ["Linked chains vs contiguous sorted arrays: chains update in place with a few pointers and suffer scattered reads, while arrays scan quickly and intersect well but are costly to modify.", "Single chain per node vs chains grouped by type and direction: a single chain is simple, while grouping lets a typed expand skip the rest."],
    p: ["Relationships inserted over years scatter a node's records across the file, so each hop is a cache miss.", "Walking a very long chain for a rare type touches every other record in it."],
    v: "Measure the time to expand a node with ten thousand relationships when cached and when cold, and confirm the cold time is dominated by read count and the cached time is proportional to the relationship count.",
    dep: ["relationship-store", "node-store", "page-cache"]
  },
  "property-store": {
    s: "Records holding property key-value pairs in linked blocks, small values inline in the record and larger ones referencing overflow storage, one chain per node or relationship.",
    d: "A property record packs several key-value pairs, with keys as token ids and a type tag per value. Short strings, small numbers and booleans fit inline. Larger values use pointers to the large value store. The owner holds a pointer to its first property record, and chains link further records. Reading one property requires walking the chain until the key is found, so entities with many properties read slower, and queries that filter on a property read it through this path unless an index covers it.",
    k: ["Properties in a separate store vs inline with nodes: a separate store keeps node records tiny for fast traversal, but filtering on properties costs an extra read per node.", "Packed multi-property records vs one record per property: packing saves space and reads, with more complex updates when a value grows."],
    p: ["Filtering a million nodes on an unindexed property reads a million property chains.", "Updating a value to a longer string moves it to overflow and fragments the store."],
    v: "Create a node with thirty properties and time a read of the last key versus the first, then confirm an indexed lookup on that key avoids touching the property chain entirely.",
    dep: ["large-value-store", "token-dictionary", "page-cache"]
  },
  "large-value-store": {
    s: "Block-structured files for strings and arrays too large to fit in a property record, stored as linked chains of fixed-size blocks.",
    d: "When a value exceeds the inline limit, it is split across blocks of fixed size, each pointing at the next, and the property record keeps only the pointer and type. Separate stores for strings and arrays avoid mixing access patterns. Reading a large value costs one read per block. Some designs compress long strings. Large values bloat the store and slow bulk reads, so very large content, such as documents or images, is better held in external storage with a reference property.",
    k: ["Store large values in the graph vs external object storage: in the graph they are transactional and backed up together, while externally they keep the store small and fast.", "Fixed block size vs variable extents: fixed blocks reuse space easily and fragment large values, while extents read contiguously and complicate allocation."],
    p: ["Storing multi-megabyte documents as properties inflates the store and slows backups and cache warm-up.", "Updating a large string rewrites its whole chain even for a one-character change."],
    v: "Store a ten-kilobyte string property, read it back, and confirm the value is identical and the large-value file grew by the expected number of blocks, then delete it and confirm blocks are marked free.",
    dep: ["property-store", "record-id-reuse"]
  },
  "token-dictionary": {
    s: "A table mapping label names, relationship types and property keys to small integer ids, so records store a few bytes instead of strings.",
    d: "Names are interned once. Every record refers to the token id, not the text, so a label or key costs two to four bytes and comparisons are integer comparisons. The dictionary is held in memory and persisted in small stores, and new tokens are created on first use, even in a transaction that later rolls back, because ids must never be reassigned. Renaming a label is cheap because only the dictionary changes. Typos silently create new tokens, which is why misspelled labels appear in the schema.",
    k: ["Create tokens implicitly on first use vs require declaration: implicit creation keeps development fast, but typos pollute the schema and no error appears.", "Integer ids in records vs strings: ids save space and speed comparison, but make raw store files unreadable without the dictionary."],
    p: ["Using generated values as property keys floods the dictionary with millions of tokens.", "Tokens created by rolled-back transactions remain, so the dictionary shows names no data uses."],
    v: "Create a label with a typo, run the schema listing, and confirm both spellings appear with ids, then rename one and confirm records using it change meaning without any record being rewritten.",
    dep: ["page-cache"]
  },
  "dense-node-storage": {
    s: "A different layout for nodes with very many relationships, grouping them by type and direction so a typed traversal reads only the matching group instead of the whole list.",
    d: "Past a threshold of relationships, a node is flagged dense and its single chain is replaced with a set of groups, one per type and direction, each with its own chain and a count. A typed expand reads the group directly and the planner can read the degree from the group without walking. Adding a relationship updates only its group, which splits contention a little. The conversion happens transparently on a write that crosses the threshold, and may be one-way. It makes supernodes survivable, not cheap.",
    k: ["Convert on a threshold vs group every node: converting only dense nodes keeps ordinary nodes compact, but a write may trigger conversion and a latency spike.", "Group by type and direction vs also by neighbor label: finer groups speed selective traversals, while more groups mean more records for sparse types."],
    p: ["The one write crossing the threshold pays for converting the whole chain while holding the node lock.", "Degree counts read from groups are stale if updates are applied lazily."],
    v: "Add relationships to one node until it crosses the threshold, then confirm the store flags it dense, a typed expand reads only that type's group, and the degree of each group is available without walking.",
    dep: ["relationship-store", "adjacency-chains", "supernode-handling"]
  },
  "table-backed-storage": {
    s: "An alternative design that stores nodes and relationships in ordinary tables or key-value pairs of another database engine, and implements traversal as joins or key lookups.",
    d: "Nodes go in a table or keyspace, relationships in an edge table keyed by endpoint, with an index on each endpoint so neighbors can be found. A hop costs an index lookup, which is logarithmic in total relationships, not constant. The benefit is reuse of a mature engine's transactions, replication and tooling, and easy scale-out through its sharding. The cost is that deep traversals multiply those lookups, and each hop may land in a distant page. Gains from locality come from clustering edges by source.",
    k: ["Table-backed vs native pointer storage: tables reuse a proven engine and scale out easily, while native pointers make each hop constant-time and favor deep traversals.", "Cluster edges by source vs keep a separate index: clustering makes a node's neighbors contiguous, and the reverse direction then needs a second copy or index."],
    p: ["Deep traversals compound index lookups and run orders of magnitude slower than on pointer storage.", "Keeping both directions in sync in two edge indexes doubles write cost and risks drift."],
    v: "Run the same six-hop query against a table-backed layout and a native layout on equal data and confirm results match while latency per extra hop grows with total data size only in the table-backed one.",
    dep: ["property-index", "relationships"]
  },
  "record-id-reuse": {
    s: "Tracks ids freed by deletes and hands them out again so store files do not grow forever, with rules that prevent reuse while an older transaction might still see the record.",
    d: "When a node or relationship is deleted its record is marked unused and its id is queued in a free list. New records take ids from the list before extending the file. Reuse must wait until no running transaction could read the old record, otherwise a reader would follow a pointer to something unrelated. Free lists are persisted so they survive restart, and may be maintained by a background process that also compacts. Without reuse, a database with heavy churn grows without bound.",
    k: ["Reuse ids vs append only: reuse keeps files compact and caches dense, while append-only avoids stale-pointer hazards and wastes space.", "Reuse after the oldest reader ends vs immediately: delaying is safe for concurrent readers, whereas immediate reuse needs another guard against dangling references."],
    p: ["Reusing an id too early lets a long reader traverse into an unrelated record.", "A lost free list after a crash leaks every freed record until the next maintenance pass."],
    v: "Delete a thousand nodes, create a thousand new ones after readers finish, and confirm the file size stays flat and the new nodes occupy the freed ids, while an earlier open reader still sees its old snapshot correctly.",
    dep: ["node-store", "relationship-store", "mvcc-versioning"]
  },
});
