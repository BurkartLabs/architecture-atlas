// Details for the message queue plate, part 2: routing, delivery semantics, broker, security.
ATLAS.details("message-queue", {
  "queues": {
    s: "A named, ordered buffer that holds messages until consumers take and acknowledge them. Once a message is acknowledged, the queue deletes it.",
    d: "A queue stores messages in arrival order, hands each to one consumer at a time and removes it on acknowledgement. Queues can be durable, surviving restarts, or transient; exclusive to one connection; or auto-deleted when the last consumer leaves. Messages are held in memory, on disk or both, and paged out under pressure. Unlike a log, there is no replay of consumed messages. The difficulty is that an unconsumed queue grows without bound, and large backlogs slow the broker and every other queue sharing it.",
    k: ["Delete on acknowledgement vs retain and replay: deletion keeps storage bounded and suits work distribution, while retention allows rereading, rebuilding state and multiple independent readers.", "Durable persisted queues vs in-memory transient: persistence survives restarts but costs disk writes per message, memory-only is fast but loses everything on failure."],
    p: ["A queue whose consumers died keeps growing until memory or disk pressure blocks publishers across the broker.", "Declaring a queue with different settings than it already has fails, which breaks deploys that race."],
    v: "Publish a thousand messages to a durable queue, restart the broker, and confirm all thousand are still deliverable. Acknowledge them and confirm the queue depth is zero and storage is released.",
    dep: ["acknowledgements","message-ttl-and-limits","flush-policy"]
  },
  "exchanges": {
    s: "The entry point publishers send to in the broker-queue design. An exchange holds no messages; it applies routing rules and copies each message into the matching queues.",
    d: "A publisher names an exchange and a routing key. The exchange evaluates its bindings and places the message in every queue that matches, or in none, in which case it is dropped, returned to the publisher or sent to an alternate exchange. This decouples producers from consumers: a publisher need not know which queues exist. Exchanges can be bound to other exchanges to build routing graphs. The difficulty is silent loss: a message with no matching binding vanishes unless the publisher asks for notification.",
    k: ["Publish to an exchange vs directly to a queue: an exchange allows new consumers to attach without touching producers, direct sends are simpler but couple the producer to the queue name.", "Drop unroutable messages vs return or divert them: dropping is cheap, diverting makes configuration mistakes visible."],
    p: ["Publishing before the queue binding exists loses messages with no error.", "Deep chains of exchange-to-exchange bindings are hard to reason about and to debug."],
    v: "Publish to an exchange with no matching binding and confirm the message is returned or sent to the alternate exchange. Add the binding and confirm the next message reaches the queue.",
    dep: ["bindings-and-routing-keys","exchange-types","queues"]
  },
  "bindings-and-routing-keys": {
    s: "A binding links an exchange to a queue with a pattern. A routing key on each message is matched against the patterns to choose destination queues.",
    d: "A routing key is a short string set by the publisher, often dotted words describing the message. A binding stores a key or pattern, and for header-based routing a set of header conditions, along with its target queue. On publish, the exchange matches the message against all bindings and enqueues a copy per matching queue. Bindings are created and removed by consumers or administrators at runtime. The difficulty is key design: a vocabulary that is too coarse forces consumers to filter, while one too fine multiplies bindings.",
    k: ["Rich pattern bindings vs a single topic with consumer-side filtering: broker routing saves network and consumer work, but pattern matching on every publish costs broker CPU at scale.", "Bindings owned by consumers vs by operators: consumer-owned is flexible, operator-owned is auditable."],
    p: ["Millions of unique bindings, such as one per user, slow every publish and bloat metadata.", "A typo in a pattern routes messages nowhere without an error."],
    v: "Bind two queues with different patterns, publish messages with various keys, and confirm each queue receives exactly the messages that match its pattern and no others.",
    dep: ["exchanges","exchange-types"]
  },
  "exchange-types": {
    s: "The routing algorithms an exchange can use: exact key match, wildcard pattern match, broadcast to all bound queues, or matching on message headers.",
    d: "A direct exchange routes by exact key equality. A topic exchange matches dotted keys against patterns with single-word and multi-word wildcards. A fanout exchange copies to every bound queue and ignores the key. A header exchange matches on message header values. Some systems add consistent-hash exchanges that spread keys across queues for parallelism. The type is fixed when the exchange is declared. The difficulty is choosing: topic matching is flexible but costs more per message, and fanout multiplies storage by the number of queues.",
    k: ["Direct exact match vs topic wildcard: direct is fastest and obvious, topic supports hierarchical subscriptions at the cost of matching work.", "Fanout broadcast vs per-subscriber filtering: fanout is simplest for pub-sub, but every subscriber stores a full copy of the stream."],
    p: ["Fanning out large messages to many queues multiplies disk and memory use proportionally.", "Wildcard patterns that overlap deliver the same message to a queue once, which surprises people expecting one per pattern."],
    v: "Publish key a.b.c to topic bindings a.*.c and a.#, and to direct, fanout and header exchanges, and confirm each delivers to the queues the rules predict and no others.",
    dep: ["exchanges","bindings-and-routing-keys"]
  },
  "topics-and-subscriptions": {
    s: "A topic is a named stream that producers write to and many independent subscribers read. Each subscription tracks its own position and receives every message.",
    d: "In the log design a topic is a set of partitions, and each consumer group is a subscription with its own committed offsets. In the queue design a topic is usually an exchange plus one queue per subscription. Subscriptions are independent: a slow one does not affect others, but in the queue design it holds a separate backlog. Durable subscriptions keep receiving while the subscriber is offline; non-durable ones miss messages. The difficulty is lifecycle: abandoned subscriptions accumulate backlog or retain data forever.",
    k: ["Subscriptions as offsets over shared data vs a separate queue copy per subscriber: offsets cost almost nothing per extra subscriber, copies isolate failures but multiply storage.", "Durable subscriptions vs transient: durable guarantees no gaps while offline, transient leaves no leftover state to clean up."],
    p: ["An abandoned durable subscription accumulates messages indefinitely and fills the disk.", "Assuming a new subscriber sees past messages when the design only delivers from the moment it subscribes."],
    v: "Create two subscriptions, consume only from one, and confirm both receive every message, the idle one accumulates a backlog and consuming from one does not change the other's position.",
    dep: ["topics","consumer-groups","queues"]
  },
  "competing-consumers": {
    s: "Several consumers read from one queue so each message goes to exactly one of them, spreading work across workers and tolerating the loss of any single worker.",
    d: "The broker dispatches messages to attached consumers in turn, respecting each one's prefetch window. A message handed to a worker stays locked until acknowledged. If the worker disconnects, the message returns to the queue for another. Adding workers scales throughput with no partitioning scheme, but messages may complete out of order because workers run at different speeds and redeliveries jump the line. The difficulty is that this model gives up strict ordering for scale.",
    k: ["Competing consumers on one queue vs partitioned ordered streams: competing scales freely with no key design, partitioned preserves per-key order but caps parallelism.", "Round-robin dispatch vs dispatch to the least loaded worker: round-robin is simple, load-aware needs a prefetch window to avoid starving fast workers."],
    p: ["Tasks that must run in order for one entity are processed concurrently and interleave incorrectly.", "A worker with a large prefetch hoards messages while others sit idle."],
    v: "Attach five workers to one queue and publish a thousand tasks. Confirm each task is processed once, all workers participate, and killing one worker mid-task causes its message to be processed by another.",
    dep: ["queues","prefetch-and-flow-control","redelivery"]
  },
  "priority-queues": {
    s: "Queues where messages carry a priority and higher priorities are delivered first, so urgent work is not stuck behind a large low-priority backlog.",
    d: "Publishers set a small integer priority on each message. The broker keeps a sub-queue per priority level, or an ordered structure, and serves the highest non-empty level first. Within a level, order is first in, first out. Consumers with a large prefetch will already hold lower priority messages, which defeats the effect. Log-based systems have no native priority and usually use separate topics. The difficulty is starvation of low priorities and the cost of many levels.",
    k: ["Native priority levels vs separate queues per class: native is convenient for one consumer pool, separate queues allow independent scaling and limits per class.", "Strict priority vs weighted fairness: strict serves urgent work immediately, weighted prevents low priorities from starving completely."],
    p: ["A constant stream of high-priority messages starves the low-priority backlog forever.", "A prefetch window full of low-priority messages delays an urgent one that arrives later."],
    v: "Fill a queue with low-priority messages, then publish one high-priority message and confirm it is delivered before the remaining low ones, subject to messages already prefetched.",
    dep: ["queues","prefetch-and-flow-control"]
  },
  "delayed-and-scheduled": {
    s: "Hold a message back until a given time or after a delay before it becomes visible to consumers, for retries with backoff, timers and scheduled jobs.",
    d: "Brokers implement delay by parking the message in a time-ordered structure, such as a timer wheel or a delay queue, and releasing it when due. Alternatives are a per-message expiry that routes through a dead-letter exchange into the real queue, or a series of delay topics with fixed intervals that a relay forwards. Log-based systems, which cannot reorder a partition, use delay topics or an external scheduler. The difficulty is scale and accuracy: millions of pending timers need efficient storage, and clock changes affect firing.",
    k: ["Broker-native delay vs expiry plus dead-letter routing: native is exact and simple to use, the dead-letter trick works on any broker but delays only follow queue order.", "Fixed delay tiers vs arbitrary delay: tiers fit a log with a simple relay, arbitrary delays need a timer structure that persists and recovers."],
    p: ["Per-message expiry in a plain queue only fires when the message reaches the head, so a short delay can wait behind a long one.", "Large numbers of scheduled messages held in memory are lost or slow startup after a restart."],
    v: "Schedule messages at several delays, including a short one after a long one, and confirm each becomes visible within the allowed skew of its due time, in due-time order, and survives a broker restart.",
    dep: ["queues","dead-letter-queues","clock-and-timestamps"]
  },
  "dead-letter-queues": {
    s: "A side destination where messages go after they are rejected, expire or exceed a retry limit, so one bad message does not block the stream or vanish.",
    d: "When a consumer rejects a message without requeue, the message expires, or its delivery count exceeds a limit, the broker republishes it to a configured dead-letter exchange or topic, with reason and original destination recorded. In log systems the consumer application does the same by producing to a dead-letter topic after retries. Operators inspect, repair or replay them. The difficulty is policy: retrying forever blocks progress, discarding too early loses data, and the dead-letter destination needs its own retention and monitoring.",
    k: ["Retry with delay topics before dead-lettering vs dead-letter at first failure: staged retries absorb transient errors, but extend end-to-end latency and add topics.", "Broker-managed dead-lettering vs application-managed: broker-managed is uniform and covers expiry, application-managed can add context and handle poison messages in logs."],
    p: ["Poison messages retried indefinitely block a partition or consume a worker forever.", "A dead-letter queue with no consumer, alert or retention grows silently until it causes an outage."],
    v: "Publish a message that always fails, confirm it is retried the configured number of times, then appears in the dead-letter destination with a reason and original metadata, and the main stream continues.",
    dep: ["redelivery","queues","message-ttl-and-limits"]
  },
  "message-ttl-and-limits": {
    s: "Expiry times on messages or queues and caps on queue length or size, which bound backlog by discarding, dead-lettering or blocking publishers when exceeded.",
    d: "A time-to-live can be set per message or per queue. Expired messages are dropped or dead-lettered, usually checked at the head of the queue. Length and size limits bound the backlog; at the limit the broker can drop the oldest message, reject the newest or block publishers. Memory and disk watermarks trigger broker-wide flow control. These limits keep one runaway producer from taking down shared infrastructure. The difficulty is silent data loss: an overflow policy chosen without thought discards messages nobody planned to lose.",
    k: ["Drop oldest vs reject newest at the limit: dropping oldest keeps the freshest data for live views, rejecting newest preserves order and signals the producer to slow down.", "Per-message expiry vs per-queue expiry: per-message is flexible but only evaluated at the head, per-queue is cheap and consistent."],
    p: ["An overflow limit set low silently drops business messages during a traffic spike.", "Expired messages deep in a queue still occupy memory until they reach the head."],
    v: "Set a length limit of one hundred, publish two hundred messages under each overflow policy, and confirm which hundred remain or are rejected and that dead-letter counts match.",
    dep: ["queues","backpressure"]
  },
  "acknowledgements": {
    s: "A signal from the consumer to the broker that a message was handled, letting the broker delete or advance past it. Without one, the broker assumes the message may be lost.",
    d: "In queue systems the consumer acknowledges, rejects or negatively acknowledges each message, singly or cumulatively. Until then the message is held as unacknowledged and counted against prefetch. In log systems, the equivalent is committing an offset, and on the producer side acknowledgements tell the sender how many replicas have the write. Automatic acknowledgement on delivery gives at-most-once behavior, manual after processing gives at-least-once. The difficulty is deciding when work is truly done, since a crash after the effect but before the acknowledgement duplicates it.",
    k: ["Acknowledge after processing vs on receipt: after processing never loses messages but can repeat them, on receipt is fast but loses in-flight work on a crash.", "Per-message acknowledgement vs cumulative: per-message is precise for out-of-order work, cumulative is cheaper and fits ordered streams."],
    p: ["Forgetting to acknowledge leaves messages stuck as unacknowledged until the connection closes, and then they all redeliver at once.", "Acknowledging on a channel other than the one that received the message is an error."],
    v: "Consume a message, close the connection before acknowledging, and confirm it is redelivered with a redelivered flag. Acknowledge it and confirm it is gone and the unacknowledged count falls.",
    dep: ["redelivery","queues","offset-commits"]
  },
  "redelivery": {
    s: "The broker sending a message again after it was not acknowledged in time, rejected, or its consumer disconnected, which is why delivery is normally at least once.",
    d: "When a consumer's connection drops, or a visibility or acknowledgement timeout expires, or a message is negatively acknowledged with requeue, the broker returns the message to the queue, usually marking it redelivered and incrementing a delivery count. The message may go to a different consumer and may arrive out of order. A limit on delivery count diverts repeat failures to a dead-letter destination. The difficulty is that redelivery cannot distinguish a dead consumer from a slow one, so duplicates are unavoidable and handlers must tolerate them.",
    k: ["Immediate requeue at the head vs delayed requeue: immediate keeps order and latency but hot-loops on a failing message, delayed gives the cause time to clear.", "Count-limited redelivery vs unlimited: a limit guarantees progress via dead-lettering, unlimited never gives up on transient failures."],
    p: ["Immediate requeue of a message that always fails spins a worker at full CPU and floods logs.", "Treating the redelivered flag as proof of duplication, when the first attempt may never have run."],
    v: "Kill a consumer mid-processing and confirm the message reappears for another consumer with a delivery count of two. Make it fail past the limit and confirm it moves to the dead-letter destination.",
    dep: ["acknowledgements","visibility-timeouts","dead-letter-queues"]
  },
  "visibility-timeouts": {
    s: "A lease on a received message: the broker hides it from others for a set time and makes it visible again if it is not acknowledged before the lease ends.",
    d: "Used by cloud-style queues without long-lived connections. When a consumer receives a message the queue starts a timer; during it the message is invisible to others. Acknowledging deletes it; letting the timer expire makes it visible again. Long jobs extend the lease by a heartbeat call. The timeout must exceed typical processing time or work is duplicated. The difficulty is choosing: too short causes duplicates for slow tasks, too long delays recovery from a crashed worker.",
    k: ["Short timeout with lease extension vs a long fixed timeout: extension recovers quickly from crashes while keeping long jobs, but requires the worker to heartbeat reliably.", "Per-queue default timeout vs per-receive override: a default is simple, per-receive fits jobs of very different lengths."],
    p: ["A timeout shorter than the slowest task makes the same message run on two workers at once.", "A worker that stops extending the lease while still running loses the message to another worker."],
    v: "Receive a message and sleep past the timeout, confirm a second consumer receives it, then repeat with a lease extension and confirm no second delivery while extension continues.",
    dep: ["redelivery","acknowledgements","queues"]
  },
  "at-most-once": {
    s: "Each message is delivered zero or one times: it may be lost but never repeated. The sender or receiver gives up on retries or commits progress before processing.",
    d: "At-most-once arises when a producer sends once without retrying or waiting for acknowledgement, or when a consumer commits its offset or acknowledges before processing. If anything fails afterward, the message is skipped, not redone. It has the lowest latency and no duplicates, and fits telemetry, metrics and other data where a gap costs less than a repeat. The difficulty is that loss is silent and hard to notice, and defaults in some clients quietly select this behavior.",
    k: ["Fire-and-forget producing vs waiting for acknowledgement: fire-and-forget is fastest, acknowledgement detects failures but adds a round trip per batch.", "Commit before processing vs after: before gives no duplicates and risks loss, after gives no loss and risks duplicates."],
    p: ["Using this mode for payments or orders silently loses records during failovers.", "Auto-commit on a timer can unintentionally produce at-most-once for a batch still being processed."],
    v: "Kill the consumer after commit but before processing and confirm the record is never processed again. Count lost records and confirm the number matches the in-flight batch.",
    dep: ["acknowledgements","offset-commits"]
  },
  "at-least-once": {
    s: "Each message is delivered one or more times: nothing is lost, but duplicates can appear. It is the usual default, paired with idempotent handlers.",
    d: "Producers retry until acknowledged, and consumers acknowledge or commit only after processing. Any failure between effect and acknowledgement causes redelivery, so the same message can be processed twice. This guarantees no loss for a healthy replicated system, at the cost of duplicates that rise during failures and rebalances. The difficulty is making effects safe to repeat: updates by key, deduplication tables and idempotent writes turn at-least-once into effectively once for the user.",
    k: ["At-least-once with idempotent handlers vs seeking exactly-once machinery: idempotent handlers are simple and portable, exactly-once transactions cover only certain data paths.", "Retry aggressively vs fail fast: retries preserve data through short outages, but amplify load on a struggling broker."],
    p: ["Non-idempotent side effects, such as sending an email or charging a card, repeat on every redelivery.", "A rebalance during processing hands the same batch to a second consumer while the first finishes."],
    v: "Inject a crash after processing but before commit and confirm the record is processed twice, the handler detects the repeat, and the final state equals processing it once.",
    dep: ["retries-and-timeouts","acknowledgements","idempotent-consumer"]
  },
  "exactly-once": {
    s: "Each message's effect happens once, built from an idempotent producer, atomic commits of output and offsets, and consumers that read only committed data.",
    d: "Real delivery cannot avoid retries, so exactly-once is about effects, not transmissions. Inside a log system, a read-process-write loop commits its output records and its input offsets in one transaction, so a crash either redoes the whole step with no visible duplicates or completes it. Outside the system, effects need idempotent writes or a transactional outbox. The guarantee ends at the system boundary: a call to an external service cannot be rolled back by a message transaction.",
    k: ["Transactional read-process-write inside one system vs idempotent external writes: transactions give atomicity across topics and offsets, but only for data inside the system.", "Exactly-once configuration everywhere vs only on critical paths: it adds latency and coordination, so it suits pipelines where duplicates are costly."],
    p: ["Believing the guarantee covers a database or HTTP call made inside the processing step.", "Consumers not set to read committed data see records from aborted transactions."],
    v: "Crash the processor repeatedly during a transform pipeline and confirm the output topic, read with committed isolation, contains each result exactly once and the output count equals the input count.",
    dep: ["transactions","idempotent-producer","read-committed-isolation","offset-commits"]
  },
  "transactions": {
    s: "Atomic writes across several partitions and offset commits: either all records and progress become visible together, or none do.",
    d: "A transactional producer registers an identifier with a transaction coordinator, writes records to several partitions marked as part of the transaction, and optionally adds consumer offsets. On commit, the coordinator logs a decision, then writes commit markers into each partition. On abort, abort markers are written. A fixed identifier fences old instances: a new producer with the same id bumps an epoch and blocks zombies. The difficulty is the extra round trips, markers stored in the log, and open transactions delaying readers.",
    k: ["Short frequent transactions vs long infrequent: short ones limit reader delay and rework on failure, long ones amortize marker and coordination overhead.", "Stable transactional ids per task vs random ids: stable ids fence zombie instances and keep progress consistent, random ids lose that protection."],
    p: ["A transaction left open by a stalled producer holds back every reader in committed mode until it times out.", "Sharing one transactional id between two live instances makes them fence each other repeatedly."],
    v: "Write to two partitions, abort, and confirm a committed-mode reader sees nothing. Repeat with commit and confirm both partitions' records appear together, with the consumer offset advanced in the same step.",
    dep: ["idempotent-producer","group-coordinator","internal-topics","leader-epochs"]
  },
  "read-committed-isolation": {
    s: "A consumer setting that hides records from open or aborted transactions, returning data only up to the last point where every earlier transaction is decided.",
    d: "Each partition tracks a last stable offset: the lowest offset of any still-open transaction. A consumer in committed mode reads only up to it and skips records belonging to aborted transactions, using abort markers and an index of aborted ranges. Consumers in uncommitted mode see everything as soon as it is replicated. Committed mode adds read latency equal to the longest open transaction. The difficulty is that one slow producer delays every consumer of the partition, and the filtering adds bookkeeping on fetch.",
    k: ["Committed isolation vs uncommitted reads: committed gives correct results for transactional data but waits for open transactions, uncommitted is lower latency and can expose aborted data.", "Short transaction timeouts vs long: short limits reader stalls, long allows slow processing but risks wide delays."],
    p: ["A producer that crashed mid-transaction blocks all committed readers until the transaction timeout expires.", "A downstream consumer left in the default uncommitted mode processes data that the upstream later aborted."],
    v: "Open a transaction and leave it, produce non-transactional records after it, and confirm a committed reader stalls at the open transaction while an uncommitted reader sees everything, then abort and confirm the stall clears.",
    dep: ["transactions","fetch-path","high-watermark"]
  },
  "ordering-guarantees": {
    s: "What order consumers see: total order within one partition or queue, but none across partitions, and only if retries, redeliveries and parallel workers do not reorder.",
    d: "Within a partition the log fixes one order, and consumers read it in that order. Across partitions no order exists. Retries can break order unless the producer limits in-flight requests or uses sequence numbers. In queue systems, competing consumers, redelivery and priorities all reorder. Ordering by entity is achieved by sending all of an entity's messages through one key. The difficulty is that the guarantee is narrow, and parallel processing downstream can discard it.",
    k: ["Order within a key vs global order: per-key order scales across partitions, global order forces a single partition and a single reader.", "Strict order with one in-flight batch vs idempotent pipelining: both keep order on retry, but sequence numbers allow several batches in flight."],
    p: ["Assuming order across partitions leads to logic that depends on events arriving in global sequence.", "A worker pool consuming one partition in parallel finishes records out of order."],
    v: "Send numbered records for one key through a failing network with retries and confirm the consumer sees strictly increasing numbers. Repeat across two keys and confirm order holds per key only.",
    dep: ["message-keys","partitions","idempotent-producer"]
  },
  "message-keys": {
    s: "An optional identifier on each message that selects its partition, defines which records belong together for ordering and names the entity for compaction.",
    d: "The key is bytes chosen by the producer, such as an account or device id. Hashing it chooses the partition, so all records with the key land together and in order. For compacted topics it identifies the record to keep latest. Keys do not have to be unique. Key design determines balance and ordering: a high-cardinality, evenly distributed key spreads load, while a skewed key makes a hot partition. The difficulty is that the key choice becomes permanent: changing it later reshuffles history and breaks order.",
    k: ["A fine-grained key such as entity id vs a coarse key such as tenant: fine spreads load evenly and orders per entity, coarse gives ordering across more events but risks hot partitions.", "Keyed messages vs keyless: keyed gives order and compaction, keyless gives best distribution and batching."],
    p: ["Keying by a field with few values, such as country, concentrates traffic on a handful of partitions.", "Null keys on a compacted topic are rejected or never compacted."],
    v: "Produce a million records keyed by entity id, confirm every key maps to one partition and per-partition message counts are within a small percentage of each other.",
    dep: ["partitioners","partitions","log-compaction"]
  },
  "idempotent-consumer": {
    s: "A handler designed so that processing the same message twice has the same effect as once, usually by recording processed message ids or by using naturally repeatable updates.",
    d: "Handlers achieve this by upserting by key, using conditional updates guarded by a version, or storing each processed message's id in the same transaction as its effect and skipping seen ids. A transactional outbox writes the effect and the outgoing message in one local transaction. The id table needs expiry matched to the redelivery window. The difficulty is that the dedup record and the side effect must be atomic; checking an id and then acting leaves a race, and external effects like emails cannot be rolled back.",
    k: ["Natural idempotence by upsert vs an explicit processed-id table: upserts need no extra state, an id table works for any effect but grows and needs cleanup.", "Dedup in the same database transaction vs a separate store: the same transaction is atomic and simple, a separate store allows dedup for external effects with a race window."],
    p: ["Checking a processed-id table and then writing the effect in separate steps lets two concurrent deliveries both proceed.", "Expiring dedup records sooner than the maximum redelivery delay lets late duplicates through."],
    v: "Deliver the same message ten times, including concurrently, and confirm the target state and side-effect count match a single delivery.",
    dep: ["at-least-once","message-keys"]
  },
  "broker-process": {
    s: "One server node of the messaging cluster: it owns a set of partitions or queues on its disks, serves clients and cooperates with peers on replication and metadata.",
    d: "A broker starts by loading its log directories and recovering unflushed segments, registers with the cluster, then opens its listeners. It holds the leader or follower role for many partitions at once, runs thread pools for network, requests, replication and background cleaning, and reports metrics. Brokers are mostly symmetric; any can answer metadata requests. The hard part is a long list of shared resources, disks, memory, network and file handles, that every partition competes for.",
    k: ["Many partitions per broker vs fewer larger brokers: many small brokers shrink the failure blast radius, fewer large ones are simpler to run but each failure moves more data.", "Shared disks for all partitions vs one log directory per disk: sharing balances load, per-disk directories contain a disk failure to its own partitions."],
    p: ["Slow log recovery after an unclean shutdown keeps a broker out of service for a long time.", "Running out of file handles from too many segments and connections crashes the process."],
    v: "Kill a broker with an unclean shutdown, restart it, and confirm it recovers its logs, rejoins the cluster, catches up replicas and resumes serving, with recovery time recorded.",
    dep: ["network-layer","request-handlers","checkpoints-and-recovery","broker-registration"]
  },
  "network-layer": {
    s: "The part of the broker that accepts connections, reads requests off sockets and writes responses, built around a small number of event-driven threads.",
    d: "Acceptor threads take new connections and assign them to network processor threads, each running an event loop over many sockets. Processors parse complete requests and place them on a shared request queue, and pick up responses from per-processor response queues. Back-to-back requests on a connection are handled in order. Limits on connections per client address and requested size protect memory. The difficulty is that a slow request handler pool backs up the request queue, and clients see network latency that is really queueing.",
    k: ["Few event-loop threads vs a thread per connection: event loops scale to tens of thousands of connections with little memory, but a blocking call inside one stalls many clients.", "Bounded request queue vs unbounded: a bound pushes back on clients under overload, unbounded hides it until memory runs out."],
    p: ["A single huge request can pin a processor thread and delay every other connection on it.", "Connection storms from restarting clients exhaust file handles or the accept backlog."],
    v: "Open ten thousand idle connections and confirm memory stays modest and latency for active clients is unchanged. Saturate the request pool and confirm queue time metrics rise before errors.",
    dep: ["io-threading-model","wire-protocol","request-handlers","buffer-management"]
  },
  "request-handlers": {
    s: "A pool of worker threads that take parsed requests from the queue and execute them: appending records, reading logs, answering metadata or coordinating groups.",
    d: "Each handler thread dequeues a request, checks authorization and quotas, dispatches by request type and produces a response, sometimes completing it later when a replica acknowledges or data arrives. Produce and fetch go through the partition and log layers; group and transaction calls go to coordinators. Handlers are shared across all partitions, so a slow disk affects everyone. Idle percentage of the pool is the main saturation signal. The difficulty is isolation between request types, since expensive requests can crowd out cheap vital ones.",
    k: ["One shared handler pool vs separate pools per request class: shared uses threads efficiently, separate pools stop replication or admin traffic from being starved by clients.", "Complete responses synchronously vs park and complete later: parking frees threads while waiting, but needs timers and careful state."],
    p: ["Handler threads blocked on a slow disk drive request queue time up for every topic.", "Prioritizing client traffic over inter-broker replication causes followers to fall out of sync under load."],
    v: "Slow one disk and confirm handler idle percentage falls and request queue time rises. Confirm separate controller or replication requests still complete within their latency target.",
    dep: ["produce-path","fetch-path","delayed-operation-purgatory","authorization-acls","quotas-and-throttling"]
  },
  "topics": {
    s: "A named category of messages. A topic is split into partitions for parallelism, with its own configuration for retention, replication and cleanup.",
    d: "A topic is created with a partition count, a replication factor and per-topic settings that override broker defaults. Producers write to a topic name and consumers subscribe by name or pattern. Topic metadata lives in the cluster metadata log. A topic maps one-to-one to a set of directories on brokers. The difficulty is that the partition count, set at creation, limits both parallelism and per-key ordering, and changing it later alters key placement.",
    k: ["One topic per event type vs one topic for many types: separate topics give independent retention and schemas, one topic preserves order across event types.", "Over-provisioned partitions up front vs add later: extra partitions leave room to grow, but add overhead, and adding later reshuffles keyed data."],
    p: ["Topics created automatically by a typo inherit defaults and clutter the cluster.", "Too many topics with few messages each exhaust file handles and metadata capacity."],
    v: "Create a topic with six partitions and replication factor three, then describe it and confirm the six partitions each have three replicas on distinct brokers and that the settings override defaults.",
    dep: ["partitions","metadata-log","controller"]
  },
  "partitions": {
    s: "The unit of parallelism and ordering: an ordered, independent log or sub-queue that is replicated and read by at most one consumer in a group at a time.",
    d: "Each partition is an append-only log on a leader broker with followers elsewhere. Writes to a partition are serialized by its leader, which assigns offsets. Throughput scales by spreading partitions across brokers and consumers. Each partition costs file handles, memory for indexes and replication connections, and adds recovery time after failure. The difficulty is that partitions can be added but not removed or split safely when keys matter, so the count must be chosen with growth in mind.",
    k: ["More partitions for parallelism vs fewer for lower overhead: more allows higher throughput and consumers, but increases election time, memory and end-to-end latency.", "Partition by key vs spread freely: by key preserves order per key, free spread balances load better."],
    p: ["Hundreds of thousands of partitions on one cluster make controller failover and broker restart take many minutes.", "A hot partition cannot be split without breaking key order, so the hotspot persists."],
    v: "Write at a fixed rate to a topic with one, then six partitions and confirm throughput scales with partitions until a broker resource saturates, while ordering holds within each partition.",
    dep: ["append-only-log","replica-roles","leader-election"]
  },
  "produce-path": {
    s: "How a write travels through the broker: authenticate, validate, append to the leader's log, wait for replicas as required, then acknowledge the producer.",
    d: "The request handler validates the batch checksum and producer sequence, then appends it to the active segment of the partition leader, usually just into the page cache. Followers fetch the new data. Depending on the acknowledgement setting, the leader responds immediately, after its own write, or after the in-sync replicas have it, using a parked response completed when the high watermark advances. The difficulty is that every stage affects latency, and the durable point is replication, not the disk flush.",
    k: ["Acknowledge after all in-sync replicas vs leader only: all gives durability across a leader loss, leader only is faster and loses recent writes if the leader dies.", "Validate every batch on the leader vs trust producers: validation protects the log from corruption and bad sequences, at some CPU cost."],
    p: ["Acknowledging at the leader only loses acknowledged messages when the leader fails before followers copy them.", "Oversized batches are rejected, and a producer that retries them forever never makes progress."],
    v: "Produce with full acknowledgement, kill the leader right after the response, and confirm the record is present on the new leader. Repeat with leader-only acknowledgement and measure how often it is lost.",
    dep: ["request-handlers","append-only-log","in-sync-replica-set","min-isr-and-acks","delayed-operation-purgatory"]
  },
  "fetch-path": {
    s: "How a read travels through the broker: locate the offset in the segment index, read a range and send it, or wait for new data if none is available.",
    d: "The handler maps the requested offset to a segment and file position via the index, reads up to a size limit and returns whole batches, usually straight from the page cache to the socket. Consumers are bounded by the high watermark or last stable offset; followers fetch past it. If less than the minimum size is available, the request parks until enough data arrives or a wait time passes, which makes long polling cheap. The difficulty is cold reads, which hit disk and evict hot data from the cache.",
    k: ["Long-poll with minimum bytes vs immediate return: waiting cuts empty responses and CPU, immediate return has lower latency for sparse traffic.", "Serve consumers from the page cache vs a separate application cache: the operating system cache is simple and shared, but a lagging consumer can evict data for everyone."],
    p: ["A consumer replaying old data causes disk reads that slow every other fetch on the broker.", "A fetch size smaller than one batch makes a consumer stall on a large record."],
    v: "Fetch from a caught-up consumer and confirm disk read activity stays near zero. Start a consumer from the beginning and confirm disk reads rise and the tail consumer's latency stays within its target.",
    dep: ["request-handlers","offset-index","zero-copy-reads","high-watermark","delayed-operation-purgatory"]
  },
  "delayed-operation-purgatory": {
    s: "A holding area for requests that cannot complete yet, such as a produce waiting for replicas or a fetch waiting for data, completed by an event or a timer.",
    d: "Instead of blocking a thread, the broker registers the request with a set of watch keys, such as a partition, and a timeout. When a relevant event occurs, such as a follower catching up or new data arriving, the watchers are checked and completed if their condition is met. Otherwise a timing structure expires them. This allows tens of thousands of parked requests with few threads. The difficulty is efficient checking and cleanup, and keeping the completion condition correct under concurrent changes.",
    k: ["Event-driven completion vs polling: events complete immediately and cheaply, polling is simpler but wastes CPU and adds delay.", "Hierarchical timer wheel vs sorted queue for expiry: a wheel gives constant-time insert and expiry, at some code complexity."],
    p: ["Completed requests that are never removed from watch lists leak memory under heavy long-polling.", "A missed completion trigger leaves a request waiting until its full timeout."],
    v: "Park ten thousand long-poll fetches on an idle topic, confirm thread count stays flat, produce one record and confirm exactly the affected fetches complete within milliseconds.",
    dep: ["request-handlers","high-watermark","clock-and-timestamps"]
  },
  "quotas-and-throttling": {
    s: "Per-client or per-tenant limits on bytes per second and request time, enforced by delaying responses rather than rejecting, so one client cannot starve the rest.",
    d: "The broker measures each client's produce and fetch bytes, and request handler time, over a sliding window. When a client exceeds its quota the broker computes a delay and holds the response, also telling the client how long it was throttled so well-behaved clients slow down. Quotas can apply per user, per client id or per combination, with defaults and overrides. The difficulty is fairness and detection: measurement lags, and a client that ignores the throttle hint can still hold connections.",
    k: ["Throttle by delaying responses vs rejecting with an error: delay degrades gracefully with no client code change, rejection is explicit but triggers retry storms.", "Per-user quotas vs per-client-id: per-user is hard to evade, per-client-id lets one user's apps be limited separately."],
    p: ["Quotas set too low on replication traffic cause followers to fall out of sync.", "Throttled clients that open extra connections can amplify load on the network layer."],
    v: "Set a one megabyte per second quota on one client, produce at ten, and confirm its observed rate settles near the quota with throttle time reported while another client's throughput is unaffected.",
    dep: ["request-handlers","authentication","backpressure"]
  },
  "backpressure": {
    s: "Signals that tell a faster side to slow down: bounded buffers, blocked sends, throttle delays, publisher flow control and consumer pause, so overload does not become loss or collapse.",
    d: "Pressure travels in both directions. A full producer buffer blocks the caller. A broker above memory or disk watermarks blocks publishing connections in queue systems. Quotas delay responses. On the consumer side, pausing fetches on partitions stops intake when downstream is slow, and prefetch windows cap in-flight work. A log absorbs overload by letting consumers lag within retention. The difficulty is making the pressure reach the true source: an unbounded layer in the middle just moves the memory problem.",
    k: ["Block or slow the sender vs buffer and drop: slowing keeps data intact but propagates delay upstream, dropping protects latency and loses data.", "Rely on the log's lag as the buffer vs bound consumer intake: lag is free storage, but retention can expire unread data if the backlog lasts too long."],
    p: ["An unbounded in-memory queue between a consumer and a slow database turns lag into an out-of-memory crash.", "Publisher blocking in one connection stalls unrelated work sharing it."],
    v: "Slow the downstream consumer sharply while the producer runs at full speed and confirm producer send latency rises or send blocks, memory stays bounded, and no record is lost within retention.",
    dep: ["quotas-and-throttling","prefetch-and-flow-control","message-ttl-and-limits"]
  },
  "authentication": {
    s: "Proving who a client or broker is when a connection opens, using passwords, challenge-response, tokens or client certificates, before any request is accepted.",
    d: "During connection setup the broker and client negotiate a mechanism: plain credentials over an encrypted channel, salted challenge-response, bearer tokens from an identity provider, or mutual certificates. The result is a principal name used for authorization and quotas. Inter-broker connections authenticate the same way. Credentials are stored hashed or fetched from an external directory. The difficulty is rotation and expiry: long-lived connections must re-authenticate before tokens expire, and a misconfigured listener may accept unauthenticated clients.",
    k: ["Certificates vs tokens vs passwords: certificates are strong and need a managed authority, tokens integrate with single sign-on and expire, passwords are simplest and weakest.", "Authenticate on connect only vs periodic re-authentication: connect only is cheap, re-authentication limits the life of a stolen or revoked credential."],
    p: ["A plaintext listener left open alongside the secure one lets clients bypass authentication.", "Expired tokens on long-lived connections cause a wave of failures at the same moment."],
    v: "Connect with a wrong credential and confirm rejection before any data request. Revoke a valid client's token and confirm its connection is closed at the next re-authentication.",
    dep: ["tls-encryption","network-layer"]
  },
  "authorization-acls": {
    s: "Rules that grant a principal permission to perform an operation, such as read, write or create, on a resource such as a topic, group or cluster, checked on every request.",
    d: "Each rule names a principal, a resource and its pattern, an operation, a host and allow or deny. The broker evaluates rules per request, with deny taking precedence, and caches the result. Rules are stored in cluster metadata so all brokers agree. Prefix patterns reduce rule counts. Reading as a consumer needs both topic read and group read permission. The difficulty is manageability: thousands of rules per team, with default-allow when no rule exists being a risky setting.",
    k: ["Default deny vs default allow when no rule matches: deny is safe but breaks anything unlisted, allow is easy to start with and exposes everything.", "Fine-grained per-topic rules vs prefix rules per team: fine-grained is precise but unwieldy, prefix is manageable but grants more than needed."],
    p: ["Granting topic access without the matching group permission leaves a consumer authorized to read but unable to join.", "A wildcard grant given for a test is never removed and exposes every topic."],
    v: "Attempt a produce with a principal lacking write access and confirm an authorization error is returned and logged. Grant the permission and confirm the next attempt succeeds without restarting any broker.",
    dep: ["authentication","metadata-log","admin-tooling"]
  },
  "tls-encryption": {
    s: "Encrypts and integrity-protects traffic between clients and brokers and between brokers, so messages cannot be read or altered on the network.",
    d: "Listeners are configured to use TLS with server certificates, and optionally require client certificates. Each connection pays a handshake and each byte pays encryption. TLS interferes with direct file-to-socket copying because data must pass through the encryption layer in user space, so consumer throughput and broker CPU change noticeably. Certificates need renewal and hostname validation. The difficulty is operational: expiry outages, trust store updates and the performance cost of losing zero-copy reads.",
    k: ["Encrypt all traffic vs only across untrusted networks: universal encryption is simple to reason about, but costs CPU and gives up zero-copy reads.", "Short-lived automatically renewed certificates vs long-lived: short-lived limit exposure but require reliable automation, long-lived are easy until they expire."],
    p: ["A certificate that expires unnoticed takes down every client connection at once.", "Enabling encryption without capacity testing leaves brokers CPU-bound at previous traffic levels."],
    v: "Capture traffic on the wire and confirm payloads are unreadable. Compare broker CPU and consumer throughput with and without encryption at the same load to quantify the cost.",
    dep: ["network-layer","zero-copy-reads","credential-rotation"]
  },
  "credential-rotation": {
    s: "Replacing passwords, tokens and certificates on a schedule or after a leak without taking the cluster or its clients offline.",
    d: "Brokers can accept both an old and a new credential during a transition window, and reload certificates and key stores without restart. Client credentials are updated by redeploying or reloading configuration. Token-based setups renew automatically using short lifetimes. Revocation lists and re-authentication close sessions using withdrawn credentials. The difficulty is coordination: every client and broker must change within the overlap, and forgotten clients using the old secret fail at the moment it is retired.",
    k: ["Overlapping old and new credentials vs a hard cutover: overlap avoids outages but leaves the old secret valid longer, cutover is clean and breaks stragglers.", "Dynamic reload vs restart for new certificates: reload avoids downtime, restart is simple but needs rolling procedures."],
    p: ["Retiring a credential before every client is updated causes an outage in a service nobody remembered.", "A rotated broker certificate with a different chain breaks trust for clients with stale trust stores."],
    v: "Rotate the broker certificate during live traffic and confirm no connection errors beyond reconnects, new connections use the new certificate, and the old one is rejected after the window ends.",
    dep: ["authentication","tls-encryption"]
  },
  "multi-tenancy": {
    s: "Sharing one cluster among many teams or customers with isolation of names, permissions, resources and failure impact, so one tenant's behavior cannot harm another.",
    d: "Tenancy uses naming prefixes or namespaces for topics, ACLs scoped to those prefixes, quotas per tenant for bandwidth, request time and connection count, and limits on topic and partition counts. Some systems provide virtual hosts as hard namespaces with separate permissions. Physical isolation puts sensitive tenants on separate clusters. The difficulty is that shared resources such as disks, the page cache and the controller are never fully partitioned, so a noisy tenant can still degrade others.",
    k: ["Shared cluster with quotas vs a cluster per tenant: shared has lower cost and operations burden, separate clusters give hard isolation and independent upgrades.", "Namespace by prefix convention vs enforced virtual hosts: prefixes are flexible but advisory, virtual hosts are enforced but more rigid."],
    p: ["A tenant creating thousands of topics exhausts shared metadata capacity for everyone.", "Page cache churn from one tenant's replay slows reads for all tenants on the broker."],
    v: "Run a tenant that replays at full speed against one that serves live traffic and confirm the live tenant's latency stays within its target because the quotas hold.",
    dep: ["quotas-and-throttling","authorization-acls","topics"]
  },
  "audit-logging": {
    s: "A record of who did what to the cluster: authentication results, authorization decisions and administrative changes, kept for investigation and compliance.",
    d: "The broker emits a structured event for security-relevant actions: logins and failures, denied requests, topic and ACL changes, configuration alterations. Events are written to a log or even a topic, with principal, address, resource, operation and outcome. Logging every successful data request is voluminous, so it is usually sampled or limited to denials and changes. The difficulty is volume, tamper resistance and making sure the audit path never blocks the data path.",
    k: ["Log all requests vs only denials and administrative changes: all gives a complete trail but is enormous, filtered logs are manageable and miss reads of sensitive data.", "Audit events to a local file vs a protected topic: a file is simple, a topic centralizes and is available to analysis but must itself be secured."],
    p: ["Audit output to a slow sink backs up the request handlers.", "Admins with access to the audit store can erase evidence of their own changes."],
    v: "Create a topic, change an ACL and attempt an unauthorized read, then confirm each action appears in the audit stream with the correct principal, address, resource and outcome.",
    dep: ["authorization-acls","authentication","internal-topics"]
  },
}
);
