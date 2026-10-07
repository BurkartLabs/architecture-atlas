// Details for the distributed filesystem plate, part 3: placement, redundancy, recovery.
ATLAS.details("distributed-filesystem", {
  "chunking-and-stripes": {
    s: "Cutting files into fixed-size chunks and optionally striping consecutive pieces across several chunks, which sets the unit of placement, repair, caching and parallelism.",
    d: "A chunk is the unit that is placed, replicated and repaired, commonly tens to hundreds of megabytes. A stripe pattern spreads consecutive blocks over several chunks so one file read engages many servers. Small chunks balance load and parallelize better but increase metadata and repair work; large chunks cut metadata and favor sequential access. Some designs use variable chunk sizes that grow with the file. The hard decision is that chunk size is nearly impossible to change later because it appears in metadata, clients and the repair code.",
    k: ["Large chunks versus small: large chunks keep chunk maps small and sequential reads efficient, but waste space on small files and concentrate hot data on few servers.", "Striping across chunks versus one chunk per range: striping multiplies single-file bandwidth, but one lost chunk now damages the whole stripe set."],
    p: ["A chunk size tuned for large video files makes the metadata size explode for millions of small files.", "Aggressive striping on files read by many clients spreads load and increases the number of nodes that can slow one request."],
    v: "Create files of one byte, one chunk and many chunks, and confirm space used, chunk count and per-file read parallelism match what the layout parameters predict.",
    dep: ["file-chunk-map", "placement-function"]
  },
  "placement-function": {
    s: "The rule that picks which servers hold a given chunk, either computed from the chunk's identifier and the cluster map or recorded by an allocator, balancing load and respecting failure domains.",
    d: "A computed function, such as a hash into a weighted tree of failure domains, lets any client work out locations without asking the metadata service and moves little data when nodes join or leave. An allocator instead chooses servers using current free space and load, and records the answer. Weights reflect capacity so large disks get proportionally more. The difficulty is stability: a small change in the map must not reshuffle large amounts of data, and the function must be identical on every client and server.",
    k: ["Computed placement versus allocated and recorded: computed removes lookups and metadata, but cannot place a chunk with regard to current load; allocated is flexible and needs more metadata.", "Weighted by capacity versus uniform: weighted uses mixed hardware fully, but makes smaller disks hold fewer chunks and fail with less pressure while large disks carry more load."],
    p: ["Clients using different map versions compute different locations and miss data.", "Removing one node causes a reshuffle far beyond the data it held when weights are poorly chosen."],
    v: "Add one node of a hundred and confirm about one percent of chunks move, all of them to the new node, and that clients and servers compute identical locations for a sample of ten thousand chunks.",
    dep: ["cluster-map", "failure-domain-tree"]
  },
  "placement-groups": {
    s: "An intermediate layer that assigns chunks to a fixed number of groups, each mapped to a set of servers, so recovery and bookkeeping work per group instead of per chunk.",
    d: "Chunks hash into one of a few thousand to millions of groups. Each group maps to an ordered list of servers, and membership, versions and repair are tracked at the group level. This keeps cluster state small, since the monitors hold group maps, not chunk locations. A failed server affects only the groups it belongs to, and those can be repaired in parallel from many peers. Too few groups make balance poor; too many multiply peering and memory cost. Changing the group count later is costly.",
    k: ["Group-level tracking versus per-chunk: groups make state and recovery cheap and uniform, but make fine placement control and moving a single chunk impossible.", "Larger group count versus smaller: more groups balance better and spread repair, but each server holds more groups to track and peer with."],
    p: ["Too few groups leave some servers carrying twice the load of others, with no way to fix it short of resharding.", "Each group on the same set of servers means a rare triple failure can lose every chunk in the group at once."],
    v: "Count groups per server and confirm the spread is within a few percent of the mean, then fail one server and confirm repair reads come from many different peers in parallel.",
    dep: ["placement-function", "cluster-map"]
  },
  "failure-domain-tree": {
    s: "A model of the physical hierarchy of disk, server, rack, row, room and site, used so that copies or fragments of a chunk never share a single point of failure.",
    d: "Operators describe where each server sits. Placement then requires, for example, that no two copies share a rack and that coded fragments are spread over at least a given number of racks. The tree also defines what counts as one failure: a power feed or a top-of-rack switch can take down dozens of servers together. Higher levels give stronger protection but need more domains than copies. The hard part is accuracy, since a wrongly labeled rack silently removes the protection the design assumed.",
    k: ["Spreading across racks versus across servers only: racks survive switch and power failures, but need enough racks, and cross-rack traffic is costlier.", "Strict rules that refuse placement versus preferring spread when impossible: strict never weakens protection and can block writes when domains run out, while preferring keeps writes flowing at lower safety."],
    p: ["A new rack added without its location label is treated as part of another rack, and copies end up sharing it.", "A two-rack cluster with three copies cannot satisfy rack-level rules and quietly falls back."],
    v: "Power off one rack in a staging cluster and confirm every chunk still has at least its minimum number of copies or fragments reachable and all data remains readable.",
    dep: ["cluster-map", "network-topology"]
  },
  "allocation-policy": {
    s: "The logic that picks servers for new chunks using free space, load, age and recent failures, spreading writes evenly without overloading a new or nearly empty server.",
    d: "When a client opens a file for writing or a chunk fills, the allocator picks a replica set that satisfies failure-domain rules, then prefers servers with the most free space and lowest recent write rate, adding randomness to avoid herding. It limits how many new chunks a fresh server receives at once, since it would otherwise attract all writes. It considers pool, tier and tenant rules. The challenge is that allocation is on the write path of every file and must stay fast while using information that is slightly out of date.",
    k: ["Choose by free space versus uniform random: free space equalizes utilization, but sends traffic to the newest servers; random is even and drifts as disks differ in size.", "Allocation by the metadata service versus by the client: central keeps policy in one place, while client-side removes a round trip and spreads work."],
    p: ["A freshly added empty node receives every new chunk and becomes the write hot spot.", "Using stale utilization reports fills a server beyond its quota before the allocator notices."],
    v: "Add an empty server and write a large dataset, then confirm the new server's share of writes rises gradually to its fair proportion and no server exceeds its fill target.",
    dep: ["placement-function", "failure-domain-tree", "space-reservation"]
  },
  "chunk-versions": {
    s: "A version number on each chunk, increased on every change in membership or mutation, so stale replicas can be recognized and never served as current.",
    d: "The metadata service records the latest version of every chunk. Each replica stores its own version. When a write succeeds on a quorum, the version advances. A server that was down and returns with an older version is marked stale, its copy ignored and later removed or refreshed. Clients and fencing checks also use versions to detect that they talk to an outdated replica. It is difficult to keep versions durable and cheap: every write cannot journal a version bump, so many systems bump only on events that change the replica set.",
    k: ["Bumping on every write versus on membership change: every write is precise and costly to persist, while per-membership versions are cheap and rely on the write path for within-version ordering.", "Version stored with the chunk versus only in metadata: storing it with the chunk survives metadata loss, but needs a reconcile pass to agree after restarts."],
    p: ["A stale replica returning after a long outage is read as current if versions are not checked on reconnect.", "Two servers each believing they are primary for the same version cause diverging replicas."],
    v: "Stop one replica, write to the chunk, restart the replica, and confirm it is marked stale, serves no reads, and is brought to the current version before it counts toward redundancy.",
    dep: ["file-chunk-map", "fencing-tokens"]
  },
  "small-file-packing": {
    s: "Combining many small files into larger shared containers on storage nodes, so that tiny files do not each consume a chunk, a replica set and a metadata record on the data side.",
    d: "Writers or a background packer collect small files into a container of a standard chunk size and record for each file the container and the offset and length within it. Reads fetch the byte range. Deleting a file marks its range dead, and compaction rewrites containers that are mostly dead. This reduces chunk count, repair work and disk seeks. The challenge is the cost of compaction and the second indirection: the metadata still holds one entry per file, and a container with live and dead files needs bookkeeping.",
    k: ["Packing at write time versus a background packer: write time gives immediate benefit and delays acknowledgment for batching; background is simple and leaves small chunks for a while.", "Container compaction by liveness threshold versus never: compaction reclaims space, but rewrites data and changes locations that caches hold."],
    p: ["A few live files pin large containers, so deleted space is never returned.", "Reading a single file from a container fetches more than needed if alignment rules are too coarse."],
    v: "Write a million four-kilobyte files and confirm chunk count is a small fraction of file count, then delete most of them and confirm compaction reclaims space and the survivors read back unchanged.",
    dep: ["file-chunk-map", "chunking-and-stripes"]
  },
  "inline-small-files": {
    s: "Storing the data of very small files inside their metadata record, avoiding chunk allocation and a separate data round trip entirely.",
    d: "If a file's content fits below a threshold, a few kilobytes, the bytes are stored in the inode or beside it in the metadata store, replicated through the same journal. Reading the file needs only the metadata lookup. This makes directories of tiny files, such as configuration or source trees, fast. The costs fall on the metadata service: inline data raises its memory and journal volume, and when a file grows past the threshold its data must migrate to chunks atomically.",
    k: ["Inline small data versus always chunked: inline halves requests for tiny files, but moves capacity pressure onto the scarcest part of the system.", "Low threshold versus high: a low one protects metadata memory, while a high one speeds more files and risks overload by a few workloads."],
    p: ["A workload writing millions of inline files exhausts metadata memory before any data disk fills.", "Growing a file past the limit during concurrent reads exposes a window where the data is in neither place."],
    v: "Create a file at the threshold and one byte above, and confirm the first is served with a single metadata request and no chunk, the second has a chunk, and growing across the line preserves contents.",
    dep: ["inode-store", "metadata-journal"]
  },
  "locality-hints": {
    s: "Information that lets schedulers and clients place computation near the servers holding the data, or request placement on a particular rack or node for a new file.",
    d: "An interface returns which servers hold each chunk of a file so a job scheduler can run a task on or near one of them, saving network bandwidth. In the other direction, applications may hint that a new file should be placed near an existing one or in a given zone. Rack-awareness and failure domains supply the distances. The benefit depends on network oversubscription; with a fast flat network locality matters less. The risk is that hints conflict with balance and failure-domain rules.",
    k: ["Exposing replica locations versus hiding them: exposure enables moving work to data, but ties applications to layout details that change under repair.", "Honoring placement hints strictly versus advisory: strict gives predictable layout, but breaks balance and can concentrate failures; advisory is safe and unpredictable."],
    p: ["Locations cached by a scheduler go stale after repair and tasks run remote while believing they are local.", "A hint placing a dataset's copies in one rack defeats failure-domain protection."],
    v: "Ask for the locations of a file's chunks, run a task on a listed server, and confirm its reads are served from local disk, with no network data transfer, while the file stays correctly spread across racks.",
    dep: ["file-chunk-map", "network-topology"]
  },
  "replication-pipeline": {
    s: "Sending a chunk's data to all its replicas by passing it along a chain or tree of servers, so the client uses its link once and each server uses its own for forwarding.",
    d: "The client sends data to the nearest replica, which forwards to the next while still receiving, so total time is close to one transfer. A primary orders mutations and assigns a sequence; secondaries apply in that order and acknowledge. Data flow and control flow can be separate: bytes along a chain, commit decisions from the primary. Failure of any member fails the write for that member, and the client or primary reconfigures. It is hard to define exactly when a write is acknowledged, durable and visible, and what each replica holds after a partial failure.",
    k: ["Chain forwarding versus client fan-out to every replica: a chain uses the client link once and adds latency per hop; fan-out has lower latency and multiplies client traffic.", "Primary-ordered versus leaderless: a primary gives a single order and a hot spot, while leaderless avoids it and needs conflict handling."],
    p: ["A slow replica in the middle of a chain delays every write passing through it.", "After a partial failure, replicas hold different lengths and need reconciliation before anyone can read."],
    v: "Write a large chunk with three replicas, kill the middle server mid-transfer, and confirm the client reports success only after a valid replica set holds identical bytes with matching checksums.",
    dep: ["write-quorum", "chunk-versions", "rpc-layer"]
  },
  "write-quorum": {
    s: "The number of replicas that must confirm a write before it is acknowledged, chosen against the number that must agree on reads, which fixes durability and availability together.",
    d: "With N copies, a write quorum W and read quorum R, choosing R plus W greater than N guarantees reads see the last committed write. Filesystems often use all live replicas for writes and any one for reads, relying on versions and metadata to exclude stale copies. A lower W lets a write finish despite a slow or failed server, and reduces the durability at the moment of acknowledgment. The challenge is deciding whether to wait when a replica is temporarily slow, and what to do about that replica afterward.",
    k: ["Acknowledge after all replicas versus majority: all is the strongest durability and stalls on the slowest, majority tolerates slow members and leaves one copy behind.", "Fixed quorum versus adaptive on failure: adaptive keeps writes flowing by shrinking the replica set, but runs briefly with less protection."],
    p: ["Acknowledging after one copy lands means a single disk failure right after loses acknowledged data.", "Waiting on all replicas makes write latency track the slowest disk in the group."],
    v: "Kill one replica during a write with a three-way quorum and confirm the write is acknowledged only when the configured number hold the data, and that killing any single node afterwards loses nothing.",
    dep: ["replication-pipeline", "chunk-versions"]
  },
  "erasure-coding": {
    s: "Splitting data into k fragments plus m computed parity fragments so any k of them rebuild the original, giving fault tolerance at far less space than full copies.",
    d: "A stripe of data is divided into k pieces, and a code produces m parity pieces; all k plus m are stored on different servers or racks. Any m losses are survivable. Storing six data and three parity fragments costs one and a half times the data instead of three times with copies. Reads are efficient when all data fragments are present, and degrade to computation when some are missing. Repair is the cost: rebuilding one fragment reads k others, so repair traffic is much higher than copying.",
    k: ["Erasure coding versus replication: coding halves the space overhead, but makes small writes, reads under failure and repair more expensive.", "Wide codes versus narrow: wide codes save more space and need more servers, longer reads and more traffic per repair; narrow codes cost more space and rebuild faster."],
    p: ["Using a wide code on a cluster of too few racks cannot keep fragments in separate failure domains.", "Repair of a failed disk saturates the network with k times the failed data."],
    v: "Write a stripe with six data and three parity fragments, delete any three, and confirm the original bytes are reconstructed exactly; delete four and confirm the read fails rather than returns wrong data.",
    dep: ["failure-domain-tree", "chunking-and-stripes"]
  },
  "partial-stripe-writes": {
    s: "Updating part of an erasure coded stripe, which requires reading old data and parity, recomputing and rewriting, and is the main reason coding is kept for data that is written once.",
    d: "A change inside a stripe alters parity, so the writer must read the old data and the old parity, compute the new parity from the difference, and write both back, coordinated so a crash does not leave data and parity from different versions. Systems avoid this by buffering writes until a full stripe, by logging small updates and merging them later, or by using replication for hot data. The hard part is atomicity: without a journal on the participating nodes, a failure between writes leaves a stripe that decodes to garbage.",
    k: ["Read-modify-write versus log and merge: in-place update is simple and amplifies I/O several times; a log is fast and needs background compaction and space.", "Full-stripe buffering at the client versus on servers: client buffering is cheap and loses data on client crash; server buffering is durable and adds a copy."],
    p: ["A crash after writing data but before parity makes the stripe silently unrecoverable.", "Small random writes into coded files run at a small fraction of sequential speed."],
    v: "Overwrite a few bytes in the middle of a coded stripe while killing a node at random times, then read with maximum fragments missing and confirm the result is always either the full old or the full new content.",
    dep: ["erasure-coding", "node-journal", "write-back-buffering"]
  },
  "replica-to-ec-conversion": {
    s: "Rewriting chunks first written as copies into an erasure coded layout once they are cold, so recent data is fast and old data is cheap to hold.",
    d: "New data is written with replication for speed and simple recovery. A background process selects sealed chunks that are no longer changing, reads them, encodes them into fragments, writes the fragments to the target pool, updates the chunk map atomically and releases the copies. During conversion the data is protected by the old copies. The cost is the I/O and CPU spent encoding, and the metadata change. It must pick chunks that will not be rewritten, since converting data that is soon updated wastes the work.",
    k: ["Convert after sealing and an age threshold versus at write time: delayed conversion avoids encoding hot data and temporarily uses more space; write-time coding saves space and slows writes.", "Convert in place on the same servers versus move to different nodes: in place reduces traffic and may violate failure-domain rules."],
    p: ["Converting a chunk that is later overwritten makes the file need a second conversion of the new data.", "Releasing the old copies before verifying the new fragments loses the only good data."],
    v: "Seal a replicated chunk, let conversion run, and confirm the chunk map points to coded fragments in separate domains, reads return identical bytes, and the replicas are only deleted after a successful verification.",
    dep: ["erasure-coding", "tiering-policies", "file-chunk-map"]
  },
  "degraded-reads": {
    s: "Serving a read when some copies or fragments are unavailable, by trying another replica or reconstructing the missing data from the surviving fragments at some cost in latency.",
    d: "For replicated chunks the client simply tries another copy, with hedged requests when the first is slow. For coded stripes it reads enough other fragments, computes the missing ones and returns the data, which takes k reads instead of one. This keeps the filesystem readable during failures and repairs. The challenge is overhead: a degraded read costs network, CPU and tail latency, and a large failure turns many reads into reconstructions at once, which strains the survivors.",
    k: ["Reconstruct on the client versus on a storage node: node-side hides complexity and moves work to servers; client-side avoids extra hops and needs the coding logic everywhere.", "Hedged reads to extra replicas versus sequential fallback: hedging cuts tail latency, but adds load in a failure."],
    p: ["During a rack failure thousands of degraded reads at once overload the remaining nodes.", "A client without the coding library cannot read coded files when a fragment is missing."],
    v: "Take a data fragment's server offline and read a coded file, confirming the bytes are correct, measure the added latency against the documented figure, and confirm the repair queue also contains the missing fragment.",
    dep: ["erasure-coding", "client-failover-and-retry", "end-to-end-checksums"]
  },
  "read-repair": {
    s: "Fixing a bad or stale copy found during an ordinary read, by writing the correct data back immediately instead of waiting for a scheduled scrub.",
    d: "When a read finds a checksum mismatch, a missing chunk or a stale version on one replica, the client or server fetches the data from another replica, returns it, and tells the repair system or directly rewrites the damaged copy. This heals popular data fastest, since it is read most. Cold data still needs scrubbing. The hard part is conflicting copies: deciding which is right requires checksums and versions rather than a vote, and aggressive repair on read can amplify load during an incident.",
    k: ["Repair inline on the read path versus queue to the background: inline fixes quickly and adds latency to that read; queued is predictable and delays healing.", "Trust checksum and version over majority vote: authoritative metadata resolves conflicts reliably, but a bad checksum record spreads the wrong decision."],
    p: ["Rewriting a copy on suspicion alone replaces good data with bad when the reader itself is faulty.", "Many readers detecting one bad replica each launch their own repair of it."],
    v: "Corrupt one replica of a hot chunk, read it from a client, and confirm the read returns the correct bytes and the corrupted replica is rewritten and passes verification within the documented time.",
    dep: ["end-to-end-checksums", "repair-queue", "chunk-versions"]
  },
  "scrubbing": {
    s: "A continuous background pass that reads every stored chunk and verifies its checksum, finding silent corruption in rarely read data before enough copies are damaged to lose it.",
    d: "Each storage node walks its chunks at a controlled rate, reads them, recomputes checksums and compares them with stored values. Mismatches are reported and the damaged copy is repaired from another. A full pass is scheduled over weeks, since disks can corrupt data without errors and a second failure before detection turns a repairable fault into loss. Scrubbing competes with clients for disk bandwidth, so it runs at low priority and slows in busy periods. The difficulty is keeping the cycle short enough on very large disks.",
    k: ["Continuous low-rate scrubbing versus periodic bursts: continuous is gentle and steady, while bursts finish sooner and disturb clients.", "Verify checksum only versus cross-replica comparison: checksums are cheap and local, while comparison catches errors checksums themselves share, at a network cost."],
    p: ["Scrub rate set too low means a full pass takes longer than the window in which latent errors accumulate.", "Scrubbing at full speed during peak load raises client latency noticeably."],
    v: "Flip bits in a rarely read chunk on one node, and confirm that the next scrub pass detects the mismatch, reports it, and that the chunk returns to full redundancy without any client reading it.",
    dep: ["local-chunk-store", "repair-queue", "io-scheduling"]
  },
  "local-reconstruction": {
    s: "Codes that add small local parity groups next to global parity, so repairing one lost fragment reads a few neighbors instead of an entire stripe.",
    d: "Data fragments are divided into local groups, each with a local parity fragment, and a few global parities protect against multiple simultaneous losses. The most common failure, one fragment, is fixed by reading only the group, a fraction of what a standard code needs. The price is slightly more storage than the most space-efficient codes, and a failure pattern that fits no local group needs a full decode. It is hard to choose parameters that fit the cluster's rack count and expected failure mix.",
    k: ["Local parity versus standard maximum-distance code: local parity reduces repair reads for single failures, but stores more parity for the same fault tolerance.", "Group size small versus large: small groups repair cheaply and cost more parity; large groups save space and approach standard repair cost."],
    p: ["A failure pattern that hits two fragments of one local group falls back to the expensive full decode.", "Choosing group boundaries that cross racks unevenly makes a single rack failure hit many groups."],
    v: "Fail one fragment and confirm repair reads only the other members of its local group, then fail two in a group and confirm the system uses global parity and still returns identical data.",
    dep: ["erasure-coding", "erasure-reconstruction"]
  },
  "failure-detection": {
    s: "Deciding that a server or disk is gone, using missed heartbeats, error counts and peer reports, balanced so brief hiccups are not treated as permanent loss.",
    d: "Nodes report to the cluster monitor on a regular interval, and peers report errors they see when contacting each other. After a short timeout a node is marked suspect and its leases and writes are rerouted; after a longer one it is marked down and repair of its data is scheduled. A node that returns before repair begins is simply re-admitted, which avoids copying terabytes. The hard problem is choosing the timeouts, and distinguishing a dead node from a partition, a stalled process and a slow disk.",
    k: ["Short timeouts versus long: short detects failures quickly and triggers repair for transient events; long avoids unneeded copying and leaves data less protected for longer.", "Peer reports in addition to central heartbeats: peers detect partitions the monitor cannot see, and can produce conflicting views."],
    p: ["A switch hiccup marks hundreds of healthy nodes down and starts a repair storm.", "A node that responds to heartbeats but cannot read its disks is never detected."],
    v: "Pull the power on one node and confirm it is marked suspect, then down within the configured delays, and repair begins for its data; restore a different node briefly and confirm no repair starts.",
    dep: ["membership-and-heartbeats", "repair-queue"]
  },
  "repair-queue": {
    s: "The prioritized list of chunks that have lost redundancy, ordered so those closest to being lost are rebuilt first and repair work is spread across the cluster.",
    d: "The metadata service or a placement group tracks chunks with fewer than their target copies or fragments. Priority rises as the number of surviving copies falls, and as the time at risk grows. Work is handed to storage nodes that copy or reconstruct, in parallel from many sources. Each completion updates the chunk map. Without ordering, a long tail of nearly safe chunks could delay the ones with one copy left. The difficulty is size, since a failed server may leave millions of entries, and the work must continue across metadata failover.",
    k: ["Priority by remaining redundancy versus first in first out: priority rescues the most endangered data first, but needs a count of survivors for each chunk constantly updated.", "Central queue versus per-group queues: central gives global priority and one hot spot, while per-group scales and balances only locally."],
    p: ["A flat queue repairs chunks with two copies left before chunks with one.", "A second failure arriving mid-repair reshuffles priorities and leaves the first batch half finished."],
    v: "Fail two servers sharing chunks and confirm chunks that lost two copies are repaired before those that lost one, and the queue reaches zero with every chunk back to its target.",
    dep: ["failure-detection", "file-chunk-map"]
  },
  "re-replication": {
    s: "Creating replacement copies of chunks that lost one, by choosing a source and a new destination that satisfy placement rules, and updating the chunk map when the copy is verified.",
    d: "For each queued chunk the repair scheduler picks a healthy source replica and a target outside the existing failure domains, then instructs the target to pull the data. The target writes to its journal and chunk store, verifies the checksum and reports. Only then does the metadata add the new location. Many chunks are copied in parallel, sourced from all surviving peers, so recovery speed grows with cluster size. The limiting factor is the target's and network's bandwidth shared with client traffic.",
    k: ["Target pulls from a source versus source pushes: pulling lets the destination pace itself by its own load, and spreads state; pushing is simpler for the source and ignores the target's load.", "Prefer rebuilding in the same rack versus across racks: same rack is fast and cheap and breaks failure-domain rules."],
    p: ["Choosing a source that is itself slow drags every repair using it, and the backlog grows.", "Adding the new location before verification makes clients read unverified data."],
    v: "Fail a node holding a known set of chunks and confirm each is back at full redundancy on different servers within the target time, with identical checksums and no two copies in one failure domain.",
    dep: ["repair-queue", "allocation-policy", "end-to-end-checksums"]
  },
  "erasure-reconstruction": {
    s: "Rebuilding lost coded fragments by reading enough surviving fragments, decoding, and writing replacements to new servers, at much higher network cost than copying a replica.",
    d: "To restore one fragment, the repair worker reads k others, runs the decode, and sends the new fragment to a target in a free domain. Repair workers are chosen near the data, and some designs split the computation along the network so partial results are combined on the way. Reconstruction competes with degraded reads that need the same fragments. The hard parts are traffic and time: a failed large disk requires reading k times its content, and the window of exposure is longer than for replicated data.",
    k: ["Rebuild whole lost fragments immediately versus lazily when several are lost: immediate shortens risk and costs traffic constantly; lazy saves effort and runs closer to the loss threshold.", "Decode at one worker versus distributed partial decoding: one worker is simple, while distribution reduces cross-rack traffic and adds coordination."],
    p: ["Reconstruction reads from many racks and saturates the oversubscribed uplinks other workloads need.", "Lazy repair delays until two fragments are missing and then a third failure loses the stripe."],
    v: "Fail a disk with coded fragments and measure cross-rack repair traffic against the model for the chosen code, confirming reconstructed fragments are bit-identical to ones recomputed from a clean encode.",
    dep: ["erasure-coding", "repair-queue", "repair-throttling"]
  },
  "repair-throttling": {
    s: "Limits on how fast recovery and rebalancing may run, adjusted by urgency and by foreground load, so healing does not hurt applications and does not leave data exposed too long.",
    d: "Rates are set per node, per disk and across the network: maximum concurrent copies, bytes per second, and a lower priority class in the disk scheduler. Policies speed up when redundancy is dangerously low and slow down when client latency rises. Operators can raise limits temporarily to clear a backlog. The core tradeoff is risk against disruption, and it is hard because the right rate changes constantly: the second failure during repair is exactly the case the system exists for.",
    k: ["Static limits versus adaptive control: static is predictable and wrong at extremes; adaptive follows load and needs reliable signals and damping to avoid oscillation.", "Faster repair for lower-redundancy chunks versus uniform: urgency-based lowers loss probability and makes foreground impact vary with failure patterns."],
    p: ["Repair throttled low during peak hours never finishes before the next failure.", "Repair at full speed after a rack loss multiplies client latency for hours."],
    v: "During a rack failure with client load, confirm client p99 latency stays within its target while repair runs at the throttled rate, and that the rate rises automatically if any chunk drops to one copy.",
    dep: ["io-scheduling", "qos-throttling", "flow-control"]
  },
  "rebalancer": {
    s: "A background process that moves chunks between servers to even out space and load after nodes are added, removed or unevenly filled, within placement rules.",
    d: "It computes each server's utilization against the cluster mean and picks chunks to move from the fullest to the emptiest within a tolerance, never breaking failure-domain rules or reducing redundancy. Moves are copy then switch then delete, so data is never unprotected. With computed placement the target layout comes from the new cluster map and the balancer drives data towards it. The hard part is thrashing and cost: moves must be rate limited, and balance targets should have hysteresis so small differences are not chased continuously.",
    k: ["Balance by space versus by load: space is simple and stable, but ignores a hot server; load tracking follows demand and creates churn.", "Rebalance continuously versus on demand windows: continuous keeps balance smooth and uses I/O always; windows are predictable and let imbalance build up."],
    p: ["Moving too eagerly after adding a node reads and writes petabytes while clients wait.", "A rebalancer that ignores snapshots moves data that is still referenced as separate copies and doubles space."],
    v: "Add a node and confirm utilization across servers converges to within the tolerance of the mean, without any chunk dropping below its redundancy during the moves, and client latency stays within target.",
    dep: ["placement-function", "repair-throttling", "re-replication"]
  },
  "orphan-chunk-gc": {
    s: "Finding and deleting chunks on storage nodes that no file refers to, left behind by failed writes, deleted files or interrupted moves, and reclaiming their space safely.",
    d: "Nodes report the chunks they hold; the metadata service compares them with the chunks it knows. Chunks not referenced by any file, snapshot or pending operation, and older than a grace period, are scheduled for deletion. The grace period protects chunks in the middle of being created, which are not yet recorded. A node returning after a long outage reports many stale chunks that have been rebuilt elsewhere. The hard problem is safety: deleting a chunk that is referenced only because of a metadata error destroys data, so deletion is delayed and verified.",
    k: ["Mark-and-sweep comparison of reports versus reference counting: comparison is simple and robust to lost updates, but scans everything; counting is immediate and corrupts if counts drift.", "Long grace period versus short: long protects in-flight writes and holds garbage; short frees space quickly and risks deleting data being created."],
    p: ["A metadata bug that omits a live file from the referenced set causes the collector to delete real data.", "A returning node with months-old chunks floods the system with delete work all at once."],
    v: "Write a chunk, abandon its file before commit, and confirm the chunk is reported, survives the grace period, then is removed; confirm a chunk belonging to a live file is never removed in the same pass.",
    dep: ["file-chunk-map", "chunk-versions", "trash-and-undelete"]
  },
  "partition-handling": {
    s: "Rules for what each side may do when the network splits the cluster, keeping the side with a metadata majority serving while the minority stops accepting changes.",
    d: "The majority side holding a quorum of the metadata group continues, elects a leader if needed and treats unreachable nodes as down. The minority side cannot commit metadata, so clients there get errors or read-only service; storage nodes there stop accepting writes that need a new chunk version. When the partition heals, minority nodes rejoin, compare versions, discard stale data and catch up. The complication is clients: one on the minority side with a cached lease must stop trusting it.",
    k: ["Favor consistency, refusing the minority, versus availability on both sides: refusing never forks the namespace, but makes some clients unavailable; allowing both needs conflict resolution that files rarely tolerate.", "Read-only service in the minority versus full stop: read-only keeps some applications alive, and may serve stale data."],
    p: ["A client on the minority side keeps writing to storage nodes it can reach, with leases it should have lost.", "Healing a long partition triggers mass resync of every node's data at once."],
    v: "Partition the cluster into a majority and minority, confirm the majority serves reads and writes, the minority refuses writes, and that after healing all nodes converge with no lost acknowledged write.",
    dep: ["leader-election", "client-sessions", "fencing-tokens"]
  },
  "lost-data-reporting": {
    s: "Detecting and reporting chunks whose every copy or too many fragments are gone, naming the affected files so owners can restore them from backup.",
    d: "When repair finds a chunk with no usable source, the metadata service marks it lost and records which files and byte ranges depend on it. Reads of those ranges return an explicit error instead of garbage or zeros. A report lists affected paths and tenants, and the cluster stops trying to repair what cannot be repaired. Sometimes a missing server returns and the chunk is recovered. The challenge is precision and honesty: reporting exactly what was lost, and keeping a record that survives so owners are told reliably.",
    k: ["Fail reads of lost ranges versus returning zeros: failing is honest and may break jobs; zeros let jobs finish with corrupted results.", "Wait for missing nodes to return versus declaring loss early: waiting avoids false loss reports and keeps owners uncertain longer."],
    p: ["A lost chunk reported only in a log goes unnoticed until a restore is needed months later.", "Marking a chunk lost while a node holding it is merely offline discards recoverable data."],
    v: "Destroy every copy of a test chunk, then confirm a read returns an explicit error, the report names the exact file and range, and an alert reaches the owner; restore it from backup and confirm reads recover.",
    dep: ["repair-queue", "file-chunk-map", "audit-and-access-logs"]
  },
});
