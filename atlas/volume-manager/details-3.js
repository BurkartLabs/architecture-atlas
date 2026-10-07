// Details for the volume manager plate, part 3: logical volumes, resize and migration, RAID levels.
ATLAS.details("volume-manager", {
  "physical-volume": {
    s: "A block device or partition that has been initialized to contribute space to a pool, with a label and a metadata area at its start.",
    d: "Initializing a device writes a label identifying it, a unique identifier, the extent size and the location of its metadata areas. The rest of the device is divided into extents. A device belongs to at most one pool. Members can be whole disks, partitions or other volumes such as a RAID set. It is hard because the label must be found reliably among many devices, and because a member removed from a pool must be emptied of data first or its extents are lost.",
    k: ["Whole disk vs partition as a member: a whole disk avoids partition-table confusion and invites tools that think it is empty, a partition is visible to everything and costs alignment care.", "Members that are single disks vs RAID sets: single disks maximize capacity and depend on each disk, a RAID set below the pool gives one redundancy policy for everything."],
    p: ["A disk with a label but no partition table looks blank to other tools and is reformatted.", "Removing a member without migrating its extents destroys every volume that used them."],
    v: "Initialize a device and read its label from the raw device at the documented offsets, confirming the identifier and extent size, then confirm the scan reports it as a member of exactly one pool.",
    dep: ["physical-extent", "volume-metadata-area", "device-identity", "block-device-interface"]
  },
  "volume-group": {
    s: "A named pool made of one or more physical volumes whose extents can be allocated to any logical volume in the group.",
    d: "A group joins members into a single pool with one extent size. It holds the authoritative description of every volume in it: segments, their extents and attributes. The description is copied to all members' metadata areas. Space can be moved between volumes by freeing and allocating extents. It is hard because the group is a failure domain: losing a member that holds any extent of a linear volume loses that volume, and a group that spans many disks multiplies the chance of that.",
    k: ["One large group vs several smaller groups: one group shares free space best and has one wide failure domain, several limit blast radius and strand space.", "Larger vs smaller extent size: larger extents give small metadata and coarse allocation, smaller give fine allocation and large maps."],
    p: ["A group of non-redundant disks loses volumes whenever any disk fails, which is more likely than for one disk.", "Extent size cannot be changed cheaply later, and a poor choice limits volume granularity for years."],
    v: "Create a group from two members, allocate a volume across both, and confirm the metadata on each member contains an identical description with the same sequence number.",
    dep: ["physical-volume", "physical-extent", "metadata-copies-and-sequence", "failure-domains"]
  },
  "physical-extent": {
    s: "The fixed-size unit, commonly a few megabytes, into which every physical volume is divided and in which all allocation is counted.",
    d: "Every member's usable area is a sequence of equal extents. Allocation, growth, migration and freeing all work in whole extents, and a volume's size is a multiple of the extent size. A map records which volume and segment owns each extent. Extent size trades granularity against map size. It is hard because the unit of allocation is not the unit of I/O: a filesystem's small requests land inside extents, and alignment of the first extent decides whether requests straddle device sectors or stripes.",
    k: ["Large extents vs small: large reduce map size and waste partial space on each volume, small give precise sizes and larger maps.", "Fixed extents vs variable-length allocation: fixed makes allocation, migration and accounting simple, variable wastes less on odd sizes and fragments."],
    p: ["The start of the first extent is not aligned to the device's physical sector or stripe, and every write becomes a read-modify-write.", "Capacity displayed rounds down to whole extents and leaves a visible gap versus the raw size."],
    v: "Allocate volumes of odd requested sizes and confirm the allocated size is the next whole multiple of the extent size, and that the first data offset is a multiple of the device's reported alignment.",
    dep: ["physical-volume", "io-alignment-and-geometry", "device-limits-and-alignment"]
  },
  "logical-volume": {
    s: "A virtual block device of a chosen size, built from segments that point into the pool, which a filesystem or database uses like a disk.",
    d: "A logical volume has a name, a size and an ordered list of segments. Each segment covers a range of the volume and refers to extents on one or more members. Activation turns that list into a mapping table loaded into the kernel, which appears as a device node. Volumes can have types: linear, striped, mirrored, parity or thin. It is hard because the volume hides the physical layout: administrators and applications cannot tell which disk a hot file is on, and performance and failure behavior depend on the segments.",
    k: ["Few large volumes vs many small ones: few are simple and share a single fate, many isolate workloads and can be resized and snapshotted independently.", "Name and tags vs fixed device paths: names are stable and readable, device node numbers change between activations."],
    p: ["A volume is grown by taking extents from a slow device and part of it is silently slower than the rest.", "Several volumes on the same disks compete for it with no visible link between them."],
    v: "Create a volume, list its segments, and confirm the mapping table loaded in the kernel gives the same ranges and devices as the metadata; writing at a known offset must appear on the expected member device.",
    dep: ["linear-segments", "striped-segments", "volume-group", "mapping-tables"]
  },
  "linear-segments": {
    s: "The simplest mapping: a segment of a volume maps a contiguous run of logical addresses onto a contiguous run of extents on one device.",
    d: "A linear volume is a concatenation. Offsets within a segment are added to the segment's start on the member device. Volumes grown from several free regions have several linear segments. Mapping lookup is a binary search on segment start. Performance is that of the underlying device, and no I/O is split except across segment boundaries. It is hard only in what it implies: there is no redundancy and no parallelism, and a hot file lands on one disk.",
    k: ["Linear vs striped layout: linear is simple, keeps data local and gives no parallelism, striped spreads load and ties each volume to every member.", "Allocate contiguously vs wherever there is space: contiguous gives fewer segments and may need free space of one size, any placement packs better."],
    p: ["A linear volume across four disks fails when any one disk fails, with four times the chance of a single disk.", "A request spanning a segment boundary is split and handled as two requests, which surprises latency measurements."],
    v: "Write a marker at offsets just before and just after a segment boundary and confirm each lands on the expected member at the computed offset, reading back correctly as one contiguous volume.",
    dep: ["logical-volume", "physical-extent", "mapping-tables", "target-drivers"]
  },
  "striped-segments": {
    s: "A mapping that spreads consecutive chunks of a volume across several devices in rotation, raising throughput with no redundancy.",
    d: "Logical addresses are divided into chunks of a configured stripe size. Chunk n goes to device n mod N at the next offset there. A large sequential request is split and sent to all devices in parallel; small random requests spread across devices statistically. All stripes must be allocated on distinct members of equal free space. It is hard because stripe size must match the workload: too small splits requests that fit one device, too large leaves devices idle for a single stream.",
    k: ["Small vs large stripe size: small spreads even modest requests across disks and splits many of them, large keeps typical requests on one disk and benefits parallel users.", "Stripe across every member vs a subset: all members maximize bandwidth and increase failure exposure, a subset limits both."],
    p: ["Extending a striped volume needs free space on every member, and fails though the group has plenty overall.", "One slow member holds back every request that touches it, so the volume runs at the pace of its slowest disk."],
    v: "Write a sequential file through a three-way striped volume and confirm each device receives a third of the data in the stripe-size pattern, and measure throughput near the sum of the members.",
    dep: ["logical-volume", "raid-striping", "extent-allocator", "mapping-tables"]
  },
  "extent-allocator": {
    s: "The algorithm that picks free extents for new or grown volumes under the allocation policy, balancing contiguity, spread and failure-domain rules.",
    d: "Given a request and a policy, the allocator lists free extents per member, discards those that violate constraints such as already holding a mirror copy, and picks runs that fit, trying to keep a segment contiguous. For striped and RAID types it needs parallel runs on several members. It produces segments, which are written in the new metadata. It is hard because constraints interact, and a greedy choice early can make a later request unsatisfiable, so fragmentation shows up as failures when there is free space.",
    k: ["First fit vs best fit: first fit is quick and fragments, best fit keeps big runs free and scans more.", "Honor the policy strictly vs relax on shortage: strict preserves guarantees and refuses work, relaxing completes the request and weakens redundancy."],
    p: ["Years of small grow operations fragment free space so that a new striped volume cannot be placed.", "Different members have different speeds and the allocator mixes them within one volume."],
    v: "Fragment a test group, then request a volume that fits only if extents are chosen well, and confirm the result either meets the policy or fails with a message naming the unmet constraint.",
    dep: ["allocation-policies", "physical-extent", "volume-group", "space-accounting"]
  },
  "volume-activation": {
    s: "Turning a volume's stored description into a live device by loading its mapping table into the kernel, and the reverse when deactivating.",
    d: "Activation reads the current metadata, creates the underlying devices for each layer in dependency order, loads tables, resumes them and creates a device node. Deactivation reverses the order and refuses when the device is open. Activation can be automatic at boot or on demand, partial when members are missing and allowed by policy, and read-only. It is hard because layers must come up in order, and a failure in the middle leaves a partially built stack that has to be torn down cleanly.",
    k: ["Activate automatically at boot vs on demand: automatic is convenient and brings up damaged volumes unattended, on demand is deliberate and breaks unattended startup.", "Allow partial activation vs require all members: partial keeps parts available and risks surprising missing data, requiring all is safe and stops the whole volume."],
    p: ["A volume deactivation fails because a forgotten mount or process holds it open, blocking maintenance.", "A half-activated stack after an error leaves devices that later commands cannot remove."],
    v: "Activate a volume built from a stack of layers and confirm every layer's table is loaded and consistent with metadata, then deactivate it and confirm no devices remain and members are free.",
    dep: ["mapping-tables", "mapping-core", "stacked-devices", "boot-assembly"]
  },
  "online-grow": {
    s: "Increasing a volume's size while it is in use by allocating more extents, then loading an extended table and growing the filesystem above.",
    d: "Growing allocates extents under the same policy, writes metadata, then swaps in a longer table for the live device without interrupting I/O. For RAID and thin volumes the type-specific structures, such as bitmaps and mappings, are extended too. A filesystem on top must then be told to use the new space; many can do so mounted. It is hard because there are two steps, the device and the filesystem, which must be done in order, and a failure between them leaves the device larger than the filesystem.",
    k: ["Grow the volume and the filesystem together in one command vs separately: together prevents forgetting the second step, separately allows checks in between.", "Extend in place vs create a new volume and migrate: in place is fast and limited by free space nearby, migration allows any change and takes time."],
    p: ["The volume is grown but the filesystem is not, and monitoring shows free space that nobody can use.", "Growing a striped or RAID volume fails because members have no free extents although the pool does."],
    v: "Grow a mounted volume under write load and confirm the device size changes with no I/O errors, then grow the filesystem and confirm its reported capacity matches and earlier data is intact.",
    dep: ["extent-allocator", "table-swap", "filesystem-coordination", "volume-metadata-area"]
  },
  "volume-shrink": {
    s: "Reducing a volume's size, which first needs the filesystem on it to shrink and then frees extents; an error order destroys data.",
    d: "Shrinking is the reverse of growing and the dangerous one. The filesystem must be unmounted or support online shrink, must relocate data out of the area to be removed, and be resized first. Only then is the volume's table shortened and the extents returned to the pool. Many filesystems cannot shrink at all. It is hard because the volume layer cannot verify that the filesystem has vacated the tail, so trusting the administrator's order is the only protection.",
    k: ["Refuse to shrink without confirmation vs allow it silently: confirmation prevents the common error of shrinking the volume first and slows scripted use.", "Shrink in place vs copy to a smaller volume: in place is quick and risky, copying is slow and leaves the original intact until verified."],
    p: ["The volume is reduced before the filesystem, cutting off the tail of the filesystem and corrupting it.", "Shrinking a thin volume does not return space to the pool until discards have been issued."],
    v: "Fill a volume partly, shrink the filesystem and then the volume to a size above the used data, and confirm a full filesystem check passes and the extents return to the pool's free count.",
    dep: ["filesystem-coordination", "table-swap", "logical-volume", "physical-extent"]
  },
  "extent-migration": {
    s: "Moving a volume's extents from one device to another while it is in use, using a temporary mirror so a crash at any point loses nothing.",
    d: "To evacuate a member, the system creates a temporary mirror of each segment onto new extents, copies the data in the background while new writes go to both sides, then removes the original leg and updates the metadata. Progress is recorded so a restart resumes. The same mechanism rebalances capacity or moves to faster media. It is hard because the copy competes with production I/O, and a failure of the destination mid-move must leave the source valid.",
    k: ["Mirror-based move vs copy then switch: mirroring keeps data current during the move and costs double write traffic, copy-then-switch needs a pause or a snapshot to catch up.", "Move one segment at a time vs all at once: one at a time limits risk and takes long, all at once is fast and ties up the devices."],
    p: ["A move is interrupted and left unfinished for weeks, and the volume keeps writing everything twice.", "The destination device is slower than the source and the move drags application latency up for the duration."],
    v: "Migrate a volume under write load, kill the process halfway, restart it, and confirm the move completes and all data matches a checksum taken before, with the source extents free afterwards.",
    dep: ["raid-mirroring", "table-swap", "mapping-tables", "rebuild-throttling"]
  },
  "device-replacement": {
    s: "Swapping a failing or retired member for a new one, either by migrating extents off it while healthy or by rebuilding after it has failed.",
    d: "If the old device still works, its extents are migrated to the new one with a temporary mirror, which keeps redundancy throughout. If it has failed, a redundant volume is rebuilt onto the new member from the survivors. For non-redundant volumes the data is gone. The new device is initialized as a member, added to the group, and old identity references are removed. It is hard because the procedure differs by case, and applying the wrong one, such as pulling a healthy-looking disk, can make a recoverable situation fatal.",
    k: ["Migrate off a failing but readable device vs wait for it to fail and rebuild: migration keeps redundancy and uses reads of a sick disk, rebuilding lowers the exposure to reads of it and loses redundancy for its duration.", "Replace in the same slot vs a new slot: the same slot is physically simple and risks pulling the wrong disk, a new slot lets old and new overlap."],
    p: ["The wrong drive is pulled from a degraded array because slot labels did not match device names.", "A replacement device slightly smaller than the original cannot be added to a RAID set."],
    v: "Replace a member in a test group with both procedures, and confirm after each that redundancy is fully restored, the old device is gone from metadata, and data checksums are unchanged.",
    dep: ["extent-migration", "rebuild-onto-spare", "physical-volume", "device-identity"]
  },
  "table-swap": {
    s: "Atomically replacing a live device's mapping table: suspend I/O, load the new table, resume, so layout changes happen without unmounting.",
    d: "The new table is first loaded into an inactive slot and validated. Then the device is suspended: new requests queue and in-flight ones drain, and the tables are switched and the device resumed. The pause is usually milliseconds. Every grow, shrink, migration and snapshot creation depends on this primitive. It is hard because the suspend must complete, and a suspended device that blocks the very process that would resume it, or the filesystem it carries, deadlocks.",
    k: ["Suspend during the swap vs lock-free table replacement: suspension is simple and gives a brief stall to every writer, lock-free is complex and has no pause.", "Preload and validate before suspending vs after: before shortens the pause and may validate against state that changes, after is accurate and longer."],
    p: ["A tool allocates memory during the suspend, needs the suspended device to free that memory, and the host hangs.", "A stuck drain leaves the device suspended and every process using it blocked."],
    v: "Swap a table under continuous write load and measure the longest stall, confirming it stays within the documented bound with no lost or reordered writes when the data is compared afterwards.",
    dep: ["suspend-and-resume", "mapping-tables", "request-cloning-and-splitting"]
  },
  "filesystem-coordination": {
    s: "Making the filesystem and the volume agree about size, usually by running the filesystem's resize tool before or after the volume change in the right order.",
    d: "The volume layer knows block counts and the filesystem knows its own layout, and neither can query the other reliably. Combined commands call the filesystem's tool, grow after the volume extends and shrink before it contracts, mounted or not according to what the filesystem supports. Some filesystems adapt to the device size on their own. It is hard because the support matrix is large, and the tools differ in what they require, such as a recent check, or an unmounted state.",
    k: ["Integrated resize command vs separate tools: integrated enforces the order and needs support for each filesystem, separate works for any filesystem and relies on the operator.", "Online resize vs offline: online avoids downtime and is supported only for some operations, offline is universal and costs an outage."],
    p: ["An unsupported filesystem is resized by the integrated command's fallback, which skips its step and reports success.", "Filesystem metadata sized for the original capacity limits growth to a fraction of what the volume offers."],
    v: "For each supported filesystem, grow and shrink a volume with the integrated command and confirm that the filesystem's reported size matches the device and that a full check afterwards is clean.",
    dep: ["online-grow", "volume-shrink", "block-device-interface"]
  },
  "raid-striping": {
    s: "RAID 0: data is divided into chunks spread across all members for throughput and capacity, with no redundancy at all.",
    d: "Chunks are assigned round-robin, so the capacity is the sum of members and a large request is served by all devices at once. There is no parity or copy, so any single member failure loses the whole set, and the failure probability grows with the member count. Smaller members limit the zone that can be striped across all members, so devices of differing sizes are used in zones. It is hard only in what people expect of it: it is the fastest and least safe level.",
    k: ["Chunk size small vs large: small gives bandwidth to single large requests and splits small ones, large favors many concurrent small requests.", "Striping over members of unequal size vs requiring equal: zoned layouts use all capacity and give uneven performance, equal sizes are uniform and waste the larger devices."],
    p: ["Used for important data because it benchmarks well, and the first disk failure ends it.", "Mixed-speed members make the whole set perform at the pace of the slowest in each stripe."],
    v: "Write a sequential pattern across a striped set and confirm each member holds its share in chunk order; remove one member and confirm the set refuses to run and reports it.",
    dep: ["parity-layouts", "striped-segments", "block-device-interface"]
  },
  "raid-mirroring": {
    s: "RAID 1: every write goes to two or more members, each holding a full copy, so any single survivor can serve all data.",
    d: "Writes are sent to every leg and complete when all have completed. Reads may go to any leg, so read throughput scales with legs. When a leg fails, the others continue and the set is degraded until a replacement is resynchronized. Dirty regions are tracked so that after a crash only regions that were being written are compared. It is hard because the legs can disagree after a crash with a write in flight to some of them, and it must be decided which copy is right.",
    k: ["Two legs vs three: two is cheap and one failure from loss while rebuilding, three survives a second failure at the cost of a third of capacity.", "Read from the nearest leg vs balance across legs: nearest reduces seeks and unbalances load, balancing uses all legs and can lose locality."],
    p: ["After a crash with writes in flight, the legs hold different data and the set returns different answers depending on which leg answers.", "A mirror in the same enclosure or power domain fails together, so the redundancy is nominal."],
    v: "Write data, remove each leg in turn and confirm the data reads back identical; then diverge the legs with a crash during writes and confirm resync makes them equal and reads are stable afterwards.",
    dep: ["write-intent-bitmap", "read-balancing", "initial-resync", "failure-domains"]
  },
  "raid-single-parity": {
    s: "RAID 4 and 5: data chunks are striped and one parity chunk per stripe lets the set survive the loss of any single member.",
    d: "For each stripe, parity is the exclusive-or of its data chunks. A small write updates the data and the parity; a read of a lost member is reconstructed from the others. In RAID 4 parity sits on one dedicated member, which becomes a write bottleneck; in RAID 5 it rotates across members. Capacity is members minus one. It is hard because a small write costs four I/Os, and because a second failure, or one unreadable sector during rebuild, loses data.",
    k: ["Dedicated vs rotating parity: dedicated is simple and bottlenecks writes on one disk, rotating spreads the parity load across all members.", "Single parity on many members vs smaller sets: wide sets use capacity well and expose longer rebuilds and more failure chances, small sets cost more capacity and recover more safely."],
    p: ["A rebuild of large disks hits an unreadable sector on a survivor and the stripe is lost.", "Random small writes run at a quarter of the speed that capacity figures suggest."],
    v: "Write data, remove any one member and confirm all data reads back identical to a checksum taken beforehand; rebuild onto a new member and confirm the set returns to clean with matching parity.",
    dep: ["parity-calculation", "rmw-vs-reconstruct-write", "parity-layouts", "rebuild-onto-spare"]
  },
  "raid-dual-parity": {
    s: "RAID 6: two independent parity chunks per stripe let a set survive any two simultaneous member failures.",
    d: "The first parity is the usual exclusive-or; the second is computed with arithmetic in a finite field, so the two together can solve for any two missing chunks. Capacity is members minus two. Writes update both parities, and a double failure is recovered by solving two equations per stripe. The extra calculation is done in optimized routines on vector instructions. It is hard because the second parity is more expensive to compute, and because recovery math must be exactly right for every combination of failed members.",
    k: ["Dual parity vs mirroring: dual parity gives double-failure protection at lower capacity cost for wide sets, mirroring has simpler recovery and more capacity cost.", "Sets of many large disks vs smaller sets: wide sets amortize the parity and take long to rebuild with exposure, smaller sets rebuild faster."],
    p: ["A bug in the recovery path for one rare combination of failed members is found only when it happens in production.", "Write performance on a small processor is limited by parity computation, not by the disks."],
    v: "Remove every pair of members in a test set in turn and confirm all data reads back correctly, then rebuild both and confirm both parities verify against a full recomputation.",
    dep: ["parity-calculation", "raid-single-parity", "rmw-vs-reconstruct-write", "rebuild-onto-spare"]
  },
  "raid-nested-levels": {
    s: "Combining levels, such as mirrors striped together (RAID 10) or parity sets striped together, to get both throughput and redundancy.",
    d: "A common arrangement stripes across several mirrored pairs: it survives one failure per pair, reads and writes at near full speed, and rebuilds by copying one device. Another layers striping over parity sets for scale. Nesting can be done by stacking separate sets, or by a single level that implements it with near and far copy layouts. It is hard because the survivable failures depend on which devices fail: two failures in different pairs are fine and two in the same pair lose data.",
    k: ["Stacked sets vs a single combined level: stacking reuses simple parts and is easy to reason about, a combined level gives flexible layouts on odd member counts and is more complex.", "Mirrors of stripes vs stripes of mirrors: stripes of mirrors lose less on one failure and rebuild one device, mirrors of stripes lose a whole stripe set."],
    p: ["Two failures in the same mirror pair destroy the set though the design was described as surviving two failures.", "Members of one pair placed on the same controller fail together."],
    v: "On a four-device set of two pairs, fail one device of each pair and confirm data survives, then fail both devices of one pair and confirm the set reports failure and which pair was lost.",
    dep: ["raid-mirroring", "raid-striping", "failure-domains", "stacked-devices"]
  },
  "parity-layouts": {
    s: "The geometry choices of a parity set: chunk size, how parity rotates across members, and where each stripe's data and parity chunks are placed.",
    d: "Rotation patterns differ in whether parity moves left or right and whether data chunks continue past parity or restart, and these affect sequential read speed and compatibility with other implementations. Chunk size sets the unit per member, the stripe is the chunk times the number of data members, and full-stripe writes are most efficient when aligned to it. It is hard because the layout is baked into the on-disk data and cannot be changed without a reshape, and an incorrect assumption makes data unreadable by another system.",
    k: ["Large chunk vs small chunk: large favors many independent small requests and sequential reads of single members, small spreads large requests and makes full stripes easier to hit.", "A common rotation pattern vs a custom one: a common pattern is readable by other tools, a custom one may help performance and ties data to one implementation."],
    p: ["A volume above is aligned to the chunk size and not the full stripe, so every large write becomes a partial-stripe write.", "A set moved to another host is assembled with a different default layout and presents garbage."],
    v: "Compute where logical offsets should land from the layout parameters and compare with reading raw member devices at those offsets; confirm parity chunks sit where the rotation says.",
    dep: ["raid-single-parity", "io-alignment-and-geometry", "raid-superblock"]
  },
  "raid-reshape": {
    s: "Changing a set's level, member count or chunk size in place, by rewriting stripes in a new layout while the set stays online.",
    d: "A reshape reads stripes in the old geometry and writes them in the new one, working through a window and recording its position in the metadata so it can resume. Adding a member grows capacity; converting between levels moves from mirror to parity, or the reverse. During the reshape, reads and writes consult the position to know which geometry applies, and a backup area protects the window being overwritten. It is hard because the data is being rewritten in place, and a crash or failure in the middle must not leave any stripe unrecoverable.",
    k: ["Reshape in place vs migrate to a new set: in place needs no spare capacity and puts all data at risk for a long time, migration is safer and needs double capacity.", "Back up the active window to a separate area vs to the same members: a separate area survives member loss during the move and needs space and care."],
    p: ["A power cut during the critical window with a lost backup area corrupts the set.", "A reshape runs for days on large arrays, with degraded performance throughout and no protection against one more failure."],
    v: "Add a member to a test set under write load, interrupt it by crashing the host, resume, and confirm that all data matches checksums and the new geometry is reported at the end.",
    dep: ["parity-layouts", "raid-superblock", "write-journal", "rebuild-throttling"]
  },
  "read-balancing": {
    s: "Choosing which mirror leg serves each read, and marking slow legs write-mostly so reads avoid them, for example a remote or rotating copy next to flash.",
    d: "The mirror layer picks a leg for each read using position and recent load: the leg whose head is nearest for rotating disks, round-robin for flash, or the least busy. A leg flagged write-mostly receives all writes and is read only when others fail. Sequential streams are kept on one leg to preserve read-ahead. It is hard because the best choice depends on device type, and mixing types makes every simple heuristic wrong for some of them.",
    k: ["Round-robin vs nearest-position: round-robin spreads load on uniform flash, nearest position cuts seek time on rotating disks and piles reads on one leg.", "Write-mostly legs vs equal legs: write-mostly lets a slow or remote leg provide redundancy without slowing reads, and means reads are served by a single device."],
    p: ["A write-mostly leg cannot keep up with writes and throttles the whole mirror.", "Balancing sends a read to a leg that is mid-resync and not yet valid."],
    v: "Run random reads on a two-leg mirror and confirm per-device statistics show reads divided as configured, with a write-mostly leg receiving writes but almost no reads.",
    dep: ["raid-mirroring", "request-queue", "device-limits-and-alignment"]
  },
});
