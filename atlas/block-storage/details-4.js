// Details for the block storage plate, part 4: replication, storage node engine, cross-cutting concerns.
ATLAS.details("block-storage", {
  "replica-set": {
    s: "The group of nodes that each hold a copy of one chunk, with a defined primary and a membership that changes only through an epoch.",
    d: "A chunk's replica set is usually three nodes in different failure domains. One acts as primary for ordering writes, or all are peers in a quorum scheme. Membership is recorded in the chunk map and changes when a node fails, is drained or is replaced. Each change bumps an epoch so that nodes can tell an old configuration from the current one. The hard part is membership change safety: during the swap of one member, the old and new sets must overlap so no acknowledged write is on only departing nodes.",
    k: ["Three full copies versus two plus erasure-coded history: three copies give simple fast recovery and reads, while fewer copies cut cost and complicate recovery.", "Fixed primary versus leaderless peers: a primary gives easy ordering and a failover step, while leaderless avoids failover but needs version reconciliation."],
    p: ["Replacing a member before the new one is caught up leaves two current copies, so one more failure loses data.", "A node that serves a chunk after being removed from the set returns old data."],
    v: "Replace one member of a replica set under writes and confirm that at every instant at least a write quorum held every acknowledged write, and the final three copies are byte-identical.",
    dep: ["epoch-manager", "failure-domain-model", "chunk-map"]
  },
  "primary-backup-protocol": {
    s: "The write protocol in which a primary orders each write, forwards it to backups and acknowledges the client once enough copies are durable.",
    d: "The primary assigns a sequence number to each write, sends it to the backups, and each persists it to its journal and replies. When the required number have replied, the primary acknowledges the client and later tells replicas that the write is committed. Writes within a chunk apply in sequence order. On primary failure a backup with the most complete log is promoted under a new epoch, after reconciling logs. The hard part is promotion: a new primary must discover every acknowledged write before accepting new ones.",
    k: ["Primary fans out to all backups versus chain replication: fan-out has lower latency and tolerates a slow backup, while chain makes better use of the primary's network at higher latency.", "Acknowledge after all replicas versus after a quorum: all replicas give simpler recovery but are as slow as the slowest, while quorum hides one slow node."],
    p: ["Promoting a backup that missed acknowledged writes loses them silently.", "A primary that continues after losing its lease accepts writes that the new primary never sees."],
    v: "Kill the primary after it acknowledges a burst of writes and before it tells backups they are committed. Confirm the promoted primary has all of them, in the original order, and a new write is sequenced after them.",
    dep: ["replica-set", "write-quorum", "sequence-and-versioning", "write-ahead-journal"]
  },
  "write-quorum": {
    s: "The rule for how many replicas must persist a write before it is acknowledged, chosen together with the read rule so reads always see acknowledged data.",
    d: "With three replicas, acknowledging after two persist a write means any later two-member read set must include one that has it. The design may require all, a majority, or a majority plus a sync mark on the journal device. Reads either go to the primary, which knows the committed point, or to a quorum. The quorum can shrink temporarily during recovery with a limit. The hard part is deciding whether to keep accepting writes when only one replica is up: availability argues yes, durability argues no.",
    k: ["Majority quorum versus all replicas: majority tolerates one slow or failed node on every write, while all-replica is simpler but makes a single failure stop writes.", "Continuing with a degraded single copy versus halting writes: continuing preserves availability but risks losing data to the next failure, and halting protects data at the cost of an outage."],
    p: ["A read quorum that does not intersect the write quorum can return stale data after a failure.", "Continuing to write with one copy for hours converts a single node failure into permanent loss."],
    v: "Disable one replica, confirm writes still acknowledge with two copies durable, then disable a second and confirm writes either stop or follow the documented degraded policy, with no acknowledged write unreadable.",
    dep: ["replica-set", "primary-backup-protocol"]
  },
  "sequence-and-versioning": {
    s: "The ordering numbers attached to every write, per chunk and per volume, that let replicas agree on order and detect gaps, duplicates and stale data.",
    d: "Each write gets a sequence number within the chunk's epoch. Replicas apply in order, hold back writes that arrive early and reject gaps beyond a limit. A version number, combining epoch and sequence, identifies the state of a chunk. Version numbers are used by resync to find what a lagging replica lacks, by the frontend to detect stale maps, and by snapshots to define a cut. The hard part is ordering across chunks: a request spanning chunks has no global sequence, so cross-chunk consistency is limited to what barriers provide.",
    k: ["Per-chunk sequence versus a per-volume global order: per-chunk scales independently, while a volume-wide order gives stronger cross-chunk guarantees and a serialization point.", "Epoch included in the version versus a separate field: combined versions compare directly, but changing the epoch scheme changes the format."],
    p: ["A sequence reset after failover without incrementing the epoch makes old and new writes indistinguishable.", "Dropping the gap check lets a write apply before its predecessor and then be overwritten by it."],
    v: "Deliver writes 1, 3 and then 2 to a backup and confirm it applies 1, holds 3 until 2 arrives, then applies 2 and 3 in order, with versions reported correctly at each step.",
    dep: ["epoch-manager", "replica-set"]
  },
  "read-path": {
    s: "Chooses which replica serves a read and verifies the result, balancing latency, load and freshness.",
    d: "Reads may go to the primary, which always has the committed state, or to any replica known to be up to date by version. The frontend picks by recent latency and load, avoiding degraded nodes. The node checks the stored checksum before replying and, on mismatch, returns an error so the frontend tries another replica and triggers repair. Reads from backups require knowing the commit point. The hard part is staleness: a replica that lags must not serve a block a client already saw newer.",
    k: ["Reading from the primary only versus from any replica: primary-only gives simple freshness, while any-replica spreads load and lets hedging work.", "Verifying checksums on every read versus only on scrub: per-read verification catches corruption before the guest sees it, at a CPU cost."],
    p: ["A lagging replica serves an old block after the client has seen a newer one.", "A node returning data without verifying its checksum passes silent corruption to the guest."],
    v: "Corrupt a stored block on one replica, read it repeatedly, and confirm the guest always receives the correct bytes, the bad copy is reported and repaired, and the read latency rise is small.",
    dep: ["checksum-engine", "replica-set", "sequence-and-versioning"]
  },
  "replica-resync": {
    s: "Brings a lagging, returning or new replica up to date by sending the writes or ranges it missed, while the group keeps serving.",
    d: "A replica that was briefly down has a version behind the others. If the primary still has the intervening writes in its journal, it replays them. If not, resync compares per-region versions or checksums and copies only differing regions, or the whole chunk for a new member. During resync the replica does not count toward the quorum for reads. New writes are forwarded to it so it converges. The hard part is the handover: declaring the replica caught up exactly when it is, with no window of missing writes.",
    k: ["Journal replay for short gaps and full copy for long ones: replay is cheap and fast, while the full copy needs no history but moves more data.", "Region-version comparison versus checksum comparison: versions are cheap but need tracking on every write, and checksums are tracking-free but need reading all data."],
    p: ["Declaring a replica caught up before forwarded writes drain leaves it missing the latest writes.", "A resync that reads from a stale source copies old data over good data."],
    v: "Stop a replica, write ten thousand blocks, restart it, and confirm it receives only the missed writes, is excluded from reads until caught up, then passes a whole-chunk checksum comparison with its peers.",
    dep: ["sequence-and-versioning", "write-ahead-journal", "replica-set"]
  },
  "torn-write-protection": {
    s: "Ensures a write interrupted by a crash is applied either completely or not at all, at the unit the guest expects to be atomic.",
    d: "Drives guarantee atomicity only at a small sector size, but file systems and databases may assume larger atomic writes. The node journals a multi-sector write with a header and checksum, and on recovery a partial entry is discarded. Across replicas, a write that reached only some is resolved to one outcome at promotion. The service must also report its atomic write size honestly. The hard part is applying it without halving write speed, and handling a write that spans chunk boundaries across different nodes.",
    k: ["Journal everything before applying versus rely on drive atomicity: journaling gives atomic larger writes at the cost of double writes, while relying on the drive is fast but limits atomic size.", "Advertise a small atomic unit versus a large one: a small honest unit pushes safety work to the guest software, a large one demands more from the service."],
    p: ["A crash that persists half of an update leaves a block that matches neither the old nor the new content.", "A write spanning two chunks completes in one and fails in the other, and the service reports an error."],
    v: "Crash a node at random points during a stream of 64 KiB writes, many times, and confirm after recovery every block is wholly old or wholly new content, never a mix, at the advertised atomic size.",
    dep: ["write-ahead-journal", "checksum-engine"]
  },
  "consistency-scrubber": {
    s: "Periodically compares the content of every replica of a chunk, and repairs any difference by deciding which copy is correct.",
    d: "Beyond checksums per block, replicas can differ because of a lost write or a bug. The scrubber has replicas exchange digests over ranges of the chunk, narrows differences to individual blocks, and uses version information and per-block checksums to pick the authoritative content. The loser is repaired. It runs at low priority. The hard part is deciding correctness when replicas disagree and no copy has a bad checksum: it needs write history to decide, and sometimes must raise an alert rather than guess.",
    k: ["Compare digests over ranges versus every block: range digests are cheap and recursively narrow, while per-block comparison is simple but reads and sends much more.", "Repair automatically versus quarantine and alert: automatic repair keeps redundancy, while alerts prevent a bug from spreading by repair."],
    p: ["Comparing replicas while writes are in flight reports false differences.", "Automatic repair from a replica with a latent bug overwrites correct data."],
    v: "Create a lost write on one replica by suppressing a message, run the scrubber, and confirm it finds that one block, picks the correct copy by version and the three replicas then match.",
    dep: ["sequence-and-versioning", "checksum-engine", "scrub-scheduler"]
  },
  "erasure-coding": {
    s: "Stores a chunk as data and parity fragments across many nodes so it survives several losses at a fraction of the space of full replicas.",
    d: "A chunk is split into data fragments, and parity fragments are computed so any sufficient subset reconstructs it. Storage overhead is far below three copies. The costs are in the I/O path: a small write needs reading and updating parity, and a read with a missing fragment requires reconstruction from several nodes. Because of this it is used for cold, large or sealed data, with replication in front for hot writes. The hard part is the write-update path and rebuild cost, which touches many nodes for each lost fragment.",
    k: ["Replication for hot data and erasure coding for sealed data versus erasure coding everywhere: the mix keeps writes fast and still saves space, but adds a conversion step.", "Wide codes with low overhead versus narrow codes: wide codes save more space, but rebuild reads from many nodes and any slow member delays a read."],
    p: ["Small random writes to an erasure-coded chunk multiply into several reads and writes.", "Rebuilding one fragment reads many times its size across the network, loading the whole rack."],
    v: "Write a chunk with six data and three parity fragments, destroy any three fragments in turn, and confirm every read reconstructs the exact bytes, and storage used is about one and a half times the data size.",
    dep: ["replica-set", "placement-engine"]
  },
  "chunk-store": {
    s: "The node's local storage of chunks: maps a chunk identifier and offset to locations on drives and serves reads and writes against them.",
    d: "Each node holds many chunks across its drives, each a sparse file or a set of extents. Reads look up the extents through the block index and read them. Writes go through the journal and are applied to the data location later. The store exposes operations for create, write, read, truncate, delete and checksum, plus enumeration for scrubs and rebuilds. It manages drives independently so that a drive failure loses only its chunks. The hard part is consistent crash recovery across the journal, index and data.",
    k: ["Chunks as files on a general file system versus a purpose-built extent store: files reuse existing tooling, while the custom store avoids double journaling and gives control over placement.", "One drive per failure unit versus striping a chunk across drives: per-drive limits failure effects, while striping gives one chunk more bandwidth."],
    p: ["A crash between the journal commit and the index update leaves the index pointing to old data.", "Directory-style listing of millions of chunks makes enumeration and startup take minutes."],
    v: "Kill the node process during writes, restart, and confirm recovery finishes within its stated time, every chunk's content matches the last acknowledged write, and the index matches a full scan of the drives.",
    dep: ["write-ahead-journal", "block-index", "extent-allocator", "media-adapter"]
  },
  "write-ahead-journal": {
    s: "A sequential log on each node where writes are made durable first, then applied to their final place, so a crash can be recovered by replay.",
    d: "Every write is appended with its chunk, offset, sequence number and checksum, and acknowledged to the primary once the append is durable. A background process applies entries to the data layout and advances a checkpoint. After a crash, replay starts from the checkpoint and stops at the first invalid entry. The journal doubles as the source for resyncing lagging replicas. It lives on a fast device where available. The hard part is capacity and flow: if applying lags appending, the journal fills and writes stall.",
    k: ["Group commit of several writes versus one durable append per write: group commit raises throughput, but delays each write to fill the batch.", "Journal data and metadata versus metadata only: full journaling gives atomic data, while metadata-only is faster but permits torn data."],
    p: ["A journal that is never trimmed past a lagging replica's position grows until it fills the device.", "Acknowledging before the journal flush reaches the device cache loses writes on power failure."],
    v: "Write steadily, cut power at random times, restart, and confirm replay recovers exactly the acknowledged writes, ignores a partially written final entry and the journal checkpoint advances afterward.",
    dep: ["persistent-log-device", "checksum-engine", "media-adapter"]
  },
  "extent-allocator": {
    s: "Allocates and frees contiguous regions on a node's drives for chunk data, keeping fragmentation low and sequential access fast.",
    d: "Free space is tracked in a structure of free extents by size and location. Allocation prefers contiguous extents near related data and aligns to the drive's write unit. Frees are batched and return space for reuse after the metadata change is durable. On solid-state drives, allocation also considers erase block boundaries. The hard part is fragmentation under long-lived snapshots and overwrite patterns, which scatters a chunk's blocks, and keeping allocator state consistent after a crash.",
    k: ["Best-fit versus first-fit allocation: best-fit reduces fragmentation but searches longer, while first-fit is fast and fragments more over time.", "Log-structured allocation (always write to new space) versus in-place updates: log-structured gives sequential writes and easy atomicity, but needs cleaning to reclaim space."],
    p: ["Fragmented free space turns sequential reads into random ones and degrades performance as drives fill.", "Space freed before the metadata change is durable gets reused, and a crash revives a reference to overwritten data."],
    v: "Run a long mixed write and delete pattern, then confirm the extent count per chunk stays under a stated bound, free space equals the sum of free extents, and a post-crash scan finds no overlapping allocations.",
    dep: ["block-index", "media-adapter"]
  },
  "block-index": {
    s: "The node's persistent map from chunk and block offset to the location of the current data on drive.",
    d: "The index is a tree or hash structure that is updated whenever a write is applied or space is freed. It is kept in memory for speed and persisted through the journal and periodic checkpoints. Lookups on the read path must be fast and not touch the drive. For large nodes the index can reach gigabytes, so it is compact and partially paged. The hard part is rebuilding after a crash or index corruption: the index must be reconstructible from the journal and data layout, within an acceptable restart time.",
    k: ["Whole index in memory versus paged on demand: in-memory is fastest, while paged scales to larger drives and costs a drive read on a miss.", "Checkpoint frequency high versus low: frequent checkpoints speed recovery, but add background writes."],
    p: ["An index that exceeds memory after drives grow causes constant paging and slow reads.", "An index checkpoint that is not consistent with the journal position replays entries twice."],
    v: "Corrupt the index file, restart, and confirm the node rebuilds it from the journal and data in its stated time, then reads every chunk and compares with checksums with no mismatch.",
    dep: ["write-ahead-journal", "extent-allocator"]
  },
  "node-cache": {
    s: "A memory cache of recently read blocks and of metadata on each node, absorbing repeated reads and smoothing drive latency.",
    d: "Reads check the cache first. A hit returns in microseconds; a miss reads from drive and may insert. The cache sees different patterns from a local one because the guest's own cache absorbs most repeats, so what reaches the node is the leftover: cold, large or scan reads. Admission policies avoid evicting useful entries for one-time scans. Metadata is cached more aggressively. The hard part is invalidation on write and avoiding wasted memory on blocks the guest cache already holds.",
    k: ["Large cache versus using memory for the index and journal buffers: caching data helps repeated reads, but the index and write buffers give a more reliable gain.", "Admission filtering of scans versus caching everything: filtering protects hot data, but adds a decision cost and can reject useful blocks."],
    p: ["A large sequential read evicts the working set of hundreds of other volumes.", "A cache entry not invalidated on a write returns old data after the write was acknowledged."],
    v: "Read a hot range repeatedly and confirm hit rate and latency improve. Then run a large scan, and confirm the hot range stays cached. Write to the range, and confirm the next read returns the new data.",
    dep: ["chunk-store", "block-index"]
  },
  "checksum-engine": {
    s: "Computes and verifies a checksum for every block on write, read, scrub and replication, so corruption is detected wherever it occurs.",
    d: "Each block or small group carries a checksum computed when the data first enters the service and carried with it to the node, stored alongside, and verified on read and in transit. End-to-end checksums from the client catch corruption anywhere in between, including in memory and the network. Fast algorithms use hardware instructions. A mismatch makes the node return an error so another replica is used. The hard part is placing it: a checksum stored with the data cannot catch a write that went to the wrong place, so location information is included.",
    k: ["End-to-end checksum from the client versus checksum computed at the node: end-to-end catches corruption on every hop, but requires client cooperation and format agreement.", "Checksum per small block versus per large chunk: small blocks localize damage and allow partial reads, but use more metadata."],
    p: ["A checksum computed after a memory corruption certifies the corrupted data as valid.", "Checksums that do not include the address let a misdirected write pass verification."],
    v: "Corrupt a byte in the network path, a node's memory and a drive in turn, and confirm each is detected, none reaches the guest as valid data and the correct replica supplies the repair.",
    dep: ["media-adapter"]
  },
  "node-io-scheduler": {
    s: "Orders the drive operations on a node among foreground, journal, rebuild and scrub work, shaping what the drive sees to protect latency.",
    d: "Requests are queued per class and per volume. The scheduler limits drive queue depth so requests do not wait inside the drive where they cannot be reordered, favors reads over bulk writes when latency matters, and gives recovery a bounded share. Per-volume budgets enforce the purchased limits again at the node. It reacts to drive behavior, since solid-state drives slow during internal garbage collection. The hard part is that tuning one class hurts another, and optimal depth depends on the drive.",
    k: ["Shallow drive queues with scheduling in software versus deep queues: shallow keeps tail latency low and control with the scheduler, while deep queues give maximum throughput.", "Priorities by class versus weighted shares: strict priority gives the best foreground latency but can starve recovery, shares guarantee progress."],
    p: ["A deep drive queue lets one burst of writes delay a read by hundreds of milliseconds.", "Strict priority for foreground starves rebuild, and redundancy never recovers during sustained load."],
    v: "Run a writer at saturation with a latency-probing reader and compare the reader's 99th percentile with the scheduler on and with it disabled. Confirm rebuild still progresses at its guaranteed share.",
    dep: ["media-adapter", "iops-rate-limiter"]
  },
  "trim-and-reclaim": {
    s: "Returns freed space to the drives via discard, and reorganizes data so deleted and overwritten blocks become reusable free space.",
    d: "When a chunk or snapshot is deleted, the space is freed in the allocator and then discarded on the drive so solid-state media can erase it ahead of time, keeping write performance steady. Guests may also issue discard for blocks they free, which the service maps to unallocation if aligned. Log-structured layouts run a cleaner that moves live blocks and frees whole regions. The hard part is the cost of cleaning and discard timing: heavy discard can stall a drive, and cleaning competes with foreground writes.",
    k: ["Immediate discard versus batched discard: immediate frees space quickly but can disturb latency, while batched discard is smoother and delays reuse.", "Honoring guest discard versus ignoring it: honoring reclaims space for thin volumes, but exposes the guest's file system activity and costs work."],
    p: ["A discard storm after deleting a huge volume stalls drives and makes unrelated volumes slow.", "Without discard, a full drive's internal garbage collection raises write latency unpredictably."],
    v: "Delete a large volume and watch drive discard rate, foreground latency and free space over time. Confirm free space returns to the expected level and latency stays within bound.",
    dep: ["extent-allocator", "media-adapter"]
  },
  "media-adapter": {
    s: "The layer that talks to the drives through the operating system or directly, hiding drive types and exposing a uniform submit, complete and flush interface.",
    d: "It issues reads, writes, flushes and discards to drives with asynchronous interfaces, using polling or interrupts, and handles drive-specific details such as alignment, write unit, zoned or conventional layout, and error codes. It detects timeouts and reports slow drives. A direct, user-space path skips kernel overhead for flash. The hard part is honest durability: a flush must mean data is on stable media and not in a volatile drive cache, and drives differ in how they honor that.",
    k: ["Kernel block layer versus direct user-space access: the kernel is mature and shared safely, while direct access has lower latency and takes over error handling.", "Drive write cache enabled with flushes versus disabled: enabled with correct flushes is fast, while disabled is safe against faulty firmware but slow."],
    p: ["A drive that acknowledges a flush while data is still in volatile cache loses acknowledged writes on power loss.", "A drive that hangs for seconds on an operation and has no timeout stalls its whole queue."],
    v: "Write with flush, cut power to the drive mid-stream, and confirm every flushed write is present on restart on each drive model in the fleet, not only a reference model.",
    dep: ["media-pools"]
  },
  "durability-model": {
    s: "The target probability of losing an acknowledged write or a stored block, and the redundancy, repair speed and verification that must be in place to meet it.",
    d: "Durability is a number derived from failure rates, copy count, correlation, repair time and scrub coverage, and it constrains every layer. Replica count and recovery speed set how long data stays exposed. Scrubbing and checksums bound silent corruption. Snapshots and cross-region copies protect against human error and site loss, which replication does not. The hard part is that the number is a model: it assumes independence that correlated failures break, so it must be checked against observed events and drills.",
    k: ["Higher replica count versus faster repair: more copies add cost on every byte, while faster repair shortens exposure for all data with only bandwidth.", "Stating durability as a figure versus as a set of guarantees: figures are easy to compare, while guarantees such as when a write is safe are more useful to designers."],
    p: ["Counting independent drive failures but ignoring a firmware bug common to many drives overstates durability.", "A model that ignores repair queue delays after a large failure understates the real exposure."],
    v: "Run a failure drill that removes a rack and a drive from another rack, then confirm zero acknowledged writes are lost, redundancy is restored within the modeled time, and the observed exposure matches the model.",
    dep: ["replica-set", "re-replication-scheduler", "scrub-scheduler"]
  },
  "consistency-guarantees": {
    s: "What a guest may rely on: that acknowledged writes are durable, that reads return the latest acknowledged data, and what ordering and atomicity apply across failures.",
    d: "Block devices are expected to behave like a local disk: a read after an acknowledged write returns it, a flush makes earlier writes durable, and a single sector is atomic. The service provides this per chunk through its replica protocol and across chunks only where barriers and flushes apply. Multi-attach and snapshots add their own rules. Stating the contract exactly matters, since file systems and databases rely on specific guarantees. The hard part is cross-chunk ordering and the behavior of in-flight writes at a crash.",
    k: ["Strong per-volume ordering versus per-chunk ordering with barriers: volume ordering is the simplest contract but limits parallelism, while barriers match what guests actually need.", "Linearizable reads versus allowing replicas to lag: linearizable reads match local disks, while lagging reads give speed but violate expectations."],
    p: ["A flush that orders only writes seen by one frontend lets a failover reorder writes across a flush.", "Documenting weaker guarantees than the implementation gives lets clients depend on behavior that later changes."],
    v: "Run a file system and a database consistency checker through repeated crashes of the host, frontend and a node, and confirm each recovers without corruption or lost acknowledged commits.",
    dep: ["write-quorum", "sequence-and-versioning", "block-device-driver"]
  },
  "latency-budget": {
    s: "The allocation of the end-to-end latency target, in microseconds or milliseconds, to each hop: host driver, network, frontend, replication, journal and drive.",
    d: "A write that must take under a millisecond is split into slices: a few tens of microseconds in the driver, network round trips, frontend processing, a journal write on a fast device, and replication to a second node. Each component owns its slice and is measured against it. Tail targets matter more than averages because a request spanning chunks takes the slowest part. The hard part is that slices add and a single poor component, such as a retransmission timer or a garbage-collecting drive, consumes the whole budget.",
    k: ["Synchronous replication across zones versus within one zone: cross-zone survives a zone failure, but adds the network distance to every write.", "Tight per-hop budgets with hedging and early abandon versus generous budgets: tight budgets find regressions fast, while generous budgets tolerate variance but hide slow degradation."],
    p: ["One extra network hop added for a new feature uses up the margin without being noticed in averages.", "Measuring only the median hides that the budget is blown for one request in a hundred."],
    v: "Trace one million writes and confirm the per-stage latency percentiles sum within the end-to-end target, and that a deliberate 100 microsecond delay in one stage appears in that stage and in the total.",
    dep: ["latency-histograms", "tail-latency-hedging", "persistent-log-device"]
  },
  "multi-tenancy-and-fairness": {
    s: "How thousands of customers share drives, nodes and network while each gets the performance purchased, from placement through limits to scheduling at every layer.",
    d: "Fairness is enforced in several places: limits at the client and frontend, queues per volume, drive scheduling at the node and traffic classes in the network. Placement spreads load so no node is dominated by one tenant, and detection finds the exceptions. Overcommit of bursts and of capacity is a business decision backed by statistics. The hard part is that enforcement is local while load is global: each node may be within budget while a shared link or a popular source snapshot is overloaded.",
    k: ["Strict reservations versus statistical sharing: reservations guarantee performance but waste idle capacity, while sharing lets a node serve more volumes and sometimes disappoints.", "Isolation by limits versus isolation by separate hardware: limits are efficient, and hardware separation gives guaranteed behavior for premium types at higher cost."],
    p: ["A limit enforced at one layer only is bypassed by traffic that enters at another, such as rebuilds.", "Overcommitted bursts coinciding at a common time, such as a daily batch start, exceed what nodes can deliver."],
    v: "Run a hundred volumes at their limits next to one that attempts ten times its limit, and confirm the hundred keep their rates and tail latency within bound and the excess volume is held to its limit.",
    dep: ["iops-rate-limiter", "io-queue-manager", "node-io-scheduler", "noisy-neighbor-detection"]
  },
  "failure-domains": {
    s: "The decision about which simultaneous failures the service must survive without data loss or unavailability, such as a drive, server, rack, power feed or whole zone.",
    d: "This choice drives placement rules, the replica count, network design, metadata layout and operational procedures. Surviving a rack requires replicas in different racks and recovery bandwidth to match. Surviving a zone requires cross-zone replication and its latency, or a separate disaster-recovery mechanism with snapshot copies. Each higher level adds cost. The hard part is that failure domains are only real if they are independent in practice: shared software, firmware, certificates and control planes break the assumption.",
    k: ["Designing to survive a rack versus a zone: rack-level is cheap and fast, while zone-level survives more but costs latency, bandwidth and capacity.", "Hardware independence versus software independence: separate hardware is easy to arrange, while independent software versions across domains slow rollouts."],
    p: ["Replicas in separate racks sharing one top-of-rack firmware fail together on a bug.", "A control plane hosted in one zone leaves volumes in other zones unable to attach."],
    v: "Power off each domain level in a test environment, one at a time, and confirm the volumes the design claims to protect keep serving, with no data loss and with recovery completing in the modeled time.",
    dep: ["failure-domain-model", "placement-engine", "rack-topology"]
  },
  "online-evolution": {
    s: "Changing software, formats, hardware and configuration while volumes stay attached and serving, which constrains how every component versions its messages and data.",
    d: "Every component runs in mixed versions during a rollout, so wire protocols, journal formats, chunk formats and metadata schemas must be readable by the previous and next versions. Changes are staged: first tolerate the new form, then produce it, then remove the old one. Hardware changes follow the same pattern with drain, replace and rebalance. Feature flags separate deployment from activation. The hard part is that rollback must remain possible until late, so a format written by a new version has to remain readable by the old.",
    k: ["Strict backward and forward compatibility versus occasional flag days: compatibility allows continuous deployment but needs discipline in every change, while flag days are simpler per change and risky.", "Rolling in place versus cell-by-cell with a canary: canaries limit exposure to bad releases, at the cost of slower rollout and more versions in the fleet."],
    p: ["A new on-disk format written during a rollout cannot be read by the old version after rollback.", "A flag enabled in all regions at once removes the point of a staged rollout."],
    v: "Upgrade and roll back one component through mixed-version states under a continuous checksummed workload, and confirm no volume errors, no data differences and every version reads what the other wrote.",
    dep: ["fleet-upgrade", "initiator-protocol", "write-ahead-journal"]
  },
});
