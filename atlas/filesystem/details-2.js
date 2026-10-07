// Details for the filesystem plate, part 2: data services, integrity, page cache and file I/O.
ATLAS.details("filesystem", {
  "snapshots": {
    s: "A read-only or writable point-in-time view of a subtree or volume that shares all unmodified blocks with its source and costs almost nothing to create.",
    d: "In a copy-on-write design a snapshot is a new tree root pointing at the same nodes as the source, with reference counts raised on the shared blocks. Later writes to either side copy the touched path and diverge. Deleting a snapshot drops references and frees blocks no one else holds, which can take significant background work. Journaling designs without shared blocks can only snapshot through a lower layer that copies old blocks on write. The hard parts are space accounting and many-snapshot performance.",
    k: ["Native copy-on-write snapshots vs block-layer snapshots: native ones are instant and file-aware; block-layer ones work under any filesystem but add copy cost on first overwrite of each block.", "Writable vs read-only snapshots: writable ones enable cloning workflows and complicate accounting; read-only ones are simple and safe for backup."],
    p: ["Hundreds of snapshots of a busy volume make every extent have many owners, slowing deletion and space reporting.", "A snapshot taken without quiescing applications captures a crash-consistent state, not an application-consistent one."],
    v: "Write a file, take a snapshot, overwrite the file, and confirm the snapshot returns old contents, the live view returns new, and free space dropped only by the changed blocks.",
    dep: ["cow-btrees", "extent-refcounts", "subvolumes", "generation-numbers"]
  },
  "subvolumes": {
    s: "Separately rooted file trees inside one filesystem, each with its own inode numbering, quota group and snapshot lineage, mounted like directories.",
    d: "A subvolume is a tree of files with its own root item in a master tree of roots. It can be mounted independently, snapshotted, sent, given a quota and deleted as a unit. Inode numbers are unique only within one, so a path crossing a boundary needs a device number adjustment for tools like find and backup programs. Subvolumes provide the structure that snapshots and per-workload accounting hang from, without the fixed size of separate partitions.",
    k: ["Subvolumes in one pool vs separate volumes: sharing the pool avoids pre-sizing and lets free space flow between workloads, but removes hard isolation of failures and capacity.", "Inode numbers per subvolume vs globally unique: per-subvolume is cheap but makes hard links across boundaries impossible and confuses tools that assume unique numbers."],
    p: ["Tools that identify files by inode number and device collapse different files from different subvolumes into duplicates.", "Deleting a large subvolume returns immediately but frees space gradually, so free-space checks right after look wrong."],
    v: "Create two subvolumes, make a file with the same inode number in each, mount them separately and confirm both stay independent, with deletion of one leaving the other intact.",
    dep: ["cow-btrees", "snapshots", "quotas"]
  },
  "reflinks": {
    s: "A file copy that shares data extents with the original and diverges on write, giving constant-time copies without duplicating data.",
    d: "The clone call makes the destination's mapping point at the source's extents and raises their reference counts. Writes to either file allocate new blocks for the changed range and leave the rest shared. Ranges rather than whole files can be cloned, which the copy-range call uses when possible. The filesystem needs a reverse mapping or reference-count structure to know when an extent is free. Quota and free-space reports then have to decide who owns shared bytes.",
    k: ["Reference-counted shared extents vs full copies: sharing is instant and space-efficient but makes every overwrite a copy-on-write and fragments files over time.", "Whole-extent sharing vs block-granular sharing: extent-level metadata is smaller, but a one-byte change then copies or splits a large extent."],
    p: ["A copy on a nearly full volume succeeds instantly and then fails with no space when the first overwrite needs a new block.", "Cloning across mount points or subvolume boundaries is refused, and tools falling back to a full copy surprise users with the time and space."],
    v: "Clone a 10 GB file, confirm it completes in milliseconds with free space unchanged, modify a few blocks in the clone and confirm used space grew by about that amount and both files read correctly.",
    dep: ["extent-refcounts", "extent-mapping", "space-reservation", "cow-btrees"]
  },
  "send-receive-streams": {
    s: "A serialized description of the difference between two snapshots, which another volume can apply to reproduce the newer state, used for incremental backup and replication.",
    d: "The sender walks two snapshot trees and uses generation numbers to skip unchanged subtrees, emitting commands such as create, write, rename and set attributes. The receiver replays them, producing a new snapshot. Because it works on trees, cost scales with changes, not with total size. Streams can be piped over a network or stored. Incrementals require the parent snapshot to exist on both sides, and a broken chain forces a full send.",
    k: ["Tree-diff streams vs file-level synchronization: tree diffs are fast and exact including renames and shared extents; file-level tools are portable between filesystems but must scan everything.", "Stateless stream files vs live replication: streams are simple to archive, but each depends on its predecessor and cannot be applied out of order."],
    p: ["Deleting the parent snapshot on the sender before the receiver finishes makes the incremental chain impossible.", "A stream replayed on a receiver whose parent differs slightly produces silent divergence unless identifiers are checked."],
    v: "Send a full snapshot, change a few files, send an incremental, receive both on another volume and compare the two trees with a checksum walk, expecting identical contents and metadata.",
    dep: ["snapshots", "generation-numbers", "cow-btrees", "subvolumes"]
  },
  "compression": {
    s: "Compresses file data in extents as it is written and decompresses on read, trading CPU for capacity and sometimes for fewer device writes.",
    d: "Data is split into fixed-size chunks, compressed by a chosen algorithm, and stored as a smaller extent flagged with its method and uncompressed length. Reads decompress an entire extent even for a small request. Heuristics sample data to skip incompressible content such as media. The mapping must distinguish logical from physical length, and compressed extents complicate in-place overwrite, so they pair naturally with copy-on-write. Encryption and checksums must be ordered correctly with compression.",
    k: ["Small compression chunks vs large ones: small chunks keep random reads cheap but compress worse; large chunks compress better and make reading a small range expensive.", "Per-file or per-directory opt-in vs volume-wide: opt-in avoids CPU spent on media, while volume-wide gives savings without user effort."],
    p: ["Compressing already-compressed or encrypted data wastes CPU for no gain.", "Reported file size, space used and free space all stop agreeing, which confuses quota tools and capacity planning."],
    v: "Write a highly repetitive file and a random file of equal size, then compare allocated blocks: the first should be much smaller, the second about equal, and both read back identical to the original.",
    dep: ["extent-mapping", "data-checksums", "buffered-write-path", "file-encryption"]
  },
  "deduplication": {
    s: "Finds identical data ranges across files and replaces the copies with shared extents, reclaiming space after the fact.",
    d: "A userspace tool hashes data blocks, finds matches and asks the kernel to deduplicate specific ranges. The kernel compares the actual bytes under lock, so a hash collision cannot cause loss, then remaps the destination onto the source's extent and frees the old blocks. In-line deduplication, which hashes before write, needs a persistent table and is rare because of memory and latency costs. Space savings depend heavily on data: virtual machine images save much, user documents little.",
    k: ["Out-of-band vs in-line deduplication: out-of-band runs when the system is idle and needs no write-path cost; in-line saves writes immediately and needs a large hash table.", "Fine-grained vs coarse blocks: small blocks find more matches and create heavy fragmentation and metadata; large ones find fewer but keep files contiguous."],
    p: ["Aggressive deduplication across many snapshots makes each extent heavily shared and slows later deletion.", "Deduplicating across files with different encryption or compression settings is refused or yields no savings."],
    v: "Copy a file into two places without clone support, run the tool and confirm used space drops by the file size, byte-compare both files with the original and confirm both still read correctly.",
    dep: ["reflinks", "extent-refcounts", "data-checksums"]
  },
  "inline-data": {
    s: "Stores the contents of very small files, or the tail of a file, inside the inode or metadata block rather than allocating a data block.",
    d: "If a file fits in the spare space of the inode, its bytes live there, saving a block and a separate read. A related technique packs the final partial block of several files into one shared block. Both complicate reading and writing since a file can switch between inline and block-mapped storage as it grows. The size limit depends on inode size. It helps workloads with millions of tiny files, and costs a conversion path that is rarely tested.",
    k: ["Inline small files vs always allocating blocks: inline saves space and an I/O but ties capacity to inode size and adds a representation to every file code path.", "Tail packing vs whole-block tails: packing wastes less space in the last block and makes rewriting the tail a read-modify-write of shared data."],
    p: ["The growth transition from inline to block-mapped storage, if interrupted by a crash, leaves the file with data in neither place.", "Direct I/O and memory-mapped access need special handling for inline files and many drivers simply disallow them."],
    v: "Create files of 0, 100, 200 and 4096 bytes, compare allocated block counts, then append to the smallest until it leaves inline form and confirm contents stay identical across the transition.",
    dep: ["inode-structure", "extent-mapping", "extended-attributes"]
  },
  "sparse-files": {
    s: "Files whose unwritten ranges consume no storage and read as zeros, with calls to find where data and holes begin.",
    d: "The mapping simply has no extent for a hole. Writing into a hole allocates blocks for that range only. The seek-data and seek-hole calls walk the mapping so tools such as copy and backup can skip holes. Punching a hole deallocates blocks inside an existing file. Preallocated ranges that are reserved but unwritten are tracked as unwritten extents that read as zeros, which is a separate state from a hole. It matters because file size and disk usage diverge.",
    k: ["Holes as absent mappings vs explicit zero extents: absence is free and shows in space use; explicit zero extents give predictable allocation but waste space.", "Reporting holes precisely vs coarsely: precise reports let tools skip all holes; coarse reports, such as per-block granularity, are cheaper and let tools copy zeros."],
    p: ["Backup tools that read sparse files naively write the full logical size and fill the destination.", "A file system with no space can fail a write into a hole that had appeared to be free, because the allocation happens at write time."],
    v: "Create a file with a 1 GB hole between two small writes, confirm its size is above 1 GB with allocated blocks under a megabyte, and confirm the seek calls report the two data regions.",
    dep: ["extent-mapping", "fallocate-and-punch", "space-reservation"]
  },
  "data-checksums": {
    s: "A checksum stored for each data block or extent and verified on every read, so silent corruption by the device or cable is detected rather than returned.",
    d: "On write the filesystem computes a checksum, often using a fast hardware-accelerated function, and stores it in a separate checksum tree or an area near the data. On read it recomputes and compares; a mismatch becomes an I/O error or triggers a repair from another copy. Keeping checksums apart from data means a misdirected write cannot corrupt both. Cost is CPU plus extra metadata that must also be allocated, journaled or copied on write. Checksums on data written in place need care to be atomic.",
    k: ["Checksums in a separate tree vs next to the data: separate storage catches misdirected writes but costs a second lookup; adjacent storage is cheaper and can be lost together with the data.", "Strong vs fast checksum algorithms: stronger ones catch more but cost CPU and cache; fast ones are enough against random corruption, not deliberate tampering."],
    p: ["Updating data in place and its checksum separately leaves a window where a crash makes a good block fail verification.", "Direct I/O or memory-mapped writers that modify a page while it is written produce a checksum that does not match the stored data."],
    v: "Flip a bit in a data block on a test image, read the file and confirm an I/O error naming the file, with the error counter incremented, while untouched files still read fine.",
    dep: ["extent-mapping", "cow-btrees", "metadata-checksums", "self-healing-reads"]
  },
  "metadata-checksums": {
    s: "A checksum in every metadata block header, covering inodes, directory blocks, bitmaps and tree nodes, verified when the block is read.",
    d: "Every metadata structure carries a checksum, often seeded with the volume's identifier and the block's own address, so a block copied to the wrong place fails verification. The driver verifies on read and recomputes before writing back. Failures route to the error policy: read-only remount, a repair from a redundant copy, or reporting corruption to the checker. In a journal, the log blocks carry their own checksums so replay stops at the first damaged transaction. The cost is a few percent of CPU and a format change.",
    k: ["Block-address seeding vs a plain content checksum: seeding catches misplaced blocks and makes it impossible to copy blocks between volumes; plain checksums are simpler.", "Verify on every read vs only on cache fill: cache-fill verification is cheap and cannot catch memory corruption of cached blocks."],
    p: ["A checksum covering a field the driver updates without recomputing, such as a counter, makes valid blocks look corrupt.", "Old tools that do not know the checksum fields rewrite blocks without updating them and damage the volume."],
    v: "Corrupt a single byte in an inode table block, mount, access the file and confirm the log names the block and checksum failure, then confirm the checker identifies the same block.",
    dep: ["superblock", "inode-table", "error-policy", "feature-flags"]
  },
  "scrubbing": {
    s: "A background pass that reads every allocated block, verifies its checksum and repairs bad copies from redundancy before an application ever requests them.",
    d: "The scrubber walks the extent allocation in physical order, which is sequential for the device, reads data and metadata, verifies checksums and counts errors. With a redundant copy it rewrites the bad block from the good one, forcing the device to remap a failing sector. It runs throttled so it does not starve foreground I/O. Without redundancy, it reports the damaged files so they can be restored from backup. Intervals of weeks to months catch decay in rarely read data.",
    k: ["Physical-order vs logical-order scanning: physical is fast for spinning disks and needs reverse mapping to name files; logical is easy to attribute and seeks heavily.", "Full-speed vs throttled scrubbing: full speed finishes early and hurts latency; throttled is invisible but takes days on large arrays."],
    p: ["A volume scrubbed too rarely discovers that both copies of a block have rotted and nothing is left to repair from.", "Scrub reading every block can itself trigger failures on aging disks, so it should be scheduled with a recent backup."],
    v: "Corrupt one mirror copy of a block on a test array, run a scrub and confirm it reports one corrected error, that a second scrub reports zero, and that the file contents are unchanged.",
    dep: ["data-checksums", "metadata-checksums", "self-healing-reads", "raid-profiles", "extent-refcounts"]
  },
  "self-healing-reads": {
    s: "When a checksum fails and another copy exists, the read is served from that copy and the bad one is rewritten, hiding the fault from the application.",
    d: "The read path asks the multi-device layer for a copy; if verification fails it asks for the next one. On success it returns the good data to the caller and queues a rewrite of the bad copy, which causes the device to remap the sector. The event is logged and counted. With parity RAID the data is reconstructed from the other devices. It requires the filesystem to know about the redundancy, which is why built-in volume management can heal and a lower layer cannot tell which copy is right.",
    k: ["Filesystem-level redundancy vs a separate RAID layer: the filesystem can verify and pick the right copy; a lower layer sees only equal-looking blocks and cannot tell which is correct.", "Repairing immediately on read vs only reporting: immediate repair restores redundancy at once; reporting avoids a write during a read on a suspect device."],
    p: ["Rewriting a corrupt copy to a device that is itself failing makes the problem worse and fills the log.", "Silent healing hides a dying device unless error counters are watched and alerted."],
    v: "Corrupt one mirror, read the affected file and confirm correct data, a corrected-error log entry, and that the bad copy now reads correctly on a direct device read.",
    dep: ["data-checksums", "raid-profiles", "block-io-submission", "io-error-handling"]
  },
  "error-policy": {
    s: "The configured response to an error found in metadata or after an I/O failure: continue, remount read-only, or stop the system, with the choice made per volume.",
    d: "Detected errors are classified: corrupt metadata, failed writes, journal abort, no space for critical structures. The policy, a mount option or superblock default, picks the response. Continuing is risky because later writes may build on bad structures. Remounting read-only stops damage and keeps data readable. Panicking suits clusters with failover. In all cases the error is recorded in the superblock so the next mount or checker run knows the volume needs attention.",
    k: ["Remount read-only vs continue: read-only protects the volume and halts the application that was working; continuing keeps services up and risks propagating corruption.", "Panic on error vs remount read-only: panic triggers failover quickly and loses unsaved state; read-only keeps the node alive and degraded."],
    p: ["A policy of continue on a volume with a failing device writes new data around the damage and fills the log.", "Applications that ignore the resulting read-only errors report success to their callers while discarding data."],
    v: "Inject a metadata read error on a test device and confirm that the volume behaves per its configured policy, that the error state is recorded in the superblock, and that the checker reports it at next run.",
    dep: ["metadata-checksums", "superblock", "read-only-fallback", "io-error-handling"]
  },
  "read-only-fallback": {
    s: "The mode into which a volume drops after a severe error: writes fail immediately, reads continue, and the journal or tree is left in the last committed state.",
    d: "On a fatal error the driver aborts the journal or transaction, marks the filesystem read-only, and fails further modifications with an error. Dirty pages that cannot be written stay in memory until discarded. Reads of intact data still work, which lets operators copy data off. Unmounting and checking is the normal recovery. The hard part is the transition itself: in-flight transactions must be abandoned without leaving a half-applied state that the next mount cannot sort out.",
    k: ["Abort the journal at the first error vs finish the current transaction: aborting limits damage and discards recent work; finishing keeps recent changes and may write bad data.", "Failing writes with an error vs blocking them: errors alert applications; blocking hangs processes but avoids data loss from ignored errors."],
    p: ["Dirty data buffered before the failure is silently dropped when the volume is unmounted without a warning to its writer.", "A volume stays read-only after a transient device glitch until someone remounts it, though the device recovered."],
    v: "Force an abort on a test volume, confirm new writes fail with a read-only error while reads succeed, unmount, check, remount and confirm the tree matches the last commit.",
    dep: ["error-policy", "transactions-and-handles", "journal-replay", "writeback"]
  },
  "file-verity": {
    s: "A read-only file mode with a hash tree over its contents, so every page is verified against a signed root hash when read.",
    d: "Enabling the feature builds a Merkle tree over the file, stores it past the end of the data or in metadata, and makes the file immutable. On each page read the driver verifies the page's path up to the root hash, which can be checked against a signature. This gives tamper detection for large files without reading the whole file, which is useful for installed packages and application bundles. The root hash can be reported to user space for attestation. It conflicts with writing, so it suits only finalized content.",
    k: ["A Merkle tree vs a single whole-file hash: the tree verifies pages on demand at the cost of tree storage; a single hash needs reading the entire file first.", "Trust the filesystem's own checksums vs a signed root hash: internal checksums catch random corruption; a signed hash also detects deliberate offline modification."],
    p: ["Enabling it on a file that is being written produces a tree over inconsistent contents and the file is unusable.", "Verification failures on a page surface as read errors in the middle of a memory-mapped execution, with confusing symptoms."],
    v: "Enable the mode on a file, read it successfully, modify one byte directly on the device and confirm that a read of that page now fails with an integrity error while other pages still read.",
    dep: ["page-cache-mapping", "inode-flags", "extent-mapping"]
  },
  "page-cache-mapping": {
    s: "The per-file index of cached pages, with the filesystem supplying the operations to fill a page from disk, write it back, and map file offsets to blocks.",
    d: "Each inode owns an address space holding its cached pages, indexed by offset. The filesystem provides a small operations table: read a page, write pages, prepare and finish a write, invalidate, and map a logical block to a physical one. Pages carry state bits such as dirty and under writeback. Larger multi-page folios reduce overhead. The filesystem tracks per-block state inside a folio when blocks are smaller than it. The difficulty is locking order between page locks, transaction handles and allocation.",
    k: ["Using the shared page cache vs a private buffer cache: sharing gives unified memory management and mmap support; a private cache offers more control and duplicates every policy.", "Large folios vs single pages: large folios cut per-page overhead and make per-block state tracking more elaborate."],
    p: ["Taking a page lock and then starting a transaction, when another path does the reverse, deadlocks under memory pressure.", "A folio partly dirty at block granularity written back whole writes unneeded data and amplifies I/O."],
    v: "Read a file twice and confirm via statistics that the second read causes no device I/O; truncate the file and confirm a subsequent read of the removed range returns zeros with no cached pages left.",
    dep: ["extent-mapping", "inode-structure", "block-io-submission"]
  },
  "buffered-read-path": {
    s: "Serves a read from the page cache, filling missing pages by mapping the offset to blocks and submitting I/O, then copies data to the caller.",
    d: "The generic read function looks up pages in the file's cache. For a miss it calls the filesystem to map the offset, builds a bio for the block run and waits on it. Hits copy directly. A short read at end of file stops at the size recorded in the inode. For compressed, encrypted or checksummed files, the data goes through post-read processing before the page is marked valid, often on a separate work queue. Holes read as zeros without I/O.",
    k: ["Synchronous fill on miss vs asynchronous only: a synchronous fill gives simple semantics and stalls the caller; relying on readahead alone hides latency for sequential access only.", "Verifying and decrypting in interrupt context vs a work queue: work queues allow sleeping and heavier algorithms and add scheduling latency to every read."],
    p: ["Reading pages while a concurrent truncate frees their blocks, without proper locking, returns data from reallocated blocks.", "A read on a failing device blocks the caller for the device's long timeout, which looks like a hang."],
    v: "Drop caches, read a file and confirm with a block trace that the I/O matches the file's extents; read it again and confirm no device requests and identical bytes returned.",
    dep: ["page-cache-mapping", "extent-mapping", "readahead", "block-io-submission", "data-checksums"]
  },
  "readahead": {
    s: "Detects sequential or strided access and fetches upcoming pages before they are requested, in sizes that grow while the pattern holds.",
    d: "The cache keeps per-open-file state: the last window and its size. When a read hits a page marked as the trigger, a new asynchronous window is submitted, doubling up to a limit. Random access shrinks it to nothing. The filesystem helps by mapping ranges in a single call and issuing large bios. Hints from applications can force or disable it. It is hard to tune: too much wastes memory and bandwidth, too little leaves latency exposed.",
    k: ["Adaptive windows vs fixed sizes: adaptive tracks the workload but guesses wrong at pattern changes; fixed is predictable and fits one workload only.", "File-level vs device-level readahead: file level knows logical order; device level sees physical locality and cannot know what will be asked next."],
    p: ["Aggressive readahead on a small-memory machine evicts useful pages and slows everything.", "Fragmented files turn one logical readahead window into many small physical requests, defeating its purpose."],
    v: "Read a large file sequentially with and without readahead enabled, and confirm via block trace that request sizes grow to the window limit when enabled and that throughput increases.",
    dep: ["page-cache-mapping", "extent-mapping", "block-io-submission"]
  },
  "buffered-write-path": {
    s: "Copies written data into the page cache, marks pages dirty, updates size and times, and defers disk I/O to writeback.",
    d: "The write call prepares each page, reading it first if only part of it will be overwritten, copies the user data, and marks it dirty. The filesystem is called before and after to reserve space, begin a transaction for metadata such as size change, and record delayed-allocation state. Writes beyond the current size zero the gap. No device I/O happens unless memory pressure or throttling intervenes. The cost to the caller is a memory copy; the hard part is guaranteeing that a successful write will not later fail for lack of space.",
    k: ["Reading a partial page before overwriting vs tracking valid sub-ranges: reading is simple and costs an I/O; sub-range tracking avoids it and complicates writeback.", "Reserving space at write time vs at writeback: reserving early lets write return out-of-space promptly; reserving late is faster and can lose data silently."],
    p: ["A write that succeeds into cache and later fails at writeback reports the error only on a later fsync, which many programs never call.", "Appending small writes with transactions per call produces heavy journal traffic."],
    v: "Write 100 MB to a new file and confirm the call returns in memory-copy time with the device idle, that the dirty counter rises, and that after sync the on-disk size matches.",
    dep: ["page-cache-mapping", "delayed-allocation", "space-reservation", "transactions-and-handles", "dirty-throttling"]
  },
  "writeback": {
    s: "Background threads that write dirty pages and dirty metadata to storage on a timer, on memory pressure or on request, in an order that favors the device.",
    d: "Per-device flusher threads scan dirty inodes by age, call the filesystem to write ranges, and clear dirty state on completion. With delayed allocation, this is where blocks are chosen, so the filesystem sees a whole batch and can allocate contiguously. Metadata is written by the journal or tree commit rather than directly. Completion handlers convert unwritten extents, update sizes and release reservations. Errors are recorded on the mapping for later reporting. Ordering with other writes is the main source of subtlety.",
    k: ["Time-based vs pressure-based flushing: time-based bounds data age and loss on crash; pressure-based maximizes batching and leaves recent data at risk longer.", "Per-inode ordering vs a global elevator: per-inode keeps files contiguous; global sorting reduces seeks across files and breaks fairness."],
    p: ["Writeback holding a transaction open while waiting on a page lock another thread holds deadlocks the commit.", "A writeback error is cleared after being reported once, and a later fsync may then report success for lost data."],
    v: "Write a file and watch the dirty counter fall to zero within the configured expire interval, with a block trace showing the data written in large, mostly contiguous requests.",
    dep: ["page-cache-mapping", "delayed-allocation", "block-io-submission", "transactions-and-handles", "dirty-throttling"]
  },
  "dirty-throttling": {
    s: "Slows writers by sleeping them in the write path when dirty memory exceeds a threshold, so cache fill cannot outrun the device.",
    d: "The memory manager tracks dirty pages globally and per device, with thresholds as fractions of memory. As dirty data approaches the limit, writers are delayed in proportion, using each device's measured write speed to decide. The filesystem interacts by accounting metadata or journal credits and by marking pages dirty only when it can write them. Without throttling a process writing at memory speed would exhaust RAM. The hard part is fairness between a fast and a slow device sharing one global limit.",
    k: ["Per-device limits vs a global limit: per-device limits keep one slow disk from stalling writers to a fast one; a global limit is simpler and lets a slow device block everyone.", "Smooth delays vs hard blocking at the limit: smooth delays give steady latency; hard limits cause stalls that look like freezes."],
    p: ["A slow USB device with a large global dirty limit stalls unrelated writes to the main disk.", "Journals that block waiting for writeback while writeback waits on the journal cause multi-second system stalls."],
    v: "Write steadily to a slow device while timing small writes to a fast one, and confirm that the fast device's latency stays low and the slow writer's rate matches the device's measured speed.",
    dep: ["page-cache-mapping", "writeback", "buffered-write-path"]
  },
  "direct-io": {
    s: "Reads and writes that bypass the page cache and move data between user memory and the device, with alignment rules and the filesystem still providing the block map.",
    d: "The request is mapped to blocks and submitted straight from the caller's pages. Overwrites of allocated blocks are simple; writes that extend a file, fill a hole or need allocation take stronger locks and may convert unwritten extents on completion. Because the cache is bypassed, cached pages for the range are flushed and invalidated first. Databases use it to manage their own caching. Alignment requirements follow the device's logical block size, and the filesystem may fall back to buffered for unaligned cases.",
    k: ["Shared locking for overwrites vs exclusive locking always: shared allows parallel writers to different offsets; exclusive is simple and serializes.", "Falling back to buffered on unsupported cases vs failing: fallback keeps the application working and hides performance and ordering differences; failing is honest and breaks callers."],
    p: ["Mixing buffered and direct I/O on the same file reads stale cache or writes data that the cache then overwrites.", "A copy-on-write file written with direct I/O still gets new blocks on each write, so the expected in-place performance never appears."],
    v: "Write a file with direct I/O, confirm via cache statistics that no pages were cached, drop caches and read the data back unchanged, and check that a misaligned request either falls back or fails as documented.",
    dep: ["extent-mapping", "block-io-submission", "page-cache-mapping", "extent-allocator"]
  },
  "mmap-faults": {
    s: "Maps file pages into a process, loading them on first access and writing dirty ones back, with the filesystem making sure space exists before a store is accepted.",
    d: "A page fault on a mapped file asks the filesystem to read the page, as with a buffered read, and maps it into the process. A write fault on a page must make the page dirty and ensure that blocks are reserved, because there is no write call to return an error to. After the fault, the first store marks the page dirty via a notification hook. Truncation must unmap pages beyond the new end. The challenge is the lock order between the process's memory lock, the file's invalidation lock and the page lock.",
    k: ["Reserving blocks at write fault vs failing later at writeback: reserving at fault delivers an error as a signal immediately; later failure loses data silently.", "A per-file invalidation lock vs per-page protection: one lock makes truncate versus fault simple and blocks faults during hole punch."],
    p: ["Sparse file mapped, volume fills up, then a store faults and the process gets a bus error far from the cause.", "A page modified during writeback with checksumming enabled gets written with a mismatching checksum."],
    v: "Map a sparse file, store to pages across it with the volume nearly full, and confirm each store either succeeds with data persisted after sync or fails immediately with a signal.",
    dep: ["page-cache-mapping", "space-reservation", "extent-mapping", "fallocate-and-punch"]
  },
  "fsync-path": {
    s: "Forces one file's data, and the metadata needed to find it, to durable storage before returning, and is the call applications rely on for crash safety.",
    d: "The call writes the file's dirty pages, waits for completion, then makes the needed metadata durable. A journaling design forces the transaction containing the file's changes to commit and issues a cache flush. A copy-on-write design either commits the whole tree or writes a small per-file log and replays it at mount. Data-only variants skip metadata like timestamps. Newly created files also need their directory entry durable, which a separate call on the directory covers. Cost is dominated by flushes and by what other work the commit drags along.",
    k: ["Committing a full transaction vs a per-file fast path: full commits are simple and make fsync slow when other files are busy; fast paths are quick and add a replay format.", "Flushing metadata on a data-only sync vs skipping it: skipping saves a commit but must still persist size changes to avoid data being unreachable."],
    p: ["Calling fsync on a file but not its parent directory loses the file's name after a crash.", "On storage with a volatile write cache and flushes disabled, fsync returns without data being durable."],
    v: "Write, fsync and cut power repeatedly using a fault-injection device that drops unflushed writes, confirm that after each recovery every acknowledged write is present with the correct contents.",
    dep: ["commit-and-checkpoint", "barriers-and-flushes", "writeback", "fsync-log-tree", "data-ordering-modes"]
  },
  "fallocate-and-punch": {
    s: "System calls that preallocate space, zero or collapse ranges, and punch holes, changing a file's mapping without writing the data.",
    d: "Preallocation marks extents as allocated but unwritten, so reads return zeros and later writes need no allocation. Punch hole frees blocks in a range inside the file. Collapse and insert range shift later data by removing or adding blocks, rewriting the mapping, and must be block-aligned. Zero range converts to unwritten extents. All of them need the file's invalidation lock and page cache cleanup. Copy-on-write designs treat preallocation weakly, since later writes allocate anew anyway.",
    k: ["Unwritten extents vs writing real zeros: unwritten is instant and needs a state bit and conversion at write completion; zeros are simple and cost I/O and wear.", "Honoring preallocation in copy-on-write designs vs treating it as a hint: honoring promises space that a later overwrite cannot use; treating it as a hint is cheap and breaks the reservation expectation."],
    p: ["Punching a hole in a range that is shared with a snapshot frees nothing, so space does not return as expected.", "Collapse or insert range on non-aligned offsets fails, and callers rarely handle that error."],
    v: "Preallocate 1 GB, read it back as zeros, punch a hole in the middle, and confirm allocated blocks drop by the hole size while the file length stays constant.",
    dep: ["extent-mapping", "preallocation", "sparse-files", "page-cache-mapping"]
  },
});
