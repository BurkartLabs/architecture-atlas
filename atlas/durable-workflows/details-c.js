// Details for the durable workflow plate, part 3: frontend, matching, history service, persistence.
ATLAS.details("durable-workflows", {
  "frontend-service": {
    s: "The stateless API tier that authenticates callers, validates and rate limits requests, resolves namespaces and forwards each call to the history or matching service that owns the data.",
    d: "Every client and worker request lands here first. The frontend checks the token, finds the namespace, enforces per-namespace limits, then routes: workflow-scoped calls to the history shard for the workflow ID, polls to matching for the queue. It also serves list queries from the visibility store and handles payload size limits. Because it holds no workflow state, it scales behind a plain load balancer. Its job is to absorb abuse and malformed input before it reaches stateful tiers.",
    k: ["Validate and limit at the edge vs deeper: edge checks protect shards cheaply, but inner services must still defend themselves against internal callers.", "One frontend for clients and workers vs separate pools: separate pools stop a worker poll storm from starving client calls."],
    p: ["Long polls held at the frontend exhaust connections if the load balancer idle timeout is shorter than the poll.", "A frontend with a stale namespace cache applies old retention or rejects a new namespace."],
    v: "Send requests with an invalid token, an unknown namespace and an oversized payload, and confirm each is rejected at the frontend with a distinct error and no shard receives a call.",
    dep: ["namespace-registry", "request-routing", "authn-and-authz", "quotas-and-rate-limits", "internal-rpc"]
  },
  "namespace-registry": {
    s: "A cached view of namespace records, retention, quotas, replication clusters and failover version, refreshed so every service resolves a namespace without a database read per call.",
    d: "Namespace records live in a metadata store. Each service keeps an in-memory copy and refreshes it on a short interval or by change notification. A call arrives with a name, and the service resolves it to an ID and settings. Updates, such as changing retention or failing over to another cluster, propagate within the refresh interval, so for a short time different nodes disagree. The registry also tells services whether a namespace is active in this cluster, which gates writes in multi-cluster setups.",
    k: ["Cache with periodic refresh vs read through every time: caching removes the metadata store from the hot path, but allows brief inconsistency after changes.", "Namespace IDs separate from names: IDs let a rename or recreate leave old data alone, at the cost of an extra mapping."],
    p: ["A failover applied while some nodes still hold the old active cluster causes writes in two places.", "Metadata store outage with a cold cache blocks every request on restart."],
    v: "Change a namespace's retention, then query a service node's view; confirm it shows the new value within the refresh interval and that all nodes agree afterwards.",
    dep: ["persistence-interface", "namespaces", "dynamic-config"]
  },
  "request-routing": {
    s: "Choosing the destination for each call: workflow ID hashed to a shard and then to its owner, task queue name to a partition and its owner.",
    d: "For workflow-scoped calls the frontend computes a hash of the namespace and workflow ID modulo the fixed shard count, looks up the shard's owner on the membership ring and sends the call there. If the owner has changed, the receiving node replies with a not-owner error and the caller refreshes and retries. For polls it routes by queue partition. Routing is deterministic from the data, so any frontend routes the same way. The cost is hot keys: a popular workflow ID always goes to one shard.",
    k: ["Hash-based routing vs lookup table: hashing is stateless and fast, a table can rebalance individual keys but needs its own consistent store.", "Retry on not-owner at the caller vs forward at the receiver: caller retry keeps services simple, forwarding saves a hop during shard movement."],
    p: ["Stale membership at a frontend sends traffic to a former owner repeatedly during rebalancing.", "A skewed workflow ID distribution concentrates load on a few shards despite many hosts."],
    v: "Start workflows with a thousand distinct IDs and confirm requests spread across shards per the hash; move one shard's owner and confirm calls retry and succeed after one not-owner response.",
    dep: ["consistent-hash-ring", "membership-ring", "history-shards", "internal-rpc"]
  },
  "request-deduplication": {
    s: "Storing the request ID of recent mutating calls on the execution so a retried start, signal or completion returns the original result instead of repeating its effect.",
    d: "Each mutating call may carry a request ID, kept in mutable state with a bounded set of recent IDs. When the shard sees a repeated ID, it returns the earlier outcome without writing another event. For starts, the stored ID maps to the run ID. For signals, the set is per execution. The set is limited in size and in time, so deduplication works for retries within seconds or minutes, not for a client that retries next day. Callers must generate the ID once per logical operation.",
    k: ["Server-held request ID set vs client-only idempotency: server-held IDs make retries safe against lost responses, but cost state in every execution and a bounded window.", "ID per attempt vs per operation: per-attempt IDs defeat the mechanism, per-operation IDs require callers to keep them across retries."],
    p: ["A client library that regenerates the request ID on each retry creates duplicate signals.", "A window shorter than the client's maximum retry delay lets a late retry repeat the effect."],
    v: "Send the same signal request ID three times and confirm the history has one signal event and all three calls return success.",
    dep: ["mutable-state", "history-service", "start-workflow-request"]
  },
  "matching-service": {
    s: "The sharded service that holds task queues, pairs scheduled tasks with polling workers and spills backlog to storage when no worker is waiting.",
    d: "Matching owns task queue partitions through the same hash ring as history. When history creates a task, it calls matching, which tries to give it directly to a waiting poller; if none is waiting it writes the task to the backlog store and keeps it in memory. A poller is parked until a task arrives. Matching also applies per-queue rate limits and routes by build ID. It is not the source of truth about the workflow: if a task is lost, history can recreate it.",
    k: ["Matching separate from history vs combined: separation scales polls independently and isolates worker load, at the cost of a hop and a possible lost task.", "In-memory queues with storage backlog vs always persistent: memory is fast, but persistence keeps tasks through a restart."],
    p: ["A task acknowledged to history but not stored is lost on a crash, and the workflow stalls until a timeout recreates it.", "Hot task queues pin one partition owner and become a bottleneck."],
    v: "Pause all workers, schedule one hundred activities, confirm backlog reaches one hundred in the queue description, then resume workers and confirm the backlog drains to zero.",
    dep: ["task-queue-partitions", "sync-match", "task-backlog", "membership-ring", "persistence-interface"]
  },
  "task-queue-partitions": {
    s: "Splitting one logical task queue into several partitions, each owned by a different matching node, to raise throughput beyond what one node can dispatch.",
    d: "A busy queue has a configurable number of partitions, with a root partition and children. Producers write to a random or hashed partition; pollers spread across them. Since partitions are separate queues, ordering across them is not guaranteed, and an idle poller on one partition would miss tasks on another, so forwarding moves them. Partition count is dynamic configuration, and too many partitions produce sparse queues that rely on forwarding for every task.",
    k: ["More partitions vs fewer: more partitions raise throughput and spread load, but dilute pollers and increase forwarding.", "Random write distribution vs hash by workflow: random balances load, hashing keeps one workflow's tasks together but can skew."],
    p: ["Partition count raised without enough pollers leaves tasks stranded on partitions nobody polls.", "Assuming FIFO order across a partitioned queue breaks logic relying on task ordering."],
    v: "Raise partitions for a busy queue from one to four, run a load test, and confirm tasks spread across four owners and dispatch rate rises while average schedule-to-start stays flat.",
    dep: ["matching-service", "partition-forwarding", "dynamic-config", "consistent-hash-ring"]
  },
  "sync-match": {
    s: "Handing a newly created task straight to an already waiting poller without writing it to storage, which removes a database round trip from the common path.",
    d: "When history delivers a task to matching and a poller is parked on that partition, matching passes the task over in memory and replies to history. The poller then starts it, and history confirms through the start event. Only when no poller is waiting does matching persist the task. Sync match gives low latency but means durability rests on history's ability to recreate the task if something fails in between. If matching crashes after handover but before the poller acts, the schedule-to-start timer eventually recreates it.",
    k: ["Sync match vs always persist: sync match cuts latency and database writes, but depends on history-side recovery for the rare crash.", "Wait briefly for a poller before persisting vs persist immediately: waiting increases sync matches, but delays tasks when no poller comes."],
    p: ["Tasks handed to a poller that dies before processing wait for a timeout before being retried.", "Metrics counting only persisted tasks make a busy queue look idle."],
    v: "With warm pollers waiting, schedule a task and confirm it is dispatched with no backlog write recorded, and the sync match counter increments.",
    dep: ["matching-service", "long-poll-task-pollers", "transfer-task-queue"]
  },
  "task-backlog": {
    s: "The durable list of tasks that have no waiting poller, stored with ordering and a read position, so work waits safely through worker outages.",
    d: "Matching writes tasks in ordered batches and tracks an acknowledgment level. When pollers return, it reads from the store and dispatches. Expired tasks, such as those past schedule-to-start, are dropped lazily. Ownership changes force a new owner to read the queue's metadata and resume from the ack level. A long backlog after an outage means a burst of work when workers return, which can overload downstream systems if the dispatch rate is not limited.",
    k: ["Persist backlog tasks vs rebuild from history: persisting makes dispatch fast, rebuilding avoids the store but needs a scan of every execution.", "Strict ordering vs best effort: order matters for fairness, but best effort allows parallel reads and higher throughput."],
    p: ["A huge backlog read at once by a new owner stalls dispatch and memory.", "Tasks for workflows that have since closed still dispatch, wasting worker capacity until dropped."],
    v: "Stop all workers, schedule one thousand activities, restart matching, then start workers and confirm all one thousand tasks execute exactly once.",
    dep: ["persistence-interface", "matching-service", "conditional-writes"]
  },
  "partition-forwarding": {
    s: "Moving tasks or polls between partitions of a queue, up a tree toward the root, so a task and a poller meet even if they landed on different partitions.",
    d: "When a partition has a task but no local poller, it forwards the task to its parent; when it has a poller but no task, it forwards the poll upward. The root partition sees the combined stream. Forwarding has a depth and rate limit to avoid storms. It means partitioning does not strand work, at the cost of extra hops and a more complex failure story, because a forwarded task is in flight between two nodes with no single owner for a moment.",
    k: ["Forward tasks vs forward polls: forwarding tasks reaches idle pollers quickly, forwarding polls keeps pollers close to data but needs more parked requests.", "Tree vs all-to-all forwarding: a tree bounds fan-out, though the root can become a hot spot."],
    p: ["Forwarding loops with misconfigured partition trees bounce tasks between nodes.", "Forward timeouts shorter than a slow node's response drop tasks that matching then recreates, duplicating dispatches."],
    v: "Park one poller on a child partition, create a task on a sibling partition, and confirm the poller receives it via forwarding and the forwarding counter increments.",
    dep: ["task-queue-partitions", "matching-service", "internal-rpc"]
  },
  "history-service": {
    s: "The sharded service that owns each workflow's state: it appends events, runs the state machine, creates tasks for matching and the visibility store and answers history reads.",
    d: "Each history node owns a set of shards. A request for a workflow is handled by loading its mutable state, applying the change as new events, creating tasks, and writing both in one transaction with a shard fencing check. Background processors drain the transfer and timer queues, calling matching, other shards and visibility. All writes to one workflow are serialized by a per-execution lock. Scale comes from adding nodes; the shard count is fixed at cluster creation and sets the upper bound.",
    k: ["Fixed shard count vs dynamic resharding: fixed counts keep routing simple and stable, but cannot be changed later without migration.", "Single writer per shard vs multi-writer: one owner removes conflicts, but a shard's capacity is bounded by one node."],
    p: ["A shard count chosen too low caps throughput of the cluster regardless of hosts.", "Long-held execution locks during slow persistence calls serialize unrelated updates to the same workflow."],
    v: "Under load, check each shard has exactly one owner at a time and that no workflow's event IDs have gaps or duplicates across ownership moves.",
    dep: ["history-shards", "mutable-state", "transactional-append", "transfer-task-queue", "timer-task-queue", "shard-ownership-and-fencing"]
  },
  "history-shards": {
    s: "A fixed number of partitions of all workflow executions, chosen by hashing, each with its own queues, ownership and write sequence.",
    d: "A cluster is created with a shard count, commonly in the hundreds to thousands. Every execution belongs to the shard determined by its namespace and workflow ID. A shard stores its metadata, such as ownership range, queue ack levels and replication state, and its executions, events and tasks. Because data and queues are per shard, a shard is the unit of ownership, recovery and load. The count is permanent: too few limits scale, and too many raise per-shard overhead and recovery time.",
    k: ["Many small shards vs few large: many allow finer balancing and parallel recovery, but increase overhead of metadata and background loops.", "Hash of workflow ID vs consistent assignment by tenant: hash balances load, tenant assignment isolates tenants but risks hot shards."],
    p: ["Sizing shards for current load and then growing tenfold forces a cluster migration.", "A very hot workflow overloads its single shard whatever the count."],
    v: "Load test with random IDs and confirm requests distribute evenly across shards, with the busiest shard within a small factor of the median.",
    dep: ["consistent-hash-ring", "history-service", "persistence-interface"]
  },
  "shard-ownership-and-fencing": {
    s: "Ensuring one node at a time owns each shard, with a monotonically increasing token written with every update so a stale owner's writes are rejected.",
    d: "Membership assigns shards to nodes by hash ring. A node taking a shard acquires it by incrementing a range ID in the shard record with a conditional write, then loads state. Every later write includes a condition on that range ID. If another node acquired the shard meanwhile, the old owner's write fails and it must stop serving the shard. This provides safety even when membership views disagree briefly. Without fencing, a paused node waking up could append events beside the new owner.",
    k: ["Fencing token in the database vs lease timeout alone: tokens give safety regardless of clocks and pauses, leases alone fail when a node stalls past expiry.", "Eager acquire on membership change vs lazy on request: eager shortens failover, lazy avoids useless loads of shards that nobody uses."],
    p: ["Omitting the range check on one write path allows a stale owner to corrupt history.", "Shard thrash between nodes when membership flaps repeatedly reloads state and drops caches."],
    v: "Pause an owner node past failover, let a new owner take over and write, then resume the old node and confirm its next write fails the range ID check and it releases the shard.",
    dep: ["conditional-writes", "membership-ring", "history-shards", "consistency-and-fencing"]
  },
  "mutable-state": {
    s: "The compact current-state summary of one execution, with pending activities, timers, children, signals-received and the next event ID, kept in the database and cached in memory.",
    d: "It exists so the service does not read the whole history to decide anything. Mutable state lists what is pending and in what condition, plus counters, request IDs, retry state and the version of its last update. Every event append updates it in the same transaction as the events. It can be rebuilt from history but is the working copy. In memory it sits in the history cache, loaded on first touch. A bug in the state machine that leaves it inconsistent with history is serious and needs a repair path.",
    k: ["Summary state in addition to the log vs deriving state on demand: summary state makes every decision fast, but must be kept consistent with the log.", "Store mutable state as one blob vs normalized rows: a blob is a single read and write, rows allow partial update but multiply round trips."],
    p: ["Pending-activity maps with thousands of entries slow every update, because the whole structure is rewritten.", "State and history diverging after a partial failure cannot be fixed without rebuilding."],
    v: "Pick a running execution, rebuild its state from history using an administrative command, and confirm the rebuilt pending activities, timers and next event ID equal the stored values.",
    dep: ["event-history", "mutable-state-store", "state-machine-transitions", "history-cache"]
  },
  "state-machine-transitions": {
    s: "The rules for how each command and incoming event changes an execution's mutable state, creating events and tasks, and which transitions are legal in which state.",
    d: "An activity moves from scheduled to started to completed, failed or timed out; a timer from started to fired or cancelled; the workflow itself from running to a terminal state. The history service applies a command batch from a workflow task completion as a sequence of transitions, validating each. Illegal ones are rejected, for example completing an activity that has already timed out. The same code applies events on the standby side of replication, so transitions must be deterministic and identical on all clusters.",
    k: ["Single transition table shared by active and replica sides vs separate paths: one table prevents divergence, but constrains optimization of the active path.", "Reject illegal transition vs ignore: rejecting exposes bugs and races, ignoring is lenient but hides them."],
    p: ["A late activity completion after timeout must be rejected cleanly, or the workflow sees two results.", "A transition that creates tasks outside the transaction can leave tasks without events."],
    v: "Send a completion for an activity that already timed out and confirm the service rejects it with not-found and the history shows no extra events.",
    dep: ["mutable-state", "event-history", "transactional-append"]
  },
  "transactional-append": {
    s: "Writing new events, the updated mutable state and the new tasks in one atomic, fenced database transaction, so they are visible together or not at all.",
    d: "After applying a change, the history service issues a single write: append the event batch, update the mutable-state record with a condition on its last-known version, insert transfer or timer tasks, and check the shard's range ID. If any condition fails, the write is rejected and the service reloads state and retries or aborts. Atomicity between events and tasks is what guarantees that anything recorded as scheduled gets a task. Where the database offers no multi-record transaction, the design uses a single partition or a staged write.",
    k: ["One atomic write for events, state and tasks vs separate writes with repair: one write removes inconsistency windows, but needs a store with conditional multi-row writes.", "Batch events per task vs one per command: batching reduces writes and latency, but widens the unit of replay and failure."],
    p: ["A store without true atomicity lets a crash leave events without tasks, and the workflow stalls silently.", "Very large event batches exceed the store's write size limit."],
    v: "Inject a failure after the database commit but before the response, and confirm retrying the request neither duplicates events nor loses tasks, and the transfer queue contains exactly one task per scheduled item.",
    dep: ["conditional-writes", "persistence-interface", "history-event-store", "mutable-state-store"]
  },
  "transfer-task-queue": {
    s: "A durable per-shard queue of tasks generated by transactions, such as dispatch an activity, start a child, signal another workflow or write visibility, processed asynchronously after commit.",
    d: "Each transaction that needs a side effect outside its shard inserts a transfer task into that shard's queue. A processor scans the queue in order, executes each task by calling matching or another shard, and acknowledges it. Tasks are retried until they succeed, so every effect is at-least-once and targets must tolerate duplicates. Ack levels advance as a contiguous prefix completes, which makes one stuck task hold back cleanup. This outbox pattern is why committing and dispatching can be separate without losing work.",
    k: ["Outbox queue in the same store vs publish directly after commit: an outbox guarantees the effect happens, while direct publish is faster but can lose it on a crash.", "Process in order vs in parallel: order simplifies correctness, parallelism raises throughput but needs idempotent targets."],
    p: ["A poison task that always fails blocks the ack level and queue storage grows.", "Targets that are not idempotent perform effects twice when a task is retried."],
    v: "Kill the history node after a commit that scheduled an activity but before the task is processed, and confirm the new owner dispatches the task so the activity still runs exactly once.",
    dep: ["transactional-append", "matching-service", "history-shards", "visibility-task-pipeline"]
  },
  "timer-task-queue": {
    s: "A durable per-shard queue of tasks keyed by fire time that triggers workflow timers, activity and workflow timeouts, retries and deletion after retention.",
    d: "Every timer or timeout deadline becomes a task in the shard's timer queue, ordered by fire time. A processor sleeps until the earliest, reads tasks due in a window, verifies each against mutable state because it may be stale, and applies the effect: fire the timer, time out the activity, or schedule a retry. Timer tasks are only a hint; state decides whether they matter. Large numbers of future tasks cost storage, and a bursty due set causes load spikes.",
    k: ["Verify task against state at fire time vs cancel stale tasks eagerly: verification makes cancellation cheap, but leaves dead tasks in storage until they come due.", "Scan windows vs per-timer wakeups: windows batch reads and cost a little precision, per-timer wakeups are precise but expensive at scale."],
    p: ["Millions of tasks scheduled for the same second spike CPU and database reads.", "Retention-delete tasks lag behind during overload, and storage fills."],
    v: "Schedule one thousand timers at distinct times over a minute, and confirm each fires no earlier than its deadline and within the scan window of it, with matching timer-fired events.",
    dep: ["transactional-append", "mutable-state", "history-shards", "clock-and-time"]
  },
  "history-cache": {
    s: "An in-memory cache of mutable state for recently touched executions in a shard owner, avoiding a database read per request, guarded by per-execution locks.",
    d: "On a request the service gets the execution's entry, loading it from the store on a miss, takes its lock, applies changes and writes. Entries are validated by version when written, so a stale cache is caught by the conditional write and reloaded. Eviction is by size or time. Pinned entries stay while a request is in progress. A cache lets repeated signals and task completions for a busy workflow skip reads; for cold workflows it is useless and adds only memory.",
    k: ["Cache mutable state vs read each time: caching cuts database reads and latency, but risks serving stale state that the conditional write must catch.", "Per-execution lock vs optimistic retry only: locks serialize cleanly for hot workflows, optimistic retry wastes work under contention."],
    p: ["Large mutable states cached for many executions exhaust memory and trigger eviction churn.", "A lock held across a slow database call blocks all other updates to that workflow."],
    v: "Send ten signals to one workflow in sequence and confirm only the first causes a mutable-state read from the store while the rest hit the cache, with no version conflicts.",
    dep: ["mutable-state", "persistence-interface", "history-service"]
  },
  "persistence-interface": {
    s: "The narrow data-access layer through which all services read and write histories, state, tasks and metadata, hiding which database is underneath.",
    d: "It exposes operations such as append events, update execution conditionally, create and complete tasks, read ranges of history, and manage shard records and queue metadata. Backends are drivers that map these to a relational or a wide-column database. The interface requires conditional writes, ordering within a partition and range reads, and provides retries and rate limiting around the database. Keeping it narrow lets operators choose a store, but each driver must preserve the same atomicity guarantees, or correctness silently differs.",
    k: ["Pluggable stores vs one blessed store: pluggable fits an operator's existing database, but each driver multiplies testing and risks differing semantics.", "Rich operations vs generic key-value: rich operations allow server-side atomicity per backend, but make new backends harder to write."],
    p: ["A driver that treats a conditional write as best effort breaks fencing.", "Database latency spikes propagate directly into every workflow task latency since persistence is on the critical path."],
    v: "Run the persistence compliance suite against a driver, including concurrent conditional updates to one execution, and confirm exactly one writer wins each round with no lost update.",
    dep: ["conditional-writes", "history-event-store", "mutable-state-store"]
  },
  "history-event-store": {
    s: "The storage for append-only event batches, keyed by execution and branch, read by range for replay and workers and written only through fenced transactions.",
    d: "Events are stored in batches rather than rows per event, keyed by namespace, workflow ID, run ID, branch and first event ID. Reads page through batches in order. Large histories are streamed to workers in pages. Because histories are write-once, they compress and archive well. The store must provide ordered range reads and enforce that a batch with a given first event ID can be written only once, which prevents two writers from creating diverging histories.",
    k: ["Batched events vs one row per event: batches cut write count and read cost, but make partial reads coarser and deletion more involved.", "Compress batches vs raw: compression saves storage and bandwidth, but costs CPU on every read and write."],
    p: ["Reading very long histories in one call times out and must be paged with continuation tokens.", "Deleting histories row by row instead of by range creates tombstone pressure in some databases."],
    v: "Write a batch with first event ID ten twice, and confirm the second write is rejected; read the range and confirm event IDs are contiguous.",
    dep: ["persistence-interface", "conditional-writes", "event-history"]
  },
  "mutable-state-store": {
    s: "The storage of each execution's current summary state, with its version and the next event ID, updated in the same transaction as new events and tasks.",
    d: "A row or document per execution holds the serialized mutable state, a database version and the next event ID. Updates are conditional on the previous version. Alongside it sit tasks in the shard's queues. The store must support a multi-record conditional write across state, events and tasks within the shard's partition, which strongly influences backend choice. Reads happen on cache misses and recoveries. Row size grows with pending activities, children and signals, so very busy executions strain it.",
    k: ["Co-locate state, events and tasks in one partition vs spread: co-location allows atomic writes, but concentrates load on one partition per shard.", "Version by counter vs by timestamp: counters are exact and simple, timestamps need synchronized clocks."],
    p: ["Hot executions updating state many times per second hammer a single row.", "Schema changes to the state blob must stay readable by older service versions during rolling upgrades."],
    v: "Update one execution concurrently from two writers with the same expected version and confirm exactly one succeeds and the other receives a condition-failed error.",
    dep: ["persistence-interface", "conditional-writes", "mutable-state"]
  },
  "conditional-writes": {
    s: "Database writes that succeed only if a stated condition holds, such as an expected version or shard range ID, giving safe concurrency without distributed locks.",
    d: "Every critical update says: apply this only if the current value is X. The shard range ID protects ownership; the execution's version protects state; a first-event-ID uniqueness protects history. On failure, the caller learns it lost a race and must reload or stop. This turns database atomicity into the engine's correctness primitive. It requires a store that offers it per partition, either as compare-and-set or as a transaction with conditions, and it must hold across failover of the database itself.",
    k: ["Optimistic conditional writes vs pessimistic locks: conditions have no lock management or deadlocks, but waste work under contention.", "Condition on a counter vs on content: counters are cheap to compare, content checks are stronger but costlier."],
    p: ["A database in eventual-consistency mode may accept two conflicting conditional writes, so the mode must be linearizable for these.", "Retrying a failed conditional write without reloading state loops forever."],
    v: "Race two services on the same shard ownership acquisition, and confirm exactly one range ID increment succeeds and the loser stops all writes for that shard.",
    dep: ["persistence-interface"]
  },
  "history-branches": {
    s: "A tree structure of history segments that lets a reset or a replication conflict create an alternate continuation of an execution that shares the earlier events.",
    d: "A history is addressed by a branch token naming a path through a tree of nodes. A reset creates a new branch pointing at the ancestor's events up to the fork point and appends new ones, so earlier events are shared rather than copied. In multi-cluster replication, conflicting writes after a failover create branches too, and one is chosen as current by version. Deleting data requires reference tracking so shared ancestor events are kept until no branch needs them.",
    k: ["Share ancestor events vs copy on reset: sharing saves space and time on large histories, but needs reference-aware deletion.", "Pick current branch by highest version vs by timestamp: versions give a deterministic winner across clusters, timestamps depend on clocks."],
    p: ["Deleting a branch that is the ancestor of another corrupts the descendant's history.", "Operators resetting repeatedly build deep trees that are slow to read."],
    v: "Reset a workflow, delete the old run after retention, and confirm the new run's full history is still readable from event one.",
    dep: ["history-event-store", "persistence-interface", "reset-and-replay-tools"]
  },
  "retention-and-deletion": {
    s: "Keeping closed executions for a per-namespace period and then removing their history, state and visibility records through scheduled delete tasks.",
    d: "When a workflow closes, a timer task is created for close time plus retention. When it fires, the service deletes the mutable state, the history branch and the visibility record, in order that avoids orphaned references. Open executions are never deleted. Deleting is heavy for the store, as it touches many rows, so it is rate-limited. Retention is a cost and compliance decision: histories are the audit trail, but also contain payloads that may fall under data deletion rules.",
    k: ["Short retention vs long: short saves storage and satisfies deletion rules, long supports debugging and audit but costs storage.", "Delete synchronously on timer vs batch cleanup jobs: timer deletes are prompt and distributed, batch jobs smooth load but delay removal."],
    p: ["Deleting a history before archiving or replay testing has used it removes evidence that incident review needs.", "Mass deletion at a retention boundary after a burst of closes overloads the store."],
    v: "Close a workflow in a namespace with a one-day retention in a test cluster, advance time beyond it, and confirm history, state and visibility entries are all gone and the ID is reusable.",
    dep: ["timer-task-queue", "history-event-store", "mutable-state-store", "visibility-store"]
  },
  "multi-cluster-replication": {
    s: "Streaming each namespace's events to a standby cluster so it can take over after a regional failure, with version-based conflict resolution on failback.",
    d: "A global namespace is active in one cluster at a time. The active cluster writes events and tasks, then replicates the event batches asynchronously to standbys, which apply them through the same state machine. Each event carries a failover version. After a failover, the new active cluster accepts writes; events from the old one that were not yet replicated can conflict and are resolved by branching. Replication is asynchronous, so a failover can lose a short tail of events, and activities in that tail may run again.",
    k: ["Asynchronous replication vs synchronous: asynchronous keeps latency low but admits a small data loss window on failover; synchronous removes loss at the cost of cross-region latency on every write.", "Failover per namespace vs whole cluster: per-namespace failover limits blast radius but adds operational complexity."],
    p: ["Failing over while replication lags loses recent signals, and the senders believe they were delivered.", "Workers pointed at the wrong cluster after failover keep polling a standby that has no tasks."],
    v: "Fail over a namespace in a test setup during active load, then confirm workflows resume in the new cluster, count the events lost in the replication tail and verify later reconciliation yields one consistent history.",
    dep: ["event-history", "state-machine-transitions", "history-branches", "namespace-registry", "wire-format-and-codecs"]
  },
  "schema-and-store-upgrades": {
    s: "Versioned database schemas and migration tools applied separately from service upgrades, with changes designed so old and new service versions can run together.",
    d: "The store has a schema version, managed by a tool that applies ordered migrations before a new release. Changes are additive: new columns and tables first, then code that uses them, then later cleanup. Serialized blobs, such as mutable state, carry their own format versions so mixed-version clusters read each other's data. Rolling upgrades mean old and new nodes briefly share shards, so a field written by one must not break the other. Downgrades are rarely safe once new fields are written.",
    k: ["Additive migrations with two-phase rollout vs big-bang change: additive keeps rolling upgrades safe, big-bang is simpler but requires downtime.", "Versioned blobs vs fixed columns: versioned blobs allow evolution without DDL, but are opaque to queries and ad hoc repair."],
    p: ["Running the new service before the schema migration fails with missing-column errors on first write.", "A destructive migration applied in the same release prevents rollback."],
    v: "Run old and new service versions concurrently against the migrated schema during a rolling upgrade, and confirm no persistence errors and workflows started on either version complete.",
    dep: ["persistence-interface", "wire-format-and-codecs", "mutable-state-store"]
  },
});
