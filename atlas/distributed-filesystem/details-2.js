// Details for the distributed filesystem plate, part 2: access and compatibility, namespace, coordination.
ATLAS.details("distributed-filesystem", {
  "posix-semantics-layer": {
    s: "The code that maps the standard file interface onto distributed operations: open, read, write, rename, link, permissions and timestamps, and decides which guarantees hold cluster-wide.",
    d: "Programs expect rename to be atomic, writes to be visible after they return, directories to list consistently and timestamps to move forward. This layer implements each call on top of metadata operations, leases and chunk I/O, and documents where it deviates. Cheap calls become costly ones: a stat needs attributes that depend on the latest size, which another client may be extending. The challenge is that full compliance requires coordination on every operation, and compliance tests pass in single-client runs that hide multi-client violations.",
    k: ["Full POSIX semantics versus a documented subset: full compliance runs unmodified software, but forces coordination that limits scale; a subset scales and breaks some programs.", "Precise timestamps and sizes versus lazily updated: precise values are correct for tools like build systems, but cost a metadata round trip on writes."],
    p: ["Software that assumes a rename-then-read sequence is atomic across clients can corrupt state when the filesystem only gives it per-directory atomicity.", "A size reported from cached attributes while another client appends makes tail-following programs miss data."],
    v: "Run a conformance suite from two clients concurrently on shared directories and confirm each deviation from the standard is listed in the filesystem's documentation, with no undocumented failures.",
    dep: ["file-leases", "inode-store", "directory-entries"]
  },
  "user-space-mount": {
    s: "A mount implemented as a user process that receives file requests from the operating system through a stable interface and talks to the cluster, easier to build and update than a kernel module.",
    d: "The operating system forwards each file call to the daemon, which runs the client library and replies. Crashes affect only the daemon, and upgrades need no kernel work. Costs are extra copies and context switches per request, and limits in how the kernel cache and the daemon cache interact. Multi-threaded daemons and large request sizes recover much of the speed. The hard part is behavior under failure: when the daemon hangs, applications blocked on the mount cannot easily be killed.",
    k: ["User-space daemon versus in-kernel client: user space is safer and faster to iterate, but adds overhead per request and a fragile hang mode.", "Letting the kernel cache data versus daemon-only caching: kernel caching is fast and shared with other mounts, but gives the daemon less control over consistency."],
    p: ["A hung daemon leaves every process that touched the mount stuck in uninterruptible waits until the host reboots.", "Small request sizes make each read cross the kernel boundary many times, cutting throughput sharply."],
    v: "Kill and restart the mount daemon under a running workload and confirm the mount recovers or fails with clear errors within a bounded time, and that unrelated processes outside the mount are unaffected.",
    dep: ["client-library", "posix-semantics-layer"]
  },
  "kernel-client": {
    s: "A client built into the operating system kernel that handles file calls directly, sharing the host's page cache for the highest throughput and lowest overhead on dedicated clusters.",
    d: "The kernel module registers as a filesystem, implements the file operations and speaks the cluster protocol itself. It uses the kernel's page cache and writeback machinery, so cached reads cost almost nothing. The price is operational: it ships with specific kernel versions, upgrades need reboots or module reloads, and a bug can crash the host. For large compute clusters where the same kernel runs everywhere, the performance and tight integration are worth it.",
    k: ["In-kernel versus user space: in-kernel is the fastest path and integrates with memory management, but couples the client's release schedule to the operating system.", "Tracking the distribution's kernel versus a maintained out-of-tree module: in-tree gets longer support, but features arrive slowly; out-of-tree is flexible and a burden on operators."],
    p: ["A kernel-version update changes an internal interface and the module fails to load on freshly patched hosts.", "A deadlock in the client under memory pressure freezes the host instead of one application."],
    v: "Run a parallel read and write benchmark against the kernel client and a user-space mount on identical hardware, and confirm the throughput and CPU per byte are the measured advantage claimed.",
    dep: ["client-library", "posix-semantics-layer", "data-cache"]
  },
  "protocol-gateways": {
    s: "Servers that expose the filesystem through standard network file protocols so machines without the native client, including other operating systems, can mount it.",
    d: "A gateway runs the native client library and translates protocol operations into filesystem calls. Several gateways behind one address spread load and provide failover. Standard protocols carry their own locking, caching and identity models, which must be mapped to the cluster's. A gateway adds a hop and often a single-file bottleneck, and the protocol's idea of consistency may be weaker than the native one. The challenge is state: stateful protocols keep open files and locks that must move or be reclaimed when a gateway fails.",
    k: ["Gateways as proxies versus clients talking natively: gateways reach any machine with no software to install, but add latency and cap throughput per mount.", "Active-active gateways versus active-passive: active-active scales, but needs shared lock state; active-passive is simple and wastes capacity."],
    p: ["A gateway failover loses protocol locks and open state, and applications see sudden errors.", "Two gateways with different cache settings let clients see different views of one file."],
    v: "Mount through a gateway, write from there and from a native client alternately, and confirm each sees the other's data within the documented delay; kill the gateway and confirm failover completes within the grace period.",
    dep: ["client-library", "xattrs-and-acl-mapping", "byte-range-locks"]
  },
  "object-gateway": {
    s: "A service that presents files and directories as buckets and objects over HTTP, so applications written for object stores can use the cluster as one namespace.",
    d: "The gateway maps a bucket to a directory tree and an object key to a path, with prefixes becoming directory levels. Puts become atomic file creations by writing a temporary name then renaming. Listing by prefix and delimiter is translated to directory scans. Multi-part upload maps to assembling chunks. Mismatches matter: object stores have flat keys and weak rename, while filesystems have real directories, so keys with many slashes or millions of keys under one prefix behave poorly.",
    k: ["Mapping keys to paths versus flat object storage in a separate pool: paths allow file and object views of the same data, but make prefix operations and rename semantics awkward.", "Atomic put by rename versus direct write: rename hides partial uploads from readers, but costs an extra metadata operation."],
    p: ["A single prefix holding hundreds of millions of keys overloads one directory and makes listing very slow.", "Keys ending in a slash or containing dot segments collide with directory semantics in surprising ways."],
    v: "Upload an object under a deep key, read the same data as a file through the mount, and confirm contents and size match, that a listing by prefix returns the expected keys, and that partial uploads are never visible.",
    dep: ["client-library", "directory-entries", "access-control"]
  },
  "bulk-append-api": {
    s: "A simplified interface for large sequential workloads: files are written once by append, then read many times, which relaxes rules the filesystem would otherwise need to enforce.",
    d: "Programs create a file, append records, close it and never overwrite. Without random writes, there is no need for read-modify-write, simple replication pipelines work well, and consistency reduces to agreeing on append order and the final length. Atomic record append lets many writers add records to one file, each landing at an offset the system chooses. Batch analytics frameworks use this model. The tradeoff is that many general programs cannot run on it, and small appends from many writers fragment files with padding and duplicates.",
    k: ["Append-only files versus random write: append-only makes replication, erasure coding and recovery simpler, but excludes databases and editors.", "System-chosen offsets for concurrent appenders versus client-chosen: system-chosen avoids coordination between writers, but readers must tolerate padding and duplicate records."],
    p: ["A retry after a failed record append writes the record twice, so readers must deduplicate.", "Many tiny appends to one file concentrate load on its last chunk's replicas."],
    v: "Have fifty writers append records concurrently to one file, then read it back and confirm every record appears at least once, none is torn, and all readers see the same order.",
    dep: ["append-coordination", "replication-pipeline"]
  },
  "xattrs-and-acl-mapping": {
    s: "Extended attributes stored with files, and the translation between the cluster's permission model and those of protocols and operating systems that clients and gateways speak.",
    d: "Extended attributes are named byte strings attached to inodes, used for security labels, tags, tiering hints and application metadata. Permission lists differ among systems in inheritance and in how groups and special identities work, so a mapping layer converts them, sometimes losing precision. Attributes live in metadata, so large values or many attributes inflate inode size and slow directory scans. The difficulty is fidelity: two clients on different systems can read the same file and disagree about who may write to it.",
    k: ["Storing attributes in the inode versus a separate store: inline is fast for small attributes, but a few large ones bloat every metadata fetch.", "Strict mapping that refuses ambiguous permissions versus best-effort translation: strict is safe but breaks tools, best-effort works and can grant access unintentionally."],
    p: ["Copying a file between systems drops its attributes or permission entries unnoticed.", "A mapping that is more permissive than the original list exposes data when moving to a new protocol."],
    v: "Set a permission entry and a custom attribute through one protocol, read both through another, and confirm the effective access for three test identities is identical or that the difference is documented.",
    dep: ["inode-store", "access-control"]
  },
  "mmap-support": {
    s: "Support for mapping file ranges into program memory, where loads and stores become file I/O through page faults, a hard case for caches and consistency.",
    d: "A mapped file is read on page faults through the client cache, and dirty pages are written back at unpredictable times. Shared writable mappings across clients need a protocol: either they are unsupported, or the filesystem tracks page ownership and invalidates pages on remote writes. Programs that load executables and libraries use read-only mappings heavily, which matters for startup time on shared installations. The challenge is that memory access has no error return, so a network failure during a fault surfaces as a signal.",
    k: ["Coherent shared writable mappings versus single-writer only: coherence supports parallel programs, but needs page-level lease traffic; single-writer is simple and limits use.", "Read-only mappings from the shared cache versus per-process copies: sharing saves memory, but one eviction affects every mapper."],
    p: ["A transient network failure during a page fault kills the program with a bus error instead of a retried read.", "Two clients writing different parts of the same page overwrite each other's bytes."],
    v: "Map a file read-write on one client, store a value, call sync, and confirm another client sees it; then drop the network briefly during a read fault and confirm the documented failure behavior.",
    dep: ["data-cache", "file-leases", "kernel-client"]
  },
  "posix-relaxations": {
    s: "Deliberate departures from the standard, such as eventual directory visibility, no atomic rename across partitions or ignored access times, taken to remove coordination and scale further.",
    d: "Each relaxation removes a source of synchronous work. Access time updates are skipped or batched, since every read would otherwise write metadata. Hard links may be limited, directory listings may show a consistent view only at close, and close-to-open consistency replaces immediate visibility. Some systems offer per-directory or per-mount modes so applications opt in. The risk is silent: programs that rely on a dropped guarantee usually work in tests and fail rarely in production, so every relaxation needs to be documented where users will find it.",
    k: ["Cluster-wide relaxations versus per-application opt-in: cluster-wide is simple and surprises everyone, while opt-in keeps compatibility and requires users to know the modes.", "Dropping a guarantee entirely versus making it slow but available: dropped is faster, while slow keeps old software correct and invites performance incidents."],
    p: ["A mail or build tool using lock files and rename for coordination breaks when atomicity is relaxed.", "Relaxations documented only in a design doc are discovered by users through data corruption."],
    v: "Run a corpus of representative applications on a mount with each relaxation enabled and confirm each application either passes, or fails with a documented reason that is listed in the compatibility table.",
    dep: ["posix-semantics-layer", "consistency-model"]
  },
  "namespace-tree": {
    s: "The hierarchy of directories and files the cluster presents, held in the metadata service and navigated by path resolution one name at a time.",
    d: "Every name is an entry in a directory, which maps to an inode, and the tree starts at a root. Path resolution walks components, checking permissions at each. Metadata is kept in memory or in an ordered store for speed, with a journal for durability. The tree is the single most contended structure: every client uses it, and operations like rename need to modify several directories atomically. Scale limits come from memory per inode and from how requests on a hot directory can be spread.",
    k: ["Whole namespace in memory versus ordered on-disk store with a cache: memory is fast and bounded by RAM, while disk-backed scales to billions of files with slower misses.", "Hierarchical tree versus flat key space with prefix emulation: a tree has cheap directory operations, flat scales evenly but makes listing and rename expensive."],
    p: ["A namespace that fits in memory today exhausts it on a growth spike and the metadata server cannot restart.", "Deep paths multiply lookups, so applications with long paths feel slow before they feel big."],
    v: "Create a hundred million empty files across a deep tree and confirm lookups, listing and restart time stay within the documented limits, and metadata memory per file matches the sizing guide.",
    dep: ["inode-store", "directory-entries", "metadata-journal"]
  },
  "inode-store": {
    s: "The records holding each file's attributes: size, owner, permissions, times, layout and link count, indexed by an identifier that never changes while the file exists.",
    d: "An inode number identifies the file independent of its names. The record contains mode, owner, size, timestamps, link count, the layout parameters, and either a pointer to the chunk map or the small data itself. It is stored in the metadata partition that owns it, in memory with a persistent backing. Because size and times change with every write, they are the hottest fields; many designs let clients update them lazily. The hard part is balancing record size, since adding fields multiplies memory by the number of files.",
    k: ["Compact fixed-size inodes versus variable records with inline extras: compact is cache-friendly and uniform, while variable avoids extra lookups for xattrs and small data.", "Authoritative size at metadata versus derived from last chunk: metadata size is a quick read, but needs clients to report growth; derived is correct and requires data-node queries."],
    p: ["Reusing an inode number after deletion lets a stale client handle refer to an unrelated new file.", "Lazily updated sizes and times differ between clients and violate tools that compare them."],
    v: "Create a file, write from one client, and confirm stat from another returns the correct size and a modification time within the documented tolerance, and that the inode number is never reused for a later file.",
    dep: ["metadata-journal", "file-chunk-map"]
  },
  "directory-entries": {
    s: "The mapping from names to inode numbers inside one directory, which must support fast lookup, ordered or stable listing and efficient insert and removal.",
    d: "An entry is a name, an inode number and a type. Directories are stored as ordered key ranges (parent plus name) or as hashed tables. A listing reads a range and returns entries in a stable order across paged calls, even when the directory changes between calls. Lookups are by exact name. A very large directory is a challenge since all creators target one structure, and listing must not hold a lock or give inconsistent results while entries come and go.",
    k: ["Keying entries by parent and name in an ordered store versus a per-directory table: ordered keys make listing and range operations cheap and spread across nodes, but lookups depend on the store's depth.", "Stable listing cursors versus snapshot reads: cursors are cheap, but may show or miss concurrent changes; snapshots are exact and cost version tracking."],
    p: ["Paged listing by offset skips or repeats entries when names are removed between pages.", "Case-insensitive lookups added for compatibility make every name comparison slow and ambiguous."],
    v: "List a directory while another client creates and deletes entries in it, and confirm every entry present for the whole listing appears exactly once and no entry appears twice.",
    dep: ["namespace-tree", "inode-store"]
  },
  "file-chunk-map": {
    s: "The record that translates a byte range of a file into chunks, giving each chunk's identifier, version and the servers that hold it. The data path starts here.",
    d: "For each file the metadata service stores an ordered list or tree of chunks, each with an id, a size, a version and the current replica locations. Clients fetch the map for the byte range they need and cache it. When a chunk is written, grows, or is repaired, the map changes. For huge files the map is an indexed structure rather than a flat list. It is hard because it is one of the largest metadata items, and replica locations change often through repair and rebalancing, so cached copies go stale.",
    k: ["Storing replica locations in the map versus computing them from a placement function: stored locations allow flexible placement, but metadata grows and goes stale; computed locations need no storage and constrain placement.", "Reporting locations from storage nodes versus persisting them: reports keep metadata small and always current after restarts, at the cost of a rebuild period after a full restart."],
    p: ["A client using a stale location sends writes to a server that no longer holds the chunk and wastes a full round trip.", "A chunk map larger than metadata memory for a multi-petabyte file makes opening it slow."],
    v: "Open a very large file, read the middle, and confirm the client fetched only the map segment for that range, and that after a replica moves the client's retry succeeds with an updated location.",
    dep: ["inode-store", "chunk-versions", "placement-function"]
  },
  "metadata-journal": {
    s: "A sequential log of every namespace change, written and replicated before the change is acknowledged, from which the in-memory state can be rebuilt after a crash.",
    d: "Each mutation, such as create, rename or chunk allocation, is appended as a record and made durable on several replicas of the log, usually through the consensus log. Only then is the in-memory structure updated and the client answered. After a crash a server replays the journal on top of the latest checkpoint. Batching groups records into one flush to raise throughput. The challenge is the latency of the durable write on every operation, and journal growth that makes restart slow if checkpoints are not taken.",
    k: ["Group commit versus flush per operation: grouping multiplies metadata operations per second, but adds a short wait to each one.", "Journal on fast flash versus on the metadata server's regular disk: flash keeps commit latency low, while disks are cheaper and become the metadata bottleneck."],
    p: ["A journal that is never truncated grows until recovery takes an hour.", "A torn final record after a crash replays as a half-applied operation if records are not checksummed."],
    v: "Create files, kill the metadata server abruptly, restart, and confirm every acknowledged operation is present and no unacknowledged one is half-applied, with recovery completing within the documented time.",
    dep: ["consensus-log", "metadata-checkpoints"]
  },
  "metadata-checkpoints": {
    s: "Periodic on-disk images of the whole metadata state, which limit how much journal must be replayed after a restart and let new standbys catch up quickly.",
    d: "A checkpoint writes the current namespace to a file or store at a known journal position, then older journal entries can be dropped. Taking it must not stall operations: servers copy on write, fork, or let a standby build it. Standbys load the latest checkpoint and then follow the journal. Checkpoints are also the base for backups and metadata snapshots. The difficulty is size and time: a billion-file image takes minutes to write and load, and a failed checkpoint must never replace the last good one.",
    k: ["Checkpoint built on a standby versus on the active server: a standby has no impact on clients, but needs its own capacity and can fall behind.", "Full images versus incremental: full are simple and verifiable, while incremental are cheaper to write and need a chain of files to restore."],
    p: ["Overwriting the old checkpoint in place leaves nothing to recover from if the machine fails mid-write.", "Restart time quietly grows with the namespace until failover exceeds the clients' timeouts."],
    v: "Take a checkpoint under load, delete the journal before it, restart a replica from the checkpoint alone and confirm its state matches the leader's at that position, with the load time recorded.",
    dep: ["metadata-journal", "namespace-tree"]
  },
  "subtree-partitioning": {
    s: "Dividing the namespace into directory subtrees assigned to different metadata servers, with the assignment adjusted over time as load shifts, keeping related names together.",
    d: "Each metadata server is authoritative for some subtrees. Clients learn the mapping and send requests to the owner. A balancer watches per-subtree load and moves or splits hot subtrees by transferring authority, often with the data in memory so the move is quick. Keeping a directory and its children on one server makes common operations local. The difficulty is skew: a single hot directory cannot be split without fragmenting it, and operations that span subtrees need coordination.",
    k: ["Dynamic subtree migration versus static assignment: dynamic follows hot spots, but needs careful handover and generates transient load; static is predictable and drifts out of balance.", "Large subtrees per server versus many small ones: large keeps locality, while many small ones balance well and make renames cross servers more often."],
    p: ["A balancer that reacts to short bursts moves subtrees back and forth and the cluster spends its time migrating.", "Clients with stale mappings keep contacting the old owner, doubling latency until they refresh."],
    v: "Generate a hot subtree workload, observe the balancer move part of it to an idle server, and confirm client operations continue without errors and throughput rises afterwards.",
    dep: ["namespace-tree", "cluster-map", "directory-fragmentation"]
  },
  "hash-partitioning": {
    s: "Assigning metadata to servers by hashing the parent directory or the full name, spreading load evenly with no balancer, at the cost of locality for listings and renames.",
    d: "A hash of the key chooses a partition and the partition maps to a server through the cluster map. Creating many files in one directory is spread across servers when the hash includes the name. Load is uniform without any tracking. Operations that touch several names, such as listing a directory or moving a tree, need to contact many partitions. Resizing means moving partition ownership, usually by using more partitions than servers so only whole partitions move.",
    k: ["Hash of full name versus hash of parent: full name spreads a hot directory but makes listing a fan-out; parent hash keeps directories together and leaves hot ones on one server.", "Many small partitions versus few large: many allow smooth rebalancing, but increase per-partition overhead and cross-partition operations."],
    p: ["Listing a large directory contacts every metadata server and slows with cluster size.", "Hash partitioning makes recursive operations like tree delete or quota accounting much slower than they were."],
    v: "Create a million files in one directory and confirm metadata load is within ten percent across all servers, then measure directory listing time and confirm it matches the documented fan-out cost.",
    dep: ["namespace-tree", "cluster-map"]
  },
  "directory-fragmentation": {
    s: "Splitting one very large directory into pieces that live on different metadata servers, so a directory of hundreds of millions of entries does not become one machine's bottleneck.",
    d: "When a directory exceeds a size or load threshold, its entries are divided by hash range into fragments, each a separate partition with its own server and journal. Lookup hashes the name to find the fragment. Fragments split further as the directory grows and merge when it shrinks. A listing visits fragments in order. The challenge is correctness during splits: lookups, creates and listings must work while entries move, and operations needing a total directory view, such as emptiness checks, need coordination across fragments.",
    k: ["Fragmenting on demand versus always hashed: on demand keeps small directories fast and simple, but needs split machinery; always hashed is uniform and penalizes small ones.", "Storing fragment boundaries in the directory inode versus a global table: in the inode, discovery follows the directory, while a global table is shared and becomes a contention point."],
    p: ["Checking whether a directory is empty before removal races with a create in another fragment.", "A split that crashes halfway leaves entries visible in both pieces or neither."],
    v: "Insert entries into one directory until it fragments, then run concurrent creates, lookups and a listing during the split, and confirm every name is found exactly once and none is lost.",
    dep: ["directory-entries", "hash-partitioning", "consensus-log"]
  },
  "cross-partition-rename": {
    s: "Renaming or linking where source and target directories live on different metadata partitions, which needs a multi-step protocol that stays atomic if either side fails.",
    d: "The operation touches two partitions, so one coordinator runs a two-phase protocol or a single transaction: record intent in both journals, apply the removal and the insertion, then complete. If a server fails midway, recovery reads the intents and finishes or reverses them. Locks on the involved directories and a check for cycles, where a directory is moved into its own descendant, are required. It is slow compared to a local rename, and its rarity makes bugs in it survive for years.",
    k: ["Two-phase commit between partitions versus single owner for both: two-phase works anywhere, but costs several journal writes and blocks on a failed coordinator; a single owner is fast and limits layout.", "Forbid cross-partition directory moves versus supporting them: forbidding is simple and breaks standard tools, supporting needs the full protocol."],
    p: ["A failure between the two phases leaves a file visible in both directories or in neither.", "Concurrent moves of directories into each other's trees create a loop unless a global check is enforced."],
    v: "Rename a file between partitions while killing each involved server at each protocol step in turn, and confirm after recovery that the file exists under exactly one name with its contents intact.",
    dep: ["consensus-log", "metadata-journal", "hash-partitioning"]
  },
  "metadata-standby": {
    s: "Hot copies of a metadata server's state that follow its journal and take over quickly when it fails, so the namespace is unavailable for seconds rather than minutes.",
    d: "Standbys receive the journal as it is committed and apply it to their in-memory state, so when the leader fails they are nearly current. A health detector and election pick a new leader, which first fences the old one, then starts serving after catching up on the last records and confirming client sessions. Read-only operations can be served from standbys with some staleness. The challenge is split brain and replay time: a leader that is merely slow must not continue to accept writes.",
    k: ["Hot standby applying the journal continuously versus cold restart from checkpoint: hot failover takes seconds, but costs the memory and CPU of full replicas.", "Serving stale reads from standbys versus leader only: spreads read load, but breaks read-your-writes unless clients carry a position."],
    p: ["A paused leader wakes after failover and accepts writes alongside the new one, forking the namespace.", "A standby lagging far behind takes minutes to catch up when needed urgently."],
    v: "Kill the leader under write load and confirm a standby serves within the stated failover time, every acknowledged write is present, and the old leader is refused if it returns.",
    dep: ["leader-election", "metadata-journal", "fencing-tokens"]
  },
  "leader-election": {
    s: "The protocol by which metadata servers agree on exactly one active leader at a time, using terms or epochs so that older leaders are recognized and ignored.",
    d: "Members vote by majority in numbered terms. A candidate that gains a majority becomes leader and starts sending heartbeats; followers that miss them after a randomized timeout start an election. Because two majorities overlap, there is never more than one leader in a term. The leader's lease on that role is bounded by clocks or by continuing heartbeat acknowledgments. The trouble is tuning: short timeouts recover fast but trigger needless elections under load, while long ones leave the namespace unavailable after a real failure.",
    k: ["Randomized election timeouts versus fixed priority: randomization avoids ties without configuration, but is slower in the rare collision; priority is fast and creates favorite machines.", "Pre-vote check before an election versus direct: pre-vote stops a partitioned node from disrupting a healthy leader, at the cost of one extra round."],
    p: ["A network hiccup on a loaded cluster causes elections repeatedly and a flapping leader.", "A leader that keeps its role by stale clock reasoning acts after losing its majority."],
    v: "Partition the leader from the majority and confirm the majority elects a new leader in the stated time, the isolated one stops acknowledging writes, and no two writes conflict after the partition heals.",
    dep: ["consensus-log", "membership-and-heartbeats", "clock-sync"]
  },
  "consensus-log": {
    s: "A replicated, ordered log kept on a small group of servers so that metadata changes, configuration and membership survive any minority of failures and every replica applies them in the same order.",
    d: "The leader appends a command, sends it to followers and commits it once a majority has persisted it. All replicas apply committed commands in order to the same state machine. Membership changes go through the log too. It keeps the metadata service consistent but is a throughput ceiling, since all writes pass through one leader, so large systems run many independent groups, one per partition. The difficulty is the details: configuration changes, log compaction, slow replicas and disk latency on the commit path.",
    k: ["One group for all metadata versus many small groups: one group is simple and caps throughput; many groups scale writes and need coordination for cross-group operations.", "Majority writes versus waiting for all replicas: majority tolerates slow or failed members, and lets a lagging replica fall far behind."],
    p: ["A group of two or four members cannot tolerate failures the operator expects it to.", "Slow disk on the leader raises latency for every operation in the cluster."],
    v: "Stop a minority of replicas and confirm commits continue; stop a majority and confirm writes block rather than commit; restart them and confirm all logs converge to identical contents.",
    dep: ["rpc-layer", "membership-and-heartbeats"]
  },
  "consistency-model": {
    s: "The promise about what one client sees after another's write: strong, close-to-open, or eventual, chosen per operation type and documented as a contract applications can rely on.",
    d: "Metadata operations are linearizable at the leader of the owning partition. Data consistency depends on caching: with leases a reader sees every completed write, with close-to-open a reader sees the data only after the writer closes and the reader opens, and with timeouts a reader may see old data for a bounded time. Systems often give stronger guarantees on metadata than on data. The challenge is stating the contract precisely, because applications tend to depend on whatever they observe in testing.",
    k: ["Strong consistency via leases versus close-to-open: strong gives local-disk behavior, but needs coordination on every shared access; close-to-open scales and surprises programs that poll.", "Per-file consistency versus cluster-wide ordering: per-file is cheap and sufficient for most uses, while cluster-wide order across files needs extra machinery."],
    p: ["An application using one file to signal another, with data written elsewhere, reads old data because only per-file order is promised.", "Documentation that says consistent without naming the model leaves users assuming the strongest one."],
    v: "Run a litmus test of writers and readers on separate clients, and confirm every observed history is allowed by the documented model and that violations of the stronger model appear only where the contract allows them.",
    dep: ["file-leases", "consensus-log"]
  },
  "file-leases": {
    s: "Time-limited rights granted to a client to cache a file's data or attributes, or to write it exclusively, which the server can recall and which lapse on their own if the client disappears.",
    d: "A read lease lets many clients cache; a write lease gives one client exclusive caching and buffering. The server records holders, and when a conflicting request arrives it recalls leases, waits for acknowledgment or expiry, then grants the new one. Clients renew leases periodically with their session. Lease duration trades recall traffic against how long a dead holder blocks others. The challenge is time: expiry decisions rely on clocks running at nearly the same rate, and the client must stop using a lease slightly before the server considers it expired.",
    k: ["Short leases versus long: short leases let a failed client's files free up quickly, but cost more renewals; long leases are cheap and stall conflicting users after a crash.", "Per-file leases versus per-directory: per-directory is cheap for scanning many files, but causes false conflicts between unrelated files."],
    p: ["A client paused for garbage collection resumes and writes under a lease the server already gave away.", "Lease renewals piled on one metadata server after a restart cause a storm of simultaneous requests."],
    v: "Grant a write lease, freeze the holder past expiry, let another client write, then resume the first and confirm its stale writes are rejected and the second client's data is intact.",
    dep: ["client-sessions", "clock-sync", "fencing-tokens"]
  },
  "lock-delegations": {
    s: "Handing a client authority over a whole file or directory's locking and opens, so it can serve repeated operations locally until another client asks for the same object.",
    d: "When only one client uses a file, the server delegates it: the client handles opens, locks and attribute changes without contacting the server and keeps a list to report later. When a second client appears, the server recalls the delegation, and the first client reports its state and returns it. This cuts metadata traffic for private files, such as home directories. The risk is in recall: a slow or unreachable holder blocks newcomers, and state held only by the delegate is lost if it crashes before reporting.",
    k: ["Delegation of whole objects versus case-by-case locking: delegation removes nearly all server traffic for private data, but makes recall latency matter and hides state on clients.", "Recalling on any conflict versus only on write conflict: recalling on any is simple, while recalling only on writes keeps shared reads fast."],
    p: ["A delegate crashes holding unreported lock state and other clients see locks they thought were released.", "Delegations granted too eagerly turn the first access by a second client into a long wait."],
    v: "Open a file from one client, confirm repeated opens cause no server requests, then open it from a second client and confirm the first is recalled and the second proceeds within the recall time.",
    dep: ["file-leases", "client-sessions"]
  },
  "byte-range-locks": {
    s: "Advisory or mandatory locks on parts of a file, held through the metadata service so processes on different machines can coordinate access to shared data.",
    d: "A lock request names a file, a range and a mode, shared or exclusive. The server tracks held locks per file, grants compatible ones, queues conflicting ones and detects obvious deadlocks. Locks belong to a client session and vanish when it expires, so a crashed client does not hold them forever. Locks are advisory by default: they stop only programs that ask. The hard parts are scale, since a lock table for millions of files costs memory, and failover, since the lock state must be rebuilt or reclaimed after a metadata server change.",
    k: ["Locks kept on the metadata server versus delegated to clients: server-side is simple and authoritative, while delegation reduces traffic for non-contended locks and complicates recovery.", "Reclaim window after failover versus dropping all locks: a reclaim window lets clients restore locks and blocks new ones briefly, while dropping is fast and violates holders' assumptions."],
    p: ["After metadata failover a new client takes a lock that the old holder still believes it has.", "Locks that are advisory give a false sense of safety to programs that do not check them."],
    v: "Take exclusive locks from two clients on overlapping ranges and confirm the second waits; kill the first client and confirm the lock is released after its session expires and the second proceeds.",
    dep: ["client-sessions", "metadata-standby"]
  },
  "fencing-tokens": {
    s: "Monotonically increasing numbers attached to leases and leadership, which storage nodes check so that a client or server that has lost its right cannot still modify data.",
    d: "Each new lease or leadership term gets a larger token. Writes carry the token, and a storage node rejects any write whose token is lower than the highest it has seen for that chunk or file. This defends against a delayed or paused former holder, where timing-based expiry alone cannot, because the stale holder cannot know it expired. The check costs a small amount of state per chunk. It is hard to apply uniformly, since every path that mutates data must carry and verify the token.",
    k: ["Token checked at storage nodes versus trusting expiry: node checks are safe against pauses and clock errors, but require every writer and node to implement them.", "Token per file versus per chunk or per cluster epoch: per-chunk is precise and costs state at nodes, while a cluster epoch is cheap and invalidates everything on any change."],
    p: ["A path that writes data without a token, such as a repair or a gateway shortcut, undoes the protection.", "Tokens stored only in memory reset after a node restart and accept stale writes."],
    v: "Pause a lease holder past expiry, let a second client write with a higher token, then resume the first and confirm the storage nodes reject its writes with a stale token error.",
    dep: ["leader-election", "chunk-versions"]
  },
  "client-sessions": {
    s: "A renewable relationship between a client and the cluster that scopes its leases, locks, open files and retry state, so all of it can be cleaned up when the client vanishes.",
    d: "A client establishes a session with an identity and renews it by regular messages. The metadata service ties leases, locks, quota allowances and recent-reply records to the session. If renewals stop for the session timeout, it expires and all attached state is released. Sessions survive a metadata failover by being recorded in the journal, and clients reconnect within a grace period. The balance is the timeout: too short expels clients under load or brief network trouble, too long keeps dead clients' locks.",
    k: ["Session-wide renewal versus per-lease renewal: one renewal covers thousands of leases cheaply, but expiry becomes all or nothing for the client.", "Persisting sessions in the journal versus memory only: persisted sessions survive failover without clients losing state, but add a journal write on connect and renewal."],
    p: ["Under heavy load renewals are delayed, the session expires, and a healthy client is evicted with dirty data unflushed.", "A client that reconnects after expiry without noticing continues using locks that are gone."],
    v: "Disconnect a client holding locks and leases, wait past the session timeout, and confirm they are all released, and that on reconnect the client is told its session ended instead of silently continuing.",
    dep: ["consensus-log", "clock-sync"]
  },
  "append-coordination": {
    s: "Deciding where concurrent appends land and when file length is final, so many writers can add to one file without overwriting each other.",
    d: "For atomic record append, the primary replica of the last chunk assigns offsets in arrival order and forwards the same offset to the other replicas. If the record does not fit in the chunk, the chunk is padded and the client retries on a new one. File length is established by the metadata service when chunks are sealed. Failures create duplicates and gaps readers must tolerate. The challenge is keeping replicas identical when a write succeeds on some copies and fails on others.",
    k: ["Primary-assigned offsets versus client-chosen: primary-assigned permits many writers without locks, but makes the primary replica a hot spot.", "Sealing the chunk after a failed append versus repairing in place: sealing is simple and wastes space, repairing keeps files compact and needs replica reconciliation."],
    p: ["A retried append after an ambiguous failure produces two copies of the same record.", "Padding at chunk boundaries wastes space proportional to record size for large records."],
    v: "Run many concurrent appenders while killing one replica of the last chunk, and confirm that all replicas of each sealed chunk are identical afterwards and every acknowledged record appears.",
    dep: ["replication-pipeline", "chunk-versions", "file-chunk-map"]
  },
});
