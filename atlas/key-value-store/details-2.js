// Details for the key-value store plate, part 2: transactions, features, statistics.
ATLAS.details("key-value-store", {
  "snapshots": {
    s: "A handle recording the last sequence number at creation, giving later reads a frozen, consistent view of the whole database.",
    d: "Creating a snapshot reads the current published sequence number and registers it in a sorted list. Reads at that snapshot ignore entries with higher sequence numbers. The list's oldest entry tells compaction the earliest sequence any reader may still need, so it must keep older versions of a key that straddle a snapshot. It costs almost nothing to take, but holding one keeps obsolete data alive and prevents tombstones from being dropped. Snapshots are in memory only and vanish on restart.",
    k: ["Sequence-number snapshots versus copying data: sequence snapshots are constant time and space, but pin old versions in files until released.", "Instance-wide snapshot versus per-column-family: instance-wide gives cross-family consistency, but one forgotten handle retards cleanup in every family."],
    p: ["A leaked snapshot makes disk usage grow without bound because compaction cannot discard shadowed versions.", "Assuming snapshots survive a restart: they do not, so long reads across restarts need another mechanism."],
    v: "Take a snapshot, overwrite one million keys, compact fully, and confirm reads at the snapshot still return old values while space is roughly doubled. Release the snapshot, compact, and confirm space returns to normal.",
    dep: ["sequence-numbers","visibility-rules","write-visibility"]
  },
  "optimistic-txn": {
    s: "Transactions that buffer writes, take no locks while running, and at commit check that no tracked key changed since it was read, failing if one did.",
    d: "The transaction records each key it reads or writes along with the sequence number it saw. Writes go into a private batch. At commit the engine checks every tracked key against the memtable and recent files for a newer sequence, then applies the batch atomically if none changed, otherwise it returns a busy status. It works best when conflicts are rare. It is hard because the check relies on memtable history; if the memtable was flushed and its history dropped, the check cannot prove absence of a conflict and must fail conservatively.",
    k: ["Optimistic versus pessimistic concurrency: optimistic adds no lock overhead and never blocks, but wastes work and can starve a transaction on hot keys.", "Validation at commit versus at each write: commit-time validation is one pass, but long transactions learn of conflicts only after doing all their work."],
    p: ["Long transactions across a memtable flush fail conflict checks spuriously when history has been discarded.", "Retry loops without backoff on a hot key livelock under contention."],
    v: "Start two transactions that read and write the same key; commit one, then the other. Confirm the second gets a busy error and its writes are absent. Flush between them and confirm the conservative failure also occurs.",
    dep: ["snapshots","conflict-checking","write-batch"]
  },
  "pessimistic-txn": {
    s: "Transactions that take locks on keys as they read-for-update or write, hold them until commit or rollback, and wait or fail on conflict.",
    d: "Each write or read-for-update asks the lock manager for an exclusive or shared lock on the key, waiting up to a timeout. Writes are buffered in a batch and applied at commit; the transaction can read its own pending writes through a layer over the database iterator. Locks release at commit. Deadlocks are found by a wait-for graph search, aborting one participant. It is hard to avoid holding locks across slow work, and to choose a write policy that decides when buffered writes become visible to other readers.",
    k: ["Pessimistic locks versus optimistic validation: locks give predictable commit success under contention, but add lock memory and risk deadlock and timeouts.", "Buffering writes until commit versus writing early: buffering keeps the log clean on abort, but concentrates the commit work and memory in the final step."],
    p: ["Lock timeouts set too high turn one slow transaction into a pile-up of blocked callers.", "Forgetting to release or roll back leaks locks that block that key forever."],
    v: "Run two transactions that each lock one key and then request the other. Confirm a deadlock is detected, exactly one aborts with a deadlock status, and the other commits.",
    dep: ["lock-manager","snapshots","write-batch","conflict-checking"]
  },
  "lock-manager": {
    s: "The in-memory table of key locks held by running transactions, sharded for concurrency, with wait queues, timeouts and deadlock detection.",
    d: "Locks are stored in a hash table keyed by column family and key, divided into stripes each with its own mutex to limit contention. A request that conflicts joins a wait queue with a deadline. A wait-for graph is checked on each wait to find cycles. Range locking is an alternative that locks key intervals instead of single keys, which protects scans from phantoms. Memory is bounded by a limit on locks per transaction, since millions of row locks can exhaust RAM.",
    k: ["Point locks versus range locks: point locks are cheap and simple, but cannot stop other transactions inserting into a scanned range.", "Lock striping versus one global mutex: striping scales on many cores, but needs a global ordering to avoid deadlocks while checking multiple stripes."],
    p: ["Locking a large range key by key consumes memory proportional to the keys, not the range.", "Deadlock detection depth limits can miss long cycles and leave them to the timeout."],
    v: "Lock ten thousand keys in one transaction and confirm memory use matches the configured per-lock estimate. Create a three-way cycle and confirm detection aborts one transaction within the detection interval.",
    dep: ["comparator"]
  },
  "conflict-checking": {
    s: "Determines whether a key was written after a transaction's snapshot, by consulting memtable history and, if needed, files, so that lost updates are prevented.",
    d: "For a tracked key the checker asks for the newest sequence number of that key across memtables, and if the memtable's history does not reach back to the snapshot, falls back to reading files or reports a possible conflict. The memtable keeps older sequence information only up to a size limit. Both transaction types depend on it: pessimistic ones to verify no one wrote before the lock was taken, optimistic ones at commit. It is hard because correctness depends on how much history is retained.",
    k: ["Conservative failure when history is missing versus reading files: failing is cheap and always safe, but aborts transactions that had no real conflict.", "Retaining more memtable history versus less: more history cuts spurious aborts, but holds memory beyond the flush threshold."],
    p: ["A tiny history size makes long-running transactions fail on nearly every commit.", "Skipping files for lookups on recently flushed data returns a wrong no-conflict answer."],
    v: "Read a key at a snapshot, write it from another thread, and confirm the first transaction's commit fails. Repeat with the other write flushed to a file and confirm the same outcome.",
    dep: ["memtable","get-path","sequence-numbers"]
  },
  "two-phase-commit": {
    s: "Splits commit into a durable prepare step that logs the transaction's writes under a name, and a later commit or rollback, so an outer coordinator can decide.",
    d: "Prepare writes the transaction's batch to the log wrapped in begin-prepare and end-prepare markers with a transaction name, and syncs it. The writes are not yet visible. A later commit record makes them visible; a rollback record discards them. On recovery, prepared transactions without a decision are held in memory for the coordinator to resolve and their log files cannot be deleted until then. This lets the store take part in distributed commit. It is hard because pending prepares pin log files and locks across restarts.",
    k: ["Prepare in the log versus in the memtable: logging first guarantees survival across crash, but writes happen twice and a prepared batch blocks log deletion until decided.", "Name-based recovery versus automatic abort: names let a coordinator finish the decision, but unresolved prepares hold resources indefinitely."],
    p: ["Orphaned prepared transactions pin old log files and grow disk use after coordinator failure.", "Locks held through restart for prepared transactions can block unrelated traffic after recovery."],
    v: "Prepare a transaction, kill the process, reopen, and confirm the transaction is listed as prepared with its writes invisible. Commit it by name and confirm the writes appear.",
    dep: ["wal-format","pessimistic-txn","crash-recovery"]
  },
  "column-families": {
    s: "Named, independent keyspaces inside one instance that share one log and manifest but have their own memtables, files and options.",
    d: "Each family has its own memtable set, level structure, compaction settings, comparator, compression and filters. Writes to several families in one batch are atomic because they share a log. Flushing is per family, but the log can be deleted only when every family's data in it has been flushed, so one idle family can pin logs. Families can be created and dropped online; dropping removes its files without rewriting. It is hard to size: many families multiply memtable memory and file handles.",
    k: ["Column families versus key prefixes: families give separate tuning and instant drop, but add memory per family and tie log retention to the slowest.", "Shared log versus per-family logs: sharing gives cross-family atomicity and one sync per commit, but lets a rarely written family hold back log cleanup."],
    p: ["A family that is almost never written keeps old logs alive and the log directory grows.", "Hundreds of families each reserving a write buffer overcommit memory at startup."],
    v: "Write to two families, flush only one, and confirm the old log is retained. Flush the other and confirm the log is deleted. Drop a family and confirm its files vanish without compaction.",
    dep: ["wal-retention","memtable","levels","manifest"]
  },
  "ttl-expiry": {
    s: "Automatic removal of entries older than a configured age, performed during compaction by comparing stored write times against the clock.",
    d: "Each value carries a write timestamp, either appended by a wrapper or recorded in table properties. A compaction filter drops entries whose age exceeds the limit. Expiry is lazy: an expired key still exists until a compaction touches its file, so reads may return it unless the wrapper checks the timestamp. Whole-file expiry is cheaper: if every entry in a file is older than the limit, the file can be dropped without being read. The hazard is clock changes, and files at deep levels that are compacted rarely and keep expired data.",
    k: ["Filtering at compaction versus at read: compaction filtering reclaims space for free during rewrites, but expired data lingers and is visible unless reads also filter.", "Per-entry timestamps versus file-level age: per-entry is precise and general, while file-level dropping is nearly free but needs time-ordered writes."],
    p: ["A clock that jumps forward expires live data immediately and permanently.", "Cold deep files never compact, so expired entries consume space for weeks."],
    v: "Write keys with a one-minute TTL, wait two minutes, read and confirm reads treat them as absent, then compact and confirm table properties show the entries are physically gone.",
    dep: ["compaction-filter","fifo-compaction","file-metadata"]
  },
  "checkpoints": {
    s: "A consistent, openable copy of the database made by hard-linking immutable files and copying only the log and manifest, in seconds regardless of size.",
    d: "Because table files never change, a checkpoint creates hard links to them in another directory on the same file system, copies the manifest up to its current size, and copies or truncates the logs. File deletion is paused during the operation so nothing disappears. The result is a normal database directory. If the target is on another file system, files are copied instead. It is hard because links share storage: deleting space in one copy does not free it until all links go, and cross-device checkpoints are slow.",
    k: ["Hard links versus copying: links are instant and use no extra space, but require the same file system and mean both copies share fate if media fails.", "Flushing before checkpoint versus copying logs: flushing yields a smaller log copy, but forces a flush and may stall writes."],
    p: ["Treating a same-disk checkpoint as a backup: a disk failure destroys both copies.", "Deleting the original's files assuming space returns, when the checkpoint's links keep them alive."],
    v: "Create a checkpoint of a one hundred gigabyte database and confirm it takes seconds, uses almost no new space, opens as a database, and returns the same keys after further writes to the original.",
    dep: ["manifest","file-system-abstraction","immutable-memtables"]
  },
  "backups": {
    s: "Incremental copies of the database to another location, de-duplicating table files across backups and verifying checksums on restore.",
    d: "A backup engine copies the table files, manifest and logs to a backup directory, naming table files so that a file already stored by an earlier backup is reused, making each backup incremental. Metadata records which files belong to each backup with sizes and checksums. Restore copies files back and verifies them. Old backups can be purged, deleting files no remaining backup references. It is hard because correctness rests on file identity: reusing a file name for different content would corrupt older backups.",
    k: ["Incremental by file identity versus full copies: incremental saves transfer and space, but backups depend on shared files so one corrupted file damages several.", "Backup from a live instance versus from a checkpoint: live is simple, but needs file deletion paused for the whole copy duration."],
    p: ["Restoring without verifying file checksums brings silent media corruption back into production.", "Purging backups concurrently with an in-flight backup can delete a shared file just reused."],
    v: "Take a backup, write more data, take a second, and confirm the second copies only new files. Corrupt one stored file and confirm restore of any backup using it fails its checksum.",
    dep: ["checkpoints","file-checksums","manifest"]
  },
  "external-ingestion": {
    s: "Adds pre-built sorted table files directly into the level structure, bypassing the log and memtable so bulk loads cost almost no write work.",
    d: "Files are built offline by a table builder with keys in sorted order and then handed to the engine, which assigns them a global sequence number, finds the lowest level where they do not overlap existing data, and records them with one version edit. If a file overlaps the memtable, the memtable is flushed first. Loading terabytes becomes a metadata operation plus a file move or copy. It is hard because files must be internally sorted and disjoint from each other, and placement must preserve read ordering.",
    k: ["Ingesting at a lower level versus the top: lower placement avoids rewrites, but needs a gap in the key range, or the file lands higher and compaction pays.", "Hard link or move versus copy: move is instant but consumes the source, while copy keeps the source and doubles transfer time."],
    p: ["Overlapping unsorted input files are rejected late, after expensive generation.", "Ingesting into a range with live memtable data forces a flush and a brief write stall."],
    v: "Build a file of ten million sorted keys offline, ingest it, and confirm it appears in the manifest at a deep level with no compaction, and that all keys read correctly with a single version edit logged.",
    dep: ["table-builder","version-edit","levels","sequence-assignment"]
  },
  "value-separation": {
    s: "Stores large values in separate append-only blob files and keeps only a small pointer in the sorted files, so compaction rewrites keys, not bulky values.",
    d: "Values over a size threshold are written to a blob file at flush or compaction time, and the table entry holds the blob file number, offset and size. Compaction then moves only keys and pointers, so write amplification for large values drops sharply. Reads pay one extra random read to fetch the value. Scans become slower because values are no longer adjacent to keys, and prefetching helps. The hard problem is reclaiming blob space: a blob file stays alive while any pointer references it.",
    k: ["Separating values versus inline storage: separation cuts write amplification for large values, but adds a read per lookup and makes scans random-access.", "Threshold size choice: a low threshold separates more data and saves more write work, but harms point-read latency for mid-sized values."],
    p: ["Space amplification grows quietly because dead values stay in blob files until collection runs.", "Range scans on separated data are several times slower unless readahead is enabled."],
    v: "Write one million thousand-byte values with separation on and off; confirm compaction bytes written are far lower with separation, and a point read does exactly one extra file read.",
    dep: ["flush-job","compaction-job","file-metadata","blob-gc"]
  },
  "blob-gc": {
    s: "Reclaims space from blob files by relocating still-referenced values during compaction and deleting blob files that no table entry points to.",
    d: "Each blob file tracks how many bytes are still referenced. When compaction rewrites a key whose pointer targets an old blob file, it can read the value and write it to a new blob file, updating the pointer. An age cutoff selects which old blob files to relocate. When the last reference to a file disappears, the file is deleted. It is hard because relocation increases write work, and the policy chooses between space and I/O cost with no universally good setting.",
    k: ["Relocation during compaction versus a separate collector: tying it to compaction needs no extra lookups, but only reaches data compaction visits.", "Aggressive versus lazy cutoff: aggressive recovers space faster, but rewrites values that might have died soon anyway."],
    p: ["Cold key ranges that compaction never touches keep dead values in blob files indefinitely.", "Aggressive relocation rewrites a large share of the blob data each cycle and competes with foreground I/O."],
    v: "Overwrite every key in a separated-value database repeatedly with garbage collection on and off, and confirm blob file bytes stay within the configured space amplification only when it is on.",
    dep: ["value-separation","compaction-job","file-metadata","version-edit"]
  },
  "secondary-instances": {
    s: "Open the same database directory read-only, or as a follower that tails the manifest and logs, to serve reads without owning writes.",
    d: "A read-only instance opens the current manifest and sees a fixed state. A secondary instance holds no write lock and periodically catches up: it re-reads the manifest for new version edits and replays new log records into its own memtables. The primary must not delete files a secondary still uses, so deletion needs coordination or shared storage that tolerates it. It is hard because the secondary reads files that the primary is concurrently creating and deleting.",
    k: ["Tailing the primary's files versus a replicated copy: tailing shares storage and costs no copy, but couples both to the file layout and deletion timing.", "Catching up on demand versus on a timer: on demand gives fresher reads for the caller, but pays replay cost inside the request."],
    p: ["A secondary reading a file the primary just compacted away fails with a missing file error.", "Long gaps between catch-ups force replaying a huge backlog of log records."],
    v: "Open a secondary, write on the primary, call catch-up, and confirm new keys are visible. Force a compaction on the primary and confirm the secondary reads continue without missing-file errors.",
    dep: ["manifest","wal-format","version-set"]
  },
  "statistics-counters": {
    s: "Cumulative tickers and histograms for operations, cache hits, bytes read and written, stalls and compaction work, readable at any time.",
    d: "Tickers are atomic counters incremented on hot paths, such as block cache hits and misses, filter useful and full-positive counts, bytes written to the log and by compaction. Histograms record distributions such as get latency and compaction time. They are cheap enough to leave on, though per-thread sharding keeps contention low. Operators compute ratios: write amplification as bytes written to storage over bytes written by users. The hard part is interpretation, since counters reset only on restart and averages hide tail latency.",
    k: ["Per-thread counters versus a global atomic: per-thread removes cache-line contention, but reading requires summing and gives only an approximate instant value.", "Detailed timers versus counters only: timers explain where time goes, but taking timestamps on every operation costs measurable overhead."],
    p: ["Looking at lifetime averages hides a recent regression that lasted minutes.", "Enabling fine-grained timing in production adds several percent overhead to the hot read path."],
    v: "Run a read-only workload and confirm block cache hits plus misses equals block reads. Run a write workload and confirm bytes written by compaction divided by user bytes matches the reported write amplification.",
    dep: ["block-cache","compaction-job","write-stalls"]
  },
  "perf-context": {
    s: "A thread-local set of timers and counters for a single operation, showing exactly how many blocks, files, tombstones and comparisons that one call touched.",
    d: "Before an operation the caller enables the context and resets it. Afterward it can read counts such as internal keys skipped, seek calls, block reads, cache hits, filter checks, and time spent in locks or the log. Because it is per thread and per operation it can explain one slow query without being drowned in aggregates. A parallel I/O context records bytes and time in file system calls. The difficulty is overhead when timing is enabled, and that work done on background threads is not attributed.",
    k: ["Per-operation context versus aggregate counters: per-operation pinpoints one slow call, but requires the caller to opt in and sample.", "Time measurement levels: counting only is nearly free, while timing adds clock reads that distort microsecond operations."],
    p: ["Reading the context from a different thread than the operation returns zeros and misleads the investigation.", "Leaving timing on for all requests measurably slows short lookups."],
    v: "Run a get on a key shadowed by a thousand tombstones and confirm the context reports about one thousand internal keys skipped, then repeat after compaction and confirm it drops to near zero.",
    dep: ["get-path","db-iterator","block-cache"]
  },
  "event-listeners": {
    s: "Callbacks the application registers to be told when flushes, compactions, file creation and deletion, stalls and background errors begin and end.",
    d: "Listeners receive structured records: job id, column family, input and output files, bytes, duration, reason and status. Applications use them to maintain external indexes of files, mirror data, export metrics, or react to stalls by shedding load. Callbacks run on background threads, sometimes while engine locks are held or released depending on the hook, so they must be quick and must not call back into the database in unsafe ways. The hard part is that slow callbacks stall the very background work they observe.",
    k: ["Synchronous callbacks versus a queue: synchronous callbacks are simple and ordered, but a slow handler blocks flush or compaction completion.", "Rich event records versus minimal: rich records enable external automation, but freeze more internal structure into the public interface."],
    p: ["A listener that writes to the same database from inside a callback can deadlock the background thread.", "Heavy work in the file-deleted hook delays obsolete file cleanup and holds disk space."],
    v: "Register a listener, trigger a flush and a compaction, and confirm each begin event pairs with exactly one end event carrying matching job id, file lists and nonzero byte counts.",
    dep: ["flush-job","compaction-job","background-scheduler"]
  },
  "info-log": {
    s: "A text log of engine decisions plus named properties exposing live state such as file counts per level, pending compaction bytes and memtable sizes.",
    d: "The info log records open options, every flush and compaction with sizes and timing, stall transitions and errors, and periodically dumps statistics and a per-level table showing files, size, score and read and write rates. Properties are queried by name, for example the number of files at a level or the estimated key count. They are the first place to look when throughput changes. The difficulty is volume: logs rotate and are bounded in size, so old events may vanish before they are examined.",
    k: ["Verbose logging versus quiet: verbose logs explain stalls after the fact, but write constantly and rotate faster than an investigation can start.", "Properties polled by monitors versus pushed events: polling is simple and stateless, but misses short-lived conditions between samples."],
    p: ["Log rotation with a small size limit loses the entries that explain last week's incident.", "Estimates such as key count are approximate, and are sometimes treated as exact."],
    v: "Trigger a write stall by pausing compaction, then confirm the log shows the stall begin with its cause and that the pending-bytes and level-file-count properties match the log's per-level table.",
    dep: ["write-stalls","levels","statistics-counters"]
  },
  "options-and-tuning": {
    s: "The set of settings for buffer sizes, level sizing, file sizes, compression, filters, cache and thread counts, and the process of choosing them for a workload.",
    d: "Hundreds of options interact. The central ones are the write buffer size and count, the level base size and multiplier, target file size, compaction trigger and stall thresholds, compression per level, filter bits per key, block size and cache capacity. Presets exist for point lookups, bulk loading and space efficiency. Tuning starts from measured amplification: raise filter bits if point reads miss, enlarge buffers if flushes are small, change strategy if write cost dominates. The hard part is that settings trade one amplification for another, and defaults suit no workload.",
    k: ["Large write buffers versus small: large buffers absorb overwrites and produce fewer, bigger files, but cost memory and lengthen recovery from the log.", "Tuning per workload from measurement versus using presets: measurement fits the data, but needs a representative load and time, while presets are quick and mediocre."],
    p: ["Tuning on a small test dataset hides level behavior that only appears at production size.", "Raising the stall thresholds to avoid slowdowns lets read amplification grow until reads suffer."],
    v: "Run the target workload for an hour with candidate settings and compare write amplification, space amplification, p99 read latency and stall time against the baseline, accepting a change only if the metric it targeted improved.",
    dep: ["statistics-counters","leveled-compaction","write-buffer-manager","bloom-filter","block-cache"]
  },
  "trace-and-replay": {
    s: "Records a stream of operations, or block cache accesses, to a file so a workload can be replayed, analyzed or simulated offline with different settings.",
    d: "A tracer writes each operation's type, column family, key, size and timestamp, with optional sampling, to a trace file. A replayer reads it and issues the same operations against another instance, optionally at a different speed or thread count. Cache traces record every block access so a simulator can predict hit rate for other cache sizes and policies without running them. It lets teams test a tuning change against a real workload. It is hard to keep traces private, since keys can reveal data, and to reproduce timing faithfully.",
    k: ["Full tracing versus sampling: full tracing reproduces the workload exactly, but costs write bandwidth and trace volume; sampling is light but distorts bursts.", "Replay at original timing versus as fast as possible: original timing tests latency behavior, while maximum speed tests only throughput."],
    p: ["Trace files hold raw keys and are copied around as if they were harmless metrics.", "Replaying onto a database in a different state, such as an empty one, produces misleading hit rates."],
    v: "Trace one hour of a workload, replay it against a copy at the same speed, and confirm operation counts match and the cache simulator's hit rate for the original size agrees with the measured one.",
    dep: ["block-cache","per-call-options"]
  },
});
