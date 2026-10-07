// Details for the volume manager plate, part 5: device mapping layer, metadata on disk, physical devices.
ATLAS.details("volume-manager", {
  "mapping-core": {
    s: "The framework that presents virtual block devices and routes each request through a table of targets that translate its address and destination.",
    d: "The core owns the device objects, their tables and their lifecycle: create, load a table, suspend, resume, remove. For each incoming request it finds the target covering the address range, hands the request to it, and completes it when the target is done. It provides services such as splitting at target boundaries, cloning requests, in-flight accounting and a control interface for tools. It is hard because it sits in the path of every I/O, so locking and memory use must be extremely light, and any bug corrupts data under all volumes.",
    k: ["A generic framework with pluggable targets vs separate drivers for each feature: a framework shares tested plumbing and lets layers stack, separate drivers can be tuned and duplicate the hard parts.", "A control interface for tools vs configuration inside the kernel: a tool interface keeps policy out of the kernel, and puts correctness of ordering in user space."],
    p: ["A target that allocates memory in the I/O path under memory pressure deadlocks the host.", "Per-request overhead adds measurable latency on fast flash devices."],
    v: "Create a device with a table of several targets, issue requests across their boundaries, and confirm each lands on the right target at the right offset and that removal leaves no device behind.",
    dep: ["mapping-tables", "target-drivers", "request-cloning-and-splitting", "block-device-interface"]
  },
  "mapping-tables": {
    s: "The ordered list of ranges for a virtual device, each naming a target type, its parameters and the underlying devices and offsets it uses.",
    d: "A table is a sequence of lines: start sector, length, target type and its arguments. The core builds a lookup structure over them, typically a shallow tree of keys, so finding the target for a sector takes a few steps. Tables are loaded inactive and made live atomically. The metadata of a volume is compiled into such a table at activation. It is hard because table text is the common language between tools and kernel, and errors in it, such as gaps or overlapping ranges, are rejected or misroute data.",
    k: ["Many small table entries vs few large ones: small entries express fragmented layouts exactly and slow lookups, large ones are fast and constrain layouts.", "Rebuild the table from metadata each activation vs persist the table: rebuilding keeps one source of truth and costs time at boot, persisting is faster and may drift."],
    p: ["A table with a gap in the range returns errors for that range, found only when something touches it.", "A table loaded from stale metadata points at extents that were freed and reused."],
    v: "Dump a live device's table and compare with the metadata's segments line by line, then read at the first and last sector of each range and confirm each goes to the named underlying device.",
    dep: ["mapping-core", "target-drivers", "logical-volume"]
  },
  "target-drivers": {
    s: "Pluggable modules that implement one kind of mapping: linear, striped, mirror, parity, thin, snapshot, cache, encryption, integrity or error.",
    d: "A target registers a name and callbacks: construct from arguments, map a request, handle completion, report status, handle suspend and resume, and accept messages. Simple targets just rewrite the address. Complex ones keep state, run worker threads and issue their own I/O to devices. Because targets stack, each must behave as a good citizen of the layer below. It is hard because each target is a small storage system with its own crash recovery, and it must work under memory pressure.",
    k: ["Remap in the calling context vs queue to worker threads: remapping is fast and cannot sleep, workers allow complex logic and add latency and ordering questions.", "Target-internal metadata vs reuse the shared metadata of the manager: internal is self-contained and duplicates logic, shared keeps one format and couples the targets."],
    p: ["A target keeps a reference to an underlying device that has been removed, and I/O hangs.", "Memory reserved too small for the in-flight request pool stalls the target when many requests are outstanding."],
    v: "Load each target with a minimal table, run a read-write verification against it and a reference device of the same size, and confirm contents are equal and target status output is well-formed.",
    dep: ["mapping-core", "request-cloning-and-splitting", "block-device-interface"]
  },
  "request-cloning-and-splitting": {
    s: "Creating copies of a request, retargeted to underlying devices, and breaking one that spans targets or limits into pieces that are completed together.",
    d: "A request is cloned so a target can change its address and destination without altering the original. If it crosses a boundary of a target, a stripe or a device limit, it is split into pieces. Each piece is submitted separately, the original completes when all pieces do, and the first error wins. The clones are allocated from reserved pools so progress is guaranteed under memory pressure. It is hard because of error aggregation, flush and discard semantics through splits, and keeping allocation bounded.",
    k: ["Split at the top vs at each layer: top-level splitting is simple and may not know lower limits, per-layer splitting is exact and repeated.", "Reserved memory pools vs allocating on demand: reserved pools guarantee progress under pressure and waste memory, on demand is lean and can deadlock."],
    p: ["A split request completes with success if the first piece's error is dropped, hiding the failure of the second.", "Clones carry a stale copy of a flag, such as forced-unit-access, so one piece is not durable."],
    v: "Submit large requests that span a stripe boundary with an error injected on one piece, and confirm the original completes with that error, with all pieces' data and flags otherwise correct.",
    dep: ["mapping-core", "device-limits-and-alignment", "flush-and-fua-ordering"]
  },
  "stacked-devices": {
    s: "A virtual device built on top of other virtual devices, such as encryption over a mirror over multiple members, with each layer seeing only the one below.",
    d: "The device exposed by one layer becomes a member of the next. Creating the stack goes bottom to top and tearing it down goes top to bottom. Limits propagate upward: the maximum request size and alignment of a layer are the combination of those below it. Errors propagate in the other direction. It is hard because every layer adds latency and a place for failure, and because the same underlying disk can be reached through two stacks if a scan is careless.",
    k: ["Deep stacks of simple layers vs a monolithic implementation: stacks are flexible and reuse tested layers, a monolith can optimize across features and is rigid.", "Propagate limits through the stack vs fixed conservative sizes: propagation is efficient and must be recomputed on change, fixed values are simple and slow."],
    p: ["A change to the lowest layer's limits, such as a new member with a smaller maximum request size, is not propagated and requests fail.", "Teardown order is wrong and a lower layer is removed while the upper one still holds it."],
    v: "Build a three-layer stack, read the limits at the top and compare them with the combination computed from the lower layers, then tear down in order and confirm each layer's removal succeeds.",
    dep: ["mapping-core", "device-limits-and-alignment", "layer-stacking-order", "volume-activation"]
  },
  "suspend-and-resume": {
    s: "Pausing new requests to a device and waiting for in-flight ones to finish, so its table can be changed or its state captured, then letting requests continue.",
    d: "Suspend marks the device so that new requests are queued, then waits for the in-flight count to reach zero, optionally asking the filesystem to flush first. Resume activates any newly loaded table and releases the queue. Snapshots, resizes, migrations and metadata commits use the same pause. A device stack is suspended top to bottom and resumed bottom to top. It is hard because a pause is a global stall for that device, and a path that waits on the paused device while it is paused is a deadlock.",
    k: ["Flush the filesystem before suspend vs only block I/O: flushing gives a clean image and takes time, blocking alone is fast and leaves a crash-consistent state.", "Short pause with prepared state vs doing work while paused: prepared state shortens the stall, doing work during the pause is simple and risks long stalls."],
    p: ["A suspend waits forever because one in-flight request is stuck on a failing device.", "The userspace tool performing the resume is itself blocked on the suspended device."],
    v: "Suspend a device under load, confirm new requests block and in-flight ones finish, then resume and confirm all queued requests complete in order with no errors.",
    dep: ["mapping-core", "request-cloning-and-splitting", "table-swap"]
  },
  "multipath-failover": {
    s: "Using several independent paths to the same device and switching between them when one fails, presenting a single device to the layers above.",
    d: "The same disk or remote volume is reachable through several controllers or network links. The multipath layer identifies them as one device by its unique identifier, groups paths by priority, balances or fails over, and retries a failed request on another path. A health checker probes paths periodically and returns recovered ones. It is hard because the layer must distinguish a path failure from a device failure, and queue or fail I/O when all paths are down.",
    k: ["Queue I/O when all paths are lost vs fail it: queueing rides out brief outages and hangs applications for the duration, failing is clear and breaks filesystems.", "Active-active balancing vs active-passive failover: balancing uses all paths and requires device support, failover is simple and idles capacity."],
    p: ["The volume manager scans both paths and a device node on top of each, and tries to assemble the pool twice.", "A path flaps repeatedly and each failover adds seconds of stall."],
    v: "Disconnect the active path during a write workload and confirm I/O continues on another path within the failover time, with no write errors and no lost acknowledged writes.",
    dep: ["device-identity", "block-device-interface", "timeouts-and-retries", "device-discovery"]
  },
  "volume-metadata-area": {
    s: "A text or binary record on each member device describing the whole pool: members, extent size, volumes, segments and attributes, written in a circular log.",
    d: "Each member has one or more metadata areas after its label. New versions are appended in a ring so an update never overwrites the last good copy, and a small header points at the current one. The record has a version number, a checksum and the member list. A command writes the new version to every area, in sequence, and a version is valid when its header is committed. It is hard because there are several copies that must be made equal, and the commit is not atomic across devices.",
    k: ["Append in a ring vs overwrite in place: a ring always leaves the previous version intact and uses space, overwriting is compact and a torn write destroys the only copy.", "Metadata on every member vs a few: every member survives any loss and costs space and write time, a few are cheap and lose the pool if those few fail."],
    p: ["The metadata area fills with many tiny volumes and fails to hold the next version.", "A tool overwrites the area at the start of the device when the disk is reused for something else."],
    v: "Dump the metadata areas from every member and confirm they hold the same version with valid checksums, then change a volume and confirm all members advance together and the previous version remains readable.",
    dep: ["metadata-copies-and-sequence", "physical-volume", "device-identity"]
  },
  "metadata-copies-and-sequence": {
    s: "A sequence number on each metadata version, so that when copies disagree after a crash or a missing member, the system uses the newest valid one.",
    d: "Each committed version increments a sequence number. On scan, the version from each member is compared: the highest valid sequence is the truth and older copies are updated. Members absent at the last update carry an older version and are flagged stale, so they are not trusted when they return. For RAID, event counts in the superblocks play the same role. It is hard because a split brain, where two disjoint sets of members were updated independently, has two valid newest versions.",
    k: ["Highest sequence wins vs majority of copies: highest sequence recovers from a lone survivor of the last write and trusts a copy that may have been forced, majority resists outliers and needs more members.", "Update stale members at once vs on request: at once restores redundancy quickly, on request lets an administrator inspect a returned member first."],
    p: ["Two halves of a split pool are each activated and written, and neither can be merged afterwards.", "A stale member is reintroduced with the wrong version and its old layout overrides newer metadata."],
    v: "Remove a member, change the metadata, return the member, and confirm the scan flags it stale, uses the newer version and brings it up to date, with the sequence numbers equal at the end.",
    dep: ["volume-metadata-area", "raid-superblock", "failure-domains"]
  },
  "raid-superblock": {
    s: "A small record on each member of a RAID set holding its identity, role, the set's geometry, an event counter, state flags and the resync position.",
    d: "The superblock says which set the member belongs to, its slot in the set, level, chunk size, layout and size, plus a counter incremented at each state change. The location, at the end, start or near the start of the device, determines what else can read the device and whether a mirror member also looks like a plain volume. On assembly the counters decide which members are current, and the state flags say whether the set was cleanly stopped. It is hard because the format is part of the long-term compatibility of every set created.",
    k: ["Superblock at the end of the device vs the start: at the end a mirror member can be read as an ordinary volume, which helps bootloaders and risks accidental use, at the start it is safer and hides the data.", "Frequent vs infrequent superblock updates: frequent updates keep state accurate and cost writes, infrequent ones reduce load and leave stale state after a crash."],
    p: ["Superblock written to a device that is later extended, and then not found where the tool looks.", "A member with an old event counter is added back and trusted over a newer one by a manual force."],
    v: "Read the superblock from each member of a set and confirm the identity, slot and geometry match, the event counters agree among current members, and the clean flag matches whether the set was stopped cleanly.",
    dep: ["metadata-copies-and-sequence", "device-identity", "raid-single-parity"]
  },
  "metadata-recovery": {
    s: "Procedures and tools to reconstruct a pool's or set's metadata when copies are damaged, using older versions, backups or manual reassembly.",
    d: "When metadata is lost or corrupt, recovery can read an older version from the ring on a member, restore from a backup file of the layout, or reassemble a RAID set by forcing members with slightly stale counters into it. Each choice may bring back data older than the last writes and so is deliberate. Repair tools for thin pool and cache metadata check structure and rebuild trees. It is hard because every recovery action can make things worse, and none should be run without first making a copy of the raw metadata.",
    k: ["Automatic repair vs manual repair with review: automatic reduces downtime and can lose data without anyone noticing, manual forces a decision and delays service.", "Read-only inspection first vs direct repair: inspection costs time and is safe, direct repair is quick and irreversible."],
    p: ["A forced assembly of a stale member silently reverts recent writes.", "Repair is run on the only copy of damaged metadata, and a bug in the tool destroys it."],
    v: "Corrupt the newest metadata version on a test pool, run the documented recovery, and confirm the volumes come back readable with the data as of the restored version and a report of what was lost.",
    dep: ["volume-metadata-area", "metadata-backup", "raid-superblock", "pool-metadata-device"]
  },
  "device-identity": {
    s: "Unique identifiers, written to devices and in labels, that let the manager recognize the same device regardless of its name, path or order of attachment.",
    d: "Device names change across boots and between hosts, so membership is recorded by identifier: a unique id in the label, a set id in the RAID superblock, and the device's own serial or world-wide name for path matching. Scans and assembly use these rather than names. Cloning a disk copies identifiers and makes two devices claim the same identity. It is hard because duplicates are easy to create by imaging, snapshots of virtual disks and replication, and the system can then assemble the wrong one.",
    k: ["Identify by on-disk identifier vs by hardware serial: on-disk identifiers follow the data across hardware, serials identify the physical unit and are not always available or unique.", "Refuse duplicates vs allow with a warning: refusing prevents the wrong device from being used and blocks legitimate recovery work, allowing is convenient and dangerous."],
    p: ["A disk image restored to a second disk produces two members with the same identifier, and the pool is assembled from a mixture.", "Configuration that uses device names points to different disks after a controller change."],
    v: "Reorder disks across ports and reboot: all volumes must come up with the same members. Then clone one member to another disk and confirm the duplicate is detected and refused with a message.",
    dep: ["physical-volume", "raid-superblock", "block-device-interface"]
  },
  "metadata-backup": {
    s: "Automatic copies of the layout description saved off the devices after each change, used to restore a pool whose on-disk metadata was destroyed.",
    d: "After every successful metadata change the tool writes the description to a file in a backup and an archive directory, keeping a history of prior versions. A restore writes that description back onto the members in a controlled way, given the device identifiers it lists, and does not recover data. The same applies to a key header for encrypted volumes. It is hard because the backup is usually on the same host and often the same disks, so it is lost with them, and the backup is only a map, not the data.",
    k: ["Backups on the local host vs sent elsewhere: local is automatic and dies with the host, off-host survives and needs a process to exist.", "Keep full history vs only the latest: history allows rollback to before a mistake and uses space and confuses restores, the latest is simple."],
    p: ["The only backup of the layout lives on the volume that was destroyed.", "A restore from an old backup describes a layout that no longer matches the data on the extents."],
    v: "Destroy the metadata areas of a test pool, restore from a backup stored elsewhere, and confirm volumes reappear with the original layout and a filesystem check of each is clean.",
    dep: ["volume-metadata-area", "metadata-recovery", "key-slots-and-unlock"]
  },
  "block-device-interface": {
    s: "The abstraction of a disk as a numbered array of fixed-size sectors that can be read, written, flushed and discarded, which every layer above uses.",
    d: "The interface offers requests with an address, length, direction and flags. It reports the device's size, sector sizes, maximum request size, queue count and whether it is rotating or flash. Drivers implement it for each controller and protocol, and virtual layers implement the same interface, which is what makes stacking possible. It is hard because the abstraction hides real differences, such as latency of milliseconds against microseconds and failure modes, and layers above cannot make good decisions without the hints it can give.",
    k: ["A single uniform interface vs exposing device kinds: uniform allows stacking and hides performance and zoned or append-only behavior, exposing kinds lets layers adapt and complicates them.", "Sector-granular requests vs byte-granular: sectors match devices and force read-modify-write above for small updates, byte granularity is convenient and expensive."],
    p: ["A layer assumes devices have 512-byte sectors and issues misaligned writes to a larger-sector device.", "A virtual layer reports hints incorrectly and filesystems tune badly for it."],
    v: "Query each device for size, sector sizes, rotational flag and limits, then submit a write and read of each size and alignment, confirming the results match the reported values and the data is correct.",
    dep: ["request-queue", "device-limits-and-alignment", "sector-size-and-atomicity"]
  },
  "request-queue": {
    s: "The per-device queue and scheduler that orders, merges and dispatches requests to the driver, trading throughput against latency and fairness.",
    d: "Requests enter a queue where adjacent ones are merged and the scheduler picks the order: by address on rotating disks, simply first in first out on fast flash, or by deadline for latency. Modern devices have multiple hardware queues, so software queues map per processor. Queue depth sets how much the device may reorder internally. Layers stacked above have their own queues. It is hard because every layer queues and each adds latency, and the best scheduler differs by device.",
    k: ["Reordering scheduler vs pass-through: reordering reduces seeks on rotating disks and wastes time on flash, pass-through is minimal and unfair under load.", "Deep queues vs shallow: deep queues keep the device busy and raise tail latency, shallow ones keep latency low and leave throughput unused."],
    p: ["Schedulers at several stacked layers fight and add latency without benefit.", "A deep queue behind a failing device holds thousands of requests that all time out together."],
    v: "Measure throughput and 99th percentile latency for a mixed workload at several queue depths and schedulers, confirming the chosen setting meets the target and that the device queue depth in statistics matches the setting.",
    dep: ["block-device-interface", "device-limits-and-alignment", "timeouts-and-retries"]
  },
  "device-limits-and-alignment": {
    s: "Per-device limits such as maximum request size, segment count, minimum and optimal I/O size and alignment offset, which must be combined correctly through every layer.",
    d: "Each device reports these values. A stacking layer computes its own from its members: the largest request is the smallest of members', the optimal size becomes the stripe width, and alignment is the offset that makes upper layers' blocks fall on lower boundaries. Mismatched members make the result conservative or inconsistent. Hotplug changes can invalidate the result. It is hard because many devices report wrong or zero values, and the numbers are advisory so a layer can ignore them.",
    k: ["Combine member limits conservatively vs optimistically: conservative always works and wastes capability, optimistic is fast and fails on the member with the smallest limit.", "Trust the device's reported values vs override with configuration: trusting is automatic and wrong for some hardware, overrides fix known bad devices and need maintenance."],
    p: ["A new member with a smaller maximum request size is added and requests that were fine before now fail.", "A device that reports a 512-byte physical sector while using 4 KiB makes every layer misalign."],
    v: "Read the limits from each member and from the stacked device, and confirm the stacked values equal the computed combination, then add a member with a smaller limit and confirm the stack's value falls accordingly.",
    dep: ["block-device-interface", "sector-size-and-atomicity", "io-alignment-and-geometry"]
  },
  "sector-size-and-atomicity": {
    s: "The logical and physical sector sizes and what a device guarantees about a write that is interrupted: whole, absent or torn.",
    d: "Devices may present 512-byte logical sectors on 4 KiB physical ones, in which case a smaller write is a read-modify-write inside the drive. A write of one sector is generally atomic against power loss, a multi-sector write is not, and some devices guarantee atomic writes up to a declared size. Layers that need atomic updates, such as metadata commits, size their records to those guarantees. It is hard because these properties are rarely documented precisely, and torn writes are rare enough to escape testing.",
    k: ["Rely on single-sector atomicity vs add checksums to detect tearing: relying is simple and fragile on bad devices, checksums detect the tear and need recovery logic.", "Match the physical sector size vs the logical size: matching avoids internal read-modify-write and breaks tools that expect 512 bytes."],
    p: ["A metadata record larger than the atomic unit is half written at a power cut and the checksum is the only thing that notices.", "Emulated 512-byte sectors on large physical ones cause slow, misaligned small writes."],
    v: "Read the reported logical and physical sizes, write one logical sector at an unaligned offset, and confirm via device statistics whether it caused a read-modify-write, then confirm metadata records are sized within the atomic guarantee.",
    dep: ["block-device-interface", "device-limits-and-alignment", "volatile-write-cache"]
  },
  "volatile-write-cache": {
    s: "The memory in a drive or controller where acknowledged writes wait before reaching stable media, and which loses them at a power cut unless flushed.",
    d: "A write may complete as soon as it reaches the cache, long before it is on media. A flush command makes the cache write out. Battery or capacitor-backed caches survive power loss and can ignore flushes safely. Cache can be disabled for safety at a large speed cost. Everything the stack promises about durability rests on flushes being honored. It is hard because a device that lies about cache state cannot be detected by ordinary tests, and the failure only shows after a power loss.",
    k: ["Cache on with correct flushes vs cache off: on is fast and depends on flush correctness, off is safe and slower on random writes.", "Protected cache and flush ignoring vs flush everywhere: ignoring flushes on a truly protected cache is fast and unsafe if the protection fails, flushing everywhere is safe and slower."],
    p: ["A controller with a failed battery silently switches to unprotected write-back and loses data in the next outage.", "A drive acknowledges flushes without performing them."],
    v: "Write, flush and cut power at the instant the flush returns, repeatedly, across many devices, and confirm every flushed write is present afterwards, which is the only test of flush honesty.",
    dep: ["block-device-interface", "device-error-semantics", "flush-and-fua-ordering"]
  },
  "discard-support": {
    s: "A device's ability to be told that ranges of blocks are no longer used, and its limits and behavior when handling such requests.",
    d: "Flash devices use the information to erase blocks in advance and reduce write amplification; thin and virtual devices use it to free space. Devices report granularity, maximum range and whether discarded blocks read as zeroes. Some are slow, serialize with I/O, or ignore the command. The volume layers pass discards down, translating ranges through mappings and splitting them to limits. It is hard because behavior varies widely and a discard is a data-destroying request that must never be misrouted.",
    k: ["Rely on discard-reads-zero vs explicit zeroing: relying is fast and wrong on devices that return old data, explicit zeroing is certain and slow.", "Issue discards online vs batch: online keeps devices and pools tidy and can stall I/O, batched runs at quiet times and delays reclamation."],
    p: ["A discard translated with the wrong offset destroys data in an unrelated volume.", "A device with slow discard stalls other I/O for seconds during a large file deletion."],
    v: "Discard a range on a volume with a known pattern, confirm only that range changes and neighbors are intact, and check against the device's reported zero-after-discard behavior.",
    dep: ["block-device-interface", "device-limits-and-alignment", "request-cloning-and-splitting"]
  },
  "device-error-semantics": {
    s: "What a device's error responses actually mean: media error, timeout, transport fault or aborted command, and whether retrying or rewriting can succeed.",
    d: "A drive returns specific error codes for unreadable media, but controllers, adapters and virtual layers often collapse them into one generic failure. The layers above need to know whether the data at that address is gone, the device is gone or a retry would work. Timeouts are the least informative. Error behavior also differs by device type: flash tends to fail whole regions suddenly while rotating disks fail one sector at a time. It is hard because policies built on a coarse error make wrong decisions in both directions.",
    k: ["Distinguish error classes vs treat all as failure: distinguishing allows repair of single sectors and demands accurate lower layers, treating all alike is simple and ejects healthy devices.", "Treat device-reported success as final vs verify by reading back: trusting is fast and relies on the device, verifying finds silent write failures and costs a read."],
    p: ["A transport error is reported as a media error and a good disk is marked as having bad blocks.", "A device that returns success for lost writes passes every health check."],
    v: "Inject each class of fault with a fault-injection layer or test device, and confirm each is reported distinctly in logs with the right action taken: retry, rewrite from redundancy, or eject.",
    dep: ["block-device-interface", "timeouts-and-retries", "volatile-write-cache"]
  },
});
