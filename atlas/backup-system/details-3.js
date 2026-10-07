// Details for the backup system plate, part 3: sources, backup types and data reduction.
ATLAS.details("backup-system", {
  "backup-agent": {
    s: "Software installed on a protected host that reads its data, coordinates consistency with the system, reduces and sends it to storage, and takes instructions from the control service.",
    d: "The agent runs as a privileged service, registers with the control service, receives its policy and executes jobs. It reads files or blocks, calls snapshot and application hooks, chunks, hashes, compresses and encrypts locally where configured, and streams to a repository through the transfer protocol. It reports progress and results. It is hard because it lives on someone else's production machine: it must be small, safe to upgrade, tolerant of reboots and quirks, and never the reason an application slows or fails.",
    k: ["Agent on every host versus agentless collection: agents see inside the guest and support applications, but require installing, updating and securing software on every system.", "Agent does data reduction locally versus on a gateway: local work saves bandwidth and keeps data encrypted from the start, but spends production CPU."],
    p: ["An agent upgrade that fails on a subset of hosts leaves them silently unprotected on an old version.", "A highly privileged agent whose credentials are stolen lets an attacker read or delete everything it can reach."],
    v: "Install the agent on a clean host, assign a policy, and confirm it registers, runs its first job and appears in the console with host details; then reboot mid-job and confirm it resumes.",
    dep: ["chunker", "transfer-protocol", "snapshot-orchestration", "identity-and-access"]
  },
  "agentless-host-backup": {
    s: "Protects virtual machines or cloud instances by working through the hypervisor or platform interface, without installing software inside each guest.",
    d: "A backup proxy asks the hypervisor or platform for a snapshot of each virtual machine's disks and for the list of blocks changed since the last run. It reads those blocks over the storage network or the management interface and processes them. One proxy covers many guests, and new machines are found automatically. The trade-off is depth: without something inside the guest it cannot always quiesce applications or restore single items, and the platform's own snapshot limits and tracking become dependencies.",
    k: ["Agentless via the hypervisor versus an in-guest agent: agentless scales to many guests with no per-guest software, while in-guest provides application consistency and file-level detail.", "Proxy reads over the storage network versus the management network: storage-network reads are fast but need access to storage, while management reads work anywhere and are slower."],
    p: ["Guest snapshots left behind by a failed job grow until they fill the datastore and stop the virtual machine.", "Changed-block tracking is reset by a platform operation, and the next incremental silently becomes a full read."],
    v: "Create a virtual machine, run an agentless backup, power it off, and boot an instant recovery of that point, confirming the disks hold the data written before the snapshot.",
    dep: ["snapshot-orchestration", "change-tracking", "worker-pool"]
  },
  "application-plugins": {
    s: "Modules that teach the agent the specific rules of a database, mail or directory system: how to quiesce it, which files make a consistent set and how to restore it.",
    d: "A plugin knows an application's native backup interface. It prepares the application for backup, discovers its data and log files, triggers or reads application-level backups, truncates logs only after a successful capture, and later runs the correct restore sequence. Plugins are versioned against application versions and need credentials to the application. They are hard to maintain: every release changes formats and interfaces, and a plugin that is wrong produces backups that look fine and are not restorable.",
    k: ["Use the application's own backup interface versus snapshot the files underneath: the native interface gives guaranteed consistency, but needs credentials and per-application code; file snapshots are generic but only crash-consistent.", "One plugin per application version versus a generic one: per-version plugins are precise, but the support matrix keeps growing."],
    p: ["Log truncation runs after a backup that then fails, destroying the logs needed for point-in-time recovery.", "The plugin's service account loses its permissions after a password policy change and backups quietly fall back to crash-consistent."],
    v: "Back up a test database through the plugin, restore it to another instance, and confirm the application opens it without a recovery error, and its integrity checks report no problems.",
    dep: ["quiesce-and-freeze", "backup-agent", "log-backup"]
  },
  "quiesce-and-freeze": {
    s: "Briefly pauses or flushes an application and filesystem so that the data on disk forms a consistent state at the instant a snapshot is taken.",
    d: "The coordinator asks applications to flush buffers and hold writes, asks the filesystem to freeze or flush, takes the snapshot, then thaws everything. The window must be short, from milliseconds to seconds, because writers stall during it. Application-consistent means the application itself agrees the state is clean; filesystem-consistent means only the filesystem is sane; crash-consistent means neither, equal to a power loss. Failing to thaw after an error is a serious risk, so the coordinator uses timeouts that release the freeze by themselves.",
    k: ["Application-consistent versus crash-consistent snapshots: application-consistent restores cleanly but needs cooperation and a pause, whereas crash-consistent is quick and invisible but relies on recovery at startup.", "Long freeze for reliability versus a short bounded one: a longer freeze lets slow applications finish flushing, but stalls writers and risks timeouts."],
    p: ["A failure between freeze and thaw leaves production writes blocked until an operator intervenes.", "Quiescing only one of several related databases yields a snapshot where they disagree with each other."],
    v: "Run a continuous write workload while a snapshot is taken, measure the longest write stall, and confirm it stays below the target and the snapshot restores with no recovery needed.",
    dep: ["application-plugins", "snapshot-orchestration"]
  },
  "snapshot-orchestration": {
    s: "Creates, uses and removes point-in-time snapshots on the host, hypervisor or storage array so backups read a frozen view while production continues.",
    d: "The orchestrator chooses the snapshot layer available: the operating system's volume snapshot service, the filesystem, the hypervisor or the storage array. It takes a coordinated snapshot across volumes, exposes it to the agent for reading, and deletes it afterward. Snapshots use copy-on-write, so each production write costs extra while one exists, and the snapshot must be removed promptly. Arrays can replicate or back up from a snapshot with no host load. Failures leave stale snapshots that consume space.",
    k: ["Host-level versus array-level snapshots: host snapshots work anywhere but cost host I/O, while array snapshots are nearly free but require integration and affect only that array.", "Keep snapshots as recovery points versus delete after copying: kept snapshots restore instantly, but live on the same storage and fail with it."],
    p: ["A backup that crashes leaves its snapshot open, and copy-on-write space grows until the volume fills.", "Snapshots taken independently per volume produce a set that was never consistent with each other."],
    v: "Create a snapshot, write to the source, read the snapshot, and confirm it shows the old data; then fail a job deliberately and confirm cleanup removes the snapshot within the timeout.",
    dep: ["quiesce-and-freeze", "storage-driver-interface"]
  },
  "change-tracking": {
    s: "Records which blocks or files changed since the last backup so incrementals read only the difference instead of scanning everything.",
    d: "Block-level tracking uses a driver or the hypervisor or array to maintain a bitmap or journal of changed regions, tied to a backup identifier. File-level tracking uses filesystem change journals or timestamps and sizes. The next job asks what changed since a given point. It is fast, but fragile: if the tracking state is lost through a reboot, a restore of the guest, a disk resize or a driver fault, the system must fall back to a full read or checksum comparison to be safe.",
    k: ["Tracking by journal versus by comparing metadata at backup time: a journal avoids scanning entirely, but depends on its integrity, while comparison is self-contained but must walk every file.", "Trusting tracking versus periodic full verification of changed blocks: trusting is fast, while periodic verification catches tracking errors at the cost of occasional full reads."],
    p: ["A tracking reset goes unnoticed and an incremental omits changed blocks, producing recovery points that restore corrupted data.", "Timestamp-based detection misses files modified with their timestamp set back."],
    v: "Modify three known blocks after a backup, take an incremental, and confirm exactly those blocks are read and transferred; then reset tracking and confirm the next job detects it and falls back safely.",
    dep: ["snapshot-orchestration", "incremental-backup"]
  },
  "filesystem-walker": {
    s: "Traverses directory trees to enumerate files, applies selection rules and captures metadata, handling links, special files and very large directories.",
    d: "The walker visits each directory, lists entries, applies include and exclude rules, and records names, sizes, times, permissions, ownership, links and extended attributes. For incrementals it compares against the previous state to find new, changed, moved and deleted items. Parallel traversal is needed on large trees, and the order affects how well reads stream. It is hard at scale: hundreds of millions of small files make metadata the bottleneck, and links, loops and unusual names demand care.",
    k: ["Walk the live filesystem versus a snapshot of it: a snapshot gives a stable tree, while walking live tolerates changes during the scan and can see a state that never existed.", "Single-threaded ordered walk versus parallel: ordered is simple and cache friendly, while parallel walks use fast storage's many queues but complicate ordering."],
    p: ["A symbolic link loop sends the walker into infinite recursion.", "Files renamed during the walk are captured twice or not at all."],
    v: "Back up a tree with links, empty directories, special files and unusual names, restore it, and diff the tree including metadata against the original with no differences.",
    dep: ["source-selection-rules", "snapshot-orchestration"]
  },
  "open-file-handling": {
    s: "Deals with files that are locked or changing while being read, so the backup still obtains a usable copy or records clearly what it could not.",
    d: "Applications hold files open with exclusive locks or write to them continuously. Reading from a snapshot sidesteps both. Without a snapshot, the agent can use lock-bypassing reads, retry later, or copy in sections and verify that the file did not change. Policies decide whether a file that fails is skipped with a warning or fails the job. It is hard because a file copied while changing can be internally inconsistent, such as a database file with some pages old and some new.",
    k: ["Fail the job on a locked file versus skip with a warning: failing makes gaps impossible to miss, while skipping keeps most protection but can hide the single important file.", "Snapshot read versus read-and-verify-unchanged: snapshots are consistent but need platform support, while verification is portable but can never succeed for a busy file."],
    p: ["Warnings about skipped locked files are ignored for months, and the file that always fails is the one that mattered.", "A large active file copied piecemeal restores as a mix of old and new data that the application cannot open."],
    v: "Open a file exclusively with a writer, run a backup, and confirm the result either contains a consistent copy or reports the file by name as skipped, never a silently torn one.",
    dep: ["snapshot-orchestration", "backup-agent"]
  },
  "endpoint-agents": {
    s: "Lightweight agents for laptops and desktops that back up opportunistically over unreliable networks and wake periodically, instead of at fixed times.",
    d: "Endpoints sleep, roam, change networks and rarely sit on the corporate link at night. The agent backs up in the background when idle and connected, with small incremental runs, bandwidth caps and battery awareness. It protects user folders rather than whole systems, and often uses continuous change detection. Data goes through an internet gateway with per-device identity. The challenge is scale and variety: many thousands of devices, constantly changing connectivity, users who delete the agent, and privacy rules for personal files.",
    k: ["Continuous protection of changed files versus scheduled runs: continuous narrows data loss to minutes, but generates constant small uploads and metadata load on the service.", "Back up whole device versus selected folders: whole device recovers everything, while folders are small, fast and avoid capturing private or irrelevant data."],
    p: ["Devices that stay offline or asleep never reach their schedule, so most are weeks behind without anyone knowing.", "A user excludes or uninstalls the agent and the company's only copy of a project disappears with the disk."],
    v: "Disconnect a laptop, edit files, reconnect over a different network, and confirm the changes are uploaded within the target time, and that a device last seen weeks ago is listed in the lag report.",
    dep: ["backup-agent", "bandwidth-throttling", "identity-and-access"]
  },
  "cloud-resource-connectors": {
    s: "Protect resources that live inside cloud platforms and software services by calling their provider interfaces for snapshots, exports and change feeds.",
    d: "Connectors authenticate to the cloud account or the service tenant, enumerate resources such as virtual disks, managed databases and object buckets, and use provider snapshot or export interfaces. For hosted applications such as mail and document services, they read through the service's own APIs, subject to rate limits. Provider-side snapshots are cheap but stay in the same account and region. A backup in a separate account and region is what survives a compromise or regional loss.",
    k: ["Provider-native snapshots versus exporting data to a separate account: native snapshots are fast and cheap, but share the account's blast radius, while exports cost more yet survive account compromise.", "Backing up through service APIs versus via exports: APIs give item-level detail, but are rate-limited and slow, whereas exports are bulk and fast but coarse."],
    p: ["Provider API throttling stretches a mailbox backup past its window and the job never completes.", "Backups stored in the same account as production are deleted along with it when the account is compromised."],
    v: "Connect a test cloud account, back up a disk and a hosted mailbox, then restore each into a different account or region and confirm contents match.",
    dep: ["identity-and-access", "object-storage-target", "secret-store"]
  },
  "full-backup": {
    s: "Copies the entire selected data set, producing a self-contained recovery point that needs no other backups to restore.",
    d: "A full reads everything in scope, so it is the baseline from which others are measured. It restores simply and fastest, since nothing needs combining, and anchors chains. The cost is read time, network and storage: a full of a large system can run for a day and, without deduplication, repeats mostly unchanged data. Systems schedule fulls weekly or monthly, or avoid them using synthetic and forever-incremental schemes. A full is also the safe response when change tracking cannot be trusted.",
    k: ["Frequent fulls versus long incremental chains: frequent fulls make restores simple and chains short, but consume read bandwidth and storage, while long chains save both and raise restore complexity.", "Full from the source versus synthesized on the target: reading the source is truly independent, while synthesizing spares production but depends on the earlier chain."],
    p: ["Fulls of many systems all land on the same weekend night and overload the repository.", "A full that completes with skipped files becomes the base of a chain whose every restore lacks them."],
    v: "Run a full backup of a test data set and restore it to an empty location using only that recovery point, confirming every file's hash matches the source.",
    dep: ["backup-agent", "backup-chains", "chunker"]
  },
  "incremental-backup": {
    s: "Copies only data changed since the previous backup of any kind, producing small, fast jobs that depend on earlier recovery points for restore.",
    d: "An incremental asks change tracking what is new since the last point and stores only that. Jobs are short and cheap, so they can run hourly. Restoring needs the last full and every incremental up to the target, applied in order, so a long chain makes restores slower and raises the chance that one damaged element breaks everything after it. Deletions are recorded so restored data does not resurrect removed files.",
    k: ["Incremental versus differential: incrementals minimize each job's size, but restore needs the whole chain, while differentials grow daily but need only two sets.", "Long chain between fulls versus short: a long chain saves space and bandwidth, but magnifies restore time and the damage from one bad link."],
    p: ["One corrupted incremental in the middle makes every later point in the chain unrestorable.", "A change tracking reset makes an incremental miss changes without any error."],
    v: "Make known changes across three incrementals including a file deletion, restore to the third point, and confirm changed files are current and the deleted file is absent.",
    dep: ["change-tracking", "full-backup", "backup-chains"]
  },
  "differential-backup": {
    s: "Copies everything changed since the last full backup, so restore needs only the full and the latest differential.",
    d: "Each differential contains the cumulative changes since the base full, so it grows daily until the next full resets it. Restore is simpler than with incrementals: apply two sets, not a long chain, which also limits exposure to a single damaged element. The cost is that a data set with high change repeats the same changes in every differential, wasting space. With deduplicating targets that waste largely disappears, which is why differentials matter less in modern designs.",
    k: ["Differential versus incremental: differentials shorten restore and reduce chain risk, but store repeated changes and grow until the next full.", "Differential on deduplicating storage versus conventional: deduplication removes repeated changes, so the space penalty vanishes, but only if the target actually recognizes the repeated data."],
    p: ["A system with high daily change produces differentials nearly as large as fulls by the end of the cycle.", "The next full is skipped and the differential keeps growing until it exceeds the cost of a full."],
    v: "Take a full and three daily differentials, restore the third day, and confirm the restore used exactly two recovery points and the file contents match that day's source.",
    dep: ["full-backup", "change-tracking", "backup-chains"]
  },
  "synthetic-full": {
    s: "Builds a new full recovery point on the backup target by combining the existing full and incrementals, with no new read of the source.",
    d: "The target merges the base full and later incrementals into a fresh full, either by copying data into a new file or, on modern repositories, by creating references to existing chunks or blocks without moving data. The production host is untouched. The new full shortens the chain, resets restore complexity and allows older increments to expire. It is hard because it depends on the earlier chain being intact and trusts it: a flaw in the old chain is copied forward into the new full.",
    k: ["Merge by copying versus by reference: copying is independent and portable but needs I/O and space, while references are instant and free but tie the new full to shared data.", "Synthetic full versus real full from the source: synthetic spares production, but a real full also revalidates the data against the live source."],
    p: ["A damaged chunk in the base is faithfully carried into every later synthetic full and lives forever.", "Synthetic fulls running at the same time as pruning race and drop chunks the new full needs."],
    v: "Create a synthetic full from a base and incrementals, then expire the old chain and confirm the synthetic full restores completely and its hashes equal a restore of the last incremental.",
    dep: ["backup-chains", "chunk-reference-counts", "disk-repository"]
  },
  "forever-incremental": {
    s: "Takes one initial full and thereafter only incrementals, merging the oldest ones into the base so no further full is ever read from the source.",
    d: "After the first full, each job transfers only changes. The repository maintains a rolling window: when the oldest point expires, its changes are merged into the base, so the base moves forward and retention stays bounded. The source is read once and thereafter only differences cross the network, which suits slow links. Restores read from a consolidated state, so chains remain short. The trade-off is trust: the only copy of unchanged data is the one written long ago, so integrity checking is essential.",
    k: ["Forever incremental versus periodic fulls: forever incremental never re-reads or re-sends unchanged data, but never revalidates it against the source.", "Merge on expiry versus keep unmerged chain: merging keeps restore fast, while an unmerged chain avoids the merge's I/O but slowly grows long."],
    p: ["A flaw in the original full is never corrected, since no later job rereads that data.", "The merge job fails repeatedly, the chain keeps lengthening and restore time creeps up unnoticed."],
    v: "Run thirty days of incrementals with merges, confirm the source was read in full only once, and that a restore of day thirty matches the source and takes no longer than a restore of day two.",
    dep: ["incremental-backup", "synthetic-full", "checksum-verification"]
  },
  "image-backup": {
    s: "Captures a whole disk or volume at block level, including system files, boot structures and layout, so an entire machine can be recreated.",
    d: "Rather than walking files, the agent reads blocks from a snapshot, usually skipping unallocated space, and stores them as an image with partition and filesystem metadata. Change tracking makes incrementals cheap. Images support bare-metal recovery, instant recovery and conversion to virtual disks. They are less transparent than file backups: finding one file requires mounting the image, and the data of unrelated machines rarely deduplicates unless blocks align.",
    k: ["Image versus file-level backup: images recover whole machines fast and with exact layout, but are heavier to search and give less control over what is kept.", "Skip unallocated blocks versus copy raw everything: skipping saves space and time, but needs filesystem knowledge to know what is in use."],
    p: ["An image of a volume holding an encrypted filesystem is unreadable without the key and also compresses and deduplicates poorly.", "Imaging a running database volume without quiescing produces a crash-consistent image the database must recover from."],
    v: "Image a test machine, mount the image on another host read-only, and confirm the filesystem lists correctly, a sample file matches its source hash, and the image restores to a bootable disk.",
    dep: ["snapshot-orchestration", "change-tracking", "chunker"]
  },
  "log-backup": {
    s: "Continuously or frequently copies a database's transaction logs, enabling recovery to any moment and keeping the loss window to minutes.",
    d: "Databases write every change to a log before the data files. The log backup job copies completed log segments to storage soon after they are written, then allows the database to reuse them. Together with a base backup, the log chain lets recovery replay changes forward to a chosen time. Frequency sets the possible data loss. The chain is brittle: a missing segment ends the recoverable range there, and a log truncated without being captured is a gap that cannot be repaired.",
    k: ["Frequent small log backups versus longer intervals: frequent backups cut potential loss to minutes, but create many objects and cost more per-job overhead.", "Backup tool controls log truncation versus the database's own schedule: tool control guarantees a segment is captured before removal, but a stopped tool lets logs fill the disk."],
    p: ["A second tool takes its own log backups, and each tool's chain has holes that only the other contains.", "A full log volume stops the database because the backup job failed and could not free space."],
    v: "Run a workload with log backups every five minutes, then recover to a chosen minute in the last hour and confirm the database reflects exactly the transactions committed before that minute.",
    dep: ["application-plugins", "backup-chains", "incremental-backup"]
  },
  "backup-chains": {
    s: "The ordered sets of recovery points that depend on each other, from a base full through incrementals or logs, with rules for starting, extending and ending them.",
    d: "Every dependent point records which earlier points it needs. The system tracks chains in the catalog, extends them with each incremental and starts new ones at fulls. A restore needs the whole chain from base to target. Chain length, health and dependencies decide how retention can delete: an old full cannot be removed while later points rely on it. Chain rules interact with policy changes, with failed jobs, and with moving data between tiers, and a break anywhere endangers everything after it.",
    k: ["Short chains with frequent fulls versus long chains: short chains limit exposure and restore time, while long chains reduce backup load and storage.", "Chain per source versus global dependencies through shared chunks: separate chains are easy to reason about, while chunk sharing across points makes deletion safe only with reference counts."],
    p: ["A failed job leaves a partial incremental that the next job treats as its base, and the chain is silently broken.", "Moving the base to cold storage makes every restore of a later point wait for retrieval."],
    v: "List one chain's elements from the catalog, expire the middle element's dependents in a test, and confirm the system refuses to delete a point that later ones still need.",
    dep: ["backup-catalog", "chunk-reference-counts"]
  },
  "chunker": {
    s: "Splits data streams into pieces, fixed-size or content-defined, so identical data can be recognized, stored once and transferred or verified independently.",
    d: "Fixed-size chunking cuts at regular offsets, which is simple and fast but fails when an insertion shifts every later boundary. Content-defined chunking computes a rolling hash over a window and cuts where it matches a pattern, so boundaries follow content and survive insertions. Chunk size is a trade-off: small chunks find more duplicates but multiply index entries and metadata, large chunks are cheap but dedupe less. Variable-length chunking costs CPU, which is why it runs on the source or a proxy.",
    k: ["Content-defined versus fixed-size chunking: content-defined survives insertions and finds more duplicates, but costs more CPU and yields irregular sizes.", "Small versus large average chunk size: small chunks find fine-grained redundancy, but inflate the index and per-chunk overhead, and large ones dedupe less."],
    p: ["Fixed chunking applied to files with small header edits sees every chunk as new, and deduplication collapses.", "Changing chunking parameters between jobs prevents matching with everything stored earlier."],
    v: "Chunk a file, insert one byte near the start, chunk again, and confirm content-defined chunking changes only the nearby chunks while fixed-size changes every later one.",
    dep: ["content-hashing"]
  },
  "content-hashing": {
    s: "Computes a cryptographic fingerprint of each chunk, used to identify duplicates, address stored data and verify integrity end to end.",
    d: "Each chunk is hashed with a collision-resistant function, and the digest becomes its identity: two chunks with the same digest are treated as the same data. Digests index the dedup store, name stored objects and let verification detect corruption. Hashing is CPU-heavy but parallel and hardware-assisted. The security of deduplication rests on collision resistance, and a keyed or per-tenant hash prevents others from probing whether given data exists in the store.",
    k: ["Strong cryptographic hash versus a fast weak one: strong hashes make collisions negligible, but cost CPU, while weak hashes risk wrongly merging different data.", "Plain content hash versus keyed hash: plain hashes dedupe across everyone, but allow confirmation-of-file attacks, whereas keyed hashes restrict dedup to key holders."],
    p: ["Using a hash with known collisions lets a malicious file replace another chunk in the store.", "Hashing after compression or encryption means identical data yields different digests and never deduplicates."],
    v: "Hash two identical chunks on two hosts and confirm identical digests; alter one byte and confirm a different digest and that verification flags a mismatch against the stored digest.",
    dep: []
  },
  "dedup-index": {
    s: "The lookup structure mapping chunk fingerprints to where chunks are stored, answering instantly whether a chunk already exists.",
    d: "For every incoming chunk the system asks the index whether its fingerprint is known. If so, only a reference is recorded. At billions of chunks the index outgrows memory, so designs use bloom filters, sparse sampling with locality grouping, or sharded tables on fast flash. The index must be consistent with stored data and survive crashes. It is the performance heart of deduplication: slow lookups throttle backup, and a lost or inconsistent index leads to storing duplicates or, worse, to referencing missing data.",
    k: ["Full in-memory index versus sampled index with locality: full is fast and exact, but needs memory proportional to data, while sampling saves memory and exploits locality at some missed duplicates.", "Index as the source of truth versus derived from chunk store: index-as-truth is quick, but rebuilding from the store makes loss recoverable at the cost of a slow scan."],
    p: ["The index outgrows memory and lookup time rises sharply, so backup throughput collapses after the data passes a threshold.", "A crash leaves index entries for chunks that were never fully written and later backups reference them."],
    v: "Back up the same data set twice and confirm the second run reports nearly all chunks found in the index, writes almost no new data, and survives killing the process mid-job with a consistent index.",
    dep: ["content-hashing", "catalog-database", "chunk-reference-counts"]
  },
  "source-side-dedup": {
    s: "Checks chunk fingerprints on the source or a proxy before sending, so duplicate data never crosses the network.",
    d: "The agent chunks and hashes locally, sends the list of fingerprints to the repository, and receives back which are missing. Only those are transferred. This saves bandwidth, which is critical on slow links and for cloud targets, and it shifts CPU work to production hosts. It adds a round trip and exposes the index to many clients. It also leaks information in a shared store, since a successful skip reveals that the same data exists elsewhere.",
    k: ["Deduplicate at the source versus at the target: source deduplication saves bandwidth and storage I/O, but spends production CPU and memory and needs a chatty protocol.", "Per-client local cache of fingerprints versus asking the server each time: a local cache avoids round trips, but can go stale and cause rejected references."],
    p: ["A client's cached fingerprint list claims a chunk exists that the server has pruned, and the backup references missing data.", "Heavy chunking on a small database server causes visible application slowdowns."],
    v: "Back up a data set from a host over a throttled link, repeat after a ten percent change, and confirm bytes sent in the second run are close to the changed data, not the full set.",
    dep: ["chunker", "dedup-index", "transfer-protocol"]
  },
  "target-side-dedup": {
    s: "Receives full data streams and deduplicates them on the repository or a dedicated appliance, at write time or afterward.",
    d: "Data arrives unreduced, then the target chunks and hashes it inline, or later in a post-process pass. Inline saves landing space but needs CPU and index performance during ingest. Post-process needs a landing zone but keeps ingest fast. This design works with agents that know nothing about deduplication and with data from many sources, enabling cross-system savings. The cost is network bandwidth, since all data crosses the wire, and a heavy load on the target.",
    k: ["Inline versus post-process deduplication: inline stores less and avoids landing space, but throttles ingest, while post-process ingests quickly and needs temporary space.", "Dedicated appliance versus software on general storage: appliances are tuned and predictable, but are another system to buy and a lock-in point."],
    p: ["Post-process runs behind, the landing zone fills and backups fail even though total capacity looked sufficient.", "Pre-compressed or pre-encrypted data from clients reaches the target and does not deduplicate at all."],
    v: "Send two copies of one data set from different hosts to the target and confirm stored size is close to one copy, and ingest throughput meets the target figure.",
    dep: ["chunker", "dedup-index", "disk-repository"]
  },
  "compression": {
    s: "Shrinks chunks before storage with a general or data-aware algorithm, trading CPU time for space and transfer volume.",
    d: "After deduplication and before encryption, chunks are compressed. Fast algorithms give modest reductions at wire speed; stronger ones save more on cold data at higher CPU cost. Already compressed data such as video, archives and encrypted files gains nothing and is detected and stored as is. The compression level may differ by tier: fast for the live path, heavier for archives rewritten later. Each chunk records its algorithm so data can be decompressed years later.",
    k: ["Fast compression versus high ratio: fast keeps backup windows short, while high ratio saves storage and bandwidth on cold data but slows ingest and restore.", "Compress before versus after deduplication: compressing after keeps duplicate detection exact, whereas compressing first would make identical data differ."],
    p: ["Compressing after encryption achieves nothing, since ciphertext looks random.", "Spending heavy compression on incompressible data wastes CPU and lengthens every backup."],
    v: "Compress a text data set and a set of already compressed media, and confirm the first shrinks substantially, the second is stored raw with a marker, and both decompress to identical bytes.",
    dep: ["chunker", "pack-files"]
  },
  "encryption-at-rest": {
    s: "Encrypts every stored chunk so a stolen disk, tape or storage account reveals nothing without the keys.",
    d: "After compression, each chunk or pack is encrypted with an authenticated cipher using a data key, which is itself wrapped by a key held in the key management service. Authenticated encryption detects tampering as well as hiding contents. Encryption can occur at the agent, so even the repository operator never sees plaintext, or at the repository. The consequence of strong encryption is that lost keys mean lost backups, and that encrypted data cannot be deduplicated across keys.",
    k: ["Client-side encryption versus repository-side: client-side keeps data private from the storage operator, but blocks server-side deduplication and scanning.", "One key for everything versus keys per client or tenant: one key is simple to manage, while per-client keys limit damage and enable crypto-shredding, with more keys to protect."],
    p: ["Keys are stored only alongside the backups they protect, so losing the site loses both.", "Reusing a nonce with the same key breaks the cipher's security guarantees."],
    v: "Inspect stored objects with a hex dump to confirm no plaintext appears, tamper with one byte and confirm decryption fails with an authentication error, and confirm restore works using only the escrowed key.",
    dep: ["key-management", "compression", "pack-files"]
  },
  "key-management": {
    s: "Generates, wraps, stores, rotates and escrows the keys that protect backup data, and controls who may use them.",
    d: "A hierarchy keeps few master keys in a hardware-backed service and many data keys derived or wrapped under them. Rotation replaces wrapping keys without re-encrypting all data. Escrow places a recovery copy in a separate custody, such as split among officers, so a disaster that destroys the primary does not destroy the backups. Destroying a tenant's key makes its data unreadable, which is a way to delete quickly. The hard part is custody over decades: key history, access reviews and recovery procedures all must work when the people and systems have changed.",
    k: ["Key service inside the backup system versus an external service: integrated is simple to deploy, but shares fate with the system, while external separates duties and failure at the cost of another dependency.", "Rotate data keys often versus only wrapping keys: frequent data-key rotation limits exposure per key, but implies re-encrypting or tracking many generations."],
    p: ["The key service is recovered from backups that need the key service, and the loop is discovered during a disaster.", "Escrow shares are held by people who leave, and no one can reassemble the key."],
    v: "Rotate the wrapping key, confirm old and new recovery points still restore, then rebuild the key service from escrow in an isolated environment and decrypt a sample.",
    dep: ["secret-store", "identity-and-access"]
  },
  "transport-encryption": {
    s: "Protects data and control traffic between agents, workers, repositories and consoles with authenticated, encrypted channels.",
    d: "Every connection uses TLS with certificates for both ends, so agents prove themselves to the service and the service to agents. Certificates are issued, renewed and revoked automatically, since thousands of endpoints cannot be managed by hand. For data already encrypted at the source, the channel adds authentication and protects metadata. It is hard operationally: expired or untrusted certificates silently stop backups, and inspection proxies may break the channel or expose the data.",
    k: ["Mutual authentication versus server-only: mutual proves each agent's identity and blocks rogue clients, but requires issuing and rotating a certificate to every endpoint.", "Terminating encryption at a gateway versus end to end: a gateway allows inspection and routing, but exposes plaintext or re-encrypts at a trusted point."],
    p: ["Certificates expire on hundreds of agents the same weekend and every backup fails with an obscure handshake error.", "A corporate inspection proxy breaks the pinned connection, and agents on those networks stop reporting."],
    v: "Capture traffic between an agent and the repository to confirm it is encrypted, then present an expired certificate and confirm the connection is refused with a logged reason and an alert.",
    dep: ["identity-and-access", "secret-store", "transfer-protocol"]
  },
  "pack-files": {
    s: "Groups many small chunks into larger containers before storing, to match what disks, tape and object stores handle efficiently.",
    d: "Writing millions of tiny chunks as separate objects would be slow and expensive on most storage. The packer collects processed chunks into containers of tens or hundreds of megabytes, with a header index of the chunks inside and a checksum. Containers are written sequentially and treated as immutable once sealed. Space reclamation later rewrites containers with too many dead chunks. Container size trades parallelism and retrieval granularity against per-object overhead and the cost of fetching a whole container to read one chunk.",
    k: ["Large containers versus small: large ones lower per-object cost and speed sequential reads, but make reading one chunk expensive and reclamation rewrites heavy.", "Immutable sealed containers versus appendable: immutable files are simple to replicate and lock, but need compaction to reclaim space."],
    p: ["An unsealed container lost in a crash drops all its chunks, which the catalog already references.", "Containers sized for tape perform poorly in an object store with per-request costs, or the reverse."],
    v: "Back up a data set, list the stored containers, and confirm sizes fall within the configured range, each with a valid header, and a single-file restore reads only the containers that file needs.",
    dep: ["compression", "storage-driver-interface"]
  },
});
