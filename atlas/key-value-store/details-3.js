// Details for the key-value store plate, part 3: write path, read path, log and memtables.
ATLAS.details("key-value-store", {
  "write-queue": {
    s: "Collects concurrent writers into a group led by one thread, which logs and applies everyone's batches together so one sync serves many commits.",
    d: "A writer joins a queue and either becomes leader, if the queue was empty, or waits. The leader takes all waiting writers, merges their batches into one log record, assigns sequence ranges, appends and optionally syncs the log once, then either inserts all batches itself or lets followers insert their own. Group commit turns thousands of small synced writes into far fewer syncs. It is hard because the leader is a serialization point and one slow member, a huge batch or a stall, delays every writer in the group.",
    k: ["Group commit versus per-writer commit: grouping amortizes sync cost across many writers, but adds queueing delay and ties a small write's latency to the largest in its group.", "Leader inserts all batches versus followers insert their own: leader-only is simple and cache friendly, but serializes memtable work that parallel insertion can spread."],
    p: ["One oversized batch in a group inflates tail latency for every concurrent writer.", "A single thread issuing synced writes gets no grouping benefit and is bound by raw sync latency."],
    v: "Run thirty-two threads issuing synced single-key writes and confirm the number of log syncs per second is far lower than the number of writes, while a single thread shows one sync per write.",
    dep: ["wal-append","sequence-assignment","write-batch"]
  },
  "sequence-assignment": {
    s: "Gives each write group a contiguous range of sequence numbers, one per entry, fixing the global order of writes and their visibility to snapshots.",
    d: "The leader reads the last allocated sequence, reserves a range equal to the total entry count across the group, and stamps each batch with its starting number. Entries in a batch consume consecutive numbers so a batch is one atomic range. The numbers order versions of each key, define snapshots and tell compaction what can be discarded. With two-phase commit or parallel logging, allocation can precede publication. It is hard because the allocation order must match the log order exactly, or recovery replays writes in a different order than readers saw.",
    k: ["Allocating sequences under the write lock versus lock-free: the lock is simple and ordered, but serializes all writers at this step.", "One number per entry versus per batch: per entry orders every key distinctly, but batches that touch the same key twice need rules for which entry wins."],
    p: ["Allocating numbers in a different order than the log append makes replay disagree with what readers saw.", "Large batches burn through sequence space faster than expected on long-lived instances."],
    v: "Write three batches of five, ten and one entries from one thread and confirm the log records show starting sequences differing by exactly five and ten, with no gaps and no reuse.",
    dep: ["sequence-numbers","write-queue"]
  },
  "wal-append": {
    s: "Writes the merged batch record to the end of the current log file, optionally syncing it, before any of the writes becomes visible in memory.",
    d: "The leader builds one record containing the group's batches and appends it to the log through a buffered writer. If the write asked for sync, the file is synced before the call returns; otherwise the data may sit in the operating system's cache. The log is per instance, shared across column families, with one file at a time receiving appends. Failure to append fails the whole group. It is hard because the log order, the sequence order and the memtable order must agree, and because an append error leaves the file in an uncertain state.",
    k: ["Log before memtable versus memtable first: log first ensures nothing visible can be lost, but delays the visible update by an I/O.", "One shared log versus a log per family: shared gives a single sync and atomic multi-family writes, but couples family lifecycles."],
    p: ["Ignoring a failed append and continuing to write can leave later records unreachable after the torn record.", "Writing with the cache flushed only by the OS gives a crash window of seconds of lost writes."],
    v: "Write one thousand keys with sync on, kill the machine's power or the process at the filesystem level, and confirm all one thousand are present after recovery. Repeat with sync off and measure how many are lost.",
    dep: ["wal-format","wal-sync-policy","file-system-abstraction"]
  },
  "memtable-insert": {
    s: "Adds each entry of the batch to the active memtable with its sequence number and type, making the write findable by readers once published.",
    d: "For each entry the writer builds an internal key and inserts key and value into the skip list, allocating from an arena. Inserts can run concurrently when the structure supports lock-free insertion, with each writer handling its own batch. After insertion the memtable's size estimate is updated; crossing the write buffer limit schedules a switch to a new memtable. Entries belonging to the same batch become visible together only after publication. It is hard because insertion must be correct under concurrency and memory is not returned until the whole memtable is freed.",
    k: ["Concurrent insertion versus single thread: concurrent insertion scales with cores, but requires lock-free structures that cost more per insert and do not support every memtable type.", "Arena allocation versus per-entry allocation: an arena is fast and has no fragmentation, but reclaims memory only when the whole table is dropped."],
    p: ["Memory counted by key and value bytes underestimates real memtable size, so actual usage exceeds the configured limit.", "A switch triggered while many writers are mid-insert needs careful handoff or entries land in the wrong table."],
    v: "Insert one million entries from sixteen threads and confirm every entry is readable after publication with its expected sequence number, and that resident memory is within the arena overhead of the configured limit.",
    dep: ["memtable","skiplist-memtable","internal-key"]
  },
  "pipelined-writes": {
    s: "Overlaps the log stage of one write group with the memtable stage of the previous, and lets followers insert in parallel, to raise write throughput.",
    d: "In the basic design the leader finishes both log append and memtable insertion before the next group starts. In pipelined mode the next group can start its log append as soon as the previous group's log write finishes, while the previous group's memtable inserts continue. Parallel memtable writes let each member insert its own batch. Both increase throughput on many-core machines at some cost in complexity and in ordering rules. It is hard to guarantee that publication still follows sequence order despite overlapping stages.",
    k: ["Pipelined versus single-stage writes: pipelining raises throughput under load, but needs ordered publication logic and benefits little when the log sync dominates.", "Separate queue for unlogged writes versus common queue: separation avoids blocking fast writes behind slow syncs, but complicates sequence ordering."],
    p: ["Publishing group two before group one finishes inserting exposes a later write without an earlier one.", "Parallel insertion on a memtable that does not support it silently falls back to serial mode."],
    v: "Compare throughput with eight writer threads in single-stage and pipelined modes on fast storage, confirming a measurable gain, then verify via a stress test that no reader ever sees write N+1 without write N.",
    dep: ["write-queue","write-visibility","memtable-insert"]
  },
  "write-visibility": {
    s: "Advances the published last sequence number only after a group's entries are in the memtable, so readers never see part of a batch.",
    d: "Readers take their snapshot sequence from a published value, not from the allocation counter. After the leader and followers finish inserting a group, the published sequence is advanced to the group's last number in order. Anything allocated but unpublished is invisible. This gives atomic visibility of batches without read locks. Some configurations separate the log-complete point from the visible point, so a prepared write may be logged long before it is published. The difficulty is ordering: with parallel groups the publisher must wait for lower sequences first.",
    k: ["Publish after insertion versus visibility by sequence only: publishing last guarantees complete batches, but delays visibility until the slowest member finishes.", "Separate published and allocated counters versus one: two counters allow concurrency, but every reader path must use the right one."],
    p: ["Taking a snapshot from the allocation counter instead of the published one exposes half-applied batches.", "A stalled follower holds back publication and makes all later writes invisible until it finishes."],
    v: "Run a reader that checks that two keys written in one batch always match, while writers update them continuously, and confirm no mismatch is observed over ten million reads.",
    dep: ["sequence-assignment","memtable-insert","snapshots"]
  },
  "get-path": {
    s: "Looks up a key by searching the active memtable, immutable memtables, then files from newest to oldest, stopping at the first visible value or deletion.",
    d: "A lookup first takes a stable view of the current memtables and file set, then builds a lookup key from the read sequence. It checks the active memtable, then immutable memtables newest first, then level zero files newest first, then at most one file per deeper level found by binary search on file boundaries. Within a file it consults the filter, the index, then reads one data block. The first value or tombstone found ends the search; merge operands collect until a base is found. It is hard because cost varies from a memory hit to dozens of reads.",
    k: ["Stopping at the first match versus collecting all versions: stopping is fast, but merge operands and range tombstones force the search to continue below it.", "Referencing a stable view versus locking: a referenced view needs no lock during the read, but keeps files alive as long as any reader holds it."],
    p: ["Missing keys are the worst case, probing every level, and are slow without effective filters.", "A key shadowed by a range tombstone in a newer file must check that tombstone before returning an older value."],
    v: "Read a key present only in the oldest level and confirm perf counters show one filter check and one index lookup per overlapping file and exactly one data block read. Read a missing key and confirm most probes end at the filter.",
    dep: ["level-lookup","visibility-rules","table-cache","version-set"]
  },
  "visibility-rules": {
    s: "The rule that a read at sequence S sees, for each key, the newest entry with sequence no greater than S, treating a deletion at that point as absence.",
    d: "Every entry in memtables and files carries a sequence number. A read at snapshot S ignores entries above S, and among the rest takes the greatest sequence per user key. If that entry is a deletion, the key is absent; if a value, that is the result; if merge operands, they combine with the next base. Range tombstones apply when their sequence is above the point entry's and within S. Compaction must keep at least the version visible to each snapshot. The rule is simple but touches every iterator, filter and compaction code path.",
    k: ["Visibility by sequence number versus locks or copy-on-write: sequences give readers isolation without blocking, but obligate compaction to preserve versions for open snapshots.", "Evaluating tombstones at read time versus at write time: read time keeps writes cheap and files immutable, but readers pay to skip deleted entries."],
    p: ["Applying a range tombstone without comparing its sequence to the entry's hides newer writes or exposes older data.", "A version dropped by compaction while a snapshot still needs it makes that snapshot's reads inconsistent."],
    v: "Write v1, take a snapshot, write v2, delete the key, then read at the snapshot (expect v1), at the latest sequence (expect absent), and after full compaction repeat both with the snapshot still held.",
    dep: ["internal-key","sequence-numbers","tombstones"]
  },
  "level-lookup": {
    s: "Finds the one candidate file per deeper level by binary search over file key ranges, and every overlapping file at the topmost level where runs may overlap.",
    d: "Files at level one and below are sorted and non-overlapping, so the lookup binary-searches the file list by largest key to find at most one candidate. Level zero files come straight from flushes and can overlap, so all those whose range includes the key are checked, newest first. Fractional cascading style hints in file metadata narrow the search at the next level. Each candidate file is then tested through its filter before any block read. The difficulty is level zero: its file count directly multiplies the read cost.",
    k: ["Many overlapping level-zero files versus fewer, earlier compactions: tolerating many speeds ingestion, but each added file adds a filter probe or block read to every miss.", "Binary search on file boundaries versus an in-memory key index: boundaries are small and already cached, but cost log of file count per level for every lookup."],
    p: ["Letting level zero grow to dozens of files makes every lookup probe each of them.", "File boundaries that include tombstone ranges make files appear to overlap keys they hold no entries for."],
    v: "Build a database with ten level-zero files and a deep tree, read a missing key, and confirm the number of filter probes equals ten plus one per deeper level, then compact level zero and confirm probes fall.",
    dep: ["levels","file-metadata","bloom-filter","table-cache"]
  },
  "merging-iterator": {
    s: "Combines the sorted streams from every memtable and file into one ordered stream using a heap keyed on the internal key.",
    d: "Each source, a memtable iterator or a file iterator, exposes the same interface. The merging iterator keeps a min-heap of their current keys for forward scans and a max-heap for backward ones, and on each step advances the source that supplied the smallest key. Sources are opened lazily: level iterators open a file only when the scan enters its range. Seeking positions every source, which is the dominant cost of short scans. Direction changes require rebuilding the other heap, which is expensive.",
    k: ["Heap merge versus sequential concatenation: heap merge handles overlapping sources correctly, but costs log of source count per step and a seek in every source.", "Lazy file opening versus eager: lazy avoids opening files the scan never reaches, but adds latency when the scan crosses file boundaries."],
    p: ["Short scans pay a seek in every level zero file and level, so scan latency tracks file count.", "Switching between next and prev repeatedly thrashes the heaps and becomes very slow."],
    v: "Scan one million keys while counting file opens, confirming files outside the scan range are never opened, and verify the output equals a sorted union of the sources with no duplicate internal keys.",
    dep: ["db-iterator","table-cache","internal-key","levels"]
  },
  "db-iterator": {
    s: "Wraps the merging iterator to present user keys: it skips older versions and deleted keys, resolves merges, and enforces bounds and snapshot visibility.",
    d: "The merging iterator yields internal keys including every version and tombstone. The database iterator collapses them: for each user key it takes the newest visible version, discards the rest, and treats a deletion as absence, skipping to the next user key. Merge operands are combined through the operator. It applies the upper and lower bounds and prefix mode. It also pins the memtables and files it started with for its whole lifetime. The hard case is a key range thick with tombstones or old versions, where one step can skip thousands of internal entries.",
    k: ["Skipping hidden entries linearly versus with a reseek: reseek jumps past many hidden versions quickly, but costs a seek, so it is used only after a threshold of skips.", "Pinned view for the iterator's life versus refreshing: pinning is consistent, but long scans keep obsolete files and memtables alive."],
    p: ["Iterators held open for hours pin memory and files, causing space growth that looks like a leak.", "Heavy delete workloads leave scans that skip huge dead ranges before the first visible key."],
    v: "Delete the first ninety percent of a million keys, then seek to the start and confirm the first call returns the first live key after skipping, with the perf context showing the skipped count, falling after compaction.",
    dep: ["merging-iterator","visibility-rules","merge-operator","range-tombstone-skipping"]
  },
  "range-tombstone-skipping": {
    s: "Keeps range deletions in an indexed, fragmented form so a scan or lookup can tell in logarithmic time whether a key is covered and jump past covered spans.",
    d: "Overlapping range tombstones from memtables and files are fragmented into non-overlapping pieces, each with the maximum sequence that covers it, and sorted. During a scan the iterator tracks the tombstone active at its position, compares each entry's sequence to it, and can seek directly to the end of a fully covered region instead of stepping through each entry. For a point lookup, the newest covering tombstone's sequence is compared with the found entry. It is hard because fragmentation and aggregation must be maintained across sources with different sequence ranges and snapshots.",
    k: ["Fragmented sorted tombstones versus a flat list: fragments allow binary search and skip-ahead, but cost time to build and extra memory per file.", "Skipping covered spans via seek versus stepping: seeking saves reading dead entries, but is only safe when the tombstone is visible to the snapshot."],
    p: ["Many small overlapping range deletes produce huge fragment lists that slow every read touching the range.", "Ignoring snapshots when skipping makes a snapshot reader miss entries that were live at its sequence."],
    v: "Insert a million keys, range-delete the middle half, scan from the start, and confirm the iterator crosses the deleted span with one seek rather than half a million steps, per the iterator's skipped-entry counters.",
    dep: ["range-deletes","range-del-block","visibility-rules","merging-iterator"]
  },
  "readahead": {
    s: "Reads more than the requested block when access is sequential, detecting scans automatically and prefetching ahead to hide storage latency.",
    d: "On a scan the table reader notices that consecutive blocks are being read, then starts reading larger chunks, doubling up to a limit, and fetching them asynchronously into a buffer. Compaction inputs use a fixed large readahead. Point lookups should never trigger it. With direct I/O the engine does its own prefetching since the page cache does not. Separated values benefit from prefetching blobs in order. The difficulty is wasted I/O when the scan stops early, and memory held in buffers per open file.",
    k: ["Automatic adaptive readahead versus a fixed size: adaptive starts small and avoids waste on short scans, but needs several sequential reads to ramp up.", "Prefetching in the engine versus relying on the operating system: engine prefetch works under direct I/O and knows block boundaries, but duplicates what the page cache can do."],
    p: ["Large readahead on random access reads wastes bandwidth and evicts useful cache pages.", "Per-file buffers multiplied by many open iterators consume memory unexpectedly."],
    v: "Scan a ten gigabyte range and confirm the I/O size distribution grows from block size to the configured maximum, then perform random lookups and confirm all reads stay at block size.",
    dep: ["db-iterator","table-cache","direct-io"]
  },
  "read-amplification": {
    s: "The ratio of data or operations touched to answer a read versus the data returned, driven by the number of overlapping sorted runs and filter quality.",
    d: "A point read costs one memtable probe per memtable plus, for each file that might contain the key, a filter check and possibly an index lookup and one block read. Worst case, with filters failing, it reads one block from every level-zero file and every deeper level. Scans pay a seek in every run. Leveled compaction keeps runs few and so keeps read cost low; tiered and universal allow more runs per level and pay more here. It is measured by perf context counters and block reads per get. Filters, caches and level layout are the tools to lower it.",
    k: ["Fewer sorted runs versus cheaper writes: fewer runs lower read cost, but require more compaction rewriting and so more write amplification.", "More filter bits versus memory: bits cut wasted block reads for misses, but cost memory per key that grows with data size."],
    p: ["Judging read cost by average latency hides the miss path, which is far costlier than a hit.", "Counting files without counting filter effectiveness misstates real read work."],
    v: "Run one million lookups of absent keys and one million of present keys, and report block reads per lookup for each. The absent figure should be near the filter false positive rate times files; the present figure near one.",
    dep: ["level-lookup","bloom-filter","levels","perf-context"]
  },
  "wal-format": {
    s: "The log file layout: fixed-size physical blocks holding records with checksum, length and type, with large records fragmented across blocks.",
    d: "The log is divided into blocks of 32 KiB. Each record has a checksum, a length and a type: full, first, middle or last, so a logical record larger than the remaining block space is split. A reader that hits a bad block resynchronizes at the next block boundary, which bounds damage from corruption to a block. The record payload is a write batch. Some modes add a log number and recyclable headers so reused files are distinguished from stale data. It is hard because recovery must tell a torn tail from mid-file corruption.",
    k: ["Block-aligned fragments versus a plain stream: block alignment allows resync after corruption and cheap tail detection, but wastes padding at block ends.", "Checksum per record versus per block: per record detects tearing of each entry precisely, but adds a few bytes per record."],
    p: ["Treating a corrupt record in the middle of the log like a torn tail drops all later valid writes silently.", "Reusing log files without a log number in headers lets stale old records be replayed as new."],
    v: "Flip one byte in the middle of a log file, replay it, and confirm the reader reports a checksum error at that record's offset and, in tolerant mode, resumes at the next block boundary.",
    dep: ["varint-coding","block-checksums"]
  },
  "wal-sync-policy": {
    s: "Chooses when log bytes are forced to stable media: on every write, periodically in the background, or only when the operating system decides.",
    d: "A synced write calls the file system's flush operation, such as fsync or fdatasync, before returning, so it survives power loss. A non-synced write only reaches the operating system cache and survives a process crash but not a power failure. Options include a periodic background sync every N bytes, which bounds the loss window, and a separate manual sync call. Sync cost dominates small write latency, which is why group commit exists. It is hard because storage devices and file systems may acknowledge flush early, so the real guarantee depends on the stack.",
    k: ["Sync every write versus periodic sync: every write loses nothing on power failure, but caps write rate by flush latency; periodic is fast and loses up to the interval.", "fdatasync versus fsync: fdatasync skips metadata updates and is cheaper, but is only safe when file size changes are handled by preallocation or recovery."],
    p: ["Assuming a process-crash-safe write is power-loss safe, because the data was in the OS cache.", "Devices with volatile write caches that ignore flush requests make synced writes lose data anyway."],
    v: "Write with sync, cut power to a test machine or use a fault-injection layer that drops unsynced data, and confirm every acknowledged write is present. Repeat unsynced and report the loss window.",
    dep: ["wal-append","file-system-abstraction","file-locking"]
  },
  "wal-retention": {
    s: "Decides when a log file can be deleted, recycled or archived: only after every column family's data in it is flushed and no prepared transaction needs it.",
    d: "Each log has a number, and each column family records the oldest log still holding its unflushed data. A log is obsolete when all families have flushed past it. Obsolete logs are deleted, or recycled by renaming to avoid file allocation cost, or kept for replication consumers up to a size or time limit. Prepared two-phase transactions also pin logs. The difficulty is a mismatch between families, where an idle family keeps one old log alive, and disk space and recovery time grow with it.",
    k: ["Recycling log files versus deleting: recycling avoids allocation and preallocation cost, but needs headers that distinguish stale content from new records.", "Keeping logs for consumers versus deleting promptly: retention supports log-based replication, but consumes disk and extends recovery."],
    p: ["An idle column family never flushes, so old logs accumulate until a size limit forces a flush of it.", "Archived logs without a time or size limit fill the disk."],
    v: "Write only to one of two families, observe the log count grow, set the total log size limit, and confirm the idle family is flushed and the old logs are removed once the limit is exceeded.",
    dep: ["column-families","flush-job","two-phase-commit","file-system-abstraction"]
  },
  "memtable": {
    s: "The active in-memory sorted buffer that absorbs all new writes until it reaches its size limit, then becomes immutable and is flushed.",
    d: "Each column family has one active memtable holding internal keys and values in comparator order, backed by an arena. Writers insert into it, readers search it first. It also tracks its first sequence number, its approximate size and, when enabled, a filter and range tombstone list. When the size reaches the write buffer limit, or the log or global memory limit forces it, the memtable is sealed and a new one created. It is hard to size: larger memtables absorb more overwrites and produce larger files, but lengthen recovery and use memory.",
    k: ["One large memtable versus several small: large ones reduce write amplification by merging more overwrites, but increase memory, flush latency and log replay time.", "Switching memtables at the size limit versus at a log boundary: size-based is simple, but can leave logs spanning many families."],
    p: ["Setting the write buffer size too small produces many small level-zero files and constant compaction.", "Underestimating arena overhead leads to memory use above the configured buffer size."],
    v: "Insert data until the memtable reaches its limit and confirm exactly one flush is scheduled, producing one level-zero file whose entry count equals the memtable's entry count at sealing.",
    dep: ["skiplist-memtable","internal-key","write-buffer-manager","immutable-memtables"]
  },
  "skiplist-memtable": {
    s: "The default memtable structure: a probabilistic multi-level linked list giving ordered insert and seek in logarithmic time with concurrent readers and no read locks.",
    d: "Each node has a random height; higher levels skip over more nodes. Insertion links the node bottom-up with atomic pointer updates, so readers always see a consistent list and never block. Nodes are only added, never removed or modified, which is why an arena allocator works. Iteration forward follows the bottom pointers; backward iteration needs a search per step because nodes have no back links. Inserts can be made lock-free with compare-and-swap. It is hard to make cache friendly: pointer chasing is slow compared with array-based structures.",
    k: ["Skip list versus balanced tree: a skip list allows lock-free concurrent insertion and simple code, but uses more memory per entry and has poor cache locality.", "Backward iteration by re-search versus back pointers: re-search saves memory per node, but makes reverse scans of the memtable slower."],
    p: ["Pointer-heavy nodes make memory use per small key several times the key size.", "Hint-less inserts of sequential keys have no locality benefit and re-descend from the top each time."],
    v: "Insert one million random keys from many threads while readers scan concurrently and confirm the scan output is always sorted with no missing committed key, using a checker that compares against a lock-protected model.",
    dep: ["memtable","comparator"]
  },
  "alt-memtables": {
    s: "Other in-memory representations selectable per column family: hash tables bucketed by prefix, vector buffers for bulk load, and structures tuned for scans or inserts.",
    d: "A hash-skip-list groups keys by prefix into buckets, each a small skip list, which makes prefix lookups very fast but total-order scans slow, since buckets must be merged. A vector memtable appends unsorted and sorts once at flush, suiting bulk loading with no reads. Other designs use tries or tree structures for better cache behavior. The choice trades insert speed, point read speed and scan support. It is hard because each alternative gives up something, such as concurrency or ordered iteration, that other components assume.",
    k: ["Hash-bucketed by prefix versus a plain skip list: hashing speeds prefix queries, but total-order iteration must merge buckets and becomes slow.", "Unsorted vector versus sorted structure: vector inserts are the fastest possible, but any read before flush has no efficient path."],
    p: ["Using a prefix-hash memtable with full scans makes every scan merge all buckets.", "Reading from a vector memtable before flush forces a sort or is unsupported."],
    v: "Load ten million keys with the vector memtable, flush, and compare load time against a skip list memtable. Confirm a scan on the hash memtable without a prefix is slower than on the skip list by the documented factor.",
    dep: ["memtable","prefix-extractor","flush-job"]
  },
  "immutable-memtables": {
    s: "Sealed memtables awaiting flush: read-only, still searched by every read, and kept in a queue until their table file is installed.",
    d: "When the active memtable fills, it moves to a list of immutable memtables and a fresh one takes writes. Reads search the active table, then the immutable ones from newest to oldest. A flush job turns the oldest into a level-zero file; only after the version edit that adds that file is committed is the memtable freed. Several can queue up if flush is slower than writes; once the queue passes a limit writes stall. A configurable minimum number to merge before flushing can combine memtables to reduce small files.",
    k: ["Allowing several immutable memtables versus one: more buffering absorbs write bursts, but costs memory and adds read probes per memtable.", "Merging memtables at flush versus one file each: merging cuts small files and overwrites, but delays the flush and extends log retention."],
    p: ["A queue of immutable memtables with slow flush stalls writers and holds memory.", "Every extra immutable memtable adds a probe on each point lookup."],
    v: "Pause flush, fill four memtables, and confirm all four are searched on a read, then confirm a write stall begins when the configured maximum is reached and clears after flush resumes.",
    dep: ["memtable","flush-job","write-stalls"]
  },
  "write-buffer-manager": {
    s: "Tracks total memtable memory across all column families and instances against a global budget, triggering flushes or stalls when it is exceeded.",
    d: "Each memtable reports its allocation to a shared manager. When the total passes a soft fraction of the limit, the manager schedules the flush of the largest or oldest memtable; at the hard limit it can stall writers until memory frees. It can also charge memtable memory to the block cache so one budget covers both. This keeps many column families, or many instances in one process, from collectively overcommitting memory, which per-memtable limits alone cannot do. The difficulty is picking limits that avoid both stalls and tiny memtables.",
    k: ["Global memory budget versus per-family limits: global adapts to which families are active, but one busy family can force flushes of others.", "Charging memtables to the cache versus separate pools: one pool is easy to size, but cache blocks and memtables then compete for the same bytes."],
    p: ["A budget too low for the number of active families forces constant tiny flushes.", "Forgetting that arenas allocate in chunks makes accounting lag actual memory."],
    v: "Open fifty column families with a global budget below fifty times the buffer size, write to all, and confirm total memtable memory stays under the budget while flushes are triggered across families.",
    dep: ["memtable","flush-job","block-cache"]
  },
  "flush-job": {
    s: "Writes an immutable memtable out as a sorted table file at level zero, installs it with a version edit, and releases the memtable and log space.",
    d: "A background thread iterates the memtable in order, skipping entries hidden by snapshots rules and applying compaction filters where configured, and writes data blocks, index, filter and footer through the table builder. It syncs the new file, appends a version edit to the manifest adding it, and then frees the memtable. Flushing several families' memtables together keeps their log cutoffs aligned. Flush is the only way memory becomes disk state, so it is critical to latency. It is hard to keep up when writers are faster than the device.",
    k: ["Flushing eagerly versus waiting for the size limit: eager flushing lowers recovery time and memory, but produces smaller files and more compaction.", "Atomic multi-family flush versus independent: atomic flush gives consistent cross-family recovery without log replay of some, but ties families' flush timing together."],
    p: ["A flush that cannot finish because of an I/O error blocks log deletion and eventually halts writes.", "Dropping entries still visible to a snapshot during flush breaks that snapshot."],
    v: "Fill a memtable of known content, flush, and confirm the resulting file has the same entry count, the manifest records its addition, and the corresponding log file becomes deletable.",
    dep: ["table-builder","version-edit","immutable-memtables","background-scheduler"]
  },
});
