// Details for the durable workflow plate, part 4: visibility, cluster foundation, cross-cutting concerns.
ATLAS.details("durable-workflows", {
  "visibility-store": {
    s: "A secondary, query-oriented store of one record per execution, with status, type, times and custom attributes, used to list, filter and count workflows.",
    d: "The history shards are optimized for point reads by workflow ID, not for questions like all failed payments yesterday. The visibility store holds a record per run, updated at start, on attribute changes and at close. Backends are either a simple table in the main database, with limited filtering, or a search index with rich queries and aggregation. Frontend list calls read from here and never touch shards, which keeps heavy dashboards off the hot path. The store can lag or lose updates without affecting execution.",
    k: ["Search index vs main database tables: an index gives flexible queries and counts at scale, but is a second system to run; database tables are simpler but filter poorly.", "Separate store vs querying history shards: separation protects execution latency, at the cost of eventual consistency."],
    p: ["A visibility backend outage must not block workflow progress, or listing problems become execution problems.", "Records not updated after a failure show workflows as running that have closed."],
    v: "Start and complete a workflow, then query visibility by ID and by status and confirm one record appears with the correct close time within the expected lag, and execution continued unaffected when the backend was paused.",
    dep: ["visibility-task-pipeline", "search-attributes", "persistence-interface"]
  },
  "visibility-task-pipeline": {
    s: "The asynchronous path from the history shard to the visibility store: tasks created in the same transaction as state changes are processed and written, retried until they succeed.",
    d: "When a workflow starts, closes or upserts attributes, the transaction adds a visibility task to the transfer queue. A processor reads it, builds the record and writes it to the store, possibly in batches. It applies back-pressure when the store is slow and retries on failure. Since the writes are by run ID with a version, repeated delivery is harmless. The pipeline is separate from workflow dispatch so a slow index only delays visibility. Its lag is a metric operators watch.",
    k: ["Transactional outbox vs direct dual write: an outbox cannot lose updates after a crash, whereas direct writes are faster but can diverge.", "Batch writes vs per-record: batching raises throughput and reduces index load, but adds latency to freshness."],
    p: ["Visibility tasks sharing a queue with dispatch tasks cause a slow index to delay activity scheduling.", "Out-of-order delivery overwriting a closed record with a stale running one, if versions are not compared."],
    v: "Pause the visibility backend, run workflows, resume it, and confirm every record appears with the right final status and lag returns to the baseline.",
    dep: ["transfer-task-queue", "visibility-store", "history-shards"]
  },
  "search-attributes": {
    s: "Typed, indexed fields attached to a workflow, set at start or updated by the workflow itself, that make executions findable by business values like customer or order status.",
    d: "Each namespace registers attribute names and types, such as keyword, text, integer, boolean and datetime. A workflow sets them on start or through an upsert command that is recorded in history and queued to visibility. They are distinct from memo fields, which are returned but not indexed. A limited number and size are allowed. Adding a type needs an index mapping change in the visibility backend. Careful naming matters, because values are queryable by operators and sometimes sensitive.",
    k: ["Index many attributes vs few: many make support queries easy but increase index size and mapping complexity; few stay cheap but force scanning.", "Set at start vs update during run: start-time attributes are simple, updated ones reflect progress but add events to history."],
    p: ["Putting personal data in a search attribute exposes it in the index outside payload encryption.", "Changing an attribute's type after use is not supported and requires a new name."],
    v: "Register an attribute, start a workflow with a value, upsert it later, and confirm queries by the old value stop matching and by the new value match after the pipeline catches up.",
    dep: ["visibility-store", "workflow-context-api", "namespaces"]
  },
  "visibility-query-language": {
    s: "A SQL-like filter syntax over visibility fields for listing, counting and selecting workflows, with limits on query cost and result pagination.",
    d: "Queries combine predicates over built-in fields such as type, status, start time and close time, and custom attributes, using comparison, boolean operators and ranges. The frontend parses the text, validates field names and types for the namespace, and translates it to the backend's query form. Results are paged with continuation tokens. Count and group-by give aggregates. Guards reject unbounded deep pagination and expensive text patterns. The same language selects targets for batch operations.",
    k: ["Own query language vs raw backend queries: an own language is portable and safe to expose, but needs a translator per backend and cannot express everything.", "Deep pagination allowed vs capped: allowing it supports exports but burdens the index; capping forces narrower queries."],
    p: ["Queries without a time bound scan every record and time out on large clusters.", "Operators trusting counts from a lagging index make decisions on stale numbers."],
    v: "Run a query for failed workflows of one type in a time range, and confirm the returned set equals the set found by scanning test records directly, and a malformed query returns a clear parse error.",
    dep: ["visibility-store", "search-attributes", "frontend-service"]
  },
  "listing-consistency": {
    s: "The property that list and count results trail the true state by seconds, so callers must use direct describe calls, not listings, when they need the current status of one workflow.",
    d: "Visibility is fed asynchronously, so a just-started workflow may not yet be listed, and a just-closed one may still appear running. Describe by workflow ID reads the shard and is authoritative. The index may also refresh on an interval of its own. Applications that start a workflow then immediately list it, or build logic on counts, hit this. Designing for it means treating listings as dashboards and reconciliation tools, never as part of a transaction.",
    k: ["Accept eventual listing vs synchronous index writes: eventual keeps execution fast and independent of the index, synchronous gives read-your-writes but ties start latency to the index.", "Direct describe for single workflows vs listing: describe is exact but one at a time, listing scales but lags."],
    p: ["A deduplication check that lists workflows by attribute before starting one will start duplicates under lag.", "Automation that terminates all workflows listed as running may hit ones that already closed or miss new ones."],
    v: "Start a workflow, immediately list by its ID, and confirm it may be absent, while describe returns it at once; poll until the listing includes it and record the lag.",
    dep: ["visibility-task-pipeline", "visibility-store", "history-service"]
  },
  "membership-ring": {
    s: "A shared, continuously updated view of which service nodes are alive, built from gossip or a coordination store, from which shard and partition owners are computed.",
    d: "Each node announces itself under its service role and learns the others. Failure detection removes silent nodes after a timeout, triggering ownership changes. All nodes compute owners from the same list, so they usually agree, and fencing handles the moments they do not. Join and leave events cause shards to move, which flushes caches and briefly stalls those workflows. Membership is not about data consistency, only about spreading ownership, so it can be eventually consistent.",
    k: ["Gossip vs external coordination store: gossip has no extra dependency and scales, but converges slowly and can split; a coordination store is crisp but a new critical component.", "Aggressive failure detection vs patient: fast detection shortens outages, patient avoids false removals and shard thrash during hiccups."],
    p: ["A network partition causes two groups to each believe the others died, and both claim shards until fencing stops one.", "Rolling restarts with fast detection move every shard repeatedly."],
    v: "Kill one history node and measure the time until its shards have new owners and workflows on them resume, then confirm membership on every node lists the same set.",
    dep: ["internal-rpc", "consistent-hash-ring", "dynamic-config"]
  },
  "consistent-hash-ring": {
    s: "A mapping of shards and queue partitions to nodes using hashing, so adding or removing a node moves only a fraction of the assignments.",
    d: "Nodes are placed on a ring by hash, with virtual positions for balance. A shard or partition ID hashes to a point and belongs to the next node clockwise. When membership changes, only ranges adjacent to the changed node move. All services compute it locally from the membership list, so no central assignment server is needed. Balance is only statistical: with few shards per node, some nodes get noticeably more. Hot shards are not helped by hashing, since the unit of load is the shard, not the key.",
    k: ["Consistent hashing vs explicit assignment table: hashing is stateless and decentralized, but cannot place a specific hot shard by hand; a table can, but needs a coordinator.", "More virtual nodes vs fewer: more give better balance but larger rings to compute and propagate."],
    p: ["With few shards per node, hashing leaves one node with twice the average load.", "Different hash seeds or versions across services route the same shard to different nodes."],
    v: "With a hundred shards and five nodes, compute assignments, remove one node, and confirm only that node's shards move and the rest keep their owners.",
    dep: ["membership-ring"]
  },
  "internal-rpc": {
    s: "The authenticated remote-call layer services use to talk to each other, with retries, deadlines, load balancing, and typed errors such as shard-ownership-lost.",
    d: "History, matching and frontend call each other over a binary RPC protocol with mutual TLS. Clients resolve the target node through the membership ring and keep a connection pool. Calls carry deadlines and propagate cancellation. Errors are typed so callers can react: not owner means refresh and retry elsewhere, resource exhausted means back off. Interceptors add tracing, metrics and rate limits. Because many calls are on the critical path of a workflow task, tail latency here directly becomes workflow latency.",
    k: ["Retry inside the RPC layer vs in callers: inside is uniform, but risks retrying calls that are not idempotent; callers know which are safe.", "Per-call deadlines propagated vs fixed timeouts: propagation prevents wasted work after callers gave up, but needs discipline across services."],
    p: ["Blind retries on timeout of a non-idempotent call duplicate effects without request IDs.", "Connection pools pointing at removed nodes keep trying until health checks catch up."],
    v: "Inject latency on one history node and confirm callers see deadline errors within the configured limit, retry to the new owner, and the trace shows each hop.",
    dep: ["membership-ring", "wire-format-and-codecs", "dynamic-config"]
  },
  "dynamic-config": {
    s: "Settings that operators can change at runtime, with scopes by namespace, queue or service, covering limits, timeouts, partition counts and feature switches.",
    d: "A configuration source, such as a file or a store, is polled by each node. A value is looked up by key with constraints, like namespace or task queue, and falls back to a default. Settings include rate limits, cache sizes, retry parameters, partition counts and rollout flags for new behavior. Because they alter behavior without a deploy, they are both a safety valve in an incident and a source of incidents. Changes should be gradual and recorded, and not every key is safe to change live.",
    k: ["Live reload vs restart to apply: live reload gives instant incident response, but a bad value takes effect everywhere at once.", "Scoped overrides vs global values: scopes let one tenant be tuned alone, but multiply values to track."],
    p: ["An unreviewed edit to a rate limit or timeout key removes a safety limit across a cluster.", "Nodes reading from the source at different times run with different values for a while."],
    v: "Lower a rate limit for one namespace through the config source, and confirm calls are throttled for that namespace within the poll interval while others are unchanged, with the change in the audit log.",
    dep: ["internal-rpc"]
  },
  "clock-and-time": {
    s: "The time sources the engine depends on for timer firing, timeouts and event timestamps, with rules for tolerating skew between nodes.",
    d: "History nodes stamp events and compare fire times with their local clocks. Timers are only ever late, never early, relative to the owning node's clock. When a shard moves between nodes, a skew can make timers fire slightly early or late relative to the earlier owner, so the design tolerates this and uses version numbers, not timestamps, for ordering. Workflow code sees the time of the workflow task through the context, not the host clock. Multi-cluster setups additionally order conflicts by version.",
    k: ["Order by version numbers vs timestamps: versions avoid clock dependence for correctness, but timestamps remain needed for timers and timeouts.", "Trust node clocks vs a central time service: node clocks need no dependency but need synchronization; a central service removes skew and adds a hotspot."],
    p: ["A node with a clock far ahead fires timers early from the user's view.", "Leap second or step adjustments move time backward and reorder timer scans."],
    v: "Skew one node's clock by a minute in a test cluster, move a shard to it, and confirm timers still fire no earlier than their deadlines and workflows complete correctly.",
    dep: ["membership-ring"]
  },
  "wire-format-and-codecs": {
    s: "The schema-defined binary encoding used for client calls, internal RPC, stored blobs and replication streams, designed so old and new versions can read each other's data.",
    d: "Messages are defined in an interface language with numbered fields. Additive changes, such as new optional fields, are compatible; removing or retyping a field is not. The same definitions are used for events stored in history, so a history written years ago must still decode. Services ignore unknown fields so newer nodes can talk to older ones during rolling upgrades. Language SDKs are generated from the same definitions, which keeps the API consistent across languages. The weight of this layer is compatibility discipline, not speed.",
    k: ["Strict compatibility rules enforced by tooling vs convention: tooling blocks breaking changes at review time, convention is lighter but fails when someone forgets.", "Binary with schema vs self-describing text: binary is compact and fast but needs tooling to inspect; text is easy to read but larger."],
    p: ["Renumbering or reusing a field number silently corrupts old histories on read.", "A new required field breaks older workers that do not send it."],
    v: "Decode a history captured with the oldest supported version using the current build, and confirm every event parses, then round-trip the same events through the replication encoder unchanged.",
    dep: []
  },
  "graceful-handoff": {
    s: "A shutdown and restart procedure in which a node stops accepting new work, flushes caches, releases its shards and queue partitions and lets others take them cleanly before exiting.",
    d: "On a termination signal, a node leaves membership, so new requests route elsewhere, drains in-flight requests, persists queue ack levels, releases shard ownership by letting go of its lease, and then exits. The new owners acquire shards with a higher range ID and load state from the database. Workers likewise stop polling, finish or hand back running tasks and, for sticky queues, let the service fall back. Skipping this means failover waits for failure detection, and stalls workflows for tens of seconds.",
    k: ["Drain period before exit vs immediate stop: draining avoids failed requests but lengthens deploys; immediate stops are quick but cause errors and slow failover.", "Release shards explicitly vs let the lease lapse: explicit release hands over in moments, lapsing is simpler but slow."],
    p: ["A deploy that kills nodes before drain completes causes error spikes with each rolling step.", "Shutting down all history nodes at once leaves no owner and stalls every workflow until restart."],
    v: "Roll a restart across history nodes under load and confirm the error rate stays near baseline and shard handoff time per node is a few seconds, not a failure-detection timeout.",
    dep: ["membership-ring", "shard-ownership-and-fencing", "internal-rpc"]
  },
  "determinism-contract": {
    s: "The rule that workflow code must produce the same commands in the same order every time it is replayed against the same history, which every layer, tool and deployment practice must uphold.",
    d: "Determinism is not a feature of one component. The sandbox, the context API, the replayer, the versioning mechanisms, the test harness and the deploy process all exist to protect it. Anything nondeterministic, such as time, randomness, I/O, iteration order or library behavior, has to be routed through recorded APIs or kept in activities. Code changes count too: any change to the command sequence is a change to the contract. Violations show up late, on replay, possibly months after the code was written.",
    k: ["Enforce determinism in the runtime vs by convention: runtime enforcement catches common mistakes early, but cannot catch all and restricts the host language.", "Version by patches vs fresh deployment pinning: patches allow in-place change, pinning avoids the contract question per change but runs more fleets."],
    p: ["A dependency upgrade changing iteration order in a library fails replay of open workflows.", "Developers testing only fresh runs never exercise replay and miss violations until production."],
    v: "Run replay tests over a representative set of stored histories on every code change and confirm zero non-determinism errors before the change reaches a worker fleet.",
    dep: ["deterministic-replay", "workflow-sandbox", "replay-testing", "workflow-versioning-patches"]
  },
  "at-least-once-semantics": {
    s: "The guarantee that every activity, task and notification is delivered one or more times, never zero, which makes idempotency the application's responsibility everywhere.",
    d: "Retries, timeouts, failovers and queue redelivery all mean the same step may run twice. Activities can repeat after a worker crash. Transfer tasks repeat until acknowledged. Signals sent by clients repeat unless request IDs deduplicate them. The engine offers exactly-once effect only for its own state: history events are recorded once. For external effects, keys, conditional operations and compensation handle repeats. Everything in the design favors never losing work over never repeating it.",
    k: ["At-least-once with idempotent effects vs attempting exactly-once: at-least-once is achievable and simple to reason about, exactly-once across systems is not.", "Dedupe in the engine vs in the target: engine dedupe covers its own calls, target dedupe covers every caller but needs the target's cooperation."],
    p: ["Treating activities as exactly once double-charges or double-sends after a crash at the wrong moment.", "Idempotency keys that include attempt number defeat the purpose."],
    v: "Crash workers at random points in a run of a payments-like workflow many times, and confirm each external effect in the fake downstream system occurs exactly once by key even though activities ran more than once.",
    dep: ["activity-definition", "transfer-task-queue", "request-deduplication", "activity-retry-policy"]
  },
  "history-growth-limits": {
    s: "The bounds on events, bytes, pending activities and payload size per execution, and the design habits that keep long-lived workflows inside them.",
    d: "Every event costs storage, replay time, and memory in caches. The service enforces soft warnings and hard limits on total events and size, and terminates executions that exceed them. Replay time grows with history, which shows up as slow tasks and cache-miss cost. Developers manage growth through continue-as-new, child workflows, small payloads, batching and avoiding per-item signals. It affects design at the start: an unbounded loop is a defect, not a performance detail.",
    k: ["Hard server limits vs unlimited histories: limits protect shards and replay from runaway executions, but force developers to design rollover.", "Many events with small payloads vs fewer large ones: small events replay cheaply, large payloads dominate size and bandwidth."],
    p: ["A signal per item in a ten-day workflow reaches the event limit and is terminated mid-process.", "Ignoring warning thresholds means the first symptom is an outage."],
    v: "Run a looping workflow with continue-as-new at a threshold, and confirm the history length stays under the warning limit across a thousand iterations with no replay slowdown.",
    dep: ["event-history", "continue-as-new", "quotas-and-rate-limits"]
  },
  "consistency-and-fencing": {
    s: "The use of conditional writes and monotonically increasing tokens throughout, so that a node that is paused, partitioned or stale cannot corrupt state, regardless of membership agreement.",
    d: "Membership and leases are only hints about who should act. Safety comes from fences: shard range IDs, execution versions, branch and event ID uniqueness, and failover versions across clusters. Every write that matters carries a condition, and a rejected condition means stop and reload. This lets the engine tolerate network partitions, garbage-collection pauses and delayed messages. It also dictates the storage choice: the database must offer linearizable conditional writes within a partition, or the engine's guarantees evaporate.",
    k: ["Fencing tokens vs trusting leases: tokens are safe under pauses and clock errors, leases alone assume bounded delays that do not hold.", "Strong consistency inside a shard vs global: per-shard consistency is cheap and enough, global consistency would require cross-shard coordination."],
    p: ["A new code path that skips the condition check reintroduces split-brain writes with no test failing.", "Running the database in a weak consistency mode breaks fences without any error."],
    v: "Simulate a long pause of a shard owner during failover and confirm the stale owner's next write is rejected by the database condition, with no event ID gaps or duplicates in the history.",
    dep: ["shard-ownership-and-fencing", "conditional-writes", "transactional-append", "mutable-state-store"]
  },
  "latency-and-durability": {
    s: "The trade-off that every state change is committed to the database before it is acknowledged, so workflow step latency is bounded below by storage write latency.",
    d: "Each workflow task completion writes events, state and tasks synchronously, and its latency is a database round trip, often several milliseconds. This is the price of durability. Optimizations reduce round trips without weakening guarantees: sticky queues skip history reads, sync match skips task writes, local activities skip task round trips, and batching commands per task amortizes writes. Throughput scales with shards, while single-workflow latency does not. Choosing an engine means accepting that workflows are for reliability, not microsecond latency.",
    k: ["Synchronous commit per step vs batching in memory: sync commit never loses acknowledged work, batching is faster but loses recent steps on a crash.", "Many fine-grained steps vs coarse ones: fine steps give recovery granularity and visibility, coarse ones cut latency and cost."],
    p: ["Using a workflow for a high-frequency inner loop of tiny steps makes the database write latency the bottleneck.", "Placing the database in a distant region adds its round trip to every step."],
    v: "Measure workflow-task completion latency against database write latency across a load test, and confirm the former tracks the latter plus a small constant at every load level.",
    dep: ["transactional-append", "sync-match", "sticky-task-queues", "local-activities"]
  },
  "tenant-isolation": {
    s: "The set of mechanisms that stop one namespace or workflow from starving others on shared shards, queues and storage: quotas, per-namespace limits, priority and separate queues.",
    d: "Shards, matching nodes and the database are shared by every namespace. Without limits, one team's backlog, signal flood or retry storm raises latency for all. Isolation comes from per-namespace rate limits, per-queue dispatch limits, caps on pending items per execution, separate worker fleets and, at the extreme, separate clusters. Hashing does not separate tenants, since two tenants' workflows can share a shard. Observability by namespace is needed to see who is the cause during an incident.",
    k: ["Shared cluster with quotas vs a cluster per tenant: shared is efficient and easy to operate, but noisy neighbors remain possible; separate clusters isolate fully at higher cost.", "Fair queuing vs per-tenant caps: fair queuing shares spare capacity, caps are predictable but waste idle capacity."],
    p: ["A tenant's retry storm after an outage saturates a shared shard and slows unrelated tenants.", "Limits applied only at the frontend miss load generated inside the cluster by timers and children."],
    v: "Overload one namespace in a shared test cluster and confirm its requests are throttled while a second namespace's latency stays within its baseline.",
    dep: ["quotas-and-rate-limits", "namespaces", "task-queues", "history-shards"]
  },
});
