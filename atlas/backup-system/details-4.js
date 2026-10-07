// Details for the backup system plate, part 4: catalog, storage targets, immutability and foundation.
ATLAS.details("backup-system", {
  "backup-catalog": {
    s: "The authoritative record of every recovery point: what it contains, when it was taken, how it relates to others, and where its data is stored.",
    d: "For each job the catalog records the source, time, type, chain links, retention class, the list of files or blocks, and the chunks and media holding them. Restores, retention, reports and verification all read it. It is small relative to the data, but every operation depends on it, and it must be consistent with the repository after crashes. Scale is the challenge: billions of entries, frequent writes during backup and complex queries during restore and search.",
    k: ["One central catalog versus a catalog stored with the data: central is fast to query across everything, while self-describing repositories survive loss of the central service at the cost of slower global search.", "Strong consistency with the repository versus eventual: strong consistency prevents dangling references, but slows ingest and complicates replication."],
    p: ["A catalog restored from an older copy references data pruned since and misses recovery points added after it.", "The catalog lives only on the backup server's own disk, which fails with the thing it describes."],
    v: "Back up, then rebuild a fresh catalog from the repository alone and confirm the recovery points, chains and file lists match the original catalog's for every point.",
    dep: ["catalog-database", "file-index", "backup-chains"]
  },
  "file-index": {
    s: "Per-recovery-point listings of file names, sizes, times, permissions and chunk mappings that make browsing, searching and single-file restore possible.",
    d: "For each backup the engine records every file with its metadata and the ordered list of chunk fingerprints that make up its content. The index is stored as compact, compressed trees so that browsing a directory does not load the whole point. Incrementals store only changes and are merged logically when browsed. It is the largest part of the catalog: a hundred million files across hundreds of recovery points produces billions of rows, so indexing speed, size and query time are constant concerns.",
    k: ["Full file index per point versus only deltas: per-point indexes browse quickly, but multiply storage, while deltas are small and need merging on every query.", "Index everything versus skipping content of image backups: skipping makes image jobs fast and small, but file-level search then requires mounting the image."],
    p: ["Indexing large file counts slows a backup job so much it overruns its window.", "The index for old points is dropped to save space and nobody can search for a file that was deleted last year."],
    v: "Back up a tree with one million files, browse a subdirectory and search for one name, and confirm results return within seconds and match the actual tree at that point.",
    dep: ["catalog-database", "chunk-reference-counts", "filesystem-walker"]
  },
  "chunk-reference-counts": {
    s: "Tracks how many recovery points use each stored chunk so space is freed exactly when the last user is deleted, and never before.",
    d: "Every point that references a chunk increments its count, and expiring a point decrements. A chunk at zero is eligible for reclamation. Counts can be exact, kept transactionally with the catalog, or derived by marking: walk all live points, record reachable chunks and sweep the rest. Counting is quick but any bug, crash or race corrupts it, and a count too low deletes live data while one too high leaks space. For this reason systems add periodic recounts against ground truth.",
    k: ["Exact incremental counting versus periodic mark-and-sweep: counting is cheap per change but error-prone, while mark-and-sweep is simple to reason about and expensive to run.", "Reclaim immediately at zero versus after a grace period: immediate frees space sooner, but a delay protects chunks that an in-flight backup is about to reuse."],
    p: ["A crash between writing a reference and updating its count leaves a chunk that is live but counted zero.", "Counts that never decrement for failed jobs leak space that is never reclaimed."],
    v: "Back up the same data into two recovery points, delete one, and confirm chunks remain and the survivor restores; delete the second and confirm all chunks are freed and the totals return to baseline.",
    dep: ["backup-catalog", "dedup-index"]
  },
  "catalog-database": {
    s: "The database engine and schema holding catalog records, tuned for heavy writes during backups and large range reads during restore and reporting.",
    d: "Designs range from an embedded key-value store to a clustered relational database. Needs include transactional updates, efficient storage of billions of small rows, fast prefix scans for directory browsing and online maintenance. The database is partitioned by source or time so old partitions can be dropped with expiry. It runs on fast storage, separate from the data repository. Corruption, schema upgrades between product versions and growth beyond a single node are the standing operational hazards.",
    k: ["Embedded store versus external database service: embedded is easy to deploy and fast, but limits scale and sharing, while an external database scales and is monitorable but adds a dependency.", "Partition by time versus by source: time partitions make expiry cheap, while source partitions keep each system's history together for restore."],
    p: ["Catalog growth fills the disk it shares with logs and the whole backup system stops.", "A schema upgrade that fails partway leaves the catalog unreadable by either version."],
    v: "Load a production-scale synthetic catalog, run concurrent backup writes and restore queries, and confirm write throughput and browse latency stay within target and an expiry drops a partition quickly.",
    dep: ["storage-driver-interface", "worker-pool"]
  },
  "catalog-protection": {
    s: "Keeps copies of the catalog separate from the primary, and provides a way to rebuild it from repository contents if every copy is lost.",
    d: "The catalog is backed up on its own schedule to places other than the backup server, often alongside the data in the repository, and is replicated offsite. Repositories also store enough self-describing metadata with each container to reconstruct a catalog by scanning, which is slow but works when nothing else does. Disaster recovery procedures start by recovering the catalog before any data, so the procedure and the keys for it must be stored where the lost system is not.",
    k: ["Backup of the catalog versus rebuild by scanning: backups restore quickly but can be stale, while scan rebuilds always reflect the repository but may take days for large stores.", "Catalog copy in the repository versus a separate location: in the repository it travels with the data, but a locked repository or lost credentials block both."],
    p: ["The only catalog backup is on the failed backup server's disk.", "Rebuild by scanning has never been run, and its time turns out to be longer than the recovery time objective."],
    v: "Destroy the catalog on a test system, rebuild it from the latest catalog backup plus a repository scan, and confirm every recovery point appears and a restore from each of a sample succeeds.",
    dep: ["backup-catalog", "offsite-replication", "pack-files"]
  },
  "search-and-browse": {
    s: "Lets users and administrators find files, items and recovery points by name, path, date, content or owner across all backups.",
    d: "Browsing walks a directory tree at a chosen recovery point, using the file index. Search queries across points by name or attributes and returns versions with dates and sizes. Content search needs a separate text index and, because it reads data, raises privacy and cost issues. Results are filtered to what the user may see. The hard part is performance across hundreds of points and the question people actually ask: show me every version of this file, and which one was last good.",
    k: ["Name and metadata search only versus content indexing: metadata search is cheap and sufficient for most restores, while content indexing finds files by what they contain at large cost and privacy exposure.", "Search live in the catalog versus a separate search index: live queries are always current, while a separate index is faster but lags and can disagree."],
    p: ["Search results include files the requester should not know exist.", "Slow cross-point searches time out, and the person gives up and restores an entire volume instead."],
    v: "Search for a file that existed in three recovery points with different content, and confirm each version is listed with its date and size, ordered by time, and restorable individually.",
    dep: ["file-index", "backup-catalog", "identity-and-access"]
  },
  "job-history": {
    s: "A durable log of every job, its outcome, timings, sizes, warnings and errors, kept longer than the recovery points it describes.",
    d: "Each job writes a record with start and end, source, policy, type, result, bytes read, sent and stored, files processed, errors and the log text. Reports, alerts, capacity forecasts and audits read from it. It outlives the data: proving that a backup ran in 2024 matters even after the point is expired. Records must be immutable once written, and queries across millions of jobs need indexing. A job that never started leaves no record, so schedule data is needed to find absences.",
    k: ["Keep history as long as the longest retention versus a short window: long history supports audit and trend analysis, but grows without bound, while short windows lose evidence.", "Store full logs versus summaries: full logs help diagnose odd failures, but are large, and summaries stay compact but lose detail."],
    p: ["History is pruned with the recovery points, and an auditor's question about a past year cannot be answered.", "Logs contain file names and secrets, giving broad read access to sensitive information."],
    v: "Run a successful and a failed job and confirm each appears with timing, volumes and error text, that records cannot be edited afterward, and that they remain after the points expire.",
    dep: ["catalog-database", "tamper-evident-log"]
  },
  "disk-repository": {
    s: "Disk-based storage holding recent recovery points for fast restore, organized as files, containers or volumes, local to the site.",
    d: "A repository is a filesystem, volume or appliance holding pack files and metadata. Disk gives random access, so it supports instant recovery, synthetic fulls and verification. It is the first stop for new backups and the source for copies to other tiers. Writes are sequential and large; reads during restore can be random. Space is finite: it needs capacity forecasting, reclamation, and redundancy against disk loss. As the same site as production, it shares the risks of fire, flood and attack.",
    k: ["Filesystem on commodity disks versus a purpose-built appliance: commodity is cheap and flexible, while appliances bring tuned dedup, integrated protection and support at a higher price.", "Single large repository versus several scoped ones: a large pool maximizes dedup and space use, but is one failure and security domain, whereas scoped ones limit blast radius."],
    p: ["The repository fills up mid-backup, and every running job fails together.", "Repository and production share a storage array, so the one failure removes both."],
    v: "Fill a test repository to its limit under load and confirm jobs stop cleanly with an alert before exhaustion, no recovery point is left half-written, and capacity returns after expiry.",
    dep: ["pack-files", "redundancy-coding", "storage-driver-interface"]
  },
  "object-storage-target": {
    s: "Uses an object store, on premises or hosted, as a scalable backup target with built-in redundancy and per-object retention controls.",
    d: "Containers are written as objects through an HTTP interface. Object stores offer near-unlimited scale, geographic redundancy and cost tiers, and can lock objects against deletion. They have high per-request latency and often charge per request and for data leaving, so designs use large objects, parallel transfers and local caches for restore. Listing and metadata operations are slow. Consistency models and rate limits differ among stores, and restoring a large data set may be limited by egress bandwidth and cost.",
    k: ["Few large objects versus many small: large objects cut request costs and overhead, but make partial reads and compaction more expensive.", "Direct to object storage versus staged through local disk: direct is simple and cheap, but restores are slow and egress costs high, while a local tier speeds recent restores."],
    p: ["Restoring a hundred terabytes from a hosted store takes weeks because of egress bandwidth, which nobody calculated.", "Small objects multiply request charges so the bill exceeds the storage cost itself."],
    v: "Back up to a test bucket, confirm objects are in the expected size range, restore at scale, and compare measured throughput and request counts against the cost and time estimates.",
    dep: ["pack-files", "storage-driver-interface", "worm-object-lock"]
  },
  "tape-library": {
    s: "Robotic libraries of removable tape cartridges used for cheap, long-lived and offline copies, written sequentially in large streams.",
    d: "A library holds drives and slots with a robot moving cartridges. Backups stream to drives at high sustained speed; if data arrives slower, the drive repeatedly stops and repositions, which wears it. Tapes are tracked by barcode in the catalog, grouped into sets, and vaulted offsite. Tape is physically offline once removed, giving a real air gap. Access is slow: mounting and seeking take minutes, and restore planning must minimize mounts. Media degrades, so periodic reads and format migration are needed.",
    k: ["Stream directly to tape versus stage on disk first: direct is simple, but a slow source starves the drive, while staging keeps drives streaming at the cost of disk space.", "Many small tape sets versus few large: small sets spread risk and speed targeted restores, but increase handling and mounts."],
    p: ["A tape sits in the vault with its barcode unregistered in the catalog, and no one can tell what it holds.", "The drive generation needed to read old cartridges is no longer available when a restore is requested."],
    v: "Write a backup set to tape, eject, vault and later reload the cartridge, then run a restore from it using only catalog information, and confirm hashes match.",
    dep: ["pack-files", "backup-catalog", "storage-driver-interface"]
  },
  "cloud-archive-tier": {
    s: "A low-cost cold storage class for rarely read data, with delayed retrieval measured in minutes to hours and minimum storage durations.",
    d: "Archive tiers trade access speed and flexibility for price. Data is written at normal speed but read only after a retrieval request that rehydrates it, which takes time and costs money. Minimum retention periods charge for early deletion. Systems use them for old recovery points and compliance archives. The planner must know what is cold so restores start retrieval early and warn about delay. Tier transitions can be automatic by age, but must not move data that a chain still needs for current restores.",
    k: ["Cold tier for whole old recovery points versus individual chunks: whole points are simple to retrieve as a unit, while chunk-level tiering saves more but makes any restore touch cold data.", "Automatic lifecycle transitions by age versus explicit moves: automatic rules are low effort, but cannot see chain dependencies the backup system knows."],
    p: ["A lifecycle rule moves the base full of an active chain to cold storage, and every routine restore now waits hours.", "Early deletion charges and per-request retrieval fees make a short-lived archive cost more than disk."],
    v: "Move a test recovery point to the archive tier, request a restore, and confirm the planner shows the retrieval delay, starts rehydration automatically, and reports the cost before proceeding.",
    dep: ["object-storage-target", "tiering-engine", "restore-planner"]
  },
  "offsite-replication": {
    s: "Copies recovery points to a second site or provider so that loss of the primary location does not destroy the backups, following the three-copies, two-media, one-offsite rule.",
    d: "Replication jobs copy new containers and catalog updates to another repository, often through a throttled link and with their own retention. Copies are asynchronous, so the remote always lags by some interval. Replication can be one-way and write-only for the sender, which limits what an attacker at the source can do. Seeding by shipping disks bootstraps large initial copies. The key failure is replicating damage: corruption or deletion on the primary reaches the replica unless delay and immutability stop it.",
    k: ["Replicate everything versus selected tiers: everything is simple and complete, but costs bandwidth and storage for low-value data, while selected tiers need clear criteria.", "Mirror deletions versus keep independent retention: mirroring keeps copies consistent, but allows one malicious deletion to propagate, so independent retention is safer."],
    p: ["Corrupted containers are replicated before verification, and both sites hold the same damage.", "A narrow link cannot keep up with daily change, so the offsite copy falls further behind each week."],
    v: "Run a backup, wait for replication, then delete the primary copy and restore from the remote alone; confirm the remote lag in the report matches the actual newest point available.",
    dep: ["transfer-protocol", "disk-repository", "bandwidth-throttling"]
  },
  "tiering-engine": {
    s: "Moves recovery points between storage classes as they age, keeping recent data fast to restore and old data cheap to keep.",
    d: "Policies state which age or class belongs on which tier: newest on fast disk, months-old on object storage, years-old on tape or cold cloud. The engine copies data, updates the catalog's locations, verifies the new copy and only then removes the old. Moves must respect chains and shared chunks, since data shared between a recent and an old point cannot simply move. Recalling data upward on demand is also part of the job. Misjudging how old data is accessed makes restores unexpectedly slow.",
    k: ["Move whole recovery points versus individual chunks: moving points is simple and keeps each set together, while chunk-level tiering is more space efficient but fragments any restore across tiers.", "Copy then delete versus move in place: copy-verify-delete is safe and recoverable, but temporarily needs both tiers' capacity."],
    p: ["Shared chunks demoted with an old point make a new point's restore wait for cold retrieval.", "The location in the catalog is updated before the copy is verified, and a failed copy leaves a dangling pointer."],
    v: "Age a test point past a tier threshold, run the engine, and confirm the data exists on the new tier, the catalog location changed after verification, and the point still restores with the right hashes.",
    dep: ["backup-catalog", "chunk-reference-counts", "storage-driver-interface"]
  },
  "repository-scaling": {
    s: "Grows capacity and throughput by adding nodes, disks or buckets, and by spreading backup streams and data across them.",
    d: "Scale-out repositories pool several nodes or extents into one namespace. New data is placed on the least loaded or by policy, and rebalancing moves existing data. Metadata, indexes and deduplication scope all follow the placement: a pool that spans many nodes can dedupe across all, but at index cost, while separate pools dedupe only within each. Adding capacity must not stop backups, and removing or evacuating a node must keep chains and references intact.",
    k: ["Scale-out pool versus independent repositories: a pool is one namespace with global deduplication, but is one failure domain, while independent repositories isolate failures and need manual balancing.", "Rebalance on expansion versus only place new data: rebalancing evens load, but costs heavy I/O, whereas placing new data only leaves old nodes hot."],
    p: ["A new node is added and data does not rebalance, so one old node stays the bottleneck.", "Evacuating a node takes longer than its remaining retention, and capacity planning missed it."],
    v: "Add a node to a running test pool during a backup, confirm no job fails, new data appears on the new node, and a restore of earlier points still succeeds and matches hashes.",
    dep: ["disk-repository", "dedup-index", "worker-pool"]
  },
  "redundancy-coding": {
    s: "Protects stored data from disk and node loss using replication or erasure coding, spreading fragments so any few can be lost without data loss.",
    d: "Replication keeps whole copies, simple and fast to read but expensive in space. Erasure coding splits data into fragments plus parity so that any subset of sufficient size reconstructs it, at much lower space overhead and with more CPU and network on repair. Placement spreads fragments across disks, nodes or sites. Rebuild after a failure reads many fragments and is a risky window, since further losses during rebuild exceed the tolerance. Coding parameters trade space, durability and rebuild cost.",
    k: ["Replication versus erasure coding: replication reads fast and rebuilds simply, but costs two or three times the space, while coding costs perhaps half that and makes repairs expensive.", "Wide stripes across many nodes versus narrow: wide stripes survive more failures at low overhead, but need many nodes and slow rebuilds."],
    p: ["Correlated failures take out more fragments than the code tolerates, because fragments shared a power or network domain.", "Rebuild traffic saturates the network and slows backups just when redundancy is already reduced."],
    v: "In a test pool, fail as many disks as the scheme claims to tolerate and confirm all data reads back correctly; fail one more and confirm the loss is detected and reported, not silent.",
    dep: ["disk-repository", "storage-driver-interface", "repository-scrub"]
  },
  "space-reclamation": {
    s: "Frees storage held by data nobody references any more, by deleting dead containers or rewriting partly dead ones to compact them.",
    d: "After pruning, chunks with zero references remain inside containers alongside live ones. Reclamation finds containers with a high fraction of dead data and rewrites their live chunks into new containers, then deletes the old. It must coordinate with running backups and restores, which might be reading or about to reuse a chunk, usually by delaying deletion and by locking. It is I/O-heavy, so it runs at quiet times. In locked or write-once storage, space can only be freed when the lock expires.",
    k: ["Rewrite containers with partial dead data versus wait until fully dead: rewriting recovers space promptly, but costs reads and writes, while waiting costs nothing and may never free space.", "Reclaim during backups versus in a separate window: concurrent reclamation uses idle time, but needs fine-grained safety against races."],
    p: ["Reclamation deletes a container just as a backup decides to reference its chunks, and the new point is broken.", "Locked storage cannot free space before locks expire, so a repository fills despite pruning."],
    v: "Delete a recovery point with unique data, run reclamation, and confirm repository usage falls by roughly that amount while all remaining points still verify and restore.",
    dep: ["chunk-reference-counts", "expiry-and-pruning", "pack-files"]
  },
  "worm-object-lock": {
    s: "Write-once storage controls that prevent stored objects from being modified or deleted until a retention date, even by administrators.",
    d: "Compliance-mode locks attach a retain-until date to each object; the storage service refuses overwrites and deletes until it passes, and the date cannot be shortened. The backup system sets the lock when writing containers and extends it as needed. Immutability protects against ransomware and insider deletion, but has costs: storage cannot be reclaimed early, mistakes in retention dates are permanent, and space reclamation must align with lock expiry. The lock is only as strong as the storage service's own account security.",
    k: ["Compliance-mode locks versus governance-mode: compliance mode cannot be overridden even by account owners, which is stronger but irreversible, while governance mode can be lifted by privileged roles.", "Lock every object for the full retention period versus rolling extensions: full-period locks are simple, while rolling extensions limit exposure to mistakes but need a reliable extender."],
    p: ["A misconfigured retention of ten years on a test bucket cannot be undone and the bill continues.", "The backup service account can also change the storage account's settings, and an attacker removes protections before deleting."],
    v: "Attempt to delete and overwrite a locked object with the highest-privilege credentials and confirm both are refused until the retain-until date, and that the refusal is logged.",
    dep: ["object-storage-target", "credential-separation", "retention-rules"]
  },
  "air-gap": {
    s: "Keeps a copy physically or logically unreachable from the production network for most of the time, so an intruder cannot touch it.",
    d: "Classic air gaps use removable media, such as tape or disks, taken out of the system and stored. Logical gaps connect the vault only briefly on a pull basis: the vault initiates the connection, copies new data and disconnects, with separate credentials and no inbound path. The gap defends against attacks that spread across connected systems. It is operationally demanding: media handling, vault sync windows, and testing restores from the isolated copy, which is slow and easy to neglect.",
    k: ["Physical offline media versus a logical gap with short pull windows: physical is a true gap, but slow and manual, while logical is automated and quick but only as strong as its isolation rules.", "Gapped copy of everything versus of critical data: everything gives full recovery, but costs more, while critical data is cheaper but needs a trusted classification."],
    p: ["The vault's connection window is left open by a script and effectively becomes a permanent link.", "Vault copies were never restored in a test, so the first real attempt finds missing keys or media."],
    v: "From the production network, attempt to reach the vault by every known path and confirm none works, then confirm a scheduled pull run completes and a restore using only vault data succeeds.",
    dep: ["tape-library", "network-isolation", "offsite-replication"]
  },
  "immutable-snapshots": {
    s: "Storage-level snapshots of the repository that cannot be deleted or altered through normal interfaces for a retention period.",
    d: "The repository's storage system takes periodic snapshots and applies a protection policy: deletion requires a separate approval, a delay, or is impossible until expiry. If an attacker deletes repository files, the snapshot still holds them and the repository can be rolled back. This layers beneath the backup application, protecting even from bugs in it. The cost is extra space for changed data and the need to keep the snapshot interface unreachable from the backup service's credentials.",
    k: ["Storage snapshots beneath the repository versus application-level locks: storage snapshots protect from the application's own bugs and credentials, but need compatible storage and consume extra space.", "Short snapshot retention versus long: short retention costs little, but an attack that goes unnoticed longer than the window destroys the snapshots' value."],
    p: ["An attacker with storage administrator rights deletes the snapshots, because the same credentials manage both.", "Snapshot retention is shorter than the time ransomware sits undetected, so only encrypted data remains."],
    v: "Delete a repository file as an administrator of the backup system, then roll the repository back to the last snapshot and confirm the file returns and a restore succeeds.",
    dep: ["disk-repository", "credential-separation", "storage-driver-interface"]
  },
  "delete-approval": {
    s: "Requires two or more authorized people, or a delay with notification, before destructive actions such as deleting recovery points, shortening retention or removing repositories.",
    d: "Sensitive operations create a pending request instead of acting. A second administrator, from a separate group, must approve it, or the action waits a set period during which others are alerted and can cancel. The rule covers changes to retention, deletion of policies, disabling of immutability and wiping of repositories. It defeats a single stolen account or a coerced insider. The tension is speed: legitimate emergencies need quick action, so break-glass paths exist and must themselves be controlled and logged.",
    k: ["Two-person approval versus time delay with alert: two-person approval is decisive but needs available approvers, while a delay works alone but gives an attacker time if nobody watches.", "Approval for all deletions versus only high-impact: total approval is safe but creates fatigue and rubber-stamping, so scoping to high-impact actions keeps the control meaningful."],
    p: ["The approver group includes the same accounts as the requesters, so one compromised administrator approves their own request.", "A break-glass credential is shared in a chat channel and used routinely, which erases the control."],
    v: "As a lone administrator, request deletion of a recovery point and confirm it stays pending, notifies others, and executes only after a distinct approver confirms, with both identities in the audit log.",
    dep: ["identity-and-access", "tamper-evident-log", "alerting"]
  },
  "credential-separation": {
    s: "Uses distinct identities and stores for the backup system, the repositories and the production environment so that stealing one does not open the others.",
    d: "Production administrators do not have rights over the backup system, which uses its own directory or local accounts. The backup service gets write-only access to repositories, without delete rights, which are held by a separate maintenance identity. Repository management uses separate credentials and network paths. Multi-factor authentication protects human access. The principle is that a ransomware operator who owns the production domain still finds no credential that reaches the backups. Convenience pushes the other way: single sign-on and shared accounts are easy.",
    k: ["Separate identity domain for backup versus shared directory: separate means domain compromise does not reach backups, but costs extra accounts and administration.", "Write-only service accounts versus full-control: write-only prevents deletion by the running system, but means pruning needs another identity and a controlled process."],
    p: ["The backup server joins the production domain, and domain administrators can read and delete every backup.", "Repository credentials stored in the agent's configuration file let any compromised host overwrite its own history."],
    v: "Using a production domain administrator account, attempt to log in to the backup console and to delete a repository object, and confirm both are denied.",
    dep: ["identity-and-access", "secret-store"]
  },
  "anomaly-detection": {
    s: "Watches backup data and behavior for signs of ransomware or tampering, such as sudden change rates, entropy spikes and mass file renames.",
    d: "The detector compares each job with its own history: bytes changed, files modified, deduplication ratio and the entropy of new data. Encrypted data is random-looking, so a sharp rise in entropy with low compressibility is a strong signal. It also notices mass renames, deleted backups, retention edits and unusual restores. Alerts can pause replication and tiering so a bad point does not overwrite the last good one. False positives are common when legitimate projects change data in bulk.",
    k: ["Statistical per-source baselines versus fixed thresholds: baselines adapt to each system, but need history and can be trained by a slow attack, while fixed thresholds are simple but noisy.", "Block replication and pruning on alert versus alert only: blocking protects good copies automatically, but a false positive can delay legitimate jobs and retention."],
    p: ["A slow encryption over many weeks never exceeds the threshold, and every recovery point contains encrypted data.", "An alert is raised but retention proceeds, and the last clean points expire during the investigation."],
    v: "Back up a source, encrypt a copy of its files with a test tool, back up again, and confirm the job is flagged for entropy and change rate, replication pauses, and the prior point is marked as last known good.",
    dep: ["job-history", "content-hashing", "alerting"]
  },
  "network-isolation": {
    s: "Segregates backup traffic and infrastructure onto separate networks, with narrow, one-way or brokered paths, limiting what an intruder can reach.",
    d: "Backup servers, repositories and management interfaces sit on isolated segments. Agents may connect out to a gateway on specific ports, but nothing in production can open connections to repositories, and administration comes from a hardened jump host. Firewalls, one-way links and separate switches enforce it. Isolation must also cover recovery tests, which need a sandbox with no route to production. The complexity appears when remote sites, clouds and many agent types each need their own path.",
    k: ["Agents push through a gateway versus repositories accepting direct connections: a gateway shrinks the exposed surface, but is a throughput bottleneck and another thing to keep running.", "Dedicated backup network versus shared with firewalling: dedicated adds hardware but protects performance and separation, while shared depends on rules staying correct."],
    p: ["An old firewall rule leaves repository management ports open to the whole production network.", "A sandbox used for restore tests has a route to production and a restored server answers real clients."],
    v: "From a compromised-host simulation in production, scan for repository and management ports and confirm only the gateway ports that agents need are reachable, and nothing is reachable from the test sandbox.",
    dep: ["transport-encryption", "identity-and-access"]
  },
  "tamper-evident-log": {
    s: "A record of administrative and data-changing actions that is chained or signed so alterations or deletions can be detected.",
    d: "Every sensitive action, such as logins, policy changes, deletes, restores and key use, is appended with a time, actor and details. Entries are chained by including the previous entry's hash, and periodically anchored by signing or sending the head to a separate system. Tampering breaks the chain at the edited point. The log is the basis for forensics and compliance. It fails to be useful if it is stored where the attacker also has control, or if nobody reviews it.",
    k: ["Hash chain with external anchoring versus plain log shipping: chaining proves integrity even if the source is compromised, but needs a trusted anchor, while shipping is simple and relies on the remote copy being safe.", "Log everything versus sensitive actions only: complete logs help investigation, but grow and bury signals in noise."],
    p: ["The log lives on the backup server and is wiped together with the evidence it should have held.", "Clock drift makes events from several components impossible to order during an investigation."],
    v: "Edit one historical entry in a test log and run verification; confirm it reports the first broken link and entry number, and that the independently stored anchor no longer matches.",
    dep: ["clock-and-time-sync", "identity-and-access"]
  },
  "storage-driver-interface": {
    s: "A uniform interface that hides differences among disk, file share, object store and tape, so higher layers read and write containers without knowing the medium.",
    d: "The interface exposes operations such as create, append, read range, list, delete, lock and report capacity, plus capabilities each backend does and does not have: random writes, immutability, tiers, cost model. Drivers translate these to the medium's protocol and handle its errors and quirks, such as eventual listing, rate limiting and sequential-only access. Capability flags let the engine choose strategies. The abstraction leaks wherever media differ greatly, so a lowest common denominator costs performance, and per-medium paths cost complexity.",
    k: ["Lowest-common-denominator interface versus capability-aware: a minimal interface is easy to implement for new media, but wastes features, while capabilities allow tuned paths and more code.", "Synchronous operations versus asynchronous with callbacks: synchronous code is easier to reason about, but asynchronous overlaps latency on remote stores."],
    p: ["A driver treats a rate-limit response as success, and data is lost silently.", "Assuming listing is immediately consistent causes jobs to miss freshly written containers on stores that lag."],
    v: "Run the same conformance suite of write, read, list, delete, lock and failure injection against every driver and confirm identical results, including correct reporting of unsupported operations.",
    dep: []
  },
  "transfer-protocol": {
    s: "The protocol agents and repositories use to move chunks and metadata reliably over unreliable links, with resume, integrity checks and flow control.",
    d: "The protocol negotiates identity and capabilities, sends fingerprint lists, receives requests for missing chunks, and streams them in framed, checksummed messages over several parallel connections. Acknowledged writes let the sender resume from the last confirmed chunk. Backpressure keeps a slow repository from being flooded. It handles long latencies and high-bandwidth links, and works through proxies and gateways. Versioning is critical: agents and servers upgrade at different times, and a mismatch must degrade or fail cleanly, not corrupt data.",
    k: ["Many parallel streams versus one fast one: parallel streams fill long, lossy links and use multiple cores, but need ordering and per-stream flow control.", "Application-level acknowledgment versus relying on the transport: application acks confirm data is stored durably, while transport acks only prove it reached the peer's buffer."],
    p: ["A sender treats receipt as durable and discards its checkpoint, then the repository crashes before writing to disk.", "An agent and server on mismatched protocol versions negotiate a feature one side implements incorrectly."],
    v: "Transfer a large data set over a link with injected packet loss and a mid-transfer disconnect, and confirm completion without resending acknowledged data and with identical end-to-end checksums.",
    dep: ["transport-encryption"]
  },
  "worker-pool": {
    s: "A set of processes or nodes that execute jobs and stages such as proxying, data processing, verification and reclamation, scaled to the workload.",
    d: "The control service hands jobs to workers that have capacity and network access to the source and target. Workers run stages in pipelines: read, chunk, hash, compress, encrypt, write. Pools scale out horizontally and can be placed near sources to avoid crossing slow links. They are stateless between jobs apart from caches, so a failed worker's job can restart elsewhere. Sizing is about CPU, memory for indexes and caches, and network. Mixed workloads compete: verification and reclamation must not starve backups.",
    k: ["Workers near the sources versus centralized: near-source workers cut wide-area traffic and use local links, but multiply machines to run and patch.", "Dedicated worker classes versus a shared pool: dedicated classes isolate restore and backup performance, while a shared pool uses hardware better but needs priorities to avoid starvation."],
    p: ["A worker with a full cache disk fails every job it receives, and the scheduler keeps sending it more.", "Workers sized for backup have too little memory for dedup index lookups and slow to a crawl at scale."],
    v: "Kill a worker during a job and confirm the control service reassigns the job, the new worker resumes from the checkpoint, and the final recovery point verifies.",
    dep: ["identity-and-access", "storage-driver-interface"]
  },
  "identity-and-access": {
    s: "Authenticates people, agents and services and authorizes what each may do, using roles and scopes that separate backup, restore and deletion powers.",
    d: "People sign in through the organization's directory with multi-factor authentication, mapped to roles such as operator, restore operator, auditor and administrator. Agents and services use certificates or tokens with narrow scopes. Authorization is checked on every operation, including inside the API. Roles should separate who can run backups, who can restore which data and who can delete, since restore access is itself access to the data. The challenges are least privilege at scale, offboarding, and surviving an outage of the directory itself during a recovery.",
    k: ["Federated directory login versus local accounts: federation centralizes lifecycle and multi-factor authentication, but ties recovery to the directory, which may be the thing that failed, while local break-glass accounts avoid the loop.", "Coarse roles versus fine-grained permissions: coarse roles are easy to review, while fine-grained scopes enforce least privilege at the cost of management effort."],
    p: ["The directory is down during a disaster, and nobody can sign in to start the restore that would bring it back.", "Restore operators can restore any system to any location, effectively reading all data."],
    v: "Sign in as each role and confirm it can do only its permitted operations, that a disabled user loses access at once, and that a documented local emergency account works with the directory unreachable.",
    dep: ["secret-store"]
  },
  "secret-store": {
    s: "A protected store for passwords, tokens, certificates and keys that components need, with access controls, rotation and audit.",
    d: "Components fetch credentials at run time from the store instead of reading them from configuration files. Secrets are encrypted, access is granted per identity, reads are logged, and values rotate on a schedule or on demand. Hardware-backed modules guard master keys. It holds database passwords for application plugins, repository keys, certificates and API tokens. The risk is circularity: the store and its keys must themselves be recoverable without the system they protect, and rotation must not break agents that cache old values.",
    k: ["Dedicated secret service versus encrypted configuration files: a service gives rotation, audit and revocation, but adds a critical dependency, while files are simple and hard to audit.", "Short-lived dynamically issued credentials versus long-lived static ones: short-lived limits stolen-credential value, but requires every consumer to handle refresh."],
    p: ["Plain-text credentials are left in job scripts and backed up with the data they could unlock.", "Rotating a password on the application breaks every plugin with the old one, and backups silently fall back to a weaker mode."],
    v: "Rotate a secret, confirm consumers pick up the new value without failed jobs, and confirm the audit log shows each read by identity, and a revoked identity's next read is refused.",
    dep: []
  },
  "clock-and-time-sync": {
    s: "Keeps clocks of agents, servers and storage aligned, so schedules, retention dates, logs and point-in-time recovery agree on when things happened.",
    d: "Components synchronize to trusted time sources and report drift. The system uses a single authoritative time for retention expiry, lock dates, certificate checks and the ordering of events. Point-in-time recovery depends on the database's clock lining up with the user's request. Time is hard around changes: daylight shifts, leap seconds and wrong clocks that move forward or back can expire recovery points early, break certificates or reorder logs. Many designs use monotonic counters for ordering and wall clocks only for human-facing dates.",
    k: ["Trust each component's local clock versus authoritative server time: local clocks are simple, but wrong ones cause misdated points, while server time is consistent and needs agents to offset correctly.", "Wall-clock retention versus monotonic counters: wall clock matches legal dates, but can be manipulated, while monotonic counters resist tampering and need a mapping to dates."],
    p: ["A server clock set forward by an attacker causes retention to expire recovery points years early.", "Agents with minutes of drift produce events in the wrong order, hindering forensics and point-in-time recovery."],
    v: "Skew one agent's clock by ten minutes and confirm drift is detected and alerted, retention decisions still use authoritative time, and its logs are stamped with corrected times.",
    dep: []
  },
  "consistency-levels": {
    s: "The decision about how consistent each captured copy must be, from crash-consistent to application-consistent to transactionally exact, which shapes agents, plugins and restore procedures.",
    d: "A backup read while data changes can be torn. Crash-consistent capture equals what disk would hold after a power loss; filesystem-consistent adds flushed filesystem state; application-consistent has the application cooperate so no recovery is needed; cross-system consistent coordinates several databases at one moment. Higher levels cost pauses, plugins and complexity but produce backups that restore cleanly. The choice differs by system, and the level actually achieved is often lower than the one assumed, because a fallback happens silently when quiescing fails.",
    k: ["Application-consistent everywhere versus crash-consistent with recovery: cooperative capture restores cleanly, but needs plugins and pauses, while crash-consistent is universal and relies on each application recovering correctly.", "Per-system consistency versus a coordinated group: groups restore interrelated systems to one moment, but complicate scheduling and widen the pause."],
    p: ["Silent fallback to crash-consistent capture after a plugin error is never reported, so restores need hours of manual repair.", "Related databases captured at different times restore into states that disagree with each other."],
    v: "For each protected system, report the consistency level achieved by the last job, and restore a sample to confirm it opens without recovery steps at that level; a downgraded job should raise a warning.",
    dep: ["quiesce-and-freeze", "application-plugins", "snapshot-orchestration"]
  },
  "trust-boundaries": {
    s: "The decision about who and what is trusted with data, keys and deletion power, and where isolation lines fall between production, backup operations and storage.",
    d: "Backups concentrate everything an attacker or insider wants: all data, and the ability to destroy the means of recovery. The design settles which identities can read data, which can delete it, who holds keys, which networks connect, and what happens if production is fully compromised. It determines whether encryption is client-side, whether the backup domain is separate and whether deletion needs approval. The usual error is trusting the backup system because it is internal, and building it with the same credentials and network as what it protects.",
    k: ["Backup operated within the production trust domain versus separate: shared is easier to run, but one compromise reaches everything, while separate costs accounts and discipline.", "Keys held by the operator versus by data owners: operator-held keys allow dedup, scanning and easy recovery, while owner-held keys give privacy at the cost of lost data if keys are lost."],
    p: ["The system is secured against outsiders but any administrator can read and delete everything alone.", "Recovery assumes the directory, key service and network of production are available, which they will not be after a serious attack."],
    v: "Run a tabletop and a technical exercise assuming full production compromise, and confirm the attacker cannot read, alter or delete the protected copies and recovery can start from separate credentials.",
    dep: ["credential-separation", "key-management", "network-isolation", "delete-approval"]
  },
  "failure-domains": {
    s: "The decision about which failures a copy of the data must survive, such as a disk, a controller, a rack, a site, a provider or a mistake, and how copies are separated accordingly.",
    d: "Each added copy helps only against failures it does not share with the others. A second copy on the same array survives a disk loss but not an array loss; a copy in the same account survives a site loss but not an account compromise. The design counts copies, media types, sites and credentials, and checks their independence, as the three-two-one rule suggests. Dependencies hide shared domains: the same key service, catalog, network or administrator can sit under every copy.",
    k: ["More copies in one domain versus fewer copies across domains: extra copies in one place are cheap and handle disk faults, but only independent domains handle site, provider and credential failures.", "Synchronous second copy versus asynchronous: synchronous leaves no gap, but couples jobs to the remote's speed, while asynchronous is fast and lags."],
    p: ["Three copies exist, all encrypted with one key held on a single server, so they share one failure.", "Both sites depend on the same provider, and a provider-wide outage or account suspension removes both."],
    v: "List each copy with its media, location, credentials, keys and catalog dependencies, then simulate loss of each domain in turn and confirm a restore is still possible from the rest.",
    dep: ["offsite-replication", "air-gap", "redundancy-coding", "catalog-protection"]
  },
  "cost-model": {
    s: "The decision about what protection costs and who pays: storage, bandwidth, compute, licenses, retrieval fees and operator time, weighed against the value and recovery needs of the data.",
    d: "Costs scale with retained data, change rate, copy count, tier and retrieval. Deduplication and compression shrink storage but spend CPU and memory. Cloud targets add request, egress and early-deletion charges. Long retention and legal holds grow storage indefinitely. Restore speed has a price: fast tiers are costly. Chargeback shows teams what their choices cost. The usual error is optimizing the storage bill alone while ignoring recovery time, which the business feels more.",
    k: ["Charge by logical protected size versus stored size: logical is predictable and easy to explain, while stored size rewards efficiency but varies and confuses users.", "Optimize for storage cost versus restore time: cheap cold tiers lower the bill but lengthen recovery, so the balance depends on each system's objectives."],
    p: ["A cheap archive tier is chosen without counting retrieval and early deletion fees, and the real cost is higher than disk.", "Data that no longer has any owner or purpose stays protected for years because nobody is accountable for removing it."],
    v: "Produce a cost report for one system covering storage, bandwidth, compute and retrieval, and compare its forecast against the next invoice, with a restore-time figure beside it.",
    dep: ["capacity-forecasting", "tiering-engine", "retention-rules"]
  },
  "scale-and-concurrency": {
    s: "The decision about how the system grows from one host to many thousands: how work is partitioned, how the catalog and index scale, and how many jobs may run at once.",
    d: "Scale affects each layer: the scheduler's decisions, the catalog's row counts, the dedup index's memory, repository throughput and the control service's agent connections. Designs partition by site, tenant or source, scale workers horizontally and keep metadata sharded. Performance often falls off a cliff when a structure no longer fits in memory or a single service becomes the bottleneck. Windows shrink as data grows faster than bandwidth, pushing designs towards incremental-forever and storage-side snapshots.",
    k: ["Single central system versus federation of independent sites: central gives one view and global dedup, while federation scales and fails independently, with a harder global picture.", "Scale up one large index versus shard it: one large index is simple and exact, while shards scale out and lose some cross-shard deduplication."],
    p: ["Performance is tested with a hundred sources and collapses at ten thousand when a single table or connection limit is reached.", "Data growth outpaces network speed, so the nightly window can no longer fit even incrementals."],
    v: "Load-test with a synthetic fleet at several times the current size, and record job throughput, catalog latency and index lookup time at each step, noting where each degrades.",
    dep: ["worker-pool", "catalog-database", "dedup-index", "concurrency-limits"]
  },
  "regulatory-compliance": {
    s: "The decision about which laws and standards govern the data, such as retention minimums, deletion rights, residency and auditability, and how the system proves it complies.",
    d: "Rules can require keeping records for years, deleting personal data on request, keeping data in certain regions, encrypting it, and producing evidence of controls. These collide: a deletion right conflicts with immutable backups kept for retention periods. Designs answer with crypto-shredding, expiry within bounded periods, per-region repositories and documented procedures. Evidence comes from reports, audit logs and test results. The hard part is that obligations change after the data is written, and the backups outlive the rules that governed them.",
    k: ["Immutable retention versus honoring deletion requests: immutability guarantees records and ransomware resistance, but deletion rights are met only by key destruction or expiry within a stated period.", "Single global repository versus regional ones: global is efficient, while regional repositories satisfy residency rules at the cost of duplicated infrastructure and no cross-region deduplication."],
    p: ["A deletion request is satisfied in production but the person's data survives in backups for years with no process to address it.", "Backups of regulated data are copied to a region the data may not leave."],
    v: "Submit a test deletion request for a data subject and confirm the documented process removes or renders unreadable all copies within the stated period, with evidence in the audit log.",
    dep: ["legal-hold", "key-management", "tamper-evident-log", "data-classification"]
  },
});
