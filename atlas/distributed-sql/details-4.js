// Details for the distributed SQL plate, part 4: placement, regions, schema changes, storage.
ATLAS.details("distributed-sql", {
  "replica-allocator": {
    s: "Chooses which nodes should hold each range's replicas, balancing counts and disk use while respecting locality and constraint rules.",
    d: "A background queue examines each range against its zone configuration and the cluster's state. It scores candidate stores on how many replicas they have, free space, locality diversity and constraints, and proposes adding, removing or moving a replica. Decisions use information spread by gossip about each store's capacity. The allocator makes many small decisions rather than a global plan. The challenge is avoiding thrash: stale capacity data, competing queues and changing constraints can move replicas back and forth.",
    k: ["Local greedy decisions vs a global optimizer: greedy decisions scale and are simple; they can converge slowly or settle in poor balance.", "Diversity of failure domains vs even load: diversity keeps replicas survivable; it can force an unbalanced layout when domains differ in size."],
    p: ["Acting on stale gossip moves a replica to a store that is already full.", "Constraint changes on a big table trigger mass movement that saturates the network."],
    v: "Add an empty node to a loaded cluster and confirm replicas move to it until counts and disk use are within a few percent of the others, with locality diversity preserved for every range.",
    dep: ["membership-change", "raft-snapshots", "placement-constraints"]
  },
  "rebalancing-by-load": {
    s: "Moves leases and replicas away from nodes whose CPU or request rate is much higher than the cluster mean, not just by counts.",
    d: "Each store compares its load to the cluster's mean using decayed CPU and request counters per range. If it is well above, it picks ranges whose load will bring it nearer the mean, preferring lease transfers, which are cheap, before replica moves. It selects targets that remain within bounds after the move. This handles the case where counts are even but some ranges are far hotter. It is difficult because per-range load is noisy and moving a hot range can move the problem rather than solve it.",
    k: ["Lease moves first vs replica moves: lease moves are instant and light; they only move reads and coordination, not storage or write fanout.", "Balancing CPU vs balancing request counts: CPU reflects real cost; it varies with query mix and is noisier."],
    p: ["Reacting to a transient spike moves ranges that would have cooled by themselves.", "Two stores each decide to send heat to the other at the same time and swap the problem."],
    v: "Pin heavy traffic to ranges whose leases are on one node and confirm leases move to others until CPU is within a band of the mean and no more than a few transfers per minute continue after.",
    dep: ["hot-range-report", "lease-transfer", "replica-allocator"]
  },
  "node-liveness": {
    s: "A replicated record per node, renewed on a timer, that tells the cluster which nodes are alive and underpins leases and failure decisions.",
    d: "Each node regularly writes an expiring liveness record to a replicated range. If a record lapses, other nodes may treat the node as unavailable, take over its leases and, after a longer period, mark it dead and rebuild its replicas elsewhere. Short unavailability is tolerated without data movement. Because liveness is itself stored in a range, its availability matters, and designs move toward per-range or store-level leases to avoid a single point. The delay before declaring death trades repair speed against needless copying.",
    k: ["Short vs long time before declaring a node dead: short repairs quickly; a reboot triggers needless mass replica copying.", "Central liveness range vs per-store leases: central is simple and cheap; its availability gates the whole cluster."],
    p: ["A liveness range that loses quorum makes every node look dead at once.", "A node with a stalled disk keeps heartbeating from memory and looks healthy."],
    v: "Stop a node for less than the dead timeout and confirm its leases move but no replicas are copied; keep it down past the timeout and confirm replicas are rebuilt elsewhere.",
    dep: ["raft-group", "quorum-commit"]
  },
  "repair-and-decommission": {
    s: "Restores the replica count of under-replicated ranges after a failure and drains a node of its replicas and leases before it is removed.",
    d: "When a node is declared dead, every range that had a replica on it is under-replicated and the allocator creates new replicas on other nodes, prioritizing ranges closest to losing quorum. Decommissioning marks a node as leaving, moves its leases and replicas away, and finishes when none remain, so removal never reduces redundancy. Both rely on snapshots and are throttled. A concern is that the repair work itself adds load when the cluster is already degraded, so priority and rate limits matter.",
    k: ["Repair first for the most at-risk ranges vs oldest first: risk ordering restores safety soonest; others may stay under-replicated longer.", "Drain gracefully vs remove immediately: draining preserves redundancy throughout; it takes time and needs spare capacity."],
    p: ["Decommissioning two nodes at once when ranges have three replicas can leave ranges with no capacity to move to.", "Repairing aggressively during a partial outage saturates the surviving nodes."],
    v: "Decommission a node under load and confirm no range ever drops below its target replica count, the node ends with zero replicas, and it is removed without client errors.",
    dep: ["replica-allocator", "node-liveness", "snapshot-throttling"]
  },
  "snapshot-throttling": {
    s: "Rate limits and queues the large state transfers used for rebalancing and repair, so they do not starve user traffic.",
    d: "Snapshot sending and receiving each have a concurrency limit per node and a bandwidth cap, and a queue orders waiting transfers by priority, favoring repairs of at-risk ranges over rebalancing. The recipient reserves capacity before the sender starts, rejecting snapshots if it lacks disk space or has too many in progress. Without limits, adding a node would send every node's data at it simultaneously. The tuning problem is that tighter limits protect latency but slow the restoration of redundancy.",
    k: ["Strict rate limits vs fast recovery: limits protect foreground latency; the cluster stays vulnerable for longer after a failure.", "Receiver-side reservations vs sender-only limits: reservations protect the receiver's disk and I/O; they add a handshake and can queue forever."],
    p: ["A cap that is too low means repair takes days and a second failure loses data.", "No limit on receive concurrency lets a new node be overwhelmed by its own population."],
    v: "Add a node and measure aggregate snapshot bandwidth, confirming it stays at the configured cap while foreground p99 latency stays within its target range.",
    dep: ["raft-snapshots", "admission-control"]
  },
  "localities": {
    s: "Labels on each node describing where it is, such as region, zone and rack, which placement, survival and cost decisions refer to.",
    d: "Each node starts with an ordered set of locality tags. The allocator spreads replicas across distinct values of the highest tags, and the optimizer uses them to find nearby replicas. Constraints and survival goals are expressed in terms of these tags. The cluster measures or is told the latency between localities, which informs routing. Accurate labels matter because everything depends on them: wrong tags cause replicas of one range to share a real failure domain while appearing diverse.",
    k: ["Hierarchical locality tags vs a flat label: hierarchy expresses region, zone and rack naturally; operators must keep every node's tags consistent.", "Declared vs measured topology: declared is simple and stable; measured adapts to reality but can fluctuate."],
    p: ["Two zones mislabeled as one let all replicas fall onto one rack's power feed.", "Inconsistent tag spelling across nodes creates phantom localities with a single node."],
    v: "List each node's locality, then confirm for a sample of ranges that replicas span distinct zones, and that a lookup from a gateway reports the nearest replica by tag.",
    dep: []
  },
  "survival-goals": {
    s: "A declared target for what the database must survive, either the loss of one zone or of a whole region, which drives how many replicas exist and where.",
    d: "Surviving a zone failure needs replicas in three zones, and writes need a majority within them, which can all be in one region for speed. Surviving a region failure needs replicas spread across at least three regions, so every write must wait for at least one other region, which adds the cross-region round trip to commit latency. The database applies the goal by setting replica counts and constraints per table. It is a business choice between latency and resilience, with a real cost either way.",
    k: ["Zone survival vs region survival: zone survival keeps writes local and fast; losing the region loses availability for its data.", "Voters spread across regions vs non-voting replicas: spreading voters survives a region; non-voting copies only serve local reads and do not help survival."],
    p: ["Choosing region survival with only two regions cannot achieve a majority after one fails.", "Teams adopt region survival without measuring that every write now includes an inter-region round trip."],
    v: "Under region survival, disable all nodes of one region and confirm every table remains readable and writable; under zone survival, confirm the same test makes that region's home tables unavailable.",
    dep: ["quorum-commit", "localities", "placement-constraints"]
  },
  "regional-tables": {
    s: "Tables whose data lives in one chosen home region, giving fast local reads and writes there, and slower access from elsewhere.",
    d: "The table's leaseholders and voting replicas are placed in its home region. Queries from that region read and write locally; others pay the cross-region latency, or use follower reads for stale data. Data is kept in nearby zones for zone survival, or spread across regions at write cost for region survival. This fits data used mostly by one region. It is hard when the table is accessed from several, which pushes toward per-row homes or global tables.",
    k: ["Single home region vs per-row homes: one home is simple and keeps data together; users in other regions always pay latency.", "Moving the home region on demand vs fixing it: moving follows usage; it relocates the lease and replicas of every range."],
    p: ["An application deployed in the wrong region reads its own tables across an ocean.", "Changing the home region of a large table triggers heavy data movement."],
    v: "Query a regional table from its home and from another region and confirm the home query avoids cross-region hops while the remote one's latency equals the inter-region round trip.",
    dep: ["localities", "survival-goals", "leaseholder"]
  },
  "regional-by-row": {
    s: "A table whose rows each have their own home region, stored in a hidden column, so each row is local to the users who own it.",
    d: "A region column partitions the table so that rows belonging to one region sit in ranges placed there. Lookups by a key that includes the region are served locally. For lookups without the region, the planner searches the local region first and then the others. Uniqueness across regions needs a check that reads other regions, unless the key embeds the region or is globally unique, like a random identifier. This fits data tied to users, such as accounts, where each user lives near one region.",
    k: ["Row-level homing vs table-level homing: each row is fast for its owner; queries and constraints that span regions get more complex.", "Region column in the primary key vs computed from a default: embedding makes lookups local and exact; changing a row's region becomes a key move."],
    p: ["A global unique constraint on a non-region column forces every insert to check every region.", "Rows created from the wrong region get a home that is distant from their users."],
    v: "Insert rows tagged with three regions and confirm each row's replicas and lease are in its region, a lookup with the region is local, and a lookup without it tries the local region first.",
    dep: ["regional-tables", "uniqueness-and-fk-checks", "distribution-aware-costing"]
  },
  "global-tables": {
    s: "Read-mostly tables readable with low latency in every region, at the price of slower writes that wait for a future timestamp.",
    d: "A global table's writes are given a timestamp in the future, ahead of the closed timestamp. Because the closed timestamp targets this lead, replicas in every region can serve consistent reads of present data locally. A write must wait until its timestamp is reached before committing, so it takes longer than a normal write, about the offset plus the cross-region round trip. This suits reference data such as country lists or settings, which are read constantly and changed rarely.",
    k: ["Future-timestamped writes vs a quorum read for every read: local reads everywhere; every write waits out the lead time.", "Global tables vs follower reads on a regional table: global tables never return stale data; follower reads are simpler and write-fast."],
    p: ["Using a global table for frequently written data makes each write slow.", "Writes whose commit wait overlaps a restart or clock fault stall unexpectedly."],
    v: "Read a global table from three regions and confirm each read is local and fresh; update it and confirm the write takes about the lead interval and subsequent reads everywhere show the new value.",
    dep: ["closed-timestamps", "follower-reads", "hybrid-logical-clock"]
  },
  "placement-constraints": {
    s: "Rules attached to databases, tables or rows that require or forbid replicas in specific localities, for latency, cost or legal reasons.",
    d: "Zone configurations specify replica counts, which localities must or must not hold replicas, and where leases should prefer to be. A restricted placement can keep all copies of a table in named regions to satisfy data residency law. The allocator enforces rules and moves replicas to comply. Rules interact: a survival goal, a home region and a residency restriction may be impossible to satisfy together. It is difficult to change safely, since modifying constraints on a large table triggers wide data movement.",
    k: ["Required vs preferred constraints: required constraints guarantee residency; they reduce survivability if a region fails.", "Per-row placement vs per-table placement: per-row fits residency by user; each partition needs its own rule and management."],
    p: ["Conflicting rules leave ranges permanently under-replicated with no clear error.", "A residency constraint without enough zones in the allowed region caps availability."],
    v: "Restrict a table to two zones in one country, then list the replica locations of all its ranges and confirm none is outside the allowed set, including after a node failure and repair.",
    dep: ["localities", "replica-allocator"]
  },
  "descriptor-versions": {
    s: "Each table definition carries a version number that increases with every change, with the old version kept until no node uses it.",
    d: "Definitions are stored as descriptors containing columns, indexes, constraints and a state for each element. Every modification writes a new version in a transaction. Nodes lease the version they use, and a change can proceed to the next version only after all nodes have released or upgraded past an earlier one. Version numbers are checked by writers, so that data written under an old definition is rejected or rewritten. The details matter because the definitions are consulted by every statement and a bug corrupts data silently.",
    k: ["Immutable numbered versions vs in-place edits: versions let nodes reason about what others might see; storage holds more than one version briefly.", "Waiting for all leases before advancing vs forcing: waiting avoids anomalies; a slow node delays the schema change."],
    p: ["A node that holds an old version past its lease keeps writing data the new version cannot read.", "Descriptors read without a version check apply a dropped column's old rules."],
    v: "Change a table while a long transaction holds an older version and confirm the schema change waits for it, the transaction sees a consistent old definition, and after it ends the new version propagates everywhere.",
    dep: ["transaction-coordinator", "range-descriptors"]
  },
  "two-version-invariant": {
    s: "The rule that at any moment all nodes use either version N or N+1 of a definition, never further apart, so each change step is compatible with its neighbor.",
    d: "A schema change is broken into small steps, each producing a new descriptor version. A step is allowed only when no node is on a version older than the previous one. Each adjacent pair of versions is designed to be compatible: for example, an index is first added in a state where it is maintained by writes but not read, so a node on the older version, ignoring it, does no harm. The compatibility argument is made per step. It is subtle to design and a violation produces missing index entries or orphaned data.",
    k: ["Many small compatible steps vs one big change: small steps are safely online; they take longer and need more coordination.", "Intermediate states visible to writes only vs to reads: write-only states keep new structures up to date before anything reads them; they add extra states to the machine."],
    p: ["A step that is incompatible with its predecessor corrupts data only under mixed versions, which tests miss.", "A node paused for minutes holds a version that blocks the step sequence."],
    v: "Run a schema change while writes continue on every node, then compare the new index against the table with a full consistency check and confirm no missing or extra entries.",
    dep: ["descriptor-versions", "descriptor-cache"]
  },
  "declarative-schema-changer": {
    s: "Plans a schema change from the desired end state, computing the ordered steps and rollbacks automatically instead of hand-coding each statement's procedure.",
    d: "The user states a target, such as adding a column with a default. The planner compares it with the current state and derives elements and transitions that must occur, ordered by dependencies, grouped into stages that respect the two-version invariant. It also computes how to reverse them if the change fails. Complex statements can be combined in one transaction. This replaces ad hoc procedures per statement with a general mechanism. It is hard because the dependency rules must cover every combination of operations and constraints.",
    k: ["Declarative planning vs per-statement procedures: one engine covers combinations and rollbacks; the rules are intricate and each new feature must fit them.", "Staged execution in a job vs inline in the transaction: stages allow online progress; the statement returns before the change has finished unless it waits."],
    p: ["A missing dependency rule lets a column be dropped while an index still uses it.", "A multi-statement transaction that fails halfway leaves the plan to roll back correctly only if every element has a reverse."],
    v: "Run a transaction that renames a column, adds an index on it and drops another column, and confirm the planner shows ordered stages, and a forced failure mid-way restores the original definition.",
    dep: ["two-version-invariant", "schema-change-jobs"]
  },
  "index-backfill": {
    s: "Populates a new index or column from existing rows in the background, in batches, while the table keeps taking writes.",
    d: "Before backfill starts, the new index is in a write-only state so new writes already maintain it. The job then scans the table at a fixed timestamp in spans, builds sorted index entries and ingests them as bulk files, merging with entries from concurrent writes. When done the index is validated, then made public for reads. The job can run on many nodes. It is hard because it must produce exactly the entries a transaction would have, race correctly with deletes, and not overload the cluster.",
    k: ["Backfill from a snapshot plus write-only maintenance vs locking the table: no downtime and writes continue; the index temporarily costs extra writes.", "Direct file ingestion vs transactional writes: ingestion is much faster; merging with concurrent writes needs a careful protocol."],
    p: ["A backfill competing with production at peak degrades latency without a rate limit.", "A concurrent delete racing a backfill leaves a stale index entry pointing to no row."],
    v: "Add an index on a billion-row table while writes continue, then run the consistency check comparing the table to the index and confirm zero mismatches and no write errors during the build.",
    dep: ["bulk-ingestion", "two-version-invariant", "job-system"]
  },
  "schema-change-jobs": {
    s: "Runs the staged steps of a schema change as a resumable job, with progress, pause, cancel and rollback, rather than inside the statement.",
    d: "The statement creates a job describing the change and, normally, waits for it. The job executes each stage: advance the descriptor version, wait for leases, run backfills, validate, and make changes public. Progress is recorded so a restarted job resumes. A failure triggers reverse steps that restore the earlier definition. Others observe it through the jobs view. The hard design issue is that a half-finished change is visible state, so statements issued meanwhile need defined behavior.",
    k: ["Wait for the job in the statement vs return immediately: waiting gives clear success or failure; long changes hold connections open.", "Automatic rollback on failure vs leaving for the operator: rollback restores a known state; some changes cannot be undone, such as dropped data."],
    p: ["A cancelled job leaves a partially built index that must be cleaned or later changes fail.", "Two conflicting schema changes on one table queue behind each other without the user realizing."],
    v: "Start a long schema change, restart the node running it, and confirm the job resumes from its last progress mark and ends in the expected final definition.",
    dep: ["job-system", "descriptor-versions", "index-backfill"]
  },
  "constraint-validation": {
    s: "Checks that existing rows satisfy a new constraint before it is enforced, so adding a check, unique or foreign key does not leave invalid data.",
    d: "A new constraint is added in a not-yet-validated state where new writes are enforced but old rows are not trusted. A job scans the table at a consistent timestamp, evaluating the rule against every row, and reports the first violation. If none are found the constraint is marked validated and the planner may rely on it for optimization. Validation of foreign keys reads another table. It is hard because the scan is long and concurrent writes must not slip in violations the scan already passed.",
    k: ["Enforce new writes immediately vs after validation: immediate enforcement closes the window; existing violations then block updates of those rows.", "Optimizer trusting only validated constraints vs all: trusting only validated is safe; unvalidated ones lose optimizations such as join elimination."],
    p: ["Using an unvalidated constraint for optimization returns wrong results when old violating rows exist.", "A scan on a huge table holds back old-version cleanup for its entire duration."],
    v: "Add a unique constraint to a table with a known duplicate and confirm validation fails naming a violating row, then remove the duplicate and confirm it validates and the planner begins using it.",
    dep: ["schema-change-jobs", "uniqueness-and-fk-checks"]
  },
  "lsm-engine": {
    s: "A write-optimized sorted store that buffers writes in memory, flushes them to immutable files and merges files in the background.",
    d: "Writes go to a write-ahead log and an in-memory sorted table, which flushes to an immutable file at a size limit. Files are organized in levels of increasing size; background compaction merges overlapping files downward, discarding overwritten data. Reads check memory and then files, using bloom filters and indexes to skip most. This turns random writes into sequential ones, at the price of write amplification from compaction and of read amplification when many files overlap. Compaction debt that grows faster than it can be paid is the classic failure.",
    k: ["Leveled compaction vs size-tiered: leveled keeps reads cheap and space predictable; it writes the same data many times.", "Large memtables vs small: large ones absorb bursts and reduce flushes; they lengthen recovery and use memory."],
    p: ["Compaction falling behind makes reads touch many files and drives latency up across the node.", "A burst of deletes creates tombstones that slow scans until compaction removes them."],
    v: "Sustain a write rate for an hour and confirm the number of files per level, read amplification and compaction backlog stay flat, with p99 read latency stable.",
    dep: ["mvcc-versions"]
  },
  "mvcc-versions": {
    s: "Every update adds a new version of a key tagged with its commit timestamp, so reads at any timestamp see a consistent snapshot without blocking writers.",
    d: "A stored key is the user key plus a descending timestamp, so versions sort newest first. A read at timestamp T seeks to the first version at or below T. Deletes are versions marking absence. Intents are versions whose outcome is pending. Because old versions remain, readers never block writers and backups and follower reads see a stable past. The cost is storage and scan overhead from many versions of hot keys, and it requires a cleanup policy.",
    k: ["Multiple versions with timestamps vs update in place: readers and writers do not block each other; space and scan cost grow with version count.", "Newest-first ordering vs oldest-first: newest-first makes current reads fast; scanning history reads in reverse."],
    p: ["A hot counter updated thousands of times a second accumulates versions that make reading it slow until cleanup.", "Reading with no timestamp bound sees uncommitted intents without checking their outcome."],
    v: "Update one key ten times, read at each earlier timestamp, and confirm each read returns exactly the value committed at that time, and that a read at the present sees the latest.",
    dep: ["lsm-engine", "hybrid-logical-clock"]
  },
  "mvcc-garbage-collection": {
    s: "Removes versions older than a retention window that no read, backup or changefeed can still need, reclaiming space and keeping scans fast.",
    d: "A background queue scans ranges and removes any version that is shadowed by a newer one and older than the configured time to live. The window protects point-in-time queries, backups and long transactions. Protected timestamps let a backup or changefeed pin a bound below which nothing may be collected. Setting a short window saves space; setting a long one costs storage and slows scans over heavily updated keys. It is hard because the work competes with foreground traffic and must never remove a version a protected reader needs.",
    k: ["Short retention vs long: short saves space and keeps scans fast; it limits historical queries and slows backup chains.", "Protected timestamps vs fixed window only: protection lets long jobs finish safely; a forgotten pin makes storage grow without bound."],
    p: ["A stalled changefeed holds a protection record and prevents cleanup for weeks.", "Reading at a timestamp older than the window returns an error, which surprises applications."],
    v: "Overwrite rows repeatedly, wait past the window, and confirm older versions are removed and space reclaimed, while a protected timestamp from a running backup keeps its versions until it ends.",
    dep: ["mvcc-versions", "range-tombstones"]
  },
  "range-tombstones": {
    s: "Deletion markers covering a whole span of keys at once, used to drop large amounts of data cheaply instead of writing a marker per key.",
    d: "Dropping a table, truncating, or removing a range after a move would need a delete per version if done key by key. A range tombstone says that every key in a span is deleted as of a timestamp. Reads and compactions respect it, and compaction removes the covered data. It makes mass deletion a metadata write. It is hard because the tombstone must interact correctly with versions written later at lower timestamps and with iterators that span it.",
    k: ["Range tombstone vs per-key deletes: one write removes millions of keys; every read of the span must account for it until compaction.", "Delaying physical removal vs immediate: delay protects older readers and backups; space is returned late."],
    p: ["Many overlapping tombstones slow scans of the span until compaction merges them.", "A range tombstone applied at the wrong timestamp hides data that was written after it."],
    v: "Drop a table with a hundred million rows and confirm the statement returns in seconds, reads of the span return nothing, and disk space falls after compaction runs.",
    dep: ["lsm-engine", "mvcc-versions"]
  },
  "bulk-ingestion": {
    s: "Adds pre-built sorted files directly into the storage engine's levels, bypassing the write path, for imports, restores and index builds.",
    d: "A producer builds immutable sorted files for a key span. The receiving range's replicas each ingest the file, linking it into the lowest level the engine can accept without overlap, so no data is rewritten. The range must be told to accept the ingestion through consensus so replicas stay identical. If files overlap existing data the engine must place or compact them. It is much faster than ordinary writes but must be coordinated with consensus and timestamps, and a big ingestion can create read amplification.",
    k: ["Ingestion through consensus as a single command vs sending data via the log: a short command with a file reference is cheap; replicas must be able to fetch the file reliably.", "Ingesting into low levels vs the top: low levels avoid rewriting; overlapping files force extra compaction later."],
    p: ["Ingested files that overlap many existing files cause a compaction storm afterward.", "A replica missing the file after a crash diverges from its peers."],
    v: "Ingest a file of ten million keys into an active range and confirm throughput far exceeds normal writes, all replicas have identical checksums, and read latency is unchanged afterward.",
    dep: ["lsm-engine", "raft-log"]
  },
  "encryption-at-rest": {
    s: "Encrypts every file the storage engine writes with per-file keys that are themselves protected by an operator-supplied master key.",
    d: "Each file gets a data key and the key is stored encrypted under a store key held outside the data. Reads decrypt in the I/O path with hardware acceleration. Keys rotate periodically, and old files are rewritten under new keys by normal compaction. The log is encrypted too. Backups and snapshots have their own key handling. The hard part is key lifecycle: losing the master key loses the data, and rotation must not stop service or leave old files readable with revoked keys.",
    k: ["Per-file data keys vs one key: per-file keys limit exposure and make rotation incremental; there is a key registry that must be durable.", "Engine-level encryption vs disk-level: engine encryption protects against storage theft and works on any disk; it costs CPU and complicates debugging."],
    p: ["A lost or unavailable key service makes a restarting node unable to read its own data.", "Replicas sending snapshots in clear text over an unencrypted network defeat the purpose."],
    v: "Inspect the raw data files on disk and confirm no recognizable plaintext appears, rotate the store key under load, and confirm the node restarts and reads all data.",
    dep: ["lsm-engine"]
  },
});
