// Details for the distributed SQL plate, part 3: timestamps and isolation, ranges, consensus, leases.
ATLAS.details("distributed-sql", {
  "hybrid-logical-clock": {
    s: "A timestamp that combines the node's wall clock with a logical counter, so events are ordered causally even when clocks differ slightly.",
    d: "Each node keeps a timestamp equal to the larger of its physical clock and the highest timestamp it has seen, plus a counter to break ties. Every message carries the sender's timestamp, and the receiver advances its own clock past it. This guarantees that if one event caused another, its timestamp is smaller, without a central time service. Timestamps are close to real time, which lets operators query the past by wall-clock time. It is hard because correctness of some guarantees relies on a maximum offset between nodes being respected.",
    k: ["Hybrid logical clock vs pure physical timestamps: causality holds without perfect clocks; timestamps cannot be fully trusted as wall time.", "Hybrid clock vs a central timestamp oracle: no single service to scale or fail; ordering of unrelated transactions is only approximate."],
    p: ["A node with a clock far ahead drags every other node's timestamps forward, until limits reject it.", "The logical counter overflows or stalls when a clock steps backward and is not clamped."],
    v: "Skew one node's physical clock by a few milliseconds, run causally chained transactions across nodes, and confirm every effect's timestamp is greater than its cause's, with the skew visible only in the logical part.",
    dep: ["clock-offset-monitoring"]
  },
  "clock-offset-monitoring": {
    s: "Measures how far each node's clock differs from its peers and removes nodes whose offset exceeds the configured maximum.",
    d: "Nodes exchange timestamps in heartbeats and estimate each peer's offset, correcting for round trip time. If a node finds its offset against a majority of peers exceeds a fraction of the maximum allowed offset, it shuts itself down rather than risk returning stale reads. This enforces the assumption behind uncertainty intervals. The maximum offset is a trade: set it large and reads face wider uncertainty, set it small and a clock hiccup removes nodes. It is hard to measure because network delay is asymmetric and noisy.",
    k: ["Self-fencing on excessive offset vs continuing to serve: fencing protects consistency; a clock fault becomes an availability event.", "Large vs small maximum offset: a large value tolerates poor clocks; every read pays a wider uncertainty window."],
    p: ["A virtual machine pause or leap-second smear creates a sudden offset and takes out several nodes together.", "Using a loose maximum offset in testing hides clock problems that appear in production."],
    v: "Step one node's clock past the threshold and confirm it stops serving within the heartbeat period and logs the measured offset, while the cluster continues with the remaining nodes.",
    dep: ["hybrid-logical-clock", "node-liveness"]
  },
  "uncertainty-intervals": {
    s: "A window after a transaction's read timestamp in which a value's commit order relative to the reader is ambiguous because of clock offset, forcing a restart.",
    d: "When a transaction starts reading at timestamp T, a value committed at T+x on a node whose clock lags might actually have committed before T in real time. If x is smaller than the maximum clock offset, the reader cannot tell. It must treat the value as visible and advance its timestamp past it, restarting reads if needed. Each transaction restarts at most once per node it reads from. This lets the system promise that a read sees everything that finished before it started, without synchronized clocks.",
    k: ["Uncertainty restarts vs waiting out the offset before every commit: restarts cost only on conflict; waiting adds the maximum offset to every write.", "Per-node uncertainty bound vs global: a per-node bound limits restarts to once per node; it requires tracking each node's observed timestamps."],
    p: ["A hot key written constantly causes reads on neighboring nodes to restart again and again within the window.", "Long-running read transactions across many nodes accumulate restarts and look slow without any lock waits."],
    v: "Write a value on one node, immediately read it from another with offset set near the bound, and confirm the read sees the value after a restart that is visible in the transaction's retry counters.",
    dep: ["hybrid-logical-clock", "clock-offset-monitoring", "read-refreshes"]
  },
  "timestamp-cache": {
    s: "A per-leaseholder record of the highest timestamp at which each key was read, used to stop a later write from landing in the past of a completed read.",
    d: "When the leaseholder serves a read it records the key or span and the read timestamp in an in-memory interval cache. A write below that timestamp is pushed above it, so that no committed value ever appears under a read that already returned. This keeps reads repeatable and gives the serializable order. The cache has bounded size: old entries are collapsed into a single low-water mark. A new leaseholder starts the mark at the lease start, which is why leases must not overlap. Pushed writers must refresh their reads or restart.",
    k: ["Bounded cache with a low-water mark vs exact history: bounded memory; low-water collapse causes unnecessary pushes for old keys.", "Cache on the leaseholder only vs replicated: local means no consensus cost; every lease change resets knowledge to a conservative mark."],
    p: ["A large scan fills the cache with its span and pushes unrelated writers.", "A lease transfer that fails to carry over the low-water mark could let a write rewrite history."],
    v: "Read a key at timestamp T, then try a write with a lower timestamp, and confirm the write commits only above T and the transaction reports a pushed timestamp.",
    dep: ["leaseholder", "hybrid-logical-clock"]
  },
  "read-refreshes": {
    s: "Re-checks that a transaction's earlier reads are still valid at a newer timestamp, so it can commit there without restarting from scratch.",
    d: "When a transaction's writes are pushed to a later timestamp, serializability requires its reads to be unchanged at that new time. The coordinator tracks the spans it read and sends a refresh request to each range, which checks that no value was written to those spans between the old and new timestamps. If none were, the transaction advances; otherwise it must restart. Refreshing avoids client-visible retries in the common case. It is limited by memory for tracked read spans and by how long a transaction has been reading.",
    k: ["Server-side refresh vs client retry on every push: refresh hides most conflicts from the application; large read sets cannot be tracked and fall back to errors.", "Tracking exact read keys vs spans: spans bound memory; they produce spurious refresh failures."],
    p: ["A transaction that has already sent results to the client cannot be restarted, so a failed refresh surfaces as an error.", "Applications that never retry see serialization failures during hot-key traffic."],
    v: "Run a read-then-write transaction while another writes an unrelated key in the same range, and confirm the first commits via a successful refresh with no client retry, while a conflicting write forces a retry error.",
    dep: ["timestamp-cache", "transaction-coordinator"]
  },
  "serializable-isolation": {
    s: "The default guarantee: transactions behave as if they ran one at a time in some order, with no write skew or phantoms.",
    d: "Reads and writes are ordered by timestamp, the timestamp cache prevents writes beneath completed reads, and refreshes validate read sets when a transaction moves forward in time. Conflicts that cannot be ordered consistently cause one transaction to retry. Because writes are intents and readers push rather than block, many conflicts resolve cheaply. The guarantee removes whole classes of anomalies applications would otherwise handle. The cost is retries under contention, which clients must handle by rerunning the transaction in a loop.",
    k: ["Serializable by default vs a weaker default: serializable avoids subtle anomalies; contended workloads see retries that must be handled.", "Optimistic ordering with retries vs pessimistic locking: no lock waits for readers; hot writes retry repeatedly."],
    p: ["Client code that does not retry on a serialization error turns a normal event into user-visible failures.", "Long transactions on hot rows retry forever because each attempt conflicts again."],
    v: "Run a write-skew test, two transactions each reading both rows and updating a different one under a constraint, and confirm one of them fails with a retry error and the invariant holds.",
    dep: ["timestamp-cache", "read-refreshes", "write-intents"]
  },
  "read-committed-mode": {
    s: "A weaker isolation option where each statement sees data committed at its own start, reducing retries at the cost of anomalies serializable would prevent.",
    d: "Each statement takes a fresh read timestamp rather than one for the whole transaction. A conflict at write time is resolved by rereading the latest value and reevaluating the statement, which avoids restarting the transaction. Locking reads can be used to protect specific rows. This mode matches expectations of applications built for other databases and removes most serialization errors. It cannot prevent write skew or non-repeatable reads, so correctness must be enforced with explicit locks or constraints.",
    k: ["Per-statement snapshots vs per-transaction snapshots: statement snapshots avoid retries and match legacy behavior; results can change within one transaction.", "Rereading and reevaluating on conflict vs restarting: statement-level retry hides conflicts; it needs careful semantics for statements with side effects."],
    p: ["An application ported assuming serializable semantics silently loses an invariant under this mode.", "A statement reevaluated after a conflict can skip or double-process rows in a long scan."],
    v: "Run the write-skew test under this mode and confirm both transactions commit with no retry, then add a locking read and confirm one waits and the invariant holds.",
    dep: ["serializable-isolation", "lock-table"]
  },
  "ordered-keyspace": {
    s: "A single sorted space of byte-string keys holding all tables, indexes and system data, which sharding divides into contiguous ranges.",
    d: "All data is key-value pairs ordered by key, so adjacent rows of a table, and adjacent index entries, are adjacent in the space. System data such as range descriptors and metadata sit at the start. Ordered sharding supports efficient range scans and lets ranges split anywhere. It differs from hash sharding, which spreads load evenly but makes scans touch every shard. The challenge is that sequential keys concentrate writes, so data modeling must account for key order.",
    k: ["Range sharding vs hash sharding: range keeps scans local and splits flexible; sequential keys create hot spots.", "One global keyspace vs separate per-table spaces: a single space gives one uniform sharding mechanism; table boundaries need explicit splits."],
    p: ["Treating the keyspace as unordered leads to a hot last range for time-ordered inserts.", "Metadata keys misplaced among user data make recovery and tooling unsafe."],
    v: "Scan a key span covering one table and confirm the keys return in sorted order from consecutive ranges, and that the table's boundaries match the descriptor's index spans.",
    dep: ["key-encoding"]
  },
  "range-descriptors": {
    s: "The record of each range's start and end keys, its replicas and its generation, stored in a replicated index that clients and nodes consult to find data.",
    d: "A descriptor lists the key bounds, the nodes and stores holding replicas, and a generation number bumped on every change. Descriptors are stored in two levels of index ranges, so a lookup takes at most two hops and the upper level is small enough to be always cached. A split or replica change updates descriptors inside a transaction, which makes changes atomic with the range's own data. It is hard because descriptors are read constantly yet change at the worst moments, during failures.",
    k: ["Two-level index vs a flat table of descriptors: two levels scale to billions of ranges; a lookup may need two hops.", "Transactional descriptor updates vs separate coordination: the same machinery gives atomic changes; a descriptor range outage blocks reconfiguration."],
    p: ["A descriptor range that is unavailable prevents lookups for uncached ranges, which looks like a whole-cluster failure.", "Cached descriptors in clients and nodes go stale after a rebalance and cause redirected requests."],
    v: "Look up the descriptor for a key, split its range, and confirm the generation number increases, the new bounds are correct, and a stale client is redirected and refreshes its cache.",
    dep: ["ordered-keyspace", "transaction-coordinator"]
  },
  "range-cache": {
    s: "Each node's cache of recent key-to-range-to-leaseholder lookups, so most requests go directly to the right replica.",
    d: "Before sending a request the sender looks up the key's descriptor and the last known leaseholder in the cache and sends it to that node. If the range has moved or split, the receiving node responds with an error carrying fresh information and the sender updates the cache and retries. Misses go to the descriptor index. Because entries are validated by the replica that gets the request, the cache needs no invalidation protocol. The cost is occasional extra hops after changes and a cold start after restart.",
    k: ["Lazy validation by redirect vs pushing invalidations: no coordination and always safe; stale entries cost one extra round trip.", "Caching leaseholder with the descriptor vs only descriptors: direct hits are fastest; a lease move makes every cached leaseholder wrong at once."],
    p: ["A mass lease transfer causes a storm of redirects from every gateway.", "A cold gateway after restart sends many lookups to the descriptor ranges."],
    v: "Warm the cache, move a range's lease, and confirm the next request incurs exactly one redirect, then goes direct from the refreshed entry.",
    dep: ["range-descriptors"]
  },
  "size-based-splits": {
    s: "Splits a range in two when its data grows past a size limit, keeping every range small enough to move and to repair quickly.",
    d: "A background queue checks each range's size. When it exceeds the limit, typically tens to hundreds of megabytes, the leaseholder chooses a split key near the middle, and a transaction updates descriptors and creates the new range, which starts with the same replicas and consensus state. Small ranges move quickly during rebalancing and recover faster, but increase metadata and per-range overhead such as heartbeats. The tuning balance is range size against the number of ranges per node.",
    k: ["Small ranges vs large ranges: small ones rebalance and recover quickly; they raise per-range overhead and metadata.", "Splitting at the middle key vs at a load-aware key: middle splits are simple; a hot spot may land in one half."],
    p: ["Splitting during a burst of writes adds consensus work when the node is already busy.", "A single row larger than the range limit cannot be split and degrades its range."],
    v: "Load data into one table until a range exceeds its limit and confirm that range splits at a key near the middle with both halves having identical replica sets and no client errors.",
    dep: ["range-descriptors", "raft-group"]
  },
  "load-based-splits": {
    s: "Splits a range that is small but hot, choosing a key that divides observed requests evenly so work can spread over several nodes.",
    d: "A leaseholder samples the keys of incoming requests and keeps a reservoir of recent ones. When the request rate or CPU crosses a threshold for long enough, it picks a split key which balances the load on each side, avoiding keys whose split would put every request on one side. After splitting, the allocator can move halves to different nodes. This turns hot spots on divisible data into distributed load. It cannot help a single hot key, where no split key exists.",
    k: ["Splitting by observed load vs size only: load splits relieve hot small ranges; they add ranges and metadata for a temporary pattern.", "Merging load-split ranges back later vs keeping them: merging limits range count; heat returning causes split churn."],
    p: ["Heat on one row never goes away after splitting and the system keeps trying.", "Scans that cross the split key are slower after the split because they touch two ranges."],
    v: "Drive reads at a rate that saturates one range with keys spread over its span, and confirm it splits at a balanced key and per-node CPU evens out afterward.",
    dep: ["hot-range-report", "range-descriptors"]
  },
  "range-merges": {
    s: "Combines two adjacent ranges that have become small or cold, reducing the number of ranges and the overhead of managing them.",
    d: "A background queue finds a range below a minimum size beside a neighbor and proposes a merge. The two ranges must have the same replicas, so one may need to move first. The merge transaction freezes the right-hand range, updates the left descriptor to cover both and removes the right descriptor. The left range then takes over the key span. It is hard because a merge must be atomic with in-flight requests, and a concurrent split or rebalance must not leave the ranges inconsistent.",
    k: ["Automatic merging vs only splitting: merging keeps range count low after deletes; it can undo load splits that the workload will need again.", "Freezing the right range during merge vs merging online: freezing is simple and safe; requests to it block briefly."],
    p: ["Merging ranges with different replica sets forces data movement just to merge.", "Merge during heavy writes to the right range stalls those writes for the freeze."],
    v: "Delete most rows of a table so adjacent ranges shrink, and confirm they merge into one range with the descriptor spanning both, while concurrent reads across the boundary see no errors.",
    dep: ["range-descriptors", "membership-change"]
  },
  "raft-group": {
    s: "A separate consensus group for each range, in which one leader orders all writes to the range and replicates them to followers.",
    d: "Every range's replicas form a group with its own log, term and leader. Many thousands of groups run on each node, so network heartbeats, scheduling and log storage are shared among them. A leader proposes commands such as writes and descriptor changes. They apply in log order to the state machine, the storage engine, on every replica. Using one group per range rather than one for everything lets throughput scale with the number of ranges and confines a failure to the ranges it touches.",
    k: ["Per-range groups vs one global log: per-range groups scale writes with range count; a transaction touching many ranges needs a commit protocol on top.", "Three vs five replicas: five survive two failures; each write needs more acknowledgments and more storage."],
    p: ["Thousands of idle groups each sending heartbeats consume network and CPU unless coalesced.", "A slow disk on the leader slows every group that node leads."],
    v: "Kill the leader node of a range under write load and confirm a follower is elected, writes resume within seconds, and no acknowledged write is lost on any surviving replica.",
    dep: ["raft-log", "leader-election", "quorum-commit"]
  },
  "raft-log": {
    s: "The ordered, durable sequence of commands for one range, appended on the leader and replicated to followers before they are applied.",
    d: "Each entry has an index, a term and a command. Followers append entries from the leader after verifying that the previous entry matches, and truncate any conflicting suffix. Entries are flushed to disk before being acknowledged. Once committed, entries are applied to the storage engine, and old entries are truncated after a snapshot point so the log does not grow forever. Logs are stored separately from the data engine in some designs to limit write interference. The difficulty is that every write costs a log write and a data write.",
    k: ["Separate log storage vs the log in the data engine: separate storage avoids compaction interference; it needs a second durable store and its own flush.", "Truncating aggressively vs retaining entries: aggressive truncation saves disk; lagging followers then need a full snapshot."],
    p: ["Truncating past a slow follower's position forces an expensive snapshot instead of catch-up.", "Fsync latency on the log device sets the floor for every write's latency."],
    v: "Write entries, crash a follower mid-append, restart it, and confirm its log is truncated or extended to match the leader's and its applied state converges to the leader's checksum.",
    dep: ["raft-group", "lsm-engine"]
  },
  "leader-election": {
    s: "Chooses one replica to order a range's writes after a failure or startup, using terms and majority votes so there is never more than one leader per term.",
    d: "A follower that stops hearing from the leader increments its term and asks for votes. A replica votes for at most one candidate per term, and only for one whose log is at least as current as its own. A majority makes a leader. Randomized timeouts avoid repeated ties. In practice the lease and the leader are kept on the same node for speed, so elections also depend on lease transfer. It is hard to tune: short timeouts recover fast but trigger spurious elections under load or network jitter.",
    k: ["Short election timeouts vs long: short ones recover quickly from failure; transient delays cause leader churn that stalls writes.", "Pre-vote phase vs direct election: pre-vote stops a partitioned replica from disrupting a stable leader; it adds a round to real elections."],
    p: ["A node with a slow disk looks dead, loses leadership, regains it and flaps.", "After a partition heals, a replica with an inflated term can force an unnecessary election."],
    v: "Partition the leader from its followers for ten seconds and confirm a new leader is elected within the timeout, the old leader steps down after healing, and no two leaders accept writes in the same term.",
    dep: ["raft-group", "heartbeat-coalescing"]
  },
  "quorum-commit": {
    s: "Marks a write committed once a majority of the range's replicas have durably logged it, so any minority can fail without losing it.",
    d: "The leader appends an entry, sends it to followers in parallel, and counts acknowledgments including its own. When a majority has persisted it, the entry commits and can be applied and acknowledged to the caller. In a multi-region cluster, where the replicas are placed decides which round trip a commit waits for: the nearest majority, not all replicas. A write is safe against losing any minority; losing a majority stops writes for that range until replicas return.",
    k: ["Majority quorum vs all replicas: majority tolerates slow or failed replicas; reads must go through the leader or a lease to be sure they are current.", "Replica placement near the writers vs spread evenly: nearby majorities give low write latency; they weaken survival of a region loss."],
    p: ["Two of three replicas in one failure domain lose the majority when it fails.", "A slow follower included in the nearest majority adds its latency to every write."],
    v: "Commit writes with one of three replicas down and confirm latency is unchanged; take down a second replica and confirm writes stop while reads of closed timestamps on the survivor continue.",
    dep: ["raft-log", "localities"]
  },
  "raft-snapshots": {
    s: "A full copy of a range's state sent to a replica that is too far behind, or brand new, for the log to catch it up.",
    d: "When a replica needs entries the leader has already truncated, or a new replica is added, the leader streams a consistent snapshot of the range's data at a log index. The recipient receives it into temporary files, then installs it atomically and resumes from that index. Snapshots can be large and expensive on source and network, so they are rate limited and queued per node. They are the mechanism behind rebalancing and up-replication. They are hard because they compete with foreground I/O and must be consistent despite concurrent writes.",
    k: ["Snapshot vs log catch-up: snapshots are the only option once the log is truncated; they cost far more than replaying a short gap.", "Rate-limited snapshots vs as fast as possible: limiting protects foreground work; recovery of lost redundancy takes longer."],
    p: ["Many snapshots arriving at a recovering node overload its disk and delay its return.", "A snapshot that takes longer than the log retention is obsolete when it finishes."],
    v: "Add a replica to a loaded range and confirm it receives a snapshot, applies it atomically, then catches up on the log tail and matches the leader's checksum without client errors.",
    dep: ["raft-log", "snapshot-throttling", "bulk-ingestion"]
  },
  "membership-change": {
    s: "Adds, removes or replaces replicas of a range safely, passing through a joint configuration so old and new majorities never decide independently.",
    d: "Changing from one replica set to another in a single step could allow two disjoint majorities. The group first enters a joint configuration where commits need a majority of both the old and the new set, then moves to the new one. New replicas are added as non-voting learners and promoted only after catching up by snapshot. The descriptor update is part of the change. It is hard because a change in progress can be interrupted by failures, and the group must always be able to finish or roll it back.",
    k: ["Joint configuration vs one change at a time: joint allows atomic replacement; it needs two majorities during the transition.", "Learner before voter vs adding voters directly: learners cannot block commits while copying; it adds a step and time."],
    p: ["Adding a voter that has not caught up can stall commits for the whole range.", "A crash between the joint and final configuration leaves the range in a state operators do not recognize."],
    v: "Replace one replica of a range under write load and confirm the group passes through the joint state, writes never stall beyond one round trip, and the final descriptor lists exactly the new set.",
    dep: ["raft-group", "raft-snapshots", "range-descriptors"]
  },
  "heartbeat-coalescing": {
    s: "Combines the liveness messages of every range led by one node into a single message per peer, avoiding a quadratic flood of heartbeats.",
    d: "With tens of thousands of ranges per node, individual per-range heartbeats would overwhelm the network and the scheduler. Instead a node sends one message to each peer containing the heartbeats of all ranges they share. Quiescing goes further: idle ranges stop heartbeating at all until activity resumes, and wake when a request arrives. The tradeoff is detection speed and precision, since a node-level failure is detected by one missed message for all ranges at once.",
    k: ["Coalesced node-level heartbeats vs per-range heartbeats: coalescing scales with nodes not ranges; one slow message delays liveness of every range.", "Quiescing idle ranges vs keeping all awake: quiescing saves CPU and bandwidth; waking a range adds latency to the first request."],
    p: ["A node that is slow but alive causes all its ranges to appear failed together.", "Quiesced ranges miss a failure until the next request touches them."],
    v: "Run a cluster with a hundred thousand mostly idle ranges and confirm heartbeat message rate scales with the number of nodes and stays flat as ranges are added.",
    dep: ["raft-group", "node-liveness"]
  },
  "leaseholder": {
    s: "The one replica of a range that holds a time-limited lease and serves its consistent reads and coordinates its writes without a consensus round for reads.",
    d: "A lease grants one replica the right to serve reads for a range during a time period. The leaseholder keeps the timestamp cache and lock table in memory and serves reads from its own storage, so a read costs no cross-node round trip. Writes are proposed through the consensus leader, which is normally the same node. Leases must never overlap, since two nodes both serving reads could return inconsistent data; they therefore rely on clock bounds or on liveness records. The hard part is moving them safely.",
    k: ["Leased reads from one replica vs quorum reads: leases give local reads; clock assumptions and lease handoff must be exactly right.", "Lease tied to node liveness vs per-range expiration: liveness-based leases renew cheaply for many ranges; a node liveness failure affects all its leases."],
    p: ["Overlapping leases after a clock fault break the consistency of reads.", "A leaseholder in a distant region adds a cross-region hop to every query on its range."],
    v: "Read a key from the leaseholder and confirm no consensus traffic is generated; kill that node and confirm no read is served by anyone until the new lease begins after the old one has expired.",
    dep: ["raft-group", "timestamp-cache", "node-liveness"]
  },
  "lease-transfer": {
    s: "Moves a range's lease from one replica to another deliberately, to follow load, put the lease near its users or drain a node.",
    d: "The current leaseholder stops serving new requests, proposes a lease transfer through the range's log naming the target, and applies it when committed. It carries its timestamp-cache low-water mark so the new holder cannot accept writes below reads already served. The target must have applied all previous entries. When a leaseholder crashes instead, a replica takes the lease only after the old one expires. Transfers should be quick because requests pause during them, and the cached location in every gateway becomes stale.",
    k: ["Graceful transfer vs waiting for expiry: transfer takes milliseconds; expiry after a failure takes seconds during which the range is unavailable.", "Lease follows the leader vs lease following users: colocation keeps writes cheap; user placement speeds reads, and writes then pay an extra hop."],
    p: ["A lease transferred to a replica behind on the log delays all reads until it catches up.", "Ping-ponging a lease between two nodes under load causes repeated pauses."],
    v: "Transfer a lease under read load and confirm the pause is under one round trip, no read returns stale data, and clients' next request after the redirect hits the new holder.",
    dep: ["leaseholder", "range-cache"]
  },
  "follower-reads": {
    s: "Serves reads from any replica, including nearby non-leaseholders, when the reader accepts data slightly in the past, avoiding a trip to a distant leaseholder.",
    d: "A read at a timestamp at or below the range's closed timestamp can be served by any replica that has applied the log up to that point, since no later write can appear beneath it. The client asks for a slightly stale read, or the transaction is read-only, and the gateway routes it to the nearest replica. This turns cross-region reads into local ones. The trade-off is staleness of a few seconds, equal to the closed timestamp lag. It cannot serve reads that must see the latest write.",
    k: ["Stale follower read vs consistent leaseholder read: follower reads are local and offload leaseholders; they return data a few seconds old.", "Explicit opt-in vs automatic: opt-in makes staleness a visible application choice; automatic use would silently break read-your-writes."],
    p: ["Reading your own write immediately after committing returns the old value from a follower.", "A follower lagging on log application cannot serve at the requested timestamp and redirects."],
    v: "Update a row in one region, read it with a follower read from another region, and confirm the old value is returned locally with low latency until the closed timestamp passes the update.",
    dep: ["closed-timestamps", "localities"]
  },
  "closed-timestamps": {
    s: "A promise from the leaseholder that no new write will be accepted at or below a given timestamp, letting replicas serve reads there safely.",
    d: "The leaseholder advances a closed timestamp, typically a few seconds behind the present, and refuses to accept writes beneath it. The value travels to followers with log entries and, for idle ranges, through a side channel that covers many ranges at once. A follower that has applied the log through the corresponding point may serve reads at or below it. Changefeeds also use it as the resolved timestamp. It is hard because it forces long writes to restart or be pushed above it, and ranges with future-timestamped writes need the target lead.",
    k: ["Small lag behind present vs large lag: small lag gives fresher follower reads; writes in progress are pushed more often.", "Side-channel propagation vs in the log only: the side channel keeps idle ranges' timestamps advancing cheaply; it adds a second mechanism to keep consistent."],
    p: ["A transaction still running below the closed timestamp is forced to refresh or restart.", "Idle ranges not covered by the side channel stop advancing and block follower reads and changefeed progress."],
    v: "Watch a range's closed timestamp advance on all replicas, attempt a write below it and confirm it is pushed above, and confirm a follower read at the closed timestamp succeeds.",
    dep: ["leaseholder", "raft-log", "hybrid-logical-clock"]
  },
  "bounded-staleness-reads": {
    s: "Reads that return the freshest data a nearby replica can serve provided it is no more than a stated age, falling back to the leaseholder if not.",
    d: "The application specifies a maximum staleness or a minimum timestamp. The gateway finds the most recent timestamp that all nearby replicas covering the needed ranges can serve, which is the minimum of their closed timestamps, and if it is within the bound executes locally at that time. Otherwise it goes to the leaseholder. The read is consistent at one timestamp across ranges. It lets applications state a freshness requirement instead of choosing between always local and always remote.",
    k: ["Bounded staleness vs exact staleness: a bound lets the system choose the freshest local timestamp; exact staleness is simpler and predictable.", "Fall back to leaseholder vs fail: falling back keeps availability; latency becomes bimodal."],
    p: ["A bound tighter than the closed-timestamp lag always falls back, so the feature never helps.", "Multi-range queries use the minimum timestamp, so one lagging range makes all of them staler."],
    v: "Issue reads with a thirty-second bound from a remote region and confirm they are served locally and the returned timestamp is within the bound; with a bound of zero confirm they reach the leaseholder.",
    dep: ["follower-reads", "closed-timestamps"]
  },
});
