// Details for the distributed filesystem plate, part 1: operations, data management, client.
ATLAS.details("distributed-filesystem", {
  "metrics-and-dashboards": {
    s: "Time series from every client, metadata server and storage node, with dashboards for latency, throughput, repair backlog and capacity so operators see trends before users complain.",
    d: "Each daemon exports counters and histograms: operation rates and latency percentiles per operation type, queue depths, cache hit ratios, bytes repaired and disk utilization. A collector scrapes or receives them and stores them with labels for node, rack and tenant. Dashboards combine them into the few views that matter: client-visible latency, under-protected chunk count, and imbalance between disks. The difficulty is cardinality and aggregation: per-file or per-client labels explode storage, and averages hide the slow tail that clients actually feel.",
    k: ["Percentile histograms versus averages: histograms expose tail latency from one slow disk, but cost more memory and need consistent bucket boundaries to aggregate.", "Labels per tenant versus per node only: tenant labels explain who caused load, but multiply series count with every new tenant."],
    p: ["Dashboards built on cluster-wide averages stay green while one rack serves requests ten times slower.", "Metrics emitted only by the node that is failing disappear exactly when they are needed."],
    v: "Throttle one disk with an injected delay and confirm within a minute that the dashboard shows that node's tail latency rising while the cluster average barely moves.",
    dep: ["membership-and-heartbeats"]
  },
  "health-checks-and-alerts": {
    s: "Rules that turn metrics and probes into pages and tickets: under-protected data, full disks, stalled repair, slow metadata operations and clients that cannot reach a quorum.",
    d: "Alerts are defined on symptoms users and the cluster itself care about, such as chunks below target redundancy for more than an hour, rather than on single-node causes. Synthetic probes write, read and delete a small file continuously from several places so the filesystem is measured as a client sees it. Rules carry severity, a runbook link and a suppression window during planned work. The hard part is signal quality: with thousands of disks something is always failing, so alerts must separate routine loss from loss that threatens data.",
    k: ["Symptom alerts versus cause alerts: symptoms page only when users or durability are at risk, but they fire later and say less about where to look.", "Synthetic end-to-end probes versus server-side metrics: probes catch what the daemons cannot see about themselves, but add load and cover only the paths they exercise."],
    p: ["An alert on every failed disk trains the on-call to ignore pages, including the one that matters.", "A probe that always uses the same directory never notices a failing metadata partition elsewhere."],
    v: "Stop all copies of a test chunk in a staging cluster and confirm a lost-data alert fires within its stated time, naming the file set affected and linking the runbook.",
    dep: ["metrics-and-dashboards", "repair-queue"]
  },
  "capacity-forecasting": {
    s: "Projection of when space, inodes, metadata memory and network will run out, accounting for replication overhead, repair headroom and the lead time to buy and install hardware.",
    d: "Raw capacity is divided by the redundancy factor, then reduced by headroom reserved for repair after a failure and for rebalancing. Growth is fitted from usage history per tenant and tier, with separate tracking for metadata, which can run out before data does. The forecast produces a date by which new racks must be racked, given procurement time. It is hard because usage is bursty, deletions lag behind because of snapshots and trash, and a cluster near full behaves badly: repair and rebalancing need free space to run at all.",
    k: ["Usable capacity measured after repair headroom versus raw: operators see the real runway, but the number looks smaller than the hardware inventory suggests.", "Per-tenant growth models versus cluster totals: tenant models show who is driving growth, at the cost of many noisy fits."],
    p: ["Forecasting only data bytes lets the metadata service exhaust memory or inode counts first.", "Running above about eighty percent full leaves no room to rebuild after a rack failure."],
    v: "Compare the forecast from three months ago with actual usage and confirm the predicted exhaustion date was within an agreed margin, and that headroom after a simulated rack loss stays positive.",
    dep: ["metrics-and-dashboards", "quotas"]
  },
  "audit-and-access-logs": {
    s: "A durable record of who accessed or changed which names and when, kept apart from operational logs so security reviews and incident investigations can rely on it.",
    d: "Metadata servers see every namespace operation, so they emit structured events for opens, creates, deletes, renames, permission changes and administrative actions, with the authenticated identity, client address and result. Events are batched to a separate append-only store so that a busy cluster does not slow its own operations to log them. Data reads that never touch metadata, because of caching or leases, are harder to attribute. Volume is the difficulty: logging every read of a hot file is enormous, so systems sample or log at open rather than per byte.",
    k: ["Log at open and lease grant versus per read: volume stays manageable, but individual reads under a cached lease are invisible.", "Synchronous audit write versus buffered: synchronous guarantees no unlogged operation, but adds latency and ties availability to the log store."],
    p: ["Logs held only on the metadata server vanish with the disk that fails, along with the evidence.", "Recording identity as a client machine rather than an authenticated user makes logs useless for investigations."],
    v: "Rename a file as a known user, then query the audit store and confirm one event with that identity, both old and new names, the client address and a timestamp within seconds.",
    dep: ["service-authentication", "access-control"]
  },
  "rolling-upgrades": {
    s: "Upgrading servers a few at a time while the filesystem keeps serving, ordered so no placement group or metadata quorum loses more members than it can tolerate.",
    d: "An orchestrator picks a batch of nodes that share no failure domain with each other, drains or pauses them, restarts them on the new version, waits until they report healthy and have caught up on missed writes, and then moves on. Metadata servers go one at a time, starting with standbys, then the leader. Between batches it checks that repair backlog is empty. The challenge is that every restart looks like a failure to the rest of the cluster, so detection timeouts and repair triggers must be held back or the upgrade itself starts mass re-replication.",
    k: ["Batch by failure domain versus fixed fraction: domain-aware batches keep redundancy intact, but make the upgrade slower on clusters with few racks.", "Pausing repair during a restart versus letting it run: pausing avoids needless copying, but a real failure during the window goes unrepaired longer."],
    p: ["Upgrading both replicas of the same chunk's remaining healthy copies together can briefly make data unavailable.", "A new version that fails its health check after the third batch leaves a cluster split across versions with no rollback plan."],
    v: "Run an upgrade on a staging cluster under continuous client load and confirm zero failed client operations, no chunk dropping below its quorum, and every node on the new version at the end.",
    dep: ["mixed-version-compatibility", "node-lifecycle", "failure-domain-tree"]
  },
  "mixed-version-compatibility": {
    s: "The rules that let servers and clients of adjacent versions work together, covering wire protocol, on-disk formats and metadata journal records during the weeks an upgrade takes.",
    d: "Every message and persistent structure carries a version, and new code must read old formats and, until the rollout is finished, write formats old code can still read. New features are gated behind a cluster-wide flag turned on only after every node runs the new binary. Clients are the hardest group, since they upgrade on the application owners' schedule and can lag by years. The cost is test matrix size and code that must keep old formats alive long after they are unwanted.",
    k: ["Feature flags enabled after full rollout versus enabling per node: a cluster-wide switch is simple to reason about, but one stuck node blocks every new feature.", "Supporting N-2 client versions versus forcing upgrade: longer support spares application teams, but multiplies the compatibility code the servers carry."],
    p: ["Writing a new journal record format before all standbys can read it makes a failover to an old standby unreadable.", "Dropping an old protocol field removes compatibility for a client nobody knew was still deployed."],
    v: "Run a cluster with servers on version N and N+1 and clients on N-1 through N+1 and confirm a full read, write and rename test passes in every pairing.",
    dep: ["rpc-layer", "metadata-journal"]
  },
  "node-lifecycle": {
    s: "The procedures for adding, draining, replacing and retiring servers and disks so capacity changes without losing protection or surprising clients.",
    d: "New nodes register, receive an identity and begin accepting chunks gradually. Draining marks a node as leaving: no new placement lands there, its chunks are copied elsewhere using normal repair, and only after every chunk is safely replaced is the node removed. Disk replacement handles the narrower case of one device. Each state, such as joining, active, draining and retired, is recorded by the metadata service so decisions survive restarts. The hard part is doing this at scale: draining a rack means moving petabytes while the system keeps its protection target.",
    k: ["Drain by copying out before removal versus removal then repair: draining never drops redundancy, but takes longer and needs spare capacity first.", "Gradual ramp of new nodes versus immediate full weight: a ramp avoids a thundering herd of writes to empty disks, but delays the benefit of added capacity."],
    p: ["Removing a draining node before its last chunk is confirmed elsewhere turns a planned change into data loss.", "Reusing a node name after replacement can resurrect stale chunks that the cluster has already re-created."],
    v: "Drain a node holding known chunks, then verify from the metadata service that every chunk has its full redundancy on other nodes before the node is marked retired and powered off.",
    dep: ["membership-and-heartbeats", "re-replication", "rebalancer"]
  },
  "admin-api-and-cli": {
    s: "The authenticated interface through which operators and automation inspect and change cluster state, such as pools, quotas, node states and repair settings, with every change recorded.",
    d: "A small, versioned API fronts the metadata and cluster services, with a command-line tool and sometimes a web console on top. It exposes read operations for state and write operations for pools, policies, quotas, tenants and node transitions. Changes pass through the same consensus log as other metadata so they are ordered and survive failover. Because commands can move or delete large amounts of data, dangerous ones need confirmation, dry runs or role separation. The difficulty is making operations idempotent so a retried command does not apply twice.",
    k: ["Declarative desired state versus imperative commands: declared state is repeatable and reviewable, but surprising changes can follow from a small edit to a policy file.", "Dry-run output showing affected data volume versus trusting the operator: dry runs prevent accidents, but computing the effect on a huge namespace can be slow."],
    p: ["A command to remove a pool that does not check whether files still reference it orphans the data.", "A script that retries a non-idempotent command after a timeout applies it twice."],
    v: "Issue a policy change through the CLI twice with the same request identifier and confirm the audit log shows one applied change and one no-op, and the new policy is visible on every metadata server.",
    dep: ["consensus-log", "service-authentication"]
  },
  "config-distribution": {
    s: "How cluster-wide settings reach every daemon and client: a versioned configuration held centrally, pushed or polled, applied atomically where needed and rolled back when it misbehaves.",
    d: "Settings such as repair rate limits, placement rules and timeouts are stored in the replicated metadata service with a version number. Daemons receive them on heartbeat or by subscription and apply them at a safe point. Some settings can change live, others need a restart. Local overrides exist for debugging but are reported so operators can see drift. The hard part is partial application: if half the nodes apply a new timeout, behavior across the cluster is inconsistent in ways that look like a bug.",
    k: ["Central versioned config versus per-node files: central config guarantees one truth and fast rollback, but makes the config service a dependency of every daemon.", "Staged rollout of a setting versus instant everywhere: staging limits blast radius from a bad value, at the cost of a period when nodes disagree."],
    p: ["A repair rate raised cluster-wide during an incident is never lowered again and starves clients for weeks.", "A node that misses updates because it was down starts with stale config and no warning."],
    v: "Change a timeout through the config service and confirm every daemon reports the new version within one heartbeat interval, and that a node restarted afterwards also reports it.",
    dep: ["consensus-log", "membership-and-heartbeats"]
  },
  "snapshots": {
    s: "Read-only point-in-time views of a directory tree, created instantly by recording versions of metadata and keeping the chunks they reference rather than copying data.",
    d: "Creating a snapshot records a version marker in the metadata of a subtree. Later writes use copy-on-write at chunk granularity, so the old chunk stays referenced by the snapshot while the live file points to a new one. Deleting a snapshot drops references and frees chunks no longer shared. Reading a snapshot resolves names and chunk maps as of its marker. The difficulty is metadata cost and reference accounting: many snapshots multiply versions, and finding which chunks are exclusively held by one snapshot is needed to report space it frees.",
    k: ["Copy-on-write of chunks versus copying data at snapshot time: creation is instant and cheap, but later overwrites cost extra writes and fragment files.", "Per-subtree snapshots versus whole-filesystem: subtree snapshots let tenants manage their own, but complicate cross-directory renames that straddle two snapshot roots."],
    p: ["Hundreds of snapshots on a heavily rewritten directory make metadata operations slower and space reporting unreliable.", "Deleting a file and expecting space back, while a snapshot still references it, surprises users and quotas."],
    v: "Snapshot a directory, overwrite and delete files in it, then read the snapshot and confirm original contents byte for byte, and that deleting the snapshot returns only the space no other reference holds.",
    dep: ["file-chunk-map", "chunk-versions", "metadata-journal"]
  },
  "clones": {
    s: "Writable copies of a file or tree that share chunks with the original until either changes, so a large dataset can be duplicated for experiments in seconds.",
    d: "A clone creates new inodes whose chunk maps point at the same chunks as the source and bumps reference counts. A write to either side allocates a new chunk for the changed range and updates only its own map, leaving the other untouched. Directory clones copy the namespace subtree lazily. Cloning is the same mechanism as snapshots made writable. The hard part is reference counting at scale: counts must stay exact across failures, and a chunk shared by thousands of clones becomes a hot spot for reads.",
    k: ["Lazy subtree cloning versus eager copy of metadata: lazy is instant for huge trees, but pushes cost into later first access of each directory.", "Per-chunk reference counts versus lineage trees: counts are simple and local, but lineage makes it easier to explain space use at the price of complex deletion."],
    p: ["Losing a reference count update frees a chunk that clones still use, causing silent data loss.", "A heavily read shared chunk concentrates traffic on its few replicas."],
    v: "Clone a one-terabyte file, modify one block in the clone, and confirm that the clone creation took seconds, added about one chunk of space, and the original reads back unchanged.",
    dep: ["snapshots", "file-chunk-map"]
  },
  "quotas": {
    s: "Per-user, per-directory or per-tenant limits on bytes and file counts, enforced at the metadata service and charged on allocation so one tenant cannot consume the cluster.",
    d: "Counters are kept per quota subject in the metadata service. Creating a file charges an inode, and allocating or growing a chunk map charges bytes, both checked before the operation succeeds. Clients may be granted batches of allowance so they can write without a round trip each time. Hard limits refuse operations; soft limits warn and allow a grace period. It is difficult in a distributed design because counters span metadata partitions, and charging must handle renames across quota boundaries and the reduced accuracy of cached allowances.",
    k: ["Enforcing at allocation versus periodic audit: allocation checks are exact, but add metadata work to every write, while audits are cheap and can overshoot.", "Charging logical bytes versus raw bytes after replication: logical charges are simple for users, but hide that erasure coded data costs less than copies."],
    p: ["A rename moving a tree into a directory with a smaller quota is allowed without recharging, breaking the limit.", "Allowance batches held by dead clients are never returned, so the tenant appears full while empty."],
    v: "Set a one-gigabyte limit on a directory, write until refused, then confirm the error is a quota error, usage reads within one chunk of the limit, and deleting files restores the ability to write.",
    dep: ["inode-store", "client-sessions"]
  },
  "tiering-policies": {
    s: "Rules that move data between fast and cheap storage, or between replicated and erasure coded form, based on age, access pattern or explicit tags, without changing file names.",
    d: "A policy engine scans metadata for candidates, such as files unmodified for thirty days, and schedules background jobs that rewrite their chunks onto a cheaper pool or encoding. The chunk map is updated atomically when the new copy is complete, and the old chunks are queued for deletion. Reads are served from whatever tier currently holds the data, sometimes with a recall step. It is hard because scanning a namespace of billions of files is itself expensive, and moving data competes with the foreground work it is meant to help.",
    k: ["Age-based policy versus access-based: age is cheap to evaluate, but moves files that are about to be read; access tracking is accurate but needs per-file counters.", "Transparent recall on read versus explicit restore: transparent keeps applications unchanged, but a read can stall for minutes on a cold tier."],
    p: ["A policy applied to a hot directory by mistake moves live data to slow media and breaks latency targets.", "Moving files before their last snapshot expires duplicates data instead of saving space."],
    v: "Age a test file past the policy threshold and confirm its chunks are rewritten onto the cheaper pool, the file name and contents are unchanged, and the old chunks are removed from the hot pool.",
    dep: ["file-chunk-map", "erasure-coding", "replica-to-ec-conversion"]
  },
  "qos-throttling": {
    s: "Limits and priorities that share disk and network bandwidth between tenants, jobs and background work, so a heavy user or a repair does not starve everyone else.",
    d: "Rate limits are applied per tenant, per client or per job, in operations per second or bytes per second, usually with token buckets and a burst allowance. Storage nodes enforce them in their I/O queues, while clients or gateways enforce admission earlier. Classes with weights share spare capacity. Background work such as repair runs in a lower class. The difficulty is distributed enforcement: a tenant's I/O spreads over many nodes, so global limits are approximated by dividing a budget across nodes that see uneven traffic.",
    k: ["Enforcement at storage nodes versus at clients: node enforcement cannot be bypassed, but rejected work has already crossed the network; client enforcement is cheaper and trusts the client.", "Hard caps versus weighted shares: caps give predictable isolation, but leave idle capacity unused that shares would hand out."],
    p: ["A per-node share of a tenant limit leaves the tenant throttled on a quiet node while another node is overloaded.", "Throttling only reads lets a heavy writer fill queues and still starve others."],
    v: "Run a heavy tenant and a latency-sensitive tenant together and confirm the second keeps its target latency while the first is held to its cap, and that the cap releases when the second goes idle.",
    dep: ["io-scheduling", "client-sessions"]
  },
  "geo-replication": {
    s: "Asynchronous copying of namespaces and data to another site for disaster recovery or local reads, with ordering and conflict rules chosen explicitly.",
    d: "A replicator tails the metadata journal at the source, reads changed chunks and applies the same operations at the target, preserving order within a directory subtree. Lag is measured in seconds to minutes. The target may be read-only until failover, or active for a disjoint subset of the namespace. On failover, writes not yet shipped are lost or must be reconciled. The hard part is conflicts and partial failure: replaying renames and deletes in order across a slow link, and resuming after interruptions without reapplying changes.",
    k: ["Asynchronous replication versus synchronous across sites: asynchronous keeps write latency local, but allows a recovery point gap; synchronous removes the gap and adds wide-area round trips.", "Journal shipping versus periodic snapshot diff: journal shipping gives low lag, snapshot diffs are simpler to resume but slower to converge."],
    p: ["Promoting the target during a failover without checking lag silently discards the last minutes of writes.", "A replication loop between two writable sites with no ownership rule makes conflicting edits ping-pong."],
    v: "Write a set of files at the source, then confirm the target shows identical names and checksums within the stated lag, and that after a forced failover test the loss is no more than the measured lag.",
    dep: ["metadata-journal", "snapshots", "rpc-layer"]
  },
  "access-control": {
    s: "Permissions on names and data: owners, groups, access control lists and tenant boundaries, checked by the metadata service and carried to storage nodes as signed capabilities.",
    d: "Metadata holds mode bits and lists per inode, and path resolution checks execute permission on every directory. Because data is read directly from storage nodes, the metadata service issues short-lived signed capabilities naming the chunks and rights, which nodes verify without calling back. Identities are mapped from external directories at the client or gateway. The difficulty is staleness and mapping: revoking access cannot reach a capability already issued until it expires, and user identities differ across protocols.",
    k: ["Signed capabilities versus node-side permission lookup: capabilities keep the data path fast, but revocation waits for expiry; lookups revoke instantly at the cost of a metadata call.", "Numeric identities versus names: numbers match local conventions and are cheap, but need consistent mapping across clients and gateways."],
    p: ["A long capability lifetime lets a removed user keep reading chunks for hours.", "Inconsistent identity mapping between gateway and mount gives the same person different permissions on the same file."],
    v: "Remove a user's access to a file, wait out the capability lifetime, and confirm reads through every protocol fail, while the user's other files remain accessible and the denial appears in the audit log.",
    dep: ["inode-store", "service-authentication"]
  },
  "encryption-at-rest": {
    s: "Encrypting chunks on disk with per-file or per-volume keys held by a key service, so stolen drives or decommissioned servers reveal nothing.",
    d: "Data is encrypted by the client or the storage node with a data key that is itself wrapped by a key held in an external key service. Per-file keys let a tenant be cryptographically erased by destroying its key. Where encryption is client side, storage nodes never see plaintext, but cannot deduplicate or verify content. Key rotation rewraps data keys without rewriting data. The difficulty is key availability: if the key service is unreachable the cluster cannot start reading, and recovery depends on key backups held separately.",
    k: ["Client-side encryption versus node-side: client side protects against a compromised server, but prevents server-side repair that needs to read and compare content.", "One key per file versus per tenant: per file allows precise erasure and limits damage, but multiplies key storage and wrapping calls."],
    p: ["Losing the only copy of a wrapping key makes entire datasets permanently unreadable.", "Encrypting after compression on the client but before checksums on the node can mismatch what scrubbing expects."],
    v: "Pull a disk from a node and confirm no plaintext file contents are findable on it, then rotate the wrapping key and confirm all data remains readable without being rewritten.",
    dep: ["service-authentication", "local-chunk-store"]
  },
  "trash-and-undelete": {
    s: "Deleted names are moved to a hidden holding area for a retention period, so accidental removal can be undone and the filesystem does not free space instantly.",
    d: "A delete moves the inode into a per-user or per-tenant trash namespace and records the original path and time. Space is still charged. A background sweeper permanently removes entries older than the retention window, which releases chunk references for the garbage collector. Restore moves the entry back, resolving name collisions. It is hard at scale because bulk deletes of millions of files arrive as a metadata storm, and users who delete data to free space find nothing changed.",
    k: ["Retention with sweep versus immediate deletion: retention protects against mistakes, but delays space recovery and makes full clusters harder to fix.", "Per-user trash versus global: per-user keeps restore simple and private, but fragments the cleanup work across many directories."],
    p: ["Emptying a filesystem that is nearly full does nothing until the retention window passes.", "A recursive delete of a huge tree creates millions of trash entries that overload one metadata partition."],
    v: "Delete a file, confirm it disappears from its directory but shows in trash with its original path, restore it and read back identical contents, then confirm an untouched deleted file is removed after the retention window.",
    dep: ["namespace-tree", "orphan-chunk-gc"]
  },
  "client-library": {
    s: "The code on each application host that translates file operations into metadata requests and parallel chunk transfers, and holds the caches and leases that make that fast.",
    d: "It opens connections to the metadata service and storage nodes, resolves paths, fetches chunk maps, and sends reads and writes directly to the nodes holding the data so bulk traffic bypasses metadata servers. It keeps state per open file: lease, cached attributes, buffered writes and the checksum context. It may be a library linked into the application, a user-space daemon behind a mount, or a kernel module. The challenge is that clients are numerous, run with different versions and failure behavior, and must handle every server failure without corrupting what the application sees.",
    k: ["Direct data transfer to storage nodes versus proxying through servers: direct scales with the number of nodes, but gives clients more responsibility for retries and consistency.", "Thick client with logic versus thin client with server logic: a thick client reduces server load, but is costly to upgrade and harder to secure."],
    p: ["A client holding a stale cluster map keeps sending writes to a node that has been replaced.", "A bug in a widely deployed client library takes down every application at once."],
    v: "Write a file through the client while killing a storage node mid-transfer and confirm the application sees a complete successful write or a clear error, and a fresh client reads back the full contents.",
    dep: ["cluster-map", "rpc-layer", "file-chunk-map"]
  },
  "metadata-cache": {
    s: "Client-side caching of attributes, directory listings and name lookups, with a lifetime or lease so repeated metadata calls avoid a round trip to the namespace service.",
    d: "After a lookup or stat the client remembers the result, along with negative results for names that do not exist. Entries are valid for a short timeout or until a lease callback invalidates them. Directory listings can be cached in whole or in pieces. This matters because tools such as builds and listings issue vast numbers of small metadata calls. The difficulty is staleness: a file created by another client may not appear for seconds, which can break programs that assume immediate visibility.",
    k: ["Time-based expiry versus server-driven invalidation: timeouts need no server state, but leave a window of staleness; invalidation is accurate but keeps per-client state on the server.", "Caching negative lookups: avoids repeated misses for search paths, but hides files created elsewhere until expiry."],
    p: ["A job waiting for another host's output file by polling sees the name appear late because of a cached negative entry.", "Large invalidation fan-out when a popular directory changes floods the metadata service."],
    v: "Create a file on one client and measure how long until a second client that previously looked it up sees it, confirming the delay never exceeds the configured cache lifetime.",
    dep: ["file-leases", "cache-invalidation", "inode-store"]
  },
  "data-cache": {
    s: "Client-side retention of recently read file data in memory or on local flash, validated by version or lease so reads of unchanged data never cross the network.",
    d: "Chunks or pages read by the application are kept in a local cache indexed by file and offset along with the version they came from. A cached range is used only while the client holds a valid lease or the version still matches on revalidation. Local flash caches extend capacity for datasets reread many times. The difficulty is correctness against other writers: if another client changes the file, the cache must be dropped in time, and the policy for eviction must not let a scan wipe out the working set.",
    k: ["Validate by version on open versus hold a lease: version checks need no server state but cost a round trip each open; leases avoid the trip but must be tracked and recalled.", "Local flash cache versus memory only: flash holds far more at modest cost, but adds a second place data must be invalidated and protected."],
    p: ["A large sequential scan evicts the hot data other jobs rely on.", "A cache that outlives a revoked lease serves data that was already overwritten elsewhere."],
    v: "Read a file twice and confirm the second read causes no network data traffic, then modify it from another client and confirm the next read on the first client returns the new bytes.",
    dep: ["file-leases", "chunk-versions"]
  },
  "read-ahead-and-prefetch": {
    s: "Detecting sequential or strided access and fetching upcoming chunks before the application asks, to hide network and disk latency and keep many nodes busy at once.",
    d: "The client watches recent offsets per open file. When access looks sequential, it issues asynchronous reads for the next window, growing the window while the pattern holds and shrinking it on a seek. For striped files, prefetch spreads requests across the nodes holding successive stripes. Some systems accept hints from applications about intended access. It is hard to get right: too little leaves the application waiting, too much wastes bandwidth and cache on data never used, particularly for random access or many small files.",
    k: ["Adaptive window versus fixed read size: adaptive handles both streams and random access, but needs pattern detection that can be fooled by interleaved readers.", "Prefetching by file versus by directory: directory prefetch speeds scans of many small files, but wastes effort when only one file is wanted."],
    p: ["A database doing random reads in a large file triggers sequential-looking prefetch and halves useful bandwidth.", "Aggressive prefetch by hundreds of clients saturates a few storage nodes holding the same data."],
    v: "Read a large file sequentially and confirm throughput approaches the network limit with prefetch on, while a random-read test of the same file shows no wasted bytes beyond a small bound.",
    dep: ["data-cache", "parallel-io-fanout"]
  },
  "write-back-buffering": {
    s: "Holding application writes in client memory and sending them in larger batches later, trading a window of possible loss for much higher throughput and fewer small requests.",
    d: "Writes are copied into a buffer and acknowledged immediately. The client coalesces adjacent ranges into whole chunks or stripes and flushes in the background, or when the application calls a sync operation, closes the file or the lease is recalled. Full-stripe writes avoid costly read-modify-write on erasure coded data. The difficulty is the contract: data in the buffer is lost if the client crashes, so correct programs must sync, and a lease recall must flush promptly or other clients wait.",
    k: ["Write-back versus write-through: write-back gives large sequential throughput, but acknowledged data can vanish with the client; write-through is safe and slow for small writes.", "Coalescing into stripe-sized writes versus flushing promptly: larger writes are efficient and cheaper for coding, but delay visibility to other readers."],
    p: ["An application that never calls sync loses its last seconds of output when the client host crashes.", "Dirty buffers exceeding memory limits stall the whole application during a flush."],
    v: "Write data, kill the client process without syncing and confirm only unsynced data is missing, then repeat with a sync call and confirm all data survives and can be read by another client.",
    dep: ["parallel-io-fanout", "file-leases", "partial-stripe-writes"]
  },
  "cache-invalidation": {
    s: "The messages and rules by which a server tells clients their cached attributes, names or data are no longer valid, and what happens when a client cannot be reached.",
    d: "When a client wants to change something others cache, the server recalls their leases before granting the change. Recalls are RPCs; the holder flushes dirty data, drops caches and acknowledges, or the server waits until the lease expires. Alternatives are timeouts that need no messages at all. The hard part is the unreachable client: the server must not wait forever, and must not let the writer proceed while an invisible reader still trusts its cache, so lease expiry time becomes a bound on delay and on staleness.",
    k: ["Recall-and-wait versus allow-and-notify: waiting guarantees nobody reads stale data, but one slow client delays a writer; notification is fast but permits brief stale reads.", "Callbacks to every cacher versus broadcast by directory version: per-client callbacks are precise, but state and message volume grow with the number of cachers."],
    p: ["A partitioned client keeps serving cached data past lease expiry because its clock runs slow.", "A popular file cached by thousands of clients turns one write into thousands of recall messages."],
    v: "Cache a file on three clients, write from a fourth, and confirm that all three drop their caches within the recall time, or after lease expiry if one is disconnected, before the write is visible.",
    dep: ["file-leases", "client-sessions", "clock-sync"]
  },
  "parallel-io-fanout": {
    s: "Splitting one large read or write into per-chunk requests sent concurrently to many storage nodes, so a single client can use the aggregate bandwidth of the cluster.",
    d: "Given a byte range, the client uses the file's chunk map to determine which chunks and nodes are involved, then issues requests in parallel with bounded outstanding work. Responses are reassembled in order for reads. For writes it sends each chunk to its replica group or computes coded fragments for stripes. The difficulty is the slowest-response problem: the operation finishes when the last node answers, so one slow disk dominates, and too much parallelism overwhelms the client's memory, network card or the nodes themselves.",
    k: ["Wide fan-out versus bounded concurrency: wide fan-out uses more of the cluster, but increases tail latency and incast congestion at the client.", "Hedged duplicate requests versus waiting: hedging cuts tail latency, but adds load exactly when a node is already struggling."],
    p: ["Hundreds of simultaneous responses arriving at one client overflow switch buffers and collapse throughput.", "Retrying a whole large request after one chunk fails repeats work already done."],
    v: "Read a striped file across many nodes and confirm client throughput scales with the number of nodes up to the client's network limit, and that stalling one node adds at most the hedge delay.",
    dep: ["file-chunk-map", "rpc-layer", "flow-control"]
  },
  "client-failover-and-retry": {
    s: "How clients react to a failed metadata server or storage node: find the new leader, resend safely, and avoid applying a request twice or hanging forever.",
    d: "Each request carries a client identity and sequence number. On timeout or an error naming a new leader, the client picks another endpoint from its cluster map and resends. The server uses the sequence number to detect duplicates and return the original result, so non-idempotent operations such as create and rename are safe to retry. Data reads simply try another replica. Backoff with jitter prevents synchronized retry storms. The difficulty is ambiguity: after a timeout the client does not know whether the operation applied, so the server must remember recent results.",
    k: ["Server-side duplicate tracking versus idempotent operations only: tracking makes every call safely retryable, but requires storing per-session reply state that must survive failover.", "Fail fast versus block until recovery: blocking keeps applications running through short outages, but can freeze them for an unbounded time."],
    p: ["Retrying a rename after a lost reply fails with a not-found error although it succeeded.", "Clients retrying without jitter hit a recovering metadata server at the same instant and knock it over again."],
    v: "Kill the metadata leader during a stream of creates and renames and confirm every operation is applied exactly once, the client pauses no longer than the election time, and no duplicate or missing names result.",
    dep: ["client-sessions", "leader-election", "cluster-map"]
  },
  "end-to-end-checksums": {
    s: "Checksums computed by the writing client and verified by the reading client, so corruption anywhere between the two, including memory, network and disk firmware, is detected.",
    d: "The client computes a checksum per block before sending, and the value is stored with the data and carried back on reads. Storage nodes verify what they receive and what they return, and the client verifies again after receiving. A mismatch triggers a retry against another replica or a degraded read, and a report so the bad copy is repaired. Hardware offload can make checksum cost small. The challenge is covering every hop and the granularity: whole-chunk checksums make small reads expensive, while per-block checksums add metadata.",
    k: ["Per-block checksums versus whole-chunk: per-block detects errors on partial reads cheaply, but stores much more checksum metadata.", "Checksum by the client versus by the first node: client-side covers the full path including client memory, but costs client CPU and is lost if the application changes the buffer mid-write."],
    p: ["Verifying only on disk read misses corruption introduced by a faulty network card.", "A checksum computed over data that the application is still modifying produces false corruption reports."],
    v: "Flip one byte in a stored chunk on disk and confirm a client read detects the mismatch, returns correct data from another copy, and the bad replica is queued for repair.",
    dep: ["scrubbing", "read-repair", "local-chunk-store"]
  },
  "direct-io-mode": {
    s: "A mode where applications bypass the client cache and buffers, so reads and writes go to storage nodes immediately, as databases and shared-state programs often require.",
    d: "When a file is opened for direct access, the client skips its data cache and sends each aligned request straight to the nodes, waiting for completion before returning. This gives the application its own control over caching and ordering, and removes double buffering. Alignment and size rules apply, and unaligned requests may be rejected or handled slowly with read-modify-write. It is also the usual fallback when multiple clients write the same file and caching would otherwise be unsafe.",
    k: ["Direct I/O versus cached I/O: direct gives predictable semantics and avoids double caching, but every small request pays full network latency.", "Automatic switch to direct mode on write sharing versus failing the open: automatic keeps programs working, but silently changes performance for everyone."],
    p: ["A program doing many four-kilobyte direct writes gets a small fraction of cached throughput.", "Mixing direct and cached opens of the same file on one client yields results neither mode alone would."],
    v: "Open the same file direct on two clients, write on one and read on the other, and confirm the new data appears immediately with no cache invalidation delay, at a measured per-request latency.",
    dep: ["client-library", "file-leases"]
  },
});
