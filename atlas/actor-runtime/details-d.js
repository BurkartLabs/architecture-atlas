// Details for the actor runtime plate, part 4: remoting, serialization, scheduler, cross-cutting.
ATLAS.details("actor-runtime", {
  "location-transparent-references": {
    s: "References that look and behave identically whether the target is local or on another node, so code sends the same way and placement becomes a deployment choice.",
    d: "A remote reference contains the target node's address and the path. Sending serializes the envelope and hands it to the transport. Programs gain freedom to move actors without code changes. Transparency is limited by physics: remote sends are slower, can be lost, are serialized with copy semantics and can fail independently, so protocols must be designed as if every send might be remote. Designs that depend on shared memory or instant delivery break when placement changes.",
    k: ["Uniform local and remote sends vs explicit remote calls: uniform code is flexible and hides latency and failure, explicit calls make costs visible and spread across the code.", "Serialize even when local in tests vs only when remote: always serializing finds encoding bugs early at some cost, remote-only serialization is fast and misses them."],
    p: ["Passing a mutable object by reference works locally and silently breaks across nodes where a copy is made.", "Assuming remote sends have local latency in a chatty protocol makes it unusably slow."],
    v: "Run the same protocol test with all actors on one node and again spread over three nodes, and confirm identical results, with serialization of every message exercised in the second run.",
    dep: ["actor-references", "node-transport", "serializer-registry"]
  },
  "node-transport": {
    s: "The layer that moves envelopes between nodes over network connections, providing framing, ordering per connection and detection of broken links.",
    d: "Nodes keep long-lived connections, typically TCP or a datagram transport with reliability added. The transport frames serialized messages, batches small writes, manages send buffers and reconnects on failure. Throughput depends on batching and buffer sizes, latency on avoiding head-of-line blocking. It reports connection failure upward so that membership and watches can react. Its hard parts are overload handling when a peer is slow, and fairness between large and small messages sharing a connection.",
    k: ["Stream transport vs datagram with custom reliability: streams are mature and suffer head-of-line blocking, datagrams avoid it and require building retransmission.", "Large send buffers vs small: large buffers absorb bursts and add memory and latency, small ones apply pressure early."],
    p: ["A slow peer fills the send buffer and, without a bound, grows memory on the sender.", "A large message blocks smaller urgent ones on the same connection."],
    v: "Send ten thousand messages between two nodes while killing the connection twice, and confirm reconnection happens, upper layers are notified of each break, and throughput recovers to its prior level.",
    dep: ["connection-handshake", "compression-and-framing"]
  },
  "connection-handshake": {
    s: "The exchange when two nodes connect that confirms identity, protocol version and node incarnation, before any application message is accepted.",
    d: "On connect each side sends its address, a unique incarnation id generated at node start, the protocol version and optionally credentials. The incarnation id tells peers that a node restarted on the same address, so state tied to the old incarnation, such as sequence numbers and watches, is reset or terminated. Version negotiation lets mixed versions agree on a common format. A failed handshake closes the connection, and repeated failures must be rate limited.",
    k: ["Incarnation id in the handshake vs address only: ids distinguish a restarted node from a reconnect, while address alone confuses them.", "Fail on version mismatch vs negotiate down: failing is safe and blocks rolling upgrades, negotiating allows mixed versions with more code."],
    p: ["A restarted node reusing its address is treated as the old one, and messages meant for the old incarnation reach it.", "A handshake without a timeout lets a stalled peer tie up connection slots."],
    v: "Restart a node on the same address and confirm peers detect the new incarnation id, drop old watch and sequence state, and report termination of actors from the previous incarnation.",
    dep: ["node-transport", "transport-security"]
  },
  "association-and-lanes": {
    s: "The per-peer logical channel built on connections, with several parallel lanes for throughput, and ordering preserved within each lane.",
    d: "An association represents the relationship to one remote node incarnation and owns its outbound queue. Messages are assigned to a lane, often by hashing the recipient, so messages to one actor stay ordered while different actors use different connections in parallel. Separate lanes may carry control traffic and large messages so they cannot be blocked by bulk data. Queues per lane are bounded, with overflow going to dead letters. Lane count trades parallelism for connections and ordering scope.",
    k: ["Lane chosen by recipient hash vs single connection: hashing raises throughput and keeps per-recipient order, while one connection keeps global per-peer order and caps throughput.", "Dedicated control lane vs shared: dedicated keeps heartbeats timely and uses another connection."],
    p: ["Routing messages for one actor through different lanes breaks per-sender ordering.", "A bounded lane queue that overflows during a peer pause silently drops messages."],
    v: "Send large payloads and heartbeats concurrently between two nodes and confirm heartbeat latency stays flat, while messages to one recipient arrive in sent order.",
    dep: ["node-transport", "per-sender-ordering", "failure-detector"]
  },
  "remote-deployment": {
    s: "Creating an actor on another node from the current one, by sending a description of what to build, so placement of new actors can be chosen at runtime.",
    d: "The deployer sends a serializable props description and a target address; the remote node instantiates the actor under a designated remote parent and returns a reference. This depends on the code being available on the target and on trusting the sender, as it executes the described class. Because of that, many systems restrict it to an allow-list or avoid it for sharding and discovery. Supervision across nodes is also subtler, because the parent's node may fail independently.",
    k: ["Remote deployment vs asking a remote service actor to spawn: deployment is generic and widens the attack surface, a service actor exposes only what it chooses.", "Parent on the deploying node vs remote parent: a local parent keeps control and ties lifetime to its node, a remote parent survives the caller."],
    p: ["Allowing arbitrary class names in deployment requests permits remote code execution.", "A child deployed remotely outlives a caller that crashed, leaking resources."],
    v: "Deploy an allow-listed actor from node A onto node B and confirm it runs there, replies to A, and stops when A leaves; attempt a non-listed class and confirm rejection.",
    dep: ["location-transparent-references", "serializer-registry", "transport-security"]
  },
  "transport-security": {
    s: "Authentication and encryption of inter-node traffic, so only members holding valid credentials can join and messages cannot be read or altered in transit.",
    d: "Connections use mutual TLS with certificates issued to nodes, verifying both identity and membership eligibility, and encrypting traffic. Certificate rotation must happen without taking the cluster down, and the trust boundary is the whole cluster: any member can send any message to any actor. Within that boundary there is typically no per-message authorization. Cost appears as handshake and CPU overhead, and failures show up as nodes that cannot join with unhelpful errors.",
    k: ["Mutual TLS vs a shared secret: certificates give per-node identity and revocation with more operations, a shared secret is easy and weak when leaked.", "Encrypt all traffic vs trusted network only: encryption protects against internal sniffing at a CPU cost, trusted network is cheaper and fragile."],
    p: ["An expired certificate on one node makes it silently unreachable, and looks like a network fault.", "Assuming transport authentication also authorizes what a member may send."],
    v: "Connect a node with a valid certificate and one with an invalid one: confirm the first joins and encrypted traffic is unreadable on the wire, while the second is refused with a logged reason.",
    dep: ["connection-handshake", "node-transport"]
  },
  "system-message-channel": {
    s: "A reliable, ordered channel for the runtime's own control messages, such as watch, unwatch and terminated, kept separate from lossy application sends.",
    d: "Application messages are at-most-once, but death watch and remote deployment need reliability. The system channel adds sequence numbers, acknowledgments and retransmission per association, and it is resent after reconnect until acknowledged. If the peer incarnation changes, the channel is reset and pending watches are failed. Its traffic is small but must never be blocked by data, so it uses its own lane and priority.",
    k: ["Reliable control channel vs unreliable with periodic repeats: acknowledged channel gives exact semantics with state per peer, repeats are stateless and may lag.", "Shared queue vs separate: separate avoids blocking behind bulk data and uses more connections."],
    p: ["A terminated notification stuck behind bulk traffic arrives after the work it should have stopped.", "Resending control messages after an incarnation change applies them to the wrong actor."],
    v: "Drop packets between two nodes while an actor stops and confirm the remote watcher still receives one terminated message after retransmission, and none are duplicated.",
    dep: ["association-and-lanes", "connection-handshake"]
  },
  "serializer-registry": {
    s: "The table binding each message type to a serializer and identifier, consulted on every send that leaves the process or is stored.",
    d: "Configuration maps type or marker interfaces to named serializers, each with a numeric id that is written into the output so the reader can find the matching serializer. The registry resolves the most specific binding and fails when none matches, preferably early. Choosing a general serializer for everything can allow arbitrary types to be decoded, which is a security risk, so bindings are typically explicit. Ids must never be reused, because stored data refers to them.",
    k: ["Explicit bindings vs a default catch-all serializer: explicit bindings prevent accidental, unsafe encodings and require registration for each type, catch-all is easy and invites incompatibilities.", "Numeric ids vs class names in the stream: ids are compact and need a registry discipline, names are self-describing and rename-sensitive."],
    p: ["Reusing a serializer id for a different implementation makes old stored data decode as garbage.", "Falling back to a generic object serializer allows an attacker to instantiate arbitrary classes."],
    v: "Send a message of every registered type through the registry and back, and confirm equality; send an unregistered type and confirm a clear error at send time instead of a failure at the peer.",
    dep: ["wire-formats", "type-manifests"]
  },
  "wire-formats": {
    s: "The concrete byte encodings used for messages and stored events, such as schema-based binary or text formats, chosen for size, speed and evolvability.",
    d: "Schema-based binary formats give compact output, fast encoding, and explicit rules for adding and removing fields. Text formats are readable and larger. Built-in language object serialization is convenient and fragile across versions and unsafe on untrusted input. The runtime lets different types use different formats, such as a schema format for application messages and a fixed hand-coded one for its own protocol. The choice affects every compatibility decision, because the format is the contract.",
    k: ["Schema-based binary vs text: binary is smaller and faster with tooling to learn, text is debuggable and costs bytes and parse time.", "One format everywhere vs per type: one is uniform, while per type allows tuning hot messages."],
    p: ["Default object serialization breaks when a class is renamed or a field changes.", "Large messages encoded in text inflate bandwidth and CPU on a hot path."],
    v: "Encode a message with the current format, decode with a build one version older and one newer, and confirm unknown fields are ignored and missing fields take defaults.",
    dep: ["type-manifests", "compression-and-framing"]
  },
  "type-manifests": {
    s: "A short string or number stored with each serialized message that tells the reader which concrete type or version to decode the bytes as.",
    d: "Bytes alone do not say what they are. The manifest, written beside the payload, identifies the type, and often a version, so the reader picks the right decoder, and old and new forms can coexist. Using stable logical names instead of class names lets code be moved or renamed. During evolution, manifests are how a reader recognizes an older shape and routes it through a migration. They add bytes per message and must be maintained as part of the public contract.",
    k: ["Logical stable names vs class names: stable names survive refactoring and need a mapping, class names are automatic and break on rename.", "Version in the manifest vs inside the payload: manifest versions allow routing before decode, in-payload versions keep one decoder."],
    p: ["Renaming a class without keeping its manifest alias leaves old data unreadable.", "A manifest naming a type absent in an older node makes that node fail on every message of that type."],
    v: "Rename a message class while keeping its manifest alias, then read messages and events written before the rename and confirm they decode to the new class.",
    dep: ["serializer-registry"]
  },
  "schema-evolution": {
    s: "The practice of changing message and event shapes while old and new versions coexist, using additive changes, defaults and staged rollouts.",
    d: "Rolling upgrades and stored events mean a reader may see data written by any previous version, and an older node may receive messages from a newer one. Safe changes are adding optional fields with defaults and adding new message types after every node can read them. Removing or changing the meaning of fields takes several releases: first accept both, then write the new form, then stop writing the old. Tests that decode saved samples from every released version are the only reliable guard.",
    k: ["Additive changes only vs breaking changes with migrations: additive is safe and accumulates clutter, breaking changes clean up and need multi-step rollouts.", "Forward compatibility vs backward only: forward lets old nodes ignore new fields, and restricts how new features are introduced."],
    p: ["Introducing a new message type and sending it before all nodes understand it drops it or breaks them.", "Changing a field's meaning without changing its name corrupts old events silently."],
    v: "Keep a directory of serialized samples from each released version and, in the build, decode all of them with the current code; confirm every sample decodes and maps to the expected current value.",
    dep: ["wire-formats", "type-manifests"]
  },
  "compression-and-framing": {
    s: "Delimiting messages in the byte stream with length prefixes, optionally compressing large payloads, and enforcing a maximum message size.",
    d: "Each message is written with a length header so the reader can split the stream. Large payloads can be compressed when above a size threshold, as small ones cost more to compress than they save. A maximum frame size protects receivers from memory exhaustion by a bogus or buggy length. Big messages also hurt latency for others sharing the connection, so streaming chunks or sending a reference to data in storage is usually better than one huge message.",
    k: ["Compress above a threshold vs always: thresholding skips useless work on small messages, always compressing is simple and wastes CPU.", "Reject oversize frames vs chunk them: rejection protects memory and surfaces design errors, chunking supports large payloads and complicates reassembly."],
    p: ["No maximum frame size lets a corrupted length field allocate gigabytes.", "Compressing already compressed data wastes CPU and increases size."],
    v: "Send messages just under and just over the maximum frame size and confirm the first is delivered and the second is rejected with a clear error without disturbing other traffic on the connection.",
    dep: []
  },
  "dispatcher": {
    s: "The component that takes mailboxes with pending messages, assigns them to threads and runs a bounded batch of messages per turn.",
    d: "When a message arrives for an idle actor, its mailbox is submitted to the dispatcher's executor. A thread runs the mailbox for up to a throughput limit of messages, or a time budget, then yields. Different dispatchers can be bound to different actors so critical actors get their own threads. The dispatcher guarantees that a mailbox is never run by two threads at once, which is what provides the one-message-at-a-time property. Its tuning is a trade between throughput and fairness.",
    k: ["Shared default dispatcher vs dedicated dispatchers per workload: shared maximizes utilization, dedicated isolates slow or blocking actors from critical ones.", "Large batch per turn vs small: large batches are efficient through cache locality and starve others, small batches are fair and cost more scheduling."],
    p: ["Running blocking calls on the default dispatcher starves unrelated actors.", "One dispatcher shared by everything makes a single misbehaving actor an outage for the system."],
    v: "Run a CPU-heavy actor and a latency-sensitive actor on the same dispatcher then on separate ones, and confirm the latency of the second is unaffected only in the separate case.",
    dep: ["thread-pool-executors", "mailbox-run-state", "throughput-and-fairness-tuning"]
  },
  "thread-pool-executors": {
    s: "The pools of operating system threads that execute dispatchers' work, sized and shaped by workload as fixed, elastic or fork-join pools.",
    d: "A fixed pool sized near the core count suits CPU-bound actors and avoids oversubscription. An elastic pool grows for blocking work and shrinks when idle. Fork-join style pools with work stealing keep cores busy under uneven load. Queues between the dispatcher and pool must be bounded or monitored. Pool size interacts with everything: too few threads starve actors that wait, too many cause context switching and memory use from stacks.",
    k: ["Fixed small pool vs elastic large: fixed minimizes switching and fails on blocking work, elastic tolerates blocking and costs memory and scheduling.", "Pool per dispatcher vs shared: separate pools isolate and fragment capacity, shared pools balance and couple workloads."],
    p: ["Sizing the pool by actor count instead of core count creates thousands of idle threads.", "A pool with an unbounded task queue hides saturation until memory runs out."],
    v: "Load the system until CPU is saturated and confirm thread count stays at the configured bound, run queue stays low, and throughput scales near-linearly from one to the number of cores.",
    dep: ["dispatcher", "work-stealing"]
  },
  "work-stealing": {
    s: "A scheduling approach where each worker has its own queue and idle workers take tasks from busy ones, balancing load with little contention.",
    d: "Each thread pushes and pops its own deque without locks in the common case, which keeps related work on one core with warm caches. When a thread's deque is empty it picks a victim and steals from the opposite end. This gives automatic balance for uneven task sizes. It improves throughput but gives no latency guarantee for any particular mailbox, and stealing costs cache locality. Work submitted from outside the pool goes to a shared queue.",
    k: ["Work stealing vs one shared queue: stealing scales with core count and reduces contention, a shared queue is simple and becomes a bottleneck.", "Steal one task vs half: stealing half balances faster with more cache disruption."],
    p: ["Tasks with long blocking calls trap workers and starve the tasks queued behind them.", "Heavy stealing of tiny tasks spends more time moving work than doing it."],
    v: "Run a mix of many short and a few long tasks across eight workers and confirm idle workers steal, per-worker utilization is within a few percent, and total throughput beats a single shared queue.",
    dep: ["thread-pool-executors"]
  },
  "mailbox-run-state": {
    s: "The atomic flag on each mailbox recording whether it is idle, scheduled or running, which ensures exactly one thread processes it and no wakeup is lost.",
    d: "A sender enqueues a message then attempts to change the mailbox from idle to scheduled with a compare-and-swap; the winner submits it to the dispatcher. When processing ends, the runner sets the state to idle and rechecks the queue, rescheduling if a message arrived in the gap. Suspended is another state used during failure handling, where system messages are processed and normal ones wait. Getting these transitions right is a classic lock-free problem: a missed recheck leaves a message waiting forever.",
    k: ["Atomic state machine vs a lock per mailbox: atomics avoid blocking senders and are subtle to implement correctly, a lock is simple and contends.", "Recheck after going idle vs timeouts: the recheck is immediate and exact, timeouts are simple and add latency."],
    p: ["A missed recheck between finishing and setting idle strands a message until the next send.", "Processing system messages while suspended without ordering them before user messages breaks supervision."],
    v: "Hammer one actor from many threads with a stress test that counts messages sent and processed over millions of iterations and confirm equality with no stalls longer than a scheduling quantum.",
    dep: ["mailbox-queue"]
  },
  "throughput-and-fairness-tuning": {
    s: "Settings that bound how many messages or how much time one actor may use per turn, trading overall throughput against latency for others.",
    d: "A throughput value of one gives maximal fairness and many context switches; a large value approaches batch processing, with better cache behavior and a few actors holding threads for long. Time-based limits bound a turn regardless of message cost. Starvation of low-traffic actors by busy ones is the symptom of tuning too far toward throughput. Tuning must be evaluated on tail latency under realistic load, not on average throughput alone.",
    k: ["High throughput setting vs fairness: high throughput improves total rate and raises tail latency for others, low fairness setting evens latency and costs overhead.", "Message-count limit vs time limit: counts are cheap to check and ignore message cost, time limits protect against slow messages and need a clock read."],
    p: ["Tuning on a benchmark with uniform actors fails to show starvation in mixed production traffic.", "Setting the limit far above queue depth makes it a no-op while appearing configured."],
    v: "Run one flooding actor and one rarely messaged actor, vary the throughput setting, and chart the rare actor's p99 latency against total throughput to choose a point on the curve.",
    dep: ["dispatcher", "mailbox-and-throughput-metrics"]
  },
  "blocking-isolation": {
    s: "Running blocking operations, such as disk and database calls, on separate dispatchers so they cannot occupy the threads that serve ordinary actors.",
    d: "Actors assume handlers return quickly. A blocking call holds a thread, and a few such calls can use up a small pool and freeze everything. The remedy is a dedicated, larger pool for blocking work, to which the actor delegates by running the call there and receiving the result as a message. It also means bounding that pool, since unlimited blocking threads defeat the purpose. Detection is the hard part, as blocking can hide in libraries, logging and class loading.",
    k: ["Dedicated blocking dispatcher vs asynchronous clients: a separate pool wraps existing blocking libraries with a thread cost, asynchronous clients avoid threads and require such libraries.", "Bounded blocking pool vs unbounded: bounded protects memory and queues work under load, unbounded never waits and can exhaust the system."],
    p: ["A synchronous database call inside a handler on the default dispatcher stalls unrelated actors during a slow query.", "A blocking pool shared by all features lets one slow dependency block all others."],
    v: "Make a database call take thirty seconds from an actor on the blocking pool and confirm that the default dispatcher's message latency for other actors stays unchanged during it.",
    dep: ["dispatcher", "thread-pool-executors", "async-task-integration"]
  },
  "async-task-integration": {
    s: "Bridging actors with futures and asynchronous libraries by converting completions back into messages, so results re-enter the actor's single-threaded world safely.",
    d: "An actor starts asynchronous work and, instead of waiting, arranges for the completion to be sent to it as a message, often with a pipe-to-self helper. The callback itself runs on another thread and must touch no actor state; it only forwards. Any context needed later is captured before starting the work or put in the message. This keeps the actor responsive and the single-threaded guarantee intact. The cost is that state may change between starting and completion, so each result handler must re-validate assumptions.",
    k: ["Pipe result to self as a message vs reading state in the callback: piping preserves isolation and requires correlation, callbacks are direct and race.", "Stash while waiting vs keep processing: stashing keeps simple sequential logic and delays others, continuing keeps throughput and complicates state."],
    p: ["A callback mutating actor fields from another thread creates the race that actors exist to remove.", "A future that never completes leaves the actor waiting without timeout."],
    v: "Start an asynchronous call from an actor, send it other messages meanwhile, and confirm they are processed during the wait and the completion arrives as one message, with no state mutated off-thread.",
    dep: ["actor-context", "scheduled-messages", "mailbox-queue"]
  },
  "thread-affinity": {
    s: "Keeping an actor or group of actors on the same thread, or a fixed set of cores, to improve cache use and reduce cross-thread coordination.",
    d: "Normally any pool thread may run any mailbox. Pinning dispatches an actor's turns always to the same thread, so its data stays in that core's caches and related actors can communicate without cross-core traffic. It suits very low-latency pipelines and structures with a single producer and a single consumer. The costs are lost load balancing, since a pinned thread cannot help others, and risk of imbalance, so it is used for specific hot paths and not as a default.",
    k: ["Pinned threads vs pool scheduling: pinning gives locality and predictable latency, a pool balances load and uses cores fully.", "Busy-spin waiting vs parking idle threads: spinning reduces wake-up latency and burns a core, parking saves power and adds microseconds."],
    p: ["A pinned actor that blocks stalls every actor assigned to its thread.", "Pinning more threads than available cores makes them compete and worsens latency."],
    v: "Pin a producer and consumer actor to separate cores and compare p99 message latency with the pool dispatcher under the same load, confirming lower and more stable latency while core utilization is reported.",
    dep: ["dispatcher", "thread-pool-executors"]
  },
  "delivery-semantics": {
    s: "The decision about what a send promises: at most once, at least once or effectively once, and who is responsible for retries and duplicate handling.",
    d: "Every layer from the mailbox to the transport to persistence either preserves or weakens the promise made at the top. The default is at-most-once, cheap and lossy; stronger guarantees require storing messages, acknowledging and retrying, and receivers that tolerate duplicates. The decision should be made per message class: commands that must happen need acknowledged delivery, while telemetry can be lost. Mixing them without being explicit produces systems that appear reliable until the first failure.",
    k: ["At-most-once by default vs reliable by default: lossy default keeps the fast path cheap and demands explicit upgrade, reliable default is safe and slow everywhere.", "Dedupe at the receiver vs unique operations: receiver dedupe is general and costs state, naturally idempotent operations need none and are not always possible."],
    p: ["Assuming a send succeeded because no error was thrown.", "Adding retries without idempotent receivers turns lost messages into duplicates."],
    v: "Inject loss, duplication and reordering between every pair of components in a test and confirm each message class meets its declared guarantee, with violations reported by class.",
    dep: ["at-most-once-delivery", "at-least-once-delivery", "dead-letters"]
  },
  "failure-model": {
    s: "The explicit list of failures the system is built to survive, such as process crash, node loss, partition and slow peers, and those it does not handle.",
    d: "Supervision handles failures inside a process, the failure detector handles nodes, and storage handles restarts, but each has assumptions: clocks drift a little, crashes stop cleanly, partitions heal. Stating the model, including what is not covered such as corrupted data or malicious nodes, prevents designs that rely on the impossible, such as perfect failure detection. It also sets timeouts, retry budgets and quorum sizes, which all derive from assumed failure durations and frequencies.",
    k: ["Crash-stop assumption vs tolerating arbitrary behavior: crash-stop is practical and cheaper, tolerating arbitrary or malicious behavior needs far heavier protocols.", "Optimizing for rare partitions vs frequent slow nodes: the second is more common in practice and shapes timeouts and backpressure."],
    p: ["Treating unreachable as dead leads to two live copies of one entity.", "Testing only clean crashes misses pauses, slow disks and asymmetric links."],
    v: "Write down the failure list and, for each entry, point to a test that injects it and an observed outcome; any entry without both is an untested assumption.",
    dep: ["supervision-tree", "failure-detector", "split-brain-resolver"]
  },
  "ordering-and-consistency": {
    s: "The decision about which orderings the system guarantees, per sender, per entity or per partition, and which consistency readers can expect.",
    d: "Actors give per-pair ordering and a single writer per entity. Beyond that, ordering is weak: events from different entities have no global order, gossip is eventually consistent, and sharding briefly pauses entities during moves. Applications that need cross-entity invariants must add coordination, such as a single owning entity, sagas or consensus. Choosing the entity boundary is the central consistency design decision, since transactions inside one actor are free and across actors are expensive.",
    k: ["Large entities holding invariants vs fine-grained entities with coordination: large entities give simple consistency and concentrate load, fine-grained scale and need sagas.", "Eventual reads vs read-your-writes via the owning entity: eventual reads are cheap and stale, routing through the owner is exact and adds load."],
    p: ["Assuming events from different entities arrive at a projection in a global order.", "Two entities updated by one request without compensation leave inconsistent state after a partial failure."],
    v: "For each business invariant, name the single actor that enforces it and run a concurrent stress test checking that invariant holds under failures and shard moves.",
    dep: ["per-sender-ordering", "virtual-actor-activation", "event-journal"]
  },
  "bounded-resources": {
    s: "The principle that every queue, buffer, table and retry count has a limit and an overflow behavior, set deliberately and not discovered as an outage.",
    d: "Mailboxes, stashes, send buffers, pending-request tables, timer counts, entity counts and retry loops all grow when input outpaces processing. A bounded design assigns each a limit and decides, in advance, what happens at the limit: reject, drop, slow the sender or fail visibly. Limits must compose, since a bounded stage after an unbounded one only moves the problem. Capacity planning uses these limits and the metrics that show how close each is.",
    k: ["Reject at limits vs buffer deeper: rejecting protects the process and pushes failure to callers, buffering rides out bursts and risks collapse.", "Static limits vs adaptive: static limits are predictable and wrong under changing load, adaptive limits track capacity and can oscillate."],
    p: ["One unbounded buffer anywhere in the pipeline defeats every bound elsewhere.", "Limits set with no metrics on how often they are reached are never tuned."],
    v: "Overload the system at ten times its capacity and confirm memory, thread count and queue sizes stay flat, rejections rise, and latency of accepted requests stays bounded.",
    dep: ["bounded-and-priority-mailboxes", "backpressure-and-flow-control", "mailbox-and-throughput-metrics"]
  },
  "compatibility-and-evolution": {
    s: "The decision about how code, messages, stored events and protocols change over time while nodes of different versions run together.",
    d: "Distributed systems are never upgraded all at once, and event-sourced ones keep old data forever. So the wire protocol, serialization bindings, event formats and cluster protocol must each have a compatibility policy, such as one version back, and a rollout order. Teams that decide this early add fields additively and test with saved samples. Teams that do not find that every change needs a full shutdown, or that a rollback is impossible because new data was written.",
    k: ["Support one old version vs many: one version keeps code simple and forces regular upgrades, many allow slow clients and multiply tests.", "Rollback-safe changes vs forward-only: rollback-safe changes need two-step releases, forward-only is faster and cannot be undone."],
    p: ["A change that writes new event shapes before rollout completes cannot be rolled back.", "Compatibility tested only between adjacent versions breaks on a skipped upgrade."],
    v: "Run a cluster with a mix of the previous and current versions under load and a restore from stored events, and confirm no deserialization errors, no dead letters of new types and a clean rollback.",
    dep: ["schema-evolution", "rolling-upgrade-support", "type-manifests"]
  },
  "security-and-trust": {
    s: "The decision about who may join the cluster, what members may do to each other, and how untrusted input and decoded data are kept from harming the system.",
    d: "Transport security authenticates nodes, but inside the cluster any member can message any actor, so a compromised node can do everything. Systems therefore restrict cluster membership, keep external input outside through gateway actors that validate it, and avoid serializers that can instantiate arbitrary types. Management endpoints need authentication, and remote deployment needs an allow-list. The trust boundary is a design decision that should be documented, since actors have no built-in notion of permissions.",
    k: ["Whole cluster as one trust domain vs per-actor authorization: one domain is simple and has a large blast radius, per-actor checks limit damage and add overhead everywhere.", "Gateway validation at the edge vs trusting internal messages: edge validation protects inner actors and must be complete, trusting internals is simple and fragile."],
    p: ["Deserializing external input with a general-purpose serializer allows code execution.", "An exposed management port lets anyone remove nodes from the cluster."],
    v: "Attempt to join with no credentials, send an unregistered type, call a management endpoint without authentication, and request a non-allow-listed deployment; confirm each is refused and logged.",
    dep: ["transport-security", "serializer-registry", "cluster-management-api"]
  },
});
