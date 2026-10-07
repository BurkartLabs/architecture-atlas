// Details for the message queue plate, part 4: cluster control, foundation, cross-cutting concerns.
ATLAS.details("message-queue", {
  "controller": {
    s: "The single active node that makes cluster-wide decisions: detecting broker failures, electing partition leaders, applying topic changes and publishing the resulting metadata.",
    d: "One controller is active at a time, chosen by the metadata quorum, with standbys ready. It tracks broker liveness from heartbeats, handles topic creation and deletion, assigns replicas, elects leaders when brokers fail and records every change as an entry in the metadata log. Brokers apply those entries to learn their roles. Because all changes flow through one place, they are ordered and consistent. The difficulty is scale: a controller handling tens of thousands of partitions must fail over quickly and process a burst of elections after a broker loss.",
    k: ["One active controller vs decisions spread across brokers: one is simple and consistent, but its speed bounds failover time and cluster size.", "Controller inside the broker process vs dedicated nodes: dedicated nodes isolate it from data load, combined is cheaper for small clusters."],
    p: ["A slow controller failover with many partitions leaves leaders unelected for minutes after a broker loss.", "A controller overloaded by data traffic on a shared node delays failure detection."],
    v: "Kill the active controller and confirm a standby becomes active within seconds, topic operations resume, and no leader decisions are lost or duplicated.",
    dep: ["metadata-quorum","metadata-log","broker-registration","leader-election"]
  },
  "metadata-quorum": {
    s: "A small group of nodes running a consensus protocol to replicate the cluster's metadata log, elect the active controller and tolerate failures of a minority.",
    d: "An odd number of voters, typically three or five, replicate the metadata log using leader-based consensus. The leader of the quorum is the active controller. An entry is committed when a majority stores it. Other brokers act as observers: they fetch the log without voting. If a majority is lost the cluster can still serve existing data but can make no metadata changes. The difficulty is sizing and membership changes, and the relationship to the consensus-service plate covers the underlying protocol.",
    k: ["Built-in quorum vs an external coordination service: built-in removes a separate system and scales metadata better, external reuses mature tooling but adds a deployment and a consistency boundary.", "Three voters vs five: three is cheaper and tolerates one failure, five tolerates two but adds write latency and cost."],
    p: ["Losing a majority of voters freezes all topic and leadership changes though data traffic continues.", "Voters sharing one failure domain defeat the point of replication."],
    v: "Stop one voter and confirm metadata changes still commit, then stop a second and confirm changes block while existing produce and fetch keep working, and resume after restart.",
    dep: ["metadata-log","clock-and-timestamps"]
  },
  "metadata-log": {
    s: "The replicated, ordered record of every cluster change: topics, partitions, replicas, leaders, configs and ACLs. Brokers rebuild their view by replaying it.",
    d: "Each change is an event appended to a single-partition log replicated by the quorum. Brokers fetch it and apply events to an in-memory image, so all see changes in the same order. Periodically a snapshot of the image is written so the log can be truncated and new brokers start from the snapshot instead of replaying everything. This is the same log structure used for data, applied to the control plane. The difficulty is snapshot consistency and keeping brokers' images identical and fresh.",
    k: ["Event log plus snapshots vs a mutable metadata store: events give ordering, audit and easy replication, but need snapshot and compaction machinery.", "Pull-based observers vs controller pushes: pulling reuses the fetch machinery and handles slow brokers, push gives lower propagation delay."],
    p: ["A broker with a stale image keeps routing to an old leader until it catches up.", "Without snapshots, a new broker replays years of changes before it can serve."],
    v: "Create a topic and confirm the matching event appears in the metadata log, then start a new broker from a snapshot and confirm its image equals an existing broker's.",
    dep: ["append-only-log","metadata-quorum"]
  },
  "broker-registration": {
    s: "How a broker announces itself to the controller and proves it is alive with periodic heartbeats, so failures are detected and its partitions moved.",
    d: "At startup a broker registers with its identity, listeners, rack and supported feature versions, and receives a session. It then sends heartbeats carrying its metadata progress. If heartbeats stop for the session timeout, the controller fences the broker and elects new leaders for its partitions. A controlled shutdown first asks the controller to move leaders away. A broker is not made active until it has caught up on metadata. The difficulty is timeout tuning: too short causes false failures from pauses, too long delays failover.",
    k: ["Short session timeout vs long: short fails over fast but treats a long pause as death, long avoids flapping and leaves partitions unavailable longer.", "Controlled shutdown with leader hand-off vs abrupt stop: hand-off avoids a failover gap, abrupt stops are simple and cause an election storm."],
    p: ["A broker paused by host overload loses its session, is fenced, and then immediately tries to rejoin, flapping.", "Skipping controlled shutdown during deploys causes avoidable unavailable intervals per restart."],
    v: "Stop heartbeats from one broker and confirm it is fenced after the timeout and its partitions get new leaders, then restore and confirm it rejoins only after catching up.",
    dep: ["controller","metadata-log","clock-and-timestamps"]
  },
  "metadata-propagation": {
    s: "How brokers and clients learn the current layout: brokers apply the metadata log, and clients fetch metadata, cache it and refresh when a request hits the wrong broker.",
    d: "Each broker keeps an image of the cluster built from the log. A client sends a metadata request to any broker and gets topics, partitions, leaders and listener addresses, caching it for a period. If a request returns a not-leader error, the client refreshes at once and retries. Brokers also tell each other about leader changes. The difficulty is staleness: during a failover, clients and brokers hold different views for seconds, which is where most transient errors come from.",
    k: ["Client-pulled metadata with refresh on error vs broker-pushed updates: pull works through firewalls and scales to many clients, push is faster but needs long-lived channels.", "Long metadata cache vs short: long reduces load, short shortens the window of wrong routing after a change."],
    p: ["Advertised listener addresses unreachable from the client network make metadata point clients to hosts they cannot connect to.", "Mass metadata refreshes after a failover add load while the cluster is already stressed."],
    v: "Move a partition's leader and measure the interval during which clients get not-leader errors, confirming they refresh and succeed on retry within the metadata refresh bound.",
    dep: ["metadata-log","bootstrap-discovery","controller"]
  },
  "group-coordinator": {
    s: "The broker role that manages one consumer group: tracking members by heartbeat, running rebalances, and storing the group's committed offsets in an internal log.",
    d: "Each group maps by hash of its name to one partition of an internal topic, and the leader of that partition is the group's coordinator. Members find it through a lookup request, then join, sync, heartbeat and commit through it. It runs the state machine for group generations and declares members dead on missed heartbeats. Because state lives in a replicated partition, a coordinator failure moves to the new leader with state intact. The difficulty is load: one very large group, or many groups hashing to one coordinator, concentrates work.",
    k: ["Coordinator as the leader of an internal partition vs a separate coordination service: using a partition reuses replication and failover, but ties group load to partition placement.", "Coordinator assigns partitions vs a member does: coordinator-side removes client version skew, member-side allows custom strategies."],
    p: ["Thousands of heavy groups mapping to the same internal partition overload one broker.", "A coordinator failover pauses every group it serves until state is loaded."],
    v: "Find a group's coordinator, stop that broker, and confirm members find the new coordinator, the group generation continues and committed offsets are intact.",
    dep: ["internal-topics","consumer-groups","leader-election"]
  },
  "internal-topics": {
    s: "System-owned replicated logs the cluster uses to store its own state: committed offsets, transaction states and connector or registry data, using the same machinery as user data.",
    d: "Committed offsets are keyed records in a compacted internal topic, so only the latest value per group and partition is retained. Transaction state and connector configurations are stored the same way. Reusing logs gives replication, failover and compaction for free. Users generally cannot write to these topics but can read them for tooling. The difficulty is that their health is a hidden dependency: an under-replicated or overloaded internal topic stalls group commits and transactions.",
    k: ["System state in compacted logs vs an external database: logs reuse replication and tooling with no extra system, but state growth and cleaner lag need attention.", "High replication for internal topics vs the cluster default: high replication protects critical state, but a small cluster cannot satisfy it at creation."],
    p: ["An internal topic created with replication one on a small test cluster is never raised and loses offsets on one failure.", "Compaction lag on the offsets topic inflates group startup time as partitions load."],
    v: "Commit offsets for many groups, confirm records exist in the offsets topic with replication at the configured level, and after compaction only the latest per group and partition remains.",
    dep: ["log-compaction","partitions","replica-roles"]
  },
  "partition-reassignment": {
    s: "Moving a partition's replicas to different brokers, adding or removing copies while keeping it available, used for expansion, decommissioning and balance.",
    d: "An operator or tool submits a target replica list. The controller adds the new replicas, which fetch the full log from the leader, waits until they are in sync, then removes the old ones and elects a leader if needed. Throttles cap copy bandwidth. Moves can run for hours for large partitions and many at once. The partition remains readable and writable throughout. The difficulty is the data volume copied, its effect on live traffic and what to do when a move stalls or a target broker fails.",
    k: ["Throttled moves over a longer period vs unthrottled fast moves: throttling protects live latency but prolongs imbalance, unthrottled finishes quickly and can hurt clients.", "Move a few partitions at a time vs all at once: small batches limit disruption, a single big plan finishes sooner and loads the network."],
    p: ["Starting a move for terabytes without a throttle saturates the network and raises client latency.", "A stuck reassignment leaves a partition with extra replicas and unclear ownership until cancelled."],
    v: "Move a partition to a new set of brokers under load and confirm clients see no errors beyond brief retries, the new replicas reach in-sync state and the old ones release their disk space.",
    dep: ["controller","follower-fetch","in-sync-replica-set"]
  },
  "rolling-upgrades": {
    s: "Upgrading brokers one at a time while the cluster serves traffic, with version and feature flags that keep old and new nodes compatible until all are done.",
    d: "Each broker is stopped through a controlled shutdown, upgraded, restarted and allowed to catch up before the next. During the process mixed versions talk to each other, so wire and storage formats are negotiated to the lowest common version. Once all brokers run the new software, an operator raises a cluster-wide feature level to enable new behavior. Rollback is possible until that step. The difficulty is the in-between state: a feature enabled too early breaks old nodes, and a rollback after data was written in a new format may not be possible.",
    k: ["Separate software upgrade from feature enablement vs enable at once: separation allows safe rollback of software, at the cost of a second step to remember.", "One broker at a time vs in batches: one at a time minimizes risk and under-replication, batches speed up large clusters but risk losing a partition's copies."],
    p: ["Restarting the next broker before the previous one has caught up leaves partitions below minimum in-sync and blocks writes.", "Raising the feature level before every node is upgraded makes the old nodes crash on new records."],
    v: "Upgrade a three-broker cluster one node at a time under load and confirm producers and consumers report no failed sends beyond retries, under-replication returns to zero between steps, then enable the feature level.",
    dep: ["broker-registration","api-versioning","in-sync-replica-set"]
  },
  "wire-protocol": {
    s: "A compact binary request-response protocol over TCP, with length-prefixed frames, numbered request types and per-type versions, shared by clients and brokers.",
    d: "Every request has a size, a request type, a version, a correlation id and a client id, followed by a body. Responses echo the correlation id and may return in order per connection, and clients can pipeline several requests. Types include produce, fetch, metadata, group operations and admin calls. Record data is carried in the same batch format as on disk. The protocol is open, so any language can implement a client. The difficulty is evolution across many versions and the many subtle behaviors, such as throttle times and error codes, clients must implement.",
    k: ["Binary framed protocol vs text or generic request-response framing: binary is compact, fast to parse and precise, but needs per-language implementations and tooling to debug.", "Request pipelining on one connection vs one at a time: pipelining hides latency and needs ordering rules and careful in-flight limits."],
    p: ["Clients ignoring throttle or error codes in responses keep retrying and amplify an outage.", "A frame size limit smaller than the largest batch causes oversized sends to fail repeatedly."],
    v: "Capture a produce and fetch exchange, decode the frames by hand against the protocol specification and confirm sizes, versions, correlation ids and batch bytes match what the application sent.",
    dep: ["api-versioning","record-batch-format","checksums"]
  },
  "api-versioning": {
    s: "Each request type has independent version numbers, and clients and brokers negotiate the highest version both support, so old and new software interoperate during upgrades.",
    d: "On connect, a client asks the broker which versions of each request type it supports and picks the highest common one. New fields are added in new versions, with older versions ignoring them or using defaults. Brokers keep supporting old versions for a long period, converting data formats when needed, which can disable zero-copy. Deprecation removes old versions after years. The difficulty is carrying the combinatorial matrix of versions, testing it, and conversions that silently degrade performance.",
    k: ["Per-request-type versions vs one protocol version: per-type lets features evolve independently, a single version is simple and forces coordinated upgrades.", "Support old versions for years vs break quickly: long support protects slow-moving clients, quick removal reduces test matrix and conversion code."],
    p: ["An old client forces down-conversion of every fetched batch and the broker's CPU rises with no obvious cause.", "Removing an old version breaks clients nobody knew were still running."],
    v: "Connect clients of three different versions to one broker, run produce and fetch, and confirm each negotiates a different version and all records round-trip correctly.",
    dep: ["wire-protocol"]
  },
  "bootstrap-discovery": {
    s: "How a client finds the cluster: it connects to any address in a short seed list, asks for metadata and then talks directly to the brokers that lead its partitions.",
    d: "A client is given a few bootstrap addresses, often a DNS name or load balancer. It connects to one, fetches the full list of brokers and partition leaders, and opens connections to each broker it needs. The addresses brokers advertise in metadata are the ones clients use afterward, so they must be reachable from the client's network. Load balancers are fine for bootstrap but cannot sit in front of data connections, since each broker must be addressed individually. The difficulty is network topology: NAT, containers and multiple networks make advertised addresses wrong.",
    k: ["Direct connections to each broker vs a proxy in front of the cluster: direct is simple and fast, a proxy hides topology and adds hops and a capacity limit.", "Several seed addresses vs one name: several survive a single address failing, a name hides changes and moves them to DNS."],
    p: ["Brokers advertising internal addresses make clients connect successfully, fetch metadata, and then hang trying to reach unreachable brokers.", "A single bootstrap address that is down at client startup prevents it from ever connecting."],
    v: "From a client in the production network, connect to the bootstrap address, then confirm it opens direct connections to every leader's advertised address and produces successfully to each partition.",
    dep: ["wire-protocol","metadata-propagation"]
  },
  "checksums": {
    s: "A checksum over each record batch, written by the producer and verified by the broker and consumers, to catch corruption in memory, on the network or on disk.",
    d: "The producer computes a checksum over the batch bytes after the header's checksum field. The leader verifies it on append, replicas can verify on receipt, and consumers verify on read, so corruption anywhere is detected. Because the batch is stored unchanged, one checksum covers the full path. On detection, a broker refuses the write or marks the segment corrupt and re-fetches from another replica. The difficulty is that checksums detect but cannot repair, and disk errors surface only when the data is read.",
    k: ["End-to-end checksum on the batch vs per-hop checksums: end-to-end covers every component including memory, per-hop is simpler but misses corruption between hops.", "Verify on every read vs only at append: verifying each read catches bit rot at the cost of CPU, append-only is cheaper and misses later corruption."],
    p: ["A silently corrupted segment is only discovered when a consumer finally reads it, long after the good replica was replaced.", "Disabling verification for speed lets memory errors propagate to all replicas."],
    v: "Flip a byte in a stored segment and confirm a fetch reports a corruption error, the broker marks the segment bad, and re-replication from a healthy replica restores correct reads.",
    dep: ["record-batch-format"]
  },
  "io-threading-model": {
    s: "How work is divided among threads: event-loop network threads, a request handler pool, replication fetchers and background tasks, sized to keep cores busy without contention.",
    d: "A few network threads multiplex all sockets. A larger pool of handlers does the request work, including file I/O. Separate threads run follower fetchers, the log cleaner, retention checks, flushing and timers. Queues between stages absorb bursts and expose saturation. Idle percentages of the network and handler pools are the standard health signals. The difficulty is that partitions on one broker share these pools, so sizing depends on the workload mix, and a blocking disk call in the wrong thread stalls everything behind it.",
    k: ["Staged pools connected by queues vs one thread per request: stages bound resource use and expose queueing, one thread per request is simpler and collapses under many connections.", "More handler threads vs fewer: more hides disk waits and adds contention, fewer are cache-friendly and can starve under slow I/O."],
    p: ["Setting handler threads far above core count adds context switching without raising throughput.", "A blocking operation in a network thread, such as a slow remote call, stalls every connection on that thread."],
    v: "Load a broker to saturation and confirm the metric that reaches zero idle first is the pool predicted by the workload, and that adding threads there raises throughput until another stage saturates.",
    dep: ["buffer-management","clock-and-timestamps"]
  },
  "buffer-management": {
    s: "How memory is allocated for network and batch data: pooled and reused buffers, memory-mapped files and bounded sizes, so throughput does not depend on constant allocation and collection.",
    d: "Producers and consumers use fixed-size pools of buffers so that batches are filled, sent and recycled without allocating per message. Brokers read requests into pooled buffers and cap their size, and memory-map index files while leaving data to the page cache. Direct buffers avoid an extra copy between application and operating system. Bounded pools make memory predictable and turn overload into waiting. The difficulty is fragmentation, oversized requests and the interaction between managed memory pauses and latency.",
    k: ["Pooled reusable buffers vs allocating per request: pooling avoids collection pauses and allocation cost, but holds memory and needs careful release.", "Bound total request memory vs allow any size: a bound protects the process, and rejects or delays large requests under pressure."],
    p: ["A buffer not returned to the pool slowly starves it until the client blocks.", "Heap sizing far above need makes collection pauses longer and steals memory from the page cache."],
    v: "Run a steady send load and confirm allocation rate and pause times stay flat, memory use stays at the configured pool size, and a burst of oversized requests is rejected without raising memory beyond the bound.",
    dep: ["page-cache-reliance"]
  },
  "clock-and-timestamps": {
    s: "The time sources the system uses: monotonic clocks for timeouts and leases, and wall-clock timestamps on records for retention, seeking and lag, which differ and can disagree.",
    d: "Timeouts, heartbeats, session expiry and leases use monotonic clocks that never go backward. Records carry wall-clock timestamps either from the producer or assigned by the broker. Retention by time, time-based seeking and time lag use these. Across machines, wall clocks drift and can step, so ordering must never depend on them; offsets provide order. The difficulty is that skewed clocks distort retention and time lag, and that timeout settings assume bounded pauses and delays.",
    k: ["Event time from the producer vs broker append time: event time reflects when things happened, append time is monotonic per partition and not affected by client clocks.", "Monotonic clocks for timeouts vs wall-clock: monotonic is immune to clock adjustments, wall-clock is the only one meaningful across machines."],
    p: ["A producer host with a clock a day ahead produces records that never expire under time retention.", "Using wall-clock differences between machines to decide ordering produces wrong results after a clock step."],
    v: "Step a producer's clock forward an hour and confirm append-time topics are unaffected while event-time topics show shifted timestamps, and that heartbeat timeouts on the broker are unaffected.",
    dep: []
  },
  "durability-vs-latency": {
    s: "How many copies and how much disk confirmation a write waits for before it is acknowledged. Each step adds safety and adds delay, and the choice applies to every layer.",
    d: "The knobs are acknowledgement level, minimum in-sync replicas, flush policy, batching delay and compression. Waiting for all in-sync replicas survives a leader loss; flushing survives correlated power loss; each adds latency, and batching adds more. Different topics deserve different points: metrics and orders do not need the same settings. The decision must be made per topic and documented, since clients and operators pick defaults that quietly decide it for the whole system.",
    k: ["Per-topic durability settings vs one cluster default: per-topic matches cost to the data, a single default is simple and wrong for most workloads.", "Replication for durability vs flushing for durability: replication is cheap and survives node loss, flushing survives whole-site loss at high cost."],
    p: ["Defaults chosen for benchmarks, with leader-only acknowledgement, ship to production and lose data during the first failover.", "Teams assume acknowledged means on disk, when it usually means replicated in memory."],
    v: "For each topic class, kill a leader and then the whole site during writes, and confirm the number of lost acknowledged records matches the documented durability level.",
    dep: ["min-isr-and-acks","flush-policy","batching-and-linger"]
  },
  "ordering-vs-parallelism": {
    s: "More partitions, workers and in-flight requests raise throughput and each weakens ordering. The key design and consumer structure decide where order is kept and where it is given up.",
    d: "Order exists only within a partition or a single consumer. Parallelism comes from partitions, competing consumers, pipelined requests and multi-threaded processing, each of which can reorder. Choosing a key that groups related events keeps the order that matters while the rest runs in parallel. Redelivery, retries and priorities break order unless designed around. The decision shapes topic layout, consumer threading and error handling, and is expensive to reverse once data exists.",
    k: ["Key by the entity that needs ordering vs a random spread: keys keep per-entity order and allow skew, random spreads load and orders nothing.", "Single-threaded partition processing vs worker pool per partition: single thread preserves order simply, a pool needs ordering by key inside the process."],
    p: ["Choosing a key after launch means existing data is split inconsistently across partitions.", "A worker pool inside a consumer silently removes the ordering the topic was designed to provide."],
    v: "Replay a known per-key sequence at maximum parallelism through the full pipeline and confirm each key's events are applied in order while different keys interleave.",
    dep: ["ordering-guarantees","message-keys","partitions"]
  },
  "delivery-contract": {
    s: "What the system promises about loss and duplication, and what the application must do in return. The contract spans producer, broker and consumer and is only as strong as its weakest part.",
    d: "At-most-once, at-least-once and exactly-once effect are properties of the whole path. Producers must retry and deduplicate, brokers must replicate before acknowledging, and consumers must commit after effects and tolerate repeats. Transactions extend this to a read-process-write loop inside the system, and idempotent handlers extend it outside. Each stage that does not honor the contract weakens it for the rest. It should be stated per topic so that consumers know what they may assume.",
    k: ["At-least-once with idempotent consumers vs transactional exactly-once: idempotence works across any destination, transactions are cleaner but cover only data inside the system.", "Contract set by platform defaults vs by each team: platform defaults give consistency, per-team choices fit needs and drift."],
    p: ["A single component retrying without deduplication quietly turns an exactly-once design into at-least-once.", "Consumers assuming no duplicates after reading documentation about transactions that covers only part of the pipeline."],
    v: "Inject failures at each stage in turn, producer retry, broker failover, consumer crash, and confirm the end state matches the declared contract with measured loss and duplicate counts.",
    dep: ["at-least-once","exactly-once","idempotent-producer","acknowledgements"]
  },
  "failure-domains": {
    s: "Which failures the system must survive: a process, a disk, a host, a rack, a zone or a region. Replica placement, quorum size and mirroring are chosen against this list.",
    d: "Each domain implies a mechanism. A process or host failure needs replication and fast election. A disk failure needs per-disk log directories or replica copies. A rack or zone failure needs rack-aware placement and minimum in-sync settings that tolerate losing one domain. A regional failure needs asynchronous mirroring with a plan for offsets and some data loss. The metadata quorum must spread across domains too. Most outages come from correlated failures that were not on the list.",
    k: ["Survive a zone failure with synchronous replication vs mirror across regions asynchronously: zones have low latency and no loss, regions survive larger disasters and lose the last moments of data.", "Isolate failure domains physically vs rely on software limits: physical separation is strong and costs more, software quotas are cheaper and leak."],
    p: ["Replicas, voters and the load balancer all placed in one zone make the list of domains meaningless.", "Never exercising failover means the first test is a real outage."],
    v: "Take down each domain in turn in a staging cluster, one broker, one disk, one zone, and confirm availability, loss and recovery time match what the design claims.",
    dep: ["rack-aware-placement","metadata-quorum","cross-cluster-mirroring"]
  },
  "overload-and-backpressure": {
    s: "What happens when producers outpace consumers or brokers: where buffers are, what is bounded, who is told to slow down and what is dropped, decided across every layer.",
    d: "Overload is absorbed by the log's retention, by bounded client buffers, by quotas and delayed responses, by queue limits and publisher blocking, and by consumers pausing intake. Each buffer must be bounded and its overflow policy chosen: block, drop or dead-letter. Lag is acceptable until retention would delete unread data. The plan must also cover recovery, since a catch-up burst after an outage can be larger than steady load and cause a second incident.",
    k: ["Absorb in the log with lag alerts vs push back to producers early: absorbing keeps producers fast and risks expired data, pushback keeps data safe and slows upstream systems.", "Shared limits vs per-tenant quotas: shared are simple and let one tenant use everything, per-tenant protect others at the cost of unused capacity."],
    p: ["An unbounded buffer in one component converts overload into a crash after minutes of apparent health.", "Catch-up traffic after an outage saturates the network and delays recovery."],
    v: "Double the producer rate for an hour and confirm every buffer stays bounded, lag grows at the predicted rate, alerts fire before retention is threatened, and the backlog drains after the load returns to normal.",
    dep: ["backpressure","quotas-and-throttling","retention-policy","consumer-lag-monitoring"]
  },
  "compatibility-and-evolution": {
    s: "Messages stay on disk for days or years, and clients of many versions share one cluster, so formats, protocols and configurations must change without breaking existing readers or writers.",
    d: "Three things evolve: message schemas, the wire and storage formats, and cluster configuration. Schemas change under registry compatibility rules. Wire formats change through per-request versions, and storage formats through feature levels enabled after upgrades. Retained data and replay mean old formats are read long after they were written. The decision is to make every change additive, deploy readers before writers where needed, and keep a rollback path until the change is proven.",
    k: ["Additive-only schema changes vs breaking changes with a migration topic: additive keeps every reader working, breaking changes allow cleanups with dual writing and a cutover.", "Long support windows for old clients vs forced upgrades: long windows avoid outages, forced upgrades simplify the code and testing."],
    p: ["A breaking change deployed to producers first stops every consumer that has not yet upgraded.", "Replaying old retained data through new code fails on shapes nobody remembers."],
    v: "Replay the oldest retained messages through the newest consumer, and run the oldest supported client against the newest broker, and confirm both succeed with no errors.",
    dep: ["schema-compatibility","api-versioning","rolling-upgrades"]
  },
}
);
