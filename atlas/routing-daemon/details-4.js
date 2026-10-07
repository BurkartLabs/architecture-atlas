// Details for the routing daemon plate, part 4: forwarding programming, runtime, system integration, cross-cutting concerns.
ATLAS.details("routing-daemon", {
  "fib-compiler": {
    s: "Converts the RIB's active routes into the minimal set of forwarding entries, resolving next hops to interfaces and link-layer addresses and sharing common objects.",
    d: "Each active route is reduced to a prefix and a pointer to a forwarding next-hop object. Recursive next hops are flattened, multipath is turned into groups, and discard and local routes are marked. The compiler emits a stream of add, change and delete operations, ordered so that dependencies are installed before the routes that use them. It runs incrementally on RIB changes. The hard parts are ordering, to avoid transient black holes, and compactness, because forwarding memory is a fixed, expensive resource.",
    k: ["Incremental compilation vs rebuilding the table: incremental is fast for small changes and needs exact dependency tracking; rebuilds are simple and slow at scale.", "Sharing next-hop objects vs per-route copies: sharing saves memory and enables fast failover, and complicates updates."],
    p: ["Installing a route before the next-hop object it references exists drops traffic until the object arrives.", "A compiler bug that emits stale entries leaves forwarding disagreeing with the RIB, with no protocol-level symptom."],
    v: "Change one next hop used by 50,000 routes and confirm the compiler emits one object update, not 50,000 route updates, and the hardware dump shows every affected route using the new path.",
    dep: ["global-rib","next-hop-groups","next-hop-resolution"]
  },
  "kernel-route-sync": {
    s: "Installs routes into the host operating system's forwarding table through its routing interface and keeps the two tables in agreement, including routes added by others.",
    d: "On a software router or host, the daemon talks to the kernel through a socket-based interface, sending route add and delete messages and receiving notifications of routes, addresses and links that others change. It tags the routes it installed with its own source marker, so it can find and clean them after a restart. It must handle kernel table limits, batch operations for speed, and routes owned by other programs. The challenges are consistency when two writers disagree and speed when installing a full table.",
    k: ["Tagging own routes with a protocol marker vs tracking by list: markers survive restarts and allow cleanup; lists are lost with the process.", "Batching route messages vs one at a time: batches are many times faster and make error attribution harder."],
    p: ["A crash leaves the daemon's routes in the kernel, forwarding on stale state indefinitely if nobody cleans them.", "Another program overwrites a route the daemon owns and the daemon never notices."],
    v: "Install 500,000 routes through the interface, compare the kernel table with the RIB, and confirm they match; stop the daemon and confirm marked routes are cleaned or retained according to the configured restart behavior.",
    dep: ["fib-compiler","platform-abstraction","interface-state-feed"]
  },
  "hardware-offload-programming": {
    s: "Writes forwarding entries into a switching chip's tables through a vendor-neutral abstraction, tracking capacity and returning errors when hardware is full.",
    d: "The daemon sends route and next-hop operations to a layer that translates them to the chip's tables, such as longest-prefix match memory and next-hop tables. Capacity is limited and shared across address families, and some tables work differently per entry length. Operations are queued and batched for speed. Programming rates are a bottleneck: millions of entries need seconds to minutes. The daemon must know about failures and resource exhaustion, because a route that did not install is not forwarding even though the RIB shows it active.",
    k: ["Asynchronous batched programming vs synchronous per-route: batches reach table-load speed and make partial failure and ordering harder to manage.", "Programming everything vs a subset with the rest handled in software: everything is fast and needs capacity; subset saves memory at the cost of slow-path traffic."],
    p: ["Hardware table exhaustion silently leaves routes uninstalled and traffic goes to a slow path or is dropped.", "Programming order differences expose a window where a route points at an object not yet written."],
    v: "Fill the hardware table to capacity in a lab and confirm the daemon reports failed installs per prefix, marks them not offloaded, and raises an alarm before traffic is lost.",
    dep: ["fib-compiler","next-hop-groups","install-feedback"]
  },
  "next-hop-groups": {
    s: "Shared objects that represent a set of next hops with weights, referenced by many routes, so a path change updates one object for all of them.",
    d: "Instead of each route listing its own next hops, routes reference a group, and groups reference individual next-hop entries. Routes with identical multipath sets share a group. Changing a link updates the entries used, and every route follows. Groups also hold primary and backup members for fast reroute. They cut memory and update cost by orders of magnitude at full-table scale. The hard parts are reference counting, safe update ordering and changing group membership without disrupting flows.",
    k: ["Shared groups vs per-route next-hop lists: groups compress and speed convergence; per-route lists are simple and scale poorly.", "Mutating a group in place vs creating a new one and swapping: in-place is cheap and disturbs flows; swap is safe and uses temporary space."],
    p: ["Changing a group's membership remaps existing flows and breaks connections that were working.", "A leaked reference count keeps unused groups forever and exhausts hardware group space."],
    v: "Point 100,000 routes at one group, remove one member, and confirm a single update changes forwarding for all of them, and that the flows on the surviving members were not remapped.",
    dep: ["fib-compiler","load-balancing-hash"]
  },
  "load-balancing-hash": {
    s: "Chooses which of several next hops a packet takes by hashing header fields, keeping each flow on one path while spreading flows across all.",
    d: "The forwarding plane hashes fields such as addresses, ports and protocol, and uses the result to pick a member of the group. The daemon configures which fields are used, the seed, and the algorithm. Using the same hash on all routers produces correlated choices that leave some paths unused, so seeds differ per router. Resilient hashing limits remapping when members change. It is hard because the hash must balance the actual traffic mix, which may have few large flows.",
    k: ["Resilient hashing vs plain modulo hashing: resilient avoids remapping surviving flows when a member changes, with extra table space; plain is compact and reshuffles.", "Different seeds per router vs one seed: different seeds avoid polarization across hops; one seed is predictable for troubleshooting."],
    p: ["Identical hash functions on successive routers send all flows chosen at one hop down the same path at the next.", "A small number of very large flows makes any hash produce uneven loads."],
    v: "Send 10,000 flows with varied ports across four next hops and confirm load shares are within a few percent of equal, then remove one member and confirm flows on the other three stay on their paths.",
    dep: ["next-hop-groups","platform-abstraction"]
  },
  "install-feedback": {
    s: "Confirmations from the forwarding plane that each route was installed or failed, fed back to the RIB and to protocols that advertise based on installation.",
    d: "After sending a route to the forwarding layer, the daemon waits for an acknowledgement or error, and records the route as installed, pending or failed. Protocols can be told to advertise a route only after it is installed, avoiding attracting traffic to a router that cannot forward it yet. Failures raise alarms and trigger retries or withdrawal. Without feedback, the RIB shows an idealized view. The challenge is latency and volume of acknowledgements, and defining what installed means: in a table, or actually forwarding.",
    k: ["Advertise after install vs advertise on selection: after install is safe and delays convergence by the programming time; on selection is fast and risks black holes.", "Per-route acknowledgements vs batch status: per-route is precise and expensive; batch is cheap and less precise on failure."],
    p: ["Advertising routes the hardware has not yet programmed attracts traffic that is dropped.", "A failed install shown as active in the RIB leads operators to debug protocols instead of hardware."],
    v: "Add a route, confirm status moves from pending to installed with a timestamp, and cause an install failure and confirm the status shows failed, an alarm is raised, and the route is not advertised if configured so.",
    dep: ["hardware-offload-programming","kernel-route-sync","global-rib"]
  },
  "fib-compression": {
    s: "Reduces the number of forwarding entries by merging or omitting routes whose forwarding behavior is identical, to fit large tables in limited hardware.",
    d: "If a more-specific route has the same next hop as its covering route, it is redundant for forwarding and can be dropped. Algorithms find these and merge adjacent prefixes with equal next hops, shrinking tables by large fractions. The compressed table must forward identically to the full one, and must be maintained incrementally as routes change, because a change may un-merge entries. It extends hardware life but adds computation and makes the forwarding table differ visibly from the RIB.",
    k: ["Compressing the table vs buying larger hardware: compression is free to deploy and adds complexity; larger hardware is simple and costly.", "Aggressive merging vs lossless only: aggressive saves most and may pass traffic for unrouted addresses; lossless preserves behavior exactly."],
    p: ["Compression that merges across a gap in the covered space forwards traffic for addresses that should be unreachable.", "A change that un-merges many entries at once causes a spike in programming work."],
    v: "Compress a full table and confirm that, for a large sample of destination addresses including unrouted ones, lookup results are identical between the compressed and original tables.",
    dep: ["fib-compiler","hardware-offload-programming"]
  },
  "restart-reconciliation": {
    s: "After a restart, compares what the forwarding plane holds with what the daemon now wants, and applies only the difference, removing leftovers.",
    d: "On startup, the daemon marks existing entries it previously installed as stale, rebuilds its routes from neighbors, and installs them, updating matches in place. When convergence is declared complete, remaining stale entries are deleted. This avoids flushing the table, which would drop traffic, and avoids leaving old routes forever. It works with graceful restart. It is hard because the daemon must decide when it has enough information to remove stale entries without removing something that would have been re-learned a moment later.",
    k: ["Mark-and-sweep reconciliation vs flush and reload: mark-and-sweep preserves traffic and needs an end-of-convergence signal; flush is simple and drops traffic.", "Timer-based sweep vs event-based: timers are simple and wrong when convergence is slow; events are accurate and require every protocol to report completion."],
    p: ["Sweeping before a slow neighbor has finished sending routes deletes valid forwarding entries.", "Never sweeping leaves stale routes for prefixes that have since been withdrawn."],
    v: "Restart the daemon with 100,000 routes installed and traffic flowing; confirm no entries are removed for routes that return, stale ones that do not return are deleted after convergence, and packet loss is near zero.",
    dep: ["fib-compiler","kernel-route-sync","state-checkpointing"]
  },
  "event-loop": {
    s: "The scheduler that waits for sockets, timers and internal events and dispatches handlers, never allowing one task to block the others for long.",
    d: "A single thread typically waits for readiness on many connections and runs handlers to completion, in priority order. Long jobs, such as shortest-path computation or full-table processing, are split into slices that yield, so keepalives and hellos are serviced on time. Priorities favor protocol liveness over bulk work. The loop is the reason a daemon behaves well under load: a handler that takes seconds causes neighbors to time out. The hard part is bounding every piece of work and measuring where time goes.",
    k: ["Cooperative slicing on one thread vs threads for everything: slicing is deterministic and free of locks; threads use more cores and need synchronization everywhere.", "Strict priority for keepalives vs fair scheduling: strict priority protects sessions and can starve bulk work during storms."],
    p: ["A single handler that runs for several seconds delays keepalives, and neighbors drop sessions that were healthy.", "Work not sliced during a full table load makes the daemon unresponsive to commands."],
    v: "Load a full table while sending a keepalive probe every 100 milliseconds, and confirm the maximum delay in handling a keepalive stays within the budget, and the loop's slice-duration histogram shows no long slices.",
    dep: ["timer-wheel","platform-abstraction"]
  },
  "timer-wheel": {
    s: "A data structure that manages thousands of timers, such as hold timers, retransmissions and refreshes, with constant-time insertion, cancellation and expiry.",
    d: "Timers are placed into slots in a circular array indexed by expiry time, so inserting and firing cost the same regardless of the number outstanding. Each session, adjacency and advertisement has several timers, so there can be hundreds of thousands. Granularity trades precision against overhead, and a hierarchy covers long ranges. Jitter is added to periodic timers so many do not fire together. The difficulty is accuracy under load: a timer fires late when the loop is busy, and the daemon must handle that correctly.",
    k: ["Wheel vs heap: a wheel gives constant time at a fixed granularity; a heap is precise and logarithmic.", "Jittered periodic timers vs exact: jitter avoids synchronized bursts and makes timing less exact for protocol rules that assume bounds."],
    p: ["Timers firing in synchronized bursts produce periodic load spikes and flooding peaks.", "A late timer handled as if on time causes premature expiry and a spurious failure."],
    v: "Create 200,000 timers with random expiries and confirm each fires within one granularity of its deadline when the loop is idle, and that cancellation leaves no timer firing afterward.",
    dep: ["event-loop"]
  },
  "tcp-transport": {
    s: "The reliable byte-stream connection that carries session protocols, with its own buffering, keepalive, authentication option and handling of blocked or slow peers.",
    d: "The daemon opens and accepts connections, reads messages out of the stream by length, and writes updates with per-connection output buffers. Backpressure is handled: if a peer reads slowly, its buffer grows and then must be bounded or the session reset. Socket options set the hop limit, authentication and buffer sizes. Transport behavior affects convergence: a lost packet stalls an in-order stream behind it. It is hard to size buffers for bulk table transfer without wasting memory across hundreds of sessions.",
    k: ["Large socket buffers vs small: large buffers speed full-table transfer and use memory for every session; small save memory and slow convergence.", "Resetting a session whose peer cannot keep up vs buffering indefinitely: reset bounds memory and costs the peer's routes; buffering preserves routes and risks memory exhaustion."],
    p: ["A stalled peer's unbounded output buffer grows until memory is exhausted.", "Head-of-line blocking from one lost segment delays every update behind it by a retransmission timeout."],
    v: "Pause reading on a peer while sending a full table to it, confirm buffer use is capped at the configured limit, the session is handled as configured, and other sessions' latency is unchanged.",
    dep: ["event-loop","platform-abstraction"]
  },
  "module-message-queues": {
    s: "Queues that carry route updates and events between protocol modules, the RIB, and the forwarding layer, decoupling their speeds and failure.",
    d: "Modules do not call each other directly. A protocol enqueues route operations for the RIB, which enqueues changes for forwarding. Queues are bounded and can coalesce updates for the same prefix, so a slow consumer sees only the latest state. Back-pressure signals tell producers to slow down. This isolates failures and enables each module to run in its own thread or process. The difficulty is ordering and coalescing correctness, and sizing queues so latency stays bounded during bursts.",
    k: ["Coalescing updates per prefix vs preserving every update: coalescing reduces work and loses intermediate states some tools want; full history is exact and heavy.", "Bounded queues with back-pressure vs unbounded: bounded keeps memory predictable and requires producers to handle waiting; unbounded is easy and risks exhaustion."],
    p: ["An unbounded queue behind a slow forwarding layer holds hours of stale updates after a storm.", "A lost end-of-table marker in a queue leaves the consumer waiting for completion forever."],
    v: "Generate 1,000,000 route updates for a prefix set of 10,000 and confirm the consumer receives at most the latest state per prefix when coalescing is on, and queue depth stays within its bound.",
    dep: ["event-loop","route-memory-pools"]
  },
  "route-memory-pools": {
    s: "Specialized allocators and interned storage for routes, attributes and advertisements, which keep memory use predictable at millions of entries.",
    d: "Routes and attributes are allocated from size-specific pools to avoid fragmentation and speed allocation. Identical attribute sets are stored once and shared by reference. Memory limits per table or per neighbor are enforced, and the daemon tracks usage by category so operators can see what consumes memory. Reference counting frees shared objects when unused. At full-table scale with many neighbors, memory is the first limit reached, so layout decisions are central to capacity planning.",
    k: ["Pools and interning vs general-purpose allocation: pools and sharing cut memory and fragmentation sharply and need careful lifetime management.", "Hard memory limits per neighbor vs global exhaustion handling: per-neighbor limits contain one bad neighbor and require sizing; global handling is simple and fails everywhere together."],
    p: ["A reference counting error leaks attribute sets until the daemon is out of memory days later.", "Fragmentation after long uptime makes the daemon unable to allocate despite free memory in total."],
    v: "Load a full table from ten neighbors and compare measured resident memory with the capacity model's prediction, then flap sessions for hours and confirm memory returns to baseline with no growth.",
    dep: []
  },
  "worker-threads": {
    s: "Separate threads for expensive or independent work such as path computation, update encoding and policy evaluation, with controlled data sharing back to the main loop.",
    d: "Heavy computations run on workers using immutable snapshots of inputs, and results are handed back through queues. Update encoding for groups of neighbors and policy evaluation across prefix ranges can be parallel. The main thread owns tables and protocol state, so most code needs no locks. This keeps keepalives on time during computation and uses more cores. The difficulty is snapshot cost, consistency between snapshot and live state, and debugging concurrency faults that appear only at scale.",
    k: ["Snapshots handed to workers vs shared tables with locks: snapshots avoid locking and cost copies; locks avoid copies and risk contention and deadlocks.", "Partitioning by prefix range vs by neighbor: prefix partitions balance work and spread each neighbor's data; neighbor partitions are simple and unbalanced."],
    p: ["A worker computing from a snapshot that is already stale installs a result that is wrong by the time it arrives.", "A data race on shared attribute counts corrupts memory in rare, unreproducible ways."],
    v: "Run path computation on a worker during a flood of updates and confirm keepalive latency stays within budget, and that results for repeated runs equal a single-threaded reference.",
    dep: ["event-loop","module-message-queues"]
  },
  "process-supervision": {
    s: "Starts, monitors and restarts the daemon's processes, applies resource limits, and decides what to do after a crash, including falling back to a safe state.",
    d: "A supervisor launches each protocol as a separate process or the daemon as one, watches liveness, and restarts on crash with backoff. Protocols running as separate processes limit the blast radius of a fault. Core files and logs are saved. Limits on memory and CPU stop a runaway process from taking the router down. After repeated failures it may stop restarting and alarm. The hard part is the recovery sequence: restart without causing the network to reconverge, which links to graceful restart and checkpointing.",
    k: ["One process per protocol vs one monolithic process: separate processes isolate crashes and require inter-process communication; monolithic is fast and a single bug takes down all protocols.", "Automatic restart forever vs stopping after failures: restarting recovers from rare faults and repeats a crash loop that disturbs neighbors."],
    p: ["A crash loop repeatedly resets neighbor sessions and causes constant churn across the network.", "Without resource limits, a protocol leak consumes memory and the supervisor is killed too."],
    v: "Kill one protocol process with a signal and confirm the supervisor restarts it within seconds, other protocols are unaffected, and a core file and log entry are recorded.",
    dep: ["state-checkpointing","event-logging"]
  },
  "state-checkpointing": {
    s: "Saves enough protocol and route state to survive a restart or move to a standby, so the daemon does not have to relearn everything from neighbors.",
    d: "The daemon stores selected state, such as session parameters, sequence numbers, advertised routes, and the route table, in memory that outlives the process or on stable storage. On restart it reloads that state, resumes sessions where the protocol allows, and compares with fresh information. It shortens recovery and enables graceful restart. State is versioned for upgrades. The hard parts are deciding what is safe to restore, since stale state may be wrong, and keeping checkpointing cheap enough not to slow the main path.",
    k: ["Checkpoint of derived state vs recomputing from inputs: checkpointing restores faster and risks restoring a wrong state; recomputation is slower and self-correcting.", "Continuous incremental checkpoints vs periodic snapshots: incremental is current and costs constantly; periodic is cheap and loses recent changes."],
    p: ["Restoring a routing table that is hours old after a restart briefly programs routes that no longer exist.", "A checkpoint format changed in an upgrade is unreadable, and the daemon cold starts."],
    v: "Restart the daemon after 10,000 route changes and confirm the restored state matches the pre-restart state for everything restored, with stale entries refreshed or removed once neighbors confirm.",
    dep: ["route-memory-pools","platform-abstraction"]
  },
  "ha-state-sync": {
    s: "Replicates protocol and route state from an active control plane to a standby so the standby can take over without neighbors noticing.",
    d: "The active instance streams state changes to the standby: sessions with their transport state, advertised routes, adjacency data and configuration. The standby holds it, and on failure promotes itself using a hitless takeover with graceful restart signaling. Between them, a heartbeat detects failure and a rule prevents both from being active. State sync consumes bandwidth and CPU and can fall behind. The hardest part is the transport state: a session can continue only if the sequence state is replicated precisely.",
    k: ["Hot standby with full state vs cold standby: hot gives fast, hitless takeover and requires consistent replication of everything; cold is simple and relearns routes.", "Synchronous vs asynchronous replication: synchronous guarantees the standby is current and slows the active; asynchronous is fast and can lose recent state."],
    p: ["A split brain with both instances active advertises conflicting information and takes the network down.", "A standby that is silently behind takes over with old state, appearing healthy until it does."],
    v: "Force a failover under traffic and confirm the standby takes over within the budget with sessions still established, no route withdrawn at neighbors, and packet loss within the documented limit.",
    dep: ["state-checkpointing","tcp-transport","graceful-restart"]
  },
  "interface-state-feed": {
    s: "The stream of notifications from the operating system about interfaces: created, removed, up, down, speed, address and maximum packet size changes.",
    d: "At startup the daemon reads all interfaces, then subscribes to changes. It maintains a model of each interface and informs protocols that run on it. Events can be bursty at boot, or when a card is added. It also gives bandwidth for default metrics and the packet size for protocol messages. Differences across platforms are hidden by an abstraction. The difficulty is race conditions between the initial dump and the stream, and event ordering when interfaces are renamed or recreated.",
    k: ["Event stream vs polling: events are immediate and require handling missed notifications; polling is simple and slow.", "Trusting event order vs rereading state after events: rereading is more robust and costs more."],
    p: ["An event missed during a busy period leaves the daemon thinking an interface is up when it is down.", "A renamed interface is treated as a new one, and its configuration does not apply."],
    v: "Create, down, up and remove a test interface and confirm the daemon's model matches the system's state after each step, and that protocols on it react as expected.",
    dep: ["platform-abstraction"]
  },
  "address-tracking": {
    s: "Follows the addresses assigned to interfaces, so connected networks become routes, and sessions and protocols can bind to the correct source address.",
    d: "Each address on an interface produces a connected route and a local route. Address changes update protocols that advertise connected networks or use the address as an identifier or session source. Addresses can be secondary, temporary, or in tentative state during duplicate detection, and the daemon must ignore those not yet usable. Loopback addresses used as stable router identifiers need special treatment. Hard parts include IPv6 states and change ordering when an address moves between interfaces.",
    k: ["A stable loopback identifier vs interface addresses as identifiers: loopback survives link failures and requires configuration; interface addresses are automatic and change with links.", "Waiting for address readiness vs using immediately: waiting avoids duplicates and delays start."],
    p: ["Using a tentative address as a session source causes packets from an address that is not yet valid.", "Changing the identifier address at runtime forces every protocol to restart."],
    v: "Add and remove an address on a test interface and confirm the connected route appears and disappears in the RIB and is advertised or withdrawn accordingly, with tentative addresses ignored until ready.",
    dep: ["interface-state-feed","global-rib"]
  },
  "raw-packet-io": {
    s: "Sends and receives protocol packets that are not carried over a stream, such as link-state hellos and detector packets, with control of source, interface and hop limit.",
    d: "Some protocols use their own packet types, sent to well-known multicast groups or addresses on a specific interface. The daemon opens raw sockets or uses a packet interface, sets hop limit, joins groups, chooses the interface and source, and receives packets with ingress interface information. It filters early and rate limits by source. Authentication fields are computed here. It is hard to make portable, since facilities for interface selection and multicast group management differ across platforms.",
    k: ["Raw sockets in user space vs in-kernel protocol handling: user space is flexible and slower; in-kernel is fast and needs platform support.", "Per-interface sockets vs one socket for all: per-interface makes interface selection explicit and uses more descriptors."],
    p: ["Packets sent from the wrong source interface are dropped by the neighbor's checks and the adjacency fails.", "Missing multicast group membership after an interface flap leaves the router deaf to hellos."],
    v: "Capture on the link while the daemon runs and confirm hellos have the correct source, destination group and hop limit, and that removing and restoring the interface re-joins the group and resumes reception.",
    dep: ["platform-abstraction","interface-state-feed"]
  },
  "neighbor-table-sync": {
    s: "Keeps the link-layer address mappings for neighbors, from address resolution, consistent with routes, so forwarding has a destination address for every next hop.",
    d: "A next hop needs a link-layer address, learned through resolution requests on the link. The daemon may trigger resolution when a route is installed so the next hop is ready before traffic arrives, and watches the table for entries that fail or expire, which means the neighbor is unreachable. That signal can mark the next hop down faster than protocol timers. In hardware, entries are programmed alongside routes. Difficulties include unresolved entries causing traffic punts and mapping changes when a neighbor moves.",
    k: ["Pre-resolving next hops vs resolving on first packet: pre-resolution avoids first-packet loss and generates extra requests; on demand is lazy and drops initial traffic.", "Using resolution failure as a liveness signal vs protocol timers: it is quick and noisy; protocol timers are slower and authoritative."],
    p: ["An unresolved next hop leaves a route installed that cannot forward, with all traffic punted to the CPU.", "A neighbor changing hardware address is not noticed until the stale entry expires."],
    v: "Install a route through a new next hop and confirm resolution occurs before traffic, then disconnect the neighbor and confirm the entry fails and the route is marked unusable within the expected time.",
    dep: ["interface-state-feed","fib-compiler"]
  },
  "clock-source": {
    s: "The daemon's reference for time: a monotonic clock for timers and intervals, and a synchronized wall clock for logs, key lifetimes and cross-device correlation.",
    d: "Protocol timers use a monotonic clock that does not jump when the system time is corrected. Wall-clock time is used for timestamps, key rollover schedules and records exported to collectors, and relies on a time synchronization service. Mixing the two is a classic bug: a timer based on wall time fires wrongly when the clock is stepped. Age fields in link-state entries use elapsed time. It is mundane and important: debugging a multi-router incident needs timestamps agreeing to milliseconds.",
    k: ["Monotonic for intervals, wall clock for records: protects timers from clock steps and requires converting between them for display.", "Trusting the system clock vs a dedicated time source: system clock is simple; a dedicated source gives accuracy needed for correlation."],
    p: ["A timer implemented with wall time fires immediately or never when the clock is corrected.", "A router with an unsynchronized clock rejects a valid key because its lifetime has not started."],
    v: "Step the system clock forward and backward by an hour while sessions run and confirm no timer misfires and no session resets, while log timestamps follow the corrected wall time.",
    dep: ["platform-abstraction"]
  },
  "platform-abstraction": {
    s: "A thin layer that hides the differences between operating systems and hardware platforms for sockets, interfaces, routes, time and process control.",
    d: "The protocol code calls abstract operations, such as send a packet on an interface, install a route, subscribe to interface changes, and the layer implements them for each platform. A router appliance, a general-purpose host and a virtual instance differ in how routes reach forwarding and how interfaces appear. Keeping the protocols free of platform code is what allows one daemon to be used in many products. The hard parts are the semantic differences hidden beneath the same function name.",
    k: ["A narrow abstraction vs exposing platform features: narrow keeps protocol code portable and hides useful capabilities.", "One implementation per platform vs conditional compilation in shared code: separate implementations are clear and duplicate; conditionals share code and become unreadable."],
    p: ["Two platforms interpret the same call differently, such as how route replace behaves, and routes vanish on one.", "A feature available on only one platform leaks into protocol code and breaks the other ports."],
    v: "Run the same protocol conformance suite on each supported platform and confirm identical results for interface events, route installs and packet I/O.",
    dep: []
  },
  "table-scale": {
    s: "How large the route tables, neighbor counts and update rates may be, and what memory, processing and forwarding capacity that implies at every layer.",
    d: "A full internet table is around a million prefixes per address family, and multiplied by neighbors, paths and attribute sets it sets memory needs. Update rates add CPU load, and forwarding hardware has a fixed entry count. Scale is planned from the worst case, such as a full reload from every neighbor at once, not the steady state. Techniques that serve scale include interning, update groups, compression and partitioned processing. A design that is correct at ten thousand routes can miss its convergence target at a million.",
    k: ["Sizing for the worst-case burst vs the average: worst-case wastes resources and keeps convergence bounded; average sizing fails under storms.", "Scale up one box vs distribute across many: one box is simple and bounded by its memory; distribution scales further and adds coordination."],
    p: ["A table growth projection that ignores multipath and additional paths underestimates memory by large factors.", "Load tests at steady state miss the reload burst that actually breaks sessions."],
    v: "Load the maximum planned table from every neighbor simultaneously, restart all sessions at once, and confirm memory stays under the limit and all sessions converge within the convergence budget.",
    dep: ["route-memory-pools","adj-rib-in","hardware-offload-programming"]
  },
  "convergence-vs-stability": {
    s: "The tension between reacting quickly to changes and not reacting to noise: every timer, throttle and detector sets a point on that line.",
    d: "Faster detection, less delay before recomputation and no pacing give quick recovery and propagate every transient. Slower settings absorb flapping and lengthen each outage. Techniques differ in cost: fast detection and precomputed backups improve speed without much added instability, while shorter timers do not. Settings must be consistent between routers, since mismatches cause transient loops. A network's targets, such as sub-second for core failures and minutes for the internet, decide where each knob goes.",
    k: ["Fast reaction locally with slow propagation globally vs uniform speed: local repair gives quick recovery and global damping protects the network, with more mechanisms.", "Tuning from measurement vs defaults: measured values fit the network, defaults are safe and slow."],
    p: ["Timers tightened to pass a lab test cause flaps under production load.", "Different tunings in different regions cause loops at their boundaries during reconvergence."],
    v: "Inject representative failures and flap events in a lab and record both outage duration and number of routing changes propagated; confirm both are within the targets set for the network.",
    dep: ["fast-failure-detection","spf-throttling","update-pacing"]
  },
  "failure-domains": {
    s: "How far the effects of a fault spread: which failures stay local, which affect an area, and which can take down the whole network.",
    d: "Areas, route reflector clusters, separate processes, separate instances and policy boundaries all limit blast radius. A flooding bug can reach every router in an area, a policy error can leak to every neighbor, and a single process crash resets all of its sessions. Design identifies which components share fate and breaks the sharing where it is cheap. Limits such as maximum prefixes, rate limits on updates and protocol isolation exist to stop a fault from crossing a boundary.",
    k: ["Isolation boundaries vs simplicity: more boundaries contain faults and add configuration and edge cases to each.", "Failing closed vs open at a boundary: closed stops bad data and may cut service; open keeps service and passes the problem along."],
    p: ["Two redundant components in one process or one power domain fail together.", "A boundary with no limits passes one neighbor's leak straight through to all others."],
    v: "Inject a fault such as a route leak or a crashing protocol and confirm only the intended domain is affected, with counters and alarms showing where it stopped.",
    dep: ["max-prefix-limits","process-supervision","areas-and-levels"]
  },
  "configuration-safety": {
    s: "The set of practices that keep a configuration change from causing an outage: validation, staged rollout, commit confirmation, and review of what a change will do.",
    d: "Most large routing outages come from changes, not from hardware. Defense is layered: schema validation, policy tests, preview of what a change alters, a canary device, automatic revert, and rate limits on pushing changes to many devices. The daemon supports these by atomic commits and diffs. Automation adds speed and the ability to make the same mistake everywhere at once, so safety must be built into the tooling, not left to attention.",
    k: ["Gradual rollout vs everywhere at once: gradual finds errors on few devices and takes longer; all at once is quick and spreads a mistake instantly.", "Human review vs automated checks: humans catch intent errors and miss volume; automation checks everything and lacks intent."],
    p: ["A change tested on one device model fails on another that implements a default differently.", "Automation pushes a bad change to every device before the first alarm is noticed."],
    v: "Push a deliberately harmful change through the pipeline in a lab and confirm that it is stopped at the earliest stage that should catch it, and that nothing past that stage received it.",
    dep: ["commit-and-rollback","policy-testing","config-validation"]
  },
  "trust-model": {
    s: "What the daemon assumes about its neighbors and the data it receives, and which checks exist because those assumptions can be wrong.",
    d: "Internal neighbors are partly trusted, customers are trusted for their own prefixes only, peers and providers are trusted for little. Every session type has a different inbound policy, limit, and authentication level. The protocols were designed in a time of trust, so protections were added: authentication, hop limit checks, origin and path validation, maximum prefixes and control-plane rate limiting. The trust model should be explicit: for each neighbor, what it may announce, how much, and what happens if it breaks the rule.",
    k: ["Default distrust with explicit allowance vs default trust: distrust prevents most leaks and requires work for every new neighbor.", "Cryptographic validation vs operational filtering: cryptography proves claims and needs wide deployment; filtering works today and relies on accurate data."],
    p: ["A neighbor treated as trusted because it is a customer leaks provider routes through a mistake.", "Security features enabled on some sessions and not others leave the weakest as the entry point."],
    v: "For each neighbor class, send routes that violate its permitted set and confirm they are rejected, counted and logged, and that exceeding the limits triggers the configured action.",
    dep: ["import-export-filters","neighbor-authentication","origin-validation"]
  },
  "interoperability": {
    s: "The need to work with other implementations of the same protocols, including old versions and their bugs, which shapes every parsing, negotiation and default decision.",
    d: "A daemon exchanges messages with software from other sources, at other versions, with its own interpretations of ambiguous text. Interoperability depends on strict sending, tolerant receiving within safety limits, capability negotiation, and conformance tests against other implementations. Defaults differ between implementations, so a configuration moved between them behaves differently. Changes such as a new default or a stricter parser are interoperability events, since they affect networks the daemon's authors do not control.",
    k: ["Strict receiving vs tolerant: strict finds bugs and breaks sessions with imperfect neighbors; tolerant keeps networks running and hides bugs.", "Testing against a few implementations in a lab vs observing real deployments: lab tests are repeatable and narrow; field data is broad and uncontrolled."],
    p: ["A stricter parser in a new release resets sessions with a neighbor that has long sent slightly malformed messages.", "A configuration migrated between implementations keeps its text and changes its meaning because defaults differ."],
    v: "Run the daemon against a panel of other implementations and versions in a lab covering session setup, updates with unusual attributes, and restarts, and confirm every pair interoperates with no resets.",
    dep: ["message-codec","capability-negotiation"]
  }
});
