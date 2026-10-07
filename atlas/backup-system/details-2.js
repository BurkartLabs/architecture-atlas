// Details for the backup system plate, part 2: verification and restore paths.
ATLAS.details("backup-system", {
  "checksum-verification": {
    s: "Compares stored data against checksums recorded at write time to detect corruption in transit, on disk or in a cloud tier before a restore depends on it.",
    d: "Each chunk or file carries a hash computed on the source and stored in the catalog or in the chunk's own header. Verification re-reads stored data, recomputes hashes and compares. It can run at write, after the job, on a periodic sweep or during restore. End-to-end checks use a hash computed before any processing, so they catch errors anywhere on the path. The cost is read bandwidth: verifying petabytes takes weeks and competes with restores, so schedules sample or rotate.",
    k: ["Verify at write time versus on a later sweep: write-time checks catch transit errors immediately, but only a sweep finds decay that happens months after the data landed.", "Full verification versus sampling: full checks give certainty, but sampling spreads cost and still finds systematic faults quickly."],
    p: ["A checksum computed after compression or encryption cannot detect a fault in the earlier stages.", "Verification that trusts the storage system's own report rather than re-reading bytes misses silent corruption."],
    v: "Flip one bit in a stored chunk with a test tool, run verification, and confirm it names the exact chunk and affected recovery points while all other chunks pass.",
    dep: ["content-hashing", "backup-catalog", "storage-driver-interface"]
  },
  "backup-readback": {
    s: "Reads a finished backup through the same path a restore would use, confirming that it can be reassembled, decrypted and decompressed correctly, not just that bytes exist.",
    d: "After a job, the verifier opens the new recovery point as a restore would: it resolves the chain in the catalog, fetches chunks, decrypts, decompresses and rebuilds files or blocks, discarding the output after comparing hashes. This detects errors invisible to storage-level checks, such as a missing key, a chain referencing an expired chunk, or an unreadable catalog entry. It doubles read load, so it may run on a copy at the target, away from production, or only for selected recovery points.",
    k: ["Immediate read-back after each job versus periodic: immediate confirms every point at once, but doubles load; periodic is cheaper but leaves a window in which a bad point is believed good.", "Reading from the primary copy versus from a replica: reading the replica also tests offsite data, but only the primary shows what a local restore would find."],
    p: ["Read-back skips decryption to save time, so a lost key is discovered during the real emergency.", "A read-back that only lists chunks proves they exist, not that the chain reassembles into the right data."],
    v: "Delete one chunk referenced by the newest recovery point in a test repository, run read-back, and confirm the point is flagged failed with the missing chunk identified before any restore is attempted.",
    dep: ["restore-planner", "checksum-verification", "encryption-at-rest"]
  },
  "restore-testing": {
    s: "Regularly restores real data to a scratch location and checks it, proving that recovery works and measuring how long it takes.",
    d: "Automated tests pick recovery points at random or by risk, restore them to an isolated target, and verify files, application consistency and elapsed time. Results feed recovery objective reports. Manual drills cover whole-service recovery including dependencies and people. Testing is hard because it is expensive: it needs spare capacity, and anything that touches production must be prevented. The point is also cultural: a restore that has never been run succeeds on paper only.",
    k: ["Automated sampled tests versus full annual drills: sampling covers many systems cheaply, while drills find ordering and people problems that sampling cannot.", "Restore into the production network versus a sealed lab: production is realistic, but a restored server with the same address and identity can disrupt live services."],
    p: ["Tests restore only files, never databases or whole servers, so the hardest paths stay unproven.", "A test restore overwrites a live path because the destination defaulted to the original location."],
    v: "Schedule a weekly automated restore of a random recovery point to an isolated scratch volume, then check hashes and a timed result is recorded against the system's recovery time objective.",
    dep: ["restore-planner", "rpo-rto-targets", "file-level-restore"]
  },
  "sandbox-boot-test": {
    s: "Starts a restored machine in an isolated network to prove that it actually boots, its services start and its applications respond.",
    d: "The system restores an image or virtual machine backup into a sandbox, attaches it to a network with no route to production, boots it and runs checks: operating system up, services listening, a database answering a query, a web page loading. Results and screenshots are recorded. It catches problems that file-level checks miss, such as missing boot components or drivers. It is hard because the restored machine must not conflict with production on addresses, names, licenses or outbound connections.",
    k: ["Boot only versus application-level checks: boot-only is generic and cheap, but application checks are what actually prove the service would work.", "Run the sandbox from the backup store directly versus restoring first: direct mounting is fast and cheap, but slower I/O hides real restore time."],
    p: ["The sandbox has working outbound access, and a restored mail server sends real messages.", "A test that passes on boot misses an application that starts but cannot reach its restored database."],
    v: "Boot a restored test machine in the sandbox, confirm its web service answers with expected content, confirm packet capture shows no traffic leaving the sandbox, and record the boot time.",
    dep: ["instant-recovery", "network-isolation", "restore-testing"]
  },
  "malware-scanning": {
    s: "Scans backup data for malicious software and signs of encryption or tampering, so that a restore does not reintroduce an infection.",
    d: "Scanners run on a mounted or restored copy of a recovery point using signature, behavior and entropy checks, and compare file changes between points. A clean result marks the point as safe to restore from; infected points are quarantined or annotated. Scanning backups finds dormant malware that predates detection on the live system. It is costly and cannot be perfect: signatures lag new threats, and encrypted files from a ransomware run can look like valid compressed data.",
    k: ["Scan during backup versus on a stored copy: scanning during backup stops bad data entering, but slows jobs; scanning later keeps the backup window but finds the issue after storage.", "Quarantine infected points versus keep and mark: quarantine prevents reuse, but deleting evidence or the last good point can cost more than the infection."],
    p: ["The newest point is encrypted by ransomware and no one knows which older point is the last clean one.", "Scanning inside a restored copy that has network access lets the malware activate."],
    v: "Plant a harmless test signature file in one recovery point, run the scan, and confirm that point is flagged with the file path while neighboring points without it are marked clean.",
    dep: ["instant-recovery", "anomaly-detection", "network-isolation"]
  },
  "repository-scrub": {
    s: "A periodic background pass that reads repository contents to find damaged chunks and repairs them from redundancy or flags the recovery points they affect.",
    d: "The scrub walks stored containers, validates internal headers and checksums, and compares chunk references with the catalog. Damaged data is rebuilt from erasure-coded fragments or replicas where possible; otherwise affected recovery points are marked unrestorable and the next backup is told to resend the missing data. Orphaned chunks no point references are reported. Scrubs are slow and I/O heavy, so they run at low priority and resume after interruption; the interval is a trade between detection delay and load.",
    k: ["Continuous low-rate scrubbing versus scheduled full passes: continuous spreads load but never finishes quickly, while scheduled passes finish predictably but impact production hours.", "Auto-repair versus report only: automatic repair shortens exposure, but repairing from a bad source can propagate damage."],
    p: ["A scrub that runs once a year finds corruption after every replica has been refreshed from the damaged copy.", "Marking a damaged chunk's points as failed is not followed by resending the data, so new backups keep referencing the hole."],
    v: "Corrupt one fragment in a test repository, run a scrub, and confirm it is rebuilt from redundancy, logged, and that a read-back of every affected point then passes.",
    dep: ["checksum-verification", "redundancy-coding", "chunk-reference-counts"]
  },
  "catalog-consistency-check": {
    s: "Cross-checks the catalog against actual repository contents to find missing chunks, orphaned data, wrong reference counts and recovery points with broken chains.",
    d: "The check enumerates catalog entries and repository objects and compares them in both directions. Entries pointing to nothing indicate lost data. Objects no entry references are orphans that waste space. Counts are recomputed from points and compared to stored counts. Chains are followed to confirm each incremental has its base. Running it online is delicate because backups and pruning change both sides during the scan, so it works from a consistent catalog snapshot and rechecks suspects.",
    k: ["Offline check with jobs paused versus online with snapshot and recheck: offline is simple and exact but costs a maintenance window, while online avoids downtime but reports false suspects.", "Repairing counts automatically versus reporting: automatic repair keeps reclamation safe, but a wrong repair deletes live data."],
    p: ["Running the check while pruning is active reports live chunks as orphans, and cleanup then deletes them.", "A check that finds no problems because it only compares catalog to catalog never touched the repository."],
    v: "Remove one object directly from the repository and add one stray object, run the check, and confirm it reports the affected recovery point and the orphan, and that counts are unchanged until a repair is approved.",
    dep: ["backup-catalog", "chunk-reference-counts", "backup-chains"]
  },
  "restore-planner": {
    s: "Works out exactly which recovery points, chunks and media are needed to rebuild the requested data at the requested time, and in what order to fetch them.",
    d: "Given a target and a point in time, the planner resolves the chain from the catalog: the base full, intervening incrementals and any logs. It lists the chunks and the media they sit on, accounts for what is cached locally, and orders reads to minimize tape mounts and seeks. It estimates time and warns when media are offsite or missing. It is hard because chains can be long, objects may be in cold tiers needing hours to retrieve, and a single missing element can make a plan impossible.",
    k: ["Plan before starting versus discover during restore: planning exposes missing media and gives time estimates up front, but costs catalog queries for large chains.", "Reading in chain order versus in storage order: chain order is simple, while storage order minimizes tape mounts and seeks at the cost of buffering."],
    p: ["A plan that ignores that a needed tape is in an offsite vault promises a recovery time it cannot meet.", "Planning from a stale catalog schedules chunks that have since been pruned."],
    v: "Request a restore requiring a full, three incrementals and a log, and confirm the plan lists each element with its location and flags a deliberately offlined tape before any data moves.",
    dep: ["backup-catalog", "backup-chains", "tiering-engine"]
  },
  "file-level-restore": {
    s: "Recovers individual files or directories from a recovery point to the original or another location, the most common kind of restore.",
    d: "The user browses or searches a recovery point, selects items and chooses a destination. The restore engine fetches only the chunks those files need, reassembles them, and reapplies permissions, timestamps, links and extended attributes. Conflict options decide what happens when a file exists: overwrite, rename or skip. For image backups the engine mounts the image and copies from it. It is hard to restore metadata faithfully across platforms: access control lists and owners may not map to a different system.",
    k: ["Restore in place versus to an alternate location: in place is convenient, but overwrites newer files and is hard to undo, so alternate locations are safer for exploring.", "Restore through the agent versus a direct mount of the backup: the agent preserves metadata and permissions, while mounting is quicker for browsing and one-off copies."],
    p: ["Overwriting an existing directory restores old files over newer ones and destroys changes made since.", "Files restored with the restoring account's ownership become inaccessible to the people who need them."],
    v: "Restore a directory from a week-old recovery point to a new location and compare every file's content hash, permissions, owner and timestamps against the source snapshot's manifest.",
    dep: ["restore-planner", "file-index", "backup-agent"]
  },
  "volume-restore": {
    s: "Rewrites a whole disk volume or filesystem from an image backup, replacing its contents with those of a chosen recovery point.",
    d: "The engine reconstructs the volume block by block from base and incremental data, writing to a prepared target volume that must be at least as large. It restores partition layout and filesystem structures, then verifies. Changed-block information can limit the restore to the differences when the target still resembles the backup. The volume must be offline during the write. Restoring to different hardware or a larger disk requires adjusting boot configuration and filesystem sizes, and a restore that stops midway leaves an unusable volume.",
    k: ["Full rewrite versus differential restore of changed blocks only: a full rewrite is certain, while a differential restore is much faster but trusts that the target's unchanged blocks are intact.", "Restore to the original volume versus a new one: the original is quick, but a new volume preserves the damaged state for investigation."],
    p: ["Restoring onto the wrong disk number overwrites a healthy data volume.", "Interrupting a volume restore halfway leaves a volume that is neither the old state nor the new."],
    v: "Restore a test volume from yesterday's image onto a blank disk, mount it, and confirm the filesystem passes a consistency check and a sample of files matches the recorded hashes.",
    dep: ["image-backup", "restore-planner", "storage-driver-interface"]
  },
  "bare-metal-recovery": {
    s: "Rebuilds a complete machine from nothing onto new or empty hardware, including partitions, boot loader, operating system, settings and data.",
    d: "The operator boots a recovery environment from network or media, which loads storage and network drivers, contacts the repository and selects a recovery point. The tool partitions disks, restores the system image and installs boot components. The result may need driver injection when hardware differs. Firmware modes, disk encryption keys and licensing add steps. It is the slowest restore path and is mostly attempted in disasters, so it must work without the tools that were on the failed machine.",
    k: ["Network-booted recovery versus prepared bootable media: network boot is easy to maintain centrally, but fails when the network or boot server is part of the outage.", "Restore to identical hardware versus dissimilar: identical hardware is reliable, while dissimilar needs driver handling that can leave a machine that boots but cannot see its disks."],
    p: ["The recovery media's drivers predate the replacement hardware, so the new machine cannot see its own disk.", "Recovery credentials and encryption keys are stored on the failed machine, so the restore cannot begin."],
    v: "On a spare machine with different disk layout, boot the recovery environment, restore a recent image, and confirm the machine boots unaided and its services come up, recording the total elapsed time.",
    dep: ["volume-restore", "image-backup", "key-management", "cross-platform-restore"]
  },
  "instant-recovery": {
    s: "Starts a machine or volume directly from backup storage, presenting backed-up data as live disks while the full restore proceeds in the background or not at all.",
    d: "The backup repository exposes recovery point blocks through a network disk protocol or a virtual datastore. A hypervisor or host boots from it, and writes go to a separate overlay so the backup stays unchanged. Reads are served on demand from stored chunks, with prefetching. Optionally the data migrates to production storage while running. It cuts recovery time to minutes, but performance is limited by the repository, and deduplicated or tape-resident data can be too slow to use.",
    k: ["Run from backup storage versus restore first: running directly returns service in minutes, but exposes users to repository performance and puts load on the backup system during an incident.", "Discard the overlay versus migrate it: discarding is ideal for tests and clean rollbacks, while migrating makes the recovered machine permanent."],
    p: ["A repository sized for sequential backup cannot handle random reads from a running database, and the recovered service crawls.", "Writes accidentally go into the backup repository itself, modifying a recovery point."],
    v: "Boot a test machine from a recovery point using instant recovery, make a change, then discard it and confirm the original recovery point's hash is unchanged and the boot took under the target time.",
    dep: ["disk-repository", "restore-planner", "chunk-reference-counts"]
  },
  "application-aware-restore": {
    s: "Restores databases, directory services and mail systems in a way that leaves the application consistent and running, using its own recovery mechanisms.",
    d: "Application plugins know the correct recovery sequence: restore data files, replay or discard transaction logs, bring the service up in recovery mode, and verify. For clustered or replicated systems they also handle rejoining the group and avoiding conflicts with surviving members. Many applications refuse to start from a copy that was not captured consistently, so this path relies on quiesced backups. It is hard because each application has its own rules and versions, and a restore to a different version may be unsupported.",
    k: ["Application-native restore tools versus generic file restore: native tools preserve consistency and handle logs, but need per-application plugins and matching versions.", "Restore into a recovery instance versus overwrite production: a recovery instance lets people extract items safely, while overwriting is simpler but irreversible."],
    p: ["Restoring only data files without the matching logs leaves a database that will not start, or starts with silent inconsistencies.", "Restoring a cluster member without informing the cluster causes it to rejoin with stale data and corrupt the others."],
    v: "Restore a test database from a backup to a recovery instance, replay logs to a chosen moment, and confirm the application starts, its integrity check passes and a known row count matches.",
    dep: ["application-plugins", "point-in-time-recovery", "log-backup"]
  },
  "point-in-time-recovery": {
    s: "Rebuilds data as it was at a chosen moment between backups by applying captured transaction logs or journal records on top of a base copy.",
    d: "The engine restores the latest base copy before the target moment, then replays continuous log backups up to that moment, stopping just before an error such as a bad update or deletion. The user picks a time or a log position. The planner checks that the log chain is unbroken from the base to the target. It is hard because any gap in the logs ends the recoverable range there, and because time must be mapped exactly: clocks, time zones and transaction commit order must agree.",
    k: ["Recover to a timestamp versus a log position or transaction marker: timestamps are natural for users, but log positions are exact when clocks differ or events are bursts of commits.", "Frequent log backups versus a longer interval: frequent backups narrow data loss and keep logs small, but create many objects and a longer chain to replay."],
    p: ["A single missing log segment silently caps the recoverable range at the point just before it.", "Choosing a timestamp in the wrong time zone recovers to a moment hours away from the intended one."],
    v: "Insert rows, record the time, delete them, then recover to just before the deletion and confirm the rows return and the rows added after the target time are absent.",
    dep: ["log-backup", "restore-planner", "clock-and-time-sync"]
  },
  "granular-item-restore": {
    s: "Extracts single items such as a mailbox message, a database table or a directory object from a backup of the whole application, without restoring the whole system.",
    d: "The tool opens application backup data directly through an application-specific reader, or briefly mounts it as a temporary instance. The operator searches for an item, previews it and exports it to a file or back into the live application through its own import interface. This avoids multi-hour restores for a deleted email. It is hard because item semantics are application knowledge: permissions, links between items and version history must be reconstructed, and readers must keep up with each application's changing on-disk formats.",
    k: ["Direct reader of backup data versus temporary recovery instance: a reader is faster and lightweight, but breaks when formats change, whereas an instance is exact but slower and heavier.", "Export to file versus reinsert into the live system: export is safe and reviewable, while reinsertion saves manual work but can create duplicates or overwrite newer edits."],
    p: ["Restoring a deleted item brings back a stale version that overwrites a newer item with the same identity.", "The reader cannot open the backup after the application is upgraded, discovered only when an item is needed."],
    v: "Delete one message and one database table row in a test application, find each in last night's backup, restore both into the live system, and confirm contents and relations match originals.",
    dep: ["application-aware-restore", "search-and-browse", "application-plugins"]
  },
  "cross-platform-restore": {
    s: "Recovers a backup onto a different kind of platform, such as physical to virtual, between hypervisors or into a cloud, converting drivers and formats along the way.",
    d: "The conversion engine restores the disks into the target's format, then adjusts what the guest operating system expects: storage and network drivers, boot configuration, device names and sometimes network addresses and agent identity. It supports migration, testing and disaster recovery on different infrastructure than production. It is hard because guests tie themselves to hardware: boot loaders, drivers and licenses can fail on the target, and software that checks hardware identity may refuse to run.",
    k: ["Convert at restore time versus keep a pre-converted replica: converting at restore is flexible and cheap to maintain, while a replica starts quickly but costs storage and constant updates.", "Preserve identity versus assign a new one: preserving keeps services working, but two copies with the same identity on one network conflict."],
    p: ["The converted guest boots but has no working network adapter, so it is unreachable even though the restore succeeded.", "A restored server rejoins the production network with its old address and disrupts the original."],
    v: "Restore a physical server's image into a virtual machine on a different platform, boot it in an isolated network, and confirm its services answer and device names are consistent with its configuration.",
    dep: ["image-backup", "bare-metal-recovery", "cloud-resource-connectors"]
  },
  "self-service-restore": {
    s: "A portal that lets users or application owners find and restore their own files and items within delegated limits, without calling the backup team.",
    d: "The portal authenticates users through the organization's identity system and shows only what they are entitled to see, usually their own files, mailbox or systems. They choose a recovery point, search, and restore to a location they control. Every action is logged. The benefit is volume: most restores are small and routine. The problem is permission fidelity: the portal must evaluate access using the permissions at backup time, not today, and must not allow one user to read another's data through search.",
    k: ["Permissions as of backup time versus as of today: backup-time permissions match what the user could see then, while current permissions are simpler but hide or reveal the wrong files after changes.", "Restore directly to the source versus into a user-owned staging area: direct is convenient, while staging limits the harm of a mistaken overwrite."],
    p: ["Search results leak file names from restricted directories the user could never open.", "A user restores terabytes at once and saturates the repository, since no quota was set."],
    v: "Sign in as a standard user, search for a deleted file in a shared directory, and confirm only permitted results appear and the restored file lands where chosen, with an audit entry.",
    dep: ["search-and-browse", "identity-and-access", "file-level-restore"]
  },
});
