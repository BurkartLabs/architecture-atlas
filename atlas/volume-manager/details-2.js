// Details for the volume manager plate, part 2: thin provisioning, caching, encryption and integrity.
ATLAS.details("volume-manager", {
  "thin-pool": {
    s: "A shared reservoir of data blocks and a metadata area from which many thin volumes allocate space only when blocks are first written.",
    d: "The pool is built from a data device and a metadata device. Thin volumes are created in it with a virtual size and no space. On first write to a region, the pool allocates a block, records the mapping and performs the write; reads of unmapped regions return zeroes. Pool-wide counters track free data blocks and free metadata space. It is hard because the guarantee a conventional volume gives, that a write to an address you were given will succeed, no longer holds: the write can fail at any time when the shared pool is full.",
    k: ["Thin vs thick provisioning: thin raises utilization and defers purchasing, thick guarantees space for each volume and wastes the reservation.", "One large pool vs several smaller pools: one pool shares free space best, while separate pools limit how far one tenant's growth can harm others."],
    p: ["Volumes are created far beyond the pool's capacity and every one is written to, and the pool fills with all volumes failing at once.", "The pool is expanded but its metadata device is not, and allocation fails with free data space."],
    v: "Create thin volumes whose combined size exceeds the pool, write to only part of them, and confirm free space falls only by the written amount, and that writes beyond the pool's real capacity fail with the documented error.",
    dep: ["block-mapping-tree", "pool-metadata-device", "chunk-allocation", "target-drivers"]
  },
  "block-mapping-tree": {
    s: "The persistent tree structure that maps each thin volume's logical blocks to physical blocks in the pool, updated transactionally with each allocation.",
    d: "Each thin volume has a tree keyed by logical block; the value is the physical block. Trees are copy-on-write: an update writes new nodes up to the root and then commits a new root, so a crash leaves either the old tree or the new one. Trees of snapshots share nodes. Hot parts are cached in memory and commits are batched. It is hard because every first write is also a metadata update, so metadata performance and its crash safety dominate thin volume behavior.",
    k: ["Copy-on-write tree with atomic root commit vs an in-place journaled structure: the tree is simple to make crash-safe and rewrites nodes, a journal updates in place and needs replay.", "Frequent vs infrequent commits: frequent commits shrink the data lost at a crash but each commit costs a flush, infrequent commits batch better."],
    p: ["A crash after data is written but before the commit loses the mapping, so the application's acknowledged write disappears unless a flush was issued.", "A corrupted tree node orphans a whole subtree of mappings, and volumes read zeroes in those ranges."],
    v: "Write blocks with intermittent flushes, cut power, and verify that after restart every block written before the last flush reads back correctly and that the pool's consistency check passes.",
    dep: ["pool-metadata-device", "flush-and-fua-ordering", "crash-consistency", "chunk-allocation"]
  },
  "pool-metadata-device": {
    s: "A dedicated device or area holding the thin pool's mapping trees and allocation records, sized and protected separately from the data.",
    d: "Metadata is a small fraction of the pool but is the most critical part of it: losing it loses all volumes. It is usually placed on redundant storage, often faster than the data device, and its size depends on the number of blocks and snapshots. A tool can check and repair it offline, and a spare area is held back for repair. It is hard because it has its own capacity limit that fills independently of data, and because a full metadata device can force the pool read-only.",
    k: ["Metadata on fast mirrored storage vs on the same device as data: separate fast storage speeds commits and protects against data-disk loss, the same device is simpler and shares its failures.", "Generous metadata size vs minimal: generous avoids early exhaustion and wastes space, minimal saves space and forces a pool migration to fix."],
    p: ["Metadata is placed on the same failing disk as data and a single fault loses the whole pool.", "Metadata fills first because of many snapshots of small blocks, putting the pool into a read-only failure mode."],
    v: "Run the offline metadata checker on a pool after a forced power cut and confirm it reports no errors, then deliberately fill metadata in a test pool and confirm the pool reports it clearly and alerts before it fails.",
    dep: ["block-mapping-tree", "raid-mirroring", "usage-thresholds", "metadata-recovery"]
  },
  "chunk-allocation": {
    s: "Choosing and recording which free blocks of the pool a first write will take, using a space map that tracks free and shared blocks.",
    d: "The pool is divided into fixed-size chunks. A space map records each chunk's reference count: zero is free, one is in use by one volume, higher means shared with snapshots. Allocation finds a free chunk, preferring nearby ones for sequential writes, and records it in the same transaction as the mapping. The chunk size sets granularity. It is hard because small chunks give precise use and a large map, large chunks give small maps and waste space and copy more on partial writes to shared blocks.",
    k: ["Small vs large chunk size: small chunks reduce copy cost and wasted space and make metadata large, large chunks suit sequential workloads and snapshots with heavy overhead.", "Allocate near the last block vs first free: locality keeps files contiguous and fragments free space, first-fit is simple and scatters data."],
    p: ["A chunk size chosen for large files performs badly with a database that does small random writes into snapshots.", "Space map and mapping updates committed separately leak chunks after a crash, so free space slowly shrinks."],
    v: "Write sequentially and then randomly into a thin volume and confirm allocated chunks equal the number of distinct chunks touched, and that after a crash and restart used plus free chunks equal the pool size.",
    dep: ["block-mapping-tree", "physical-extent", "space-accounting"]
  },
  "discard-passdown": {
    s: "Passing a filesystem's block-freed notifications down so the thin pool releases the blocks and the underlying flash devices can reclaim them.",
    d: "When a filesystem deletes a file it may send discard requests for the freed ranges. The thin layer unmaps the corresponding chunks, returning them to the pool, and may forward the discard to the data device so a flash drive can erase them early. Partial-chunk discards cannot free anything and are either ignored or zeroed. Discards are issued online with each delete or in a periodic batch. It is hard because without them a thin volume only ever grows, and with them latency and ordering matter.",
    k: ["Online discard on every delete vs periodic batch discard: online keeps the pool tight and adds latency to deletes, periodic batching is cheaper and leaves space allocated between runs.", "Pass discards to the device vs absorb them in the pool: passing helps flash wear and speed, absorbing avoids slow or unreliable device implementations."],
    p: ["A filesystem that never issues discards makes every thin volume look full over time though files are deleted.", "A device with a slow discard implementation stalls all I/O while a large range is released."],
    v: "Write and delete a large file on a thin volume with discards enabled and confirm the pool's used count falls by about the file's size, with no errors in the log and without corrupting remaining files.",
    dep: ["chunk-allocation", "discard-support", "thin-pool", "target-drivers"]
  },
  "overcommit-control": {
    s: "The limits and low-water marks that decide how much virtual size may be promised against real space, and what happens when free space gets low.",
    d: "Overcommit ratio is the sum of thin volume sizes divided by pool size. Administrators choose a limit, and a low-water mark that raises an event when free space falls beneath it. At exhaustion, the pool can queue writes for a configured period waiting for more space or fail them immediately with an error. Queueing gives the operator time to add capacity and holds application threads. It is hard because the right ratio depends on workloads and their growth, which change.",
    k: ["Queue writes at exhaustion vs fail them: queueing gives time to extend the pool and can hang applications, failing is clear and turns a capacity problem into a filesystem error.", "High vs low overcommit ratio: high saves cost and risks surprise failures, low wastes space and is safe."],
    p: ["Writes queue silently during exhaustion and applications time out in ways that look like a network problem.", "Filesystems on thin volumes see I/O errors during exhaustion and remount read-only, requiring manual recovery."],
    v: "Exhaust a test pool and confirm the configured behavior happens: either writes wait and complete after extension, or fail with a logged error, and the low-water event fires before exhaustion.",
    dep: ["thin-pool", "usage-thresholds", "pool-extension", "space-accounting"]
  },
  "pool-extension": {
    s: "Adding space to a thin pool, manually or automatically when a threshold is crossed, including growing its metadata separately from its data.",
    d: "Extension adds extents from the group to the pool's data device, or to its metadata device, then reloads the pool's mapping table so the new space is usable; this is done while volumes are in use. Automatic extension runs from the monitor when usage crosses a threshold and grows by a configured percentage. It needs free space in the group to draw on. It is hard because the monitor may react more slowly than writes arrive, and growing metadata and data together requires the right proportions.",
    k: ["Automatic extension vs manual: automatic prevents most outages and consumes group space unattended, manual is deliberate and slow.", "Large step vs small step growth: large steps react rarely and strand space in the pool, small steps follow demand and run the monitor often."],
    p: ["Extension fails because the group has no free extents, and the alert is the first sign.", "Extension of data without metadata leaves the pool read-only when metadata fills."],
    v: "Fill a pool past the extension threshold while writing continuously and confirm it grows without write errors, that the new size appears in status output, and that the group's free extents fell by the same amount.",
    dep: ["thin-pool", "volume-group", "online-grow", "usage-thresholds"]
  },
  "block-cache": {
    s: "A mapping layer that keeps hot blocks of a slow origin device on a fast cache device and serves reads and writes from the cache when it can.",
    d: "The cache device is divided into fixed-size blocks, each possibly holding a copy of an origin block. A lookup structure maps origin blocks to cache blocks. A read hit goes to the fast device; a miss reads the origin and may promote the block. Writes go to the cache and later to the origin, or to both. A separate small metadata area records the mapping and dirty state. It is hard because the combined device is only as safe as its weakest part: a dirty block exists only on the cache until written back.",
    k: ["Block-level cache below the filesystem vs a cache in the filesystem: the block cache works for any workload and sees only addresses, the filesystem can use file semantics and is tied to it.", "Large vs small cache block: large blocks cut metadata and favor sequential access, small ones use the cache efficiently for random I/O and need more metadata."],
    p: ["A cache sized larger than memory for its metadata makes lookups slow because mapping state is paged out.", "Losing the cache device while it holds dirty blocks corrupts the volume because the origin is behind."],
    v: "Run a workload with a hot set smaller than the cache and confirm the hit rate in status output approaches 100 percent after warm-up and that application latency drops toward the cache device's.",
    dep: ["cache-modes", "promotion-policy", "dirty-block-tracking", "cache-metadata", "target-drivers"]
  },
  "cache-modes": {
    s: "The write policies of a cache: writethrough sends every write to both devices, writeback acknowledges from the cache and writes back later, passthrough bypasses it.",
    d: "In writethrough the origin always has current data, so losing the cache loses nothing but performance, and writes are only as fast as the origin. In writeback the write completes at the speed of the cache and the dirty block is flushed later, which accelerates writes and makes the cache hold the only current copy. Passthrough is used to validate or migrate state. The mode can be changed on a running cache after a flush. It is hard because writeback makes the cache a single point of failure, so the cache device usually needs its own redundancy.",
    k: ["Writeback vs writethrough: writeback speeds writes and risks data on cache loss, writethrough is safe and gives no write speedup.", "Redundant cache device vs a single one: redundancy protects writeback data and halves the usable fast capacity."],
    p: ["Writeback on a single consumer SSD without power-loss protection loses acknowledged writes on a power cut.", "A cache switched to writethrough without finishing the flush silently leaves the origin out of date."],
    v: "In writeback mode, write data, remove the cache device without flushing in a test, and confirm the system reports the volume as damaged; in writethrough mode the same removal must leave all data intact on the origin.",
    dep: ["block-cache", "dirty-block-tracking", "volatile-write-cache", "raid-mirroring"]
  },
  "promotion-policy": {
    s: "The policy that decides which blocks are copied into the cache and which are evicted, usually from recency and frequency of access.",
    d: "A policy tracks accesses per block and chooses candidates to promote, and victims to demote when the cache is full. Simple ones use least recently used; others count hits over a window or weigh promotions against their copy cost, so that a block must prove itself before it displaces another. Promotion and demotion use bandwidth that competes with application I/O, so it is throttled. It is hard because workloads change, one large scan can flush the whole cache, and promoting costs a read and a write of the whole block.",
    k: ["Recency-based vs frequency-based policy: recency adapts fast and is washed out by scans, frequency resists scans and reacts slowly to change.", "Promote on first miss vs after repeated hits: promoting at once warms quickly and wastes cache on one-time reads, waiting protects the cache and delays benefit."],
    p: ["A nightly backup scan evicts the working set and the application is slow for hours after.", "Promotion traffic saturates the origin device and makes the cache slower than no cache."],
    v: "Run a hot working set, then a one-pass sequential scan larger than the cache, and measure the hit rate on the working set afterwards: it must stay high if the policy resists scans.",
    dep: ["block-cache", "sequential-bypass", "rebuild-throttling"]
  },
  "dirty-block-tracking": {
    s: "A persistent bitmap recording which cache blocks are newer than the origin, so they can be written back later and found again after a crash.",
    d: "Each cache block has a dirty flag in the cache metadata. A write in writeback mode sets it, and a write-back to the origin clears it. The flags are stored on the metadata device and committed periodically. A background cleaner writes dirty blocks back, and its rate affects how much data is at risk. On restart, blocks still marked dirty are rewritten. It is hard because the flag must be durable before the write is acknowledged for the data to be safe, which costs a metadata write.",
    k: ["Persist the dirty flag before acknowledging vs after: before is safe and slows writes, after is faster and loses recent writes in a crash.", "Aggressive vs lazy write-back: aggressive keeps few dirty blocks and uses origin bandwidth, lazy absorbs rewrites of the same block and risks more."],
    p: ["The dirty bitmap is committed less often than data is acknowledged, and a crash returns old data for recently written blocks.", "A backlog of dirty blocks builds beyond what the origin can drain, then a flush takes hours."],
    v: "Write a known set of blocks in writeback mode, crash the host, restart, and compare the volume to the written data: every block acknowledged as durable must match, and the dirty count must drain to zero.",
    dep: ["cache-metadata", "flush-and-fua-ordering", "cache-modes", "crash-consistency"]
  },
  "cache-metadata": {
    s: "The on-disk record of the cache's mapping, dirty flags and policy state, with a flag for whether the cache was shut down cleanly.",
    d: "Metadata lives on a small device or the front of the cache device. On a clean shutdown the full state is saved and the cache starts warm. After a crash, the saved state may be stale, so the cache either distrusts it and rebuilds, or loads the last committed copy and recovers dirty blocks. The format has a version, a hash of the origin and cache identity, and checksums. It is hard because the metadata is itself a point of failure and needs checks to refuse mismatched pairs.",
    k: ["Trust the metadata after a crash vs discard the cache: trusting keeps a warm cache and risks acting on stale state, discarding is safe and loses the dirty data in writeback mode.", "Separate metadata device vs combined: separate lets it sit on redundant media, combined is simpler and loses both together."],
    p: ["A cache device from one origin is attached to another and its mappings are applied to the wrong data.", "Metadata not marked clean on shutdown forces a long full check after every reboot."],
    v: "Shut down cleanly and restart: the cache must report warm with the same hit rate. Crash it instead and confirm the recovery step runs and reports the number of dirty blocks found.",
    dep: ["dirty-block-tracking", "device-identity", "metadata-recovery", "block-cache"]
  },
  "sequential-bypass": {
    s: "Detecting long sequential reads or writes and sending them straight to the origin so they do not displace useful blocks or saturate the cache.",
    d: "The cache measures runs of consecutive addresses. Once a run exceeds a threshold, the following requests skip promotion and go to the origin, which handles sequential I/O well on rotating media. Large writes can also bypass the cache, invalidating overlapping cached blocks. The threshold is a tunable. It is hard because the heuristic can classify a hot but sequential pattern, such as a log, as scan traffic, and because bypassed writes must invalidate or update any cached copies.",
    k: ["Bypass sequential I/O vs cache all I/O: bypass protects the working set and sends streaming data at origin speed, caching all makes streaming faster and pollutes the cache.", "Fixed threshold vs adaptive detection: fixed is predictable and wrong for some workloads, adaptive fits more and is harder to reason about."],
    p: ["A bypassed write leaves an older cached copy of the same block, and a later read returns stale data.", "A workload that reads a hot file sequentially never benefits from the cache."],
    v: "Stream a file several times the cache size and confirm cache hit and promotion counters barely change while a concurrent random workload keeps its hit rate.",
    dep: ["promotion-policy", "block-cache", "cache-modes"]
  },
  "cache-flush-and-detach": {
    s: "Writing all dirty blocks back to the origin so a cache can be removed, resized or replaced without losing data.",
    d: "Detaching a writeback cache first switches it to a mode that stops accepting new dirty data, then cleans every dirty block, and only when the dirty count reaches zero removes the mapping and leaves the origin as a plain volume. This can take a long time on a large, busy cache. Flush on shutdown follows the same path. It is hard because the origin must be able to absorb the write-back, the cache device must stay healthy until done, and an interruption must be resumable.",
    k: ["Detach with full flush vs force remove: a full flush is safe and slow, forced removal is instant and corrupts the origin if blocks are dirty.", "Flush in the background during normal use vs only at detach: continuous cleaning keeps detach short and spends origin bandwidth all the time."],
    p: ["Detach is run as part of a hardware swap and a timeout kills it halfway, leaving the volume half cached.", "Forced removal of a failed cache device leaves an origin with holes of stale data."],
    v: "Fill a writeback cache with dirty data, start a detach, and confirm the dirty count drains to zero before the cache device is released and that a filesystem check of the origin alone passes.",
    dep: ["dirty-block-tracking", "cache-modes", "suspend-and-resume", "block-cache"]
  },
  "encryption-target": {
    s: "A mapping layer that encrypts data as it is written to the underlying device and decrypts as it is read, one sector at a time, under a volume key.",
    d: "Each request is split into sectors, and each sector is encrypted with a cipher in a mode that uses the sector number as an input so equal contents look different at different places. The volume key lives only in memory while active. Above the layer the volume looks like a normal block device. The cipher work is done by the kernel's crypto framework or hardware engines. It is hard because it is encryption without authentication in the simple form: an attacker who can modify the disk can flip data undetected.",
    k: ["Encrypt below the filesystem vs per-file in the filesystem: the block layer protects everything including metadata and swap, file-level encryption can use per-user keys and exposes metadata.", "Hardware crypto engine vs software: hardware frees processors and may be slower or less audited, software is flexible and uses cycles."],
    p: ["The key is cached in memory that is swapped to disk or captured in a crash dump.", "Encrypting below a cache or thin pool prevents deduplication, compression and discard from working as expected."],
    v: "Write a recognizable pattern, read the raw underlying device, and confirm no part of the pattern appears; then read through the layer and confirm the pattern is intact and equal contents at different sectors differ on disk.",
    dep: ["sector-iv-and-modes", "key-slots-and-unlock", "crypto-workqueues", "target-drivers"]
  },
  "key-slots-and-unlock": {
    s: "A header holding the volume key wrapped under several passphrases or key files, so access can be added or revoked without re-encrypting the data.",
    d: "The volume key encrypts the data and never changes. The header stores copies of it, each encrypted under a key derived from a passphrase or key file with a deliberately slow function, in separate slots. Unlocking tries slots until one works. Revoking a user erases their slot. The header sits at the start of the device and is often backed up. It is hard because losing the header means total loss of data, and because removing a slot does not help if the volume key was already copied.",
    k: ["Wrapped volume key in slots vs deriving the data key from one passphrase directly: slots let credentials change cheaply, direct derivation is simple and forces re-encryption on change.", "Header on the device vs detached header: on-device is self-contained, a detached header hides that the device is encrypted and can be lost separately."],
    p: ["The only copy of the header is overwritten by a partition tool, and all data becomes unrecoverable.", "A weak passphrase with a fast key derivation setting is brute-forced from a stolen disk."],
    v: "Add a second passphrase, unlock with each, revoke the first, and confirm it no longer works and the second does, with the data unchanged; then restore the header from backup onto a damaged copy and unlock again.",
    dep: ["encryption-target", "metadata-backup", "boot-assembly"]
  },
  "sector-iv-and-modes": {
    s: "The choice of cipher mode and of how each sector's initialization value is derived, which determines what an attacker can learn or modify from ciphertext.",
    d: "Disk encryption modes are tweakable: the sector number or a derived value is mixed into the cipher so that identical plaintext at different sectors encrypts differently. Modes designed for storage avoid expanding data, because sectors have fixed size. Some leak whether a sector changed between two snapshots of the disk, and none detect modification. It is hard because the constraint of no expansion rules out authentication tags unless a separate integrity area is used.",
    k: ["Length-preserving tweakable mode vs authenticated mode: length-preserving fits existing sectors and cannot detect tampering, authenticated modes detect it and need space for tags.", "Sector-number tweak vs random per-write value: a sector-number tweak needs no stored value, a random value hides rewrites and has to be stored."],
    p: ["A predictable value construction lets an attacker with two disk images infer which sectors changed.", "Moving encrypted data to a different offset breaks decryption because the tweak includes the sector number."],
    v: "Encrypt identical data at two sectors and confirm the ciphertexts differ, then flip a bit in the ciphertext and confirm decryption yields garbage in that sector only and is, in this mode, not reported as an error.",
    dep: ["encryption-target", "integrity-tags", "io-alignment-and-geometry"]
  },
  "integrity-tags": {
    s: "A small checksum or authentication tag stored with every sector so that corruption or tampering is detected on read and reported as an I/O error.",
    d: "An integrity layer reserves space for a tag per sector, computes it on write, and verifies on read. A mismatch returns an error, which a redundant layer above can answer by reading another copy. The tags need either a device formatted with extra bytes per sector, or an interleaved area managed by the layer, with a journal to keep data and tags in step. It is hard because data and tag are two writes, so a crash can leave them disagreeing, and the layer must tell that apart from real corruption.",
    k: ["Interleaved tag area with a journal vs tags in device-provided metadata: a journal works on any device and doubles some writes, device metadata is fast and needs special hardware.", "Cryptographic authentication vs a simple checksum: authentication stops deliberate tampering and costs more processing, a checksum catches accidents only."],
    p: ["A crash between data and tag writes produces mismatch errors on sectors that were not corrupted, which look like disk failure.", "Integrity errors without redundancy above just fail the read, which does not heal anything."],
    v: "Corrupt one sector on the underlying device and confirm reading that sector returns an I/O error naming the position, while neighboring sectors read normally, and that on a mirror above the read succeeds from the other leg.",
    dep: ["raid-mirroring", "write-journal", "sector-iv-and-modes", "mismatch-repair"]
  },
  "hash-tree-verification": {
    s: "Verifying read-only data against a tree of hashes whose single root hash is trusted, so any change to any block is detected on read.",
    d: "The device is divided into blocks, each hashed; the hashes are grouped and hashed again until one root remains. The root is supplied from a trusted source, such as a signed boot image. When a block is read, its hash and the hashes up the tree are checked against the root. Verified results are cached. A failure triggers an error, a restart or a panic by policy. It is hard because it only works for read-only data, and every update needs a new tree and root.",
    k: ["Verify at read time vs verify the whole device at start: read-time verification starts fast and finds corruption late, whole-device verification delays boot and finds everything up front.", "Error vs restart on a bad block: returning an error leaves recovery to the caller, restarting forces a clean state and is disruptive."],
    p: ["The root hash is stored on the same writable device it protects, so an attacker replaces both.", "A single flipped block in a large system image causes an unrelated boot or application failure far from the cause."],
    v: "Change one byte on the underlying device of a mounted verified volume, read the affected block and confirm an error is raised and logged, and that unchanged blocks continue to read normally.",
    dep: ["integrity-tags", "target-drivers", "request-cloning-and-splitting"]
  },
  "crypto-workqueues": {
    s: "The worker threads and queues that run encryption and decryption off the I/O completion path, scheduling cipher work across processors.",
    d: "Cipher operations are too heavy to run in the context where a completed read is delivered, so they are queued to workers. Writes are encrypted before submission, and are sometimes sorted to keep the original order. The number of workers, how work is distributed across processors and whether requests are processed in order all affect throughput and latency. It is hard because the layer sits on the I/O path of everything above it and amplifies queue depth problems.",
    k: ["Per-processor workers vs a single ordered queue: per-processor scales across cores and may reorder requests, a single queue keeps order and caps throughput.", "Offloading to a crypto engine vs software: an engine saves processor time on throughput and may add latency for small requests."],
    p: ["A single saturated worker thread caps the throughput of fast flash devices far below their capability.", "Reordered encrypted writes violate an ordering the filesystem assumed from the layer below."],
    v: "Run a sequential and a random 4 KiB benchmark through the layer and directly on the device, and confirm that throughput approaches the device's limit with processor use spread across cores.",
    dep: ["encryption-target", "request-queue", "flush-and-fua-ordering"]
  },
});
