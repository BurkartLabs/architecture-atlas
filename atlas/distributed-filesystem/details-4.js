// Details for the distributed filesystem plate, part 4: storage node, foundation, cross-cutting concerns.
ATLAS.details("distributed-filesystem", {
  "chunk-server": {
    s: "The daemon on each storage server that stores chunks on its local disks, serves reads and writes from clients and peers, and reports its contents and health to the cluster.",
    d: "It exposes a small interface: write a chunk range with a version, read a range, delete, copy to another node, and verify. It owns the disks, manages the local chunk store and journal, enforces version and capability checks, and reports capacity and the list of chunks to the metadata service. It knows nothing about files or names. Keeping it that simple makes it easy to reason about and replace. The difficulty is resource management: serving clients, repair, scrubbing and rebalancing from the same disks and network without letting one starve the rest.",
    k: ["Simple chunk-only interface versus richer server-side operations: simple stays easy to make correct, while richer operations like offloaded checksums or coding reduce network traffic.", "One process for all disks versus one per disk: one process shares memory and cache efficiently, while per-disk isolates faults and restarts."],
    p: ["A single slow disk blocks threads shared by the whole process and delays I/O for healthy disks.", "A daemon that restarts and reports chunks too slowly leaves the cluster unsure what data exists for many minutes."],
    v: "Restart the daemon under load and confirm that it re-reports its chunk list within the documented time, that in-flight client requests fail over cleanly, and that every chunk passes verification afterward.",
    dep: ["local-chunk-store", "node-journal", "rpc-layer", "io-scheduling"]
  },
  "local-chunk-store": {
    s: "How a node lays out chunks on its disks: files in a local filesystem or objects on raw devices, with an index, checksums and space management of its own.",
    d: "A chunk is stored as a file or as a range on a raw device along with its checksums, version and length. A local index maps chunk id to location. Using a local filesystem is simple and brings its overhead and its own metadata costs; managing raw devices gives control over layout and avoids double journaling, and requires writing an allocator. Deletion leaves space to reclaim, and fragmentation builds over time. Crash consistency is the central difficulty: after a power loss the store must find only complete chunks with matching metadata.",
    k: ["Chunks as files on a local filesystem versus raw device management: files are quick to build and inherit tooling, but add metadata overhead and a second journal; raw is efficient and demands a custom allocator.", "Checksum stored beside data versus in a separate index: beside the data keeps them together after copies, and a separate index lets scrubs skip reading data."],
    p: ["Millions of chunk files in one directory slow the local filesystem to a crawl.", "A write acknowledged before data reaches stable storage disappears after a power loss and the chunk checksum then fails."],
    v: "Write chunks, cut power at random points under load, restart, and confirm every acknowledged chunk is present and verifies, with no partial chunk accepted as complete.",
    dep: ["node-journal", "storage-media", "space-reservation"]
  },
  "node-journal": {
    s: "A write-ahead log on the node, often on fast flash, that makes small and partial writes durable quickly and lets the node recover cleanly after a crash.",
    d: "Writes are first appended to the journal with their chunk id, offset and checksum, acknowledged once durable, then applied to the main store in the background. After a crash the node replays the journal to finish applying. Putting the journal on flash gives low latency even when the main store is on slow disks, and combines many small writes into large sequential ones. It is also where partial-stripe updates are made atomic. The cost is write amplification, as everything is written twice, and the journal device becomes a shared point of failure.",
    k: ["Journal on separate flash versus on the data disk: separate flash gives low commit latency and can serve many disks, while same-disk is simple and halves usable write speed.", "Journaling data and metadata versus metadata only: full journaling gives clean recovery for all writes, but doubles write traffic."],
    p: ["A single journal flash device serving twelve disks takes all twelve down with it when it fails.", "A full journal stalls every write until it is drained to the slow store."],
    v: "Fill the journal under a write load, kill the node, and confirm after restart that all acknowledged writes are replayed into the store and match checksums, and that the node reports healthy within the documented time.",
    dep: ["local-chunk-store", "storage-media"]
  },
  "node-cache": {
    s: "Memory and flash on a storage node that keep hot chunks and index entries, so repeated reads avoid slow disks and the node serves many clients from a small set of devices.",
    d: "The node keeps recently read ranges and chunk index entries in memory, and sometimes a flash tier in front of rotating disks. Eviction favors frequently used data and resists scans. Writes can populate the cache too. Because clients and the client cache already absorb repeated reads, the node cache mostly helps shared hot data and metadata of its own. The difficulty is sizing and interaction: caches at several layers hold the same bytes, and a large scan from repair or scrub must not displace the working set.",
    k: ["Node cache sized for index only versus index plus data: index-only is small and certain to help, and data caching helps only when many clients share hot data.", "Flash tier in front of disks versus all-flash: tiering is cheaper per terabyte, and adds hit-rate dependence and warmup."],
    p: ["Scrub and repair reads pollute the cache and evict the data clients need.", "Cache memory taken from the OS reduces what the local filesystem needs and slows the whole node."],
    v: "Read a hot working set repeatedly and confirm the node's disk reads drop to near zero and hit rate matches expectation, then run a scrub and confirm the hit rate for client reads stays above its floor.",
    dep: ["local-chunk-store", "scrubbing"]
  },
  "io-scheduling": {
    s: "The node's queues that decide which request touches a disk next, separating client traffic from repair, scrub and rebalance work and keeping latency bounded.",
    d: "Requests carry a class and a deadline. Per-disk queues dispatch higher classes first, with weighted shares so lower ones are not starved completely, and cap queue depth so latency stays bounded. Rotating disks benefit from ordering by position, flash from parallelism. The scheduler also bounds how much background work is outstanding. Because storage nodes serve many clients, fairness between tenants is handled here too. The difficulty is that a deep queue maximizes throughput and wrecks tail latency, so depth is a tuning decision per device type.",
    k: ["Strict priority for clients versus weighted sharing: strict priority protects latency, but can starve repair during sustained load and leave data at risk.", "Deep queues versus shallow: deep queues extract full throughput from a device, while shallow keep latency low and underuse fast flash."],
    p: ["Repair starved by constant client traffic never finishes and redundancy stays low for days.", "A scrub issued into the same queue as clients adds hundreds of milliseconds to reads."],
    v: "Run client reads alongside a scrub and a repair, and confirm client p99 latency stays under its target while both background jobs still make progress at no less than their minimum rate.",
    dep: ["storage-media", "qos-throttling"]
  },
  "disk-health": {
    s: "Tracking each disk's error counts, reallocated sectors, latency trends and device reports to retire failing devices before they lose data, rather than after.",
    d: "The node reads the device's own health counters, counts read and write errors and checksum failures per disk, and tracks service time against peers. A model or rules mark a disk as suspect, which stops new allocation, or failed, which triggers evacuation. Predicting failure is imperfect; many disks die without warning, and some with warnings run for years. Flash devices report wear. The challenge is the balance between acting early, which costs repair traffic, and acting late, which risks correlated loss when several suspect disks fail together.",
    k: ["Proactive retirement on warnings versus run to failure: proactive reduces surprises and spends repair traffic and replacements; run to failure wastes no capacity and takes the risk.", "Per-disk thresholds versus comparing with peers in the same batch: peer comparison catches whole-batch problems, and needs enough peers to be meaningful."],
    p: ["Ignoring a rising error count on one disk allows its failure to coincide with another in the same group.", "Over-eager retirement of disks with a harmless counter fills the repair queue with needless work."],
    v: "Inject read errors on one disk and confirm it is marked suspect within a bounded time, new writes stop going to it, its chunks are evacuated, and an operator ticket names the device and its location.",
    dep: ["local-chunk-store", "metrics-and-dashboards"]
  },
  "space-reservation": {
    s: "Tracking free space per disk with reserved margins for in-flight writes, repair and metadata, so a node never runs out of space in the middle of an operation.",
    d: "Each disk accounts for used bytes, space promised to incoming chunks, and a reserve for repair and journal growth. Allocation requests are admitted only if they fit. Deleted chunks free space only after cleanup completes, and compaction of packed containers needs room to rewrite. The node reports capacity and fill to the allocator on every heartbeat. The difficulty is behavior near full: performance degrades, repair can no longer find targets, and an exhausted disk fails writes in the worst possible place.",
    k: ["Fixed percentage reserve versus dynamic by activity: fixed is simple and wastes space on quiet disks, while dynamic is efficient and needs accurate prediction of repair needs.", "Reserve space at chunk creation versus on first write: early reservation guarantees completion but strands space for abandoned chunks."],
    p: ["A disk full of data leaves no space for the copy needed to repair the chunk beside it.", "Reporting free space once per heartbeat lets the allocator overfill a disk between reports."],
    v: "Fill a disk toward its limit and confirm new allocations to it stop at the reserve threshold, repair still has room to run, and the allocator directs writes to other nodes without client errors.",
    dep: ["local-chunk-store", "allocation-policy"]
  },
  "disk-replacement": {
    s: "The procedure for swapping a failed or retiring drive: identify it, drain what is recoverable, install a new one and let it join without disturbing the rest of the node.",
    d: "The node maps each device to a physical slot and an identity so a technician pulls the right one. When a disk fails, its chunks are treated as lost on that node and rebuilt elsewhere; for a healthy retirement they are copied off first. A replacement is detected, formatted, and admitted as an empty disk that fills through normal allocation and rebalancing. Hot-swap hardware allows this without stopping the node. The challenge is mistakes: pulling the wrong drive, or a stale device identity, turns one failure into two.",
    k: ["Replace in place within a running node versus drain the whole node: in place is cheap and quick, and requires hardware that tolerates hot swap and trustworthy slot maps.", "Fill the new disk by rebalancing versus rebuilding what the old one held: rebalancing spreads load and rebuilding restores exactly the prior layout and concentrates traffic."],
    p: ["A technician pulls a healthy neighbor because the slot labels do not match the software names.", "A reinserted old disk reports stale chunks that conflict with the rebuilt copies."],
    v: "Fail a disk in a test node, replace it, and confirm the cluster identifies the exact slot, rebuilds its chunks elsewhere, accepts the new device as empty, and does not accept any stale data from the removed one.",
    dep: ["disk-health", "re-replication", "node-lifecycle"]
  },
  "fail-slow-detection": {
    s: "Finding disks, nodes and network links that still work but run many times slower than their peers, which often hurts a distributed system more than a clean failure.",
    d: "Nodes compare per-device latency percentiles with their peers and over time, and clients report which replicas answered slowly. A device or node that is consistently an outlier is marked slow: removed from read preference, excluded from new allocation, and in extreme cases ejected as if failed. The signal must tell slow hardware from a temporary load spike. This matters because a slow node in a replication pipeline or stripe slows every operation touching it, and heartbeats usually continue to pass, so failure detection never notices.",
    k: ["Peer-relative thresholds versus absolute: relative adapts to hardware and workload, but is blind when many devices degrade together, while absolute catches that and misfires on load.", "Eject slow nodes automatically versus alert only: automation protects latency and can cascade if many nodes look slow at once; alerting is safe and slow."],
    p: ["A slow disk that answers heartbeats stays in every pipeline and sets the speed of all writes through it.", "Ejecting nodes during a general slowdown removes capacity exactly when it is needed."],
    v: "Inject a ten-fold latency increase on one disk and confirm it is flagged within minutes, reads shift to other replicas, new writes avoid it, and the cluster's tail latency returns to normal.",
    dep: ["disk-health", "metrics-and-dashboards", "parallel-io-fanout"]
  },
  "membership-and-heartbeats": {
    s: "The record of which servers belong to the cluster and are alive, maintained through periodic heartbeats to a small set of monitors and used by everything else.",
    d: "Each node announces itself, then sends heartbeats carrying load, free space and health. Monitors, usually a consensus group, keep the authoritative member list with a state per node: joining, up, suspect, down, draining. Changes bump a map version that is distributed to nodes and clients. Heartbeats can also carry commands in the reply. The difficulty is scale and consequences: thousands of heartbeats per second are cheap, but a wrong membership decision drives mass repair, so decisions are made slowly and carefully.",
    k: ["Central monitors versus gossip between peers: monitors give one authoritative view and a dependency; gossip scales and tolerates monitor loss and converges only eventually.", "Heartbeat interval short versus long: short detects failures sooner and loads monitors, while long saves traffic and delays reaction."],
    p: ["Monitors running on the same nodes as storage lose their quorum in a rack failure.", "A node reusing an old identity after reinstall is accepted as the original and confuses chunk ownership."],
    v: "Add a node and confirm every monitor lists it within one interval; stop it and confirm the state moves to suspect then down at the configured times, with the map version increasing at each change.",
    dep: ["consensus-log", "rpc-layer"]
  },
  "cluster-map": {
    s: "The versioned description of members, their failure domains, weights and the placement rules, distributed to every node and client so all compute the same answers.",
    d: "The map lists each device with its weight, location in the failure-domain tree and state, and the pools with their rules. It has an epoch number that increases at each change; messages carry the epoch so a stale peer is detected and given the newest map. Clients cache it and refresh on epoch mismatch. Incremental updates keep distribution cheap on large clusters. The challenge is propagation: a change takes a moment to reach everyone, so briefly, different participants hold different maps and must handle disagreement safely.",
    k: ["Full map on every client versus a lookup service: full map allows direct access and offline computation, and costs memory and update traffic; a lookup service is lean and puts every request through a dependency.", "Incremental updates versus full snapshots: incremental is cheap and needs chain handling, while full is simple and heavy at scale."],
    p: ["A client holding an old epoch writes to a server the map has already removed.", "Map size growth on very large clusters makes every restart download and parse megabytes."],
    v: "Change the map by marking a node out, and confirm every client and server reaches the new epoch within seconds, that requests with the old epoch are rejected with a hint, and that all compute the same location for sample chunks.",
    dep: ["membership-and-heartbeats", "consensus-log"]
  },
  "rpc-layer": {
    s: "The messaging layer every component uses to call the others, with framing, timeouts, retries, authentication, batching and sometimes direct memory transfer for bulk data.",
    d: "Requests carry an identifier, a deadline and a version, and replies are matched by identifier. Control messages use a request-reply protocol over reliable connections. Bulk data may use a separate path with zero-copy or remote memory access to avoid CPU cost. The layer enforces limits on message size and outstanding requests and propagates deadlines so work is dropped once the caller has given up. It must handle versioned messages for rolling upgrades. The difficulty is overload: without admission control, a slow server collects an ever-growing queue.",
    k: ["Separate control and bulk-data paths versus one channel: separation keeps small messages from waiting behind large ones, and doubles connection management.", "Deadlines propagated across hops versus per-hop timeouts: propagated deadlines stop wasted work, and need clock-independent encoding as relative budgets."],
    p: ["A large transfer on the same connection delays a heartbeat so a healthy node is marked down.", "Unbounded retries from many callers multiply load on a struggling server."],
    v: "Send requests with short deadlines to an overloaded server and confirm it sheds expired requests without doing the work, and heartbeats on the control path still arrive on time during bulk transfers.",
    dep: ["network-topology", "service-authentication", "flow-control"]
  },
  "network-topology": {
    s: "The physical and logical shape of the datacenter network, its oversubscription and paths, which determine how much data can move between racks and how placement rules should be chosen.",
    d: "Servers connect to top-of-rack switches, which connect upward through layers to the rest of the datacenter. Bandwidth within a rack is much higher than across racks, and uplinks are often oversubscribed. Distributed filesystems exploit this by preferring local reads, limiting cross-rack repair and placing copies across racks. Multiple paths and equal-cost routing spread flows. The challenge is that storage traffic is bursty and incast-prone: many senders to one receiver can overflow switch buffers, and repair after a rack failure can saturate links.",
    k: ["Rack-aware placement and reads versus topology-blind: rack-aware saves uplink bandwidth and needs accurate topology data; blind is simple and wastes expensive links.", "Dedicated storage network versus shared: dedicated isolates storage from applications and costs more switches; shared is cheaper and couples their congestion."],
    p: ["Topology data that is out of date makes rack-aware logic work against reality.", "A rack failure triggers repair traffic across oversubscribed uplinks and slows every application using them."],
    v: "Measure cross-rack bandwidth during a node repair and confirm it remains under the configured uplink share, and that a read from a local-rack replica does not cross any uplink.",
    dep: []
  },
  "clock-sync": {
    s: "Keeping server and client clocks close enough that lease expiry, timestamps and timeouts behave, with a known bound on how far apart any two clocks can drift.",
    d: "Machines sync to a time source over the network and the filesystem assumes a maximum offset and drift rate. Leases are designed so that the holder stops using one slightly before the server expires it, within that bound. File times use the metadata server's clock, so clients do not depend on each other. Monotonic clocks measure durations. The issue is that bounds are assumptions: a failed time source or a paused virtual machine silently breaks them, and the failure shows up as a consistency violation, not as a time error.",
    k: ["Rely on bounded clock error versus avoid clocks with explicit message exchange: bounds make leases cheap and fast, while message-only protocols are safer and cost round trips.", "Server-assigned timestamps versus client-assigned: server assignment gives one consistent order, while client assignment saves a message and reflects client clock errors."],
    p: ["A host whose clock steps forward by minutes expires leases early and invites conflicting writers.", "A virtual machine paused for ten seconds resumes believing its lease is still valid."],
    v: "Skew one client's clock by more than the assumed bound, and confirm the cluster detects the offset, flags the node, and that lease-protected writes from it are still rejected by fencing checks.",
    dep: ["network-topology"]
  },
  "service-authentication": {
    s: "Mutual identity checks between clients, metadata servers and storage nodes using certificates or tickets, so only authorized machines and users can join the cluster or read data.",
    d: "Each daemon and client holds a credential issued by an internal authority. Connections are authenticated and often encrypted. Users are identified through a directory, and the metadata service issues short-lived capabilities for data access. Credentials are rotated automatically. Failure of the authority must not stop the cluster, so credentials last long enough to ride out outages, and renewal begins early. The difficulty is operational: expired certificates cause outages that look like network failures, and encryption adds CPU cost to every bulk transfer.",
    k: ["Mutual authentication on every connection versus trusted network: authenticating everything defends against a compromised host on the network, and costs handshakes and operations; a trusted network is simple and weak.", "Encrypting data in transit versus authentication only: encryption protects against sniffing, and adds measurable CPU load at high throughput."],
    p: ["Certificates expiring on a fixed date take every node off the network at once.", "A credential given to a decommissioned host stays valid and is never revoked."],
    v: "Present an expired credential and an unknown one to a storage node and confirm both connections are refused and logged, while a freshly rotated valid credential connects without interrupting existing sessions.",
    dep: ["rpc-layer"]
  },
  "bootstrap-discovery": {
    s: "How a new daemon or client finds the cluster for the first time: a small set of well-known monitor addresses or names, then the current map, then everyone else.",
    d: "A node starts with a configuration listing monitor endpoints, often resolved through naming records so the set can change without edits on every client. It contacts any monitor, authenticates, and downloads the cluster map, which lists the other members. Clients likewise learn the metadata servers from the map. The initial bootstrapping of a new cluster, and recovery from the loss of all monitors, are the delicate cases. The difficulty is the single point of discovery: if the bootstrap names are wrong or stale, nothing can start.",
    k: ["Name-based discovery versus static address lists: names let the monitor set change freely, but add a dependency on naming; static lists are self-contained and stale.", "Any monitor sufficient versus requiring a quorum to bootstrap: any is fast and might hand out a stale map; a quorum guarantees a fresh one and fails when quorum is lost."],
    p: ["Every client configured with the addresses of three monitors fails when all three are replaced.", "Cold start of a whole datacenter after power loss needs the monitors before storage nodes, and nobody wrote that order down."],
    v: "Start a new client with only one valid monitor name, confirm it fetches the current map and finds all servers; then change the monitor set and confirm it keeps working after a restart.",
    dep: ["membership-and-heartbeats", "cluster-map"]
  },
  "storage-media": {
    s: "The mix of rotating disks, flash and memory in the servers, whose capacity, cost and latency drive chunk size, journal placement, caching and tiering choices.",
    d: "Rotating disks give cheap capacity and good sequential throughput, with milliseconds of latency per seek. Flash gives low latency and high operation rates at higher cost per byte and finite write endurance. Memory holds metadata and caches. Designs match each to its role: metadata and journals on flash, bulk data on disks, hot tiers on flash. Devices with shingled or zoned recording behave best with append-style writes. The challenge is that hardware keeps changing, and a layout tuned for one medium wastes the next.",
    k: ["All-flash cluster versus disk with flash journals: all-flash is simple and fast at high cost per byte; disk with flash needs tiering and is far cheaper at scale.", "Large failure domain per disk versus many small disks: large disks cut cost per slot, but a single failure leaves much more to repair."],
    p: ["Designing around very large disks stretches repair time until it exceeds the window of safety.", "Flash wear from journaling and rewrites goes unmonitored until devices fail in a cluster-wide wave."],
    v: "Measure random and sequential throughput and latency of each medium on a node and confirm the roles assigned in the layout, such as journal on flash, match measured behavior and write endurance budgets.",
    dep: []
  },
  "flow-control": {
    s: "Limits on how much data and how many requests may be in flight between senders and receivers, so that bursts and incast do not collapse throughput or fill queues.",
    d: "Receivers grant credit or windows, senders bound outstanding requests per connection and per destination, and congestion control adapts the rate on lossy or shared paths. Clients limit parallel chunk requests so many responses do not arrive together. Servers apply admission control, rejecting or delaying work when queues grow. Backpressure travels up the stack to the application as slower writes. The challenge is that every layer has its own limits, and mismatches cause either idle capacity or collapse under load.",
    k: ["Credit-based flow control versus relying on the transport: credits give predictable queues and need protocol support, while transport congestion control is automatic and slow to react to incast.", "Reject excess requests versus queue them: rejection keeps latency low and pushes retry logic upward; queuing smooths short bursts and hides overload until it is deep."],
    p: ["Hundreds of simultaneous responses to one client overflow switch buffers and throughput drops to a fraction.", "Unbounded server queues turn a short spike into minutes of latency."],
    v: "Fan in reads from a hundred nodes to one client and confirm throughput stays near line rate with no sustained packet loss, and an overloaded server rejects excess requests rather than growing its queue indefinitely.",
    dep: ["network-topology"]
  },
  "metadata-data-separation": {
    s: "Keeping names, attributes and chunk maps in one service and bytes on another set of servers, so bulk data never flows through the metadata path.",
    d: "This single decision shapes the whole architecture. Metadata servers hold a small, hot, highly consistent state and cannot be scaled by adding disks; storage nodes hold huge cold state and scale by adding machines. Clients ask the first where data is and talk to the second directly. The metadata service becomes the limit on file count and operation rate, which is why partitioning it is the central scaling problem. The decision also defines failure behavior: losing metadata makes all data unreadable though every byte survives.",
    k: ["Separated metadata and data versus unified peer-to-peer: separation keeps the path simple and makes metadata the bottleneck; unified avoids it and spreads complexity everywhere.", "Metadata in memory versus on disk: memory is fast and limits file counts, while disk-backed scales further and slows cold lookups."],
    p: ["Treating metadata as an afterthought means the data layer scales to petabytes and the namespace stalls at a few hundred million files.", "A metadata backup that is older or less careful than the data makes the data unusable after a disaster."],
    v: "Increase file count tenfold and confirm bulk throughput scales with storage nodes while metadata latency stays within target, and that metadata alone can be restored from backup to make all data reachable again.",
    dep: ["namespace-tree", "chunk-server", "client-library"]
  },
  "consistency-versus-speed": {
    s: "How strictly clients see each other's changes, and what each step toward the strongest guarantee costs in latency, coordination and metadata load.",
    d: "Every cache, lease, lock and journal write exists to give a stronger or cheaper answer to one question: what may a client assume about the latest state. Strong guarantees need recall messages, synchronous journaling and fencing, and they limit scale and speed. Weak guarantees allow timeouts and local decisions and give programs surprising behavior. The choice is rarely global; metadata is often strong and data weaker, and special modes exist for shared files. Whatever is chosen, it has to be stated precisely, because applications depend on what they observe.",
    k: ["Strong semantics by default versus relaxed with opt-in strictness: strong is safe for unmodified programs and slow at scale; relaxed scales and fails silently for programs that expected more.", "One model for all data versus per-directory modes: per-directory matches the workload and increases what operators must understand."],
    p: ["Unstated semantics are discovered by applications through rare corruption in production.", "Switching a cluster to stronger semantics later reveals performance assumptions built on the weak model."],
    v: "Run a documented set of consistency litmus tests against each mode and confirm results match the contract, with measured latency for each mode published alongside.",
    dep: ["consistency-model", "file-leases", "posix-relaxations"]
  },
  "failure-domain-design": {
    s: "Choosing which failures the layout must survive, drives, servers, racks or sites, and building placement, coding and repair to match that choice and the time repair needs.",
    d: "Durability comes from copies or fragments landing in domains that fail independently, and from restoring them before the next failure. The design starts from correlated events: shared power, a switch, a software bug that hits one build. It sets copy counts, code widths and rack counts. It then checks that repair is quick enough that the chance of a second failure in the window is small. The decision touches placement, topology, upgrades and even how many racks must be bought before the cluster can be erasure coded at all.",
    k: ["Survive a rack versus survive only servers: rack survival needs more racks and cross-rack repair traffic, and is the difference between a bad day and data loss for common failures.", "Single site versus multi-site: multi-site covers disasters and costs latency or lag in every write path."],
    p: ["Calculating durability from independent disk failures ignores that most losses come from correlated events.", "A software bug deployed to every node at once is a correlated failure that placement cannot hide from."],
    v: "Simulate the loss of each domain level in turn on a staging cluster and confirm all data remains readable, and that repair restores full redundancy within the window assumed by the durability calculation.",
    dep: ["failure-domain-tree", "erasure-coding", "re-replication"]
  },
  "posix-compatibility-cost": {
    s: "How much of the standard file contract the system keeps, and the coordination, metadata and speed paid for each guarantee kept.",
    d: "Programs written for local disks expect atomic rename, shared locks, accurate times, immediate visibility and mutable files. Each of these forces a distributed protocol: leases, cross-partition transactions, synchronous metadata updates. Dropping them lets a system scale much further, and limits what runs on it unchanged. Many large systems pick a restricted interface suited to analytics and add partial compatibility on top; others invest in full compliance and accept lower scale. The decision is hard to revisit, because applications adapt to whichever contract they were given.",
    k: ["Full compatibility versus purpose-built interface: full runs legacy software, but costs scale and complexity; purpose-built is simpler and needs applications changed.", "Compatibility by gateway versus in the core: gateways isolate the cost to those who need it, while the core keeps one path and carries every guarantee for every user."],
    p: ["A promise of POSIX compatibility with a long list of exceptions leaves users to find them by trial.", "Adding strict guarantees after launch slows every existing user."],
    v: "Run a conformance suite and a set of representative applications, publish the pass and fail list, and confirm each failing case is explained by a documented relaxation.",
    dep: ["posix-semantics-layer", "posix-relaxations", "cross-partition-rename"]
  },
  "repair-versus-foreground-load": {
    s: "The standing conflict between restoring redundancy quickly and giving applications their performance, resolved by priorities, throttles and capacity headroom set in advance.",
    d: "Recovery after a failure needs the same disks and network that serve clients. Run it slowly and data stays exposed to a second failure; run it fast and applications slow down. The balance depends on how close data is to loss, and the answer changes during an incident. Headroom is part of the design: a cluster run at full utilization cannot repair without hurting clients. Coding choices matter as well, since repair traffic differs by an order of magnitude between schemes. This is a decision about risk, which operators need to make deliberately before an outage.",
    k: ["Aggressive repair versus protecting clients: fast repair shortens exposure and degrades applications; gentle repair preserves latency and widens the risk window.", "Spare capacity kept idle versus running hot: idle capacity makes repair cheap and costs hardware; hot clusters are efficient and fragile."],
    p: ["A repair policy tested only on small failures collapses under a rack loss.", "Raising repair speed for an incident and never restoring the normal setting."],
    v: "Fail a full rack under realistic client load, and confirm repair completes within the exposure window assumed by the durability model while client latency stays within the agreed service level.",
    dep: ["repair-throttling", "io-scheduling", "capacity-forecasting"]
  },
  "scale-limits-and-growth": {
    s: "The ceilings on file count, directory size, metadata operation rate, cluster size and per-node chunks, and how each is raised or worked around as the cluster grows.",
    d: "Every component has a limit that shows up first at scale: metadata memory per file, the number of chunks a single node can track and report, directory sizes, monitor load, repair concurrency and the size of the cluster map. Growth moves the bottleneck from one to another. Design for growth means knowing the order in which they are reached, measuring each in production, and having a plan that does not require rewriting layouts that cannot be changed, such as chunk size or group counts.",
    k: ["Over-provisioning structures now versus resharding later: over-provisioning costs memory and keeps growth simple, while resharding is cheap now and often painful when data is large.", "One big cluster versus many smaller ones: one cluster pools capacity and operations and sets a larger blast radius; many are isolated and fragment capacity."],
    p: ["The limit nobody measured, such as metadata memory, is reached before the capacity everyone watched.", "A cluster grown tenfold with its original group and chunk parameters never balances properly."],
    v: "Load a test cluster to ten times its current file count and node count, and confirm each component's measured limit, recording the first one to become a bottleneck against the plan.",
    dep: ["capacity-forecasting", "subtree-partitioning", "placement-groups"]
  },
});
