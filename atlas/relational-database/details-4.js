// Details part 4: logging, replication, backup, buffer pool, indexes, storage layout.
ATLAS.details("relational-database", {
  "write-ahead-log": {
    s: "An append-only sequential record of every change, written and flushed before the changed data pages may reach disk, so a crash can always be repaired.",
    d: "Every modification generates a log record before the page changes, and the page records the position of the last record that touched it. The rule is simple: a data page may not be written until the log is flushed up to that position, and a transaction may not report commit until its commit record is flushed. Log writes are sequential and cheap, while data page writes are random and can be deferred. The log also feeds replication and point-in-time recovery, so it is retained until all consumers are done.",
    k: ["Log before data: turns a random-write commit into one sequential flush, at the cost of writing every change twice, once to log and once to the page.", "Position-stamped pages: let recovery tell whether a change was already applied, but require stamping on every page modification."],
    p: ["Storage that acknowledges flushes without persisting them breaks the rule invisibly and corrupts data after power loss.", "The log directory filling because a consumer lags can halt the entire server."],
    v: "Write a row, commit, cut power or kill the machine, restart, and confirm the row is present. Inspect that every data page on disk has a stamp no greater than the flushed log position.",
    dep: ["log-record-format", "buffer-pool"]
  },
  "log-record-format": {
    s: "The binary layout of log records: type, transaction, affected page, and enough before or after information to redo, and sometimes undo, the change exactly.",
    d: "Records hold a header with length, type, transaction identifier, previous record link and checksum, followed by a payload that is either physical (bytes on a page), logical (an operation to repeat) or a mix called physiological: a page identifier plus a logical action within it. Records chain per transaction for undo, and carry full page images after checkpoints. The format must be forward compatible for replicas, compact for throughput and checksummed to detect torn or corrupt tails.",
    k: ["Physiological records: small like logical ones and exact within a page, but tie replication to the physical page format.", "Checksums on every record: let recovery find the true end of the log after a crash, at a small per-record cost."],
    p: ["A record that is not idempotent under replay corrupts data when recovery repeats it after a second crash.", "Changing the record format without versioning breaks replicas and archives of the previous version."],
    v: "Dump the log for a known transaction and confirm each record shows its type, page and transaction. Flip a bit in the middle of a segment and confirm recovery stops at the corrupt record and reports it.",
    dep: ["write-ahead-log", "page-layout"]
  },
  "group-commit": {
    s: "Batches the log flushes of many concurrent transactions into one physical write, amortizing the cost of a durable flush across all of them.",
    d: "When a transaction commits it appends its commit record to the in-memory log buffer and waits for the flush position to pass it. One session becomes the flusher, writes everything in the buffer, calls the storage sync and wakes all waiters whose records were covered. Under load, the time of one sync collects dozens of commits. A short delay can increase batching at the expense of latency for the first committer. The hard parts are fairness among waiters and avoiding stalls when the flusher fails.",
    k: ["Leader flushes for everyone waiting: raises throughput by orders of magnitude under concurrency, but adds latency to commits that queue behind a sync in progress.", "Optional commit delay to gather more commits: helps when sync is slow, at a cost to single-client latency."],
    p: ["Measuring commit speed with a single client and extrapolating hides the throughput that grouping gives under load.", "A flush path error that fails to wake waiters leaves transactions blocked forever."],
    v: "Run one hundred concurrent committing clients and confirm log syncs per second are far fewer than commits per second, with every acknowledged commit present after a crash and restart.",
    dep: ["write-ahead-log", "transaction-manager"]
  },
  "checkpointing": {
    s: "Periodically forces dirty pages to disk and records a log position from which recovery can start, bounding both recovery time and the log that must be kept.",
    d: "A checkpoint notes the current log position, writes every page dirtied before it, spread over a time window to avoid an I/O burst, then records completion. Recovery begins at the last complete checkpoint instead of the start of the log. Frequency trades recovery time against steady-state I/O and full-page-image volume. Fuzzy checkpoints let transactions continue throughout. Hard issues are spreading writes smoothly and handling a crash during a checkpoint.",
    k: ["Spread writes across the interval: avoids latency spikes, but lengthens the checkpoint and so the log retained.", "Less frequent checkpoints: reduce write amplification, but make crash recovery replay more log and take longer."],
    p: ["Too frequent checkpoints increase page images in the log and cause periodic latency spikes visible to clients.", "A checkpoint interval longer than tolerated recovery time makes failover unexpectedly slow."],
    v: "Run a sustained write load across several checkpoints and confirm write latency stays smooth. Kill the server and confirm recovery time is bounded by one interval's worth of log replay.",
    dep: ["buffer-pool", "write-ahead-log", "background-writer"]
  },
  "crash-recovery": {
    s: "On startup after an unclean shutdown, brings the database back to a consistent state containing exactly the committed transactions by replaying the log.",
    d: "Recovery starts from the last checkpoint and performs redo: reapplying each logged change to any page that lacks it, as shown by the page's log position. This repeats history including uncommitted work. Transactions without a commit record are then treated as aborted, either through undo in designs with in-place overwrite, or simply by their versions being invisible when row versioning is used. The system accepts connections after redo, and may do cleanup in the background. It must itself survive crashing during recovery.",
    k: ["Redo everything then undo losers (steal and no-force buffering): lets dirty pages be written any time and avoids forcing pages at commit, at the cost of needing both redo and undo information.", "Version-based visibility instead of undo passes: recovery finishes sooner and aborts are free, but dead versions require later cleanup."],
    p: ["Recovery relying on a non-idempotent step corrupts data if the server crashes again mid-recovery.", "Deleting the log to free space after a crash discards the only copy of committed changes."],
    v: "Kill the server mid-way through a bulk insert under a write load, restart, and confirm every committed transaction is present, no uncommitted row is visible, and all indexes agree with the table contents.",
    dep: ["write-ahead-log", "checkpointing", "log-record-format", "rollback-and-undo"]
  },
  "rollback-and-undo": {
    s: "Reverses the effects of an aborted transaction, either by applying logged undo records in reverse or by leaving its row versions invisible for later cleanup.",
    d: "In undo-based designs each change logs how to reverse it, and abort walks the transaction's record chain backward applying inverse changes, writing compensation records so a crash during abort can resume. In version-based designs abort just marks the transaction aborted and its versions are skipped by visibility checks and removed later. Rollback of large transactions can take as long as the original work in undo designs, and is instant in the other.",
    k: ["Undo by logged compensation: restores pages promptly, but rollback of huge work costs as much as doing it.", "Mark aborted and clean later: instant rollback, but leaves garbage that affects scans and indexes until it is removed."],
    p: ["Killing a session that was in a long undo-based rollback can leave the database spending minutes in recovery after restart.", "Aborted versions left in place inflate scans on heavily failing workloads."],
    v: "Insert ten million rows then abort, measure abort time, then confirm no row is visible. In an undo-based design, kill the server mid-rollback and confirm recovery completes the rollback.",
    dep: ["transaction-manager", "write-ahead-log", "mvcc-versioning"]
  },
  "torn-page-protection": {
    s: "Defends against partial page writes, where a crash leaves a page half old and half new, using full page images in the log or a double-write area.",
    d: "Storage often writes in units smaller than a database page, so a power loss can persist part of a page. Log redo cannot repair such a page because it assumes a consistent starting state. One defense logs a complete copy of a page the first time it changes after each checkpoint; the other writes pages first to a sequential double-write buffer and then to place. Checksums detect the tear. Costs are log volume or extra writes, and tuning interacts with checkpoint frequency.",
    k: ["Full page image after checkpoint: no extra data writes, but increases log volume sharply right after each checkpoint.", "Double-write buffer: log stays compact, but every page is written twice and needs its own recovery logic."],
    p: ["Disabling the protection on storage with larger atomic writes than assumed risks silent corruption after power loss.", "Frequent checkpoints combined with image logging create bursts of log volume."],
    v: "On a test rig, interrupt page writes partway using a fault injection layer during a write load, restart, and confirm recovery restores every torn page and the checksum verifier reports no corruption.",
    dep: ["write-ahead-log", "page-layout", "checkpointing"]
  },
  "physical-replication": {
    s: "Ships the log of byte-level page changes to standby servers, which replay it to maintain an exact binary copy of the primary.",
    d: "A sender process streams log records to standbys over the network as they are written; the standby writes them to its own log and applies them continuously, as in constant crash recovery. The standby is identical, including indexes and bloat, and can serve read-only queries. Replication is cheap and simple but requires the same major version and architecture, and copies everything including corruption. Lag appears as the gap between primary flush position and standby replay position.",
    k: ["Exact binary replication: minimal primary overhead and perfect fidelity, but no selective replication or cross-version use.", "Hot standby serving reads: uses spare capacity, but replay conflicts with long queries on the standby."],
    p: ["Physical corruption on the primary is faithfully replicated, so a standby is not a backup.", "Replay lag after a heavy write burst gives stale reads that application code may not expect."],
    v: "Write on the primary, measure the time until the standby shows the row, and kill the primary's network to confirm standby replays up to the last received record and reports lag growth accurately.",
    dep: ["write-ahead-log", "replication-slots"]
  },
  "logical-replication": {
    s: "Decodes the log into row-level changes and publishes them to subscribers, allowing selective, cross-version and cross-system replication of chosen tables.",
    d: "A decoder reads the log, reconstructs committed transactions in commit order and converts physical records into insert, update and delete events with old and new key values, using a catalog snapshot to interpret them. Subscribers apply changes as SQL-level operations, can differ in indexes, and can feed other systems. It needs row identity, usually a key. Difficulties include large transactions, schema changes not carried along, initial table copy consistent with the change stream, and conflicts when subscribers also accept writes.",
    k: ["Row-level change stream: allows selective tables and version-independent targets, at the cost of heavier decoding and apply work than physical shipping.", "Changes emitted at commit in order: preserves transaction consistency, but delays large transactions until they finish."],
    p: ["Tables without a primary key cannot replicate updates and deletes unambiguously.", "Schema changes on the publisher not applied on the subscriber stall replication on the first incompatible row."],
    v: "Publish one table, run inserts, updates and deletes in transactions, and confirm the subscriber matches row for row and in commit order. Add a column on the publisher and confirm the documented behavior.",
    dep: ["write-ahead-log", "replication-slots", "log-record-format"]
  },
  "synchronous-commit-modes": {
    s: "Controls how far a commit waits before acknowledgment: local flush only, receipt by a replica, flush on a replica, or applied and visible on a replica.",
    d: "Asynchronous commit returns after the local log flush, so a primary failure can lose the most recent transactions that replicas had not received. Synchronous modes make the committing session wait until a named set of standbys confirm receipt, durable flush or replay. A quorum can be required rather than all. A weaker local-only mode returns before even the local flush and risks losing the last moments. Latency, availability and loss window trade directly against each other.",
    k: ["Synchronous replication to at least one standby: zero data loss on failover, but each commit pays a network round trip and stalls if no standby is reachable.", "Quorum rather than all standbys: tolerates a slow or failed replica, at the price of a more complex failover rule."],
    p: ["When the only synchronous standby fails, writes block unless it is configured to degrade, silently turning into asynchronous mode.", "Assuming replica acknowledgment means readable data confuses read-your-writes expectations."],
    v: "Commit under each mode, kill the primary immediately, promote a standby, and confirm no acknowledged transaction is lost under synchronous flush mode while asynchronous mode may lose the latest ones.",
    dep: ["physical-replication", "group-commit", "transaction-manager"]
  },
  "replication-slots": {
    s: "Server-side bookmarks that track how far each replica or consumer has read, preventing the primary from discarding log it still needs.",
    d: "A slot records the oldest log position and, for logical slots, the catalog horizon that its consumer requires. The primary retains log files and old catalog versions back to the oldest slot. This makes replicas robust to temporary disconnection, but an abandoned slot retains log forever. Limits on retained size and monitoring of lag are necessary. Slots are normally not replicated to standbys, so failover needs a mechanism to carry them over.",
    k: ["Retain log for each slot: replicas can always catch up after outages, but a dead consumer can fill the primary's disk.", "Maximum retained size with slot invalidation: protects the primary, but forces the lagging replica to rebuild from scratch."],
    p: ["A forgotten slot from a decommissioned replica silently fills the log volume until the primary stops.", "Slots lost in failover force logical subscribers to resynchronize all data."],
    v: "Create a slot, disconnect its consumer, generate write load, and confirm retained log grows and is reported. Reconnect and confirm catch-up, then drop the slot and confirm the retained log is released.",
    dep: ["write-ahead-log", "log-archiving"]
  },
  "failover-promotion": {
    s: "Turns a standby into the new primary when the old one fails, including detection, choosing the most advanced replica, fencing the old primary and redirecting clients.",
    d: "Promotion ends replay on the standby, starts a new log timeline so histories cannot be confused and opens it for writes. The orchestration around it, which is usually external, detects failure with health checks and leases, picks the replica with the most received log, ensures the old primary cannot continue accepting writes, and moves traffic. Afterward, the old primary may need rewinding to rejoin. The central danger is split-brain, where two primaries accept conflicting writes.",
    k: ["Fencing before promotion: prevents divergent histories, but delays failover until the old primary is confirmed unable to write.", "Timelines to separate histories: make divergence detectable and enable rewind, but require every tool to understand them."],
    p: ["Promoting a lagging replica silently discards transactions the old primary had acknowledged under asynchronous replication.", "An old primary that resumes after a network partition accepts writes alongside the new primary."],
    v: "Kill the primary under load, confirm a standby is promoted within the target time, that the old primary is fenced, that clients reconnect, and that rejoining the old primary yields no divergent data.",
    dep: ["physical-replication", "synchronous-commit-modes", "crash-recovery"]
  },
  "replica-query-conflicts": {
    s: "Handles the clash between continuous log replay on a read-serving standby and long queries that still need row versions or locks the replay is about to remove.",
    d: "Replay may remove old row versions, drop objects or take exclusive locks that a running standby query depends on. The standby either delays replay up to a limit, which increases lag, or cancels the conflicting query. Alternatively the standby reports its oldest snapshot to the primary so cleanup there waits, which moves the cost to bloat on the primary. Each choice trades query success, replication lag and primary health.",
    k: ["Cancel conflicting standby queries after a delay: bounds lag, but long analytic queries fail unpredictably.", "Feedback of standby snapshots to primary: stops cancellations, but a long standby query pins cleanup on the primary and bloats it."],
    p: ["Long reports on a standby fail with conflict errors during cleanup-heavy periods on the primary.", "Delaying replay for queries lets lag grow, which then threatens failover freshness."],
    v: "Start a long query on the standby, run updates and cleanup on the primary, and confirm the observed behavior matches the configuration: cancellation after the set delay, or retained versions on the primary.",
    dep: ["physical-replication", "version-garbage-collection", "snapshot-management"]
  },
  "base-backup": {
    s: "Takes a consistent copy of the whole database while it keeps running, by copying files and capturing the log produced during the copy.",
    d: "A backup starts by forcing a checkpoint and noting the log position, then copies data files while writes continue; the copy is internally inconsistent, but replaying the log generated from the start position makes it consistent. Variants use filesystem or storage snapshots, incremental backups tracking changed blocks, and compression and encryption. Verification is the hard part: an untested backup is only a hope, and page-level corruption can be copied unnoticed.",
    k: ["Online file copy plus log replay: no downtime, but the backup is useless without the log segments covering the copy window.", "Incremental by changed blocks: shortens backup time and size, but restore needs the full chain and each link must be intact."],
    p: ["A backup that has never been restored is not known to work, and corruption may be present in every copy.", "Missing log segments from the backup window make a seemingly complete backup unrestorable."],
    v: "Take a backup under write load, restore it on a clean machine, start it, and confirm it recovers to consistency and that row counts and checksums match the source as of the backup end position.",
    dep: ["checkpointing", "write-ahead-log", "file-segment-manager"]
  },
  "log-archiving": {
    s: "Continuously copies completed log segments to durable storage elsewhere, forming the unbroken record needed for point-in-time recovery and replica catch-up.",
    d: "As each log segment fills, or after a timeout, the server hands it to an archive process that copies it to remote storage and confirms success; the server will not recycle a segment until archiving succeeds. Compression, encryption and parallel upload are typical. Gaps are fatal to recovery, so monitoring of archive lag and failures is essential. The cost is storage retention, which is set by the oldest recovery point required.",
    k: ["Archive before recycle: guarantees no gaps, but a failing archive target fills the primary's log disk.", "Archive on timeout as well as segment fill: bounds data loss for quiet systems, but produces many small files."],
    p: ["An archive command that exits success without actually storing the file creates silent gaps found only at restore time.", "Archive failures unnoticed for hours fill the log volume and halt the server."],
    v: "Generate load across several segments and confirm each appears in the archive with matching checksums, then block the archive target and confirm the server alerts and retains segments rather than recycling them.",
    dep: ["write-ahead-log", "base-backup"]
  },
  "point-in-time-recovery": {
    s: "Rebuilds the database to an exact moment, transaction or named marker by restoring a base backup and replaying archived log up to that target.",
    d: "Recovery restores the base backup, then replays archived log segments, stopping at a target given as a timestamp, a transaction identifier, a log position or a named restore point. Stopping just before a destructive statement recovers from human error. After reaching the target the system chooses a new timeline so later history cannot be confused with the abandoned one. It depends on every segment since the base backup and on accurate commit timestamps.",
    k: ["Stop target by timestamp, transaction or named marker: allow recovery to just before a mistake, but timestamps need accurate commit time recording.", "New timeline after recovery: keeps alternative histories distinct and safe, but archives must keep several timelines."],
    p: ["Choosing a target slightly too late includes the bad transaction, requiring the entire restore to be repeated.", "Clock skew between the writer and the person naming the time shifts the recovered state."],
    v: "Insert marker rows, delete a table, note the pre-delete time, restore the base backup with that target, and confirm the table and markers up to that moment exist and nothing after does.",
    dep: ["base-backup", "log-archiving", "crash-recovery"]
  },
  "buffer-pool": {
    s: "The engine's shared in-memory cache of data pages, mapping page identifiers to frames, with pinning, dirty tracking and coordination with the log.",
    d: "A hash table maps page identifiers to buffer frames. A reader looks up the page, pins it so it cannot be evicted, takes a latch for content access, and unpins when done. If missing, a victim frame is chosen, written out first if dirty and only after the log reaches the page's position, and the page is read in. The pool is far larger than any one query, shared by all sessions, and sits on top of the operating system's file cache, which can cause double caching.",
    k: ["Own cache rather than the operating system's: control of eviction and write ordering relative to the log, but memory is potentially duplicated unless direct I/O is used.", "Steal policy permitting dirty pages written before commit: frees memory for large transactions, but needs undo or versioning to remove uncommitted data."],
    p: ["A pool too large starves the operating system and other processes and pushes the machine into swapping.", "A pool too small makes hot indexes thrash and drives read I/O far above need."],
    v: "Run a workload with a working set equal to the pool and confirm hit rate near 100 percent, then double the working set and confirm hit rate and latency degrade smoothly, with no pinned page leaks after the run.",
    dep: ["page-replacement", "write-ahead-log", "latches", "file-segment-manager"]
  },
  "page-replacement": {
    s: "Chooses which cached page to evict when a free frame is needed, using policies that approximate recency and frequency while resisting pollution by large scans.",
    d: "Simple least-recently-used lists need a lock on every access, so engines use approximations: a clock sweep with usage counters, or segmented lists with young and old regions. A page used once by a big scan should not displace hot pages, so scans use small rings or low priority insertion. Pinned pages cannot be evicted. The policy must be cheap under contention since it runs on every page access, and it still cannot know future access.",
    k: ["Clock sweep with usage counts: very low overhead per access and decent hit rates, but coarser than true recency ordering.", "Scan-resistant insertion: protects the working set from table scans, but may under-cache a table that is actually hot and scanned."],
    p: ["A large scan or index build without scan resistance flushes the whole hot working set.", "A hot page counter stuck at the maximum makes the clock sweep spin many times before it finds a victim."],
    v: "Warm the cache with a hot working set, run a full-table scan of a larger table, and confirm the hot set's hit rate stays above 95 percent and the scan used only a small ring of buffers.",
    dep: ["buffer-pool"]
  },
  "background-writer": {
    s: "Writes dirty pages to disk ahead of demand, smoothing I/O and keeping clean frames available so foreground sessions rarely wait to evict a dirty page.",
    d: "A worker walks the pool and writes dirty pages that are likely to be evicted soon, bounded by a per-round limit and a delay to pace I/O. The checkpointer writes the rest on schedule. Writes must respect the log rule: the log is flushed to the page's position first. Good pacing leaves clean victims for demand; poor pacing causes either bursts or stalls where sessions write pages themselves. Coalescing neighboring pages into larger writes improves throughput.",
    k: ["Proactive writing of likely victims: removes write latency from queries, but writes pages that are dirtied again soon, wasting I/O.", "Paced rather than bursty writes: steady latency, but the system needs headroom to absorb a sudden load spike."],
    p: ["A writer too slow for the write rate forces sessions to write dirty pages themselves, adding latency to queries.", "An aggressive writer rewrites hot pages repeatedly, wearing flash storage and wasting bandwidth."],
    v: "Run a write-heavy workload and read the counters for pages written by writer, checkpointer and sessions; confirm sessions write few pages and p99 latency has no periodic spikes.",
    dep: ["buffer-pool", "write-ahead-log"]
  },
  "prefetching": {
    s: "Reads pages before they are requested, using sequential detection or knowledge of upcoming access such as bitmap scans, to hide storage latency.",
    d: "For sequential scans, the system issues reads for the next several pages ahead. For index and bitmap scans, it knows the heap pages it will visit and can issue those reads in advance, in order. Prefetch depth is tuned to storage: deep queues give flash high throughput, while on spinning disks sorted ordering matters. Wrong guesses waste bandwidth and cache. Depth control must adapt to concurrency so many sessions do not flood storage.",
    k: ["Deeper prefetch for flash and network storage: raises throughput by keeping many reads in flight, but wastes cache on pages never used.", "Prefetching from known page lists in bitmap scans: accurate and cheap, but impossible for nested-loop index probes whose targets depend on earlier rows."],
    p: ["Aggressive prefetch across many concurrent scans saturates storage and raises everyone's latency.", "Prefetching pages that a LIMIT then never reads wastes I/O at the start of every query."],
    v: "Scan a cold large table with prefetch depth zero and a tuned depth, and confirm scan time drops substantially while a LIMIT 10 query does not read noticeably more than a handful of pages.",
    dep: ["buffer-pool", "asynchronous-io", "sequential-scan"]
  },
  "asynchronous-io": {
    s: "Issues many storage reads and writes without blocking the requesting process, using kernel queues or worker threads, so I/O and computation overlap.",
    d: "Rather than blocking a session on every page read, the engine submits requests to an I/O queue and continues, collecting completions later. This allows deep queues on flash and network storage and moves writes of dirty pages and the log off the critical path. Direct I/O bypasses the operating system cache to avoid double buffering, at the price of managing alignment and readahead itself. The difficulty is portability, completion handling in shared-memory process designs, and error handling for failed requests.",
    k: ["Direct I/O bypassing the file cache: avoids double caching and gives control of write ordering, but the engine must do its own readahead and alignment.", "Completion-based queues: overlap computation and I/O naturally, but make error handling and ordering guarantees more complex."],
    p: ["Treating a successful write submission as durability skips the required flush and loses data on power failure.", "A failed asynchronous read surfaced late can leave a buffer in an unclear state."],
    v: "Run a read-heavy workload on fast storage with synchronous and asynchronous I/O and confirm queue depth and throughput are much higher in the latter, with identical results and error injection reported to the right session.",
    dep: ["buffer-pool", "file-segment-manager"]
  },
  "btree-index": {
    s: "A balanced, ordered tree of pages mapping keys to row locations, supporting equality, range, ordering and prefix lookups in logarithmic page reads.",
    d: "Internal pages hold separator keys and child pointers; leaf pages hold sorted key and row-pointer entries linked left to right for range scans. Insertion finds the leaf, adds the entry, and splits the page if full, pushing a separator up. Search descends from the root, which is cached. Wide fan-out keeps trees shallow, so a billion rows take three or four levels. Techniques include prefix compression, duplicate suppression, and fill factor to leave room for inserts.",
    k: ["Page-sized nodes with high fan-out: few I/Os per lookup, but splits and merges must keep pages sensibly full.", "Sorted leaf chain: efficient range scans and ordered output, but concurrent splits complicate scanning."],
    p: ["Random keys such as unordered identifiers scatter inserts across all leaves and keep the whole index hot in cache.", "Monotonic keys concentrate inserts on the rightmost page, creating a contention hotspot."],
    v: "Insert ten million keys, verify with a structural checker that all leaves are at one depth, keys are ordered, links are consistent, and a range scan returns ordered results matching a sorted table scan.",
    dep: ["page-layout", "buffer-pool", "btree-concurrency"]
  },
  "btree-concurrency": {
    s: "Lets many sessions search and modify the same B-tree at once, using latch coupling or right-links so page splits never expose an inconsistent tree.",
    d: "A descent holds a latch on a parent only until it has latched the child, then releases the parent, so contention is brief. Splits are done in two steps: create the new right sibling, then insert the separator in the parent. Right-links and high keys let a reader that arrives between the steps move right and find its key. Structure modifications are logged so recovery sees complete or finishable splits. Deletion and page merging are the trickiest cases.",
    k: ["Right-links with high keys: readers never block on splits and need no parent latch to recover from them, but each page carries extra metadata.", "Lazy page reclaim instead of eager merging: avoids complex concurrent merges, but sparse pages remain until reclaimed by cleanup or rebuild."],
    p: ["Latching the root exclusively during a split serializes all index access for the duration.", "A bug in split logging leaves a tree half-split after a crash and queries missing rows."],
    v: "Run many threads inserting, deleting and scanning on one index for an hour, then kill the server, recover, and verify tree invariants, no missing or duplicate entries, and agreement with the table.",
    dep: ["btree-index", "latches", "write-ahead-log"]
  },
  "hash-index": {
    s: "An index mapping the hash of a key to row locations, giving constant-time equality lookups but no range or ordered access.",
    d: "Keys are hashed into buckets, each a chain of pages that grows by overflow pages or by splitting buckets incrementally. Lookup computes the hash, reads the bucket and checks matching entries, usually one or two page reads regardless of table size. It supports only equality. Growth uses linear or extendible hashing so the table expands without rehashing everything. In practice B-trees are often nearly as fast, so hash indexes win mainly for very large keys.",
    k: ["Equality-only structure: constant-time lookups and small keys stored as hashes, but no range, prefix or ordering use.", "Incremental bucket splitting: avoids stop-the-world rehash, but needs careful concurrent handling and extra overflow pages."],
    p: ["Skewed or duplicate-heavy keys create long overflow chains and degrade to linear scans of a bucket.", "Using a hash index for a predicate that is sometimes a range silently falls back to a table scan."],
    v: "Load ten million keys, run one million random equality lookups and confirm average page reads near one or two, while a range predicate is shown by the plan not to use the index.",
    dep: ["page-layout", "buffer-pool", "write-ahead-log"]
  },
  "inverted-index": {
    s: "Maps each element value, such as a word or array member, to the set of rows containing it, enabling fast search over composite values.",
    d: "For columns holding arrays, documents or structured values, an extraction function yields keys per row, and the index stores each key with a compressed posting list of row locations, with a small tree for keys. Queries combine posting lists by intersection and union. Updates are expensive since one row changes many keys, so a pending list buffers insertions and merges them in bulk. Used for full-text search and containment queries. Ranking and recheck against the table are separate steps.",
    k: ["Pending list for fast writes: batch merges cut update cost, but queries must read the pending list until merged.", "Compressed posting lists: save much space for common keys, but make point updates costlier."],
    p: ["Frequent small updates on a heavily indexed document column create write amplification and a long pending list.", "Very common keys give posting lists as big as the table, so the index does not help for those queries."],
    v: "Index a document column, query for rare and common terms, and confirm the plan uses the index, results match a table scan, and a bulk insert is followed by a merge that shrinks the pending list.",
    dep: ["btree-index", "page-layout", "index-maintenance"]
  },
  "spatial-index": {
    s: "A tree over bounding regions that answers overlap, containment and nearest-neighbor queries on geometric or multi-dimensional data.",
    d: "A generalized search tree structure stores for each entry a bounding box and for inner nodes the union of children. Searching descends all children whose region could match the query, so overlap between sibling regions degrades performance. Insertion picks the child needing least enlargement and splits with heuristics minimizing overlap. Nearest-neighbor search uses a priority queue ordered by distance. Quality depends on data distribution and bulk-loading strategy.",
    k: ["Overlapping bounding regions: allow flexible balanced inserts, but queries may descend several branches and cost more than a B-tree lookup.", "Bulk loading by space-filling order: produces tight, well-packed trees, but one-by-one inserts later degrade it."],
    p: ["Clustered or very large geometries make bounding boxes overlap, and queries degrade toward scanning the whole index.", "Index returns candidates by bounding box only, so an exact geometry recheck is still needed."],
    v: "Load one million points, run window queries and nearest-neighbor queries, and confirm results match a brute-force scan and the plan reads only a small fraction of the index pages.",
    dep: ["page-layout", "buffer-pool", "index-maintenance"]
  },
  "expression-and-partial-indexes": {
    s: "Indexes the result of an expression, or only the rows matching a condition, so lookups on derived values are fast and indexes stay small.",
    d: "An expression index stores the computed value of a function or expression of the row's columns, and the planner uses it when a query contains a matching expression. A partial index includes only rows satisfying its predicate, shrinking size and write cost and enforcing uniqueness among a subset. The planner must prove that the query's condition implies the index predicate. Expressions must be immutable, since a changing result would make the index stale and wrong.",
    k: ["Index on a computed expression: serves case-insensitive or derived lookups without a stored column, but the query must use the identical expression.", "Partial index with a predicate: much smaller and cheaper to maintain, but only usable when the planner can prove the query implies it."],
    p: ["Query uses a slightly different expression from the index, so the index is silently ignored.", "A predicate involving a parameter cannot be proven at plan time, so a generic plan skips the partial index."],
    v: "Create an index on lower(email) and a partial index on active rows, then confirm queries with matching forms use them and slightly different forms do not, and that unique enforcement applies only to the subset.",
    dep: ["btree-index", "user-defined-functions", "access-path-selection"]
  },
  "index-maintenance": {
    s: "Keeps indexes consistent with the table on every insert, update and delete, and reclaims their space after rows die, including rebuilds when they decay.",
    d: "Each row version has an entry in every index, so an insert adds entries to all of them, and an update that changes an indexed column adds new entries, while one that touches no indexed columns can skip index work with in-page optimizations. Dead entries are removed during cleanup. Pages become sparse after deletes, and the index may be rebuilt or reorganized. Every added index slows writes and takes space, so unused ones are a pure cost.",
    k: ["Index entry per row version: simple visibility and index independence, but multiplies write cost with the number of indexes.", "Skip index updates when no indexed column changes: greatly reduces write amplification, but needs free space on the same page."],
    p: ["Dozens of rarely used indexes make every write several times more expensive and bloat the cache.", "Heavy deletion leaves sparse index pages that waste cache until rebuilt."],
    v: "Run an update workload with and without indexed columns changing and confirm index write counts differ accordingly. Find unused indexes via statistics and confirm dropping one raises write throughput.",
    dep: ["btree-index", "version-garbage-collection", "heap-files"]
  },
  "concurrent-index-build": {
    s: "Builds an index on a live table without blocking writes, by scanning in several phases and reconciling changes made during the build.",
    d: "The build registers the index as in progress so writers maintain it, scans the table at one snapshot to build the structure, then performs a second pass to add rows changed after the first snapshot, and finally waits for older transactions before marking it valid. It avoids the long exclusive lock of a normal build at the cost of more passes and longer duration. A failure leaves an invalid index that must be dropped. Unique builds need careful conflict handling.",
    k: ["Multi-phase build with two snapshots: allows writes throughout, but takes about twice the scan work and waits for old transactions.", "Mark invalid on failure instead of rolling back: keeps the cleanup simple, but leaves residue that costs write time until dropped."],
    p: ["A failed build leaves an invalid index that still slows every write until someone drops it.", "Long-running transactions delay the final wait phase, so the build appears hung."],
    v: "Run continuous inserts and updates while building an index concurrently on a large table, then confirm no writer blocked, the index is valid, and a verifier shows every row is indexed exactly once.",
    dep: ["btree-index", "snapshot-management", "online-schema-change"]
  },
  "page-layout": {
    s: "The internal organization of a fixed-size page: header, an array of item pointers growing from the front, row data growing from the back, and free space between.",
    d: "A page, commonly eight to sixteen kilobytes, has a header with log position, checksum and free-space bounds. Item pointers give each row a stable slot number, so row addresses survive moving data within the page for compaction. Rows are allocated from the end. Special space holds structure-specific data such as index links. Fixed page size gives simple I/O and caching, while slot indirection permits defragmenting a page without changing external references.",
    k: ["Slotted pages with indirection: row identifiers stay stable when data moves in the page, but cost a few bytes per row.", "Page size choice: larger pages mean fewer I/Os for scans and wider fan-out, but more write amplification and contention per page."],
    p: ["A page-size change requires a full dump and restore since all files assume one size.", "Row identifiers reused after a slot is freed can make stale references in indexes point at the wrong row."],
    v: "Fill a page with variable-length rows, delete some, compact it, and confirm every surviving row keeps its slot number and content and the checksum validates.",
    dep: []
  },
  "heap-files": {
    s: "Unordered collections of pages holding a table's rows, where each row is addressed by page and slot and new rows go wherever space is found.",
    d: "A table is a file or set of segments of pages. Insert asks the free-space tracker for a page with room and appends the tuple there; updates write a new version, preferably on the same page. The order is arbitrary, so the table is clustered by insertion time unless explicitly reorganized. Row addresses are stable references used by indexes. Heap organization avoids reordering costs on insert, but range scans on a key need a separate index.",
    k: ["Unordered heap with separate indexes: cheap inserts and flexible indexing, but a lookup always needs an extra fetch from the heap.", "Index-organized tables storing rows in key order: lookups by key avoid the extra step, but inserts and secondary indexes become costlier."],
    p: ["Heavy updates and deletes leave pages half-empty and the heap many times its live size.", "Physical order drifts from key order, so range queries through an index jump between pages."],
    v: "Insert and delete in patterns that leave gaps, then confirm new inserts reuse the freed space instead of extending the file, and a table-size report matches the sum of page contents.",
    dep: ["page-layout", "free-space-map", "file-segment-manager"]
  },
  "tuple-format": {
    s: "The byte layout of a stored row: header with version and visibility data, a null bitmap, and column values packed with alignment and variable-length encodings.",
    d: "The header carries the creating and deleting transaction identifiers, flags and a link to the next version. A null bitmap spares space for null columns. Fixed-width columns are aligned to their natural boundary for fast access, which wastes padding unless columns are ordered by size. Variable-length values have a length prefix, with short values using one byte. Decoding a column near the end of the row means skipping all earlier ones, unless offsets are cached.",
    k: ["Version information in every row header: visibility checks need no external lookup, but add a fixed per-row overhead of tens of bytes.", "Aligned fixed-width fields: fast access and atomic reads, but padding wastes space with poor column order."],
    p: ["A narrow table of small values has header overhead rivaling the data itself.", "Adding columns in the middle of a wide row definition inflates every row with padding for alignment."],
    v: "Store rows with differing nulls and column orders, decode them through the engine and a standalone reader, and confirm identical values and that bytes per row match the computed layout.",
    dep: ["page-layout", "type-coercion"]
  },
  "free-space-map": {
    s: "A compact index of how much room each heap page has left, so inserts and updates find a page with space without scanning the table.",
    d: "A separate structure stores, per heap page, a coarse number such as free bytes in 1/256ths of a page, organized as a tree so the search for a page with at least a given amount is logarithmic. It is updated by cleanup when space is freed and consulted during insert. It is approximate and not logged with full rigor, so it may be corrected on use. Without it, inserts either append at the end, bloating the file, or scan.",
    k: ["Approximate map not strictly logged: cheap to maintain, but may be wrong after a crash and be repaired when a page is visited.", "Coarse granularity of free space: keeps the map tiny, but may skip pages with just enough room."],
    p: ["A stale map after a crash directs inserts to pages without room, adding wasted page visits until repaired.", "Concurrent inserters all choosing the same page cause contention on it."],
    v: "Delete half of a table's rows, run cleanup, then insert the same volume and confirm the file does not grow and inserts are spread across the freed pages without hot-spotting a single page.",
    dep: ["heap-files", "version-garbage-collection"]
  },
  "visibility-map": {
    s: "A bitmap marking pages in which all rows are visible to every transaction, letting scans skip row visibility checks and cleanup skip clean pages.",
    d: "Two bits per heap page record whether every row on the page is visible to all current and future snapshots, and whether all rows are frozen. Cleanup sets the bit after it verifies the page. Any write clears it. Index-only scans consult it to avoid fetching heap pages, and cleanup skips pages already marked. Correctness is critical: a bit set while a row is not visible to all would return wrong results, so clearing is logged and ordered with the page change.",
    k: ["Bit cleared on any modification: guarantees correctness without scanning, but makes the benefit decay on write-heavy tables.", "Separate frozen bit: lets wraparound cleanup skip stable pages, at the price of another invariant to maintain."],
    p: ["A bit that is set wrongly after a crash or bug makes index-only scans return rows that should be invisible.", "Tables with constant updates never accumulate set bits, so index-only scans give no savings."],
    v: "Run cleanup on a static table, confirm the map shows almost all pages set and index-only scans do near-zero heap fetches, then update some rows and confirm only those pages' bits clear.",
    dep: ["heap-files", "version-garbage-collection", "write-ahead-log"]
  },
  "large-value-storage": {
    s: "Stores values too big for a page by compressing them and moving them to a separate chunked side table, leaving a small pointer in the row.",
    d: "When a row exceeds a threshold, the largest variable-length columns are first compressed in place, then if still large, split into chunks stored in an associated side table keyed by value identifier and sequence, with only a small pointer kept in the main row. Values are fetched only when the column is actually read, so scans that skip it stay fast. Updates to other columns do not rewrite the large value. Very large objects may use a separate streaming interface.",
    k: ["Out-of-line chunks fetched on demand: wide values do not slow scans of other columns, but each access needs extra index lookups.", "Compress before moving out of line: saves space and I/O for compressible data, but wastes CPU on already-compressed content."],
    p: ["Selecting the large column in a scan or sorting by it fetches every chunk and is far slower than expected.", "Deleting rows leaves large-value chunks until their own cleanup runs, so space is not reclaimed immediately."],
    v: "Store a ten-megabyte value, confirm the base row stays small, read it back byte for byte, then run a scan that excludes the column and confirm no side-table reads occur.",
    dep: ["tuple-format", "page-compression", "heap-files"]
  },
  "page-compression": {
    s: "Reduces storage and I/O by compressing column values, whole pages or segments, trading CPU time for smaller data and more cache coverage.",
    d: "Options include per-value compression inside rows, whole-page compression with holes punched in the file, and columnar-style encodings such as dictionary, run-length and delta. Compressed pages are decompressed into the buffer pool or, in advanced designs, queried directly. The challenge for updates in place: a changed page may no longer fit its allocated compressed size. Ratios depend on data, and compressing already-compressed or encrypted data wastes work.",
    k: ["Compression on write and decompression on read: shrinks I/O and storage, but costs CPU on the hot path and complicates in-place updates.", "Fast lightweight codecs over high-ratio ones: low CPU overhead and good enough ratios, but leave storage savings on the table."],
    p: ["Encrypting before compressing makes data incompressible, giving no savings.", "Pages that grow after an update no longer fit their compressed slot and force relocation or fragmentation."],
    v: "Load a compressible dataset with and without compression, confirm size drops by the expected ratio, query results are identical and a scan benchmark shows the measured CPU versus I/O trade-off.",
    dep: ["page-layout", "buffer-pool"]
  },
  "file-segment-manager": {
    s: "Maps logical tables and indexes to files on disk, splitting large relations into fixed-size segments and handling extension, truncation, sync and removal.",
    d: "Each relation has one or more files named by identifiers, growing in segments of about a gigabyte so no file becomes unmanageably large. The manager translates a block number into a segment and offset, extends files when new pages are needed, calls sync at checkpoint time for every file written, and removes files at commit of a drop. Tablespaces map groups of files onto different storage devices. Crash safety for creation and deletion needs log records.",
    k: ["Segmented files per relation: bounded file size and simple mapping, but many open files for large databases.", "Syncing files only at checkpoints rather than every write: gives high write throughput, but all unsynced writes depend on the log for recovery."],
    p: ["Ignoring errors from a failed sync lets the engine believe data is durable when it was lost.", "File descriptor exhaustion with thousands of relations produces errors under load."],
    v: "Create a table, grow it past a segment boundary, confirm segment files appear with correct sizes, drop the table and verify all its files are removed, including after a crash between commit and removal.",
    dep: ["page-layout", "write-ahead-log"]
  },
  "durability-guarantees": {
    s: "The contract stating exactly what a commit acknowledgment promises after a crash or power loss, and which settings or hardware behaviors weaken it.",
    d: "Durability depends on a chain: the log flush reaches stable media, the storage honors flush commands, the file system does not reorder or lose metadata, and replicas acknowledge if synchronous. Each link can be weakened for speed: delayed flush, disabled sync, volatile caches without power protection. The guarantee must be stated precisely in terms of acknowledged transactions and tested by actually pulling power, since software cannot see a drive that lies about flushing.",
    k: ["Flush the log at every commit by default: acknowledged transactions survive crashes, at the cost of commit latency set by the storage sync time.", "Relaxed durability as an opt-in per transaction: lets bulk or low-value writes go faster, but must lose only a bounded recent window and never consistency."],
    p: ["Hardware caches that acknowledge writes before persistence break the guarantee without any software signal.", "Disabling sync for a bulk load and forgetting to restore it leaves production unprotected."],
    v: "Run a workload acknowledging commits to an external recorder, cut power repeatedly at random moments, and confirm every acknowledged transaction survives and none are partially applied across a hundred cycles.",
    dep: ["write-ahead-log", "group-commit", "synchronous-commit-modes", "file-segment-manager"]
  },
  "isolation-semantics": {
    s: "The defined set of anomalies each isolation level allows or forbids, and the retry and error behavior applications must handle to get correct results.",
    d: "Isolation is a contract spanning the lock manager, snapshots, visibility rules and constraint checks. It specifies what a reader sees when a writer commits, how write conflicts resolve, and which failures are retryable. Different systems use the same level names for different guarantees, so the specification must be explicit and tested with anomaly scenarios. It also constrains replicas, cursors, triggers and routines, all of which must use consistent snapshots.",
    k: ["Snapshot-based levels with optional serializable detection: readers never block, but applications must retry on conflict.", "Precisely documented anomalies per level: let developers reason about correctness, but constrain optimizations that would change visible behavior."],
    p: ["Application code written against one system's level semantics misbehaves on another with the same level name.", "Trigger and routine code that takes its own snapshot sees different data from the statement that called it."],
    v: "Run a library of anomaly tests, including dirty read, lost update, non-repeatable read, phantom and write skew, at each level and compare the observed outcomes to the documented table.",
    dep: ["isolation-levels", "snapshot-management", "lock-manager", "mvcc-versioning"]
  },
  "memory-management": {
    s: "How server memory is divided among the shared buffer pool, per-session work areas, caches and background workers, and what happens when any budget is exceeded.",
    d: "Memory is split into shared regions fixed at startup, such as the buffer pool and lock tables, and per-session contexts allocated and freed in bulk with the query. Operators have work memory budgets and spill when over. Total demand is the sum across all concurrent operators and sessions, which no single setting bounds. Allocation failure behavior, from errors to operating system killing, determines whether overload degrades gracefully or catastrophically.",
    k: ["Arena-style memory contexts freed in bulk at statement end: eliminates leaks and speeds cleanup, but a long-lived context can hold large amounts.", "Per-operator budgets with spilling: bound each operator, but total memory depends on plan shape and concurrency."],
    p: ["Setting per-operator memory high multiplies across parallel workers, operators and sessions into an out-of-memory kill.", "Unbounded caches such as plan caches or catalog caches in long-lived pooled sessions grow without limit."],
    v: "Run peak concurrency of the heaviest queries and track total resident memory against the budget, confirming the server spills and errors cleanly instead of being killed, and that memory returns to baseline afterward.",
    dep: ["buffer-pool", "spill-to-disk", "resource-governance", "connection-handling"]
  },
  "observability": {
    s: "The set of signals that let operators see what the database is doing and why: statistics views, wait events, logs, plan inspection and traces tied to statements.",
    d: "Useful observability connects layers: a slow request in the application maps to a statement fingerprint, a plan with actual row counts, the wait events it spent time in and the locks it held. Counters must be cheap enough to leave on, detailed tracing selectively enabled, and everything available through SQL or standard exporters. Gaps hurt most in rare events such as lock pile-ups, so history must be sampled and retained.",
    k: ["Always-on cheap counters plus on-demand detailed tracing: low overhead in steady state, but rare events may need to be reproduced to be captured.", "Wait-event sampling instead of tracing every wait: low overhead and good statistical picture, but misses very short waits."],
    p: ["Diagnosing from instantaneous views after the incident ended leaves no evidence to explain it.", "Monitoring only averages hides tail latency that users actually experience."],
    v: "Induce a lock pile-up, a bad plan and an I/O stall in a test environment, and confirm each is diagnosable from retained signals alone, naming the statement, blocker and wait type.",
    dep: ["runtime-statistics-views", "slow-query-logging", "audit-logging"]
  },
  "upgrade-compatibility": {
    s: "The rules that let a new server version read old data, speak to old clients and replicate with old peers, and the migration paths between incompatible versions.",
    d: "Minor releases keep the on-disk and wire formats, so binaries can be swapped in place. Major releases may change page, catalog or log formats and require dump and restore, in-place upgrade tools that rewrite the catalog, or logical replication to a new version. Client protocol must remain backward compatible across years, collation and type semantics must not drift silently, and extensions must be rebuilt. Rollback after upgrade is the plan that is most often missing.",
    k: ["Stable on-disk format within a major version: simple minor upgrades and rollbacks, but constrains fixes needing format changes.", "Logical-replication upgrade path: near-zero downtime between major versions, but needs full copies and careful sequence and schema handling."],
    p: ["An in-place upgrade without tested rollback leaves no way back if the new version misbehaves.", "Library changes alter collation order so existing indexes no longer match sort order after an upgrade."],
    v: "Upgrade a copy of production through the intended path, run the full application test suite and workload replay, compare query plans and results, and execute the rollback procedure to confirm it works.",
    dep: ["system-catalog", "wire-protocol", "log-record-format", "extension-framework"]
  },
  "fault-tolerance": {
    s: "How the system behaves when parts fail: crashed processes, full disks, corrupt pages, lost replicas and network partitions, so failures stay contained and detectable.",
    d: "Fault handling spans the whole stack: checksums detect corrupt pages, crash recovery restores consistency, supervisors restart workers, replicas and failover cover machine loss, and quotas protect against full disks. The design aim is that failures are detected rather than silently propagated, that a failing component does not poison shared state, and that the server fails closed when safety requires. Testing needs fault injection, since real failures are rare and varied.",
    k: ["Restart all processes when a shared-memory process dies: guarantees no corrupt shared state continues, but turns one fault into a brief total outage.", "Checksums and fail-stop on corruption: prevent silent bad data spreading to replicas and backups, at the cost of refusing service for the affected data."],
    p: ["Full disks on the log volume halt the server, and recovery often needs free space the operator has not reserved.", "Silent corruption copied into replicas and backups removes every clean copy before anyone notices."],
    v: "Using fault injection, kill processes, fill disks, corrupt a page and sever the network under load, and confirm each fault is detected, logged, contained and recovered from per the design without silent wrong results.",
    dep: ["crash-recovery", "failover-promotion", "background-workers", "torn-page-protection"]
  },
});
