// Details for the document database plate, part 3: consistency and transactions, replication, sharding.
ATLAS.details("document-database", {
  "single-document-atomicity": {
    s: "A write to one document, including all its nested fields and index entries, applies completely or not at all and is never seen half done.",
    d: "Because the document is the unit of storage, an update that changes many fields of one document is one atomic storage write, along with its index changes and its operation log entry. Concurrent writers to the same document serialize. Readers see either the old or the new version. This is why data that must change together is often embedded in one document. The limits are the maximum document size and that anything spanning documents needs a transaction.",
    k: ["Atomic single document vs general transactions: single-document atomicity is cheap and always on; modeling must keep related data together.", "Fine-grained documents vs large aggregates: large aggregates give atomic multi-field changes; they concentrate contention on one hot document."],
    p: ["Splitting data that must change together across documents, then seeing partial states when a failure happens between writes.", "A hot document, such as a global counter, becomes a serial bottleneck."],
    v: "Update two fields of one document from many concurrent clients with an invariant between them and confirm no reader ever observes a state that breaks the invariant.",
    dep: ["mvcc-versioning", "document-level-locking", "write-ahead-journal"]
  },
  "multi-document-transactions": {
    s: "Groups reads and writes across documents and collections into one unit that commits atomically and sees a consistent snapshot.",
    d: "A session starts a transaction, takes a snapshot timestamp and buffers writes as the storage engine's uncommitted versions. Commit applies them atomically and writes them as a single group in the operation log. Conflicts with other writers abort one side, which the client retries. Transactions have time and size limits, because they pin old versions in memory and can block the replication of later writes. They are hard to use well: contention, retries and lifetime limits mean they are the exception, not the default.",
    k: ["Use transactions vs remodel around single documents: transactions give relational-style atomicity; they cost latency, retries and memory, and limit throughput.", "Short transactions vs long ones: short ones rarely conflict; long ones hold snapshots, grow cache pressure and often hit time limits."],
    p: ["Wrapping every write in a transaction by habit, reducing throughput without need.", "No retry loop for transient conflict errors, so ordinary contention surfaces as failures."],
    v: "Transfer an amount between two documents inside a transaction while a failure is injected before commit, and confirm neither document changed; confirm a concurrent reader sees the totals unchanged until commit.",
    dep: ["mvcc-versioning", "write-conflict-handling", "oplog", "read-concern"]
  },
  "write-concern": {
    s: "A per-write setting for how many replicas must have the write, and whether it must be journaled, before the server reports success.",
    d: "A write concern names a number of members or majority, a journal flag and a timeout. The primary applies the write and then waits until the requested set of members has replicated it, tracked through replication progress reports. Weaker settings return faster but may lose acknowledged data in a failover; majority settings survive any single failure. It is hard to pick: stronger concerns add latency and fail when members are unavailable.",
    k: ["Majority vs one: majority prevents rollback of acknowledged writes after failover; it adds replication round trips and blocks when a majority is down.", "Journaled vs not: journaled survives a crash of that member; the wait is for the next journal flush."],
    p: ["Default acknowledgment by the primary alone, then losing acknowledged writes in an election.", "Majority writes with a timeout shorter than a failover, producing errors that are not failures of the write."],
    v: "Write with majority concern, kill the primary immediately after acknowledgment, and confirm the write is present on the new primary; repeat with concern one and observe it may roll back.",
    dep: ["majority-commit-point", "write-ahead-journal", "replica-set"]
  },
  "read-concern": {
    s: "A per-read setting that decides which version of the data a query may return, from the freshest local copy to only majority-committed data.",
    d: "Local returns whatever the member has, including writes that may later roll back. Majority returns data known to be on a majority, read from a stable snapshot the engine maintains at the commit point. Linearizable reads wait for the primary to confirm it is still primary, then return all prior majority writes. Snapshot gives a consistent view across a transaction. It is hard because stronger levels cost latency and keep old versions in memory.",
    k: ["Local vs majority: local is fastest and sometimes shows data that later disappears; majority never shows rolled-back data and may lag slightly.", "Linearizable vs majority: linearizable guarantees freshness, at a heavy latency cost and only on the primary."],
    p: ["Reading with local right after writing with majority from a different connection, and missing the write.", "Majority reads on a lagging member, returning old data without any error."],
    v: "Write with majority concern, then read from a secondary with majority read concern and confirm the value appears only after replication, and never reflects an unreplicated write.",
    dep: ["majority-commit-point", "mvcc-versioning"]
  },
  "read-preference": {
    s: "A client setting for which replica set members may serve a read: primary, secondaries, the nearest, or combinations with tags.",
    d: "The driver filters eligible members by mode, tags such as region or purpose, and maximum staleness, then picks within the latency window. Reading from secondaries spreads load and keeps analytics off the primary, and nearby members cut latency. It is hard because secondary reads can be stale and, with no causal session, can go backward in time between two reads from different members.",
    k: ["Primary only vs secondaries: primary reads are most current; secondary reads scale read throughput with replicas but may lag.", "Tag sets for workloads vs shared members: dedicated analytics members protect the main workload; they need capacity and a defined fallback."],
    p: ["Sending reads that must see the latest write to a secondary, which returns stale data under lag.", "Using secondaries to scale and then discovering they are as loaded as the primary because they apply every write."],
    v: "Set secondary preference, write then read repeatedly under induced lag, and confirm stale reads occur without a staleness bound and are excluded once a maximum staleness is set.",
    dep: ["server-selection", "replica-set"]
  },
  "causal-consistency": {
    s: "A session guarantee that reads see the effects of earlier writes in the same session, and observed values never go backward, even across members.",
    d: "The driver tracks a cluster time and an operation time. Each subsequent request carries the latest operation time seen, and the server waits until its data has reached that time before answering. This gives read-your-writes, monotonic reads and writes follows reads for one logical client across different members. It needs majority concern for full guarantees. The cost is occasional waiting, and the guarantee holds only within the session.",
    k: ["Session-based causal guarantee vs global strong reads: causal sessions are cheap and scale across members; they say nothing about other clients' writes.", "Waiting on secondary vs routing to primary: waiting uses secondary capacity; routing is simpler and more current but loads the writer."],
    p: ["Using a new session for each request, which discards the causal token.", "Mixing majority writes with local reads in the session and losing the guarantee."],
    v: "In one session, write to the primary then immediately read from a lagging secondary and confirm the read waits and returns the new value; without a session, confirm it can return the old value.",
    dep: ["clock-and-timestamps", "read-concern", "client-driver"]
  },
  "retryable-writes": {
    s: "A mechanism that lets a write be safely resent after an error because the server remembers completed writes by session and transaction number.",
    d: "The driver assigns each write a session id and an increasing transaction number. The server records, with each applied write, which numbers it completed, in the operation log and a transactions table. If a retry arrives with the same numbers, the server returns the earlier result instead of applying again, even after a failover, because the record replicates. It is hard because the records have a finite lifetime and only certain operations are covered.",
    k: ["Server-side deduplication vs client-only retry: server deduplication makes retries exactly-once for covered writes; it costs bookkeeping per session.", "Retry only once vs repeatedly: once handles failover; repeated retries risk long delays and amplify an outage."],
    p: ["Application-generated retries that use new sessions, defeating deduplication.", "Operations outside those covered, such as multi-document updates with unlimited scope, still apply twice."],
    v: "Send the same write with the same session and transaction number twice, once before and once after a failover, and confirm the document was modified exactly once and both calls return the same result.",
    dep: ["oplog", "client-side-retries", "primary-election"]
  },
  "change-streams": {
    s: "A resumable feed of data changes to a collection, database or cluster, delivered in order and built on the replication log.",
    d: "A change stream opens a cursor over majority-committed operation log entries, filtered and translated into events such as insert, update, delete and DDL, each with a resume token. Applications resume after a restart by presenting a token, as long as it is still within the operation log window. On sharded clusters a router merges per-shard streams into one ordered by cluster time. Pipelines can filter events. It is hard because of retention: a consumer that is down longer than the operation log window cannot resume.",
    k: ["Change streams vs polling with timestamps: streams deliver pushes in order with resume support; they depend on operation log retention, while polling needs an indexed update field.", "Full document lookup vs deltas only: lookup gives the current state and costs a read; deltas are cheap but need the consumer to merge."],
    p: ["A consumer pausing past the operation log window loses its position and must do a full resync.", "Treating the event as a current state when it describes a past change, so out-of-order processing downstream overwrites newer data."],
    v: "Open a stream, perform an insert, update and delete, and confirm three events in order with resume tokens; restart the consumer from the second token and confirm it receives only the third.",
    dep: ["oplog", "majority-commit-point", "cursor-management"]
  },
  "write-conflict-handling": {
    s: "How the engine detects two concurrent writers modifying the same document and resolves it by aborting and retrying one of them.",
    d: "With snapshot-based versioning, a writer reads a version and, when it tries to write, checks whether the document changed since its snapshot. If so, a write conflict is raised. Outside transactions the server retries the operation internally with a fresh snapshot. Inside a transaction the error returns to the client, flagged as transient, so the whole transaction can be retried. It is hard because contention under high concurrency leads to retry storms.",
    k: ["Optimistic conflict detection vs locking up front: optimistic is cheap when conflicts are rare; contention causes wasted work and retries.", "Automatic internal retry vs surfacing conflicts: internal retry hides conflicts for single writes; transactions must return them because earlier reads were taken on the old snapshot."],
    p: ["Many clients updating one hot document so the throughput collapses to retries.", "Not retrying transient transaction errors at the application level."],
    v: "Run two transactions that update the same document, commit the second first, and confirm the first aborts with a transient conflict error that succeeds on retry; confirm the final value reflects both updates in a retried run.",
    dep: ["mvcc-versioning", "document-level-locking"]
  },
  "replica-set": {
    s: "A group of servers holding copies of the same data, with one primary accepting writes and the others following, forming the basic unit of availability.",
    d: "A replica set typically has three or more voting members. The primary applies writes and appends them to the operation log; secondaries pull and apply them. Members exchange heartbeats and, if the primary is lost, hold an election. A configuration document, itself versioned and replicated, lists members, votes, priorities and tags. It is hard because members in different failure domains need clear priorities, and operators must reason about majorities during partitions.",
    k: ["Three members vs five: three tolerates one failure at lower cost; five tolerates two and costs more storage and replication traffic.", "Single writer vs multiple writers: one primary keeps conflict handling simple; write capacity is limited to one member until sharding."],
    p: ["Two members in one failure domain and one in another, so losing the domain loses the majority.", "Even-sized voting sets that can split into halves with no majority."],
    v: "Stop the primary and confirm a new primary is elected within the election timeout, writes resume with majority concern, and the old primary rejoins as a secondary with identical data.",
    dep: ["oplog", "primary-election", "failure-detection", "secondary-apply"]
  },
  "oplog": {
    s: "A fixed-size log of every data change on the primary, written as idempotent entries that secondaries replay in order.",
    d: "Each write adds one or more entries to a capped collection, expressed so that applying them twice has the same effect as once (for example, an increment becomes a set to the resulting value). Entries have monotonically increasing timestamps. Secondaries tail it, and change streams and backups read from it. The window of time it covers depends on its size and the write rate. It is hard to size: too small and a lagging member or a consumer falls off the end.",
    k: ["Idempotent entries vs operation-as-executed entries: idempotent entries make replay and rollback safe; they can be larger than the original command.", "Large vs small operation log: large gives a long recovery and resume window; it uses disk and holds back space reuse."],
    p: ["A bulk operation that churns the operation log window to minutes, so maintenance of a secondary exceeds it.", "Assuming the window is time-based when it is size-based and shrinks under heavy writes."],
    v: "Read the first and last operation log timestamps, compute the window, and confirm it exceeds the longest planned secondary downtime at peak write rate.",
    dep: ["capped-collections", "clock-and-timestamps", "record-store"]
  },
  "primary-election": {
    s: "A vote among members, using terms and log comparison, to choose a new primary whenever the current one is unreachable or steps down.",
    d: "A secondary that misses heartbeats past a timeout becomes a candidate, increments the election term and requests votes. Members vote for at most one candidate per term, and only if the candidate's log is at least as up to date as theirs. A candidate with a majority becomes primary and the term fences out the old primary. Priorities bias the outcome. It is hard because elections cause a brief write outage, and a flapping network causes repeated elections.",
    k: ["Short vs long election timeout: short recovers quickly from real failures; short also triggers spurious elections on latency spikes.", "Priority to preferred members vs equal members: priorities keep the primary in the best location; they can cause extra elections when the preferred member returns."],
    p: ["Slow disks or long pauses on the primary mistaken for failure, leading to elections that make things worse.", "A candidate winning with a log missing majority-committed writes, which the log comparison rule is meant to forbid."],
    v: "Isolate the primary on the network and confirm a new primary with a higher term emerges after the timeout, the old primary steps down after healing, and no majority-acknowledged writes are lost.",
    dep: ["failure-detection", "replica-set", "oplog"]
  },
  "failure-detection": {
    s: "Members send each other periodic heartbeats and mark a peer unreachable when replies stop for longer than a timeout.",
    d: "Each member pings every other every couple of seconds and records reply time, state, term and its latest applied operation. A missing reply for the election timeout marks the peer down and can trigger an election. A primary that cannot see a majority steps down so it does not accept writes it cannot commit. The same exchange spreads configuration changes and replication progress. It is hard because slow is not dead, and detection is a trade between speed and false alarms.",
    k: ["Heartbeat interval and timeout short vs long: short detects failure fast and raises false positives; long is stable and extends outages.", "Primary stepping down on losing majority vs staying up: stepping down avoids split-brain; it makes the service unavailable during partitions."],
    p: ["Garbage pauses or backup load on a member causing it to miss heartbeats and trigger failover.", "Asymmetric network faults where A hears B but B does not hear A, producing odd states."],
    v: "Block heartbeats to the primary from a majority and confirm the primary steps down within the timeout and rejects writes, while a new primary elected in the majority side accepts them.",
    dep: ["network-layer", "replica-set"]
  },
  "secondary-apply": {
    s: "A secondary fetches new operation log entries from a sync source and applies them in batches, in parallel by document, to keep up with the primary.",
    d: "A producer thread pulls batches from the chosen source (usually the primary or a nearby secondary). Writers apply entries in parallel, partitioned by document id so operations on one document stay ordered. While a batch applies, reads on the secondary see a consistent earlier snapshot rather than a partially applied batch. Progress is reported upstream for write concern. It is hard because the applier can fall behind under heavy writes and then secondary reads become stale.",
    k: ["Parallel apply by document vs single threaded: parallel keeps up with a multi-threaded primary; it needs ordering rules and per-collection handling for some operations.", "Chaining sync sources vs everyone from the primary: chaining reduces primary load; it adds delay and a longer path of lag."],
    p: ["Heavy index builds on a secondary slow apply and lag grows.", "A secondary that falls past the operation log window must be fully resynced."],
    v: "Under sustained writes, compare the primary's last operation time with each secondary's applied time and confirm lag stays within a stated bound; stop a secondary briefly and confirm it catches up after restart.",
    dep: ["oplog", "mvcc-versioning", "replica-set"]
  },
  "initial-sync": {
    s: "How a new or recovered member builds a full copy of the data by cloning from an existing member and then catching up on changes made meanwhile.",
    d: "The member copies each collection and index definition from a source while recording the operation log start point, then applies the operation log entries produced during the copy until consistent. The alternative is to seed it from a file copy or snapshot, which is far faster for large data. During initial sync the member is not eligible to serve reads. It is hard on big data sets: it loads the source, takes a long time and can fail partway.",
    k: ["Network clone vs seeding from a snapshot: cloning is automatic and works anywhere; snapshot seeding is much faster for large data and needs backup tooling.", "Syncing from the primary vs a secondary: a secondary spares the writer; it may be behind or burdened."],
    p: ["Initial sync of a very large member exceeds the operation log window on the source, and the sync restarts from scratch.", "Adding several members at once, overloading the source."],
    v: "Add an empty member, monitor its state through startup, clone and recovery, and confirm that when it reaches secondary state its document counts and checksums match the primary.",
    dep: ["oplog", "replica-set", "snapshot-backup"]
  },
  "rollback": {
    s: "When a former primary rejoins with writes that never reached a majority, it undoes them to match the new primary's history.",
    d: "If a primary accepted writes with weak concern and then lost the election, those writes exist only in its log. When it becomes a secondary it finds the common point with the new primary, reverts later operations using the storage engine's ability to go back to a stable checkpoint, and then replays the new primary's history. Reverted data is saved to files for manual review. It is hard because it means acknowledged data disappears, which applications must have chosen to tolerate by their write concern.",
    k: ["Automatic rollback vs forced resync: rollback to a checkpoint is quick and keeps most data; a full resync is a fallback when the divergence is too large.", "Preserving rolled-back data in files vs discarding: preserving lets operators recover writes; it requires manual reconciliation."],
    p: ["Using weak write concern for data that must survive failovers and then losing it to rollback.", "Ignoring the saved rollback files, so the lost writes are never reviewed."],
    v: "Partition the primary, write with concern one on it, heal, and confirm that it rolls back, the writes appear in a rollback file, and the collection matches the new primary.",
    dep: ["majority-commit-point", "checkpoints", "oplog"]
  },
  "majority-commit-point": {
    s: "The most recent operation time known to be on a majority of members; everything at or before it can never be rolled back.",
    d: "The primary computes it from each member's reported applied and durable times, takes the highest time held by a majority, and distributes it with heartbeats and replies. Secondaries advance their stable snapshot to it. It gates write concern, majority reads, change streams, and what the storage engine keeps as the stable checkpoint. It is hard because it can stall when members are down or lagging, which delays majority acknowledgments and holds memory for old versions.",
    k: ["Advancing on durable majority vs applied majority: durable is safer across crashes; applied is faster to advance and weaker.", "Tying reads to the commit point vs the latest applied: commit-point reads never see rolled-back data; they are slightly behind."],
    p: ["Two of three members down stalls the commit point, and the primary accumulates versions it cannot release.", "Assuming commit point equals the primary's latest write."],
    v: "Stop one secondary and confirm the commit point still advances with the remaining majority; stop a second and confirm it stops advancing and majority writes time out.",
    dep: ["replica-set", "clock-and-timestamps", "write-ahead-journal"]
  },
  "delayed-and-hidden-members": {
    s: "Special replica set members that hold a copy but serve a different purpose: hidden for backup and analytics, delayed as a rewind buffer against mistakes.",
    d: "A hidden member replicates like any other but is invisible to drivers, so no application reads reach it, and it can be given priority zero so it never becomes primary. A delayed member applies the operation log an hour or more behind, so a bad deployment or a dropped collection can be recovered from its older state. Both can vote or not. They are hard to size: a long delay means the operation log window must be longer.",
    k: ["Delayed member vs point-in-time restore from archive: a delayed member gives an immediate copy to extract data from; restore from archive covers longer periods without keeping an extra live node.", "Hidden voting vs non-voting: voting adds fault tolerance; it also makes the majority depend on a node used for heavy workloads."],
    p: ["Delay longer than the operation log window, so the member can never catch up and drops out.", "A delayed member counted as a voter and as a source of fresh majority acknowledgment."],
    v: "Delete a collection on the primary and confirm the delayed member still holds it for the configured delay, and that its data can be copied out; confirm drivers never route reads to a hidden member.",
    dep: ["replica-set", "oplog"]
  },
  "flow-control": {
    s: "A throttle on the primary that slows writes when the majority commit point lags too far behind, keeping lag bounded.",
    d: "The primary watches how far the commit point trails its own latest write. When lag exceeds a target, it limits how many write tickets per second can be issued, proportional to the observed rate at which secondaries are applying. Writes then wait for a ticket. This prevents majority-committed time from falling so far behind that old versions pile up in memory and cache. It is hard because throttling raises latency for applications, which may mistake it for a fault.",
    k: ["Throttle writes vs let lag grow: throttling bounds memory and lag; applications see higher write latency during the slowdown.", "Target lag value low vs high: low values keep the system tight and trigger throttling often; high values tolerate bursts but build a backlog."],
    p: ["A single slow secondary throttles all writes for the set.", "Confusing flow control latency with a database fault and adding retries."],
    v: "Slow one secondary's disk under heavy writes, then confirm flow control metrics show throttling, write latency rises, and the lag between the primary's last write and the commit point stays near the target.",
    dep: ["majority-commit-point", "secondary-apply"]
  },
  "shard-key": {
    s: "The field or fields that decide which shard stores each document, so the choice controls balance, query routing and write distribution.",
    d: "Documents are partitioned by the shard key value, either by ranges of the value or by a hash of it. A good key has high cardinality, spreads writes evenly, and appears in common queries so they target one shard. Compound keys combine these properties. Documents with the same key value live together. It is the most consequential decision in a sharded system: changing it later requires moving the data.",
    k: ["Ranged key vs hashed key: ranged keeps related values together for range queries; it risks hot ranges, while hashed distributes writes but scatters ranges.", "High-cardinality compound key vs single field: a compound key splits large values into smaller chunks; it only targets queries that include its leading fields."],
    p: ["A monotonically increasing key sends every insert to the last chunk on one shard.", "A low-cardinality key creates chunks that cannot be split, so a few values become huge."],
    v: "Load a representative workload and confirm writes spread evenly across shards, that the main queries target a single shard in explain, and that no chunk exceeds the size limit without being splittable.",
    dep: ["hashed-index", "chunk-ranges", "primary-key"]
  },
  "chunk-ranges": {
    s: "The sharded collection's key space is divided into contiguous ranges called chunks, each assigned to exactly one shard.",
    d: "Metadata lists chunks as ranges from minimum to maximum of the key, with the owning shard. A chunk has a target size, and grows until it is split. The balancer moves chunks between shards to even out data. Routers cache the chunk map to route requests and refresh it when a shard reports a stale version. It is hard because chunk metadata is distributed state that must stay consistent through splits and migrations.",
    k: ["Smaller chunks vs larger chunks: small chunks balance finely and move quickly; they inflate metadata and cause more migrations.", "Pre-split chunks vs organic growth: pre-splitting spreads initial load; organic growth is simpler but starts with one hot shard."],
    p: ["A jumbo chunk that cannot be split or moved because all documents share a key value.", "Router caches that are stale after a migration and cost extra round trips."],
    v: "Read the chunk map for the collection and confirm ranges are contiguous, non-overlapping, cover the whole key space, and that document counts per chunk are roughly even.",
    dep: ["shard-key", "shard-metadata"]
  },
  "query-router": {
    s: "A stateless front end that accepts client commands, uses cached chunk metadata to find the right shards, and merges their results.",
    d: "Clients connect to routers as if to a single database. For each query the router extracts the shard key conditions, targets the owning shards or all of them, sends sub-requests, merges results with sorting and limits, and returns a cursor. If a shard reports its metadata version is stale, the router refreshes and retries. Routers can be scaled horizontally. It is hard because a bad query shape turns a cheap routed query into a fan-out.",
    k: ["Separate router tier vs routing in each shard: separate routers scale independently and keep shards simple; they add a network hop.", "Cache chunk map vs ask each time: caching keeps routing fast; stale entries cost retries after migrations."],
    p: ["Routers with limited connection capacity become the bottleneck before the shards do.", "Queries with no shard key condition fan out to every shard, and cost scales with shard count."],
    v: "Run a query on the shard key and confirm in explain that exactly one shard was contacted; run one without it and confirm all shards were contacted and results are merged in order.",
    dep: ["chunk-ranges", "shard-metadata", "scatter-gather-queries"]
  },
  "shard-metadata": {
    s: "A replicated store holding the cluster's authoritative record of shards, sharded collections, chunk ranges, zones and settings.",
    d: "The metadata lives on a dedicated replica set (config servers). Routers and shards read it, cache it, and learn about changes through version numbers carried on every request. Chunk splits, migrations and configuration changes are committed there with majority writes. If it is unavailable, routing continues with cached metadata but changes stop. It is hard because it is a critical dependency: it must be highly available and consistent, and corrupt metadata can misroute data.",
    k: ["Dedicated metadata replica set vs embedded in shards: dedicated isolates and protects it; it adds a component to run and secure.", "Versioned caches vs always read: versioning avoids reading metadata per request; stale caches must be detected and refreshed."],
    p: ["Backing up shards but not the metadata, which makes the backup unusable.", "Treating metadata servers as unimportant and sizing them below the data plane."],
    v: "Make the metadata set unavailable and confirm routers continue serving reads and writes from cache while splits and migrations pause; restore it and confirm balancing resumes.",
    dep: ["replica-set", "chunk-ranges"]
  },
  "chunk-splitting": {
    s: "Dividing a chunk that has grown past its size limit into two chunks at a chosen key value, so it can be moved separately.",
    d: "Shards track approximate data written per chunk. When a chunk passes the threshold, the shard picks split points from the index on the shard key and commits the split to the metadata. Splitting changes only the boundaries, not the data. It is a prerequisite for balancing, as chunks must be small enough to migrate. It is hard when many documents share the same key value, because no split point exists.",
    k: ["Split on growth vs split on balance demand: split-on-growth keeps chunks small continuously; it creates many metadata updates under heavy insert.", "Choose median split vs top-chunk optimization: median halves a chunk evenly; special handling for monotonic inserts avoids moving half of a chunk that was only filled at one end."],
    p: ["Low-cardinality keys that cannot be split leave jumbo chunks.", "A burst of inserts into one chunk creates many splits in a short period."],
    v: "Insert enough documents to pass the chunk size limit and confirm a split appears in the metadata with a new boundary inside the old range and unchanged document placement.",
    dep: ["chunk-ranges", "shard-metadata", "shard-key"]
  },
  "balancer": {
    s: "A background process that evens out data across shards by moving chunks from the fullest shards to the emptiest.",
    d: "Running on the metadata primary, it compares chunk counts or data sizes per shard and per zone, picks a source, destination and chunk, and instructs the migration, one or a few at a time. It respects zones and can be limited to a time window. It is hard because balancing consumes network, disk and cache on the shards during moves, so it competes with live traffic, and an unbalanced load is not always unbalanced data.",
    k: ["Balance by data size vs by chunk count: size better reflects storage use; count is simple but ignores uneven chunk sizes.", "Always on vs scheduled window: always on keeps balance tight; a window protects peak hours but allows drift."],
    p: ["Adding a shard and letting the balancer move terabytes during business hours.", "Even data but uneven traffic, since the balancer does not see hot keys."],
    v: "Add an empty shard and confirm chunk counts per shard converge within a small tolerance over time, with migrations observed in logs and query latency staying within the service target.",
    dep: ["chunk-migration", "chunk-ranges", "shard-metadata"]
  },
  "chunk-migration": {
    s: "Moving one chunk's documents from a donor shard to a recipient while both keep serving reads and writes, then switching ownership atomically.",
    d: "The recipient clones the chunk's documents, the donor records writes to the chunk during cloning and sends them as deltas, then a short critical section blocks writes while the final deltas apply and the metadata update commits ownership. The donor then deletes the old copy asynchronously. A failed migration is aborted and retried. It is hard because it is a multi-party protocol with failure points, and the delete phase generates load afterward.",
    k: ["Online migration vs offline movement: online keeps availability; it needs delta capture, a critical section and cleanup.", "Wait for majority replication before commit vs commit early: waiting protects against loss on donor failover; it lengthens the critical section."],
    p: ["Migrations stalling because writes to the chunk outpace the delta transfer.", "Orphaned documents on the donor after failed cleanup returning duplicates in scatter queries."],
    v: "Migrate a chunk while writing to it continuously, then confirm the document count is conserved, every write is present on the recipient, the donor holds none of the range after cleanup, and writes saw only a brief pause.",
    dep: ["balancer", "shard-metadata", "oplog"]
  },
  "zone-sharding": {
    s: "Assigns ranges of the shard key to labeled groups of shards, so chosen data lives in chosen places such as a region or a hardware tier.",
    d: "Shards are tagged with zone names, and key ranges are associated with zones. The balancer keeps chunks inside the shards of their zone, moving them if necessary. A common use is putting each country's data in its own region for latency and residency rules, with a country prefix in the shard key. It is hard because the zone mapping must match the key design and capacity, and a zone with no shards blocks its data.",
    k: ["Zones for locality vs a single global distribution: zones keep data near users and within legal boundaries; they reduce balancing freedom and create uneven capacity.", "Zone per region vs zone per tier: region zones serve residency; tier zones move cold data to cheaper storage."],
    p: ["Zone ranges that overlap or leave gaps, leaving data unassigned or moving unexpectedly.", "Over-provisioning one zone's capacity while another runs out."],
    v: "Insert documents whose keys fall in two zone ranges and confirm the balancer places each only on shards labeled for its zone, and that moving a range definition triggers migrations to the right shards.",
    dep: ["shard-key", "balancer", "chunk-ranges"]
  },
  "resharding": {
    s: "Changing a collection's shard key online by copying the data into a new layout while the application keeps running, then switching over.",
    d: "The system creates a temporary collection with the new key, clones documents to the right shards in the new layout, applies ongoing writes by replaying the operation log, verifies counts and then briefly blocks writes to swap names. It lets a poor first key be fixed without downtime. It is hard because it needs roughly the data size in extra space, takes time proportional to data, and consumes I/O throughout.",
    k: ["Online resharding vs dump and reload: online avoids downtime; it needs spare capacity and monitoring of progress.", "Reshard the whole collection vs add a suffix to the key: a suffix refines the key cheaply for oversized chunks; changing the fundamental key needs the full move."],
    p: ["Starting without enough free disk, and failing partway.", "Heavy writes during the final catch-up extend the blocked window."],
    v: "Reshard a test collection under load and confirm the new key shows in metadata, document counts and checksums match the pre-change values, and writes were blocked only for the brief switchover.",
    dep: ["shard-key", "chunk-migration", "oplog"]
  },
  "scatter-gather-queries": {
    s: "A query without a shard key condition that must be sent to every shard, with the router merging the partial results.",
    d: "When the router cannot narrow the target set, it sends the query to all shards, each runs it locally using its own indexes, and the router merges sorted partial results, applies the final limit and returns batches. Aggregations push work down and merge on one shard or the router. The cost grows with shard count: latency is the slowest shard, and load multiplies. It is useful for rare queries and costly as the common path.",
    k: ["Accept fan-out for flexibility vs key design for targeting: fan-out supports ad hoc queries; targeted queries scale with data and need key-aligned access.", "Merge at the router vs on a shard: router merging is simple; a shard merge can handle big intermediate results."],
    p: ["Hot endpoints that fan out to every shard, so adding shards does not add capacity.", "One slow shard sets the tail latency of every scattered query."],
    v: "Run a query without the shard key and confirm explain shows all shards contacted with a merge stage; compare latency against the targeted form at the same result size.",
    dep: ["query-router", "shard-key", "aggregation-pipeline"]
  },
  "sharded-transactions": {
    s: "Transactions that touch documents on several shards, committed atomically by a coordinator using a two-phase protocol.",
    d: "The router starts a transaction on each shard involved, with a shared snapshot time. At commit, a coordinator shard asks participants to prepare, each durably records that it can commit and holds its locks, then the coordinator writes the decision and tells them to commit or abort. Recovery resumes in-doubt transactions from the log. It is hard because it costs several round trips and holds resources across shards, and a failed coordinator leaves prepared transactions blocked until recovery.",
    k: ["Cross-shard transaction vs single-shard design: cross-shard gives atomicity across partitions; it is slower and fragile, so designs keep transactions within one shard where possible.", "Prepare then commit vs single phase for one shard: single-phase skips the round trip when only one shard participates."],
    p: ["Frequent cross-shard transactions on a hot path, which multiplies latency.", "A long-prepared transaction holding locks that block other writers during coordinator recovery."],
    v: "Run a transaction updating documents on two shards, kill the coordinator shard's primary between prepare and commit, and confirm after recovery both shards show the same final decision.",
    dep: ["multi-document-transactions", "shard-metadata", "write-ahead-journal", "query-router"]
  }
});
