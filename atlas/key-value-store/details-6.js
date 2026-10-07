// Details for the key-value store plate, part 6: scheduling, integrity, environment, cross-cutting concerns.
ATLAS.details("key-value-store", {
  "background-scheduler": {
    s: "Runs flushes and compactions on separate prioritized thread pools, bounding concurrency and letting flushes preempt compaction slots.",
    d: "Two pools exist: a high-priority pool for flushes and a low-priority pool for compactions, each with a configured thread count and a limit on concurrent jobs. When a memtable is sealed or a level exceeds its target, a job is queued. Flushes get their own threads because a stalled flush stops writers, while compactions can wait. Several instances in one process can share pools. It is hard to size: too few threads let work fall behind and trigger stalls, too many compete with foreground reads for I/O.",
    k: ["Separate flush and compaction pools versus one: separate pools guarantee flushes are never starved by long compactions, but reserve threads that may sit idle.", "Shared pools across instances versus per instance: shared pools bound total process I/O, but one busy instance can crowd out the others."],
    p: ["A single thread for all background work lets one long compaction block flushes and stall writers.", "More compaction threads than the device can serve increases read latency without increasing throughput."],
    v: "Run a write-heavy load with compaction threads set to one, four and sixteen and confirm stall time falls then flattens, while foreground read p99 rises at the highest setting.",
    dep: ["flush-job","compaction-picker","compaction-priority"]
  },
  "compaction-priority": {
    s: "Orders pending compactions so the most urgent, level zero and levels furthest over target, run first, and chooses which file within a level goes next.",
    d: "Priority comes from the picker's scores: level zero count relative to its trigger, and each level's size relative to its target, with levels above stall thresholds ranked highest. Within a level, a policy picks the file: largest, oldest, least overlap with the next level, or round-robin. Intra-level-zero compactions can merge level zero files together to reduce file count when level one is busy. Manual compactions queue separately. It is hard because strict priority can starve deep levels, whose growth then triggers later large jobs.",
    k: ["Least-overlap file choice versus oldest-first: least-overlap minimizes write amplification, but leaves old cold files unmerged; oldest-first keeps age even.", "Intra-level-zero compaction versus waiting for level one: it eases the file count quickly when level one is busy, but rewrites data that will be rewritten again."],
    p: ["Always serving the top level first starves deep levels until a huge compaction is forced.", "Ignoring pending bytes in priority lets one level silently grow to many times its target."],
    v: "With level zero at its trigger and a deeper level over target, confirm via the log that the level zero job is picked first, and that the deeper level is served as soon as a slot frees, within a bounded wait.",
    dep: ["compaction-picker","levels"]
  },
  "write-stalls": {
    s: "Slows or halts incoming writes when memtables or level zero files pile up or pending compaction bytes grow too large, to keep reads and space bounded.",
    d: "Three conditions trigger a stall: too many unflushed memtables, too many level zero files, and too many estimated bytes awaiting compaction. At a slowdown threshold writes are delayed, with a delay rate computed from how far over the threshold the system is; at the stop threshold writers wait until background work reduces the pressure. Estimated pending bytes are computed from each level's excess over its target. Stalls are visible as latency spikes and are counted in statistics. They are hard because the thresholds trade latency now for health later, and a stall can be caused by a different component than the one that feels slow.",
    k: ["Gradual slowdown versus hard stop: gradual slowdown spreads the latency cost and may avoid a stop, but is harder to see and tune than a clear halt.", "High thresholds versus low: high thresholds avoid stalls during bursts, but allow read and space amplification to grow before the engine reacts."],
    p: ["Raising stall limits to hide stalls moves the problem to reads, which get slower with each extra file.", "A stop condition that never clears because compaction is blocked turns a stall into an outage."],
    v: "Pause compaction, write until level zero reaches the slowdown threshold, and confirm the write rate drops with the stall counter increasing; resume and confirm rate recovers within the time it takes to compact the backlog.",
    dep: ["immutable-memtables","levels","compaction-picker","statistics-counters"]
  },
  "rate-limiter": {
    s: "A shared token bucket that caps the bytes per second background flush and compaction may write, protecting foreground latency from I/O bursts.",
    d: "Background writers request tokens before each chunk. The limiter refills at a fixed rate and serves requests in priority order, giving flush priority over compaction. An auto-tuned mode raises the rate when background work is falling behind and lowers it when idle. It can also limit reads. Without a limit, a big compaction saturates the device and foreground reads queue behind it, raising tail latency. It is hard to set: too low and compaction cannot keep up, causing stalls; too high and it hurts the foreground.",
    k: ["Fixed rate limit versus auto-tuned: fixed is predictable and simple, but must be chosen for the worst case; auto-tuned adapts to load, but can oscillate.", "Limiting flush with compaction versus exempting flush: exempting protects write progress, but unlimited flush can still burst the device."],
    p: ["A limit below the sustained write rate guarantees eventual write stalls.", "A shared limiter across instances lets one instance's burst throttle another's flush."],
    v: "Set the limiter to a hundred megabytes per second, run a large compaction, and confirm measured background write bandwidth stays at the limit while foreground read p99 stays within its target.",
    dep: ["compaction-job","flush-job","file-system-abstraction"]
  },
  "dynamic-level-sizing": {
    s: "Computes level targets from the actual size of the bottom level, working upward, so most data sits in the last level and space amplification stays near ten percent.",
    d: "With fixed targets, a database whose total size does not fill the last level leaves it small and data spread through upper levels, wasting space on obsolete versions. Dynamic sizing sets the bottom level's target to its current size, then divides by the size ratio for each level above, down to a base level. Data then compacts directly into the lowest level that fits. The result is a stable shape regardless of total data size. It is hard because the targets shift as data grows, and level zero may then compact into a level well below level one.",
    k: ["Dynamic targets versus fixed targets: dynamic bounds space amplification near the ratio's inverse, but makes the level structure change over time and harder to predict.", "A larger size ratio versus smaller: larger leaves fewer levels with cheaper reads, but raises write cost for each compaction."],
    p: ["Fixed targets on a growing database leave most data in upper levels and space amplification of two or more.", "Operators comparing levels to documentation from fixed-target tuning misread the dynamic layout."],
    v: "Load data to twenty percent of the nominal bottom level capacity and confirm that most bytes sit in the last level and total size is within about ten percent above live data after compaction settles.",
    dep: ["levels","leveled-compaction","compaction-picker"]
  },
  "manual-compaction": {
    s: "An explicit request to compact a key range, or the whole database, to reclaim space, apply new settings or push tombstones to the bottom level.",
    d: "The caller names a range, or none for everything, and a target level behavior. The engine flushes memtables overlapping the range, then compacts every level in turn so that data in the range ends at the bottom or a chosen level. It runs alongside automatic compactions but excludes conflicting file sets. Uses include after bulk deletes, after changing compression or filter settings, and before taking a backup. It is hard because it can run for hours, double space during the rewrite and compete with foreground traffic.",
    k: ["Manual full compaction versus waiting for automatic: manual reclaims space and tombstones now, but costs a burst of I/O and write amplification.", "Compacting a bounded range versus everything: a range limits the work and impact, but needs the caller to know which keys are affected."],
    p: ["Running a full compaction on a busy production instance can double disk use and raise latency for hours.", "Calling it on a schedule hides a tuning problem and wastes device endurance."],
    v: "Delete half the data, run a manual compaction over the full range, and confirm disk usage falls by about half, no tombstones remain in table properties, and foreground errors are zero.",
    dep: ["compaction-job","compaction-picker","tombstones"]
  },
  "crash-recovery": {
    s: "On open after a crash, rebuilds the file structure from the manifest and replays logs not yet flushed into memtables, restoring all acknowledged writes.",
    d: "Recovery reads the manifest to get the live files and the log number below which everything is flushed. It then lists logs at or above that number, replays each record into the memtables of the column families it belongs to, skipping records already covered by flushed files by sequence number, and sets the last sequence. Memtables full during replay are flushed. Leftover files not in the manifest are deleted. A new log is started. Recovery time grows with log size. It is hard because the torn tail, partial files and mismatched metadata must each be told apart from real corruption.",
    k: ["Replaying logs versus requiring a clean shutdown: replay survives crashes, but means open may take long after a large unflushed backlog.", "Deleting unreferenced files at open versus keeping them: deleting reclaims space from interrupted jobs, but must never remove a file a manifest edit is about to reference."],
    p: ["Removing files not in the manifest while a restored backup is partially in place deletes valid data.", "Very large logs make restart after a crash take minutes during which the service is down."],
    v: "Kill the process under a heavy write load one hundred times at random points, and after each recovery verify every acknowledged synced write is present and no key has an older value than its last acknowledged one.",
    dep: ["manifest","wal-format","wal-recovery-modes","sequence-numbers"]
  },
  "wal-recovery-modes": {
    s: "A setting choosing how recovery treats a damaged log: fail on any corruption, tolerate a torn tail, stop at the first bad record, or skip bad records and continue.",
    d: "A torn final record is normal after a crash, since the last append may be partial. Tolerate-tail mode accepts it and drops that record. A stricter mode treats any corruption as fatal. Point-in-time mode stops at the first error and discards everything after, giving a consistent prefix. Skip mode continues past bad records, which can apply later writes without earlier ones, breaking consistency. The right mode depends on whether durability or availability matters more. It is hard because corruption mid-log can look like a torn tail, and the lenient modes can silently lose data.",
    k: ["Strict failing versus tolerate tail: strict never loses an acknowledged write silently, but refuses to open after any damage; tolerate-tail opens after normal crashes.", "Point-in-time versus skip-bad-records: point-in-time keeps a consistent prefix of history, but discards later valid data; skip keeps more but may violate atomicity across keys."],
    p: ["Skip mode applies a later write that depended on a skipped earlier one, producing a state that never existed.", "Strict mode refuses to start after an ordinary crash on systems where the last record is routinely torn."],
    v: "Corrupt the middle of a log, recover under each mode, and confirm strict fails, tolerate-tail fails or truncates per its rule, point-in-time yields exactly the prefix before the damage, and skip yields extra keys.",
    dep: ["wal-format","crash-recovery"]
  },
  "corruption-detection": {
    s: "The layered checks that find damaged data: block and record checksums, file-size and footer checks, key-order checks and manifest consistency rules.",
    d: "Each block and log record carries a checksum verified on read. Table open verifies footer magic and handles. Iterators can check that keys come out in order. Opening checks that file sizes match the manifest and that referenced files exist. Whole-file checksums recorded in the manifest catch changes to files at rest and in transit. Detection yields a corruption status that propagates to the caller instead of data. It is hard because checks cost CPU, and some corruption, such as a correctly checksummed but wrong block, needs cross-structure checks to find.",
    k: ["Always-on verification versus sampled: always-on gives immediate detection but costs CPU on every miss; sampled is cheaper, but lets bad data pass for a while.", "Fail the operation versus fail the database: failing only the operation keeps healthy data available, but repeated errors may mean the instance should stop."],
    p: ["Memory errors corrupting a block after checksum verification pass through as valid data.", "Disabling checks to reduce CPU removes the only defense against silent bit rot."],
    v: "Inject a bit flip into each file type in turn and confirm every case surfaces as a corruption status that names the file and offset, and that no read returns the damaged bytes as data.",
    dep: ["block-checksums","footer","file-checksums","manifest"]
  },
  "paranoid-checks": {
    s: "Extra consistency checks run during normal operation and open: verifying output files after writing, checking file counts and sizes, and failing fast on any inconsistency.",
    d: "With paranoid checks on, the engine verifies that file sizes match the manifest at open, re-reads new files after flush and compaction to compare entry counts and key order with the input, checks that levels are sorted and disjoint after each edit, and treats a manifest write error as fatal. The goal is to catch an engine bug or hardware fault at the earliest moment, before bad data spreads through further compactions. It costs extra reads and CPU. It is hard to know the right trade: they catch rare faults but slow every background job.",
    k: ["Verifying outputs after every job versus trusting writes: verification catches corruption before the inputs are deleted, but doubles read work on outputs.", "Failing hard on a violation versus logging: failing stops further damage, but turns a recoverable anomaly into an outage."],
    p: ["Checking only key order but not entry counts lets a dropped range pass unnoticed.", "Turning these off for benchmarks and leaving them off in production."],
    v: "Use fault injection to drop one entry from a compaction output and confirm the post-write verification detects the mismatch, the job fails, the inputs remain, and the instance reports a background error.",
    dep: ["compaction-job","table-builder","version-edit"]
  },
  "verify-scan": {
    s: "An on-demand pass that reads every file in full, checking every block checksum and the structure of the whole database, for use before backups and after incidents.",
    d: "The scan opens each live file, reads every block with checksum verification, checks index and filter consistency against data where requested, and compares file checksums with those recorded in the manifest. It also can verify blob files. It reads the whole database, so it runs rate limited in the background. Results list damaged files and blocks. Unlike read-time checks, it finds corruption in cold data nobody has read. It is hard to schedule: it needs read bandwidth proportional to the database size and so competes with traffic.",
    k: ["Scheduled full scans versus verification only on read: scans find rot in cold data before it matters, but cost a full read of the database each time.", "Verifying on the primary versus on a copy: a copy avoids loading production, but may not reflect the same disk faults."],
    p: ["Cold data never read for years can decay unnoticed until the only copy is needed.", "An unthrottled scan saturates the device and raises foreground latency."],
    v: "Corrupt one byte in a cold file that no read has touched, run the verification scan, and confirm it reports that exact file and block, while normal reads of other files are unaffected.",
    dep: ["block-checksums","file-checksums","table-cache"]
  },
  "repair": {
    s: "A last-resort tool that rebuilds the manifest by scanning surviving files and logs, salvaging readable data when the normal recovery path cannot open the database.",
    d: "Repair converts logs into table files, then scans every table file to learn its key range and sequence range, reading as much as is intact and discarding unreadable blocks. It writes a fresh manifest placing all recovered files at level zero, since the original level structure is lost, and the database then compacts itself back into shape. Data in unreadable files is lost, and deleted data can return if its tombstone was in a lost file. It is hard to be sure what was lost, and a restore from backup is almost always better.",
    k: ["Repair versus restore from backup: repair salvages data newer than the last backup, but gives no guarantee about what is missing or resurrected.", "Placing every file at level zero versus guessing levels: level zero is always correct, but produces a huge compaction backlog and many overlapping files."],
    p: ["Resurrected deleted keys appear when the files holding their tombstones are unreadable.", "Running repair on a still-damaged disk makes further files unreadable during the scan."],
    v: "Delete the manifest of a test database, run repair, and confirm the database opens, all keys from intact files read back, and reads are correct though slow until compaction returns files to deeper levels.",
    dep: ["manifest","wal-format","table-builder","sst-layout"]
  },
  "background-error-handling": {
    s: "Classifies failures in flush, compaction and log writes as recoverable or fatal, pauses writes where needed, and resumes automatically when the cause clears.",
    d: "An I/O error during flush or compaction is recorded as a background error with a severity. A retryable error, such as no space, puts the database in a read-only mode and the engine retries the failed job periodically. A fatal error such as corruption stops writes until the application intervenes. The state is reported through listeners and calls to the database. After space is freed or the fault clears, automatic resume reopens writes. It is hard to classify: treating a transient error as fatal causes outages, while treating a corruption as transient risks making it worse.",
    k: ["Automatic resume versus manual: automatic resume restores service quickly after transient faults, but may retry into a still-failing device repeatedly.", "Read-only mode on error versus failing everything: read-only keeps serving data, but writers must handle rejected writes with their own buffering."],
    p: ["Treating a full disk as fatal turns freeing space into a restart for no reason.", "Retrying a corrupt-file error as if transient loops forever."],
    v: "Fill the disk during compaction and confirm the database enters read-only mode with an event naming the cause, then free space and confirm writes resume automatically and the failed compaction completes.",
    dep: ["flush-job","compaction-job","event-listeners","wal-append"]
  },
  "file-system-abstraction": {
    s: "The narrow interface through which all file access passes: sequential and random-access files, writable files with explicit sync, directory listing, rename, delete and locks.",
    d: "The engine never calls the operating system directly. It uses an object offering new sequential file, random-access file and writable file, with append, flush, sync and range sync, plus file size, rename, link and directory operations. Implementations include the local disk, an in-memory version for tests, wrappers that inject faults or count I/O, and remote object storage. Because the interface is small, behavior such as which writes are durable after a crash can be simulated. It is hard to give the same semantic guarantees on every backing store, especially for rename atomicity and sync.",
    k: ["A narrow pluggable interface versus direct system calls: pluggable enables testing, fault injection and remote storage, but costs an indirection and requires every backend to match its subtle semantics.", "Exposing sync of ranges versus whole files: range sync overlaps writeback with writing, but is a hint on some systems."],
    p: ["A backend where rename is not atomic breaks the manifest pointer switch.", "A backend whose sync returns early makes durability guarantees silently false."],
    v: "Run the full test suite against the local, in-memory and fault-injecting implementations, and confirm that a simulated crash that drops all unsynced data never loses an acknowledged synced write.",
    dep: ["file-locking","direct-io"]
  },
  "direct-io": {
    s: "Reading and writing files bypassing the operating system's page cache, so the engine's own cache is the only one, at the cost of alignment rules and doing its own prefetching.",
    d: "With direct I/O, buffers, offsets and lengths must be aligned to the device sector size, and data goes straight to or from storage. This avoids double caching of blocks in both the engine and the page cache, and gives predictable memory use and no writeback surprises. It requires explicit readahead since there is no kernel prefetch. Direct I/O can be set separately for reads and for flush and compaction writes. It is hard because all reads then depend on the block cache hit rate, and unaligned small accesses become slow.",
    k: ["Direct I/O versus buffered: direct gives control and avoids double caching, but every cache miss goes to the device and the engine must prefetch itself.", "Direct writes for compaction only: this keeps large background writes from flooding the page cache, but leaves reads to enjoy the page cache's help."],
    p: ["A small block cache with direct I/O makes read latency spike because nothing else caches data.", "Misaligned buffers cause errors or silent fallback to slow paths on some file systems."],
    v: "Run the same read workload with buffered and direct I/O at equal memory budgets, and confirm direct shows lower total memory used for caching, no page cache growth, and higher device read counts per lookup on misses.",
    dep: ["file-system-abstraction","block-cache","readahead"]
  },
  "file-checksums": {
    s: "A checksum computed over each whole file as it is written, recorded in the manifest, and checked when files are copied, backed up, restored or scanned.",
    d: "While writing a table file, the engine accumulates a checksum over all bytes and stores it, with the algorithm name, in the file's metadata in the manifest. Checkpoints, backups and replication verify the copy against it. Unlike per-block checksums, a whole-file checksum detects missing, duplicated or reordered blocks and truncation, and can be validated without parsing the format. It is hard to retrofit: files written before the feature have none, and the checksum only covers what was written, not later in-place decay unless rechecked.",
    k: ["Whole-file checksum plus block checksums versus blocks only: whole-file catches misplaced and missing blocks and verifies transfers, but costs extra computation and manifest space.", "Computing it while writing versus afterwards: while writing is nearly free, but afterwards allows adding it to old files at the cost of a full read."],
    p: ["Trusting a copied file because its size matches, when a whole-file checksum would show it differs.", "Files from before the feature carry no checksum, so verification skips them without warning."],
    v: "Copy a table file with one block swapped for another valid block of equal size, and confirm every block checksum passes but the whole-file checksum from the manifest does not match, so the backup restore refuses the file.",
    dep: ["manifest","file-system-abstraction"]
  },
  "storage-tiers": {
    s: "Placement of files on different devices or paths by level or age: fast storage for hot upper levels, cheap capacity storage for the bottom levels, and remote storage for coldest data.",
    d: "The database is given several data paths with target sizes. A file is placed in the first path with room, usually so upper levels go to fast media and the bottom level to large slow media. Temperature hints let files written by flush or compaction be tagged hot, warm or cold, with the file system layer choosing placement. Reads must go to whichever device holds the file; the block cache hides most differences. It is hard because moving between tiers happens only through compaction, and capacity per tier must be balanced.",
    k: ["Level-based placement versus age-based: levels are simple and track write frequency, but ignore actual access patterns; age or temperature hints track real heat but need extra metadata.", "Local cache of remote files versus reading remote directly: caching removes latency on repeat reads, but needs its own eviction and consistency."],
    p: ["A fast tier sized below the upper levels pushes hot data onto slow media and degrades read latency.", "Remote tier latency on level zero reads makes tail latency unpredictable."],
    v: "Configure two paths with a small fast path, load data and confirm via file listing that level zero through two sit on the fast path and deeper levels on the slow one, and that read latency for hot keys matches the fast device.",
    dep: ["file-system-abstraction","levels","file-metadata"]
  },
  "file-locking": {
    s: "Exclusive lock files that stop two processes opening one database, plus directory sync after creating or renaming files so the changes survive a crash.",
    d: "At open the engine creates and locks a lock file in the database directory using the file system's advisory lock. A second opener fails. Creating a file does not make its name durable until the directory is synced, so after creating a new log or manifest, or renaming the current pointer, the engine syncs the directory. Without that, a crash can lose the directory entry for an otherwise synced file. Both depend on file system semantics. It is hard because locks are advisory, may not work across network file systems, and directory durability rules vary.",
    k: ["Advisory lock file versus process-level checks: a lock file works across processes and survives restarts via the kernel, but fails on file systems with broken locking.", "Syncing directories after every create versus batching: every create is simplest and safest, but adds a sync per new file, notable for many small files."],
    p: ["A network file system that ignores locks lets two processes write one database and corrupt it.", "Skipping directory sync lets a new manifest vanish on power loss while its pointer survives."],
    v: "Start two processes on one directory and confirm the second fails with a lock error. Fault-inject a crash after file creation without directory sync and confirm the engine's sync makes the file name survive.",
    dep: ["file-system-abstraction"]
  },
  "durability-contract": {
    s: "The definition of what an acknowledged write guarantees after a process crash, an operating system crash and a power loss, and which settings change it.",
    d: "A write returned after a synced log append survives power loss on honest storage. Without sync it survives a process crash only. With the log disabled it survives nothing until flush. Every layer must preserve the contract: log order matching sequence order, manifest edits synced before files are deleted, directory entries synced, and compaction outputs synced before installation. Replicas and backups define their own weaker guarantees. It is hard because storage can lie about flushes, and each performance setting quietly moves the contract.",
    k: ["Sync per write versus group sync versus periodic: stronger guarantees cost throughput and latency, so the choice must be made per workload and written down.", "Trusting device flush versus end-to-end verification: trusting is cheap, but only checksums and recovery tests reveal a device that acknowledged early."],
    p: ["Teams assume writes are durable because the call returned, when sync was off.", "A tuning change turning off sync for a benchmark ships to production."],
    v: "Run a crash-injection test that drops all unsynced data at random points and verify that exactly the writes the contract promises are present: all synced writes, and no partial batches.",
    dep: ["wal-sync-policy","crash-recovery","file-locking","manifest"]
  },
  "amplification-budget": {
    s: "The trade between write amplification, read amplification and space amplification: improving two worsens the third, and the compaction strategy and size ratio fix the balance.",
    d: "Write amplification is bytes written to storage per user byte; read amplification is blocks read per lookup; space amplification is bytes stored per live byte. Leveled compaction minimizes read and space cost at high write cost. Tiered and universal reduce writes and raise reads and space. FIFO removes rewrites entirely but keeps everything until expiry. Filters, caches, value separation and larger buffers move the balance without changing strategy. Choosing the point means knowing which resource, device endurance, read latency or capacity, is scarcest.",
    k: ["Optimizing for writes versus reads: write-optimized strategies give higher ingest and device life, but fatten read paths and need strong filters.", "Spending memory on filters and cache versus I/O: memory cuts read amplification directly, but is capped by the machine and grows with data."],
    p: ["Tuning against one amplification without measuring the other two moves cost to an unmonitored place.", "Benchmarks on small data hide write amplification that grows with the number of levels."],
    v: "Measure all three amplifications for the target workload under two strategies for a day each, and confirm the chosen configuration meets the stated limit on every one, not just the targeted one.",
    dep: ["leveled-compaction","tiered-compaction","bloom-filter","value-separation"]
  },
  "immutable-files": {
    s: "The rule that table files, once complete, are never modified: all change is by writing new files and atomically swapping which files are live.",
    d: "Writes go to the log and memtable, flushes create files, compaction replaces files, and nothing rewrites bytes in place. This gives readers lock-free access to files, makes caching trivial since contents never change under a file number, lets checkpoints use hard links, lets backups share files, and makes crash recovery a matter of picking the right manifest. The price is that space for obsolete data is reclaimed only through compaction, and that deleted files must be kept while any reader references them. It is a rule everything else relies on.",
    k: ["Immutable files versus in-place update: immutability simplifies concurrency, caching and recovery, but forces all reclamation through rewrite work.", "Reference-counted deletion versus immediate: counted deletion keeps readers safe, but leaves obsolete data on disk until the last reader finishes."],
    p: ["Tools that modify a table file in place break caches and backups that assumed file number identity.", "Long-lived readers keep obsolete files from being deleted."],
    v: "Hash every live file at intervals during a heavy workload and confirm no file's hash ever changes between observations, while files are only added or removed through version edits.",
    dep: ["table-builder","version-set","checkpoints","version-edit"]
  },
  "ordering-and-versioning": {
    s: "The single total order on writes, given by sequence numbers, and the single total order on keys, given by the comparator, which together define every read's result.",
    d: "Keys order the database spatially; sequence numbers order it in time. Together they make internal keys unique and sorted, define what each snapshot sees, and let compaction decide which entries are obsolete. Transactions, snapshots, ingestion and time-stamped reads all build on this pair. The comparator is permanent; sequence numbers must never decrease or repeat, even across crashes and restores. Breaking either order does not usually crash anything: it produces wrong answers that checksums cannot detect.",
    k: ["A single global sequence versus several: global gives atomic multi-family batches and consistent snapshots, but concentrates allocation in one place.", "Fixed bytewise order versus pluggable: pluggable fits more key types, but makes every file depend on code that must never change behavior."],
    p: ["A restore that resets sequence numbers lets old data appear newer than data written later.", "A comparator change between versions yields files that are internally unsorted under the new rule."],
    v: "Check, over the full database, that internal keys are strictly increasing in the comparator order across all files, and that for every key sequence numbers decrease with depth, using the verification scan.",
    dep: ["internal-key","comparator","sequence-numbers","visibility-rules"]
  },
  "resource-budgets": {
    s: "The fixed ceilings on memory, file descriptors, threads and device bandwidth, and how memtables, caches, filters, indexes and background jobs are made to share them.",
    d: "Memory is divided among memtables, the block cache, pinned index and filter blocks, iterator buffers and compaction buffers; file descriptors among open tables, logs and blob files; I/O bandwidth between foreground reads, flush and compaction. Each has its own knob, and they interact: more column families multiply memtable memory, more files multiply index memory. Global managers, shared caches and a shared rate limiter let one budget cover many instances. Failure appears as stalls, evictions and latency, not as an error.",
    k: ["One shared budget versus per-component limits: shared adapts to workload, but components then interfere; separate limits isolate them, but waste unused headroom.", "Reserving memory for metadata versus caching it: reserving makes lookups predictable, but removes that memory from data blocks."],
    p: ["Summing individual component limits exceeds machine memory, and the process is killed.", "Counting only configured sizes ignores allocator overhead and iterator-pinned blocks."],
    v: "Run the peak workload for hours while sampling resident memory, open files and device bandwidth, and confirm each stays below its ceiling with the engine's own accounting within ten percent of the measured total.",
    dep: ["write-buffer-manager","block-cache","table-cache","rate-limiter"]
  },
  "format-compatibility": {
    s: "The promise that files and logs written by one version can be read by later ones, and the rules for adding fields, changing encodings and refusing what cannot be read.",
    d: "On-disk formats carry versions: table footers, manifest records with tagged fields, log headers, properties blocks with ignorable keys. New releases read old files and, within limits, old releases read new ones if the new features are unused. Features that change meaning, a new comparator, a new compression, a new checksum algorithm, are recorded so older readers refuse them rather than misread them. Downgrade is the hard direction. Rolling upgrades of replicas depend on it, so formats change rarely and deliberately.",
    k: ["Backward-only compatibility versus forward as well: backward-only is easier to maintain, but makes rollback after an upgrade impossible once new files appear.", "Tagged optional fields versus fixed layouts: tags allow additive change, but every reader must skip unknown tags safely."],
    p: ["Enabling a new format option and then downgrading leaves files the old version cannot read.", "An unknown record type treated as ignorable when it carries meaning loses data silently."],
    v: "Open a database written by every supported older version with the current one and confirm all keys read correctly, and confirm an older reader given files using a new feature fails to open with an explicit version error.",
    dep: ["footer","version-edit","meta-blocks","wal-format"]
  },
  "failure-model": {
    s: "The set of faults the engine is designed to survive and detect: process crash, power loss, torn writes, bit rot, full disks and errors from the storage layer.",
    d: "Process crashes and power loss are handled by log replay and atomic manifest edits. Torn and partial writes are caught by record and block checksums. Bit rot and misdirected writes are caught on read by checksums, and across files by whole-file checksums. Full disks and transient I/O errors become background errors with retry. Not covered: memory corruption before checksumming, a storage stack that loses acknowledged flushes, and logical bugs in the application. Stating the model fixes which tests, fault injection and checks the engine needs.",
    k: ["Survive faults versus only detect them: survival needs replicas or redundancy at some layer, while detection alone turns silent corruption into a loud failure.", "Fault injection in tests versus trusting reasoning: injection finds ordering bugs in sync and rename sequences that reasoning misses, but needs a simulated file system."],
    p: ["A model that omits storage lying about flush gives guarantees that disappear on cheap devices.", "Testing only clean crashes misses torn writes in the middle of a record."],
    v: "Run a randomized fault-injection suite covering crash at every I/O step, torn writes, flipped bits and full-disk errors, and confirm every outcome is either a correct recovered state or a clear corruption error, never a wrong answer.",
    dep: ["crash-recovery","corruption-detection","background-error-handling","file-system-abstraction"]
  },
});
