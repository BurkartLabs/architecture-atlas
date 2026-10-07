// Details for the filesystem plate, part 3: allocation, journaling, copy-on-write trees.
ATLAS.details("filesystem", {
  "allocation-groups": {
    s: "The volume divided into equal regions, each with its own free-space and inode metadata and its own lock, so allocation proceeds in parallel and stays local.",
    d: "Each group holds a header, free-space structures and often a slice of the inode table, so a file's inode, directory and data can live in the same region and be reached with short seeks. Allocation picks a group by heuristic, such as the parent directory's group, then takes space inside it under that group's lock alone. Groups of hundreds of megabytes to many gigabytes trade lock contention against the cost of searching. The difficulty is balancing: spreading directories avoids hot groups, while clustering related files preserves locality.",
    k: ["Many small groups vs few large groups: many groups spread lock contention and fragment large extents at boundaries; few groups give long extents and serialize allocators.", "Spreading directories across groups vs packing them: spreading balances space and parallelism; packing keeps a tree's files near each other."],
    p: ["One huge directory tree allocating in a single group serializes all writers behind its lock.", "A group that fills while others stay empty forces files far from their parents and degrades locality."],
    v: "Run parallel writers into separate directories and confirm from per-group free counts that allocation spreads across groups, with lock-contention counters near zero and files placed near their parent.",
    dep: ["group-descriptors", "free-space-bitmaps", "inode-allocation", "superblock"]
  },
  "free-space-bitmaps": {
    s: "One bit per block recording whether it is free, stored per group and cached in memory, the simplest and most widespread way to track free space.",
    d: "Setting or clearing bits in a bitmap block allocates or frees blocks. Finding a long free run needs scanning bits, so allocators keep summary counts per group and in-memory buddy structures for fast search. Bitmaps are metadata, so changes are journaled or copy-on-written. On large volumes, bitmaps grow into many blocks, and initializing them is part of mkfs time. Their advantage is trivial correctness and cheap checking; their weakness is scan cost for finding large extents and updating them for many small frees.",
    k: ["Bitmaps vs extent trees for free space: bitmaps are simple and compact for fragmented space; trees scale to large free extents and cost more to update.", "Rebuilding the in-memory buddy cache lazily vs at mount: lazy mounts fast and stalls the first allocation per group; eager is slower to mount and predictable."],
    p: ["A bitmap that disagrees with the inode table lets two files claim the same block.", "Scanning bitmaps on a huge, nearly full volume makes each allocation slow."],
    v: "Allocate and free known ranges, then check that the bitmap bits and the group's free count match what the checker recomputes from the inode mappings.",
    dep: ["allocation-groups", "group-descriptors", "metadata-journaling"]
  },
  "free-space-btrees": {
    s: "Free space kept as keyed records, indexed by position and by size, so allocators can find a best-fit extent in logarithmic time without scanning.",
    d: "Two trees describe the same free extents: one sorted by start block to find neighbors and merge on free, one sorted by size to find an extent of at least the requested length. Every allocation or free updates both inside one transaction. Large free regions cost one record. The trees are metadata, so they need space themselves, which creates a bootstrapping problem solved by reserving a pool for tree growth. Checking cross-validates the two trees.",
    k: ["Dual indexes vs one: dual indexes give fast best-fit and fast coalescing, doubling the update work and the consistency check.", "Reserving space for the trees vs allocating on demand: reserving avoids deadlock when the tree must grow to record its own allocation; on-demand wastes none and can fail at full volume."],
    p: ["Running out of reserve while the volume is nearly full makes the trees unable to record a free, which blocks deletion.", "The two trees disagreeing after a bug yields allocations that overlap live data."],
    v: "Create heavy fragmentation, then request large allocations and confirm that each is satisfied in a bounded number of tree lookups, and that the checker's rebuilt free-space matches both trees.",
    dep: ["allocation-groups", "extent-allocator", "transactions-and-handles"]
  },
  "extent-allocator": {
    s: "Chooses the physical location and length of each new extent, balancing contiguity, locality to related data and the need to leave usable free space behind.",
    d: "Given a request with a goal block, such as just after the file's last extent, the allocator looks in the goal's group, then nearby groups, and takes the best fit it can find under the group lock. Goals keep sequential files contiguous and a directory's files close together. Fallback strategies loosen the fit as space gets scarce. Metadata gets its own policy so it stays near the data it describes. Allocation is also where a copy-on-write design places every rewritten block.",
    k: ["Best-fit vs first-fit: best-fit preserves large free extents and costs a search; first-fit is fast and shreds large free regions over time.", "Strict goals vs opportunistic placement: strict goals preserve locality and fail often on a busy volume; opportunistic placement always succeeds and scatters data."],
    p: ["Many writers appending to separate files in lockstep interleave small extents so every file ends up fragmented.", "A nearly full volume forces the allocator into worst-case search on every request."],
    v: "Write ten files in parallel and compare extent counts with a single-writer run; confirm each file's extents are few and mostly contiguous, and that allocation stays near its goal.",
    dep: ["free-space-bitmaps", "free-space-btrees", "allocation-groups", "multiblock-allocator"]
  },
  "delayed-allocation": {
    s: "Postpones choosing disk blocks for buffered writes until writeback, so the allocator sees the file's final size and can pick one contiguous extent.",
    d: "At write time the filesystem only reserves quota and space counts and marks the pages as delayed. Blocks are assigned when writeback gathers a run of dirty pages for the file. Short-lived files may never touch the disk, and large writes become a single extent. The cost is that a crash can lose or expose different data than eager allocation, and that allocation failures happen late, so reservations must be accurate. It also changes the meaning of file size versus allocated blocks in reports.",
    k: ["Delaying allocation vs allocating at write: delaying gives better layout and less work for temporary files; eager allocation fails early and has simple crash behavior.", "Conservative reservations vs exact accounting: conservative reservations over-estimate metadata and may refuse a write that would fit; exact accounting is hard to make crash-proof."],
    p: ["A crash after rename but before data writeback leaves a zero-length file unless the filesystem forces the data first.", "Accounting errors let writes appear to succeed that later fail with out-of-space during writeback."],
    v: "Write a file and delete it within the commit interval, confirm no data blocks were ever written in a block trace; write another and confirm that it lands as one extent on writeback.",
    dep: ["buffered-write-path", "space-reservation", "multiblock-allocator", "writeback", "extent-allocator"]
  },
  "multiblock-allocator": {
    s: "Allocates many blocks in one operation using in-memory free-space indexes and per-file or per-CPU preallocation pools, instead of block-by-block searches.",
    d: "Free space per group is summarized in power-of-two buddy structures so a request for a given order is a lookup, not a scan. Small allocations take from per-CPU or per-locality-group pools that are preallocated and shared among small files written together, which keeps them physically adjacent. Large files get their own preallocation window so concurrent appenders do not interleave. Unused preallocation is returned at close or under pressure. It is hard to tune because pool sizes affect both fragmentation and wasted space.",
    k: ["Per-file preallocation windows vs shared pools: per-file windows keep big files contiguous and strand space; shared pools pack small files and interleave their data.", "Cached buddy structures vs reading bitmaps each time: caching is fast and costs memory and initialization; reading is simple and slow."],
    p: ["Preallocation windows left reserved on idle files make free space look lower than it is until released.", "Per-CPU pools bound to a CPU interleave files from threads that migrated, defeating adjacency."],
    v: "Create 10,000 small files in a directory and confirm via block map that their data blocks are packed into a few contiguous regions rather than scattered across groups.",
    dep: ["free-space-bitmaps", "allocation-groups", "preallocation", "delayed-allocation"]
  },
  "preallocation": {
    s: "Reserving blocks ahead of writes, either at the application's request or by the allocator's own heuristic, to keep files contiguous and guarantee space.",
    d: "Explicit preallocation records unwritten extents the application can fill later without allocation failures. Implicit preallocation extends a growing file's allocation past the current write, based on append history, and trims it on close. Both reduce fragmentation for logs and downloads, and both temporarily hold space. Speculative preallocation is reclaimed when free space runs low or after a time. Accounting has to show preallocated space as used to the quota but not as data.",
    k: ["Speculative preallocation vs exact allocation: speculation prevents fragmentation of growing files and can hide gigabytes of unused space; exact allocation wastes nothing and fragments.", "Releasing on close vs on timer: close is predictable and defeats reopen-and-append patterns; a timer helps repeated appends and holds space longer."],
    p: ["A log directory full of large preallocated files makes free space appear to vanish.", "Preallocation on a copy-on-write file does not stop later overwrites from moving data elsewhere."],
    v: "Append to a file in small steps, confirm its allocated size runs ahead of its length, close it and confirm the extra space is released and free space returns.",
    dep: ["extent-allocator", "space-reservation", "extent-mapping"]
  },
  "inode-allocation": {
    s: "Picks a free inode number for a new file, preferring the parent's group for files and a different group for new directories to spread load.",
    d: "Inodes come from a fixed table, tracked by an inode bitmap per group, or from a dynamic structure where inode chunks are allocated as needed. The allocator reads the group's bitmap, picks a free slot, initializes it and updates counters in one transaction. Directory placement policy spreads top-level directories across groups. Inode numbers are never reused while a stale file handle might refer to them, so a generation number is bumped on reuse. Lazy table initialization means a group's table may be uninitialized.",
    k: ["Fixed inode tables vs dynamically allocated chunks: fixed tables are simple and can exhaust inodes; dynamic chunks never run out and need an extra index.", "Reusing inode numbers soon vs delaying reuse: quick reuse keeps tables dense; delayed reuse reduces stale handle confusion."],
    p: ["Inode exhaustion with free blocks fails file creation with a misleading no-space error.", "Without a generation counter, a network client holding an old handle reads another file's data."],
    v: "Create files until inodes run out on a small test volume, confirm the error, delete some and confirm creation resumes, and check that free inode counts match a checker rescan.",
    dep: ["allocation-groups", "inode-table", "group-descriptors", "transactions-and-handles"]
  },
  "space-reservation": {
    s: "Accounting that promises space to buffered writes, metadata and reserved pools ahead of the real allocation, so writes fail early rather than at writeback.",
    d: "Each write reserves the blocks its data may need, plus an estimate of metadata growth, against the free count. The reservation converts into real allocations at writeback and any excess is released. A small reserve is kept for the superuser and for operations that must succeed to free space, such as deleting under copy-on-write. Quotas draw on the same counters. The difficulty is correctness under concurrency, where many writers hold reservations at once, and under copy-on-write where even deleting can need new blocks.",
    k: ["Pessimistic metadata estimates vs exact counts: pessimism may reject writes that would fit near full; exactness needs tracking that is costly and racy.", "A privileged reserve vs none: a reserve keeps the system able to recover from full; without it a full volume can wedge administration."],
    p: ["Copy-on-write volumes that fill completely cannot delete files because deletion needs free blocks.", "Reservation leaks after an error path make free space appear to shrink until remount."],
    v: "Fill a small volume to its limit with parallel writers, confirm failures are returned at write time, then delete files and confirm the freed space is usable and reservation counters return to zero.",
    dep: ["delayed-allocation", "quotas", "block-group-reclaim", "buffered-write-path"]
  },
  "fragmentation-control": {
    s: "Allocator and background policies that limit how many pieces files and free space break into over time, such as goals, preallocation windows and online defragmentation.",
    d: "Fragmentation of files makes reads seek; fragmentation of free space makes later allocations small. Controls include allocation goals near existing extents, delayed allocation, preallocation for appenders, grouped placement of small files and moving data in the background. Copy-on-write designs fragment structurally because every overwrite relocates data, so they depend more on batching and on defragmentation. Measuring it needs both a per-file extent count and a free-space histogram.",
    k: ["Preventing fragmentation at write time vs repairing it later: prevention is cheap per file and limited by uncertain future writes; repair is flexible and costs I/O and wear.", "Free-space fragmentation vs file fragmentation as the target: protecting free extents keeps future files contiguous; protecting current files may consume large extents wastefully."],
    p: ["A volume kept above ninety percent full reaches a state where no large extent exists and every file fragments.", "Random-overwrite workloads on copy-on-write files fragment badly, and defragmenting then unshares snapshot data."],
    v: "Age a test volume with a mixed create, grow and delete workload, then report average extents per file and a free-extent size histogram, and compare them before and after a defragmentation pass.",
    dep: ["extent-allocator", "preallocation", "defrag-tool", "free-space-btrees"]
  },
  "discard-and-trim": {
    s: "Tells the device which blocks are no longer in use, either as blocks are freed or in periodic batches, so flash and thin-provisioned storage can reclaim them.",
    d: "On free, the filesystem may issue a discard for the range, or later a background trim walks free space and issues discards in large chunks. Online discard adds latency and queue load on every delete; batched trim runs from a timer and keeps the cost predictable. Discards of blocks freed in an uncommitted transaction must wait for the commit, or a crash would leave the old metadata pointing at discarded data. Not every device honors discard, and some return nondeterministic data afterward.",
    k: ["Online discard on every free vs periodic batch trim: online keeps the device informed at once and slows deletes; batching is cheap and leaves free blocks undiscarded for hours.", "Discarding after commit only vs immediately: after commit is safe across crashes; immediate discard risks data loss when a crash rolls back the free."],
    p: ["Discarding a block still referenced by a previous committed state, for instance a snapshot, destroys recoverable data.", "Queued discards on a slow device stall the commit that waits for them."],
    v: "Fill a thin-provisioned test device, delete the files, run the trim command and confirm via the device's allocation report that it shrinks by about the freed amount, and that no live file changes.",
    dep: ["free-space-bitmaps", "commit-and-checkpoint", "flash-awareness", "block-io-submission"]
  },
  "journal-format": {
    s: "The layout of the log: a superblock, then a circular sequence of transactions each made of descriptor blocks, copies of metadata blocks and a commit record.",
    d: "The journal superblock records geometry, the start of the oldest live transaction and a sequence number. Each transaction begins with descriptor blocks listing the destination addresses of the following data blocks, then the blocks themselves, then a commit block carrying the sequence number and checksum. Recovery scans from the start, validates each transaction in order, and stops at the first invalid one. The log is circular, so space is reused as transactions are checkpointed. Journal checksums replace the older rule of a barrier between data and commit.",
    k: ["Checksummed commit records vs ordering with a flush: checksums let the commit block be written with the data and save a wait; flush ordering is simpler and costs one stall.", "Whole-block logging vs logical records: whole blocks are simple to replay and bulky; logical records are small and need operation-specific replay code."],
    p: ["A journal too small for the workload stalls all writers waiting on checkpointing.", "Replaying a transaction whose commit checksum was not verified writes garbage over metadata."],
    v: "Dump the journal from a test volume after a few operations and confirm that descriptors, block copies and commit records parse with matching sequence numbers and valid checksums.",
    dep: ["superblock", "metadata-checksums", "transactions-and-handles"]
  },
  "transactions-and-handles": {
    s: "The grouping of many small metadata changes into one atomic unit: operations take handles on the running transaction, which commits when enough have accumulated or a timer expires.",
    d: "Each operation starts a handle declaring how many blocks it may modify, so the journal can reserve space. It then obtains write access to each block, edits it in the cache and marks it dirty in the transaction. When all handles finish and the commit condition is met, the transaction closes and commits, while a new one opens to accept changes. Batching amortizes the cost of the commit across many operations. The difficulty is credit estimation, because an operation that needs more blocks than declared stalls or aborts.",
    k: ["Large shared transactions vs one per operation: sharing batches I/O and makes every operation wait for a slow commit; per-operation commits are expensive and independent.", "Declaring credits up front vs growing on demand: up front allows deadlock-free journal sizing and wastes space; on demand is exact and can deadlock when the journal is full."],
    p: ["An operation that touches more blocks than it declared overruns its credit and aborts the journal.", "A thread that holds a handle while sleeping on I/O blocks every other operation from committing."],
    v: "Run ten thousand creates and check from journal statistics that they were folded into far fewer transactions than operations, with no aborted handles and a clean checker run.",
    dep: ["journal-format", "metadata-journaling", "commit-and-checkpoint"]
  },
  "metadata-journaling": {
    s: "Logging every change to metadata blocks (inodes, bitmaps, directories, trees) before writing them in place, so recovery restores structural consistency after a crash.",
    d: "Before a metadata block is modified, the driver gets journal write access and, if the block is part of a committing transaction, makes a frozen copy so the commit writes a consistent image. At commit, modified blocks are written to the log; later, checkpointing writes them to their home locations. After a crash, replay rewrites logged blocks. The guarantee is that the structures are consistent, not that file data is: contents of recently written files may be old, new or zero depending on the data mode.",
    k: ["Logging full metadata blocks vs only changed regions: full blocks are simple and amplify writes for small changes; region logging saves space and is more complex.", "Journaling metadata only vs also data: metadata-only keeps normal throughput and allows stale data to appear; data journaling doubles writes for stronger guarantees."],
    p: ["Believing metadata journaling protects file contents leads applications to skip fsync and lose data.", "Hot blocks such as bitmaps written to the log repeatedly in many transactions create contention on their copy."],
    v: "Cut power during a burst of creates and renames, mount, and confirm the file tree is structurally consistent with no checker errors, even though some recent files may be missing.",
    dep: ["journal-format", "transactions-and-handles", "inode-table", "free-space-bitmaps"]
  },
  "data-ordering-modes": {
    s: "The policy for how file data relates to the metadata journal: ordered writes data first, writeback does not order it, and full data journaling logs it too.",
    d: "In ordered mode, the commit waits until data blocks that new metadata points to are on disk, so a crash cannot expose stale contents through a newly allocated block. Writeback mode removes that wait and is faster, but a crash can show old data inside a file whose size was updated. Full data mode writes everything twice and gives the strongest consistency. Delayed allocation interacts with the choice: the data writes are triggered by the journal commit or by writeback.",
    k: ["Ordered mode vs writeback mode: ordered prevents exposure of stale blocks and can stall commits behind big writes; writeback is faster and risks leaking old data after a crash.", "Full data journaling vs ordered: full journaling gives atomic data writes and halves write throughput; ordered writes data once and gives no atomicity for overwrites."],
    p: ["Writeback mode exposes another user's deleted data in a file after a crash.", "In ordered mode one process doing a large write stalls everyone's fsync because commit waits for all dirty data."],
    v: "Append to a file under each mode, cut power at random times, and inspect after recovery: ordered never shows stale bytes within the new size; writeback may; full mode shows whole writes only.",
    dep: ["metadata-journaling", "writeback", "delayed-allocation", "commit-and-checkpoint"]
  },
  "commit-and-checkpoint": {
    s: "Commit writes a transaction to the log and makes it durable; checkpoint later writes its blocks to their final places so the log space can be reused.",
    d: "A commit thread closes the running transaction, writes descriptor and data blocks plus the commit record, issues a cache flush and signals waiters. Separately, checkpointing writes the logged blocks to their home locations, then advances the journal start pointer. If the log fills, new handles block until checkpointing frees space. Commit intervals of several seconds bound how much recent metadata a crash can lose. The cost shows up as latency for fsync and as periodic write bursts.",
    k: ["Short vs long commit interval: short intervals lose less on a crash and write more often; long intervals batch more and widen the loss window.", "Checkpointing eagerly vs lazily: eager keeps the log empty and increases write traffic for blocks changed again soon; lazy risks the log filling."],
    p: ["A journal that fills because checkpointing falls behind produces multi-second stalls for all writers.", "Skipping the flush after the commit record makes a crash lose a transaction the application was told was durable."],
    v: "Under steady metadata load, watch commit and checkpoint counters and confirm commit time stays within the interval, that the log never fills, and that after fsync a power cut preserves the operation.",
    dep: ["transactions-and-handles", "journal-format", "barriers-and-flushes", "block-io-submission"]
  },
  "journal-replay": {
    s: "At mount after an unclean shutdown, reads the log, validates committed transactions in order and rewrites their blocks to their home locations.",
    d: "Recovery makes three passes: find the end of the valid log by scanning sequence numbers and checksums; collect revoke records to know which blocks not to replay; then copy each logged block to its destination. It stops at the first incomplete or invalid transaction, so partial transactions are ignored. After replay the log is marked empty. Replay is idempotent, so a crash during recovery is harmless. It needs the device writable, which is why a read-only block device cannot recover a dirty volume.",
    k: ["Multi-pass replay with revokes vs a single pass: revokes prevent replaying blocks that were later freed and reused as data; single pass is simpler and corrupts reused blocks.", "Replaying at mount vs in a separate step: at mount is automatic; a separate step lets operators image the device before changing anything."],
    p: ["A corrupt log header makes mount fail and a naive operator clears the journal, discarding committed metadata.", "Replay after the device was resized or reordered writes blocks to the wrong places."],
    v: "Mount a volume cut mid-workload, confirm the log reports the number of transactions replayed, check the tree equals the last committed state, and replay twice to confirm the second run changes nothing.",
    dep: ["journal-format", "revoke-records", "metadata-checksums", "superblock"]
  },
  "revoke-records": {
    s: "Log entries that tell recovery not to replay earlier copies of a block because the block has since been freed and may hold ordinary data.",
    d: "When a metadata block is freed and later reused for file data, an older logged copy of it must not be written back during replay, since that would overwrite the data. The freeing transaction writes a revoke record listing the block. During recovery, a block revoked in transaction N is skipped in any transaction up to N. Revokes are tracked in a hash table in memory and written as part of the commit. The scheme exists only in designs that overwrite blocks in place.",
    k: ["Revoke records vs forcing a checkpoint before reuse: revokes avoid synchronous writes and add a recovery pass; checkpointing before reuse is simple and stalls the freeing operation.", "Revoking only metadata blocks vs everything: restricting to metadata keeps the table small; data blocks never appear in a metadata log."],
    p: ["Missing a revoke when a directory block becomes file data corrupts the file at the next crash recovery.", "Revoke tables for very large transactions consume noticeable memory during replay."],
    v: "Create and delete a directory then reuse its block for a file that is written and committed, power-cut, replay, and confirm the file content survives instead of being overwritten by the stale directory image.",
    dep: ["journal-format", "journal-replay", "free-space-bitmaps"]
  },
  "fast-commit": {
    s: "A compact secondary log of logical operations, such as create, link and extent add, that makes fsync cheap by avoiding a full transaction commit.",
    d: "Instead of logging whole metadata blocks, the fast area records small descriptions of what changed. An fsync appends the records for the affected file and flushes, taking far less than a full commit. At recovery the full journal is replayed first, then the fast records are applied on top. Periodically a full commit folds everything into the normal journal. It speeds file-by-file durability for workloads such as mail and databases, at the cost of a second recovery path that has to produce identical results.",
    k: ["Logical fast log vs whole-block commits only: logical records make fsync cheap and require per-operation replay code that must match the real code exactly.", "Falling back to a full commit for rare operations vs supporting all: falling back keeps the fast path small and makes latency unpredictable for those cases."],
    p: ["A replay routine that differs subtly from the normal path produces a tree that no live operation could have produced.", "Heavy use of operations that force a fallback gives all the complexity and none of the speedup."],
    v: "Run a loop of create, write and fsync and compare commit counts and fsync latency with the feature on and off; power-cut and confirm both recover the same state.",
    dep: ["journal-format", "fsync-path", "journal-replay", "transactions-and-handles"]
  },
  "external-journal": {
    s: "Keeping the log on a separate, usually faster, device from the main volume, shared in format and sometimes between several filesystems.",
    d: "The journal device holds its own superblock identifying which filesystems it serves and their UUIDs. The filesystem opens it at mount and writes transactions there, giving sequential commit writes a device with low latency, such as a flash drive, while bulk data lives on slow disks. Losing the journal device makes any uncommitted metadata unrecoverable, and the main volume may fail to mount without it. Management tools must create, attach and detach journals safely.",
    k: ["Separate fast journal device vs internal journal: a separate device speeds commits and adds a second failure domain and a mount dependency.", "Dedicated device per volume vs shared: shared uses fewer devices and couples volumes' failures and write contention."],
    p: ["The journal device is lost or not attached at boot, and the volume refuses to mount although the data is intact.", "A journal on a device without power-loss protection on its cache defeats the durability it was added for."],
    v: "Create a volume with a journal on a second device, run a metadata workload and confirm via block trace that all log writes go to the journal device and none to the main one; then remount and verify.",
    dep: ["journal-format", "barriers-and-flushes", "mount-negotiation"]
  },
  "barriers-and-flushes": {
    s: "Cache flush and forced-unit-access requests that enforce write ordering when a device's volatile cache would otherwise reorder or delay writes.",
    d: "A device may acknowledge a write once it is in its cache and persist it later in any order. The filesystem needs particular writes to be durable before others: the journal body before its commit record, the commit before checkpointing, the new tree before the superblock that points to it. It requests a flush, which drains the cache, or marks a write as forced unit access. These are expensive, so designs minimize them by batching and by checksums that remove ordering needs. Devices that lie about flush completion make all of it moot.",
    k: ["Flush between phases vs checksum-verified recovery: flushes give strict ordering and cost latency; checksums let phases overlap and detect an incomplete write instead.", "Flush plus forced-unit-access commit vs two flushes: forced-unit-access writes the commit durable in one step on devices that support it; two flushes work everywhere and cost more."],
    p: ["Disabling barriers for benchmark speed on a volatile cache corrupts metadata after power loss, often months later.", "Layers that drop flush requests, such as some virtual devices, silently remove ordering the filesystem relies on."],
    v: "Run a power-loss fault-injection test that drops unflushed writes while running a create and rename workload, then confirm that every recovery mounts and checks clean with barriers on, and fails to with them off.",
    dep: ["block-io-submission", "commit-and-checkpoint", "io-error-handling"]
  },
  "cow-btrees": {
    s: "A tree structure where modifying a node writes a new copy and then copies its ancestors up to the root, leaving the old version intact.",
    d: "All metadata, and sometimes data mappings, live in B-trees of keyed items. To change a leaf, the driver copies it, edits the copy, then copies its parent to point at the new leaf, and so on up to a new root. The old tree remains a valid, consistent snapshot until freed. Interior nodes cannot hold sibling pointers because those would force copying neighbors. Costs are write amplification, since a small change copies a path, and fragmentation. Locking is hard because nodes are copied while readers may hold the old ones.",
    k: ["Copy-on-write trees vs update in place with a journal: copy-on-write gives atomic commits and cheap snapshots with write amplification; in place is cheaper per write and needs a log.", "Large nodes vs small nodes: large nodes lower tree height and copy more bytes per change; small nodes copy less and make the tree deeper."],
    p: ["A very hot item, such as a file's extent list, rewrites an entire path to the root on every change.", "Readers holding old nodes while writers copy them make lock-free reads easy to get subtly wrong."],
    v: "Insert and delete a million items, confirm the checker validates ordering and checksums at every level, and compare bytes written per update against the tree height.",
    dep: ["generation-numbers", "metadata-checksums", "atomic-root-commit", "extent-refcounts"]
  },
  "atomic-root-commit": {
    s: "A transaction becomes durable when one small, checksummed pointer to the new tree roots is written, so a crash sees either all of the change or none.",
    d: "The commit writes all new tree nodes, flushes, then writes the superblock, which names the roots of all trees and the generation number. Several superblock copies are kept, and recovery picks the newest valid one. Because the old roots are untouched, there is nothing to replay. Commit rhythm is periodic and also forced by fsync. A single commit covers everything in memory at that moment, so one slow writer can delay the commit for others.",
    k: ["One global commit vs per-subvolume commits: global is simple and lets one busy tree delay all; per-tree commits isolate workloads and break cross-tree consistency.", "Writing multiple superblock copies vs one: copies survive a torn write and cost extra writes at each commit."],
    p: ["Skipping the flush before writing the superblock means a crash can leave a root pointing at unwritten nodes.", "A tree that grows so large that a commit takes seconds makes every fsync slow."],
    v: "Cut power at random points during a heavy workload using a device that drops unflushed writes, and confirm every mount finds a valid root with a clean check and no replay step.",
    dep: ["cow-btrees", "superblock", "barriers-and-flushes", "generation-numbers"]
  },
  "extent-refcounts": {
    s: "Per-extent reference counts and back-references that record which trees and files use each block range, enabling sharing and safe freeing.",
    d: "An extent tree holds an item per allocated range with its count. Sharing, through snapshots and reflinks, raises the count; a block is freed only when the count reaches zero. Back-references list the owners, so that relocation, scrubbing and error reports can find which file a block belongs to, at the cost of more metadata. Counts and back-references are updated in bulk at commit, because changing them on every operation would copy tree paths repeatedly. Accounting errors are among the nastiest bugs in these designs.",
    k: ["Full back-references vs counts only: back-references allow finding owners for relocation and error reports and take space and updates; counts alone are smaller and make relocation hard.", "Updating counts lazily at commit vs immediately: lazy batches changes and complicates reasoning about in-flight state; immediate is simple and slow."],
    p: ["A count that is too low frees a block still in use, silently corrupting a second file.", "A count that is too high leaks space that only a full check can recover."],
    v: "Create files, clone and snapshot them in several ways, delete in random order, then confirm the checker's recomputed counts match the stored ones and free space returns to the starting value.",
    dep: ["cow-btrees", "delayed-references", "snapshots"]
  },
  "delayed-references": {
    s: "A queue of pending reference-count changes collected during a transaction and applied together at commit, to avoid rewriting tree paths for every individual change.",
    d: "Operations that allocate, free or share extents add entries to a per-transaction queue instead of editing the extent tree immediately. Entries for the same extent merge, so an extent allocated and freed in one transaction costs nothing. At commit, or when the queue gets large, they are run in order. Running them can itself allocate blocks, as the extent tree is modified, which adds new entries; the loop ends when the queue is empty. Space for this must be reserved ahead.",
    k: ["Deferred application vs immediate updates: deferral cuts write amplification and needs reservation logic for the follow-up work; immediate is simple and expensive.", "Bounding queue length vs unbounded: bounding forces early flushes that stall writers; unbounded risks a very long commit."],
    p: ["Running the queue allocates new blocks that need space; with the volume full this deadlocks unless reserve exists.", "Merging mistakes between pairs of entries cancel an add and a free for different owners."],
    v: "Create and delete a million files in a loop and confirm that extent tree writes per operation fall well below path length, with the checker validating counts after commit.",
    dep: ["extent-refcounts", "cow-btrees", "space-reservation"]
  },
  "fsync-log-tree": {
    s: "A small separate tree, written without a full commit, that records the changes needed to recover one fsynced file, replayed at the next mount.",
    d: "A full copy-on-write commit makes fsync expensive since it writes all dirty trees. Instead, fsync writes the file's data and logs just its inode, extents and directory entries in a dedicated log tree, then makes the log root durable through a superblock hint. After a crash the log is replayed against the last committed trees, and then discarded at the next full commit. The replay must handle renames, links and deletions racing with the logged file, which is the source of its complexity.",
    k: ["Per-file log tree vs full commit on fsync: the log is quick for one file and adds a second consistency mechanism; a full commit is simple and slow under load.", "Logging parent directory changes with the file vs separately: logging them together preserves name visibility and makes replay conflicts more complicated."],
    p: ["Replay conflicts between a logged rename and a later unlogged change leave a file reachable under two names or none.", "Logs that grow with large fsynced files fall back to a full commit, and latency spikes."],
    v: "Loop create, rename and fsync, cut power at random, then mount and confirm that every fsynced file exists with its latest name and contents, and the checker reports no inconsistency.",
    dep: ["cow-btrees", "fsync-path", "atomic-root-commit", "directory-entries"]
  },
  "generation-numbers": {
    s: "A counter incremented at each commit and stamped on every tree node and inode, so the age of any structure is known and stale pointers are detected.",
    d: "Each node records the generation in which it was written, and parents record the generation they expect of each child. A mismatch means a lost or misdirected write. Generations also let send streams find changed subtrees by comparing with the parent snapshot's generation, and let the driver decide whether a node can be modified in place: a node created in the current uncommitted generation needs no copy. Superblock copies carry the generation, so recovery picks the newest.",
    k: ["Generation recorded in parent pointers vs only in the node: parent-side recording catches stale reads of a valid-looking old node; node-only is smaller and cannot detect them.", "In-place edits of nodes in the current generation vs always copying: in-place saves write traffic and requires proof that no commit has read the node."],
    p: ["A node modified in place after its generation was committed corrupts the snapshot that shares it.", "Generation counters shared across many trees make incremental send comparisons subtle when a tree was restored from backup."],
    v: "Change one file in a large snapshot pair and use generation comparison to enumerate changed items; confirm the list contains exactly that file's items and nothing else.",
    dep: ["cow-btrees", "superblock", "metadata-checksums"]
  },
  "relocation-and-balance": {
    s: "Moves allocated extents or whole block groups to new locations, updating every reference, to change layout, convert redundancy profiles or shrink the volume.",
    d: "Relocation picks a block group, finds all extents in it, copies them elsewhere and rewrites all references using the back-references. It runs while the filesystem is in use, using a special tree of relocation items that keeps old and new locations consistent through a crash. Uses include evacuating a device being removed, converting from mirror to parity, compacting mostly empty groups and shrinking. It is IO-heavy and touches many trees at once.",
    k: ["Relocating through back-references vs rescanning all trees: back-references make it proportional to the group size and require the metadata to be accurate; rescanning is slow and independent.", "Throttled background balance vs maximum speed: throttled interferes little and takes days; fast finishes sooner and starves applications."],
    p: ["A crash during relocation leaves data in both places until recovery finishes the job; tools that look at free space mid-way misreport.", "Relocating a nearly full volume needs free groups to move into and can fail with no room."],
    v: "Convert a mirrored test volume's data to a different profile while writing files, then confirm the profile via status output, the checker is clean and every file checksum matches a manifest taken beforehand.",
    dep: ["extent-refcounts", "cow-btrees", "raid-profiles", "block-group-reclaim"]
  },
  "block-group-reclaim": {
    s: "A background process that finds block groups mostly empty after deletions, relocates their remaining data and returns the space to the unallocated pool.",
    d: "Copy-on-write designs allocate space in large typed chunks, one for data and one for metadata. After many deletions a chunk may hold a little live data and look full to its type, while the pool has no free chunks for the other type. Reclaim finds chunks under a utilization threshold, relocates their extents and frees the chunk. Without it the volume can report no space while having plenty of free capacity inside the wrong chunk type. It runs automatically below a threshold of unallocated space.",
    k: ["Typed chunks vs one mixed pool: typed chunks keep metadata dense and compact; a mixed pool avoids chunk starvation and spreads metadata thin.", "Automatic reclaim vs manual balance: automatic prevents surprise full conditions and consumes I/O at times chosen by the driver."],
    p: ["Metadata chunks full while data chunks have gaps produce a no-space error on a volume that is half empty.", "Reclaim on a nearly full volume has nowhere to move data and cannot rescue it."],
    v: "Fill a volume with small files, delete most, confirm allocated chunk space stays high, run reclaim and confirm unallocated space rises and that the earlier out-of-space condition no longer occurs.",
    dep: ["relocation-and-balance", "space-reservation", "free-space-btrees"]
  },
});
