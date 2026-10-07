// Details for the filesystem plate, part 4: on-disk structures, devices and volumes, cross-cutting concerns.
ATLAS.details("filesystem", {
  "superblock": {
    s: "The fixed-location record describing the whole volume: magic number, geometry, feature flags, counters, state flags, identifiers and pointers to the root structures.",
    d: "It sits at a known offset, after space reserved for boot code, so tools can identify and probe the volume without help. Fields include block size, block and inode counts, group size, feature masks, the UUID and label, mount counts, last error and a checksum. The driver caches it in memory and writes it back when counters or state change. Free counts in it are advisory in many designs and are rebuilt by the checker. It is the first thing read at mount and the one structure that must always be valid.",
    k: ["Authoritative counters in the superblock vs derived from groups: stored counters give instant statistics and are rewritten constantly; derived counters keep the superblock quiet and mount slower.", "Fixed offset vs discoverable location: a fixed offset makes probing trivial; a movable one allows growth and complicates every tool."],
    p: ["Writing the superblock with stale in-memory counters after a crash makes free-space reports wrong until the next check.", "A volume whose magic coincides with another format's signature is misidentified by probing tools."],
    v: "Dump the superblock of a freshly made volume, confirm magic, geometry, feature masks and checksum are valid, mount and unmount, and confirm the state field toggles between in-use and clean.",
    dep: ["feature-flags", "metadata-checksums"]
  },
  "backup-superblocks": {
    s: "Copies of the superblock and group descriptors at known positions across the volume, used by the checker to recover when the primary copy is damaged.",
    d: "Copies are placed in selected groups, often those numbered as powers of small integers, so few exist on large volumes and the overhead stays small. They are written at creation and refreshed by the checker and by resize, not on every update, so counters in them are stale. The checker, given the location, reads a backup and rebuilds the primary. A sparse placement scheme reduces the cost of descriptor copies, while a different layout puts a copy at each end of the device.",
    k: ["Sparse copies vs a copy in every group: sparse saves space and leaves few recovery points; full copies are robust and waste capacity on large volumes.", "Updating backups at each change vs only at maintenance: constant updates keep them fresh and double the metadata writes; maintenance-only updates leave them stale and cheap."],
    p: ["A backup taken before a feature was enabled makes recovery from it a volume that has lost that feature's metadata.", "Tools that look for backups at the wrong group numbers cannot find them on a custom layout."],
    v: "Overwrite the primary superblock on a test image, run the checker with the backup location and confirm it restores the volume and a following mount shows all files intact.",
    dep: ["superblock", "group-descriptors", "fsck-checker"]
  },
  "group-descriptors": {
    s: "A table with one record per allocation group giving the locations of its bitmaps and inode table, free counts, flags and checksum.",
    d: "The table follows the superblock and may span many blocks. Each record names where the group's block bitmap, inode bitmap and inode table live, which lets groups be laid out flexibly, for example packing all bitmaps together to speed mount. Counters in the descriptor drive allocation heuristics. Flags mark a group's tables as uninitialized, so mkfs can skip them. For growing volumes, space after the table may be reserved for expansion, or the table can be split into meta groups.",
    k: ["Packing group metadata together vs placing it in each group: packing speeds scans and mount; per-group placement keeps a group's metadata near its data.", "Reserving descriptor growth space vs relocating the table: reservation makes growth cheap and caps it; relocation allows unbounded growth with a complex resize."],
    p: ["A descriptor with a wrong inode table location sends every inode read for that group to the wrong blocks.", "Uninitialized-group flags that disagree with the actual contents make the driver trust garbage."],
    v: "Print the descriptor table of a test volume, check each referenced bitmap and table address falls in range and the free counts equal the sums that the checker recomputes from bitmaps.",
    dep: ["superblock", "allocation-groups", "metadata-checksums"]
  },
  "inode-table": {
    s: "The array of fixed-size inode records, divided across groups, indexed by inode number to find any file's metadata with one computed address.",
    d: "An inode number maps to a group and an offset: group is the number divided by inodes per group, offset is the remainder times inode size. The driver reads the block containing that record and caches it. Records are 128 to 512 bytes. Large tables take time to initialize, so groups may flag them as zeroed lazily. Checking walks every record. Dynamic designs replace the array with inode chunks found through a tree, which removes fixed limits and the arithmetic.",
    k: ["Fixed array with computed addresses vs a keyed index: arithmetic needs no lookup and fixes the inode count; an index is flexible and adds a tree lookup per inode.", "Larger records vs smaller: larger ones hold timestamps, inline data and attributes in the inode; smaller ones waste less on files that need none of it."],
    p: ["Reading inodes in an uninitialized table region returns leftover bytes from earlier use of the device.", "An inode table placed far from the data it describes makes metadata-heavy workloads seek constantly."],
    v: "Compute the address of inode 12345 from the superblock and descriptor fields, read it from the raw device, and confirm it decodes to the same owner and size that stat reports.",
    dep: ["inode-structure", "group-descriptors", "allocation-groups"]
  },
  "inode-structure": {
    s: "The record for one file: type and mode, owner, link count, size, timestamps, flags, the block map or extent root, and space for extra fields and inline attributes.",
    d: "A fixed prefix holds the classic fields. An extra area, whose size is recorded in the inode, holds additional timestamps, a creation time, project ID and inline attributes. The mapping area, typically sixty bytes, contains either an extent tree root or an older block map, or inline data for tiny files and short symlinks. A generation field distinguishes reuse of a number. A checksum covers the whole record. The record is the unit read, cached, locked and journaled.",
    k: ["Self-describing extra size vs fixed layout: a recorded extra size lets old and new drivers coexist; a fixed layout is simpler to parse and cannot be extended.", "Checksum over the whole inode vs per field: whole-record checksums are cheap and mean every update recomputes; per-field would reduce rewrites and add bookkeeping."],
    p: ["Updating a field outside the transaction, for example the size during writeback, leaves the checksum stale on disk after a crash.", "Trusting the extra-size field without a bound lets a corrupt value point into the next inode."],
    v: "Dump an inode and verify every field against stat output, including size, link count, times and the root of the mapping, then check that the checksum validates.",
    dep: ["extent-mapping", "metadata-checksums", "feature-flags"]
  },
  "extent-mapping": {
    s: "The mapping from a file's logical block ranges to physical block ranges, each entry describing a contiguous run with a start, length and state.",
    d: "An extent is a logical start, a length and a physical start, plus a flag for unwritten preallocated ranges. A small file's extents fit in the inode; larger ones extend into a tree. Lookup finds the extent covering an offset by binary search; a gap means a hole. The maximum extent length depends on the field width, so very large files need many extents even if contiguous. Writes allocate extents, merge neighbors and split them on punch or overwrite in copy-on-write designs.",
    k: ["Extents vs per-block maps: extents are compact for contiguous files and cost more when fragmented; per-block maps are uniform and heavy for large files.", "Flagging unwritten extents in the mapping vs tracking elsewhere: in the mapping keeps one structure and requires conversion work at write completion."],
    p: ["A merge that combines extents across a flag boundary makes unwritten data readable as if it were real.", "Highly fragmented files make the mapping itself a tree many levels deep, slowing every lookup."],
    v: "Create a file with known holes, written and preallocated ranges, dump its mapping, and confirm each range's state against the actual read results, including zeros from the preallocated area.",
    dep: ["inode-structure", "extent-tree-nodes", "block-size-and-clusters"]
  },
  "extent-tree-nodes": {
    s: "The B-tree that holds a file's extents when they do not fit in the inode: an index of interior nodes and leaves, each with a header and checksum.",
    d: "The root is in the inode and contains a header with entry count and depth, followed by either index entries pointing to child blocks or leaf entries holding extents. Nodes are blocks, which makes a fan-out of hundreds. Inserting into a full leaf splits it, possibly growing the tree. Removing entries merges or leaves them sparse. In an update-in-place design the tree is journaled; in a copy-on-write design a change copies the path. Depth stays low even for huge files.",
    k: ["Block-sized nodes vs small nodes: block-sized nodes give high fan-out and shallow trees and cost more to rewrite for one extent change; small nodes rewrite less.", "Lazy merging on delete vs eager rebalancing: lazy is simpler and leaves sparse nodes; eager keeps density and risks more writes."],
    p: ["A root header whose depth does not match the real tree makes lookups walk into data blocks as if they were nodes.", "Splits at the tree root, if not journaled with the inode update, orphan the new subtree on a crash."],
    v: "Fragment a large file into tens of thousands of extents, then check that the tree depth is no more than three, every node's checksum validates and a full read returns the original contents.",
    dep: ["extent-mapping", "metadata-checksums", "transactions-and-handles"]
  },
  "legacy-block-maps": {
    s: "The older mapping where an inode holds direct block pointers and chains of single, double and triple indirect blocks, one pointer per block of data.",
    d: "Twelve or so direct pointers cover small files; one pointer leads to a block of pointers, another to a block of blocks of pointers, and so on. Lookup is a few reads, and sequential data gets no per-extent compression. Truncating a big file walks every pointer, which is slow. The scheme is simple and uniform, requires no split logic and wastes metadata on large files. It remains in the format for old volumes, and tools must read it and convert to extents.",
    k: ["Indirect maps vs extents: indirect maps are uniform and need no merge logic; extents are far smaller and faster for large contiguous files.", "Keeping legacy support in the driver vs requiring conversion: keeping it reads old volumes and doubles code paths forever; requiring conversion is cleaner and forces downtime."],
    p: ["Deleting a multi-terabyte file on an indirect-map volume holds locks for a long time while every pointer is freed.", "Mixed maps across a volume mean performance varies by file age in ways that surprise operators."],
    v: "Create a 100 GB sparse file on a legacy-format test volume, truncate it and time the operation, then convert the volume and repeat to see the difference in time and metadata blocks used.",
    dep: ["inode-structure", "block-size-and-clusters"]
  },
  "block-size-and-clusters": {
    s: "The allocation unit chosen at creation, typically 1 to 64 KiB, and optionally a larger cluster that groups several blocks for allocation of big files.",
    d: "Block size sets the smallest allocation, the number of bitmap bits and the granularity of the page cache mapping. Larger blocks reduce metadata and fragmentation and waste space on small files. The maximum is bounded by the memory page size in most drivers. Bigalloc-style clusters allocate in groups of blocks while keeping a smaller block for addressing, trading internal waste for much smaller bitmaps. Block size cannot change without recreating the volume, and every limit, such as maximum file and volume size, is derived from it.",
    k: ["Small vs large blocks: small blocks waste less on many small files and enlarge metadata; large blocks help throughput and waste space in tails.", "Clusters vs plain large blocks: clusters keep small-block addressing and shrink free-space metadata, at the cost of allocation complexity and wasted partial clusters."],
    p: ["A block size larger than the memory page size is unmountable on drivers that cannot map such blocks.", "Choosing block size for a volume of small files at the default wastes a large share of space in tails."],
    v: "Create volumes with different block sizes, write ten thousand 1 KiB files to each, and compare used space and metadata blocks to confirm the predicted waste and the maximum file size limits.",
    dep: ["superblock", "extent-mapping", "free-space-bitmaps"]
  },
  "reserved-inodes": {
    s: "A block of low inode numbers set aside for the filesystem's own use: bad blocks, the root directory, the journal, quota files, resize and the lost-and-found.",
    d: "The first dozen or so inodes are never given to user files. They are ordinary inodes whose contents are system structures: one holds the journal, one the quota records, one the resize reservation, one the root directory at a conventional number. Treating internal structures as files means the same read, write, block-map and checksum code serves them. The first usable user inode number is recorded in the superblock. Tools must never move or free them.",
    k: ["Internal structures as inodes vs special-purpose records: using inodes reuses mapping, caching and checking code; special records can be tighter and need new code.", "Fixed well-known numbers vs numbers recorded in the superblock: fixed numbers are simple to find and constrain the layout; recorded numbers are flexible and need lookup."],
    p: ["A checker that clears a reserved inode as unreferenced destroys the journal or the quota data.", "User tools creating a file that lands on a reserved number after a bug corrupt internal state."],
    v: "List the reserved inodes of a fresh volume, confirm each has the expected type and size, and that the journal inode's mapping covers the journal size recorded in the superblock.",
    dep: ["inode-table", "superblock", "journal-format"]
  },
  "root-and-lost-found": {
    s: "The root directory at a fixed inode number from which all paths start, and a lost-and-found directory where the checker reattaches files found without a name.",
    d: "At creation the tool allocates the root inode, makes it its own parent and gives it a mode and ownership. A lost-and-found directory is created with several blocks preallocated, so the checker can add entries even when the volume is full. During repair, inodes that have a link count but no directory entry are linked there under their inode number. The root being damaged is the worst case: the checker must rebuild it and relink children.",
    k: ["Preallocated space in lost-and-found vs allocating on demand: preallocation guarantees repair can succeed when the volume is full; on demand wastes nothing and can fail.", "Fixed root inode number vs recorded in the superblock: fixed is trivial to find; recorded permits other layouts."],
    p: ["Deleting lost-and-found removes the room repair needs, and the checker then fails on a full volume.", "A root inode with the wrong type makes every path lookup on the volume fail."],
    v: "Damage a directory entry on a test image so a file becomes unreachable, run repair, and confirm the file appears in lost-and-found under its inode number with its contents intact.",
    dep: ["reserved-inodes", "directory-entries", "repair-pass"]
  },
  "block-io-submission": {
    s: "Converting file-level reads and writes into block requests, merging adjacent ones and handing them to the block layer with flags that express ordering and priority.",
    d: "The filesystem builds a request descriptor for a run of pages mapped to contiguous disk blocks, tagging flags such as metadata, synchronous, flush or forced unit access. The block layer merges, schedules and dispatches them to the driver. Completion callbacks run later, in interrupt or work-queue context, and the filesystem uses them to end writeback, convert extents and verify checksums. Splitting at device or stripe boundaries happens here. The hard part is making sure no completion handler blocks and that the error is propagated.",
    k: ["Large merged requests vs small low-latency ones: large requests maximize throughput; small ones favor latency for synchronous metadata.", "Completion in interrupt context vs deferred to a work queue: interrupt context is fast and cannot sleep; work queues allow heavy post-processing at a latency cost."],
    p: ["Marking metadata writes as low priority lets background data starve the journal and stall the commit.", "Completion handlers that take sleeping locks in interrupt context deadlock or crash."],
    v: "Trace block requests during a sequential write and an fsync, confirm contiguous data merges into large requests, journal writes carry the flush flags and completions arrive in the order the filesystem expects.",
    dep: ["extent-mapping", "multi-device-layout"]
  },
  "multi-device-layout": {
    s: "How one filesystem spans several devices: a device list in the superblock, a mapping from logical addresses to device and offset, and per-chunk profiles.",
    d: "Each device carries a superblock naming the set it belongs to. The driver builds a map from the logical address space to physical stripes: a chunk of logical space maps to one or more device extents according to a profile, such as single, striped, mirrored or parity. Metadata and data may use different profiles. All upper layers address logical blocks and the mapping layer resolves them at submission. Scanning for member devices at boot, and refusing to mount when some are missing, are important behaviors.",
    k: ["Mapping layer inside the filesystem vs an external volume manager: internal mapping lets the filesystem choose profiles per file type and heal from checksums; external is generic and opaque to the filesystem.", "Per-chunk profiles vs one profile per volume: per-chunk allows data and metadata to differ and makes conversion incremental, and makes capacity reporting complicated."],
    p: ["Mounting with a missing member device without a degraded flag fails, and mounting degraded can then write to a single copy.", "Two devices with the same identifier from a cloned disk are mistaken for one another, and the wrong one is written."],
    v: "Create a volume over three devices, write files, unplug one device in a mirrored profile, mount degraded and confirm all files read back with matching checksums.",
    dep: ["superblock", "raid-profiles", "block-io-submission"]
  },
  "raid-profiles": {
    s: "Redundancy and striping schemes selectable per data type: single copy, striping, mirroring with two or more copies, and single or double parity.",
    d: "Striping spreads consecutive chunks of data over devices for throughput. Mirroring writes each block to several devices and can read from either. Parity schemes store computed parity so that one or two device losses can be reconstructed. Because the filesystem knows checksums, it can tell which mirror copy is good, and during reconstruction knows which blocks are in use. Small parity writes need a read-modify-write, and a crash between data and parity writes leaves inconsistent stripes, the write hole.",
    k: ["Mirroring vs parity: mirroring has simple, fast writes and costs capacity; parity saves capacity and makes small writes slow and exposes the write hole.", "Filesystem-level vs hardware or lower-layer RAID: filesystem-level can verify and repair using checksums; lower layers are filesystem-independent and cannot identify which copy is right."],
    p: ["A power failure during a parity update corrupts a stripe that held unrelated, already-committed data.", "Rebuilding after a failure reads every surviving device, stressing aging drives that may fail in turn."],
    v: "Write a checksummed dataset to a mirrored volume, corrupt one copy and remove another device, and confirm the data reads back correctly from the remaining good copy and a scrub restores redundancy.",
    dep: ["multi-device-layout", "data-checksums", "self-healing-reads"]
  },
  "device-add-remove": {
    s: "Online operations that add a device to a mounted volume, extending capacity, or remove one by moving its data elsewhere first.",
    d: "Adding writes a superblock to the new device, registers it, and makes its space available for new chunks; an optional rebalance spreads existing data. Removing first relocates every chunk off the device onto others, which needs enough free space on remaining devices to satisfy the current profile, then forgets the device. Both change the device list in the primary superblock and in all members, atomically with respect to crashes. Capacity reports must account for the profile's overhead.",
    k: ["Rebalancing immediately after an add vs leaving old data in place: rebalancing evens load and wear and costs hours of I/O; leaving it is free and unbalanced.", "Allowing removal that downgrades redundancy vs refusing: allowing it is flexible and silently reduces protection; refusing is safe and forces an explicit conversion first."],
    p: ["Removing a device from a mirrored pair of two without converting leaves a volume with no redundancy while appearing healthy.", "A removal that runs out of space on the remaining devices fails after hours of work."],
    v: "Add a device to a full test volume, write new data and confirm it lands on the new device; then remove an old device and confirm that all data was moved with checksums matching a prior manifest.",
    dep: ["multi-device-layout", "relocation-and-balance", "superblock", "raid-profiles"]
  },
  "device-replace": {
    s: "Copies the contents of a failing or old device to a new one while the volume stays in use, reading from other copies where the source is unreadable.",
    d: "The new device is attached as a target of the old. All writes go to both, while a background pass copies existing data, preferring the source but reconstructing from redundancy if blocks fail to read. When copying is done the roles swap in the device list, and the old device is released. It avoids the double rebuild of remove-then-add and keeps redundancy throughout. Progress is checkpointed so it survives a reboot. The new device must be at least as large.",
    k: ["Replace in place vs add then remove: in place keeps full redundancy and moves data once; add-then-remove rebalances and moves most data twice.", "Reading from the failing source first vs always from other copies: the source is fastest and risks long error timeouts; other copies are slower and put load on healthy devices."],
    p: ["A source with slow error recovery stalls the replace for days on bad sectors.", "Writes that fail on the new device during replacement abort it, and the volume stays dependent on the old one."],
    v: "Start a replace with writes running, interrupt and reboot partway, confirm it resumes and completes, then check the old device is no longer a member and all files verify against their checksums.",
    dep: ["multi-device-layout", "raid-profiles", "self-healing-reads", "scrub-and-balance-cli"]
  },
  "volume-management-layer": {
    s: "A logical-volume layer below the filesystem that provides resizable, striped, mirrored or thin-provisioned virtual devices, which the filesystem treats as ordinary block devices.",
    d: "A mapping table translates virtual device addresses to physical extents on one or more disks. Volumes can grow by appending extents, mirrored for redundancy, or provisioned thinly with a pool and metadata that tracks which blocks are allocated. Snapshots at this layer copy blocks on first write. The filesystem on top knows nothing about this: it cannot choose which copy is good, and discards must be passed through for thin pools to reclaim space. Alignment of filesystem structures to stripe size matters.",
    k: ["Separate volume manager vs integrated management: separate lets any filesystem use it and loses filesystem-aware repair; integrated can heal and balance with knowledge of the data.", "Thin provisioning vs fixed allocation: thin allows overcommit and flexible growth; fixed is predictable and wastes capacity."],
    p: ["An overcommitted thin pool fills and every volume on it starts failing writes at once, with filesystems seeing I/O errors.", "A filesystem not aligned to the stripe size turns every full-stripe write into read-modify-write."],
    v: "Create a thin volume over a small pool, format it, write and delete files, run trim and confirm the pool's usage drops accordingly, and confirm the filesystem reports no errors.",
    dep: ["block-io-submission", "discard-and-trim", "mkfs-tool"]
  },
  "zoned-device-support": {
    s: "Support for devices whose zones must be written sequentially and reset as a unit, requiring append-only allocation and garbage collection in the filesystem.",
    d: "Zones allow writing only at the write pointer; overwriting requires resetting the whole zone. A copy-on-write design fits naturally: new data is written at the pointer, and old blocks become garbage. The allocator tracks a pointer per zone and fills zones in order; reclaim picks mostly-dead zones, moves the live data and resets them. Some zones are conventional and hold the superblock. Writes use zone append so the device picks the address, which the filesystem learns from completion. Metadata cannot be updated in place.",
    k: ["Native zoned support vs a translation layer below: native avoids a second garbage collector and constrains the filesystem; a translation layer is transparent and has write amplification of its own.", "Few large open zones vs many small ones: few zones give sequential throughput and limit parallelism; many allow parallel streams within the device's open-zone limit."],
    p: ["Exceeding the device's limit on open zones fails writes, which looks like a spurious I/O error.", "Reclaim that cannot keep up with deletions lets zones fill with dead blocks until the volume reports full."],
    v: "Fill and delete data on an emulated zoned device, confirm every write lands at its zone's write pointer, trigger reclaim and verify zone resets occur with all live files intact.",
    dep: ["cow-btrees", "extent-allocator", "block-group-reclaim", "block-io-submission"]
  },
  "flash-awareness": {
    s: "Allocation and write policies tuned for solid-state media: fewer small random overwrites, aligned writes, spread of wear, and discard support.",
    d: "Flash erases large blocks and writes small pages, so the device remaps internally. Filesystem choices that help are aligned allocation to erase size, grouping hot and cold data apart, avoiding unnecessary metadata updates and issuing trim. Log-structured filesystems built for flash append and clean segments in the same way as the device's own translation layer, which creates double garbage collection. Raw flash without a controller needs wear leveling and bad-block handling inside the filesystem itself.",
    k: ["Log-structured layout vs update-in-place on flash: log-structured writes sequentially and cleans segments, adding write amplification; update in place is simple and causes random small writes.", "Relying on the device translation layer vs managing flash directly: relying is portable and opaque; direct control reduces amplification and needs wear and bad-block code."],
    p: ["Frequent small fsyncs on consumer flash produce high write amplification and shorten device life.", "Journal or log areas rewritten in place concentrate wear if the device translation layer is poor."],
    v: "Run a small-random-write workload, read the device's wear or write counters before and after, and compare host bytes written to media bytes written to estimate the amplification for each configuration.",
    dep: ["discard-and-trim", "extent-allocator", "block-io-submission"]
  },
  "io-error-handling": {
    s: "How read and write failures from the device are classified, retried, reported to callers and turned into a volume state, including media errors, timeouts and missing devices.",
    d: "The block layer reports an error code per request after its own retries. The filesystem decides: for a read, try another copy or return an I/O error; for a metadata write, abort the transaction and apply the error policy; for a data write, record an error on the file's mapping so a later fsync reports it. Missing devices in a multi-device volume change the profile's state to degraded. Counters per device track read, write, flush and corruption errors for monitoring.",
    k: ["Retrying in the filesystem vs trusting lower-layer retries: filesystem retries cover transient faults and compound long device timeouts; relying on lower layers keeps policy in one place.", "Marking a device failed after a threshold vs after the first error: threshold rides out noise and keeps a bad device in use; first-error removal protects data and loses redundancy early."],
    p: ["A write error on a data page is reported once and is gone, so a later fsync can return success for lost data.", "Long device timeouts block the commit thread, which blocks every writer on the volume."],
    v: "Inject a write error on one block of a test device, confirm the issuing fsync returns an error, per-device error counters increment, and that the volume behaves according to the configured policy.",
    dep: ["block-io-submission", "error-policy", "raid-profiles"]
  },
  "crash-consistency-model": {
    s: "The decision about which states a crash may leave behind, and therefore which invariants every metadata update, ordering rule and recovery step must preserve.",
    d: "Designs choose how strong a promise to make: metadata is consistent but data may be stale; data and metadata change together; or every committed tree is complete. That choice dictates the mechanism, a journal, soft-update ordering or copy-on-write, and how every operation is structured as one atomic unit. It also defines what applications must do, such as fsync and rename patterns. Verifying it needs fault-injection testing that cuts power at every write boundary, because the failures are rare and silent.",
    k: ["Journal vs copy-on-write as the base mechanism: a journal writes metadata twice and keeps data in place; copy-on-write writes once and gives snapshots and amplification elsewhere.", "Promising stronger guarantees than POSIX requires vs the minimum: stronger guarantees protect sloppy applications and cost throughput permanently."],
    p: ["A model documented as consistent metadata is read by application authors as durable data, and they skip fsync.", "Ordering bugs only appear under particular cut points, so ordinary testing never finds them."],
    v: "Run an automated crash-point test that replays a recorded write stream and cuts it at every position, mounts each prefix and requires a clean check and the documented set of visible states.",
    dep: ["metadata-journaling", "atomic-root-commit", "barriers-and-flushes", "fsync-path"]
  },
  "durability-contract": {
    s: "What a successful write, fsync, rename or close promises about persistence, and the knobs, flush behavior and device assumptions that make the promise real.",
    d: "Returning from write promises only that data is in the cache. Fsync promises that the file's data and the metadata needed to reach it are on stable storage, which depends on the device honoring flushes. Directory operations need their own sync. Mount options can weaken or strengthen all this. Layers beneath, virtual disks and caches, may silently break it. The contract must be stated, tested against power-loss hardware and understood by every layer that handles a flush.",
    k: ["Synchronous metadata operations vs deferred ones: synchronous gives immediate durability and low throughput; deferred is fast and leaves a window of loss.", "Trusting the device's flush vs verifying: trusting is cheap and fails on devices that lie; verifying with power-cut rigs finds liars at high effort."],
    p: ["An application that fsyncs a file but not its directory finds the file missing after a crash.", "A cloud or virtual disk that acknowledges flushes before persisting makes the contract false without any visible error."],
    v: "Using a power-cut rig or a fault-injection device, write and fsync records with sequence numbers, cut power at random, and confirm every acknowledged record is present after recovery.",
    dep: ["fsync-path", "barriers-and-flushes", "commit-and-checkpoint", "mount-options"]
  },
  "locking-and-scalability": {
    s: "How inodes, groups, journals and trees are protected so that many cores can create, read, write and allocate in parallel without deadlock or one global bottleneck.",
    d: "Locks exist at several levels: per-inode for size and mapping, per-group for allocation, per-directory for names, a journal-wide lock for transaction state, and tree node locks in copy-on-write designs. A global ordering prevents deadlock, for example parent before child and the lower inode number first. Scalability comes from splitting locks, per-CPU counters, read-copy-update for lookups, and batching. Hot spots appear as soon as a workload concentrates on one directory, one group or one journal.",
    k: ["Fine-grained locks vs coarse locks: fine-grained locks scale across cores and multiply ordering rules and bugs; coarse locks are simple and serialize.", "Per-CPU allocation pools vs shared state: per-CPU pools avoid contention and make accounting approximate and fragmentation worse."],
    p: ["A single hot directory serializes all creates on one lock regardless of core count.", "Lock order violations between page locks, handles and group locks appear only under memory pressure and lock up the machine."],
    v: "Run parallel create, write and delete workloads on 1 to 64 cores, plot throughput per core count, and use lock statistics to confirm no single lock dominates wait time.",
    dep: ["allocation-groups", "transactions-and-handles", "page-cache-mapping", "cow-btrees"]
  },
  "format-compatibility": {
    s: "The rule set that lets drivers, tools and boot code of different ages share one on-disk format: feature flags, versioning, and the promise to read old volumes.",
    d: "Every on-disk change must say who may still use the volume afterward. Compatible changes allow all software, read-only-compatible ones allow reading, incompatible ones lock out old code. Tools, boot loaders and recovery images age independently of the kernel, and the format is a public contract with all of them. Support for old formats must be kept for decades, which burdens the driver, while new features need to be enabled deliberately and often irreversibly.",
    k: ["Evolving one format vs introducing a new filesystem: evolution preserves users and accumulates legacy code; a new design can fix structural flaws and abandons existing volumes.", "Defaulting new features on vs off: on gives everyone the benefit and risks lock-out of old tools; off is safe and leaves most volumes without it."],
    p: ["A feature enabled by default makes volumes unreadable by the older recovery media the operator relies on.", "A change to the meaning of a reserved field breaks old tools silently, since no flag says that anything changed."],
    v: "Keep a corpus of volumes created by every released version, mount and check each with the current driver and tools in CI, and confirm contents match recorded manifests.",
    dep: ["feature-flags", "format-versioning", "superblock", "mount-negotiation"]
  },
  "corruption-response": {
    s: "The policy for what happens when the filesystem finds a structure it cannot trust: detect, contain, report, repair from redundancy, and decide how much service to keep.",
    d: "Detection comes from checksums, sanity checks on read and cross-structure invariants. Containment decides scope: fail one operation, mark one file bad, go read-only or stop the machine. Reporting reaches logs, counters and the superblock so the next fsck knows. Repair may be automatic from redundant copies, online by a background check, or offline by the checker. The tradeoff runs between availability and risk of making things worse, and the right answer differs between a laptop and a replicated server.",
    k: ["Fail-stop vs continue-degraded: fail-stop prevents spreading damage and takes service down; continuing keeps service and can build on bad metadata.", "Online repair vs offline only: online keeps the volume usable and needs every repair to be safe under concurrent change; offline is simpler and needs downtime."],
    p: ["A system that logs corruption but continues writing fills the disk with data built on bad metadata.", "Automatic repair triggered by a misdiagnosed error rewrites good data from a corrupt copy."],
    v: "Inject each class of corruption (bit flip in data, metadata, bitmap, journal) into test images, and confirm each is detected with a specific log message and handled per policy, with no silent success.",
    dep: ["error-policy", "metadata-checksums", "fsck-checker", "self-healing-reads"]
  },
  "fragmentation-vs-throughput": {
    s: "The tension between laying data out for sequential speed and the costs of doing so: delayed allocation, preallocation, copy-on-write relocation and snapshot sharing all pull layout in different directions.",
    d: "Contiguous files read fast on spinning disks and matter less on flash. Update-in-place designs keep a file where it is; copy-on-write writes every change elsewhere, so random overwrites fragment files unless batched. Sharing extents with snapshots breaks contiguity. Free space shatters under mixed workloads, so even new files fragment as the volume fills. Each design picks heuristics, and the cost shows up months later as slower reads and slower allocation, which makes it hard to evaluate in short tests.",
    k: ["Update in place vs copy-on-write for overwrites: in place preserves layout and needs a log for safety; copy-on-write is atomic and fragments over time.", "Spending effort on layout at write time vs background repair: write-time effort costs latency now; background repair uses idle I/O and cannot keep up under constant load."],
    p: ["Benchmarks on a fresh volume hide the degradation that appears after months of aging.", "Database files on a copy-on-write volume fragment into thousands of extents, and read performance collapses."],
    v: "Age a volume with a realistic workload for a simulated year, then measure sequential read throughput and average extents per file against a fresh copy of the same data.",
    dep: ["extent-allocator", "delayed-allocation", "cow-btrees", "fragmentation-control"]
  },
});
