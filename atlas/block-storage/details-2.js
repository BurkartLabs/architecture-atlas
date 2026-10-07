// Details for the block storage plate, part 2: metadata and placement, snapshots and clones.
ATLAS.details("block-storage", {
  "volume-metadata-service": {
    s: "The replicated database of volumes, attachments, chunk maps and replica groups that all other services treat as the source of truth.",
    d: "It stores the resource records, the per-volume chunk map and the membership of each replica group, and serves them with strong consistency. It is replicated with a consensus protocol and sharded by volume so no single group carries the whole fleet. Reads are served from cached copies with versions, while updates go through the leader. It is small relative to the data but its availability is a precondition for attach, snapshot and recovery. The hard part is scale and blast radius: a bug or overload here affects every volume.",
    k: ["Sharding by volume versus one global store: sharding scales and limits blast radius, but cross-volume operations such as quotas need coordination.", "Strongly consistent reads versus cached reads with versions: strong reads are simple, while cached reads with validation keep metadata off the data path."],
    p: ["A metadata outage that also blocks reads of the chunk map makes running volumes fail, not just new operations.", "Large chunk maps stored as one record make every small update rewrite the whole."],
    v: "Fail the metadata leader during a mixed workload and confirm a new leader serves within its stated time, running volumes keep reading and writing, and no committed update is lost.",
    dep: ["coordination-store", "epoch-manager"]
  },
  "chunk-map": {
    s: "The per-volume table that maps each fixed-size range of the volume to a chunk identifier, a version and the replica group holding it.",
    d: "A volume is cut into equal chunks, often tens to hundreds of megabytes. The map has one entry per chunk, with its identifier, current version, replica group and a flag for state such as allocated, shared with a snapshot or unwritten. Unwritten ranges need no entry until the first write. Updates are small and versioned so frontends detect staleness. Size is the challenge: a very large volume has a large map, so it is paged and cached by range.",
    k: ["Large chunks versus small chunks: large chunks keep the map small and sequential I/O fast, while small chunks give finer placement and snapshots at higher metadata cost.", "Sparse allocation on first write versus preallocating all chunks: sparse saves space and makes creation instant, but first writes pay an allocation delay."],
    p: ["Chunk size chosen too large makes a single hot volume concentrate load on one replica group.", "A map entry updated without bumping the version lets stale frontends keep writing to an old location."],
    v: "Create a one-terabyte volume, write at three distant offsets, and confirm the map holds exactly three allocated entries with correct groups, and reads of unwritten ranges return zeros without allocating.",
    dep: ["volume-metadata-service", "chunk-allocator"]
  },
  "chunk-allocator": {
    s: "Assigns a new chunk to a replica group on first write or growth, reserving space and recording it in the chunk map atomically.",
    d: "When a write touches an unallocated range, or a volume grows, the allocator asks the placement engine for a replica group, reserves capacity on each member and commits the map entry. Allocations are batched and often made ahead of need so the first write does not wait. Failed allocations release reservations. The hard part is correctness when failing mid-way: a reservation that never became a map entry, or an entry whose replicas never created the chunk, must both be detected and cleaned up.",
    k: ["Allocate ahead of writes versus on demand: pre-allocation hides latency, but holds capacity for volumes that may never use it.", "Reserve then commit versus commit then create: reserving first never overpromises, while commit-first is faster but can reference chunks that do not yet exist."],
    p: ["A crash between reservation and commit slowly leaks capacity unless a sweeper reclaims it.", "Concurrent first writes to one range both allocating create two chunks for one range."],
    v: "Issue two concurrent first writes to the same unallocated range and confirm exactly one chunk is allocated and both writes are applied to it, then confirm no reservation remains afterward.",
    dep: ["placement-engine", "capacity-tracker", "volume-metadata-service"]
  },
  "placement-engine": {
    s: "Chooses the set of nodes for each replica group so copies are in different failure domains and load and capacity stay balanced.",
    d: "It takes the failure-domain model, current capacity and load, the redundancy scheme and constraints such as zone, and returns a replica group. Algorithms range from random choice among eligible nodes, which spreads evenly and makes recovery parallel, to explicit packing. It also picks targets for re-replication and migration. The hard part is balancing goals that conflict: spread for parallel rebuilds, but limit the number of node combinations so that any simultaneous multi-node failure loses data in few volumes.",
    k: ["Random spread over many combinations versus a small number of fixed groups: random spread rebuilds fast from many sources, but any triple failure is likely to hit some data, while fixed groups lose more when they fail but less often.", "Capacity-weighted versus load-weighted choice: capacity keeps drives evenly full, while load keeps latency even, and the two can diverge."],
    p: ["Placement that ignores hot volumes puts two busy volumes on the same drive.", "Rules that are too strict leave no valid choice when a rack is down, and allocations fail."],
    v: "Allocate a hundred thousand replica groups in a simulated cluster and confirm none has two members in one failure domain, node fill stays within a stated spread, and the number of node pairs sharing data matches the design target.",
    dep: ["failure-domain-model", "capacity-tracker", "rack-topology"]
  },
  "failure-domain-model": {
    s: "A hierarchical description of what fails together: drive, server, rack, power feed, network switch and zone, used by placement and recovery.",
    d: "Every node is labeled with its position in a hierarchy of shared dependencies. Placement requires replicas to differ at a chosen level, and recovery uses the same labels to judge risk. The model must match reality: a rack that shares a power feed with another is not independent. Labels come from inventory and are verified against measured correlated failures. The hard part is keeping the model current as hardware is moved, and choosing the level at which to require independence, since stricter levels reduce usable choices.",
    k: ["Replicas in different racks versus different zones: zone-level separation survives a bigger failure but adds network latency to every write.", "Static labels from inventory versus learned from observed failures: static labels are simple but go stale, while learned correlations catch hidden dependencies."],
    p: ["A mislabeled rack lets all three replicas sit behind one switch.", "Treating a zone as independent when it shares a control plane makes the guarantee false."],
    v: "Fail one entire modeled domain at each level in a test cluster in turn and confirm every volume retains a readable and writable quorum for levels the design claims to survive.",
    dep: ["rack-topology"]
  },
  "capacity-tracker": {
    s: "Tracks free, reserved and used space and performance load on every node and drive, and feeds placement and alerts.",
    d: "Nodes report space and load periodically, and the tracker aggregates them by node, rack and pool, adding reservations made by allocations in flight. It supports headroom targets, so a pool is considered full before it reaches the physical limit, leaving room for rebuilds. It also exposes projections to operations. The difficulty is staleness: placement decisions made on old numbers can overfill a node, so reservations are accounted for immediately, and nodes enforce hard limits locally as a backstop.",
    k: ["Headroom reserved for recovery versus using all capacity: headroom allows rebuilds after a failure, but increases cost per usable byte.", "Pushed reports from nodes versus polling by the tracker: pushes are timely, while polling is simpler and detects silent nodes."],
    p: ["A pool kept at ninety-five percent full has no space to rebuild after a drive failure.", "Counting only used space and not reservations lets concurrent allocations overbook a node."],
    v: "Fill a test pool toward its headroom target and confirm new allocations are refused at the target, a drive failure then rebuilds fully into the remaining space, and node-reported and tracker totals agree.",
    dep: ["node-health-monitor"]
  },
  "rebalancer": {
    s: "Moves chunks between nodes in the background to even out space and load, and to use newly added or restored nodes.",
    d: "It compares nodes against the fleet average and selects chunks to move from over-full or hot nodes to under-used ones, subject to failure-domain rules and a rate limit. Each move is a copy followed by an atomic switch in the chunk map and a deletion of the old replica. New nodes start empty and are filled gradually. The hard part is not hurting the foreground: bulk copying competes for the same drives and network, so moves are throttled and avoid nodes already under load.",
    k: ["Continuous gentle rebalancing versus periodic large batches: continuous work keeps the cluster even and the cost low per hour, while batches are easier to schedule around peak but cause spikes.", "Balancing space only versus space and load: space-only is simple and stable, load-aware balancing improves latency but chases changing patterns."],
    p: ["Moving the same chunk back and forth because two criteria disagree wastes bandwidth.", "Adding many empty nodes at once triggers a flood of moves that slows customer I/O."],
    v: "Add ten empty nodes to a loaded cell and confirm that nodes converge to within the stated spread over time, foreground tail latency stays inside its bound, and no data read differs before and after.",
    dep: ["placement-engine", "migration-coordinator", "recovery-throttle"]
  },
  "epoch-manager": {
    s: "Issues monotonically increasing numbers for volume ownership and replica group membership, and manages time-limited leases so stale owners are always detected.",
    d: "Whenever a writer, a frontend or a replica group's membership changes, a new epoch is issued from the metadata service. Nodes and frontends include the epoch in every request and reject any lower one. Leases give a holder authority for a bounded time, renewable while healthy, so a partitioned holder loses authority on its own. The hard part is clocks and timing: the lease holder and the issuer must agree on duration even with clock drift, so holders stop acting before the issuer assumes they have.",
    k: ["Epochs checked at nodes versus only at the frontend: node checks are the real safety net against stale writers, but need every node to learn new epochs quickly.", "Lease-based authority versus continuous consensus per request: leases keep the data path fast, while per-request consensus is slower but needs no clock assumption."],
    p: ["A lease holder paused by a long garbage collection resumes and acts after its lease expired.", "A node that was down misses epoch updates and accepts an old writer when it returns."],
    v: "Pause a lease holder past expiry, let a new holder write, then resume the old one and confirm every write it sends carries a stale epoch and is rejected by all replicas.",
    dep: ["coordination-store"]
  },
  "coordination-store": {
    s: "A small, strongly consistent key-value store using consensus, used for leader election, configuration and the most critical shared records.",
    d: "A handful of replicas run a consensus protocol and hold small values such as the current metadata leader, shard assignments and global configuration. Clients watch keys and receive notifications on change. Because every other service depends on it, it is kept small, isolated and rarely written. It runs on its own hardware and is upgraded with special care. The hard part is that it is the root of trust for ownership: its unavailability stops leadership changes, and its misconfiguration can cause two leaders.",
    k: ["Dedicated small coordination cluster versus embedding consensus in each service: a shared store is one thing to operate well, but is a global dependency.", "Five replicas versus three: five tolerate two failures during a maintenance window, at more write latency and cost."],
    p: ["Storing large or frequently changing values in it overloads the very store that elects leaders.", "Placing all replicas in one failure domain removes the safety it was built to provide."],
    v: "Stop two of five replicas and confirm leader election and writes still proceed. Then stop a third and confirm writes halt with no divergence while reads of the last committed state remain correct.",
    dep: ["rack-topology"]
  },
  "snapshot-manager": {
    s: "Creates, lists, shares and deletes point-in-time snapshots, coordinating a consistent cut across all chunks of a volume.",
    d: "A snapshot request freezes the volume's chunk map at a point in time by recording the current versions of every chunk and marking them shared. Later writes to those chunks do not modify the saved versions. The cut must be consistent across chunks, so frontends briefly stop admitting writes or use a version barrier. Snapshots can be crash-consistent, matching the state after a sudden power loss, or application-consistent if the guest cooperates. The hard part is making the cut cheap and atomic on a busy volume.",
    k: ["Barrier at the frontend versus a pause of guest I/O: a short frontend barrier is invisible to the guest, but requires one owner per volume at that moment.", "Crash-consistent by default versus guest-quiesced: crash-consistent costs nothing and works for most file systems, while quiescing is needed for databases without their own recovery."],
    p: ["Taking snapshots from two frontends during a failover yields a cut that includes later writes in some chunks and not others.", "Treating a snapshot as a backup when it shares chunks with a volume in the same zone provides no protection from zone loss."],
    v: "Write blocks with an increasing counter while taking a snapshot, then restore it and confirm the counter values form a contiguous prefix with no later block present without all earlier ones.",
    dep: ["cow-map", "volume-frontend", "volume-metadata-service"]
  },
  "cow-map": {
    s: "Copy-on-write metadata that lets a volume and its snapshots share chunks until a write replaces one, tracking reference counts and ownership.",
    d: "Each chunk records how many maps reference it. A write to a shared chunk allocates a new chunk, writes the new data, and swaps the volume's map entry, leaving the old chunk to its snapshots. Partial writes to a shared chunk require copying the unmodified portions first. The first write after a snapshot is therefore slower. Reference counts are updated transactionally with the map. The hard part is write amplification and counting correctness: a lost decrement leaks space, and a lost increment deletes data in use.",
    k: ["Copy-on-write versus redirect-on-write (new writes go to new locations): redirect-on-write avoids the read-modify-write on first write but fragments data over time.", "Reference counts versus tracing reachability from maps: counts are immediate and cheap, but tracing finds leaks and corruption, so both are often used."],
    p: ["The first write after a snapshot of many chunks causes a visible latency spike as each chunk is copied.", "A reference count that drifts after a crash lets garbage collection delete a chunk another snapshot still needs."],
    v: "Snapshot a volume, overwrite part of a chunk, and confirm the snapshot still reads the old bytes, the volume reads the new, and the shared and private chunk counts and reference counts match expected values.",
    dep: ["chunk-map", "chunk-allocator", "volume-metadata-service"]
  },
  "snapshot-chain": {
    s: "The ordered lineage of snapshots of a volume, where each depends on earlier ones for unchanged data, and deleting a middle one must preserve the rest.",
    d: "Snapshots are either independent full maps sharing chunks by reference, or layers that store only changes over a parent. In a layered design, reading a block walks from the newest layer down until the block is found. Deleting an intermediate snapshot means merging its changes into a neighbor. Chains are kept short by merging or by flattening. The hard part is read cost and deletion: a long chain multiplies lookups, and merging must be safe against concurrent reads and new snapshots.",
    k: ["Full maps with shared chunks versus layered deltas: full maps give constant-cost reads and easy deletion, while deltas are smaller to store and quick to create.", "Merging on delete versus marking deleted and cleaning later: merging reclaims space at once, and lazy cleanup is simpler but holds space longer."],
    p: ["A chain of hundreds of layers makes reads of old data slow and unpredictable.", "A merge interrupted midway leaves a block visible in neither the merged layer nor its neighbor."],
    v: "Create ten snapshots with distinct changes, delete the fifth and sixth, and confirm every remaining snapshot still reads its original content block for block, and space for unique data is reclaimed.",
    dep: ["cow-map", "snapshot-manager"]
  },
  "clone-engine": {
    s: "Creates a new writable volume from a snapshot almost instantly by sharing its chunks, and diverges from the source on write.",
    d: "A clone starts with a chunk map pointing at the snapshot's chunks, marked shared. It is usable at once, and any write allocates private chunks. Many clones can derive from one snapshot, which suits provisioning many machines from one image. Placement prefers nodes already holding the source chunks. The hard part is the shared hot source: hundreds of clones reading the same chunks concentrate load on a few replicas, and the source snapshot cannot be deleted while clones depend on it.",
    k: ["Linked clones sharing chunks versus full copies: linked clones start instantly and save space, but depend on the source for reads and its replicas for performance.", "Allowing deletion of the source snapshot by promoting its data versus forbidding it: promotion frees the user, at the cost of a background copy."],
    p: ["A boot storm of hundreds of clones overloads the replicas that hold the shared image.", "Deleting a snapshot that has clones breaks them unless dependency tracking blocks it."],
    v: "Clone one image into two hundred volumes, confirm each is available within a second, boot-style reads succeed, and writes in one clone are not visible in another or in the source.",
    dep: ["cow-map", "snapshot-chain", "lazy-hydration", "placement-engine"]
  },
  "lazy-hydration": {
    s: "Fills a volume created from a snapshot from the backing store on demand, then copies the rest in the background until it no longer depends on the source.",
    d: "When the snapshot lives in cheaper storage, such as an object store, the new volume starts empty with a pointer to the source. A read of an unhydrated block fetches it from the source, writes it locally and returns it. A background process hydrates the remainder. Reads of cold blocks are slow at first, and a block-level bitmap records which blocks are present. The hard part is predictability: customers expect full performance at once, so the service may fast-restore by pre-hydrating, at higher cost.",
    k: ["Hydrate on read versus pre-warm everything before use: on-read lets volumes start immediately but gives uneven early latency, while pre-warm is predictable and delays use.", "Prioritizing blocks being read versus sequential background fill: priority helps the active working set, and sequential fill is simpler and finishes at a known time."],
    p: ["First reads after restore can be an order of magnitude slower, which breaks assumptions in startup scripts.", "Losing the bitmap treats hydrated blocks as missing and fetches again, or hydrated as present and returns zeros."],
    v: "Restore a snapshot into a volume, read random blocks at once and record latency, then wait for background fill and confirm latency drops to the type's normal level and every block matches the source checksum.",
    dep: ["clone-engine", "cross-region-copy", "chunk-store"]
  },
  "snapshot-diff": {
    s: "Lists exactly which blocks differ between two snapshots, so backups and copies move only changed data.",
    d: "Since snapshots share chunks by identifier, comparing two chunk maps shows which chunks differ, and a finer block-level bitmap or comparison inside those chunks shows which blocks. The result is a list of ranges, which an export or replication job reads and transfers. It can be answered from metadata alone, without reading data. The hard part is granularity and cost: chunk-level comparison is fast but coarse, and block-level data requires change tracking that costs space and write-path work.",
    k: ["Track changed blocks at write time versus compute by comparing data later: tracking makes diff cheap, but adds write-path work and metadata.", "Chunk-granularity diff versus block-granularity: chunk-level is nearly free, though a one-byte change causes a whole chunk to be transferred."],
    p: ["A chain broken by an early snapshot's deletion makes the diff unavailable, forcing a full copy.", "A diff computed between snapshots from different volumes silently reports everything as changed."],
    v: "Change twenty known blocks between two snapshots and confirm the diff lists exactly those ranges, a transfer of that diff to another store reproduces the later snapshot byte for byte.",
    dep: ["snapshot-chain", "chunk-map"]
  },
  "snapshot-schedule": {
    s: "Takes snapshots automatically on a policy such as hourly or daily and retains a bounded number or age, deleting the oldest.",
    d: "Policies attach to volumes by tag or by explicit list and define a frequency, a start window and a retention count or duration. A scheduler creates snapshots through the same API as manual ones and then prunes old ones, never beyond what retention allows. Jitter spreads the start times so thousands of volumes do not snapshot on the hour. Failures are retried and reported. The hard part is scale and honesty: a policy that silently skips volumes when the system is busy gives customers false confidence in their recovery points.",
    k: ["Spread start times with jitter versus exact times: jitter flattens load, but customers lose precise recovery points.", "Retention by count versus by age: count is predictable for cost, and age matches compliance needs but can accumulate many snapshots when frequency is high."],
    p: ["Retention pruning that counts failed snapshots deletes the last good one.", "Every volume snapshotting at midnight overloads the control plane."],
    v: "Attach an hourly policy with retention of three to twenty volumes, run for six simulated hours, and confirm each volume has exactly three snapshots, the newest three, and any skipped run is reported.",
    dep: ["snapshot-manager", "volume-api"]
  },
  "snapshot-gc": {
    s: "Reclaims chunks no snapshot or volume references, by reference counting and periodic sweeps that verify the counts.",
    d: "After a snapshot is deleted its references are released, and chunks reaching zero are queued for deletion with a delay. A periodic sweep walks every chunk map to recompute what is referenced and compares it with the counts, finding leaks and errors. Deletions are throttled because they produce many small operations on nodes. The hard part is safety: deleting a chunk that is referenced is irreversible, so deletions wait out a grace period, and sweeps are conservative when metadata is in doubt.",
    k: ["Delayed deletion with a grace period versus immediate: delay allows recovery from bugs and races, at the cost of holding space for hours or days.", "Reference counts alone versus counts verified by sweeps: counts are fast, and sweeps catch the inevitable drift but are expensive at scale."],
    p: ["A sweep run against a stale metadata snapshot deletes chunks created after it began.", "A deletion burst after removing a very large snapshot saturates the nodes' queues."],
    v: "Delete a snapshot with unique data and confirm the chunks leave only after the grace period, space is reclaimed to the expected amount, and every remaining snapshot and volume still reads correctly.",
    dep: ["cow-map", "snapshot-chain", "trim-and-reclaim"]
  },
  "cross-region-copy": {
    s: "Copies a snapshot to another region for disaster recovery or migration, sending only blocks the destination lacks.",
    d: "A copy job reads the snapshot through a diff against the latest snapshot already at the destination, compresses and encrypts the changed ranges, transmits them over a wide-area link and registers a new snapshot there. The destination re-encrypts with its own key. Bandwidth is limited so interactive traffic is not harmed. The hard part is the long, interrupted transfer: jobs must be resumable at block granularity, and verification must prove the destination matches the source by checksum.",
    k: ["Incremental copy against a base versus full copy each time: incremental is far cheaper, but depends on the base staying intact at the destination.", "Re-encrypting with the destination key versus carrying the source key: re-encryption keeps keys regional, at the cost of compute and a key-handling step on each side."],
    p: ["A resumed copy that trusts a stale progress record skips blocks and produces a snapshot with holes.", "Copying at full speed saturates a shared wide-area link and delays other regions' replication."],
    v: "Copy a snapshot between two regions, interrupt it midway, resume it, then restore at the destination and confirm the full-volume checksum equals the source's.",
    dep: ["snapshot-diff", "key-service-client", "transport-stack"]
  },
});
