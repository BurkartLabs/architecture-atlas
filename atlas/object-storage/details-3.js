// Details for the object storage plate, part 3: replication, encryption, placement, durability and coding.
ATLAS.details("object-storage", {
  "replication-rules": {
    s: "Bucket-level configuration choosing which objects replicate, by prefix or tag, to which destination bucket, class and account, and whether deletes and metadata changes follow.",
    d: "A rule names a source filter, a destination in another bucket (same region, another region or another account) and options: change the storage class, change ownership, replicate delete markers, replicate existing objects through a batch job. Rules need versioning enabled on both sides. They are stored in bucket configuration and read by the replication workers when they process change events. The difficulty is semantics: each option changes what the destination means, and mistakes such as loops between two buckets or missing permissions fail silently.",
    k: ["Filtering by prefix or tag vs replicating the whole bucket: filters cut cost and move only critical data, but need discipline to keep tags and prefixes correct.", "Replicating deletes vs not: replicating keeps copies identical, while not replicating protects against accidental or malicious deletion at the source."],
    p: ["Two-way rules without loop protection copy objects back and forth indefinitely.", "Existing objects are not replicated by default, so a new rule leaves old data unprotected until a backfill runs."],
    v: "Enable a rule on a prefix, write matching and nonmatching objects, and confirm only matching ones appear in the destination with identical content, tags and the configured storage class.",
    dep: ["bucket-configuration-store", "versioning"]
  },
  "replication-queue": {
    s: "A durable queue of pending copy tasks fed by index changes, drained by workers that read the source object and write it to the destination.",
    d: "When a version commits in a replicated bucket, the index emits a change record that creates a task. Workers pull tasks, read the object (and metadata) from the source, write to the destination through the normal put path, and record completion. Tasks retry with backoff on failure. The queue is partitioned and persists across restarts. The challenge is throughput and ordering: a burst of large objects creates lag, a failing destination fills the queue, and ordering across versions of one key must be preserved so older data does not overwrite newer.",
    k: ["Queue fed by a change log vs scanning for differences: the log is timely and cheap, but a lost event means a permanent gap unless scans reconcile.", "Per-key ordered processing vs parallel anything: ordering prevents stale overwrites but limits parallelism for hot keys."],
    p: ["A destination outage grows the queue until memory or storage limits drop tasks, causing silent divergence.", "Large objects at the head of a queue delay thousands of small ones behind them."],
    v: "Write a burst of 100,000 objects and confirm queue depth rises and drains, the oldest pending age stays under target, and destination listing eventually equals source listing for the rule.",
    dep: ["replication-rules", "metadata-index", "put-object"]
  },
  "cross-region-replication": {
    s: "Copies objects asynchronously to a bucket in a distant region, giving a recoverable second copy and lower read latency near users, at the price of a lag.",
    d: "Workers in the source region stream object bytes over the wide-area network to a front end in the destination, which stores them under its own placement and encryption keys. Because the network is slow and failure-prone relative to a datacenter, copies are asynchronous: a write is acknowledged locally before it is copied. Some offerings give a time target for most objects. The difficulty is the recovery point: after a regional loss, the newest writes may be missing, and customers must decide whether that gap is acceptable.",
    k: ["Asynchronous replication vs synchronous: asynchronous keeps write latency local and tolerates link failure, but loses recent writes in a disaster.", "Re-encrypting at the destination vs copying ciphertext: re-encrypting lets each region use its own keys, at the cost of extra compute and key access."],
    p: ["Assuming replicated means identical at every moment leads to failover that loses writes within the lag.", "Network cost for large, frequently changing data can exceed the storage cost it protects."],
    v: "Write objects in the source region, measure the time until each is readable in the destination, and confirm the percentile lag meets the target and the bytes and checksums match.",
    dep: ["replication-queue", "server-side-encryption", "put-object"]
  },
  "replication-status-tracking": {
    s: "Per-object state (pending, completed, failed, replica) and aggregate metrics that tell customers and operators whether replication is current and which objects missed.",
    d: "Each source version records a replication status in its index record, updated as workers progress; the destination copy is marked as a replica so it does not re-replicate. Aggregate lag, bytes pending and failure counts are published as metrics, and failures produce events with reasons such as permission errors or missing keys. A retry job can re-queue failed objects. It is difficult because the status is a second write to the index per object, and because aggregate numbers hide the long tail of stuck objects.",
    k: ["Status stored per object vs only aggregate counters: per-object state lets customers find and retry stragglers, but costs an index update per object.", "Marking replicas explicitly vs inferring from source: explicit marks prevent loops and make intent clear, but add a field to maintain."],
    p: ["Failed objects stay failed forever unless someone queries status and requests a retry.", "Reading aggregate lag as healthy while a specific prefix is stuck hides a data protection gap."],
    v: "Break destination permissions for one prefix, write objects there, and confirm those objects report failed with a reason while others complete, then fix permissions and confirm retry brings them to completed.",
    dep: ["replication-queue", "metadata-index", "event-notifications"]
  },
  "conflict-resolution": {
    s: "The rules that decide the outcome when the same key is written in two replicated sites concurrently, since neither site sees the other's write first.",
    d: "With active-active replication between two buckets, concurrent writes to one key can both succeed locally and then cross. The usual rule is last writer wins by timestamp, which discards one version in the destination or keeps both as separate versions in each. Some designs designate a primary per key or per prefix to avoid conflicts, or return the conflict to the application. Delete markers add more cases. It is hard because clock skew decides winners, and silent loss of the losing write may violate application expectations.",
    k: ["Last writer wins vs keeping all versions: simple and convergent, but drops data silently; keeping versions loses nothing but needs application merge.", "Single-writer per key vs multi-writer: single-writer avoids conflicts by design, but sacrifices write locality in one region."],
    p: ["Clock skew between regions makes the older write win, so an update appears to vanish.", "Applications assuming one global order of writes break under active-active conflicts."],
    v: "Write different content to the same key in both sites within one second, and confirm both sites converge on the same version, the documented rule picked the winner, and no replication loop occurs.",
    dep: ["cross-region-replication", "versioning"]
  },
  "replica-failover-reads": {
    s: "Serving reads from a replicated copy in another region when the home region is unavailable or far, with clear rules about staleness and missing recent writes.",
    d: "Clients, or a routing layer, direct reads to a destination bucket on regional failure or for lower latency. Multi-region access points present one name and route requests by health and proximity. The destination may lack recent writes and may hold an older version, and it cannot accept writes unless failover promotes it. Switching back needs the replication direction reversed and a catch-up. The challenge is making the routing decision safely and telling applications exactly what consistency they get during a failover.",
    k: ["Automatic routing to the nearest healthy copy vs manual failover: automatic is faster and cuts outage time, but may surface stale data without the application knowing.", "Read-only replicas vs promoted writable ones: read-only is safe, while promotion restores service but creates conflicts on failback."],
    p: ["Failback without reconciling writes made at the replica overwrites or loses them.", "Dependent systems pointing to the source's name rather than a multi-region name fail despite replicas existing."],
    v: "In a drill, take the home region offline, confirm reads continue from the replica with documented staleness, then bring it back and confirm writes made during the outage reconcile without loss.",
    dep: ["cross-region-replication", "request-routing"]
  },
  "server-side-encryption": {
    s: "Encrypts object bytes before they reach disk using per-object data keys, with keys supplied by the service, by a key management service or by the customer.",
    d: "On write, the front end generates a unique data key, encrypts the stream with an authenticated cipher in chunks, stores the ciphertext, and stores the data key in the index record wrapped by a master key. On read, it asks for the wrapped key to be unwrapped, then decrypts. Modes differ by who controls the master key. Encryption is applied by default for all objects in most services. The hard parts are performance at line rate, chunk authentication that detects tampering, and keeping unwrap latency and availability on the read path.",
    k: ["Per-object data keys vs one key per bucket: per-object limits the impact of a key compromise and permits crypto-erase, but requires wrapping and storing a key for every object.", "Encrypting at the front end vs on storage nodes: front end keeps plaintext off nodes and disks, while node-level is simpler but exposes plaintext to more machines."],
    p: ["Losing the master key makes all data it wraps permanently unreadable.", "Key service outages block reads of objects whose keys are not cached, even though the bytes are healthy."],
    v: "Write an object, read the raw bytes from storage nodes and confirm they are ciphertext not containing known plaintext, then read through the API and confirm exact plaintext. Revoke key access and confirm reads fail.",
    dep: ["key-hierarchy", "key-management-integration", "put-object"]
  },
  "key-hierarchy": {
    s: "Layers of keys in which small, protected top keys wrap lower keys that finally wrap per-object data keys, so rotation and revocation touch few items.",
    d: "A typical chain: a root key kept in hardware modules wraps account or bucket keys, which wrap per-object data keys stored in the index record. Data keys are used briefly in memory. Rotating a top key means rewrapping the layer below it, not re-encrypting data. Deleting an account's key makes its data unrecoverable. The design is about limiting how much data any one key protects and how long it lives. Its difficulty is operational: wrapped keys are on the read path, and a lost or mis-scoped layer is catastrophic.",
    k: ["Deep hierarchy vs flat keys: depth makes rotation and revocation cheap and limits exposure, but adds unwrap steps and more places to lose a key.", "Per-account intermediate keys vs shared: per-account enables tenant crypto-erase and isolation, but multiplies keys to manage and cache."],
    p: ["Caching unwrapped keys too long extends exposure after revocation; too short overloads the key service.", "A broken backup of the key layer means correct ciphertext that nothing can decrypt."],
    v: "Rotate a top-level key and confirm all objects remain readable, new objects use the new key version, and the old key can be disabled after rewrap with a measured, small rewrite volume.",
    dep: ["key-management-integration"]
  },
  "key-management-integration": {
    s: "The connection to a separate key service that holds master keys in hardware, performs wrap and unwrap on request, and enforces who may use each key.",
    d: "The storage service never sees master key material; it sends data keys to the key service to be wrapped and unwrapped, authenticated as the account or service. Every use is logged. Customers can bring their own key service or external keys, which lets them disable the service's access instantly. Requests are cached briefly and rate limited. Its difficulty is availability and latency coupling: the key service is a hard dependency of every read and write for encrypted data, so its outage or throttling must degrade gracefully.",
    k: ["Customer-controlled external keys vs service-managed: external keys give revocation power and compliance, but make every request depend on a system the service does not run.", "Caching unwrapped data keys vs unwrap on each read: caching cuts latency and load, but weakens immediate revocation."],
    p: ["Throttling by the key service on a large batch job fails reads that look like storage errors.", "Disabling a key without understanding dependent objects takes down applications reading them."],
    v: "Disable the customer's key and confirm reads of objects under it fail with a key error within the cache bound, and re-enable it and confirm reads recover with no data change.",
    dep: ["key-hierarchy", "request-authentication"]
  },
  "client-side-encryption": {
    s: "The client encrypts data before upload with keys the service never sees, so the service stores only ciphertext and cannot read or recover the content.",
    d: "A client library generates a data key per object, encrypts locally, wraps the data key with a key it controls, and stores the wrapped key in object metadata or a sidecar. On download it reverses the process. The service sees opaque bytes and stores them like any others, but loses features that need plaintext: server-side range reads that align to cipher blocks, inspection, scanning, copying across keys. The challenge is all on the client: key custody, consistent formats across tools, and ranged reads over authenticated chunks.",
    k: ["Client-side vs server-side encryption: client-side gives the customer exclusive control and protects against the provider, but shifts key loss, performance and tooling to the customer.", "Envelope format in metadata vs a separate key store: metadata is self-contained and travels with the object, but metadata size and copies can break it."],
    p: ["A lost client key makes data unrecoverable, with no provider help possible.", "Different tools implementing different envelope formats cannot read each other's objects."],
    v: "Encrypt and upload an object with a local key, inspect the stored bytes to confirm no plaintext, then download on another machine with the key and confirm identical bytes, and fail without it.",
    dep: ["put-object", "get-object-and-ranges"]
  },
  "transport-encryption": {
    s: "TLS on every connection between clients and front ends, and between internal services, so data and credentials are protected in transit.",
    d: "Front ends terminate TLS with certificates for the service's names, including virtual-host style bucket names, and the service can refuse plain connections by policy. Internal hops between front ends, index partitions, storage nodes and replication workers use mutual TLS with short-lived certificates. Cipher suites and minimum versions are policy-controlled. The hard parts are certificate lifecycle at fleet scale, the CPU cost of encrypting traffic at tens of gigabits per node, and keeping long-lived streaming connections working through certificate rotation.",
    k: ["Mutual TLS inside the datacenter vs trusting the network: mutual TLS limits damage from a compromised host and tampering, at CPU cost and certificate operations.", "Strict minimum protocol versions vs compatibility: strict improves security, but breaks old clients and devices."],
    p: ["Expired internal certificates cause cascading failures between services at the same moment.", "Plain-text endpoints left enabled expose credentials despite bucket policies requiring encryption."],
    v: "Attempt a plain-text connection and an old protocol version and confirm both are refused, while a current client succeeds. Capture traffic and confirm no object bytes appear in clear.",
    dep: ["front-end-fleet", "storage-node-daemon"]
  },
  "key-rotation": {
    s: "Periodically replacing keys, wrapping keys at once and re-wrapping existing data keys over time, without downtime or re-encrypting the stored data.",
    d: "Rotation creates a new version of a master or intermediate key. New writes use it immediately. Old versions remain available for unwrapping until a background job rewraps data keys onto the new version, after which the old version can be retired. Rewrap touches index records, not object bytes. Rotation limits the volume protected by one key and the damage window of a leak. Its challenge is progress tracking across billions of records, handling objects in cold tiers or replicas, and keeping rollback possible.",
    k: ["Rewrap data keys vs re-encrypt data: rewrap is cheap and fast, but old data keys remain in use; re-encrypting is thorough, but moves petabytes.", "Automatic scheduled rotation vs on demand: scheduled bounds exposure without human action, but needs reliable retirement checks to avoid outages."],
    p: ["Retiring an old key version before every record is rewrapped makes some objects unreadable.", "Replicas in other regions still reference old key versions and fail after rotation."],
    v: "Rotate a key, run rewrap to completion, retire the old version and confirm that a full scan of every object, in all tiers and replicas, still decrypts successfully.",
    dep: ["key-hierarchy", "metadata-index", "key-management-integration"]
  },
  "placement-map": {
    s: "The table or function that says which nodes and disks hold each piece of each object, and which is consulted on every read, write and repair.",
    d: "Placement is recorded per object in its index record or derived from it by a deterministic function over a cluster map listing nodes, weights and failure domains. A write asks the placement service for a set of targets that satisfies redundancy and failure-domain rules; a read uses the stored list. Maps change as nodes join, fail and drain, so versions are tracked. The hard part is keeping placement consistent through change: explicit lists are flexible but large, computed placements are small but force careful data movement when the map changes.",
    k: ["Explicit placement lists in the index vs computed placement: explicit lists allow any rebalancing and repair, but add bytes to every record; computed placement is compact but couples data location to cluster membership.", "Central placement service vs decentralized function: central gives optimal choices, but is another component to keep available."],
    p: ["A node removed from the map before its data is rebuilt makes pieces unreachable and objects look degraded.", "Stale maps on front ends write to nodes that were drained."],
    v: "Write 100,000 objects, then audit every record's placement list against the failure-domain rule: no two pieces of one object may share a domain, and per-node counts must be within tolerance.",
    dep: ["failure-domains", "consistent-hashing", "membership-and-heartbeats"]
  },
  "failure-domains": {
    s: "The hierarchy of things that fail together (disk, server, rack, power feed, zone, site) used so pieces of one object never share a fate.",
    d: "Each node is labeled with its position: server, rack, row, power path, building or zone, and site. Placement rules say how many pieces may land in any domain: for example at most one per rack, or at most a limited number per zone. Redundancy parameters are chosen with these domains in mind, so a whole rack or zone failing leaves enough pieces to read and rebuild. The difficulty is that real correlations are messy: shared network switches, shared firmware, and shared drive batches fail together in ways topology labels do not show.",
    k: ["Spreading across many small domains vs few large ones: wide spreading tolerates larger failures, but multiplies network traffic on every read and repair.", "Declared topology vs measured correlation: declared labels are simple, but miss hidden shared dependencies that measurement of failures reveals."],
    p: ["A mislabeled rack lets many pieces land in one fault domain, and one power event loses objects.", "Drives from the same manufacturing batch fail within weeks of each other, defeating spreading by server."],
    v: "Take an entire rack offline in a test cell and confirm every object remains readable with no data loss, and that repair restores full redundancy using other racks only.",
    dep: ["membership-and-heartbeats"]
  },
  "consistent-hashing": {
    s: "Maps object or segment identifiers onto nodes using a ring or similar structure so that adding or removing a node moves only a small share of data.",
    d: "Identifiers and nodes are hashed onto a circular space; each identifier belongs to the next nodes clockwise. Nodes appear many times as virtual points, smoothing load and letting heterogeneous capacities carry weights. Adding a node takes a slice from each neighbor; removing one hands its slices on. Combined with failure-domain constraints, it picks replica or piece holders. Its limit is balance and control: pure hashing ignores actual disk fill and load, so many systems layer capacity-aware adjustment on top.",
    k: ["Hashing for placement vs an explicit directory: hashing needs no lookup table and scales to trillions of items, but gives less control over exactly where data goes.", "Many virtual points per node vs few: many smooth load and rebalancing, while few keep membership tables small."],
    p: ["Ignoring node weights loads small disks as heavily as large ones and fills them first.", "A membership change during a write window sends pieces to different nodes than the reader computes."],
    v: "Add one node to a 100-node ring and confirm roughly one percent of data moves, load stays within tolerance of each node's weight, and all objects remain readable throughout.",
    dep: ["placement-map", "membership-and-heartbeats"]
  },
  "capacity-balancing": {
    s: "Keeps disks and nodes filled to similar levels and load levels by steering new writes toward emptier targets and sometimes moving existing data.",
    d: "The placement service tracks free space, write rate and I/O queue depth per disk and node, and weights target selection accordingly, so new volumes land mostly on emptier disks. A background balancer migrates segments from overfull disks to underfull ones, throttled to protect foreground traffic. Balance matters because the fullest disk limits the cluster: write failures and slow repair start there. The difficulty is that data movement itself consumes bandwidth and changes in a heterogeneous fleet where drive sizes differ and new nodes arrive empty.",
    k: ["Steering new writes vs migrating old data: steering is free but slow to fix imbalance; migration is fast but spends network and disk time.", "Balancing on space vs on load: space prevents full disks, while load avoids hot disks but may leave space imbalance."],
    p: ["A newly added empty node attracts all new writes and becomes a write hot spot until it fills.", "Aggressive balancing competes with repair and customer reads, increasing latency."],
    v: "Add a batch of empty disks and confirm that within the target time the fill spread across disks narrows to within the set band while foreground latency stays within its objective.",
    dep: ["placement-map", "rebalancing", "volume-allocation"]
  },
  "rebalancing": {
    s: "Moves data between nodes in the background after membership, weight or failure-domain changes, converging on the placement the rules now require.",
    d: "When the cluster map changes (nodes added, drained, reweighted), the desired placement of existing objects differs from their current one. A rebalancer computes the difference, schedules segment or piece copies to new holders, verifies them, updates the index or map, and only then deletes old copies. Moves are rate limited and prioritized below repair. It is hard because it must be safe at every instant: data is never left under-redundant, and a crash mid-move must leave either the old or the new location valid, not neither.",
    k: ["Copy then switch then delete vs in-place move: the three-step approach never reduces redundancy, but needs temporary extra space and bandwidth.", "Throttled gradual movement vs fast convergence: gradual protects traffic and tolerates new changes, but leaves the cluster imbalanced for days."],
    p: ["Deleting the old copy before verifying the new one turns a rebalance into data loss if the copy was bad.", "Repeated map changes can cause rebalancing to chase a moving target without ever completing."],
    v: "Reweight a set of nodes, then watch movement complete, and verify every object retains full redundancy at every sampled moment and the final placement satisfies the new map exactly.",
    dep: ["placement-map", "reconstruction-workers", "checksums"]
  },
  "volume-allocation": {
    s: "Assigns groups of objects to large segments or volumes and decides which nodes hold each volume, sealing it when full and opening new ones.",
    d: "Writes append into open volumes, each a fixed-size container (for example tens of gigabytes) with a defined set of replica or piece holders. A volume manager keeps a small number open per placement group, chooses holders using placement rules, and seals a volume when full, after which it becomes immutable and can be erasure-coded or compacted. Allocation determines parallelism and failure impact: too few open volumes bottleneck writes, too many scatter small objects thinly. It must also decide where a volume's pieces go before any data is written.",
    k: ["Few large volumes vs many small: large volumes make metadata small and sequential I/O efficient, but a failure rebuilds more data at once.", "Allocating volumes ahead of time vs on demand: ahead removes allocation latency from writes, but ties up capacity in empty volumes."],
    p: ["A volume manager outage blocks all writes if no pre-opened volumes remain.", "Sealing volumes before they are full wastes space, which accumulates across thousands of volumes."],
    v: "Write continuously until volumes seal and confirm each sealed volume is full within tolerance, immutable, and placed on holders that satisfy domain rules, with allocation adding no more than a small latency to writes.",
    dep: ["placement-map", "append-only-segments"]
  },
  "hot-spot-mitigation": {
    s: "Detects keys, partitions or nodes receiving disproportionate load and relieves them by splitting, caching, spreading replicas or throttling.",
    d: "Monitors track per-partition request rates, per-node disk and network use, and the heaviest keys. For index hot spots, the response is splitting the range or caching hot records. For data hot spots, popular objects may get additional readable replicas or edge caching, and nodes with deep queues are avoided by hedged reads. Throttling the tenant is the last resort. Hot spots are inherent because real access patterns are heavily skewed; the difficulty is detecting them quickly and responding without destabilizing the cluster.",
    k: ["Extra replicas of hot objects vs caching in front: replicas stay inside the durability system, while caches are cheaper and faster but add a layer and invalidation.", "Reactive mitigation vs advising customers on key design: reactive protects everyone automatically, but advice avoids the hot spot at its source."],
    p: ["A single extremely popular object cannot be spread by partition splitting and saturates its holders.", "Mitigation actions such as moving data add load to the already stressed node."],
    v: "Direct a skewed load at a few keys, and confirm that the system detects the hot partition or node within its target time and brings its latency back within the objective without errors to others.",
    dep: ["partition-splitting", "metadata-cache", "throttling-and-quotas"]
  },
  "erasure-coding": {
    s: "Splits data into k data pieces plus m computed parity pieces on different nodes, so any k of the k plus m pieces rebuild the object, at far less overhead than copies.",
    d: "An encoder divides each stripe into k fragments and computes m parity fragments using arithmetic over a finite field. The k+m pieces go to separate failure domains. A read needs any k of them; with all data pieces it simply concatenates. A scheme such as 10+4 survives four losses at 1.4 times raw overhead, where three copies cost three times and survive two. The costs are computation, small-write inefficiency, and repair: rebuilding one lost piece requires reading k others, multiplying network traffic.",
    k: ["Erasure codes vs replication: codes cut overhead from 3x to about 1.4x at the same or better fault tolerance, but need more reads and compute to read degraded or repair.", "Wide stripes vs narrow: wide stripes lower overhead and tolerate more failures, but make each read touch more nodes and raise tail latency."],
    p: ["Using erasure coding on very small objects makes overhead and the number of pieces far exceed the data.", "Encoding with all pieces in the same rack ignores domains, so one rack loss destroys the stripe."],
    v: "Write an object, delete m pieces chosen at random in a test, and confirm the object still reads correctly, then delete m+1 pieces and confirm the system reports it as unrecoverable rather than returning wrong data.",
    dep: ["stripe-layout", "failure-domains", "checksums"]
  },
  "replication-in-cluster": {
    s: "Keeping full copies of data on several nodes within a site, used for small objects, hot data and metadata where simplicity and fast reads outweigh the storage overhead.",
    d: "A write sends the same bytes to N nodes in different failure domains and acknowledges after a quorum or all have persisted. Reads can come from any copy, which gives simple load spreading and cheap repair: copy from a surviving replica. It costs N times the raw space. Many systems write new data as replicas for speed and convert to erasure-coded stripes after the volume seals. The challenge is keeping replicas identical under partial failure, and deciding when a replica is stale or damaged.",
    k: ["Three copies vs erasure coding: copies give fast simple repair and reads, while codes give lower cost; many systems use both, hot then cold.", "Quorum acknowledgment vs all copies: quorum survives a slow node with lower latency, but leaves a replica temporarily behind that must be repaired."],
    p: ["A replica that missed writes and later comes back serves stale data unless versions or checksums are compared.", "All copies placed on one switch or power feed fail together."],
    v: "Write an object with three replicas, kill two nodes, and confirm reads still succeed and repair restores three copies on other nodes, verified by checksum on each.",
    dep: ["failure-domains", "checksums", "placement-map"]
  },
  "durability-math": {
    s: "The calculation of how likely data is lost over a year from disk failure rates, repair time, scheme and failure-domain layout, which is used to choose parameters and publish durability claims.",
    d: "Loss requires more failures within a stripe than the scheme tolerates before repair finishes. Probability follows from annualized failure rate per disk, number of pieces, tolerated losses and the repair window, often modeled with Markov chains or simulation. Faster repair directly improves durability. Published figures such as eleven nines are modeled, not measured: no one observes enough loss. The difficulty is that independence is assumed; correlated failures, software bugs and operator errors dominate real losses and fall outside the formula.",
    k: ["Modeled durability vs measured: modeling is the only way to reach nine or more nines, but it leaves out bugs and human error that actually cause losses.", "Investing in faster repair vs more parity: faster repair reduces exposure for the same overhead, while more parity adds safety at storage cost."],
    p: ["Assuming independent disk failures overstates durability when batches, firmware or heat cause correlated failures.", "A durability number quoted for objects does not cover accidental deletion, which customers conflate."],
    v: "Re-run the model with measured failure rates and repair times from the last quarter, and confirm the computed annual loss probability stays within the published figure; verify with a failure-injection simulation.",
    dep: ["erasure-coding", "repair-scheduler", "failure-domains"]
  },
  "checksums": {
    s: "Digests stored with every chunk and verified on read, write and scrub, so silent corruption is detected instead of returned as good data.",
    d: "Each chunk or block gets a checksum computed when written and stored beside it, and often in the index. Nodes verify when reading; front ends verify again after reassembly; scrubbers verify at rest; repair verifies sources before using them. Hardware checks on disks and networks miss errors such as misdirected writes and firmware bugs. Cheap hardware-accelerated checksums cover accidental corruption; cryptographic hashes also detect tampering. The difficulty is covering the whole path: any unprotected hop, such as memory or a cache, is where corruption enters unnoticed.",
    k: ["Checksum per small chunk vs per large block: small chunks localize damage and allow partial reads, but add storage and index overhead.", "Fast non-cryptographic checks vs cryptographic hashes: fast ones keep line rate, while cryptographic ones protect against deliberate tampering at higher CPU."],
    p: ["Computing the checksum after reading from a cache rather than from the source hides corruption that happened before.", "Repairing from a piece that was never verified spreads corruption into the rebuilt copy."],
    v: "Flip one bit in a stored chunk on a test node, then read the object: the node must report a checksum failure, the read must succeed using other pieces, and the damaged piece must be queued for repair.",
    dep: ["storage-node-daemon"]
  },
  "scrubbing": {
    s: "Background reading of all stored data, verifying checksums and parity, so that corruption and unreadable sectors are found and repaired before a second failure.",
    d: "Each node reads its data on a schedule, such as every few weeks, comparing against stored checksums and reporting failures to the repair scheduler. Higher-level scrubs reconstruct stripes and compare parity or cross-check replicas. Scrubbing consumes disk bandwidth, so it is throttled and yields to foreground reads. Cold and archive data needs it most, since nothing else reads it. The hard part is balancing frequency against disk cost and wear, and proving coverage: every byte must have been verified recently.",
    k: ["Frequent scrubs vs infrequent: frequent scrubs shorten the time corruption goes unseen, but cost I/O and in some media wear.", "Node-local verification vs cross-node stripe verification: local is cheap and finds bit rot, while cross-node finds misplaced or stale pieces too but uses network."],
    p: ["Scrub bandwidth set so low that cycles take months leaves long windows for undetected corruption.", "Archive data skipped from scrubbing because it is cold is found damaged only at restore time."],
    v: "Corrupt randomly chosen pieces across the cluster in a test and measure the time to detect each and the time to repair, confirming every one is found within one scrub cycle and the coverage report shows 100 percent.",
    dep: ["checksums", "repair-scheduler", "io-scheduling"]
  },
  "stripe-layout": {
    s: "How an object's bytes are divided into fixed-size stripes and cells and mapped onto data and parity pieces, determining read parallelism and the unit of repair.",
    d: "An object is cut into stripes of a chosen size, each cut into k cells with m parity cells computed from them. Cell size trades sequential throughput against small reads: tiny cells spread a small object over many nodes, large ones need big stripes. The layout records stripe size, cell size, and the node of each cell in the manifest. Rotating parity position across stripes spreads parity load. The difficulty is small objects and the tail stripe, which would pad heavily, so they use packing or replication.",
    k: ["Large stripes vs small stripes: large stripes read efficiently and reduce metadata, but waste space at the tail and need buffering on write.", "Rotating parity vs fixed parity nodes: rotation spreads write load evenly, but complicates layout and repair bookkeeping."],
    p: ["Cell size mismatched to disk or network block size causes read amplification on every request.", "Padding the last stripe of many small objects wastes a large fraction of capacity."],
    v: "Write objects of 1 byte, one stripe, and many stripes, then inspect their manifests and node contents to confirm that layouts match the scheme, padding stays under the target, and every size reads back exactly.",
    dep: ["erasure-coding", "object-manifest"]
  },
  "local-reconstruction-codes": {
    s: "Erasure codes with extra local parity over small groups of pieces, so a single lost piece is rebuilt from a few neighbors instead of reading a full stripe.",
    d: "Most failures lose one piece. Plain codes need k reads to rebuild it. Local reconstruction adds a parity over each small group, so repair reads only that group, perhaps six pieces rather than twelve, halving repair traffic and time. Global parities remain for multi-failure cases. The price is slightly more overhead for the same tolerance. Repair speed matters for durability since it shortens exposure, so this trades a little space for a large reduction in network load during the most common failure.",
    k: ["Local parity groups vs plain codes: local groups cut single-failure repair reads substantially, but add parity overhead and complexity to the encoder.", "Group size small vs large: small groups repair cheaply but cost more parity; large groups cost less but repair reads more."],
    p: ["Some failure patterns across groups are not decodable by local parities alone and need the full global decode, which is rarely tested.", "Placing local group members in one rack makes a rack loss exceed what the group tolerates."],
    v: "Fail one piece and measure bytes read during rebuild, confirming it equals the group size rather than k. Then fail patterns that need global parity and confirm full recovery.",
    dep: ["erasure-coding", "reconstruction-workers"]
  },
  "degraded-reads": {
    s: "Serving a read when some pieces are missing or slow, by fetching other pieces and reconstructing the needed bytes on the fly.",
    d: "If a node is down or slow, the reader asks additional nodes for parity or other pieces and decodes the missing data before returning it. Reads that would normally touch k nodes may touch more, and decoding costs CPU. The system also marks the object as needing repair. Done well, clients see only slightly higher latency. It is difficult because during a large failure many reads degrade at once, raising load on survivors precisely when repair traffic also needs them.",
    k: ["Reconstruct on read vs fail until repaired: reconstruction hides failures from clients, but consumes CPU and bandwidth during incidents.", "Hedged parallel fetches vs sequential fallback: hedging gives low tail latency, but doubles load on a stressed cluster."],
    p: ["A large rack failure makes most reads degraded and overloads the remaining nodes.", "Decoding with a corrupt surviving piece produces wrong bytes if checksums are not checked first."],
    v: "Take a node offline under load and confirm reads succeed with correct bytes, the latency rise is within the stated bound, and affected objects appear in the repair queue.",
    dep: ["erasure-coding", "checksums", "repair-scheduler"]
  }
});
