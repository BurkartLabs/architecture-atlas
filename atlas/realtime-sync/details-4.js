// Details for the real-time sync plate, part 4: storage, indexes, operations, cross-cutting concerns.
ATLAS.details("realtime-sync", {
  "primary-store": {
    s: "The durable database that holds the current version of every document, serving reads, evaluating queries on first subscribe, and accepting committed writes.",
    d: "Documents are stored in a sorted, indexed structure keyed by collection and id, with each version tagged with its commit position. Reads can be served at a chosen position, which makes consistent snapshots possible. Writes append to the log first and are applied to the store afterward. Some designs keep several versions for point-in-time reads. The challenge is that the same store must serve low-latency point reads, range scans for subscriptions and a steady write stream, without any of them starving the others.",
    k: ["Multi-version storage vs overwrite in place: versions allow consistent snapshots and cheap reads at a position, but need cleanup of old versions; overwrite is compact and cannot serve past states.", "Purpose-built document store vs general database underneath: purpose-built stores fit the change feed and queries, and a general database is proven and constrains the feed design."],
    p: ["Old versions are never cleaned up and storage grows far beyond the live data size.", "A large range scan for one subscription evicts the working set and slows every other read."],
    v: "Read a document at an earlier commit position while writes continue and confirm the returned version is the one committed at that position. Run mixed point reads, scans and writes at target rates and confirm all stay within their latency budgets.",
    dep: ["write-ahead-log", "partitioning"]
  },
  "write-ahead-log": {
    s: "An append-only, ordered record of every committed write, flushed to durable storage before the write is acknowledged, which is the system's ground truth for order and recovery.",
    d: "Each write is appended with a position, in commit order, and forced to disk or replicated to a quorum before acknowledgment. The store, indexes and change feed are all derived from this log, so rebuilding any of them means replaying it. Batching several writes into one flush gives throughput, and the flush is the main source of write latency. Logs are segmented and trimmed after checkpoints. The difficulty is durability versus speed, and making sure every derived structure applies entries in exactly the log's order.",
    k: ["Flush per commit vs group commit: flushing each write is simplest and slowest; grouping amortizes disk cost and adds a small wait to each write.", "Quorum replication of the log vs local disk only: a quorum survives machine loss and adds network latency to every write; local disk is fast and loses acknowledged writes if the machine is lost."],
    p: ["A disk or controller that acknowledges a flush it has not completed loses acknowledged writes on power loss.", "The log is trimmed before a slow consumer has read it and that consumer can no longer recover."],
    v: "Write continuously, cut power to the primary at random moments, and after recovery confirm every acknowledged write is present, in order, and no unacknowledged write appears as committed.",
    dep: ["partitioning"]
  },
  "change-feed": {
    s: "A durable, ordered stream of document changes derived from the log, with before and after values and positions, read by live queries, triggers, replicas and search indexes.",
    d: "The feed exposes each commit as one entry containing its documents' old and new values and the commit position. Multiple consumers read independently, each tracking its own position, so a slow consumer does not hold up the others. Entries within a partition are ordered; ordering across partitions is only partial unless a global ordering is added. The feed is the single mechanism that keeps everything else in sync, so its correctness is the core of the system. The hard parts are retention, consumer lag and cross-partition order.",
    k: ["Feed carries full before and after values vs only ids: values let consumers act without reading back and enlarge the feed and leak data to consumers; ids are small and cost a read each.", "Total order across partitions vs per-partition order: total order simplifies consumers and needs a sequencer or timestamp merge; per-partition order scales and pushes merging to consumers."],
    p: ["A consumer reads the feed and then reads current data, and gets a newer value than the event describes, so it applies changes out of order.", "A single slow consumer forces retention of a huge feed backlog and fills the disks."],
    v: "Write 1,000,000 changes with several consumers running at different speeds, and confirm every consumer sees every change exactly in log order per partition, and a restarted consumer resumes at its saved position without gaps.",
    dep: ["write-ahead-log", "partitioning"]
  },
  "feed-retention": {
    s: "The policy for how long old changes are kept, which decides how long a client can be offline and still catch up by replay instead of re-downloading everything.",
    d: "Retaining the feed costs storage, and discarding it forces full resyncs. Systems retain by time, by size or until all registered consumers have passed a point. Clients that have been away longer than the retention window must resync from a snapshot. Retention can differ by consumer type: internal consumers need guarantees, while mobile clients accept resync. Compaction keeps only the latest change per document, which lets late consumers reach the current state without all history, at the cost of losing intermediate states.",
    k: ["Time-based retention vs consumer-position retention: time bounds storage and cuts off slow consumers; position-based never loses a registered consumer's data and can retain without limit.", "Log compaction to the latest value per key vs full history: compaction keeps the log small and cannot replay intermediate states; full history supports audit and replay."],
    p: ["Retention is set to one day, and users returning from a two-week vacation each trigger a full resync, all in the same morning.", "A dead consumer's position holds retention open for months and nobody notices until the disk is full."],
    v: "Disconnect a client for longer than the retention window and confirm it receives a snapshot rather than a gap. Register a consumer, stall it, and confirm alerts fire when its lag approaches the retention limit.",
    dep: ["change-feed", "snapshots-checkpoints"]
  },
  "replication-failover": {
    s: "Keeps copies of the data and log on several machines and promotes a copy when the primary fails, so the service survives losing a node without losing acknowledged writes.",
    d: "Each partition has a leader and followers. The leader replicates the log; commits are acknowledged after a quorum has it. A failure detector notices a missing leader, and an election promotes the most up-to-date follower. Live subscriptions on the old leader must reconnect and resume from their positions. The hard problems are split brain, where two nodes believe they lead, avoided with leases and fencing tokens, and the window of replication lag, which determines what a read from a follower may miss.",
    k: ["Synchronous quorum replication vs asynchronous replication: quorum loses nothing acknowledged and adds latency; asynchronous is faster and can lose recent writes at failover.", "Reads from the leader only vs from followers: leader reads are current and concentrate load; follower reads scale and may be slightly stale."],
    p: ["Two nodes both accept writes after a partition and their logs diverge irreparably.", "Failover completes in seconds but all clients reconnect to the new leader at once and overload it."],
    v: "Kill the leader under write load and confirm a new leader is elected within the target time, all acknowledged writes are present, and subscriptions resume without a gap. Isolate the old leader and confirm its writes are rejected.",
    dep: ["write-ahead-log", "partitioning"]
  },
  "partitioning": {
    s: "Divides data and its log into independent ranges or hashed shards spread over machines, so storage and write throughput grow by adding nodes.",
    d: "Documents are assigned to partitions by hashing the key or by key ranges. Each partition has its own log, leader and change feed. Queries that touch one partition are cheap; those that span several must merge results. Transactions across partitions are costlier. Partitions split when they grow or become hot and move between machines, which requires moving data and redirecting readers and subscribers without gaps. Partition choice also decides which data is collocated, so it should follow the access patterns, usually by tenant or document tree.",
    k: ["Hash partitioning vs range partitioning: hashing spreads load evenly and makes range scans hit every partition; ranges give cheap scans and risk hot ends for time-ordered keys.", "Partition by tenant vs by document: tenant partitioning keeps a customer's queries and transactions local, but a large tenant can outgrow a partition."],
    p: ["A partition split moves documents while subscribers are attached, and a change is delivered twice or not at all.", "Timestamp-prefixed keys put all new writes into the last range and one partition takes the entire write load."],
    v: "Split a loaded partition while clients subscribe to it and confirm no change is lost or duplicated, writes continue with bounded added latency, and the two halves then carry roughly equal load.",
    dep: ["identifier-generation"]
  },
  "snapshots-checkpoints": {
    s: "Periodic consistent copies of state at a known log position, used to speed recovery, bring new replicas up to date and give subscribers a starting point without replaying all history.",
    d: "A checkpoint records the store's state as of a specific log position. A new replica or restarting node loads the latest checkpoint and replays the log after it. Snapshots for subscriptions can be derived the same way or read from a consistent view. Taking a checkpoint must not stop writes, so it relies on copy-on-write or versioned reads. Frequency balances recovery time and cost: rare checkpoints mean long replays, frequent ones consume I/O. Old log segments before the oldest needed checkpoint can be removed.",
    k: ["Frequent checkpoints vs infrequent: frequent checkpoints shorten recovery and use more I/O and storage; infrequent ones are cheap and make restarts slow.", "Incremental checkpoints vs full copies: incremental ones are small and quick to take and slower to restore; full copies restore quickly and cost more to produce."],
    p: ["A checkpoint is taken without recording its log position exactly, so recovery replays or skips a few entries.", "Log trimming is based on the newest checkpoint, though a lagging replica still needs older entries."],
    v: "Restore a node from a checkpoint taken during heavy writes, replay the log from its recorded position, and confirm the result is byte-identical to a node that never stopped, with recovery time inside the target.",
    dep: ["write-ahead-log", "primary-store"]
  },
  "blob-storage": {
    s: "Separate storage for large binary objects such as images and attachments, referenced from documents, so big payloads stay out of the live change stream.",
    d: "Documents hold a reference and metadata; the bytes go to an object store, uploaded directly by clients with a short-lived signed permission, then confirmed. Downloads use signed URLs or a content network. Keeping blobs out of documents keeps change events and snapshots small. The hard parts are consistency between the document and the object: an upload with no document leaves orphans, and a document with no upload is a broken link. Large uploads need resume, and access control must match the document's rules.",
    k: ["Direct client upload with signed permission vs upload through the backend: direct upload saves backend bandwidth and needs a confirmation step; proxying is simple and costly.", "Reference by id with garbage collection vs embed small blobs in documents: references keep documents small and need orphan cleanup; embedding is atomic and bloats the feed."],
    p: ["Uploads that never get a document pile up as orphans and are billed forever.", "A signed link is shared and works for anyone long after the user lost access to the document."],
    v: "Upload a 500 MB file with a connection drop midway and confirm it resumes, the document links to it after confirmation, orphaned uploads are cleaned within the policy time, and a user without document access cannot fetch it.",
    dep: ["authorization-rules", "primary-store"]
  },
  "secondary-indexes": {
    s: "Additional sorted structures over chosen fields, kept in step with writes, so queries by those fields read a small range instead of scanning the collection.",
    d: "An index maps field values to document ids in sorted order and is updated in the same commit as the document. A query uses it to find matches, order results and bound ranges. For live queries, the index also defines which write ranges could change a result, so dependency tracking uses it. Every index slows writes and takes storage, so only fields that queries need are indexed. Indexes must be exactly consistent with data, including through failures and backfills, and queries without a usable index must be rejected or limited.",
    k: ["Index only declared fields vs index every field automatically: declared indexes keep writes cheap and require developers to plan; automatic indexing is convenient and multiplies write cost and storage.", "Synchronous index updates in the commit vs asynchronous: synchronous indexes are always correct for live queries, and slow writes; asynchronous is fast and can return stale or missing results."],
    p: ["A query without an index scans a million documents each time it is re-evaluated for a subscriber.", "An index is missing for one sort order and the live query's result differs from a fresh query."],
    v: "Add an index, run the query, and confirm the plan reads only the matching range. Update an indexed field and confirm the document moves in the index in the same commit and subscribed queries reflect it.",
    dep: ["primary-store", "write-ahead-log"]
  },
  "composite-indexes": {
    s: "Indexes over several fields in a defined order, supporting queries that filter on some fields and sort by another without a separate sort step.",
    d: "A composite index sorts by the first field, then the second, and so on. A query can use it when equality filters match a prefix and a range or sort follows. Field order is decisive: an index on (a, b) supports filtering by a and ordering by b but not the reverse. Several queries often need several indexes. Their combined size and write cost grow quickly. For live queries, the index order also decides how a window of results is maintained, so a missing composite index makes a sorted live query impossible.",
    k: ["One composite index per query shape vs merging several single-field indexes: composites are fast and numerous; merging reuses fewer indexes and is slower at query time.", "Declare indexes with code and review vs create them on demand when a query runs: declared indexes avoid surprise cost; on-demand ones remove friction and trigger large builds unexpectedly."],
    p: ["Fields are listed in the wrong order and the index cannot serve the intended query even though it contains all fields.", "Dozens of overlapping composite indexes make each write update fifteen structures."],
    v: "For each documented query shape, run an explain and confirm it uses a named composite index, reads only the result range, and needs no in-memory sort. List unused indexes and confirm each has an owner.",
    dep: ["secondary-indexes"]
  },
  "query-planner": {
    s: "Chooses how to evaluate a query, which index to use and in what order, and rejects queries that have no efficient plan before they become live subscriptions.",
    d: "The planner receives a normalized query, looks at available indexes and, where it has them, statistics on value distribution, and selects a plan. For live queries, plan choice matters twice: first for the initial result and then for how changes are matched. Simple systems accept only queries with an obvious index, which makes cost predictable. More flexible ones estimate cardinalities. Plans can degrade as data shifts, so choices are visible through explain output. The hard part is predictability under changing data.",
    k: ["Rule-based planning with few query shapes vs cost-based planning: rules are predictable and limit what developers can ask; cost-based planning handles many shapes and can pick a bad plan after data changes.", "Reject queries with no index vs execute with a warning: rejection prevents slow subscriptions in production, and execution is friendlier in development."],
    p: ["Statistics are stale after a bulk import and the planner picks a full scan for a hot subscription.", "A query that was fast in development has no index in production because index builds were not deployed."],
    v: "Run the query suite against realistic data volumes, compare each chosen plan to the expected one, and confirm an unindexed query is rejected with a message naming the index it needs.",
    dep: ["secondary-indexes", "composite-indexes", "query-cost-limits"]
  },
  "index-backfill": {
    s: "Builds a new index over existing data while the system keeps serving reads and writes, then switches queries to it only when it is complete and consistent.",
    d: "A new index is created in a building state. A background process scans the data at a throttled rate, writing entries, while concurrent writes also update the index so it does not miss new changes. When the scan finishes and the two streams are reconciled, the index becomes available. Queries and live subscriptions that need it wait or fail until then. Big collections take hours. The difficulties are throttling, so the build does not starve live traffic, and resumability after a failure.",
    k: ["Online build while serving traffic vs offline build with downtime: online builds keep the service up and take longer and complicate correctness; offline is simple and unavailable.", "Throttled background rate vs fast build: throttling protects live latency and extends the window with the index missing; fast builds finish sooner and hurt traffic."],
    p: ["The index is used before the backfill finishes and queries return partial results without any error.", "A failed build restarts from the beginning and never completes on a table that is growing quickly."],
    v: "Build an index on a collection under continuous writes, then compare its entries against a full scan and confirm they are identical. During the build, confirm live traffic latency stays inside its budget and queries do not use the unfinished index.",
    dep: ["secondary-indexes", "change-feed", "load-shedding"]
  },
  "specialized-indexes": {
    s: "Indexes for non-sortable searches such as text, geographic area and array containment, which need different structures and have weaker support for live updates.",
    d: "Text search uses inverted indexes mapping terms to documents, with tokenization and ranking. Geographic indexes use space-filling curves or trees to find items within a region or near a point. These structures are often maintained asynchronously by a separate component fed from the change feed, so results lag writes by a short time and live queries over them are approximate. Ranking and distance-sorted results change as other documents change, which makes incremental maintenance difficult. Some systems delegate these queries to a dedicated search service.",
    k: ["Built-in specialized indexes vs a separate search service: built-in is integrated and consistent with live queries, but limited; a separate service is powerful and lags and needs its own sync.", "Live results for text and geo queries vs refresh on request: live updates feel immediate and are expensive and hard to rank; refresh is simpler and delays."],
    p: ["Search results lag the data by minutes, so a user cannot find the document they just created.", "A change to one document alters the relevance rank of thousands, and live ranked queries re-evaluate constantly."],
    v: "Create a document and measure the time until it appears in a text query and a nearby search. Confirm it is within the stated lag, and that deleting it removes it from both within the same bound.",
    dep: ["change-feed", "secondary-indexes"]
  },
  "query-cost-limits": {
    s: "Limits on result size, documents scanned and work per query, enforced at planning and run time, so no single subscription can consume the system's capacity.",
    d: "Each query is bounded: a maximum number of returned documents, a cap on scanned entries, a time limit and a limit on subscriptions per client. Costs are estimated at planning and enforced while running; exceeding them aborts the query with an error. Live queries also have a standing cost, since each change is evaluated, so limits include the number and complexity of subscriptions. The difficulty is setting limits that stop abuse without breaking legitimate large results, and explaining a rejection clearly enough that developers can fix their query.",
    k: ["Hard limits on every query vs soft limits with throttling: hard limits protect the system and surprise developers at production scale; soft limits degrade service gradually.", "Per-query limits vs per-client budgets: per-query limits are easy to explain and miss many cheap queries; budgets catch aggregate abuse and need accounting."],
    p: ["A subscription without a limit works on test data and loads a million documents in production.", "A limit error is reported as a generic failure and developers cannot tell which query caused it."],
    v: "Submit queries that exceed each limit and confirm each is aborted with an error naming the limit and the query. Run an allowed heavy query and confirm it completes and the system's other latencies stay within budget.",
    dep: ["query-planner"]
  },
  "backups-pitr": {
    s: "Regular full copies plus a continuous archive of the log, allowing restoration to any chosen moment, which is the only defense against deletion and corruption that replication copies faithfully.",
    d: "Replicas protect against hardware failure but replicate mistakes instantly, including a bad deploy or a mass delete. Backups combine periodic snapshots with the archived log, so restoring means loading a snapshot and replaying the log until a chosen timestamp. They are stored in a separate account and region, encrypted, with retention rules and protection against deletion. Restores of a very large dataset take hours, and the restored data must be reconciled with clients that have synced since, whose cursors may now be ahead of the data.",
    k: ["Continuous log archiving vs periodic snapshots only: archiving allows second-level recovery points and costs storage and complexity; snapshots alone are simple and lose hours.", "Backups in the same account vs isolated account: same-account is convenient and shares fate with a compromise; isolation survives credential loss and costs process."],
    p: ["Backups exist and the log archive has a gap, so restoring to the needed time is impossible.", "A restore rolls data back and clients with newer cursors keep their lost changes and push them back as new."],
    v: "Delete a collection, restore to one minute before the deletion into a separate environment, and confirm the data matches the pre-deletion state. Measure the full time and compare it with the stated recovery objective.",
    dep: ["write-ahead-log", "snapshots-checkpoints"]
  },
  "restore-drills": {
    s: "Scheduled rehearsals that restore backups into a clean environment and check them, because a backup that has never been restored is an unverified assumption.",
    d: "A drill restores the latest backup to an isolated cluster, replays the log to a target point, runs integrity checks and compares sample data and counts with the source. It measures the time taken and records any manual steps. Drills also cover the surrounding process: who has access, whether keys are available, whether runbooks are correct. They find silent failures such as missing log segments, changed formats and expired keys. Automating them turns the check into a continuous alert rather than an annual event.",
    k: ["Automated frequent drills vs occasional manual ones: automation finds silent breakage within days and costs infrastructure; manual drills cover process and happen too rarely to catch drift.", "Verify by full comparison vs sampling: full comparison is exact and expensive; sampling is cheap and can miss localized damage."],
    p: ["The backup restores, but the encryption key it needs was rotated away and nobody can decrypt it.", "Drills restore only the main database, and the blob store and configuration are missing in the real incident."],
    v: "Run an automated drill that restores last night's backup to a point in time, runs checksums and a client sync against it, and reports pass or fail with the elapsed time. Confirm a deliberately corrupted backup fails the drill.",
    dep: ["backups-pitr"]
  },
  "data-migrations": {
    s: "Changes to stored data or its structure while clients are connected, executed in steps that keep old and new application versions working and subscriptions consistent.",
    d: "Migrations such as renaming a field, splitting a collection or changing an id format are done as expand, migrate and contract: first write both shapes, then backfill old data in the background, then switch readers, then remove the old shape. Each step is deployed separately and reversible. The migration writes appear in the change feed, so subscribers see every migrated document, which can flood clients; migration writes may need to be tagged so clients and triggers can ignore them.",
    k: ["Expand and contract with background backfill vs one big offline migration: stepwise changes keep service running and take many releases; an offline migration is quick and requires downtime.", "Migrate lazily on read vs eagerly in the background: lazy migration costs nothing up front and leaves old shapes in place indefinitely; eager migration finishes and loads the system."],
    p: ["A backfill rewrites every document and the change feed floods every subscribed client with updates for data that did not change in meaning.", "Contract step runs before all clients have upgraded and old clients can no longer read the data."],
    v: "Migrate a collection of ten million documents while clients write and subscribe, then compare each document to the expected new shape, confirm no client saw an invalid state, and that feed volume and latency stayed within limits.",
    dep: ["schema-validation", "change-feed", "protocol-versioning"]
  },
  "autoscaling": {
    s: "Adds or removes gateways, fan-out nodes and storage partitions as measured load changes, using signals appropriate to long-lived connections rather than request rate.",
    d: "Request-driven scaling signals do not fit connection-heavy systems. Capacity is tied to connections per node, subscription count, change throughput, fan-out volume and memory. New gateways take new connections only, and existing connections stay where they are unless drained, so scale-down must move clients gradually. Storage scales by splitting and moving partitions. Predictable peaks, such as an event start, call for scheduled scaling since a reactive scale takes minutes while a surge arrives in seconds.",
    k: ["Reactive scaling on load metrics vs scheduled capacity: reactive scaling follows demand without planning and arrives after the surge; scheduled capacity is ready in time and wastes money when guesses are wrong.", "Scale down aggressively vs conservatively: aggressive scale-down saves cost and forces reconnect waves; conservative scale-down is calm and costlier."],
    p: ["New gateway nodes sit empty because clients stay on old ones, while old nodes are overloaded.", "A scale-in drains nodes quickly and causes a reconnect storm that triggers another scale-out."],
    v: "Ramp simulated load from 10% to 100% of target in five minutes and confirm latency stays inside budget with no connection refused. Ramp down and confirm nodes are removed without more than the allowed reconnect rate.",
    dep: ["graceful-draining", "observability-metrics", "partitioning"]
  },
  "observability-metrics": {
    s: "Metrics, logs and alerts about the health of connections, subscriptions, change throughput and delivery, showing when users are affected before they complain.",
    d: "Key gauges and counters include open connections, connection churn, subscriptions per node, change feed lag, fan-out latency, queue depth, dropped or coalesced messages, and error rates by type. They are labeled by region, node and, where affordable, tenant. Alerts follow user-facing objectives, such as the fraction of updates delivered within a second, instead of resource thresholds. Cardinality must be kept in check, since per-document or per-user labels can overwhelm the metrics system. Logs need sampling and removal of document content.",
    k: ["Alert on user-facing objectives vs on resource thresholds: objective alerts reflect real impact and need defined targets; resource alerts are simple and noisy.", "High-cardinality per-tenant metrics vs aggregates: per-tenant data finds noisy neighbors and costs storage; aggregates are cheap and hide who is affected."],
    p: ["Metrics report average latency and hide that one partition is taking ten seconds.", "Logs contain document contents and leak personal data into a system with broader access."],
    v: "Inject a delivery delay into one region and confirm the delivery objective alert fires within minutes naming the region. Confirm logs for that window contain no document field values.",
    dep: ["sync-lag-tracing"]
  },
  "sync-lag-tracing": {
    s: "Follows a single change from commit to each subscriber's screen, timing every hop, so slow delivery is traced to a specific stage rather than guessed at.",
    d: "Each change carries a trace id and a commit timestamp. Stages record when the feed read it, the router matched it, the node evaluated authorization, the gateway queued it and the socket wrote it, and sampled clients report when they applied it. The difference between commit and apply is the end-to-end sync latency and is the headline measure. Stage timings point to the cause: feed lag, a hot shard, slow rules or a congested connection. Clock differences between nodes limit precision, so durations use local clocks and offsets are measured.",
    k: ["Sample a fraction of changes vs trace every change: sampling is cheap and can miss rare slow paths; tracing all gives full coverage at significant overhead.", "Client-reported apply times vs server-side only: client reports capture the real experience and rely on client clocks and cooperation; server-side numbers are reliable and end at the socket."],
    p: ["Tracing is sampled uniformly, so the rare hot-key delivery path is never captured.", "Client and server clocks are compared directly and negative latencies appear in the data."],
    v: "Commit a marked change and confirm the trace shows every stage with a timestamp, the end-to-end figure matches an independent stopwatch at a test client within tens of milliseconds, and an injected delay in one stage is visible there.",
    dep: ["change-feed", "hybrid-logical-clocks"]
  },
  "tenant-isolation": {
    s: "Keeps one customer's data, load and failures separate from others, in both the logical sense, so no one reads another's data, and the resource sense, so no one starves others.",
    d: "Logical isolation comes from tenant ids in every key, rule and query, checked at the lowest layer so one missing filter cannot expose data. Resource isolation uses per-tenant quotas on connections, subscriptions, writes and bandwidth, and fair queuing in shared components. Large tenants may get dedicated partitions or clusters. The cost of stronger isolation is lower utilization and more operational surface. The difficult cases are noisy neighbors in shared caches and hot fan-out paths, and bugs in shared code that cross the boundary.",
    k: ["Shared infrastructure with logical isolation vs dedicated stacks per tenant: sharing is efficient and relies on getting every check right; dedicated stacks contain faults and are expensive.", "Hard per-tenant quotas vs best-effort fair sharing: hard quotas are predictable and strand idle capacity; fair sharing uses capacity well and gives less predictable limits."],
    p: ["A tenant id is taken from a client-supplied field in one code path and a user can read another tenant's data.", "One tenant's bulk import saturates a shared partition and every other tenant's latency rises."],
    v: "Run a hostile test tenant attempting cross-tenant reads, writes and subscriptions and confirm all fail. Drive one tenant at ten times its quota and confirm other tenants' latency and error rates do not change.",
    dep: ["authorization-rules", "partitioning"]
  },
  "load-shedding": {
    s: "Deliberately refuses, delays or degrades some work when the system is overloaded, protecting critical paths, and limits abusive clients before they cause an outage.",
    d: "Admission control checks queue depth, CPU and lag, and rejects new connections, new subscriptions or low-priority writes with a retry-after hint when thresholds are crossed. Existing sessions and key operations such as heartbeats and acknowledgments keep priority. Rate limits per user, token and address stop floods, repeated failed authentication and runaway client bugs. Degradation steps include longer coalescing, dropping presence updates and pausing background work. The hard part is choosing what to drop, and telling clients in a way that backoff, not retry storms, results.",
    k: ["Reject early at the edge vs queue and process later: early rejection protects the core and wastes the client's retry; queuing preserves requests and grows latency until everything fails together.", "Prioritize existing sessions vs new connections: keeping existing sessions healthy preserves user experience; admitting new ones helps recovery and adds load."],
    p: ["Rejections carry no retry hint and clients retry at once, multiplying the overload.", "Shedding is applied to heartbeats too, and healthy connections are declared dead and dropped."],
    v: "Drive 3x the rated load and confirm the system admits the rated amount, rejects the rest with a retry hint, keeps heartbeats and acknowledgments on time, and returns to normal latency within a minute of the load ending.",
    dep: ["observability-metrics", "reconnect-backoff"]
  },
  "consistency-model": {
    s: "The guarantees a reader can rely on: whether it sees its own writes, whether it sees changes in order, and how stale a view may be, decided once for the whole system.",
    d: "Real-time sync usually promises read-your-writes through optimistic local state, per-document or per-partition ordering, and eventual convergence of replicas, rather than global linearizability. Transactions and server arbitration add stronger guarantees for selected data. Every layer participates: the cache layers pending writes over server state, the feed provides order, subscriptions deliver consistent snapshots, and conflict rules decide merges. The model must be documented as precisely as possible because application authors build assumptions on it, and violating them causes bugs far from the cause.",
    k: ["Eventual consistency with convergence vs strong consistency everywhere: eventual consistency allows offline work, low latency and scale, and exposes anomalies; strong consistency is simple to reason about and needs connectivity and coordination.", "Per-document guarantees only vs multi-document: per-document is cheap and scales; multi-document guarantees match real invariants and cost coordination."],
    p: ["Developers assume a write to two documents is seen together by every client, and an interface shows an inconsistent combination.", "A feature is built on read-your-writes across devices, which the model does not provide."],
    v: "Run a consistency checker against recorded histories from concurrent clients with injected network faults, and confirm no history violates each documented guarantee, and all replicas converge after faults stop.",
    dep: ["transactions", "causal-ordering", "last-writer-wins", "optimistic-updates"]
  },
  "ordering-and-clocks": {
    s: "How events are given an order across clients and servers, using log positions, logical clocks and timestamps, which determines who wins conflicts and what a cursor means.",
    d: "Within a partition, the log position is a total order. Across partitions and clients there is no single clock, so systems use hybrid logical clocks for timestamps and version vectors for causality. Client clocks cannot be trusted for correctness, so important ordering comes from the server. Time appears in conflict rules, retention, token expiry, leases and presence, and each use needs a clear definition of which clock it reads. A mismatch between these definitions is a common source of rare, hard-to-reproduce bugs.",
    k: ["Server-assigned order vs client-assigned timestamps: server order is trustworthy and needs connectivity to finalize; client timestamps work offline and can be wrong or forged.", "One global order vs partial orders per partition: a global order is easy to use and needs a bottleneck; partial orders scale and require consumers to cope with concurrency."],
    p: ["A lease uses wall-clock time on two nodes whose clocks differ, and both believe they hold it.", "Timestamps from an offline device set a year in the future win every conflict afterward."],
    v: "Skew node clocks by minutes in a test cluster and confirm leases, conflict outcomes, token expiry and retention behave per the documented clock source, with no ordering violation in the change feed.",
    dep: ["hybrid-logical-clocks", "sync-cursors", "write-ahead-log"]
  },
  "security-boundary": {
    s: "Where trust is enforced: clients are untrusted, so every authorization, validation and rate limit must run on the server, on every path that data takes out or in.",
    d: "Clients talk almost directly to the data, which makes the rules, the schema and the gateway the only barrier. Every path must be covered: queries, subscriptions, deltas, replays after reconnect, presence channels, blobs and server functions. Secrets stay on the server. Tokens are verified at the edge and carried in claims. Data is encrypted in transit and at rest, and tenant ids are enforced at the lowest layer. The boundary fails at its weakest path: a single unprotected channel or a replay that skips rule evaluation exposes everything.",
    k: ["Central enforcement in the data layer vs checks in each function: central rules cover every path uniformly and constrain what can be expressed; scattered checks are flexible and easy to miss in one place.", "Deny by default vs open by default during development: deny by default prevents leaks and slows prototyping; open by default is fast and leaves dangerous settings in production."],
    p: ["Reconnect replay sends buffered changes without re-running current rules and delivers data after access was revoked.", "A new channel type is added without authorization because the old rules only knew about documents."],
    v: "Run a path-by-path test of every read and write route as unauthenticated, wrong-user, wrong-tenant and revoked users, including subscriptions, replays, presence and blobs, and confirm every unauthorized attempt fails and leaks no data.",
    dep: ["authorization-rules", "per-document-evaluation", "tenant-isolation", "authentication-tokens"]
  },
  "latency-budgets": {
    s: "A target for end-to-end delay from a write to every subscriber's screen, divided among the hops, so each component has a number it must stay under.",
    d: "A typical goal is a few hundred milliseconds at the 99th percentile. The budget is split across commit, change feed read, routing, rule evaluation, queueing, network and client application, with a few tens of milliseconds each. Batching, coalescing and compression buy throughput by spending latency, so their windows are chosen from the budget. Measurement follows the same split, which is why tracing exists. The budget also sets the largest tolerable result size and rule cost, and it is the first thing exceeded when load grows.",
    k: ["Optimize the tail (p99) vs the median: tail targets reflect user experience and require removing pauses and hot spots; median targets are easier and hide the slowest users.", "Spend latency on batching vs spend capacity on immediacy: batching lowers cost per message and adds delay; immediate sends cost more and feel instant."],
    p: ["Each team meets its own target, yet end-to-end delay is three times the goal because the targets were never added up.", "A garbage collection pause or disk flush on one node adds seconds to the tail and never shows in averages."],
    v: "Measure commit-to-render delay for sampled updates at target load and confirm p50 and p99 are within the budget overall and at each stage, then repeat while a single node is slow and confirm the tail stays within the budget.",
    dep: ["sync-lag-tracing", "coalescing", "change-feed"]
  },
  "sharding-and-hotspots": {
    s: "How data, subscriptions and connections are spread across machines, and what happens when demand is not uniform, which is the rule for real traffic.",
    d: "Three things are sharded separately: data by partition, subscriptions and topics by hash, and connections by gateway. Uniform hashing balances count and not load, so a single popular document, topic or tenant creates a hotspot that no number of nodes can absorb unless the key itself is split or replicated. Rebalancing moves data while traffic continues. Hotspot handling therefore appears in storage, fan-out, presence and counters. The decision is made early because keys, paths and topic names fix what can be split.",
    k: ["Key design that avoids hotspots vs mitigating them after the fact: good keys prevent the problem at no runtime cost and need foresight about access patterns; after-the-fact mitigation is reactive and complex.", "Automatic rebalancing vs operator-driven: automatic rebalancing responds quickly and can thrash or move load at bad times; manual control is predictable and slow."],
    p: ["A launch event drives everyone to one document and the owning shard saturates while the rest of the cluster idles.", "Rebalancing runs during peak and its data movement doubles latency for the tenants it was meant to help."],
    v: "Skew test traffic so that one key gets 100 times average load, and confirm the system detects it, spreads or caches the key, and keeps p99 latency for other keys on the same shard within the budget.",
    dep: ["partitioning", "topic-sharding", "hot-key-mitigation"]
  },
  "failure-and-recovery": {
    s: "What breaks, how it is noticed and how the system returns to a correct state, covering crashes, partitions, bad deploys and corrupted data, and what clients see in each case.",
    d: "Failures are the normal case: gateways restart on every deploy, nodes die, regions lose connectivity, and humans delete things. Each layer has a recovery path: clients reconnect and resume, gateways drain, subscriptions rebuild from the feed, partitions fail over, and data is restored from backups. The design question is what is lost, what is delayed and what is duplicated in each case, and whether the system can tell. Recovery paths are rarely exercised in normal operation, so they are tested deliberately with injected faults.",
    k: ["Resume from positions vs full resync after any fault: resume is fast and needs retained history and validated cursors; full resync is simple and creates load spikes after every failure.", "Fail closed vs fail open on authorization outages: failing closed protects data and takes the product down; failing open keeps it up and risks exposure."],
    p: ["A recovery path used only once a year no longer works because the code around it changed.", "After a regional failure, every client resyncs at once and the surviving region fails in turn."],
    v: "Run scheduled fault injection that kills gateways, a database leader, a feed consumer and a whole region in turn, and confirm that for each, no acknowledged write is lost, clients recover within target time, and the system returns to normal without manual steps.",
    dep: ["replication-failover", "resume-tokens", "backups-pitr", "graceful-draining"]
  },
});
