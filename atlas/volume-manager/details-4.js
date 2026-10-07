// Details for the volume manager plate, part 4: write path, rebuild and scrubbing, cross-cutting concerns.
ATLAS.details("volume-manager", {
  "stripe-cache": {
    s: "A memory cache of stripes being read, written or reconstructed, which gathers the blocks needed to compute parity before issuing device I/O.",
    d: "Each cache entry holds the chunks of one stripe plus the state of each: valid, being read, dirty or being written. A write request attaches its blocks to the entry; the engine then decides what to read, computes parity and issues writes. Entries are reused for later requests to the same stripe, so sequential writes gather into full stripes. Handling is driven by a queue of stripes needing attention. It is hard because its size trades memory for the chance of full-stripe writes, and because all failure handling is in the same state machine.",
    k: ["Large vs small stripe cache: a large cache catches more full-stripe writes and uses memory, a small one saves memory and pushes more writes into read-modify-write.", "Delay writes to gather stripes vs write promptly: delay finds full stripes and lengthens the window of unflushed data, prompt writing is safe and costs extra reads."],
    p: ["An undersized cache stalls all writes when every entry is busy waiting on a slow member.", "Memory pressure shrinks the cache at the worst time, during a rebuild under load."],
    v: "Run sequential writes with the cache at different sizes and confirm the count of full-stripe versus partial-stripe writes in the statistics changes as expected, with identical data on verification.",
    dep: ["parity-calculation", "rmw-vs-reconstruct-write", "full-stripe-batching", "request-queue"]
  },
  "parity-calculation": {
    s: "Computing the parity chunks of a stripe from its data chunks, using exclusive-or for one parity and finite-field arithmetic for the second.",
    d: "Parity is computed over each byte position across the data chunks, in large buffers using vector instructions, or by an offload engine. Updating parity after a small change uses the old data, new data and old parity. For the second parity, each chunk is multiplied by a fixed coefficient before summing, and the routine picks the fastest available implementation at start. It is hard because the calculation must be correct for all member counts and consume little processor time at several gigabytes a second.",
    k: ["Software vector routines vs a hardware offload engine: software scales with processor cores and uses their cycles, an engine frees cycles and adds latency and a failure mode.", "Recompute parity from all data vs update from deltas: recompute needs all chunks read and handles any state, deltas read less and depend on old parity being right."],
    p: ["Parity computed over memory that was changed during the calculation produces a stripe that never verifies.", "A bad memory module or a bug in one optimized routine silently writes wrong parity, found only during a rebuild."],
    v: "Compute parity with every available implementation on the same random stripes and confirm byte-identical results, and with the reference implementation, then reconstruct a deleted chunk from the result.",
    dep: ["raid-single-parity", "raid-dual-parity", "stripe-cache"]
  },
  "rmw-vs-reconstruct-write": {
    s: "The choice for a partial-stripe write between reading the old data and parity to update it, or reading the untouched chunks to recompute parity from scratch.",
    d: "To change one chunk of a stripe, read-modify-write reads the old chunk and old parity and writes new ones, four I/Os. Reconstruct-write reads the other data chunks and writes the new chunk and parity, which costs fewer reads when most of the stripe is being written. The engine counts the reads each strategy needs and picks the smaller. In degraded mode the choice is constrained by the missing member. It is hard because the best choice depends on request size and failure state, and a wrong one makes writes slower.",
    k: ["Read-modify-write vs reconstruct-write: read-modify-write reads little for small writes, reconstruct wins once more than half the data chunks are being rewritten.", "Pick per stripe vs one strategy for the whole set: per stripe adapts to each request and is slightly more code, one strategy is simple and wrong for part of the workload."],
    p: ["Small random writes to a wide parity set generate four times as many device I/Os as the application sees.", "Applications issue writes just under a full stripe so each triggers a large reconstruct read."],
    v: "Write one chunk, then half the stripe, then a full stripe, and confirm device-level I/O counts match the model for each: four I/Os, fewer reads and no reads respectively.",
    dep: ["stripe-cache", "parity-calculation", "raid-single-parity", "degraded-mode"]
  },
  "write-hole": {
    s: "The window in which data and parity are updated non-atomically, so a crash leaves a stripe whose parity does not match its data and a later failure reconstructs garbage.",
    d: "A stripe update writes at least two members, and a crash can leave one written and one not. The data is still correct while all members are present, but the parity is wrong. If a member then fails, reconstruction uses the bad parity and returns wrong data for a block that was not even being written. The same hazard exists in mirrors, where the legs differ. It is hard because it is invisible until a second event, and cannot be fixed by ordering alone as the device can reorder.",
    k: ["Close the window with a journal vs repair by resync after a crash: a journal makes updates atomic and doubles write traffic, a resync scans the set after each unclean shutdown and leaves it exposed during the scan.", "Accept the risk vs defend: accepting is cheap and fails only after a crash followed by a failure, defending costs performance on every write."],
    p: ["After an unclean shutdown a disk fails before resync completes, and untouched files in the affected stripes are silently corrupted.", "Administrators assume parity RAID is crash-safe because the set is shown as clean."],
    v: "Crash the host in the middle of a stripe write, fail a data member before any resync, and compare the reconstructed data against what was written to show whether the hole is closed by the configured mechanism.",
    dep: ["write-journal", "write-intent-bitmap", "parity-calculation", "crash-consistency"]
  },
  "write-journal": {
    s: "A log on a separate fast device where a stripe's data and parity are recorded before they are written to the members, making updates atomic across crashes.",
    d: "Before writing a stripe the engine appends the data and parity to the journal and flushes it, then writes to the members and later marks the entry done. After a crash it replays any entry not marked done, so each stripe is either old or fully new. The journal is usually flash and mirrored, since it holds the only complete copy of in-flight data. It can also act as a write-back cache. It is hard because every write is done twice and the journal device becomes the throughput limit.",
    k: ["Write-through journal vs journal as write-back cache: write-through only provides atomicity, using it as a write-back cache accelerates writes and makes the journal device hold data that exists nowhere else.", "Journal on a separate device vs on the members: separate is fast and adds a failure point, on the members costs performance and needs no extra device."],
    p: ["A journal device without power-loss protection loses the entries it acknowledged, defeating its purpose.", "The journal fails and the set loses the atomicity guarantee silently or becomes unavailable, depending on policy."],
    v: "Cut power repeatedly during heavy stripe writes, restart after each, and after replay confirm every stripe's parity equals the recomputed parity and all acknowledged writes are present.",
    dep: ["write-hole", "flush-and-fua-ordering", "raid-mirroring", "volatile-write-cache"]
  },
  "write-intent-bitmap": {
    s: "A persistent bitmap of regions that may have writes in flight, so that after a crash or a brief member loss only those regions are resynchronized.",
    d: "Before a write begins, the bit for its region is set and the bitmap flushed; after all members complete, the bit is cleared lazily. After an unclean shutdown only regions with set bits need comparison and repair, turning a full resync of hours into seconds. When a member is temporarily removed and returned, only regions written meanwhile are copied. The bitmap lives in the superblock area or an external file. It is hard because the flush before each write adds latency, and the region size trades bitmap writes against resync granularity.",
    k: ["Large vs small regions: large regions mean few bitmap updates and more data resynced, small regions resync less and update the bitmap more often.", "Internal bitmap vs external file: internal travels with the set and costs head movement on the members, external is faster on a separate device and has to be kept with the set."],
    p: ["The extra bitmap flush on every write cuts small-write throughput on rotating disks sharply.", "A bitmap lost or out of date makes the code assume nothing was in flight and skips a needed resync."],
    v: "Crash during writes, restart, and confirm the resync covers only the marked regions and finishes quickly, then compare all legs and confirm they are identical.",
    dep: ["raid-mirroring", "raid-superblock", "initial-resync", "flush-and-fua-ordering"]
  },
  "flush-and-fua-ordering": {
    s: "The barrier and forced-unit-access requests that make a write durable and order it before later writes, which every layer must forward to every member.",
    d: "A flush request means everything acknowledged so far must reach stable media; a forced-unit-access write must be durable on its own completion. Filesystems and databases depend on them for journals and commits. A layer that splits a request or fans it to several devices must issue the flush to all of them and complete the original only when all have. Layers that reorder or batch writes must respect them as boundaries. It is hard because one layer that drops or weakens a flush breaks every guarantee above it without any visible error.",
    k: ["Honor every flush vs coalesce them: honoring each is simple and slow, coalescing concurrent flushes speeds up many small commits and needs care to keep the ordering.", "Pass flushes through vs implement ordering in the layer: passing through relies on devices to be correct, doing it in the layer lets it fix devices that mishandle them and costs more."],
    p: ["A layer completes a flush before its slowest member does, and a crash loses data that the filesystem believes is durable.", "A device that ignores flushes passes every functional test and loses data at the first power cut."],
    v: "Issue a write then a flush, cut power to the devices at the moment the flush completes, and confirm the write is present on all members after power returns, repeating many times.",
    dep: ["volatile-write-cache", "request-cloning-and-splitting", "device-error-semantics", "crash-consistency"]
  },
  "full-stripe-batching": {
    s: "Holding and merging writes so that a whole stripe is written at once, which needs no reads to compute parity and costs the least per byte.",
    d: "A full-stripe write has every data chunk in hand, so parity is computed from them directly and all members are written in parallel. The stripe cache waits briefly for adjacent writes to join, and large sequential requests naturally fill stripes. Filesystems can help by aligning allocations and write sizes to the stripe width the volume reports. It is hard because small, scattered or unaligned writes never form full stripes, and waiting for them adds latency.",
    k: ["Wait to gather vs write at once: waiting gets full stripes and adds latency and exposure, writing at once is prompt and pays the partial-write penalty.", "Report the stripe geometry to the filesystem vs hide it: reporting lets the filesystem align and batch, hiding keeps the layers independent and wastes the benefit."],
    p: ["A filesystem block size or offset that does not align to stripes turns every large write into two partial stripes.", "Batching hold-time makes a database's synchronous log writes slow."],
    v: "Write aligned sequential data and confirm statistics show nearly all stripes written as full-stripe with no reads, then shift the alignment by one block and confirm reads appear.",
    dep: ["stripe-cache", "rmw-vs-reconstruct-write", "io-alignment-and-geometry", "parity-layouts"]
  },
  "initial-resync": {
    s: "Making all members of a new redundant set agree by computing parity or copying data across the whole device in the background, before the set is fully protected.",
    d: "A newly created set has arbitrary content on its members. The initial resync reads the data and writes the redundancy, mirror copies or parity, so that every stripe is consistent. The set is usable meanwhile, and reads and writes behave normally, but redundancy is incomplete until it ends. Progress is recorded so a restart resumes. A shortcut skips it for new, empty sets by trusting later writes to create consistency. It is hard because the skip works only for mirrors and some parity cases and fails on reconstruct writes.",
    k: ["Full initial resync vs skipping it on a new set: full is safe and takes hours and competes with the workload, skipping starts instantly and can produce wrong reconstructions of never-written stripes.", "Resync at low priority vs at full speed: low priority protects applications and extends the unprotected time, full speed finishes sooner and slows them."],
    p: ["A new set is put into service with the resync skipped, and a later rebuild of a never-written stripe reads garbage parity.", "The first failure arrives before the initial resync completes and the set has no protection."],
    v: "Create a set and watch resync progress to completion, then fail a member and confirm every block, including never-written ones, reconstructs consistently compared with a full recomputation.",
    dep: ["raid-mirroring", "rebuild-throttling", "raid-superblock", "write-intent-bitmap"]
  },
  "rebuild-onto-spare": {
    s: "Reconstructing a failed member's contents onto a replacement device from the survivors, returning the set from degraded to fully redundant.",
    d: "For a mirror, the survivor is copied to the new device. For parity sets, each stripe is read from all survivors and the missing chunk is computed and written. The new member is added to the set's metadata at once, but is not trusted for reads until a region is rebuilt. Progress is stored for restart. Normal I/O continues. It is hard because the rebuild reads every surviving device completely, which stresses them when they are old and identical in age, and an unreadable sector on a survivor means loss of the stripe.",
    k: ["Rebuild at full speed vs throttled: full speed shortens the vulnerable window and slows applications, throttling protects service and extends the exposure.", "Rebuild only used regions vs the whole device: used-only shortens rebuilds and needs knowledge of the filesystem or thin layer, whole-device is generic and slower."],
    p: ["A second member fails under rebuild load, which is the common way large arrays are lost.", "An unreadable sector on a survivor aborts the rebuild at 99 percent."],
    v: "Fail a member in a loaded test set, add a spare, and confirm the rebuild completes, the status returns to clean, and the content of the new member equals the original member's checksum.",
    dep: ["hot-spares", "parity-calculation", "rebuild-throttling", "read-error-rewrite", "degraded-mode"]
  },
  "hot-spares": {
    s: "Idle devices attached to a set or pool in advance that take over automatically when a member fails, shortening the time spent degraded.",
    d: "A spare is registered with one set or a shared group of sets, and holds no data. When a failure is detected, the manager picks a spare of enough size, adds it and starts the rebuild without waiting for a person. Pool-wide spares can serve any set but need rules for which one is used. After the failed device is replaced, it becomes the new spare or the spare is returned. It is hard because a spare that is never exercised may be dead, and because spares in the same enclosure may share the failure that killed the member.",
    k: ["Dedicated spares vs shared pool of spares: dedicated is simple and strands capacity, shared uses fewer devices and needs fairness rules.", "Hot spare vs cold spare on a shelf: hot starts rebuilding in seconds and wears with the array, cold is cheap and waits for a person."],
    p: ["The spare has silently failed while idle, and the first failure finds nothing to rebuild onto.", "A spare that is smaller than the failed member is refused only when the failure occurs."],
    v: "Fail a member with a registered spare and confirm that the rebuild starts within the stated delay without intervention; also confirm that status lists the spare, with its health, before any failure.",
    dep: ["failure-policy", "rebuild-onto-spare", "drive-health-telemetry", "failure-domains"]
  },
  "scrubbing": {
    s: "Periodically reading every block of every member and checking redundancy, so latent errors are found and repaired while the set is still healthy.",
    d: "A scrub walks the whole set. Mirrors compare legs; parity sets recompute parity and compare. Unreadable sectors are rewritten from redundancy, which lets the drive remap them. It is scheduled in off-peak hours and throttled. The scrub finds sectors that have decayed unnoticed, which are otherwise discovered during a rebuild when no redundancy is left to fix them. It is hard because it costs I/O and wear on a busy system, and the schedule has to finish before the next one is due.",
    k: ["Frequent scrubs vs infrequent: frequent ones find latent errors sooner and use bandwidth and add wear, infrequent leave errors to be found during a rebuild.", "Check only vs check and repair: check only reports mismatches for judgment, repair fixes them automatically and can overwrite good data with bad when the wrong copy is picked."],
    p: ["Scrubs are never scheduled and the first read of a decayed sector happens during a rebuild.", "A scrub on a saturated array makes application latency unacceptable and gets turned off permanently."],
    v: "Plant a bad sector on one member, run a scrub, and confirm it is detected, rewritten from redundancy and counted in status, with the next scrub reporting zero errors.",
    dep: ["mismatch-repair", "read-error-rewrite", "rebuild-throttling", "bad-block-list"]
  },
  "mismatch-repair": {
    s: "Counting stripes or mirror regions where members disagree, and deciding whether and how to repair them, usually by rewriting parity from data.",
    d: "A check pass reports how many sectors disagree. For a mirror, the check cannot tell which leg is right, so repair picks one by a fixed rule, usually the first. For parity, repair assumes the data is right and recomputes parity, which is correct after a write-hole event and wrong if a data chunk is corrupt. Some counts are expected, such as swap and temporary data being rewritten while the check ran. It is hard because a nonzero count needs interpretation, and a repair always makes a choice.",
    k: ["Recompute parity from data vs trust parity and repair data: recomputing parity is the usual and fixes write-hole damage, trusting parity fixes data corruption and breaks the common case.", "Alert on any mismatch vs on a threshold: any mismatch alerts catch real corruption and fire on benign transient differences."],
    p: ["Repair copies a corrupt leg over the good one because the first leg is always chosen.", "Mismatch counts are ignored as normal, so real silent corruption is not noticed."],
    v: "Flip a bit on one leg of a mirror outside the RAID layer, run check and confirm the mismatch count is nonzero, then repair and confirm a second check reports zero.",
    dep: ["scrubbing", "write-hole", "integrity-tags", "parity-calculation"]
  },
  "bad-block-list": {
    s: "A per-member record of sectors known to be unreadable or unwritable, so the set avoids them and serves their data from redundancy.",
    d: "When a sector cannot be read and cannot be repaired by rewriting, it is added to a list kept in the member's metadata. Reads from the member skip those sectors and use another copy; the sector counts as degraded redundancy for that region. The list has a fixed size, and a full list is a sign to replace the device. Without the list, a member would be ejected for one bad sector. It is hard because it hides a worsening device, and two members with bad blocks in the same stripe lose data.",
    k: ["Keep a member with recorded bad blocks vs eject it at the first: keeping uses it and exposes the region, ejecting is conservative and rebuilds more often.", "Record bad blocks in the RAID layer vs rely on drive remapping: the RAID record is visible and portable, drive remapping is automatic until its spares run out."],
    p: ["Bad blocks on two members of a parity set overlap in a stripe and the stripe is unrecoverable.", "The list fills with entries and nobody reads it until the device fails completely."],
    v: "Inject an unwritable sector, run a scrub, and confirm it appears in the bad block list and reads of that area succeed from redundancy, with the status showing the member's count.",
    dep: ["read-error-rewrite", "raid-superblock", "device-error-semantics", "drive-health-telemetry"]
  },
  "rebuild-throttling": {
    s: "The minimum and maximum speeds that cap how much bandwidth rebuilds, resyncs, scrubs and migrations may take from application I/O.",
    d: "A background task is limited to a ceiling rate so applications keep their latency, and a floor that guarantees it progresses even under load. The throttle can watch application activity and speed up when the devices are idle. Rates are set per set or system-wide and can be changed during an operation. It is hard because there is no setting that is right for both safety, which wants the rebuild done quickly, and service, which wants it out of the way.",
    k: ["Fixed rate limit vs adaptive to load: fixed is predictable and wastes idle time or hurts at peak, adaptive uses idle time and may starve the rebuild.", "Prioritize the rebuild vs the application: rebuild first shortens risk, application first keeps users happy and extends it."],
    p: ["A default ceiling tuned for small disks makes a rebuild of large disks take weeks.", "The floor is set so high that the rebuild makes the volume unusable during business hours."],
    v: "Run a rebuild under a fixed application load at several rate settings and measure rebuild time and application latency, confirming both respond to the setting within the documented limits.",
    dep: ["rebuild-onto-spare", "scrubbing", "request-queue", "extent-migration"]
  },
  "read-error-rewrite": {
    s: "On an unreadable sector, getting the data from redundancy and writing it back to the failing member so the drive can remap the sector and the error is repaired.",
    d: "When a read fails on one member of a redundant set, the layer reads the data from another member, returns it to the caller, then writes it back to the failed location. If the write succeeds, the drive has reallocated the sector and the error is gone. If the write fails, the member is treated as failing and the bad block is recorded or the member is ejected. The mechanism is the reason periodic scrubbing works. It is hard because it must never rewrite from bad data and cannot work when redundancy is already gone.",
    k: ["Rewrite on read error vs just fail the member: rewriting keeps healthy drives with one bad sector in service, failing is simple and increases rebuilds.", "Rewrite at once vs at the next scrub: at once repairs quickly and adds writes during a read, at the scrub keeps reads fast and leaves the error for a while."],
    p: ["The read error occurs while the set is degraded, so there is no copy to rewrite from and the stripe is lost.", "Repeated rewrites to a dying sector area hide a failing drive until it dies."],
    v: "Make one sector return read errors, read it through the set, and confirm the data is returned correctly, the sector is rewritten, and a later direct read of the member succeeds.",
    dep: ["error-propagation", "raid-mirroring", "raid-single-parity", "bad-block-list"]
  },
  "failure-domains": {
    s: "Deciding which components can fail together, such as a disk, cable, controller, enclosure, power feed or host, and placing copies so that no single event removes them all.",
    d: "Redundancy only helps when copies do not share a fate. Mirror legs on one controller, or members on one power feed or from one manufacturing batch, fail together. Allocation policies, spares, set composition and placement of the metadata copies all express a view of the failure domain. The domain also determines how many members a set may lose. It is hard because the domains are mostly invisible to the volume manager, which sees device names, so humans must supply the knowledge, and it goes stale as hardware is changed.",
    k: ["Spread copies across domains vs pack them for performance: spreading survives bigger failures and may cost latency and cabling, packing is fast and has one common fate.", "Model domains explicitly vs leave them to administrators: explicit models allow enforcement and need upkeep, implicit ones are easy to start and silently wrong."],
    p: ["A shelf power failure takes both mirror legs because both were in the same enclosure.", "Disks of the same batch and age fail within days of each other during a rebuild."],
    v: "For each domain in the design, power off a whole domain in a test environment and confirm every volume is still available and degraded rather than lost.",
    dep: []
  },
  "crash-consistency": {
    s: "Deciding what state any layer may be in after an abrupt stop, and ordering writes, flushes and metadata commits so that every such state can be recovered.",
    d: "Every multi-step update, such as metadata across copies, data and parity, a copied block and its mapping, or a cache block and its dirty flag, can be interrupted between steps. Each layer defines its recovery states and uses a mechanism: copy-on-write with an atomic commit, a journal, a bitmap or an ordered write with a flush. Layers rely on the one below honoring flushes. It is hard because correctness depends on the whole stack, and a single dishonest device or layer makes the rest untestable.",
    k: ["Strong atomicity at every layer vs recovery by a check after a crash: atomicity is fast to recover and costs extra writes always, checking is cheap in steady state and slow after every crash.", "Trusting device flushes vs verifying them: trusting is the only practical choice and fails silently on bad devices, verifying needs power-fail testing."],
    p: ["A new layer is added that reorders writes and passes all functional tests but breaks recovery after a power cut.", "Recovery was tested only with a clean stop, never with torn writes."],
    v: "Repeatedly cut power during mixed workloads at random points across the whole stack, and after each restart check every layer's consistency check and compare data to the acknowledged-write log.",
    dep: []
  },
  "layer-stacking-order": {
    s: "The order in which encryption, caching, redundancy, thin provisioning and volumes are layered, which decides what each layer can see, protect and optimize.",
    d: "Encryption below a thin pool hides block contents but also the zeros and duplicates that the pool or device could exploit. Redundancy below encryption encrypts once and writes the ciphertext to every member, while encryption below redundancy encrypts every copy. A cache above redundancy caches logical blocks, a cache below caches per member. Each layer has an ideal place, and they conflict. It is hard because the order cannot be changed without recreating the volume, and the failure modes of the combination are rarely documented.",
    k: ["Redundancy below the other layers vs above: below gives one redundancy policy to everything and protects all data uniformly, above allows per-volume choices and repeats work.", "Few layers vs many: few have simple failure analysis and less overhead, many give features and make errors, stalls and recovery harder to reason about."],
    p: ["Encryption placed above a cache means cache and origin blocks cannot be compared or deduplicated, defeating the cache's policy.", "Each layer adds a copy of the request and a queue, and latency multiplies."],
    v: "Build the intended stack, trace one write down through every layer using the mapping tables, and confirm it reaches the devices as designed, with one failure injected at each layer and the result matching the design.",
    dep: []
  },
  "space-accounting": {
    s: "How free, used, shared and reserved space is counted at each layer, and which numbers an operator can trust.",
    d: "The group counts free extents, the thin pool counts mapped chunks and metadata, the snapshot store counts exceptions, a RAID set counts raw and usable capacity, and the filesystem counts its own free blocks. Thin provisioning, snapshots and compression make the totals not add up. Operators look at the filesystem's number while the pool runs out. It is hard because no single number is right: the amount that can still be written depends on sharing, discard behavior and which layer fills first.",
    k: ["Report raw capacity vs usable capacity: raw is simple and misleads on redundancy, usable accounts for parity and copies and needs layer knowledge.", "Per-volume accounting of shared blocks vs pool-wide totals: per-volume attribution is fair and expensive to compute, pool totals are cheap and hide who is consuming."],
    p: ["A filesystem reports plenty of free space while its thin pool is full and writes fail.", "Deleted files on a thin volume without discards leave the pool apparently full forever."],
    v: "Create a known set of volumes, snapshots and writes, then compute expected used space at every layer by hand and compare to the reported figures, explaining each difference.",
    dep: []
  },
  "io-alignment-and-geometry": {
    s: "Making partitions, extents, stripes, chunks and filesystem blocks start and size on boundaries that match the devices, so requests are not split or turned into read-modify-write.",
    d: "Devices have a physical sector that may be larger than the logical one they report, flash has erase and page units, and RAID has chunk and full-stripe widths. Each layer adds an offset and a unit. The right outcome is that the filesystem's blocks fall on multiples of all of them, and layers report their optimal sizes upward so the layers above can align. It is hard because one misaligned layer penalizes everything above it, and the cost shows up only as slow writes with no error.",
    k: ["Align everything at creation vs fix on demand: creation-time alignment costs a little space and avoids silent penalties, fixing later means rewriting data.", "Report optimal I/O sizes upward vs hide: reporting lets filesystems tune, hiding keeps layers independent and wastes the device's capability."],
    p: ["A partition table with an odd start offset makes every volume write straddle two physical sectors.", "Layer-reported optimal sizes are ignored by the filesystem, and large writes arrive in sizes that never fill a stripe."],
    v: "Compare device-level write counts and sizes with application writes for an aligned and a deliberately misaligned layout: aligned must show no extra reads and the same number of device writes as expected.",
    dep: []
  },
  "observability-and-alerting": {
    s: "Making failures and degradation visible: counters, events and alerts for each layer, with someone or something actually watching them.",
    d: "Redundancy hides failures by design, so a degraded set looks like a healthy one to applications. Observability supplies the missing signal: member state, rebuild progress, error and mismatch counters, pool fullness, cache dirty counts, drive health and snapshot validity. Alerts must be routed outside the storage they monitor. It is hard because the most dangerous conditions, such as a quiet degraded state, produce no application symptom, and a monitoring system that is silent looks identical to a healthy one.",
    k: ["Push alerts vs pull dashboards: alerts reach people quickly and add noise, dashboards give context and rely on someone looking.", "Alert on causes vs on symptoms: cause alerts such as member lost give early warning and many alerts, symptom alerts such as latency catch unknown problems late."],
    p: ["Monitoring runs on the degraded array it is meant to watch, and goes down with it.", "Alerts have gone to a mailbox no one reads since a reorganization, and the array has been degraded for months."],
    v: "Inject each class of failure in a test environment and confirm that an alert arrives at the on-call channel within the target time, and then silence the monitor deliberately and confirm a dead-man alert fires.",
    dep: []
  },
});
