// Details for the volume manager plate, part 1: administration, health, snapshots.
ATLAS.details("volume-manager", {
  "management-cli-and-api": {
    s: "The commands and programmatic interface that create, change, activate and report on pools and volumes, and that write the resulting layout to on-disk metadata.",
    d: "Most operations follow one pattern: read the metadata from the member devices, take a lock, edit an in-memory copy of the layout, write the new metadata to every device, then load the matching mapping tables into the kernel. Ordering matters because a crash between the metadata write and the table load must leave a state that can be repaired. Commands are often split between a user-space tool and a long-running service that other programs call. It is hard because every command is a distributed update across several disks.",
    k: ["Stateless command-line tools vs a resident daemon: tools are simple and always read fresh metadata, while a daemon caches state for speed but can drift from what is on disk.", "Declarative layout descriptions vs imperative commands: declarative is safer to repeat, imperative maps directly to each low-level step and is easier to partially apply by mistake."],
    p: ["A command interrupted between metadata write and activation leaves volumes whose on-disk and in-kernel layouts disagree until someone reruns activation.", "Scripts that parse human-readable output break when columns or units change between versions."],
    v: "Create a volume, kill the tool at several points during the operation, then rescan: each time the layout must come up either as the old state or the new one, never a mix, and a repair command must restore a clean state.",
    dep: ["volume-metadata-area", "metadata-locking", "mapping-tables"]
  },
  "device-discovery": {
    s: "Scanning attached block devices for volume and RAID signatures so the system learns which devices belong to which pool, without being told.",
    d: "At boot and on hot-plug, each candidate device is read at known offsets for a signature and a unique identifier. Matching signatures are grouped into pools, and the metadata from each member is compared to find the newest and detect missing members. Results are cached so later commands do not rescan every disk. It is hard because storage appears in several paths and layers: the same disk may show up through two controllers, a partition, and a mapped device on top of it, and only one view should be claimed.",
    k: ["Scan every device vs an explicit device list: scanning finds everything automatically but is slow on large arrays and can touch devices that belong to someone else.", "Cached scan results vs fresh scans: the cache is fast and enough for most commands, but a stale cache hides a device that was just added or removed."],
    p: ["A volume is scanned on both the host and a virtual machine disk image that contains it, so two systems believe they own the same pool.", "Duplicate devices from multiple paths cause the tool to pick a path that later disappears."],
    v: "Attach a disk with a known signature, confirm exactly one device node is reported as the member, then add a second path to the same disk and confirm the duplicate is rejected with a message rather than silently chosen.",
    dep: ["device-identity", "volume-metadata-area", "block-device-interface", "config-and-device-filters"]
  },
  "config-and-device-filters": {
    s: "Settings and accept or reject rules that control which devices the manager may scan or claim, and defaults for allocation, monitoring and activation behavior.",
    d: "A configuration file and command overrides set defaults, and filter patterns limit scanning to chosen devices or exclude others, such as raw disks used by virtual machines or devices already stacked under a volume. Filters are applied at scan time and again at activation. The boot-time copy of the configuration lives in an early-boot image and can differ from the running one. It is hard because a filter that is too broad hides a real pool member, which looks like a missing disk and can trigger a needless degraded start.",
    k: ["Accept-list vs reject-list filters: an accept list is predictable and safe but needs updating for every new disk, while a reject list is easy to start with and lets surprise devices through.", "Single global configuration vs per-pool overrides: one file is simple to audit, while per-pool settings let workloads differ at the cost of harder precedence rules."],
    p: ["The early-boot copy of the configuration is not refreshed after an edit, so the system boots with the old filters and does not find its root volume.", "A filter that excludes a device name that changes across reboots hides different disks on different boots."],
    v: "Change a filter, regenerate the early-boot image, reboot, and confirm the same pool members appear, with the rejected devices listed as ignored in the scan output.",
    dep: ["device-discovery", "boot-assembly"]
  },
  "allocation-policies": {
    s: "Rules that decide which devices and extents new space may come from, such as keeping mirror legs on different disks or striping across all available devices.",
    d: "A policy has a constraint level: strict rules refuse an allocation that would put redundant copies on the same device, while loose ones fall back to what is available. Other settings prefer contiguous extents, spread stripes widely, or allow a volume to use any free space in the pool. The allocator consults the policy for each segment it creates. It is hard because policy intent differs from capacity reality: a strict rule can fail an extension when free space exists but is in the wrong place, while a loose rule quietly weakens the redundancy the user asked for.",
    k: ["Strict vs loose placement: strict preserves the failure-domain guarantee and fails early, loose always succeeds but can place both mirror legs on one disk.", "Contiguous vs scattered allocation: contiguous keeps sequential reads fast and mappings small, scattered fills gaps so fragmented pools remain usable."],
    p: ["A mirrored volume extended under a loose policy ends up with both copies on one device, and the loss of that device destroys the volume.", "A pool that is mostly full cannot satisfy a strict policy for a new volume although total free space is large."],
    v: "On a two-device pool, create a mirror under a strict policy and confirm each leg is on a different device. Then request one that cannot be satisfied and confirm it fails with an explanatory error instead of colocating the legs.",
    dep: ["extent-allocator", "failure-domains", "physical-extent"]
  },
  "metadata-locking": {
    s: "Mutual exclusion on the metadata so that only one administrative operation edits a pool at a time, and so that running volumes are not changed under another host.",
    d: "On a single host, a lock file or service serializes commands that touch the same pool. Read-only commands may share the lock. With several hosts, a distributed lock manager or a lease stored on shared storage extends the guarantee. A command holds the lock from reading metadata until the new copy is on every device. It is hard because a crashed holder must not leave the pool permanently locked, and a lock that expires while the holder is slow can let two writers overwrite each other's metadata.",
    k: ["Local file locks vs a distributed lock manager: local locks are simple and fast but protect only one host, while a manager protects shared pools and adds a network dependency to every command.", "Coarse per-pool locks vs fine-grained per-volume locks: coarse is easy to prove correct and serializes everything, while fine-grained allows parallel work and invites ordering bugs."],
    p: ["A lock held by a hung command blocks every other operation, including those needed to recover the failing disk.", "Two hosts that both think they hold the lock after a network partition write conflicting metadata."],
    v: "Start two metadata-changing commands against the same pool at once and confirm the second waits or fails with a clear message, and that after killing the first the second completes cleanly with intact metadata.",
    dep: ["volume-metadata-area", "metadata-copies-and-sequence"]
  },
  "shared-activation": {
    s: "Rules and coordination that let several hosts see the same pool while ensuring each volume is active on only one at a time, or in a mode that is safe to share.",
    d: "A volume can be exclusive to one host, or active on several only if the layers above it, such as a cluster filesystem, handle the concurrency. Hosts coordinate through a lock service, or through persistent reservations on the devices. Metadata changes are made by one host and then refreshed on the others. It is hard because the volume manager cannot see what the filesystem is doing: it must fence a failed host before another takes over, since a stalled host may resume and write over data the new owner has changed.",
    k: ["Exclusive activation vs shared activation: exclusive is safe with ordinary filesystems and requires failover, while shared allows parallel access only with software designed for it.", "Fencing through device reservations vs through power control: reservations are fast and storage-local but depend on device support, power fencing is certain and slow."],
    p: ["Activating a volume on a second host without a cluster-aware filesystem on top corrupts the filesystem within seconds.", "A host that was declared dead but was only paused resumes and writes stale cached data."],
    v: "Activate an exclusive volume on host A, then request activation on host B and confirm it is refused. Fail host A and confirm B can activate only after A has been fenced.",
    dep: ["metadata-locking", "volume-activation", "device-identity"]
  },
  "boot-assembly": {
    s: "Early-boot logic that finds pool members and assembles the volumes holding the root filesystem before the main system and its configuration are available.",
    d: "A small early-boot image contains the scanning tools, a copy of the relevant configuration and drivers for the controllers and layers in use. It scans for members, assembles redundancy sets, activates the volume holding the root filesystem and hands control onward. If a member is missing it must decide whether to start degraded or wait. It is hard because the early environment is minimal and has little diagnostic output, and any layer added later, such as encryption or a cache, must also be added to the image or the system does not boot.",
    k: ["Assemble everything early vs only the root volume: assembling all is simple and slows boot and can start incomplete sets, while root-only defers the rest to the full system.", "Wait for missing members vs start degraded: waiting protects against assembling a stale set, starting degraded keeps the machine available at the cost of a rebuild later."],
    p: ["A driver for a new controller is missing from the early-boot image, so no disk appears and the root volume is never found.", "Booting degraded with an old member later re-added can resurrect stale data if metadata comparison is skipped."],
    v: "Remove one member of a mirrored root volume and reboot: the system must reach the login prompt in degraded state, report which member is missing, and resync after the member returns.",
    dep: ["device-discovery", "config-and-device-filters", "degraded-mode", "raid-superblock"]
  },
  "event-monitor": {
    s: "A long-running service that watches volumes and RAID sets for state changes and failures, and runs the configured response or sends an alert.",
    d: "The kernel raises events when a device fails, a mirror leg is lost, a pool crosses a usage threshold or a rebuild finishes. The monitor subscribes, reads the new state, and acts: log it, notify an operator, trigger an automatic repair, or extend a pool. Events can arrive in bursts, so it coalesces them. It is hard because it must keep working when the system is under the exact stress that causes events, such as a failing disk that makes every read slow, and it must not itself depend on the volume that failed.",
    k: ["Polling state vs reacting to kernel events: polling is simple and tolerates lost events, while events are immediate but need a way to recover if the monitor missed some.", "Run responses in the monitor vs hand them to an external script: built-in responses are consistent, external scripts let operators integrate their own alerting at the risk of slow or failing handlers."],
    p: ["The monitor process lives on the failed volume, so when the disk dies the alert is never sent.", "A flood of events from a flapping device saturates the alert channel until real failures are ignored."],
    v: "Fail a mirror leg in a test pool and confirm an alert reaches the configured destination within the documented time, naming the device, and that a second identical failure does not send a duplicate flood.",
    dep: ["error-propagation", "failure-policy", "status-reporting"]
  },
  "error-propagation": {
    s: "How an I/O error at a device becomes a decision at each layer above it: retry, redirect to another copy, reconstruct from parity, or return the error to the filesystem.",
    d: "A failed request is reported by the driver to the layer that issued it. A mirror retries on another leg, parity RAID reads the other members and recomputes, a cache serves from the origin, and a plain linear volume simply passes the error up. Each layer must record the failure so it is not retried forever. It is hard because the same error code can mean a bad sector, a bad cable or a dying disk, and treating a transient fault as permanent ejects healthy devices while the opposite delays repair.",
    k: ["Fail a device on the first error vs after a threshold: failing immediately protects data quickly but evicts devices for a one-off glitch, thresholds tolerate noise and extend exposure.", "Return errors upward vs hide them with redundancy: hiding keeps applications running, and also hides a problem until the redundancy is gone."],
    p: ["A transient cable fault ejects a good disk from a mirror, and the remaining leg is the only copy until a rebuild finishes.", "An error absorbed by redundancy is never logged, so no one learns that a disk has been failing for weeks."],
    v: "Inject a read error on one member of a redundant set and confirm the read succeeds from another copy, the error is counted and logged against that member, and a counter in status output increments.",
    dep: ["device-error-semantics", "timeouts-and-retries", "read-error-rewrite", "raid-mirroring"]
  },
  "drive-health-telemetry": {
    s: "Reading the drives' own health counters, such as reallocated sectors, error rates and temperature, to predict failure before the volume layer sees errors.",
    d: "Drives keep internal statistics and a self-assessment, and expose them through a standard command set. A service reads them periodically, compares to thresholds and trends, and flags drives that are degrading. Some drives also run short or long self-tests in idle time. The data feeds replacement decisions and the choice of which member to evict first. It is hard because attributes are vendor-specific, the self-assessment is often wrong in both directions, and many failures arrive with no warning at all.",
    k: ["Trusting the drive's own verdict vs thresholds on raw counters: the verdict is simple but misses slow decline, custom thresholds catch more and give more false alarms.", "Frequent polling vs infrequent: frequent polling sees trends sooner and can disturb a busy drive or wake sleeping ones."],
    p: ["Controllers that hide individual disks make the counters unreadable, so no warning ever appears.", "Proactive replacement driven by one noisy attribute churns healthy drives and each rebuild adds risk."],
    v: "Read the counters on each member and confirm values and units match the drive's documentation, then run a self-test and confirm its result appears in the same report that raises an alert when set past a threshold.",
    dep: ["block-device-interface", "device-error-semantics", "event-monitor"]
  },
  "timeouts-and-retries": {
    s: "The limits on how long a request waits on a slow device and how many times it is retried before the device is treated as failed.",
    d: "Each device has a command timeout at the driver, and layers above add their own. When a request times out, the driver may reset the link or the device and then retry. Redundant layers can instead abandon the slow device and read another copy. The settings are a trade-off between giving a drive time to recover a hard-to-read sector and keeping latency bounded. It is hard because consumer drives may retry internally for minutes, longer than the RAID layer's timeout, which then ejects a drive that would have recovered.",
    k: ["Long timeouts vs short timeouts: long ones let a drive recover a marginal sector and stall every request in that time, short ones bound latency and evict drives that would have recovered.", "Bounded error recovery on the drive vs unbounded: bounded recovery makes the drive give up and report an error quickly so redundancy can supply the data, at the cost of unrecovered sectors."],
    p: ["A drive that retries internally for a long time stalls the whole array, and applications time out although nothing has failed.", "Timeout and reset storms from one bad drive on a shared bus take down healthy neighbors."],
    v: "Inject a delayed response on one member of a redundant set and measure that application latency stays within the configured bound while the slow member is bypassed and reported.",
    dep: ["device-error-semantics", "request-queue", "error-propagation"]
  },
  "degraded-mode": {
    s: "Continuing to serve I/O from a redundant set that has lost a member, with reduced performance and no remaining protection against a further failure.",
    d: "When a member is lost, the set marks itself degraded and keeps running. A mirror reads from the survivor; parity RAID reconstructs data for reads of the missing member from the others, and writes update the surviving parity. Metadata on remaining members records the missing device so later boots know. Reads become slower and every read touches more disks. It is hard because the array is one failure from data loss while carrying the heaviest load, and starting a degraded set with an older member can silently bring back stale data.",
    k: ["Keep serving while degraded vs go read-only: serving keeps applications alive and risks losing data written after a second failure, read-only is safe and stops the service.", "Allow degraded start at boot vs require all members: allowing it keeps hosts available, requiring all prevents assembling from the wrong subset after a partial cable fault."],
    p: ["No one notices the degraded state for months, and when a second disk fails the data is gone.", "Heavy reconstruction reads slow the application enough that timeouts and retries load the surviving disks further."],
    v: "Pull one member from a running parity set and confirm reads and writes continue with correct data, the status shows degraded with the member named, and an alert fires.",
    dep: ["parity-calculation", "raid-superblock", "failure-policy", "raid-single-parity"]
  },
  "failure-policy": {
    s: "The configured response to a lost device: remove it, replace it from spares, keep going, or stop, with different choices for different layers.",
    d: "Each layer has a policy table. A mirror may be told to drop a failed leg and continue, or to replace it from the pool automatically, or to leave it alone for an operator. A thin pool may be told to error or queue writes when full. RAID sets pick a spare, if one exists, and start a rebuild. The policy runs in the monitor so that human delay does not extend exposure. It is hard because automatic repair uses the same disks that are already stressed, and a rule that works for a clean failure can make a messy one worse.",
    k: ["Automatic repair vs operator approval: automatic closes the exposure window quickly and can start a rebuild during an unfinished diagnosis, manual avoids mistakes and waits for a human.", "Allocate a replacement from the pool vs from dedicated spares: pool allocation uses all free space and can fail when the pool is full, dedicated spares are reserved and idle."],
    p: ["Automatic replacement starts a rebuild onto a spare on the same failing controller and kills the second disk.", "The policy was set to ignore failures during testing and never changed back for production."],
    v: "Fail a member with a hot spare available and confirm a rebuild onto the spare starts without intervention, the event is logged, and the failed member is flagged for replacement.",
    dep: ["event-monitor", "hot-spares", "rebuild-onto-spare", "degraded-mode"]
  },
  "usage-thresholds": {
    s: "Configured percentages of pool or snapshot space used that trigger warnings, automatic growth or protective action before space runs out.",
    d: "The monitor compares pool, thin pool data, thin pool metadata and snapshot store usage to thresholds. Crossing a low threshold sends a warning; a higher one may extend the pool automatically or begin dropping the oldest snapshot. Because thin pools and snapshots can fill without any single writer noticing, these thresholds are the main guard. It is hard because usage can rise faster than the monitor reacts, metadata fills separately from data, and an alert threshold that is too tight is ignored while one that is too loose arrives too late.",
    k: ["Alert only vs act automatically: alerting leaves decisions to people who may be asleep, acting can grow storage or delete snapshots no one agreed to lose.", "One threshold vs several stages: staged thresholds give time to react and more alerts, one threshold is simple and gives little warning."],
    p: ["Metadata space is not monitored, and the pool fails with free data space.", "A burst write fills the pool between two monitor checks and the first alert is the failure itself."],
    v: "Fill a test pool past each threshold in turn and confirm a distinct alert fires at each, that automatic extension happens when configured, and that the reported percentage matches the real free extents.",
    dep: ["event-monitor", "pool-extension", "overcommit-control", "snapshot-overflow"]
  },
  "status-reporting": {
    s: "Commands and counters that show the state of each pool, volume, RAID set and rebuild, including sync progress, error counts and member health.",
    d: "Status comes from three places: on-disk metadata for the configured layout, kernel mapping state for what is running, and per-target counters for runtime behavior. A good report joins them: which devices are in each set, whether each is in sync, how far a rebuild or scrub has gone, how many mismatches and read errors were seen and how full a pool is. It is hard because the numbers come from different layers with different update times, and one report shows a state that has already changed.",
    k: ["Human-readable reports vs structured output: readable output is easy to inspect and breaks scripts, structured output is stable for tools and harder to scan by eye.", "Query live kernel state vs saved metadata: live state is current and may be missing for inactive volumes, metadata shows intent and can be stale."],
    p: ["Dashboards show the configured layout as healthy while the kernel has already dropped a member.", "Counters reset on reboot, so a slowly worsening disk looks fresh every time."],
    v: "Start a rebuild and confirm the reported progress rises monotonically to complete, that member states match the actual device state, and that error counters match errors injected during the test.",
    dep: ["mapping-core", "raid-superblock", "volume-metadata-area"]
  },
  "cow-snapshot": {
    s: "A point-in-time view of a volume that copies a block to a separate store the first time the original is overwritten, leaving the original in place.",
    d: "When a snapshot is created, no data moves. On the first write to a block of the origin after that, the old contents are copied to the snapshot's store and the exception is recorded, and then the write proceeds. Reads of the snapshot return the store copy if there is one and the origin otherwise. Reads of the origin are unaffected. It is hard because each first write costs an extra read and write, so many snapshots multiply write latency, and the snapshot is only as safe as its store has room.",
    k: ["Copy-on-write vs redirect-on-write: copy-on-write keeps the origin contiguous and pays a read and write per first overwrite, redirect avoids that and fragments the live volume.", "Large vs small copy unit: a large unit copies fewer times and wastes space and bandwidth for small writes, a small unit is precise and needs far more mapping records."],
    p: ["A volume with several snapshots slows by a large factor on random writes because each write is copied once per snapshot.", "Snapshots kept for months grow until the store fills and all of them are lost."],
    v: "Write a pattern, take a snapshot, overwrite the origin and read both: the snapshot must still return the original pattern and the store usage must have grown by the changed blocks only.",
    dep: ["exception-store", "mapping-tables", "snapshot-quiescing", "target-drivers"]
  },
  "exception-store": {
    s: "The persistent record of which origin blocks have been copied for a snapshot and where the copies are, kept on a separate allocated area.",
    d: "The store holds two things: the copied data, and an index mapping each origin block to its copy. The index is stored in chunks on disk and cached in memory, and a header marks whether the store is valid. On activation the index is read back so the snapshot can resume. Writes to the index are ordered with the data so a crash does not leave an entry pointing at an unwritten copy. It is hard because the store is a small database that has to survive crashes, and when it is full or corrupt the snapshot becomes unreadable.",
    k: ["Persistent store vs in-memory only: persistent survives reboots and costs metadata writes, memory-only is fast and disappears with the host, which is acceptable only for short-lived backups.", "Dedicated store volume vs space inside the pool: a dedicated volume has predictable limits, pool space is flexible and can be exhausted by other users."],
    p: ["A crash between writing the data and updating the index loses the exception, and the snapshot returns new data for a block it should have frozen.", "A store sized for the expected change rate is too small after a bulk rewrite."],
    v: "Take a snapshot, overwrite blocks, power-cycle the host and re-activate: every changed block in the snapshot must still return its original content, and the store header must report valid.",
    dep: ["cow-snapshot", "chunk-allocation", "flush-and-fua-ordering", "logical-volume"]
  },
  "redirect-snapshot": {
    s: "A snapshot design where new writes go to fresh blocks and the map is updated, so the frozen view is simply the old map, with no copying of old data.",
    d: "The volume is a map from logical blocks to physical ones. A snapshot is a second reference to the current map. A later write allocates a new physical block, writes it and updates only the live map, leaving the snapshot map pointing at the old block. Old blocks are freed only when no map refers to them. Writes cost one allocation and a map update instead of a copy. It is hard because block sharing needs reference counts, and because the live volume scatters physically as it diverges.",
    k: ["Redirect vs copy-on-write: redirect writes new data once and keeps snapshots cheap, copy-on-write keeps the live volume laid out sequentially.", "Reference counts per block vs per-snapshot bitmaps: counts allow any number of sharers at the cost of count updates, bitmaps are simple and limit the number of snapshots."],
    p: ["Long-lived snapshots turn sequential files into scattered blocks, and read performance falls over time.", "A reference count error frees a block that a snapshot still needs, and the damage appears only when the snapshot is read."],
    v: "Fill a volume, snapshot it, rewrite part of it, then delete the snapshot: free space must return to exactly the amount of blocks no longer referenced, and the live data must read back correctly.",
    dep: ["block-mapping-tree", "chunk-allocation", "thin-snapshots-and-clones", "physical-extent"]
  },
  "snapshot-merge": {
    s: "Applying a snapshot's frozen contents back onto its origin to roll the volume back, or merging a writable clone, copying only the changed blocks.",
    d: "A rollback merge walks the snapshot's list of changed blocks and copies each back to the origin, while keeping the origin usable. While the merge runs the origin presents the snapshot's content, with unmerged blocks read from the snapshot. When it finishes, the snapshot is deleted. The merge may be deferred until the volume is next activated if the origin is in use. It is hard because the origin is both the target of a copy and a live volume, so reads and writes during the merge have to be redirected consistently.",
    k: ["Merge in the background vs at next activation: background merge avoids downtime and adds I/O load and complexity, deferral is simple and delays the restore.", "Rollback to the snapshot vs create a clone from it: rollback discards later changes for good, a clone keeps both and costs space."],
    p: ["A merge interrupted by a power loss with an inconsistent progress record leaves the origin half old and half new.", "Rolling back the volume that holds the root filesystem needs a reboot, which surprises scripts that expect it to finish immediately."],
    v: "Snapshot, change several files, request a merge, and confirm that after it finishes the origin matches the snapshot content exactly and the snapshot no longer exists.",
    dep: ["cow-snapshot", "exception-store", "volume-activation", "mapping-tables"]
  },
  "thin-snapshots-and-clones": {
    s: "Cheap snapshots of thin volumes that share mapped blocks with their origin, and writable clones made the same way, with no pre-reserved space.",
    d: "A snapshot of a thin volume is a new entry in the pool's mapping structure that points at the same tree as the origin. Both can then be written; the first write to a shared block allocates a new block and copies it, breaking the share. Because there is no separate store, snapshots of snapshots are routine and there is no fixed limit on their number. It is hard because shared blocks need accurate tracking, deleting a volume has to free only unshared blocks, and total consumption is hard to predict.",
    k: ["Writable snapshots vs read-only: writable ones serve as clones for test and virtual machines, read-only ones are safer and cannot diverge.", "Break sharing at block granularity vs larger ranges: block granularity saves space, larger ranges reduce mapping work and copy more than needed."],
    p: ["A pool that looks half full is exhausted by a clone workload that rewrites shared blocks.", "A deep chain of snapshots makes deletion slow, because freeing the blocks needs a long walk through the mappings."],
    v: "Create a thin volume, snapshot it five times with edits between, then delete them in a different order: remaining content must stay correct and pool free space must equal the unshared blocks.",
    dep: ["block-mapping-tree", "thin-pool", "snapshot-chains", "chunk-allocation"]
  },
  "snapshot-quiescing": {
    s: "Making the data on a volume consistent at the instant of a snapshot by pausing the filesystem or application and flushing in-flight writes.",
    d: "A snapshot captures what is on the device, not what applications intend. To get a usable image, the filesystem is asked to flush and freeze, outstanding requests in the mapping layer are drained, the snapshot is taken, and I/O resumes. Applications with their own caches, such as databases, may be told to checkpoint first. The freeze is short but it is a pause that every writer sees. It is hard because a frozen filesystem that is also needed to run the freezing tool deadlocks the host.",
    k: ["Freeze the filesystem vs rely on journal replay: freezing gives a clean image, and journal replay is cheaper and gives a crash-consistent image like a power loss.", "Application-aware quiesce vs block-level only: application-aware gives consistent application state and needs integration, block-level works for any data and may need recovery."],
    p: ["A snapshot taken without a flush contains a half-written database file that fails to start when restored.", "The freeze command is stored on the frozen volume, so the host cannot run the command to thaw it."],
    v: "Write continuously during snapshot creation, restore from the snapshot and run a filesystem check and the application's own consistency check: both must pass without relying on log recovery beyond what a clean freeze would need.",
    dep: ["suspend-and-resume", "flush-and-fua-ordering", "cow-snapshot", "crash-consistency"]
  },
  "snapshot-overflow": {
    s: "What happens when a snapshot's store fills: the snapshot becomes invalid and is dropped, or the origin is frozen, depending on design and configuration.",
    d: "A copy-on-write snapshot has a bounded store. When it is full the next copy cannot be made, and the system must choose: invalidate the snapshot so the origin continues, or fail the origin's write. Most systems choose invalidation, which loses the snapshot and does not harm the origin. Thin snapshots share the pool, so the failure is pool exhaustion and affects all volumes. It is hard because the failure is sudden, the consequence is a lost backup source, and the invalid snapshot may still be mounted by a running backup.",
    k: ["Drop the snapshot vs block the origin: dropping protects the live service and loses the backup, blocking protects the snapshot and stops production writes.", "Auto-extend the store vs fixed size: extension rides out bursts and uses free space that was meant for other volumes, a fixed size gives predictable capacity."],
    p: ["A backup running off a snapshot reads errors after the snapshot is invalidated and completes with silently partial data.", "A bulk rewrite of the origin fills the store within minutes of the first alert."],
    v: "Overwrite more of the origin than the store can hold and confirm the snapshot is marked invalid, reads from it return errors rather than wrong data, and the origin keeps accepting writes.",
    dep: ["exception-store", "usage-thresholds", "cow-snapshot", "error-propagation"]
  },
  "snapshot-chains": {
    s: "The tree of snapshots and clones descending from one volume, with shared blocks tracked so deleting any node frees only what nothing else uses.",
    d: "Each snapshot can itself be snapshotted, giving a tree. Each block belongs to the nodes that still refer to it, tracked by reference counts or by origin ranges. Deleting a node decrements counts and frees the blocks that reach zero. Read lookup for old copy-on-write chains may walk several stores, so chain length affects read latency. It is hard because the structure has to stay consistent across crashes, and because space freed by a delete depends on what other nodes still share.",
    k: ["Independent snapshots of the origin vs chains of snapshots of snapshots: independent ones are easy to delete in any order and each costs a copy, chains share more and make deletion order matter.", "Immediate vs deferred freeing of shared blocks: immediate returns space quickly and holds locks, deferred is smoother and leaves space apparently used."],
    p: ["A deletion scheduled for a snapshot in the middle of a chain unexpectedly leaves most of its space allocated because children still use it.", "Old-style stacked stores make every read walk many layers and become slow."],
    v: "Build a chain of several snapshots, delete a middle one, and confirm that every remaining node reads correctly and that free space increased by exactly the blocks no node referenced.",
    dep: ["thin-snapshots-and-clones", "block-mapping-tree", "redirect-snapshot", "space-accounting"]
  },
});
