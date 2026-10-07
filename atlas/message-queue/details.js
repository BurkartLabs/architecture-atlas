// Details for the message queue plate, part 1: producer, consumer, ecosystem, operations.
ATLAS.details("message-queue", {
  "producer-client": {
    s: "The library an application calls to send messages. It queues records in memory, hands them to a background sender and reports success or failure through a future or callback.",
    d: "The send call validates the record, serializes it, picks a partition and appends it to a per-partition buffer, then returns immediately. A background sender thread drains full or aged buffers into requests grouped by destination broker. Results come back asynchronously, matched to each record. The client also refreshes cluster metadata when leaders move. It is hard because the call looks like a local function but hides memory limits, retries, reordering risk and a blocking mode when the buffer fills.",
    k: ["Asynchronous send with callbacks vs blocking on every send: async gives order-of-magnitude throughput, but errors arrive late and callers must handle them out of line.", "Bounded buffer memory with blocking vs unbounded queueing: a bound turns overload into backpressure on the caller instead of an out-of-memory crash in the application."],
    p: ["Fire-and-forget sends without checking the callback lose messages silently when the broker rejects them.", "Closing the process without flushing drops everything still sitting in the buffer."],
    v: "Send ten thousand records, kill the process after a flush and confirm a consumer reads exactly ten thousand. Repeat with no flush and confirm the loss matches what was buffered.",
    dep: ["serializers","batching-and-linger","partitioners","retries-and-timeouts","wire-protocol"]
  },
  "serializers": {
    s: "Convert application objects to bytes on send and back on receive. The broker treats keys and values as opaque byte arrays, so the format is a contract between clients.",
    d: "A serializer maps a typed key or value to bytes and a deserializer reverses it. Common formats are plain text, JSON and compact binary schemas. Schema-based formats prepend an identifier that points into a registry so readers fetch the right schema. The broker never inspects the payload except for compaction keys and headers. The hard part is evolution: a field added by one team must not break consumers that deploy later, and a deserializer that throws stalls a partition on one bad record.",
    k: ["Schema-based binary vs self-describing text: binary is smaller and enforces compatibility, but needs a registry and tooling to inspect messages.", "Deserialize in the client library vs hand raw bytes to the application: the library is convenient, but a failure there blocks the poll loop instead of reaching the application's error handling."],
    p: ["A consumer that throws on one malformed record retries it forever and blocks the whole partition.", "Changing a field type without a compatibility check breaks readers that have not yet redeployed."],
    v: "Publish a record with a new optional field and confirm an old consumer still reads it. Publish one corrupt payload and confirm it is routed aside and the partition keeps advancing.",
    dep: ["schema-registry"]
  },
  "batching-and-linger": {
    s: "Groups many small records bound for one partition into one request, waiting a short, configurable time for more to arrive, to trade a little latency for much higher throughput.",
    d: "Each partition has a buffer that fills until a size limit is reached or a linger interval expires, whichever comes first. The sender then ships the batch as a single unit with one header, one compression pass and one checksum. Larger batches amortize per-request cost on both client and broker, and compress better. A linger of zero sends immediately when the connection is free. The difficulty is tuning: too large wastes memory across many partitions and adds latency, too small floods the broker with tiny requests.",
    k: ["Longer linger with bigger batches vs immediate send: throughput and compression ratio rise, but every message waits up to the linger interval.", "Batch memory allocated per partition vs shared across partitions: per-partition keeps order simple, but thousands of partitions multiply memory use."],
    p: ["Setting linger high for an interactive path adds that delay to every user-visible action.", "Many partitions with small batches each leave most of the buffer idle and starve throughput."],
    v: "Send the same stream at linger zero and at twenty milliseconds. Confirm the request rate and bytes on the wire drop sharply while the median end-to-end latency rises by about the linger.",
    dep: ["compression","partitioners","buffer-management"]
  },
  "partitioners": {
    s: "Decide which partition each record goes to: by hashing the key so equal keys stay together, or by spreading keyless records evenly across partitions.",
    d: "With a key, the partitioner hashes it and takes the result modulo the partition count, so every record for one key lands in one partition and stays ordered. Without a key, it round-robins or sticks to one partition until a batch fills, then moves on, which keeps batches large. Custom partitioners can route by tenant, region or load. The hard part is that the mapping depends on the partition count: adding partitions changes where existing keys go and breaks per-key ordering for data already written.",
    k: ["Hash by key vs random spread: hashing preserves per-key order and locality, but a hot key overloads one partition while others idle.", "Sticky batching for keyless records vs strict round-robin: sticking yields fuller batches and lower latency, at the cost of lumpier short-term distribution."],
    p: ["Increasing partition count on a keyed topic silently moves keys, so a consumer sees one key's history split across two partitions.", "A skewed key such as a default value concentrates most traffic on one partition and caps throughput."],
    v: "Send one thousand records with a hundred distinct keys. Confirm every key appears in exactly one partition, then add partitions and confirm the new records for some keys now land elsewhere.",
    dep: ["message-keys","partitions"]
  },
  "compression": {
    s: "Compresses a whole batch before sending, so the same compressed bytes travel over the network, sit on disk and are served to consumers without being recompressed.",
    d: "The producer compresses each batch with a chosen codec that trades CPU for ratio and speed. The broker stores the batch as received and returns it unchanged, decompressing only when it must validate or when the topic's codec differs and conversion is configured. Consumers decompress on read. Because batches hold many similar records, ratios are high for text and structured data. The difficulty is the extra copy on mismatch, CPU cost on small instances, and the fact that tiny batches compress poorly.",
    k: ["Compress in the producer and keep it compressed end to end vs compress at the broker: end to end saves network and disk and spares the broker CPU, but ties every client to the codec.", "Fast codec with modest ratio vs dense codec with high CPU: the fast one rarely bottlenecks a client, the dense one cuts storage and transfer for cold or wide-area data."],
    p: ["A topic-level codec that differs from the producer's forces the broker to decompress and recompress every batch, spiking CPU.", "Compressing already compressed payloads such as images wastes CPU for no gain."],
    v: "Send identical text payloads with the codec off and on. Compare bytes on disk and network throughput, and confirm broker CPU does not rise when producer and topic codecs match.",
    dep: ["record-batch-format"]
  },
  "retries-and-timeouts": {
    s: "Resend failed batches after transient errors, bounded by an overall delivery deadline, so a short broker outage does not lose messages and a long one does not hang callers.",
    d: "When a request fails with a retriable error such as a leader change or a timeout, the sender backs off and tries again, possibly after refreshing metadata. A delivery timeout caps total time from send to final result, covering buffering, retries and waits. Retries can duplicate a message whose first attempt actually succeeded, and can reorder batches if several are in flight. Making retries safe takes the idempotent producer and a limit on in-flight requests per connection.",
    k: ["Many retries with a long deadline vs fail fast: persistence rides out leader elections, but the application waits and buffers back up.", "Multiple in-flight requests vs one: more in flight gives throughput, but without sequence numbers a retried earlier batch can land after a later one."],
    p: ["Retries without idempotence turn a timeout into a duplicate record when the original write succeeded.", "A delivery timeout shorter than a leader election makes every failover surface as application errors."],
    v: "Kill the partition leader during a steady send and confirm all records arrive once the new leader is elected, with no duplicates when idempotence is on and a bounded error count when the deadline is short.",
    dep: ["idempotent-producer","bootstrap-discovery","leader-election"]
  },
  "idempotent-producer": {
    s: "Gives each producer an identity and each batch a sequence number per partition, so the broker discards retried duplicates and rejects gaps, making retries safe within one session.",
    d: "On start the producer obtains an identifier and an epoch from the broker. Every batch to a partition carries the identifier, epoch and a monotonically increasing sequence. The partition leader remembers the latest sequences for recent batches per producer; a repeat is acknowledged without appending, and an out-of-order sequence is rejected. This state is itself replicated with the log so a new leader inherits it. It is hard because the guarantee covers one producer session and one partition, and the remembered window is bounded.",
    k: ["Broker-side dedup with sequence numbers vs application-level unique ids: sequence tracking is automatic and cheap, but covers only that producer session, not a restarted application.", "Bounded window of remembered batches vs unbounded history: a window caps memory, at the cost of limiting how many requests may be in flight."],
    p: ["A restarted application gets a new producer identity, so a message resent after a crash is not recognized as a duplicate.", "Producer state expiring after long idleness can cause a sequence error on the next send."],
    v: "Force a timeout after the broker has written a batch so the client resends it, then read the partition and confirm exactly one copy exists with the sequence numbers contiguous.",
    dep: ["produce-path","record-batch-format","leader-epochs"]
  },
  "consumer-client": {
    s: "The library an application calls to receive messages. It owns the connection, the fetch loop, group membership and offset tracking, and returns batches of records from a poll call.",
    d: "The application repeatedly calls poll, which fetches data from assigned partitions, sends heartbeats, handles rebalances and returns records. Processing happens between polls, so the time between polls is itself a health signal: if it exceeds a limit the broker assumes the member is dead and reassigns its work. The client deserializes, applies the offset reset policy on first start and tracks positions in memory. It is hard because slow processing, group liveness and offset commits all hang off one loop.",
    k: ["Single-threaded poll with processing in the loop vs hand records to worker threads: the loop is simple and ordered, while workers add throughput but complicate commits and ordering.", "Large poll batches vs small: big batches raise throughput, but the longer processing time risks missing the liveness deadline."],
    p: ["Processing that takes longer than the maximum poll interval gets the member evicted and its records reprocessed by someone else.", "Calling the client from several threads without synchronization corrupts its internal state."],
    v: "Run a consumer, pause processing past the poll interval and confirm the group reassigns its partitions and the member rejoins on the next poll with the lag draining afterward.",
    dep: ["consumer-groups","offset-commits","prefetch-and-flow-control","serializers","fetch-path"]
  },
  "push-vs-pull": {
    s: "Choose whether the broker pushes messages to consumers as they arrive or consumers pull batches when ready. It decides who controls the pace and where overload shows up.",
    d: "In push delivery the broker sends messages to a registered consumer up to a prefetch window, giving low latency and simple client code, but the broker must track each consumer's capacity. In pull delivery the consumer requests data from an offset when it has capacity, often with a long poll that waits for new data. Pull lets slow consumers fall behind safely and allows batching and replay. Push suits low-volume work queues. Hybrids push within a window, bounded by acknowledgements.",
    k: ["Push with a prefetch window vs pull with long polling: push gives lowest latency per message, pull gives consumer-controlled pacing and cheap replay from any offset.", "Broker-tracked consumer state vs consumer-tracked offsets: broker tracking supports per-message redelivery, while consumer-held offsets keep the broker simple and scalable."],
    p: ["Push without a bounded window floods a slow consumer's memory.", "Pull with a short poll timeout and no data creates a busy loop that burns CPU on both sides."],
    v: "Slow one consumer to a tenth of the producer's rate. Confirm under pull its lag grows without memory growth, and under push the unacknowledged count stops at the configured window.",
    dep: ["fetch-path","prefetch-and-flow-control"]
  },
  "prefetch-and-flow-control": {
    s: "Limits how much data or how many unacknowledged messages a consumer holds at once, keeping the network busy without overwhelming consumer memory or hogging work from other consumers.",
    d: "A prefetch count in push systems bounds unacknowledged messages per consumer or channel. In pull systems, fetch size and wait settings bound data per request, and the client buffers completed fetches ahead of the application. A larger window hides network round trips. A window of one gives fairness among competing consumers but caps throughput at one message per round trip. The difficulty is balance: too much prefetch lets one consumer sit on messages others could process, and too little leaves workers idle.",
    k: ["Large prefetch vs small: large keeps workers saturated, but when a consumer stalls its prefetched messages are stuck until redelivery.", "Count-based vs byte-based limits: counts are simple, bytes protect memory when message sizes vary widely."],
    p: ["A high prefetch with slow tasks leaves one worker holding a backlog while others sit idle.", "Fetch buffers sized for the largest message multiplied by many partitions exhaust the heap."],
    v: "Run two workers with uneven task times. Confirm with prefetch of one the busy worker holds a single message and the idle one takes the rest, and with prefetch of one thousand the backlog piles on the first worker.",
    dep: ["acknowledgements","buffer-management"]
  },
  "consumer-groups": {
    s: "A set of consumers sharing a name that divide a topic's partitions among themselves, so the group reads each message once while separate groups each read everything.",
    d: "Members join a group through the coordinator, which tracks liveness by heartbeats and assigns each partition to exactly one member at a time. The group's committed offsets are stored per partition so a new owner resumes where the last stopped. Adding members scales reading up to the partition count; beyond that, extra members idle. Several groups reading one topic are independent and do not affect each other. The hard part is membership churn: every join, leave or timeout triggers reassignment and a pause.",
    k: ["One owner per partition vs shared partitions: single ownership preserves per-partition order and simple offsets, but caps parallelism at the partition count.", "Short session timeout vs long: short detects dead members quickly, but a garbage-collection pause or slow task causes needless reassignment."],
    p: ["More consumers than partitions leaves the extras idle and gives a false sense of scaling.", "A flapping member keeps triggering rebalances and the group never settles."],
    v: "Start three members on a six-partition topic and confirm each owns two. Stop one and confirm its partitions move and the committed offsets continue without gaps or rereads beyond the commit window.",
    dep: ["group-coordinator","partition-assignment","offset-commits","partitions"]
  },
  "partition-assignment": {
    s: "The policy that decides which group member reads which partitions: spread evenly, keep partitions with their previous owner, or place them near their data.",
    d: "At each rebalance one member, or the coordinator, runs an assignor over the member list and subscribed topics. Range assignment gives contiguous partitions per topic, round-robin spreads them one by one, and sticky assignment minimizes movement from the previous layout. Rack-aware assignors prefer replicas in the consumer's zone. The result is distributed to members. The hard parts are balance across several topics, keeping state-holding consumers stable and ensuring every member runs the same assignor version.",
    k: ["Sticky assignment vs fresh balanced assignment: sticky keeps caches and local state intact during changes, but may leave the layout slightly uneven.", "Client-side assignment vs coordinator-side: client-side allows custom logic, while coordinator-side removes version skew and shortens rebalances."],
    p: ["Range assignment across many small topics gives the first members far more partitions than the rest.", "Mixed assignor versions in one group can produce overlapping or missing assignments."],
    v: "Subscribe three members to topics of uneven partition counts and compare the partitions per member under each assignor. After a member leaves, count how many partitions changed owner.",
    dep: ["consumer-groups","group-coordinator"]
  },
  "rebalance-protocols": {
    s: "The procedure by which a group reassigns partitions when membership or subscriptions change: stop everything and reassign, or move only the partitions that must change.",
    d: "The eager protocol revokes every partition from every member, waits for all to rejoin, then assigns anew, so the whole group pauses. The cooperative protocol revokes only partitions that must move, in two rounds, while other members keep reading. A newer coordinator-driven protocol removes the group-wide barrier entirely and lets members converge incrementally. Each approach trades pause length against protocol complexity. The difficulty is that revoked partitions need their pending work finished and offsets committed before another member takes over.",
    k: ["Eager stop-the-world vs incremental cooperative: eager is simple and always consistent, while incremental avoids long pauses but takes extra rounds and careful callbacks.", "Group-wide join barrier vs per-member convergence: a barrier is easy to reason about, but one slow member delays everyone."],
    p: ["Rolling restarts of many members trigger a rebalance each time and can keep a large group unproductive for minutes.", "Skipping the commit in the revoke callback reprocesses everything the moved partition handled since the last commit."],
    v: "Add one member to a running group of ten and measure the read gap on unmoved partitions: near zero for incremental, equal to the full rebalance for eager.",
    dep: ["group-coordinator","partition-assignment","offset-commits"]
  },
  "static-membership": {
    s: "Gives each consumer a fixed identity that survives restarts, so a quick restart reclaims its old partitions without triggering a rebalance for the whole group.",
    d: "A member supplies a stable instance id when joining. If it disconnects and returns with the same id before the session timeout, the coordinator hands back its previous assignment with no reassignment. Only when the timeout passes does the group rebalance. This suits stateful consumers whose local caches or state stores are expensive to rebuild, and rolling deploys. The difficulty is that a crashed member's partitions sit unread until the timeout expires, so the timeout must exceed restart time yet not leave data stranded.",
    k: ["Static identity with a long session timeout vs dynamic ids: static avoids churn during deploys, but a real failure takes the full timeout to detect.", "Operator-assigned ids vs generated: assigned ids map to stable hosts, but two processes using one id fence each other off."],
    p: ["Two replicas started with the same instance id keep evicting each other.", "A long timeout hides a dead member and lag grows on its partitions until the timer fires."],
    v: "Restart one member within the timeout and confirm the group generation number does not change and no other member loses a partition. Kill it permanently and confirm reassignment after the timeout.",
    dep: ["consumer-groups","group-coordinator"]
  },
  "offset-commits": {
    s: "A consumer records its progress per partition in a durable store, so after a restart or reassignment it resumes from the last committed position instead of the start.",
    d: "A commit stores the offset of the next record to read for a group and partition, in an internal replicated log. Commits can be automatic on a timer, or manual after processing, either synchronous or asynchronous. The commit and the processing result are separate writes, so a crash between them either repeats or skips records depending on order. Committing before processing gives at-most-once, after gives at-least-once. The hard part is atomicity with the application's own side effects.",
    k: ["Commit after processing vs before: after risks duplicates on a crash, before risks loss, so most systems choose duplicates and make processing idempotent.", "Automatic timed commits vs manual per-batch commits: automatic is simple but can commit records not yet processed, manual ties progress to completed work."],
    p: ["Auto-commit can mark a batch as read while workers are still processing it, losing it on a crash.", "Committing only the highest offset after out-of-order parallel work skips earlier unfinished records."],
    v: "Process a batch, kill the consumer between processing and commit, restart, and count how many records are repeated. Confirm the count equals the uncommitted batch and none are skipped.",
    dep: ["internal-topics","group-coordinator","offsets"]
  },
  "offset-reset-and-seek": {
    s: "Controls where a consumer starts when it has no valid committed position, and lets an application move its read position explicitly to replay or skip data.",
    d: "If a group has no committed offset, or the committed one has been deleted by retention, the reset policy picks the earliest available record, the latest, or fails. Applications can also seek to a specific offset or to the first record after a timestamp, using the time index. This enables replaying after a bug fix, rebuilding a derived store or skipping a poison message. The difficulty is that a wrong default silently skips history for a new group or reprocesses terabytes after an offset expires.",
    k: ["Reset to earliest vs latest: earliest guarantees completeness but may reprocess huge history, latest starts fresh but silently drops anything produced before the group existed.", "Seek by offset vs by timestamp: offsets are exact, timestamps are meaningful to people but depend on producer clock quality."],
    p: ["A group idle past offset retention restarts at the reset policy and either replays everything or skips the gap without warning.", "Resetting offsets while members are running is overwritten by their next commit."],
    v: "Create a new group with each policy against a topic holding a known number of records and confirm the first reads match. Seek to a timestamp and confirm the first record returned is the earliest at or after it.",
    dep: ["time-index","offset-commits","consumer-client","retention-policy"]
  },
  "client-libraries": {
    s: "Language-specific implementations of the producer, consumer and admin protocols. Their behavior and defaults differ, so the same settings can behave differently across languages.",
    d: "The protocol is open and versioned, so each ecosystem has its own clients: some are thin wrappers over a shared native core, others full reimplementations. They differ in feature coverage such as transactions or cooperative rebalancing, in threading model and in default values. Applications written in several languages therefore see different batching, retry and group behavior on the same cluster. The difficulty is that a feature added on the broker is useless until every client team ships it and applications upgrade.",
    k: ["Shared native core with thin bindings vs pure reimplementation: a shared core gives uniform behavior and features, but adds native build and packaging burden.", "Conservative defaults vs tuned defaults: conservative ones are safe everywhere, but leave throughput unused until each team tunes them."],
    p: ["Assuming one language's client defaults apply to another leads to different durability and ordering in services that look identical.", "Pinned old client versions block use of newer broker features such as safer assignment."],
    v: "Run the same send-and-consume scenario with each language's client against one cluster and diff the produced batches, retry behavior and rebalance pauses. Confirm they match the documented contract.",
    dep: ["wire-protocol","api-versioning","producer-client","consumer-client"]
  },
  "connector-framework": {
    s: "A runtime that runs configurable data movers in and out of the messaging system, handling scaling, offsets, retries and error handling so integrations need no custom service.",
    d: "The framework hosts connector tasks on a worker cluster, distributes tasks across workers, stores source positions and configuration in internal topics, and restarts failed tasks. A connector defines how to split work into tasks and how to convert records between external systems and messages. Transforms can reshape records in flight. Delivery is at-least-once by default, with exactly-once possible for some sources. It is hard because each external system has its own failure and ordering quirks, and task rebalancing pauses data flow.",
    k: ["Framework-managed offsets and retries vs custom integration code: the framework gives uniform operations and recovery, at the cost of its configuration model and limits.", "Single-message transforms in the framework vs a separate processing step: inline transforms are cheap for simple fixes, but complex logic belongs in a dedicated processor."],
    p: ["A sink task retrying a permanently bad record blocks its partition until someone intervenes.", "Changing a connector's task count restarts it, pausing flow and possibly replaying from the last stored position."],
    v: "Run a source and a sink between a database and a topic, kill a worker mid-transfer, and confirm the task restarts elsewhere and the destination row count matches the source with no gaps.",
    dep: ["consumer-client","producer-client","internal-topics","schema-registry"]
  },
  "source-connectors": {
    s: "Read from an external system such as a database, file or API and publish its changes as messages, tracking a position so a restart resumes without gaps.",
    d: "A source reads either by polling with a query, or by tailing the database's own change log for inserts, updates and deletes in commit order. It stores its position, such as a log sequence or timestamp, with the framework, so after a failure it resumes from there. Change-log sources capture deletes and avoid load from repeated queries. The difficulty is consistency: initial snapshots must hand off to streaming without missing or duplicating rows, and schema changes in the source must reach the registry.",
    k: ["Log-based change capture vs query polling: log-based sees deletes and every intermediate change with low load, but needs database privileges and tolerates less variety of sources.", "Snapshot then stream vs stream only: snapshot gives a complete picture, but a long snapshot holds locks or consumes large resources."],
    p: ["Polling by an update timestamp misses rows committed with older timestamps and never sees deletes.", "A source whose upstream log was truncated past its saved position cannot resume and must be re-snapshotted."],
    v: "Insert, update and delete rows in the source and confirm each appears once as a message in commit order, including the delete. Restart mid-stream and confirm no gaps or repeats beyond the documented window.",
    dep: ["connector-framework","producer-client"]
  },
  "sink-connectors": {
    s: "Consume messages and write them to an external system such as a database, search index or object store, batching writes and handling failures without losing records.",
    d: "A sink task is a consumer that converts each batch into writes against the target, then commits offsets once the target confirms. Batching and upserts by key make replays harmless. Failed records can be retried, skipped or sent to a dead-letter topic. Sinks to object storage roll files by size or time and must commit file boundaries consistently. The difficulty is idempotence and backpressure: the target may be slower than the stream, and a partial batch failure must not be lost or applied twice.",
    k: ["Upsert by key vs insert only: upserts make at-least-once delivery safe, but need a stable key and a target that supports them.", "Skip bad records to a dead-letter topic vs halt the task: routing aside keeps data flowing, halting guarantees nobody misses an error."],
    p: ["Committing offsets before the target flush completes loses records if the task dies.", "A slow target makes consumer lag grow unnoticed because the task itself looks healthy."],
    v: "Replay the same range of messages into the sink twice and confirm the target contains each record once. Inject a bad record and confirm it lands in the dead-letter topic while later records are written.",
    dep: ["connector-framework","consumer-client","dead-letter-queues"]
  },
  "schema-registry": {
    s: "A service that stores versioned message schemas and gives each an identifier, so messages carry a small id instead of the whole schema and readers can look it up.",
    d: "Producers register a schema under a subject, usually a topic name, and receive an id that goes into each message header bytes. Consumers read the id, fetch and cache the schema, and decode. The registry keeps the version history and enforces the subject's compatibility rule on every registration. Its own data is stored in a replicated log, and clients cache aggressively. The difficulty is availability: if the registry is down at startup, new producers cannot register and cold consumers cannot decode, so caching and replication matter.",
    k: ["Central registry with ids in messages vs schema embedded in every message: ids keep messages small and enforce rules in one place, but add a runtime dependency.", "Subject per topic vs subject per record type: per topic is simple, per type allows mixed event types in one topic at the cost of more subjects."],
    p: ["A cold consumer started during a registry outage cannot decode any message whose schema it has not cached.", "Auto-registering schemas from every producer lets a mistaken deploy register an incompatible shape unnoticed."],
    v: "Register two compatible versions, produce with each, and confirm a consumer decodes both. Stop the registry and confirm warm producers and consumers keep working from cache while a cold start fails clearly.",
    dep: ["schema-compatibility","internal-topics","serializers"]
  },
  "schema-compatibility": {
    s: "Rules checked when a new schema version is registered, deciding whether old readers can read new data, new readers can read old data, or both.",
    d: "Backward compatibility means readers on the new schema can read data written with the old; forward means readers on the old schema can read new data; full means both; transitive variants check against every prior version instead of just the last. Rules typically allow adding optional fields with defaults and forbid removing required ones or changing types. The mode is set per subject and gates registration. The difficulty is choosing the mode that matches deployment order, since consumers or producers upgrade first.",
    k: ["Backward-compatible evolution with consumers upgraded first vs forward with producers first: the mode must match which side deploys first, or old data cannot be read.", "Transitive checks vs last-version only: transitive protects replay of old retained data, but restricts changes more."],
    p: ["Backward-only checking when producers deploy first breaks older consumers still running.", "Renaming a field passes some checks yet breaks every reader that used the old name."],
    v: "Attempt to register a version that removes a required field and confirm rejection. Register one that adds an optional field and confirm acceptance and successful reads by readers of both versions.",
    dep: ["schema-registry"]
  },
  "admin-tooling": {
    s: "Programmatic and command-line interfaces for creating topics, changing configuration, managing groups and offsets, inspecting logs and moving partitions.",
    d: "An admin API exposes operations for topics, partitions, configuration, ACLs, consumer groups, offsets and replica placement, sent to the controller or the relevant broker. Command-line tools wrap it for operators and scripts. Dump tools read raw log segments to show batches, offsets and timestamps. Because the same operations can delete data or trigger large movements, access is gated by authorization. The difficulty is that many calls are asynchronous: they return once accepted, while the cluster takes time to converge.",
    k: ["Declarative configuration applied by automation vs manual commands: declarative gives review and repeatability, but needs tooling that tolerates asynchronous convergence.", "Open admin access to every client vs restricted: open is convenient for development, but a stray call can delete a topic."],
    p: ["Scripts that assume a topic exists immediately after create fail intermittently because metadata has not propagated.", "Allowing automatic topic creation on first send lets typos create new topics with default settings."],
    v: "Create a topic with a given partition count and replication factor, then describe it and confirm leaders and replicas match. Alter retention and confirm the effective setting changes without restart.",
    dep: ["controller","authorization-acls","metadata-propagation"]
  },
  "consumer-lag-monitoring": {
    s: "Measures how far each consumer group is behind the end of each partition, in messages and in time, and alerts when the gap grows or stops shrinking.",
    d: "Lag is the log end offset minus the group's committed offset per partition. A monitor polls both values and publishes them, ideally also estimating time lag by comparing the timestamp of the next unread record to now. A rising trend matters more than an absolute value. Per-partition lag reveals a stuck or skewed consumer that a group total would hide. The difficulty is that lag can be zero while the consumer is dead and the topic is quiet, and that commit timing makes it noisy.",
    k: ["Lag in messages vs lag in time: messages are exact and easy, time matches what users feel, but needs record timestamps and an estimate when idle.", "External monitor vs client-reported metrics: external sees stopped consumers too, client metrics are more granular but vanish when the process dies."],
    p: ["Alerting on the group total hides one partition with growing lag among many idle ones.", "A consumer that crashed shows constant lag but no change, which threshold alerts miss without a trend rule."],
    v: "Pause one consumer while producing at a known rate and confirm the reported lag grows by that rate on its partitions, then resume and confirm it drains to zero.",
    dep: ["offset-commits","offsets","broker-metrics"]
  },
  "broker-metrics": {
    s: "Counters and gauges exposed by each broker: request rates and latencies, bytes in and out, queue depths, disk usage, replication state and thread utilization.",
    d: "Brokers publish metrics per topic, per partition, per request type and per thread pool. Key signals include request queue time, produce and fetch latency broken into stages, network and request-handler idle percent, log flush time, and under-replicated partition count. Per-request breakdowns show whether time is spent waiting in a queue, on disk, or waiting for followers. The difficulty is volume and cardinality: per-partition metrics on large clusters are enormous, and averages hide tail latency.",
    k: ["Per-partition metrics vs per-topic aggregates: per-partition finds hot spots, but multiplies storage and cost on clusters with many partitions.", "Percentile latency vs averages: percentiles show the tail users feel, but cost more to compute and aggregate."],
    p: ["Watching only average produce latency misses a slow disk that affects one partition in twenty.", "High-cardinality labels per client and topic overwhelm the metrics backend."],
    v: "Inject a slow disk on one broker and confirm its log flush and produce latency metrics rise while others stay flat, with the request queue time showing the wait.",
    dep: ["request-handlers","io-threading-model"]
  },
  "under-replicated-alerts": {
    s: "Alerts when partitions have fewer in-sync copies than configured, or have none, giving early warning before a further failure causes data loss or unavailability.",
    d: "The broker counts partitions whose in-sync set is smaller than the replica set, those below the minimum in-sync threshold, and those with no leader. Under-replicated counts spike during restarts and recover; a persistent value signals a slow or dead follower, a saturated network or a disk problem. Below-minimum partitions reject acknowledged writes, which is a production-affecting event. The difficulty is separating routine transients from real trouble, and linking the count to the specific broker causing it.",
    k: ["Alert on any under-replication vs on persistence over a window: any is noisy during deploys, a window avoids noise but delays a real signal.", "Page on below-minimum partitions vs only on offline ones: below-minimum already rejects writes, so waiting for offline is too late."],
    p: ["Ignoring a steady under-replicated count turns the next single failure into data loss.", "Alerts firing on every rolling restart train responders to dismiss them."],
    v: "Stop one follower broker and confirm the under-replicated count rises for its partitions and clears after it rejoins and catches up. Stop two with minimum in-sync of two and confirm writes are rejected.",
    dep: ["in-sync-replica-set","min-isr-and-acks","broker-metrics"]
  },
  "tracing-and-headers": {
    s: "Key-value metadata attached to each message, used to carry trace identifiers, correlation ids and routing hints so a request can be followed across producers and consumers.",
    d: "Headers travel with the record but are separate from key and value, so they can be added without changing the payload schema. Instrumentation in the client injects a trace context on send and extracts it on receive, linking the producer span to the consumer span even though they run at different times. Headers also carry content type, tenant and retry counts. Brokers and compaction ignore them except for storage. The difficulty is that async hops break the parent-child timing assumptions tracing tools make.",
    k: ["Headers for metadata vs fields in the payload: headers keep it out of the schema and visible to infrastructure, but consumers must preserve them when forwarding.", "Per-message tracing vs sampling: full tracing is complete but costly, sampling cuts cost and loses rare failures."],
    p: ["A processor that republishes a message without copying its headers breaks the trace chain.", "Large headers on every message inflate storage and network cost."],
    v: "Send a message with a trace id through a producer, a consumer and a second topic, and confirm the same id appears in all three spans of one trace.",
    dep: ["record-batch-format","producer-client","consumer-client"]
  },
  "dlq-inspection-and-replay": {
    s: "Tools and procedures for examining messages that landed in dead-letter queues, understanding why, fixing the cause and sending them back for another attempt.",
    d: "Dead-lettered messages keep their payload and gain metadata: original destination, failure reason, attempt count and timestamps. Operators browse them, group by reason, and after fixing the bug or data republish them to the original destination or a repair queue, ideally in bulk with rate limits. Others discard them after review. The difficulty is that replay can recreate the original failure, reorder messages relative to newer ones, and flood the consumer that just recovered.",
    k: ["Automatic replay after a delay vs manual replay after investigation: automatic clears transient failures without people, manual avoids looping on permanent ones.", "Replay to the original topic vs a separate repair path: the original is simple, a separate path avoids disturbing live traffic and ordering."],
    p: ["Replaying thousands of dead letters at full speed overwhelms the downstream service that was just fixed.", "A dead-letter queue with no monitoring becomes a silent graveyard of lost work."],
    v: "Force a failure for a known set of messages, confirm each appears in the dead-letter queue with its reason, fix the cause, replay with a rate limit and confirm each is processed once.",
    dep: ["dead-letter-queues","admin-tooling","tracing-and-headers"]
  },
  "capacity-planning": {
    s: "Estimating the brokers, disks, network and partitions needed for a workload, from message rate, size, retention, replication factor and the number of consumer groups.",
    d: "Disk need is ingest rate times retention times replication factor, plus headroom. Network need is ingest times replication for inter-broker traffic plus one outbound copy per consumer group. Partition count must be enough to give consumers parallelism and spread load, but each partition costs memory, file handles and election time. Load tests with realistic batch sizes validate the model. The difficulty is growth and skew: traffic changes, and one hot partition or a catch-up read burst breaks an average-based plan.",
    k: ["Many small partitions vs few large: many give parallelism and finer balancing, but increase metadata, recovery time and open files.", "Headroom for consumer catch-up vs sizing to steady state: headroom handles replays and incidents, but costs unused hardware most of the time."],
    p: ["Ignoring the fan-out of consumer groups underestimates outbound network by a large multiple.", "Sizing disk to retention without compaction lag or tiering leaves no room when retention is extended."],
    v: "Run a load test at the projected peak with the planned replication and consumer groups and confirm disk, network and request-handler idle percent stay inside the headroom for an hour.",
    dep: ["retention-policy","partitions","quotas-and-throttling"]
  },
  "cluster-rebalancer": {
    s: "A tool that measures per-broker load and proposes or executes partition moves to even out disk, traffic and leadership, within limits that protect live traffic.",
    d: "It collects metrics for each partition, models the cluster and searches for a set of replica and leader moves that satisfies goals such as rack awareness, disk balance and traffic balance, with minimal data movement. It then submits reassignments, throttled so copying does not starve producers and consumers. Moves are staged to limit concurrent copying. The difficulty is that data movement itself is expensive and slow, and the model lags real load.",
    k: ["Automatic continuous rebalancing vs operator-approved plans: automatic adapts to drift, but unreviewed moves can saturate the network during peak hours.", "Throttle low and move slowly vs fast: a low throttle protects traffic, but a long move leaves a hot or failing broker overloaded."],
    p: ["Rebalancing after adding a broker without a throttle saturates the network and raises produce latency cluster-wide.", "Moves planned from stale metrics shift load onto a broker that became busy meanwhile."],
    v: "Add an empty broker, run the rebalancer, and confirm that disk usage and traffic per broker converge within tolerance while produce p99 latency stays under its limit during the moves.",
    dep: ["partition-reassignment","broker-metrics","rack-aware-placement"]
  },
});
