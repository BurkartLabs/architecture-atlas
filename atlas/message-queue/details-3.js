// Details for the message queue plate, part 3: log storage, replication.
ATLAS.details("message-queue", {
  "append-only-log": {
    s: "The core data structure: records are only ever added at the end of a file, never modified in place, which makes writes sequential and reads simple.",
    d: "Each partition is one logical log made of files. A write appends a batch at the tail and assigns offsets; a read starts at an offset and scans forward. Because nothing is overwritten, writes use sequential disk access, which is fast even on spinning disks, and the operating system can read ahead. Old data is removed only by deleting whole files. The structure makes recovery, replication and replay easy to reason about. The difficulty is that space is reclaimed only through retention or compaction, never by editing a record.",
    k: ["Immutable append-only records vs update in place: append-only gives fast sequential writes and trivial replication, but corrections require writing a new record.", "One log per partition vs a shared log for many partitions: per-partition logs keep reads and deletion independent, a shared log gives better sequential write behavior with many partitions."],
    p: ["Treating the log as editable, expecting to remove one record, is impossible without compaction or rewriting the topic.", "Thousands of active logs on one disk turn sequential writes into scattered ones."],
    v: "Write a million records, then read them back from several offsets and confirm bytes and order match, and that disk write patterns observed on the device are overwhelmingly sequential.",
    dep: ["log-segments","offsets","record-batch-format","page-cache-reliance"]
  },
  "offsets": {
    s: "A sequence number that identifies each record's position within a partition. Offsets increase by one per record and are never reused, so a position is a stable address.",
    d: "The leader assigns the next offset to each record at append, and the offset is stored in the batch. Consumers track progress as the offset of the next record to read. Offsets are meaningful only within one partition. Beginning and end offsets move as retention deletes the head and appends extend the tail. Compaction leaves gaps in the sequence but never renumbers. The difficulty is that offsets can be invalidated by deletion, by truncation after a leader change, and are not comparable across partitions or clusters.",
    k: ["Logical sequential offsets vs byte positions: sequential numbers survive compression and let batches be addressed by any record, byte positions are simpler to map to a file but break across replicas.", "Offsets assigned by the leader vs by the producer: leader assignment guarantees a single order, producer assignment would conflict across producers."],
    p: ["Assuming offsets are contiguous after compaction or transactions causes an off-by-one when counting records.", "Reusing an offset from one cluster against a mirrored copy points to the wrong record."],
    v: "Append records, delete the head with retention, and confirm the earliest offset moves forward while every remaining record keeps its original offset and a read below it is rejected.",
    dep: ["append-only-log","leader-epochs"]
  },
  "log-segments": {
    s: "The log is split into fixed-size files called segments. Only the newest is written; old ones are read-only and deleted or compacted as whole units.",
    d: "A segment holds a range of offsets, named by its first offset, with companion index files. When the active segment reaches a size or age limit, it is closed and a new one starts. Retention deletes entire segments whose newest record is old enough, which is a cheap file delete. Compaction rewrites segments into new ones. Segment size trades deletion granularity against file count. The difficulty is that retention can only act on closed segments, so a slow-filling topic keeps data longer than its time limit.",
    k: ["Large segments vs small: large means fewer files and handles, small gives finer retention and quicker compaction and recovery.", "Roll by size only vs also by time: adding a time limit makes low-traffic topics expire on schedule, at the cost of many tiny segments."],
    p: ["A quiet topic never rolls its active segment, so its data outlives the retention period by far.", "Many tiny segments exhaust file handles and slow broker startup."],
    v: "Produce until three segments roll, set a short retention, and confirm only closed segments older than the limit are removed, while the active one and its indexes remain.",
    dep: ["append-only-log","offset-index","retention-policy"]
  },
  "offset-index": {
    s: "A sparse file mapping offsets to byte positions in a segment, so a read for any offset can jump near its location and scan a short distance.",
    d: "As records are appended, the broker adds an index entry only every few kilobytes, pairing a relative offset with a file position. The index is memory-mapped, so lookups are binary searches in the page cache. To find an offset, the broker picks the segment by name, searches the index for the nearest earlier entry, then scans forward from there. Sparse entries keep the index small. The difficulty is crash safety: the index is rebuilt from the log after an unclean shutdown, which slows recovery.",
    k: ["Sparse index with a short scan vs a dense index: sparse is tiny and cached, dense avoids scanning but costs memory and write time.", "Memory-mapped index vs explicit reads: mapping uses the page cache with no copies, but index size competes with data for cache."],
    p: ["A corrupt or missing index after a crash forces a rebuild that delays startup for large logs.", "Index entries are preallocated in size, so many segments consume memory-mapped address space."],
    v: "Read at a random offset in a large segment and confirm the broker reads only a few kilobytes beyond the target. Delete the index file, restart and confirm it is rebuilt and reads still return the same records.",
    dep: ["log-segments","page-cache-reliance"]
  },
  "time-index": {
    s: "A sparse index from record timestamps to offsets, used to find the first record at or after a time, for seeking by timestamp and time-based retention.",
    d: "Alongside the offset index, an index of maximum timestamp so far against offset is maintained per segment. A lookup by time finds the first offset whose timestamp is not earlier than the target. Retention by time uses the largest timestamp in a segment to decide whether the whole segment has expired. Timestamps come from producers or are set by the broker at append, selected per topic. The difficulty is that producer clocks can be wrong, so out-of-order or future timestamps make time lookups and retention unreliable.",
    k: ["Producer-assigned timestamps vs broker append time: producer time reflects when an event happened, append time is monotonic and trustworthy but loses event time.", "Index maximum timestamp vs exact per-record timestamps: the maximum is small and fast, but timestamp lookups are approximate when records arrive out of order."],
    p: ["A producer with a clock far in the future keeps its segment from ever expiring under time retention.", "Seeking by timestamp assumes timestamps rise, which late-arriving data violates."],
    v: "Write records with known timestamps, seek to a midpoint time and confirm the first returned record is the earliest at or after it, within the documented tolerance for out-of-order data.",
    dep: ["log-segments","clock-and-timestamps","offset-index"]
  },
  "record-batch-format": {
    s: "The on-disk and on-wire layout of a batch: a header with offsets, timestamps, producer identity and checksum, followed by records, compressed as a unit.",
    d: "A batch begins with a header holding base offset, length, leader epoch, checksum, attributes such as compression codec and transaction flags, timestamp range, producer id, epoch and base sequence, and record count. Records inside use variable-length integers and store deltas for offsets and timestamps to save space. Because the same bytes are written by producers, stored by brokers and read by consumers, the broker can copy them without reformatting. The difficulty is evolving the format while old data remains on disk and old clients are connected.",
    k: ["Identical format on wire and disk vs separate formats: one format enables zero-copy transfer and no conversion, but ties wire evolution to storage compatibility.", "Delta and variable-length encoding vs fixed fields: deltas shrink small records considerably, but make random access inside a batch sequential."],
    p: ["A format change that old brokers cannot read must wait until all brokers are upgraded and the old data is rewritten or aged out.", "Very small records spend most bytes on batch header overhead."],
    v: "Dump a segment with the log inspection tool and confirm each batch header shows consistent offsets, timestamps, producer fields and a checksum that validates against the payload.",
    dep: ["checksums","compression","wire-protocol"]
  },
  "page-cache-reliance": {
    s: "The broker keeps no large cache of its own: it writes into and reads from the operating system's file cache, which holds recently used log data in memory.",
    d: "Appends land in cached file pages and are flushed to disk later by the operating system. Reads of recent data are served from those same pages with no extra copy into the application heap. Because the cache survives a broker process restart, a restarted broker starts warm. Leaving memory to the cache rather than a large managed heap also avoids long memory-management pauses. The difficulty is capacity planning: a lagging consumer reading old data evicts hot tail data, and memory pressure on the host changes performance without any broker metric changing.",
    k: ["Rely on the operating system cache vs a custom in-process cache: the OS cache needs no tuning and survives restarts, but gives the broker no control over eviction.", "Small broker heap with large free memory vs large heap: free memory holds more log data in the cache and avoids long pauses, but needs a host dedicated to the broker."],
    p: ["Co-locating other memory-hungry processes on a broker host shrinks the cache and quietly raises read latency.", "A single consumer scanning old data evicts the hot tail that live consumers depend on."],
    v: "Run live consumers, then start a full-history replay and watch disk read rate and live consumer latency. Confirm that latency rises when the cache is churned and returns to normal afterward.",
    dep: ["append-only-log","fetch-path"]
  },
  "zero-copy-reads": {
    s: "A read path where file data moves from the page cache to the network socket inside the kernel, without being copied into the broker's own memory.",
    d: "The broker asks the kernel to transfer a file range directly to the socket. Data goes from cached pages to the network card's buffers, skipping the copy into user memory and back. This saves CPU and memory bandwidth and lets one node serve many consumers at line rate. It works because stored batches are already in wire format. It cannot be used when the data must be transformed in user space, as with encryption in the broker process or down-conversion for old clients. The difficulty is losing it silently through configuration.",
    k: ["Direct file-to-socket transfer vs reading into application memory: direct saves CPU and copies, but forbids any transformation of the bytes.", "Serve stored format unchanged vs convert for old clients: unchanged keeps zero-copy, conversion supports old clients at higher CPU cost per fetch."],
    p: ["Enabling in-process encryption or message conversion turns zero-copy off and sharply raises CPU per byte.", "Slow clients holding a transfer open keep file pages pinned and block cache reclaim."],
    v: "Measure broker CPU while serving a fixed fetch rate with plaintext and unconverted data, then enable conversion or encryption and confirm CPU per megabyte rises noticeably.",
    dep: ["page-cache-reliance","record-batch-format","fetch-path"]
  },
  "flush-policy": {
    s: "When the broker forces cached log data to stable storage. Most designs leave flushing to the operating system and rely on replication for durability instead.",
    d: "A write returns once data is in the page cache. The kernel writes it out within seconds, and the broker can also be configured to force a flush after a number of messages or an interval. Forcing a flush on every write gives single-node durability at a large throughput cost. Replicated systems consider data safe once enough replicas hold it in memory, accepting loss only if all fail together. The difficulty is correlated failure: a power loss across all replicas at once loses unflushed data.",
    k: ["Rely on replication vs flush every write: replication keeps latency low and survives single-node failure, per-write flush survives a whole-site power loss at a large performance cost.", "Periodic background flush vs none: periodic flush bounds the window of loss on correlated failure, and costs periodic I/O bursts."],
    p: ["Replicas in one rack losing power together lose acknowledged messages that no one had flushed.", "Flushing every message on a busy broker collapses throughput and raises latency for everyone."],
    v: "Acknowledge writes, cut power to all replicas at once with default settings, and count lost records. Repeat with a flush interval and confirm the loss shrinks to the window.",
    dep: ["append-only-log","min-isr-and-acks","page-cache-reliance"]
  },
  "retention-policy": {
    s: "Rules that decide when old log data is deleted: after a maximum age, when the partition exceeds a maximum size, or both, whichever happens first.",
    d: "A background task periodically checks closed segments and deletes any whose newest record exceeds the age limit, or removes oldest segments until the partition fits the size limit. Deletion is by whole segment, so actual retention is the limit plus up to one segment's worth. Retention applies regardless of whether consumers have read the data. Readers behind the new start offset get an out-of-range error. The difficulty is that consumers can lose data they have not read, and sizes must account for replication.",
    k: ["Time-based retention vs size-based: time gives predictable replay windows, size protects disk under traffic spikes, and using both guards each failure.", "Short retention with tiered storage vs long retention on local disks: tiering holds history cheaply, local disk is simpler and faster."],
    p: ["A consumer down longer than retention returns to find its unread data gone.", "Setting only a time limit lets a traffic spike fill the disk before data expires."],
    v: "Set retention to one minute, produce, wait past it, and confirm segments older than the limit are deleted after the next check, the earliest offset advances and a stale reader gets an out-of-range error.",
    dep: ["log-segments","time-index","offset-reset-and-seek"]
  },
  "log-compaction": {
    s: "A cleanup mode that keeps only the latest record for each key, discarding older ones, so a topic holds the current state of every entity indefinitely.",
    d: "A cleaner thread picks logs with the highest ratio of overwritten records, builds a map of the newest offset per key from the dirty section, and rewrites older segments, copying only records that are still the latest. Records with a null value, called tombstones, delete a key and are removed after a grace period. The active segment is never cleaned, and offsets are preserved with gaps. The difficulty is that compaction is eventual, uses I/O and memory, and readers still see older values until it runs.",
    k: ["Compacted topic as a state table vs time-retained event log: compaction keeps the latest state forever in bounded space, but discards history and needs a key on every record.", "Aggressive cleaning vs lazy: aggressive reclaims space quickly but burns I/O, lazy saves resources and keeps stale values longer."],
    p: ["Assuming compaction is immediate: consumers still read many stale values for a key until the cleaner catches up.", "Removing tombstones before slow consumers have read them leaves them unaware the key was deleted."],
    v: "Write a million updates across a thousand keys, wait for compaction, and confirm a fresh reader sees about one record per key with the latest values and that deleted keys eventually vanish after the grace period.",
    dep: ["log-segments","message-keys","offsets"]
  },
  "tiered-storage": {
    s: "Moves closed log segments from local broker disks to cheaper remote object storage, keeping recent data local, so retention can be long without large local disks.",
    d: "After a segment rolls and is old enough, a background component uploads it and its indexes to remote storage and records the location in metadata. Local copies are deleted sooner than the total retention. A read for old offsets fetches the needed range from remote storage, often caching it. Recent reads and writes are unaffected. This separates storage growth from broker count and speeds up broker replacement, since a new broker needs only the local tail. The difficulty is remote read latency and keeping metadata consistent with the uploaded data.",
    k: ["Short local plus long remote retention vs everything local: tiering cuts cost and recovery time, but makes historical reads slower and adds a dependency on the object store.", "Upload only closed segments vs continuous streaming: closed segments are simple and consistent, but the newest data has no remote copy."],
    p: ["A deleted or mismatched remote object makes the historical range unreadable while local metadata says it exists.", "A backfilling consumer reading from remote storage floods it and runs up request costs."],
    v: "Produce past the local retention, confirm old segments are present in remote storage and gone locally, then read from the beginning and confirm all records return in order with higher latency.",
    dep: ["log-segments","retention-policy","metadata-log"]
  },
  "checkpoints-and-recovery": {
    s: "Small files recording how far each log was safely written and replicated, used after a restart to decide what to trust, rebuild or truncate.",
    d: "The broker writes a recovery point per log, marking the offset up to which data is known flushed, and a replication checkpoint holding each partition's high watermark. On a clean shutdown it writes them and skips a scan. After an unclean shutdown it validates segments past the recovery point, rebuilding indexes and truncating corrupt tails. It then compares with the leader's epoch history and truncates any entries the cluster does not agree on. The difficulty is recovery time for large logs and correctness of truncation.",
    k: ["Checkpoint progress periodically vs on every change: periodic is cheap but leaves more to verify on restart, per-change is exact but costly.", "Scan only the unflushed tail vs the entire log: the tail is fast, the whole log catches silent corruption but takes long."],
    p: ["Stale checkpoints after a partial disk failure cause a broker to serve or replicate data it should have truncated.", "Recovery of tens of thousands of partitions in series makes restarts take an hour."],
    v: "Kill a broker with the kill signal during writes, restart it, and confirm it recovers, truncates to a consistent point, rebuilds missing indexes and rejoins in-sync with no divergent records.",
    dep: ["log-segments","high-watermark","leader-epochs"]
  },
  "replica-roles": {
    s: "For each partition one broker is the leader, taking all reads and writes, and others are followers that copy the leader's log and wait to take over.",
    d: "The leader orders writes, assigns offsets and serves clients. Followers act as consumers of the leader's log, fetching new batches and appending them to their own copies. All replicas hold the same sequence if healthy. Leadership is spread across brokers so load balances. A preferred leader is the first replica in the assignment list, and a periodic task moves leadership back after failures. The difficulty is that a leader failure needs a fast, safe hand-off, and read-only followers that serve clients add staleness.",
    k: ["Leader serves all traffic vs followers serve reads: leader-only gives simple, consistent reads, follower reads spread load and cross-zone cost but lag slightly.", "Leadership balanced by preferred leaders vs left where failures put it: periodic rebalancing evens load, but moves cause brief unavailability."],
    p: ["After a rolling restart, leaders pile up on a few brokers and overload them until rebalanced.", "Reading from followers can return slightly stale data to a consumer that just wrote."],
    v: "Describe a partition, produce to it, and confirm followers' log end offsets track the leader's within a small lag, then stop the leader and confirm a follower takes over with all committed records.",
    dep: ["partitions","follower-fetch","leader-election"]
  },
  "in-sync-replica-set": {
    s: "The set of replicas, including the leader, that are fully caught up with it. Only members of this set can be elected leader without risking committed data.",
    d: "The leader tracks each follower's progress. A follower that stays within a lag limit in time, or keeps fetching, remains in the set; one that falls behind or stops is removed and rejoins when caught up. A write counts as committed when every member of the set has it. The set shrinks under failure and slow disks, which is how the system keeps accepting writes. The difficulty is that the set size is the real durability level: shrink it to one and acknowledged data lives on a single node.",
    k: ["Time-based lag limit vs message-count limit: time-based ignores bursts that briefly raise counts, count-based flaps when traffic is bursty.", "Shrink the set to stay available vs block writes to keep copies: shrinking keeps accepting writes, blocking preserves redundancy and rejects producers."],
    p: ["A slow disk on a follower repeatedly drops it from and returns it to the set, causing churn and write stalls.", "A set shrunk to the leader alone silently reduces durability to one copy."],
    v: "Pause a follower and confirm it leaves the in-sync set after the lag limit, writes continue, and after resuming it rejoins once its log end offset reaches the leader's.",
    dep: ["replica-roles","follower-fetch","high-watermark","min-isr-and-acks"]
  },
  "high-watermark": {
    s: "The offset below which every in-sync replica holds the data. Consumers can read only up to it, so they never see records that a leader failure could lose.",
    d: "The leader computes it as the lowest log end offset among in-sync replicas and advances it as followers fetch. It tells followers the new value in fetch responses, so they know what is committed. Consumers are served only up to this point. Parked produce requests with full acknowledgement complete when the watermark passes their batch. After a leader change, replicas truncate to their known watermark or epoch boundary. The difficulty is that followers learn it one fetch late, which affected recovery correctness in older designs.",
    k: ["Expose only committed data to consumers vs expose everything on the leader: committed-only avoids reading data that can vanish, but adds a replication delay to end-to-end latency.", "Truncate on watermark vs on epoch boundaries: watermark truncation is simple but can lose or diverge data, epoch-based truncation is exact."],
    p: ["A consumer reading beyond the watermark sees records lost after a leader failure.", "A stuck follower in the set freezes the watermark and stalls all consumers of the partition."],
    v: "Produce to a leader, pause replication, and confirm consumers cannot read the new records until followers catch up and the watermark advances past them.",
    dep: ["in-sync-replica-set","follower-fetch","leader-epochs"]
  },
  "leader-epochs": {
    s: "A number incremented each time a partition gets a new leader, stored with records, so replicas can tell which writes came from which leadership term and truncate correctly.",
    d: "On every election the controller bumps the partition's epoch. Each batch records the epoch of the leader that wrote it, and each replica keeps a short history of epoch start offsets. A recovering follower asks the leader where the epoch it last saw ended and truncates anything beyond that. Requests carry the epoch so a deposed leader's stale writes are rejected as fenced. The difficulty is subtle: without epochs, replicas can end up with different records at the same offset after a quick succession of failures.",
    k: ["Epoch-based truncation vs high-watermark truncation: epochs prevent divergence after back-to-back failures, at the cost of extra metadata and protocol.", "Fence by epoch in every request vs trust the connection: fencing stops zombie leaders cleanly, but every component must carry and check it."],
    p: ["A zombie leader that does not know it was replaced keeps accepting writes if epochs are not checked.", "Replicas truncating from a stale epoch cache lose committed data."],
    v: "Fail the leader, write on the new leader, restart the old leader with unreplicated records, and confirm it truncates them to the epoch boundary and ends with a log identical to the new leader's.",
    dep: ["leader-election","controller","checkpoints-and-recovery"]
  },
  "follower-fetch": {
    s: "Followers copy data by sending fetch requests to the leader, exactly as consumers do, then appending what they receive to their own logs and reporting progress.",
    d: "A replica fetcher thread per leader broker sends fetch requests covering many partitions, with the follower's current end offset and epoch. The leader returns batches and its high watermark. The follower appends them, updates its watermark and fetches again; the fetch position doubles as the progress report used to compute the in-sync set. Using pull lets followers set their own pace and reuses the zero-copy read path. The difficulty is throughput: replication traffic multiplies ingest and competes with clients for network and disk.",
    k: ["Followers pull vs leader pushes: pull is simple, backpressured by the follower and reuses the fetch path, push can lower latency but needs per-follower flow control.", "Few fetcher threads per leader vs many: fewer share connections and batch partitions, many raise parallel throughput for high-volume partitions."],
    p: ["A follower on a slow network falls out of sync and requires repeated catch-up that loads the leader.", "Replication traffic without a quota starves client traffic during a catch-up."],
    v: "Measure follower end offsets while producing at a constant rate and confirm lag stays near zero. Throttle the network and confirm the follower leaves the in-sync set and later catches up.",
    dep: ["replica-roles","fetch-path","in-sync-replica-set"]
  },
  "leader-election": {
    s: "Choosing a new leader for a partition when the current one fails, preferring a caught-up in-sync replica so committed records survive.",
    d: "The controller detects a failed broker through missed heartbeats, selects a new leader for each affected partition from the in-sync set, increments the epoch and publishes the change. Clients learn it through metadata refresh and retry. Election is per partition, so a broker failure causes many elections at once, and time grows with partitions per broker. A preferred replica election restores balance later. The difficulty is speed under many partitions and avoiding two leaders at once.",
    k: ["Elect only from the in-sync set vs any live replica: in-sync keeps all committed data, any live replica restores availability sooner at the risk of loss.", "Controller-driven election vs replicas electing among themselves: central election is simple and consistent, replica-driven spreads the work but needs a consensus step per partition."],
    p: ["A broker with many partitions takes minutes to fail over because each election is processed in sequence.", "Clients caching old leader information keep failing until metadata refresh."],
    v: "Stop the leader broker under load and measure time to a new leader for every partition, confirming no committed record is lost and producers resume after the measured gap.",
    dep: ["controller","in-sync-replica-set","leader-epochs"]
  },
  "unclean-election": {
    s: "Electing a replica that was not in sync when none in the set survive, trading possible data loss for availability, so the partition accepts writes again.",
    d: "When every in-sync replica is gone, the partition is offline. Operators can enable unclean election per topic: the controller then promotes any live replica, which may lack the latest committed records. Those records are lost, and when old replicas return they truncate to the new leader's history. Consumers' offsets may point beyond the new end. This suits data where availability matters more than completeness, such as metrics. The difficulty is that it is silent and causes inconsistency downstream.",
    k: ["Allow unclean election vs stay offline until an in-sync replica returns: allowing restores service quickly and loses data, waiting is safe and may be an extended outage.", "Set per topic vs cluster wide: per topic matches risk to the data, cluster-wide is simple and unsafe for critical topics."],
    p: ["Enabling it cluster-wide on a financial topic permits silent loss of committed transactions.", "Consumers whose offsets exceed the new log end hit out-of-range errors and may reset unexpectedly."],
    v: "Stop all in-sync replicas, restart only a lagging one, and confirm the partition stays offline with the setting off, or comes online and the missing records are gone with it on.",
    dep: ["leader-election","in-sync-replica-set","offset-reset-and-seek"]
  },
  "min-isr-and-acks": {
    s: "Two settings that together define durability: how many replicas must confirm a write before acknowledging it, and the minimum in-sync count required to accept writes at all.",
    d: "The producer's acknowledgement level selects none, leader only or all in-sync replicas. The topic's minimum in-sync setting says how many replicas must be in the set for an all-level write to succeed; otherwise the write is rejected. With replication three and minimum two, one broker can fail with no loss and no downtime, and two failures block writes rather than risk loss. The difficulty is combining them correctly: all acknowledgement with a minimum of one still allows writing to a lone leader.",
    k: ["Minimum in-sync of two with replication three vs minimum one: two survives one failure and stops writes after two, one stays available but can lose data.", "Acknowledge all vs leader only: all adds the replication round trip to latency and guarantees survival of the leader's loss."],
    p: ["Setting all acknowledgement without a minimum above one gives only leader-level durability when followers lag.", "A minimum equal to the replication factor makes every single broker restart block writes."],
    v: "With replication three and minimum two, stop one follower and confirm writes succeed, stop a second and confirm producers get a not-enough-replicas error, then restart one and confirm writes resume.",
    dep: ["in-sync-replica-set","produce-path","high-watermark"]
  },
  "rack-aware-placement": {
    s: "Spreads a partition's replicas across racks or zones, so the loss of a whole failure domain leaves copies elsewhere, and can steer consumers to a nearby replica.",
    d: "Each broker declares its rack or zone. When assigning replicas, the controller places copies in as many distinct racks as possible. Rack-aware consumers can fetch from a follower in their own zone, which avoids cross-zone transfer costs while staying behind the high watermark. Placement affects balance, since racks of unequal size skew the load. The difficulty is that a three-replica partition in two racks still loses two copies when one rack fails, and maintaining the property during reassignment needs care.",
    k: ["Spread across zones vs concentrate in one: spreading survives a zone outage but adds cross-zone latency and traffic, concentrating is cheaper and fragile.", "Fetch from the nearest replica vs always the leader: nearby reads cut transfer cost and latency, at the price of slight staleness."],
    p: ["Uneven rack sizes cause the small rack's brokers to hold a disproportionate share of data.", "Cross-zone replication traffic generates a large bill that nobody modeled."],
    v: "Create topics on a cluster of three racks and confirm each partition's replicas sit in distinct racks. Fail a whole rack and confirm all partitions keep a leader and committed data.",
    dep: ["replica-roles","controller","partition-reassignment"]
  },
  "quorum-queues": {
    s: "A replicated queue design in which a consensus protocol replicates every queue operation across several nodes, giving a queue that survives node failures without losing acknowledged messages.",
    d: "Each queue is a replicated state machine: publish, deliver and acknowledge are entries in a consensus log, committed once a majority holds them. A leader serves clients and a new leader is elected by majority vote. Messages are stored in the replicated log, which is trimmed as they are acknowledged. This is safer than older mirrored queues that could lose data in a partition. It costs write latency and disk, and large queues are expensive to replicate. The difficulty is memory and recovery with long backlogs.",
    k: ["Consensus-replicated queues vs asynchronously mirrored: consensus guarantees committed messages survive, but needs a majority up and writes to disk on every node.", "Odd replica counts vs even: three or five tolerate one or two failures cleanly, even counts add cost without extra tolerance."],
    p: ["A very long queue replicated to several nodes makes recovery and leader change slow and memory heavy.", "Losing a majority of replicas makes the queue unavailable until nodes return."],
    v: "Publish and acknowledge messages while killing the queue leader repeatedly, then confirm every acknowledged-publish message was delivered once or more and none was lost.",
    dep: ["queues","leader-election","metadata-quorum"]
  },
  "cross-cluster-mirroring": {
    s: "Continuously copies topics from one cluster to another, for disaster recovery, regional locality or aggregation, with a way to translate consumer positions on failover.",
    d: "A mirroring service reads from the source cluster as a consumer and writes to the target as a producer, preserving keys, partitions and headers, and replicating topic configuration and access rules. Offsets differ between clusters because the copy is independent, so the service also periodically records a mapping from source to target positions in a checkpoint topic, so a failed-over consumer can resume near where it was. Mirroring is asynchronous, so failover loses the last moments of data. The difficulty is loops in two-way setups and duplicate delivery on resume.",
    k: ["Asynchronous mirroring vs stretching one cluster across sites: asynchronous tolerates distance and site loss with some data loss, stretching gives no loss but needs low latency links.", "Active-passive vs active-active: active-passive is simple to reason about, active-active serves local writes but needs conflict handling and loop prevention."],
    p: ["Two-way mirroring without prefixing topic names copies messages back and forth forever.", "Failover with a stale offset mapping makes consumers reprocess a large window or skip data."],
    v: "Produce to the source, fail it over and confirm the target holds all but the last moments of data, and that a consumer resumes via the offset mapping within the documented window of the failure point.",
    dep: ["consumer-client","producer-client","offset-commits","internal-topics"]
  },
}
);
