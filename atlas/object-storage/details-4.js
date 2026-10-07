// Details for the object storage plate, part 4: object layout, storage nodes, garbage collection and repair, cross-cutting concerns.
ATLAS.details("object-storage", {
  "object-manifest": {
    s: "The per-version description of how an object's bytes are stored: its length, checksum, encryption info and an ordered list of segments or stripes with their locations.",
    d: "A small object's manifest might be a single entry; a multi-terabyte object's lists thousands of parts, each naming a segment, an offset and length, and a set of nodes. The manifest lives in or is referenced from the index record, and is the only way to find the bytes. Range reads binary search it. Multipart completion builds it from part records without copying data. The difficulty is size: very large manifests are themselves stored as objects, and any change to the layout, such as repair moving a piece, must update it safely.",
    k: ["Manifest inline in the index record vs stored as a separate blob: inline is fast for typical objects, but large manifests bloat the index and need an indirection.", "Immutable manifests vs updatable on repair: immutable ones are simple to reason about, while updatable ones let repair relocate pieces without a rewrite."],
    p: ["A manifest lost or corrupted makes the object unreadable even if every data piece exists.", "Huge multipart manifests slow every ranged read and every copy."],
    v: "For objects of 1 KB, 1 GB and 5 TB, read the manifest and confirm the sum of segment lengths equals the object size and each segment checksum validates when fetched.",
    dep: ["metadata-index", "stripe-layout"]
  },
  "small-object-packing": {
    s: "Combines many small objects into one larger segment with an index of offsets, so disks perform sequential writes and metadata per byte stays low.",
    d: "Objects of kilobytes would waste space and I/O if each were its own stripe or file. The data layer appends them back to back into an open segment, recording for each its offset and length in the index record. Erasure coding then applies to the whole segment once sealed. Reads fetch a small slice at an offset. This turns random small writes into sequential ones and reduces the number of files and pieces. The difficulty is deletion and rewriting: a deleted small object leaves a hole in a shared segment that only compaction can reclaim.",
    k: ["Packing into shared segments vs one stripe per object: packing is dramatically cheaper for tiny objects, but couples object lifetimes and needs compaction.", "Packing by arrival time vs by bucket or tenant: arrival time is simplest and fully sequential, but makes tenant deletion and encryption boundaries harder."],
    p: ["Segments full of mostly dead small objects waste space until compaction rewrites them.", "A tenant's crypto-erase cannot free bytes until packed neighbors are rewritten."],
    v: "Write ten million 4 KB objects and confirm segment count is near total bytes divided by segment size, write throughput is sequential-disk class, and a random read costs one disk read.",
    dep: ["append-only-segments", "object-manifest", "segment-compaction"]
  },
  "append-only-segments": {
    s: "Large containers that only ever receive appended data until sealed and then never change, simplifying consistency, coding, caching and repair.",
    d: "A segment of tens to hundreds of megabytes or more is opened, filled by appending records with checksums, and sealed when full or after a time. Once sealed it is immutable, so it can be erasure-coded, replicated, cached and verified without coordination about concurrent writers. Deleting data never edits a segment; it is recorded elsewhere, and compaction writes live data into a new segment. The design depends on disks performing best at large sequential I/O. The challenge is the open segment, which is the only mutable piece and needs a journal.",
    k: ["Immutable sealed segments vs in-place updates: immutability makes everything else simpler and safer, but pushes cost into compaction and delayed space reclaim.", "Segment size large vs small: large segments cut metadata and suit coding, but delay sealing and make each repair and compaction heavier."],
    p: ["Crash while a segment is open can leave a torn tail record that readers must detect by checksum.", "Never-filled segments stay open indefinitely and block coding and reclaim."],
    v: "Crash a node mid-append and, on restart, confirm the segment's valid prefix is recovered, the torn tail is discarded by checksum, and acknowledged records are all present.",
    dep: ["write-journal", "checksums", "erasure-coding"]
  },
  "large-object-striping": {
    s: "Cuts very large objects into many stripes spread over many nodes so a single read or write uses parallel bandwidth from the whole cluster, not one disk.",
    d: "A large object is split into stripes processed independently. The writer encodes and sends stripes to different node groups in parallel, and the reader fetches many concurrently. Throughput scales with the number of nodes involved, and a failure only affects stripes on that node. Placement of consecutive stripes rotates among groups. The difficulty is that tail latency and memory pressure scale with fan-out: reading a terabyte object touches thousands of nodes, so one slow node can stall the stream and buffers must be bounded.",
    k: ["Wide striping for bandwidth vs narrow grouping for locality: wide gives high throughput per object, while narrow keeps most traffic on fewer nodes and simplifies repair.", "Fixed stripe size vs adaptive: fixed is simple and predictable, while adaptive suits both small and huge objects but complicates manifests."],
    p: ["Unbounded read-ahead on huge objects consumes front-end memory and starves other requests.", "One slow node among thousands dominates a long sequential download."],
    v: "Download a 1 TB object with parallel range reads and confirm aggregate throughput scales with parallelism, correct bytes result, and one deliberately slowed node does not reduce throughput noticeably.",
    dep: ["stripe-layout", "get-object-and-ranges", "placement-map"]
  },
  "segment-compaction": {
    s: "Rewrites sealed segments that contain many dead objects into new, dense ones, then frees the old, reclaiming space created by deletes and overwrites.",
    d: "Because sealed segments never change, deleted or overwritten objects remain as dead space. A compaction job picks segments whose live fraction falls below a threshold, reads the live records, writes them to a new segment through the normal path, updates the index records to point to the new locations, and queues the old segment for removal. Cost is write amplification: live data is rewritten. The hard parts are choosing victims to maximize reclaim per byte moved and doing the index update atomically with respect to concurrent reads and deletes.",
    k: ["Compacting at low live fraction vs frequently: waiting means less data to move per byte freed, but leaves more dead space on disk meanwhile.", "Compacting by rewriting vs by hole-punching: rewriting restores sequential layout and coding, while hole-punching is cheap but fragments segments."],
    p: ["Compaction that races with an overwrite can point the index at a segment that was just freed.", "Heavy compaction after a mass delete saturates disks and slows foreground reads."],
    v: "Fill segments, delete 70 percent of the objects and run compaction. Confirm that live objects still read correctly from new locations, reclaimed bytes equal the dead bytes, and old segments disappear from every node.",
    dep: ["append-only-segments", "reference-tracking", "metadata-index"]
  },
  "compression": {
    s: "Reduces stored and transferred bytes with a general-purpose compressor on data chunks, usually opt-in or for some tiers, because many objects are already compressed.",
    d: "Compression can be applied by clients, by the service on write, or on cold tiers. It operates on chunks so ranged reads can decompress only what they need, and so the checksum covers compressed or uncompressed bytes by design. Text, logs and tables shrink well; images, video and encrypted data do not. Encryption must come after compression, since ciphertext is incompressible, and compressing data that mixes secrets with attacker-controlled content can leak information. The challenge is deciding where it pays for its CPU and latency.",
    k: ["Service-side compression vs client-side: service-side is transparent and can pick per class, while client-side cuts network and avoids server CPU, but each client must do it consistently.", "Chunk-level compression vs whole object: chunks keep random access and parallelism, but give a worse ratio."],
    p: ["Compressing already-compressed media spends CPU for no gain and can slightly increase size.", "Compression before encryption on mixed secret and attacker-influenced data can leak content through size."],
    v: "Store a text corpus and a set of compressed media with compression on, and confirm the first shrinks to the expected ratio, the second stays within a percent, and ranged reads return exact bytes.",
    dep: ["stripe-layout", "server-side-encryption"]
  },
  "deduplication": {
    s: "Detects identical content and stores one physical copy referenced by many objects, saving space for repeated data at the cost of hashing, an index and cross-object coupling.",
    d: "Chunks are hashed; if a chunk's hash already exists, a reference is added instead of storing the bytes again. A global or per-tenant dedup index maps hashes to locations with reference counts. It helps backup-like workloads with massive repetition and copy operations. It often is not used in general-purpose stores because of lookup cost, the memory of the index and security issues: cross-tenant deduplication can reveal whether another tenant stores a particular file. The difficulty is correctness of reference counts across failures and deletions.",
    k: ["Inline dedup vs post-process: inline saves bytes immediately but adds hashing and index lookups to the write path; post-process is cheaper to run but stores duplicates temporarily.", "Per-tenant vs global dedup: per-tenant avoids side channels and keeps encryption keys separate, while global saves more space."],
    p: ["Cross-tenant dedup lets a user probe whether a specific file exists elsewhere by timing or billing.", "A reference count error frees a chunk still needed by another object, losing it permanently."],
    v: "Upload the same 1 GB file under ten keys and confirm physical usage is about 1 GB, then delete nine and confirm the tenth still reads, and deleting it frees the space.",
    dep: ["reference-tracking", "checksums", "garbage-collection"]
  },
  "storage-node-daemon": {
    s: "The process on each storage server that serves reads and writes of pieces and segments by identifier, verifies checksums, and reports status to the control layer.",
    d: "The daemon exposes a small interface over the network: put, get with range, delete, list segment, and verify. It manages many disks, each with its own data directory or raw device, and maps identifiers to locations with a local index. It authenticates callers by token, applies I/O limits, and verifies every read. It knows nothing about buckets or keys, which keeps the node simple and replaceable. The hard parts are failure containment, since a bad disk must not stall the whole node, and fast restart with huge local indexes.",
    k: ["Blob-only interface vs object-aware nodes: blob-only keeps nodes simple and generic, but pushes all logic and consistency into upper layers.", "One daemon per node vs one per disk: per-disk isolates failures, while per-node shares caches and connection handling at the cost of larger blast radius."],
    p: ["A single slow disk blocks threads and makes the whole node look slow to clients.", "Slow startup scanning of billions of blobs delays a node's return after a restart."],
    v: "Kill the daemon on a node under load, restart it, and confirm it rejoins within its target time, rebuilds its index without scanning all data, and returns correct bytes for every blob.",
    dep: ["block-device-layer", "write-journal", "checksums", "node-read-cache"]
  },
  "block-device-layer": {
    s: "How a node stores data on disks: raw devices or a local filesystem, with layout, allocation and flush rules chosen for large appends and safe crash behavior.",
    d: "Some designs write segments as files on a standard local filesystem; others manage raw block devices with their own allocator to avoid filesystem overhead, journaling doubles and metadata ops. Writes are sized to the device, aligned and flushed with explicit barriers so acknowledged data survives power loss. Reads use direct or buffered I/O depending on caching strategy. Hard parts include the many-small-file overhead of filesystems at scale, firmware that lies about flushes, and different behavior of rotating, flash and shingled media.",
    k: ["Raw device with custom allocator vs local filesystem: raw avoids overhead and gives control, but means writing and debugging your own allocator and recovery.", "Direct I/O vs page cache: direct gives predictable latency and no double caching, while the page cache absorbs bursts but can hide failures and consume memory."],
    p: ["A drive acknowledging writes before they are durable loses acknowledged data on power failure.", "Filesystem metadata overhead with millions of files per disk slows every operation as the disk fills."],
    v: "Cut power during sustained writes on a test node, restart, and confirm every acknowledged write is present and verified, and no unacknowledged partial record is visible.",
    dep: ["disk-health-monitoring"]
  },
  "write-journal": {
    s: "A small, fast sequential log on each node where incoming writes land first, giving durable acknowledgment quickly before data is placed in its final layout.",
    d: "Each write is appended with a checksum to a journal on fast media, possibly flash or a dedicated disk, and acknowledged when flushed. A background process moves data into its segment location and trims the journal. After a crash, recovery replays the journal's valid records. It gives low latency for small writes and absorbs bursts, and preserves ordering for open segments. Its hard part is sizing and failure: a journal on one device is a single point of loss, and a full journal must apply back-pressure to writers.",
    k: ["Journal on separate fast media vs same disk: separate gives low write latency and no seek conflict, but adds another device whose failure loses acknowledged data.", "Acknowledge after journal flush vs after final placement: journal flush is fast, but data is protected only by the journal until it is moved."],
    p: ["Journal device failure silently loses acknowledged writes if copies on other nodes are not required.", "A journal that fills faster than it drains stalls all writes on the node."],
    v: "Write at maximum rate until the journal approaches full, confirm writers see back-pressure rather than loss, then crash and recover and confirm all acknowledged records replay exactly once.",
    dep: ["block-device-layer", "checksums"]
  },
  "node-read-cache": {
    s: "A cache of recently or frequently read data and local indexes in memory or flash on a storage node, reducing disk seeks for hot segments.",
    d: "Hot objects, index blocks and segment footers are kept in memory, with larger capacities on flash. Because objects are immutable, cache entries never go stale, only unneeded, which removes invalidation. Sequential scans, repair and scrubbing bypass the cache so they do not evict useful data. Admission policies keep one-time reads out. The aim is to cut disk operations for skewed workloads. The difficulty is that cache effectiveness depends heavily on workload, and cold-data tiers see almost no benefit.",
    k: ["Caching at the node vs in front-end caches: node caches are close to the disk and simple, while front-end caches avoid network hops but see less of the access pattern.", "Admitting all reads vs frequency-based admission: admitting all is simple, but scans flush the working set; admission filters keep hot data."],
    p: ["A scrub or repair scan that goes through the cache evicts the working set and doubles latency.", "Caching decrypted or unverified data risks serving corrupted bytes."],
    v: "Run a skewed read workload and confirm the hit rate exceeds target and disk reads fall accordingly. Then run a full scan and confirm the hit rate for the hot set is unchanged.",
    dep: ["storage-node-daemon", "block-device-layer"]
  },
  "io-scheduling": {
    s: "The queues and priorities that decide which disk operations run next, so foreground reads keep low latency while repair, scrubbing and compaction use leftover capacity.",
    d: "Each disk serves one or few operations at a time, with rotating disks costing milliseconds per seek. The scheduler holds separate queues for customer reads, writes, repair, scrub, rebalance and compaction, each with a priority and a bandwidth share, and adapts when latency rises. Deadlines prevent starvation of background work. It is difficult because background work is mandatory for durability, so throttling it too hard lets debts grow, while too little throttling harms customers.",
    k: ["Strict priority for foreground vs weighted sharing: strict gives the best customer latency, but background work can starve; weights guarantee progress at some latency cost.", "Static limits vs feedback control on latency: feedback adapts to load, but can oscillate and is harder to reason about."],
    p: ["Background work starved for days builds a repair backlog that becomes a durability risk.", "Unbounded queue depth to a failing disk raises latency for everything queued behind it."],
    v: "Run foreground reads at steady load while repair and scrub run at full speed, and confirm foreground p99 latency stays within its objective and background jobs still make progress above their minimum rate.",
    dep: ["block-device-layer", "storage-node-daemon"]
  },
  "disk-health-monitoring": {
    s: "Watches disks and nodes for signs of failure, using error counters, latency outliers and self-reported health, to drain suspect hardware before it loses data.",
    d: "Agents collect device error counts, reallocated sectors, temperature, read latency distributions and checksum failure rates. A disk with growing errors or consistent slowness is flagged: reads avoid it, new writes stop going there, and repair copies its data away before it fails. Fail-slow disks are the hard case, since they still respond but drag tail latency. The service must decide quickly: false positives waste capacity and bandwidth, false negatives allow failures to accumulate until correlated.",
    k: ["Proactive drain on warnings vs wait for failure: proactive avoids degraded redundancy and tail latency, but retires healthy disks and spends repair bandwidth.", "Thresholds on device telemetry vs on observed behavior: telemetry is early but unreliable, while behavior is accurate but later."],
    p: ["A fail-slow disk is never marked failed and adds latency to every request that touches it.", "Mass false-positive drains after a firmware change trigger large repair traffic."],
    v: "Inject slow responses and read errors into one disk in a test, and confirm it is flagged within its target time, excluded from new writes, and its data is moved to other disks with no lost objects.",
    dep: ["membership-and-heartbeats", "repair-scheduler"]
  },
  "membership-and-heartbeats": {
    s: "The service that tracks which nodes exist and are alive, using heartbeats and a replicated registry, and publishes changes to placement, routing and repair.",
    d: "Nodes register on startup and send periodic heartbeats with health and capacity. A coordinator in a replicated group marks a node suspect after missed beats and dead after a longer grace period, and publishes versions of the cluster map. Short outages should not cause rebuilds, so the dead timeout balances speed against churn. Other components subscribe to changes. The hard part is false suspicion, since a network partition looks like node death, and keeping every component converging on the same view.",
    k: ["Short failure timeout vs long: short restores redundancy fast, but triggers expensive rebuilds for brief reboots; long avoids churn but extends exposure.", "Central registry vs gossip: a central replicated registry gives one consistent view, while gossip scales and has no single point but converges eventually."],
    p: ["A network partition marks a healthy rack dead, so repair copies terabytes unnecessarily.", "Components acting on different versions of the cluster map write to nodes already declared dead."],
    v: "Reboot a node for 30 seconds and confirm no rebuild starts, then keep it down past the timeout and confirm it is marked dead, published, and its data repair begins.",
    dep: ["metadata-consensus"]
  },
  "garbage-collection": {
    s: "Reclaims storage for data that no index record references anymore, after deletes, overwrites, aborted uploads, expired versions and failed writes.",
    d: "Deleting an object only changes the index. A collector later determines which data is unreferenced and frees it, either by tracking reference counts or by comparing a snapshot of live references against stored data and deleting the difference after a safety delay. It must never free data that a concurrent write or copy is about to reference. Freed segments are removed from nodes or compacted. The challenge is safety: a mistaken free is permanent loss, so collectors are conservative, delayed and heavily audited.",
    k: ["Mark and sweep from the index vs reference counting: mark and sweep tolerates lost updates and finds orphans, but needs a full scan; counting is incremental but one bug leaks or loses data.", "Immediate free vs delayed free with a grace window: delay protects against races and mistakes and allows undelete, but holds space longer."],
    p: ["Collecting data written but not yet committed to the index deletes bytes of an in-flight upload.", "A collector bug that treats a lagging index replica as complete frees live data."],
    v: "Delete, overwrite and abandon objects in a test, wait out the grace period, and confirm unreferenced bytes are freed, usage reports drop accordingly, and a byte-for-byte audit shows no live object lost.",
    dep: ["reference-tracking", "orphan-detection", "metadata-index"]
  },
  "reference-tracking": {
    s: "Knowing which index records point at each segment or chunk, via counts or scans, so shared and packed data is freed only when nothing uses it.",
    d: "Segments hold many objects, copies share data, and multipart parts are referenced by manifests, so freeing a unit requires proof that no record points to it. Systems maintain reference counts updated transactionally with index changes, or compute live sets by scanning the index periodically and comparing to stored identifiers. Counts are fast but fragile under retries; scans are robust but slow and need consistent snapshots. The hard part is atomicity between the index change and the count, and recounting without pausing writes.",
    k: ["Maintained counts vs recomputed liveness: counts give instant reclaim but accumulate drift; periodic scans self-heal and cost compute proportional to the whole index.", "Per-object vs per-segment tracking: per-segment tracking is compact, while per-object lets compaction choose precisely but costs more memory."],
    p: ["A retried decrement applied twice frees data still in use.", "Scans over a non-snapshot index miss references created during the scan and free live data."],
    v: "Create shared copies, delete them in all orders with injected retries, and confirm the reference count of each chunk always equals the number of records pointing at it, verified by a full independent scan.",
    dep: ["metadata-index", "object-manifest"]
  },
  "orphan-detection": {
    s: "Finds stored data that no record references, left by crashes between data write and index commit, and queues it for removal after a safety delay.",
    d: "Stored segments and pieces list their identifiers; the detector compares them with the set referenced by the index and by in-progress uploads. Items unreferenced for longer than a grace period, longer than any plausible in-flight write, become candidates, and candidates are verified a second time before deletion. It also finds the reverse: records pointing at missing data, which are alerts, not deletions. The challenge is scale and safety: comparing billions of identifiers across systems without a global pause, and picking a grace period that is always long enough.",
    k: ["Grace period short vs long: short frees space sooner, but risks deleting data of slow in-flight writes; long is safe and holds orphan bytes meanwhile.", "Periodic full comparison vs write-ahead intent records: comparison needs nothing on the write path, while intent records find orphans precisely but cost a write per upload."],
    p: ["A paused client finishing a very slow upload after the grace period finds its data deleted.", "Detecting dangling records is treated as cleanup and deleted instead of escalated, destroying evidence of loss."],
    v: "Crash writers between data write and commit across thousands of uploads, and confirm that all resulting orphans are found, removed after the grace period, and no committed object's data is removed.",
    dep: ["garbage-collection", "atomic-commit-protocol"]
  },
  "tombstone-expiry": {
    s: "Removes the markers that record deletions in the index and replicas once every copy has seen them and no version still needs them.",
    d: "A delete leaves a tombstone so replicas, caches and consumers converge on the removal. Tombstones are retained until a safe horizon: all replicas have applied it, replication to remote regions has passed it, and any retention rules are satisfied. After that, a purge removes the tombstone and, in versioned buckets, expired markers. Without purging, deletion-heavy workloads such as queues built on object keys fill the index with markers that slow range scans. The hard part is determining the horizon safely across regions.",
    k: ["Long tombstone retention vs short: long is safe against resurrecting deleted data after a replica returns, but slows listings and uses index space.", "Purging per partition on a schedule vs when scans detect density: schedule is predictable, while density-triggered targets the slow ranges first."],
    p: ["Purging a tombstone before a lagging replica applies it resurrects the deleted object.", "Heavy delete traffic on one prefix creates millions of tombstones that make list calls time out."],
    v: "Delete a million keys, confirm listing latency over their prefix stays bounded after the purge horizon passes, and that a replica rejoining after downtime shorter than the horizon does not bring back any deleted key.",
    dep: ["delete-markers", "metadata-index", "listing-and-prefix-scans"]
  },
  "repair-scheduler": {
    s: "Finds objects and segments with fewer healthy pieces than their policy requires and orders the rebuild work, most at-risk first, within a bandwidth budget.",
    d: "Inputs are node failure events, checksum failures from reads and scrubs, and decommissions. The scheduler maps affected pieces to the segments and objects that own them, and computes how many pieces each has lost. Those with the fewest surviving margins are fixed first, since they are closest to loss. Tasks go to reconstruction workers, throttled so the network and disks of survivors are not overloaded. The challenge is correlated failure: a rack loss creates millions of tasks at once, and prioritization decides whether any data is lost on a second failure.",
    k: ["Prioritizing by remaining redundancy vs first-come: risk-first minimizes data loss probability, but needs accurate margin tracking and can delay lightly affected objects.", "Delaying repair for transient failures vs immediate: delay avoids rebuilding data on nodes that come back, but extends the vulnerable period."],
    p: ["Queue ordering by arrival leaves the most at-risk stripes waiting behind harmless ones.", "Repair flood after a rack failure saturates survivors and causes customer-visible errors."],
    v: "Fail a rack in a test cell and confirm the repair queue orders stripes by remaining redundancy, every object returns to full redundancy within the target time, and foreground latency stays within its objective.",
    dep: ["membership-and-heartbeats", "reconstruction-workers", "placement-map"]
  },
  "reconstruction-workers": {
    s: "Processes that read surviving pieces, compute the missing ones through the code and write them to new nodes, restoring each stripe to full redundancy.",
    d: "A worker takes a task naming a stripe, a set of missing pieces and a target set of nodes chosen by placement rules. It reads enough surviving pieces, verifying their checksums, decodes the missing pieces, writes them to targets, verifies the writes and updates the manifest or index. Reading k pieces to rebuild one is the amplification that local reconstruction codes reduce. Workers run near the data or on dedicated machines with network quotas. The challenge is correctness under concurrent change and avoiding amplifying a corruption by decoding from a bad source.",
    k: ["Dedicated repair hosts vs repair on storage nodes: dedicated hosts isolate load and bring compute, but pull all data across the network; node-side repair saves transfer but competes with serving.", "Rebuild to a new node vs wait for the failed one: rebuilding restores redundancy promptly, while waiting avoids work if the node returns."],
    p: ["Using an unverified source piece in decoding writes a corrupted piece that looks healthy afterward.", "Two workers repairing the same stripe create duplicate pieces and confuse placement records."],
    v: "Destroy m pieces of 1,000 stripes and run reconstruction. Confirm each stripe is restored, every rebuilt piece matches the checksum of the original, and the manifest lists new locations without duplicates.",
    dep: ["erasure-coding", "checksums", "placement-map", "io-scheduling"]
  },
  "drive-decommissioning": {
    s: "Retires disks, nodes or whole racks by moving their data elsewhere and removing them from placement, without lowering any object's redundancy during the process.",
    d: "An operator marks a target as draining. Placement stops sending new data to it, and the rebalancer or repair system copies its pieces to other nodes while the originals continue serving reads. When every piece is confirmed elsewhere and verified, the target is removed from the cluster map, and then data is wiped, often by destroying keys or overwriting. It differs from failure handling because the source is healthy and can be read cheaply. The difficulty is doing it at fleet scale, as hardware refreshes retire thousands of drives, within a limited bandwidth budget.",
    k: ["Drain by copying from the healthy source vs treating it as failed: copying keeps full redundancy and uses cheap reads, but needs the target to stay up until done.", "Secure wipe by overwrite vs by key destruction: key destruction is instant and works for encrypted data, while overwrite is slow and does not cover remapped sectors."],
    p: ["Removing a drive from the map before its data is verified elsewhere leaves objects under-redundant.", "Retired drives leaving the datacenter with readable data are a breach if not wiped or encrypted."],
    v: "Drain a rack under load and confirm no object is below full redundancy at any sampled moment, the node holds zero live data at the end, and its drives fail a read-back test after wipe.",
    dep: ["rebalancing", "repair-scheduler", "membership-and-heartbeats"]
  },
  "durability-budget": {
    s: "The decision of how much redundancy, repair speed and verification to pay for, expressed as an annual loss probability that every layer's design must meet.",
    d: "Durability is a budget spent across layers: redundancy scheme, failure-domain spread, repair bandwidth, scrubbing frequency, software safeguards against bugs and operator error. Choosing nine or eleven nines sets the overhead of coding, the number of sites and how quickly repair must finish. Each class can have a different budget. The decision determines storage cost and also constrains operations: a rack loss must never exhaust margin. The hard part is that the model covers hardware, while real losses come from software and human errors that need separate controls such as delayed deletes.",
    k: ["Higher durability through more parity vs through faster repair: parity adds a fixed cost on every byte, while faster repair spends bandwidth only on failure.", "One durability target for all data vs per class: one target is simple, while per-class tracks value and cost but multiplies schemes to operate."],
    p: ["Quoting hardware-only math to customers while software bugs remain the real risk gives false confidence.", "Cutting parity to save cost without lengthening the repair margin silently raises loss probability."],
    v: "Produce the annual loss estimate from current scheme, failure rates and measured repair time, and confirm it is at or above the published target, and that a rack-loss drill leaves every stripe above its minimum margin.",
    dep: ["durability-math", "erasure-coding", "repair-scheduler"]
  },
  "cost-per-byte": {
    s: "The economic constraint that drives the whole design: dollars per stored byte-month, including disks, power, network and operations, set against what each class sells for.",
    d: "Hardware dominates: dense disks, low-overhead codes, tiering and compression exist to lower raw cost per usable byte. Requests, egress and operations add their own costs, so price lists separate them. Small objects are costly because per-object overhead (index entries, requests, minimum sizes) does not shrink with size. Cost shapes decisions such as 1.4x coding rather than 3x copies, spinning disks for cold data, and delayed rather than instant space reclaim. The tension is between lower cost and tail latency, repair time and simplicity.",
    k: ["Cheapest media and widest codes vs performance headroom: lowest cost per byte wins capacity pricing, but slow repair and degraded reads hurt latency and durability.", "Pricing per request and byte vs flat: usage pricing tracks real cost drivers, but makes bills hard to predict for customers."],
    p: ["A storage class that is cheap per byte but expensive per request loses money on small-object workloads.", "Optimizing steady-state cost while ignoring repair overhead understates real cost at scale."],
    v: "Compute total cost of a month of operation, divided by average usable bytes stored, by class and compare it with the price per byte-month, confirming margin by workload shape including small objects.",
    dep: ["storage-classes", "erasure-coding", "small-object-packing"]
  },
  "keyspace-scale": {
    s: "The expectation that a single bucket can hold trillions of keys and sustain high request rates, which forces partitioned, range-based, self-splitting indexes and shapes every listing and policy feature.",
    d: "Designers assume that no component can hold the whole key space. The index is partitioned and split automatically, lifecycle and inventory run as scans in parallel, and operations that touch all keys (listing everything, bucket deletion, bulk expiry) are designed as background jobs. Features are judged by whether they cost per object or per request. The pressure also leaks into client advice: avoid sequential prefixes, avoid listing as a query tool. The hard part is that behaviors fine at a million keys become cliffs at a trillion.",
    k: ["Unlimited keys per bucket vs per-bucket limits: unlimited is simple for customers, but requires every feature to scale independently of bucket size.", "Prefix-based performance scaling vs automatic: prefix-based gives predictable limits, while automatic hides tuning but reacts only after a hot spot appears."],
    p: ["Features designed with per-bucket scans or locks stop working as buckets grow past a billion keys.", "Customers using sequential key names hit partition limits at low total traffic."],
    v: "Load a test bucket to a billion keys and confirm that point operations, paged listing, lifecycle passes and inventory runs stay within their latency and duration targets without manual tuning.",
    dep: ["key-range-partitioning", "partition-splitting", "lifecycle-scanner"]
  },
  "multi-tenancy": {
    s: "The fact that many unrelated customers share every component, which demands isolation of data and performance, fair limits, per-tenant accounting and blast-radius control in every layer.",
    d: "Every request carries a tenant identity checked for access, counted for billing and subject to limits. Shared front ends, index partitions and storage nodes make noisy neighbors possible, so throttling, queue fairness and cell-based deployment keep failures local. Encryption and policy boundaries limit what a bug can expose. Large customers may get dedicated cells or partitions. The hard part is that sharing is where the economics come from, so isolation is a continuous trade between utilization and predictable performance and safety.",
    k: ["Shared fleet vs per-tenant cells: sharing maximizes utilization and gives smooth capacity, while cells contain failures and noise but fragment capacity.", "Hard limits vs best-effort fairness: hard limits are predictable and defensible, while best-effort uses spare capacity but gives uneven performance."],
    p: ["One tenant's batch job saturates a shared partition and raises latency for unrelated customers.", "A bug in shared code paths exposes data across tenants if identity is not rechecked at each layer."],
    v: "Run an abusive tenant and several normal ones on the same cell and confirm the normal ones' latency and error rates remain within objectives while the abuser is throttled, and nothing crosses tenant boundaries.",
    dep: ["tenant-isolation", "throttling-and-quotas", "usage-accounting"]
  },
  "failure-as-normal": {
    s: "The working assumption that at fleet scale some disks, nodes, racks and links are always failing, so no operation, repair or deployment may assume a healthy system.",
    d: "With millions of disks, several fail every day and whole racks fail regularly. Every path is designed to continue through failure: writes need only a quorum of pieces, reads reconstruct, repair is continuous, and deployments proceed in waves with automatic rollback. Retries are bounded and jittered to avoid storms. Operators plan maintenance as failures that happen on purpose. The cost is complexity and the rare, correlated, multi-component events that the normal-case design handles badly, which therefore need regular drills and fault injection.",
    k: ["Continuous repair and degraded operation vs halting on failure: continuing keeps availability and durability high, but demands well-tested degraded paths that are exercised rarely.", "Fault injection in production vs staging only: production finds real weaknesses, but needs safeguards and carries risk."],
    p: ["A degraded path never exercised in practice fails the first time a real incident needs it.", "Retries without budgets turn a partial failure into a self-inflicted outage."],
    v: "Run a game day that kills a rack, a zone's network link and a metadata leader in sequence under load, and confirm client success rate stays within objective and no acknowledged data is lost.",
    dep: ["repair-scheduler", "degraded-reads", "metadata-consensus"]
  },
  "immutability-discipline": {
    s: "The rule that stored data is never modified in place: objects, segments and stripes are written once, and every change is a new version or segment, which underlies simplicity, caching and repair.",
    d: "Because a stored object is immutable, caches never invalidate, erasure coding is computed once per stripe, replicas cannot diverge in content, repair is a copy and scrubbing compares against a fixed checksum. Updates become new versions, deletes become markers and space is reclaimed by compaction and garbage collection. The discipline extends to metadata histories and logs. Its costs are write amplification, delayed reclaim and no partial updates: changing one byte rewrites the object. The hard part is holding the line in the places where mutability is tempting, such as tiny metadata changes.",
    k: ["Immutable objects vs in-place update: immutability makes the whole data layer simpler and safer, but forces whole-object rewrites for small changes.", "Append-only metadata changes vs mutable fields: append-only gives history and easy recovery, but needs compaction of old records."],
    p: ["An in-place optimization such as patching a stripe introduces races between readers, repair and scrubbers.", "Applications built on frequent small updates pay whole-object rewrite costs and large version histories."],
    v: "Scan stored segments over a period and confirm no byte of any sealed segment changes (by checksum), while overwrites and deletes appear only as new versions, markers or new segments.",
    dep: ["append-only-segments", "versioning", "segment-compaction"]
  }
});
