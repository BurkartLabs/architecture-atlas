// Details for the distributed SQL plate, part 1: observability, operations, gateway, planning.
ATLAS.details("distributed-sql", {
  "statement-statistics": {
    s: "Per-statement-fingerprint counters of latency, rows, retries and contention, aggregated cluster-wide so slow or retry-prone query shapes can be found.",
    d: "Each gateway normalizes statement text into a fingerprint and records execution counts, latency distributions, rows read, bytes moved, retry counts and time spent waiting on locks. Samples are flushed periodically to system tables, and queries over them merge all nodes. Sampled plans and per-stage timings attach to some executions. The difficulty is cardinality and overhead: unique literals or generated column lists can create unbounded fingerprints, and collecting detailed timings on every execution would slow the very paths being measured.",
    k: ["Sampled detailed tracing vs tracing every execution: sampling keeps overhead low and constant; rare slow cases may never be sampled.", "Aggregating in memory then flushing vs writing each execution: flushing is cheap and batched; a crashed gateway loses its unflushed window."],
    p: ["Application-built statements with inlined values produce a new fingerprint each time, exhausting the statistics budget.", "Reading the aggregate mean hides a bimodal distribution where retries make one in fifty executions a hundred times slower."],
    v: "Run one query shape ten thousand times with a few forced retries from two gateways, then confirm one fingerprint with the summed count, a retry count above zero and a latency histogram showing the slow tail.",
    dep: ["sql-parser", "job-system"]
  },
  "contention-events": {
    s: "Records of one transaction waiting on a lock held by another: who waited, who blocked, on which key, and for how long.",
    d: "When a request enters a wait queue behind a lock, the lock table notes the blocking transaction, the key and the duration once the wait ends. Events are attached to the waiting statement's trace and aggregated by index and key range. Operators can then see which table and index are contended and which transaction shapes are the blockers. The hard part is attribution: the blocker may have finished long ago, the key may be an index entry rather than a row, and the wait can span several retries.",
    k: ["Recording only waits above a threshold vs all waits: a threshold keeps volume small; many short waits that add up are missed.", "Keying by index range vs by individual key: ranges aggregate usefully and protect privacy; they hide which single row is the hot spot."],
    p: ["Blame is attributed to the transaction that held the lock last, not the long transaction that caused the queue.", "Events are lost when the waiter's node restarts before they are flushed."],
    v: "Open a transaction updating one row and leave it idle, run a second update to that row for five seconds, and confirm one event names both transactions, the table and index, and a wait near five seconds.",
    dep: ["wait-queues", "lock-table"]
  },
  "hot-range-report": {
    s: "A ranking of ranges by request rate, CPU and write bytes, so an operator can see which slice of the keyspace is overloading a node.",
    d: "Each leaseholder tracks decayed counters of reads, writes, CPU and queue time for its ranges and reports the top few. A cluster-wide view merges them, resolves range boundaries back to table and index names, and flags ranges whose load is far above their neighbors. The same signal feeds load-based splitting and rebalancing. It is hard because heat moves: a report is a snapshot, and the cause is often a key design such as a rising timestamp prefix, not the range itself.",
    k: ["Decayed rate counters vs raw counts: decay follows the current hot spot; a short burst can be mistaken for a trend.", "Per-range reports vs per-key sampling: range reports are cheap and map to placement actions; they cannot show that one key inside a range is the only hot one."],
    p: ["A single-key hot spot cannot be fixed by splitting, so the report keeps showing the same range after repeated splits.", "Reports aggregated per node hide that the heat is on one range."],
    v: "Insert rows with monotonically increasing keys at a fixed rate and confirm the report shows the last range of the table far above the rest, then switch to a hash-prefixed key and confirm the load spreads.",
    dep: ["load-based-splits", "leaseholder"]
  },
  "transaction-insights": {
    s: "Flags individual slow, retried or blocked transactions with the cause attached: lock wait, failed refresh, clock uncertainty restart or a slow plan.",
    d: "The gateway tags each transaction execution with its outcome, retry reasons and wait times, and a detector marks those exceeding latency thresholds or retrying repeatedly. The record links to the statement fingerprints involved and to any contention event or plan. This turns an application's occasional latency spike into a named cause. The challenge is explaining why a retry happened: the error originates in a different node, so the reason has to travel back with the error response and be kept after the retry succeeds.",
    k: ["Detect at the gateway vs at each range: the gateway sees the whole transaction; range-level causes need to be returned with the response.", "Keeping every flagged execution vs keeping the worst per fingerprint: full retention explains incidents; a bounded store survives storms."],
    p: ["Retries that succeed on the next attempt are never reported, so the application never learns it is conflicting with itself.", "A threshold set below normal latency floods the store and drowns real problems."],
    v: "Run two transactions that both read then update the same row so one is forced to restart, and confirm an insight record names the restart reason, the blocking transaction and both statement fingerprints.",
    dep: ["contention-events", "statement-statistics", "read-refreshes"]
  },
  "tracing-spans": {
    s: "Request traces that follow one query across the gateway, remote flows and range operations, so latency can be attributed to the node and step that spent it.",
    d: "Each request carries a trace identifier and a span context in its headers. Nodes record child spans for planning, flow setup, lock waits, consensus and storage reads, then return them with the response or export them. Traces can be turned on per session for one statement, or sampled. A trace shows that a query waited on a lease transfer or on a remote region. Complexity comes from volume and from async work: spans must be bounded, and consensus and intent resolution run after the response.",
    k: ["Returning spans in the response vs exporting asynchronously: in-band is complete and self-contained; it adds payload to the hot path.", "On-demand tracing vs always-on sampling: on-demand costs nothing normally; it cannot explain an incident that already ended."],
    p: ["Background work such as intent cleanup is attributed to no request, so its cost appears as unexplained latency.", "Unbounded spans from a long scan consume memory on the gateway."],
    v: "Trace one multi-region transaction and confirm the output lists spans from every node touched, with the largest span visibly matching the cross-region consensus round trip.",
    dep: ["flow-scheduler", "quorum-commit"]
  },
  "metrics-timeseries": {
    s: "Cluster-wide counters and gauges per node and per store, stored inside the database itself with downsampling, to drive dashboards and alerts.",
    d: "Every node samples internal metrics: request rates, latencies, replica counts, storage-engine health, clock offsets, queue depths. The samples are written as a time series into ordinary ranges of the database, rolled up to coarser resolution and deleted after a retention period. Dashboards and external monitors read them or scrape a node endpoint. Because the store is the database, it is available for diagnosis only while the cluster is, and the time series itself adds write load that must be limited.",
    k: ["Storing metrics inside the cluster vs only in an external system: built-in views work without extra setup; they vanish with the cluster and add load to it.", "Fine resolution short retention vs coarse long retention: fine data finds spikes; coarse data supports capacity planning."],
    p: ["Time-series ranges become hot spots because their keys grow monotonically.", "Alerting only on cluster-level averages hides one node with a failing disk."],
    v: "Stop one node's disk from responding and confirm its storage-latency gauge rises, a replica-unavailable counter appears on peers within a minute, and the series is still queryable afterward.",
    dep: ["job-system", "range-descriptors"]
  },
  "job-system": {
    s: "A durable registry and runner for long operations such as schema changes, backups and imports, which resumes them on another node if theirs fails.",
    d: "A job is a row recording its type, parameters and progress checkpoint. One node claims it by writing an instance lease, runs it, updates progress periodically and marks it finished. If the node dies the lease expires and another node resumes from the last checkpoint. Jobs can be paused, canceled and rolled back. The difficulty is idempotence: a step may have run partially before the crash, so every job must tolerate re-running from its checkpoint and must clean up when canceled.",
    k: ["Checkpoint frequently vs rarely: frequent checkpoints limit repeated work after failure; they add writes and contention on the job row.", "Resume on any node vs pin to one: any-node resume survives failures; job code must not rely on local state."],
    p: ["A step with external side effects is repeated after a failover and duplicates them.", "A stuck job holds a schema lease and blocks later changes with no obvious reason."],
    v: "Start a large index build, kill the node running it, and confirm another node claims the job within the lease timeout and the build completes without redoing finished spans.",
    dep: ["transaction-coordinator", "node-liveness"]
  },
  "rolling-upgrades": {
    s: "Replacing node binaries one at a time while the cluster serves traffic, then enabling new behavior only once every node runs the new version.",
    d: "Nodes of two adjacent versions run side by side. The new binary starts with new features disabled, and a cluster version setting records the lowest version all nodes support. When the last node is upgraded an operator or automation finalizes, and migrations then run as jobs to rewrite stored formats before new features turn on. Until finalization the upgrade can be rolled back by reinstalling the old binary. It is hard because wire formats, stored data and SQL behavior must stay compatible across mixed versions.",
    k: ["Feature gating by cluster version vs by node version: cluster gating keeps behavior identical on every node; features wait for the slowest node.", "Auto-finalize vs manual finalize: automatic is simpler; manual keeps the rollback window open for observation."],
    p: ["Finalizing before validating the new version removes the rollback path.", "A node left on the old version for weeks blocks finalization and its migrations."],
    v: "Upgrade nodes one by one under a steady workload, confirm zero failed requests and a mixed-version state, then finalize and confirm the cluster version advanced and new-version-only statements now succeed.",
    dep: ["job-system", "descriptor-versions"]
  },
  "backup-and-restore": {
    s: "Distributed, consistent copies of tables or the whole cluster written to external storage, including incremental and point-in-time recovery.",
    d: "A backup job picks a timestamp and has every node export the data it leads for that moment as sorted files, using the multi-version store to read a consistent snapshot without blocking writes. Incremental backups export only changes since the previous one. Metadata describes the schema and file locations. Restore reads the files back, rewrites descriptors and ingests bulk files into ranges. Point-in-time restore replays the retained revisions up to a chosen time. It is difficult because the retention of old versions must cover the backup interval.",
    k: ["Snapshot at one timestamp vs per-node dumps: one timestamp is transactionally consistent; it requires holding old versions until the export finishes.", "Full plus incremental chains vs repeated full backups: chains are cheaper to take; restore needs every link intact."],
    p: ["Garbage collection removing old versions mid-export makes the backup fail or, worse, restart repeatedly.", "A backup never restored in testing may be unusable because one chain link was deleted."],
    v: "Back up a table under write load, drop it, restore it to a new cluster, and confirm row counts and a checksum match the source as of the backup timestamp.",
    dep: ["job-system", "mvcc-versions", "bulk-ingestion"]
  },
  "changefeeds": {
    s: "A stream of committed row changes in timestamp order, emitted to external sinks, with checkpoints that let it resume without gaps.",
    d: "A changefeed job subscribes to ranges for a set of tables. Each range reports row changes and then a resolved timestamp promising nothing earlier will appear. Changes come from the replicated log or a rangefeed on the leaseholder. An aggregator merges the streams, tracks the minimum resolved timestamp across all ranges and emits it, and persists it as a checkpoint. After a restart it resumes from the checkpoint, so delivery is at least once. It is hard because splits, merges and lease moves must not lose or reorder events.",
    k: ["At-least-once vs exactly-once delivery: at-least-once is simple and survives failure; consumers must deduplicate using the key and timestamp.", "Per-range ordering vs global ordering: per-range is cheap; global order needs the resolved timestamp barrier and adds latency."],
    p: ["A paused changefeed holds back old-version cleanup, so storage grows until it resumes.", "Consumers that treat emission order as commit order process an older update after a newer one."],
    v: "Update one row ten times while splitting its range and moving its lease, then confirm the sink sees all ten values in order for that key and resolved timestamps never regress.",
    dep: ["closed-timestamps", "job-system", "mvcc-garbage-collection"]
  },
  "bulk-import": {
    s: "Loads large datasets by building sorted storage files in parallel and ingesting them directly into ranges, bypassing the normal transactional write path.",
    d: "An import job reads source files, converts rows into the table's key-value form, sorts them and writes immutable files directly into the storage engine of the replicas that own each key span. Ranges are pre-split by sampling so work is balanced. The table is offline or the writes are protected by a timestamp so nothing reads half-loaded data. Because it skips locks, consensus-per-row and the cache, it is much faster than inserts, but cannot enforce all constraints during the load and must validate afterward.",
    k: ["Direct file ingestion vs transactional inserts: ingestion is orders of magnitude faster; the table is unavailable or constrained during it.", "Pre-splitting from a sample vs splitting as data arrives: pre-splitting balances load immediately; a poor sample leaves one range receiving most files."],
    p: ["Duplicate keys in the source corrupt a unique index unless validation runs after ingestion.", "Skewed data overloads the one node that owns the densest key span."],
    v: "Import a hundred-million-row file into an empty table and confirm throughput scaled with node count, row counts and index checksums match the source, and the table is readable only after the job succeeds.",
    dep: ["bulk-ingestion", "job-system", "key-encoding"]
  },
  "wire-protocol-endpoint": {
    s: "Accepts client connections over a standard network protocol, handling authentication, encryption and the message framing for queries, results and errors.",
    d: "The endpoint terminates TLS, authenticates the user against passwords, certificates or an identity provider, and then speaks a standard database wire protocol so existing drivers work. It decodes simple and extended query messages, streams result rows back in batches, and maps internal errors to the standard error codes drivers expect. Pipelined statements and cursors need careful buffering. The difficulty is backpressure: a slow client must not make the node hold unbounded result memory, and error codes must tell the client when a retry is safe.",
    k: ["Compatibility with an existing wire protocol vs a custom protocol: compatibility gives instant driver support; it constrains how transaction retry errors can be signaled.", "Streaming results vs buffering them fully: streaming bounds memory and speeds first rows; an error after rows were sent cannot be hidden from the client."],
    p: ["Large result sets buffered in memory exhaust the gateway when many clients read slowly.", "Reporting a retryable error with a generic code makes drivers fail instead of retrying."],
    v: "Connect an unmodified driver over TLS, run a prepared statement with parameters and a ten-million-row select that the client reads slowly, and confirm correct results with gateway memory staying bounded.",
    dep: ["session-state", "sql-parser"]
  },
  "connection-admission": {
    s: "Limits and prioritizes incoming connections and sessions so that a connection storm or a leaky client pool cannot take down a node.",
    d: "The gateway caps total and per-user connections, applies authentication rate limits, and can shed new sessions when memory or CPU is under pressure. Idle sessions are timed out, and a session closes if it holds a transaction open too long. In a multi-tenant or load-balanced setup, connection draining lets a node leave service without dropping in-flight transactions. The tension is between rejecting clients early and giving a busy application the connections it needs, since each session carries real memory for plans and result buffers.",
    k: ["Hard connection caps vs queueing: caps protect the node simply; queues smooth bursts but delay all clients under overload.", "Server-side idle timeouts vs trusting client pools: server timeouts reclaim leaked sessions; they can cut a client that is merely between requests."],
    p: ["Every application replica opens a large pool at startup and together they exhaust the cluster's connection capacity.", "A session left in a transaction holds locks and blocks others for as long as it stays connected."],
    v: "Open connections beyond the cap and confirm new ones are refused with a clear error while existing sessions keep working, then drain a node and confirm in-flight transactions finish before it stops accepting.",
    dep: ["wire-protocol-endpoint", "session-state"]
  },
  "session-state": {
    s: "The per-connection state: current transaction, session variables, prepared statements and cursors, held on the gateway for the life of the connection.",
    d: "Each session records its user, database, variable settings, isolation level, open transaction with its timestamp and retry state, named prepared statements and portals. State changes inside a transaction roll back with it. For load balancing or node drain, session state can be serialized and restored on another node. The gateway also tracks memory used by the session. It is difficult because some state is transactional and some is not, and moving a live session needs every piece captured and restorable.",
    k: ["Session state on the gateway vs a stateless gateway: local state is fast and simple; losing the node loses the transaction and requires client retry.", "Serializable session migration vs pinning sessions: migration enables draining; some state, such as open cursors, may block it."],
    p: ["A setting changed in a transaction that rolls back is left applied because the rollback logic missed it.", "Connection pooling in transaction mode loses session variables and prepared statements between statements."],
    v: "Set a session variable and a prepared statement, drain the node, and confirm the session continues on another node with both still present and no change in results.",
    dep: ["transaction-coordinator"]
  },
  "sql-parser": {
    s: "Turns statement text into a syntax tree, rejecting malformed input and normalizing text, with a grammar covering a large standard dialect.",
    d: "A lexer and an LALR-style grammar parse statements into a tree of nodes. The same parse yields a normalized form with literals replaced by placeholders, used for fingerprints and statement caching. Parse errors report position and hints. Because the dialect is large and mirrors an established one, compatibility with client tools is a continuing cost. The parser is pure and stateless, which makes it easy to test heavily, but it must also be defensive: deeply nested expressions and enormous statements should fail cleanly, not exhaust the stack.",
    k: ["Generated grammar-driven parser vs hand-written: grammar is easier to extend and verify; error messages need extra work to be helpful.", "Dialect compatibility vs clean new syntax: compatibility eases migration; the database inherits quirks it would not choose."],
    p: ["Pathologically nested input overflows the parser stack and crashes the node.", "Supporting syntax that the engine silently ignores gives users false assurance."],
    v: "Feed it a corpus of statements from client tools and a set of malformed and deeply nested inputs, and confirm valid ones round-trip to equivalent text while invalid ones return positioned errors without a crash.",
    dep: []
  },
  "semantic-analysis": {
    s: "Resolves names to tables and columns, checks types and permissions, and rewrites the tree into a typed form the planner can use.",
    d: "After parsing, names are looked up in the descriptor cache using the session's search path, column references are bound, types are inferred, implicit conversions are inserted and function overloads selected. Permission checks run against the user's privileges. Constants are folded and subqueries are marked for decorrelation. The result is a typed tree or a precise error. It is hard because name resolution must use the table definitions the transaction is entitled to see, including the version after an in-flight schema change.",
    k: ["Strict typing vs permissive implicit casts: strict typing catches errors early; permissive casts match legacy applications but hide mistakes.", "Resolving names at plan time vs execution time: plan time lets plans be cached; the cache must be invalidated when definitions change."],
    p: ["Resolving against a stale definition lets a statement use a dropped column.", "Overload ambiguity picks a different function after an upgrade and changes results silently."],
    v: "Run statements referencing a column in each of its schema-change states and confirm the visible, writable and dropped states behave as defined, with a clear error for the dropped one.",
    dep: ["sql-parser", "descriptor-cache"]
  },
  "descriptor-cache": {
    s: "A node-local cache of table, type and database definitions, kept consistent with the rest of the cluster by leases on specific versions.",
    d: "Definitions live in system tables. Each node acquires a lease on the version of every descriptor it uses and caches it. When a definition changes, the new version is created, nodes drop their old lease on notification or expiry, and no statement starts on the old version after it has been replaced. The cache avoids a lookup per statement, which would add a cross-node read to every query. The hard part is the protocol: a node must not keep using a version indefinitely, yet changes must not wait on dead nodes.",
    k: ["Leased cached versions vs reading definitions per statement: leases make reads local; changes must wait for old leases to drain.", "Short vs long lease durations: short leases speed schema changes; long ones reduce renewal traffic and tolerate brief outages."],
    p: ["A node partitioned from the cluster keeps serving the old definition until its lease expires.", "A transaction holding an old version for hours delays a schema change that waits on it."],
    v: "Alter a table while queries run on several nodes, then confirm every node moves to the new version within the lease bound and no statement ever runs on a version two steps behind.",
    dep: ["descriptor-versions", "range-cache"]
  },
  "logical-plan-builder": {
    s: "Converts the typed statement tree into a relational expression of scans, filters, joins and aggregates that the optimizer can transform.",
    d: "The builder translates each clause into relational operators with column identifiers, and records properties such as output columns, keys, functional dependencies and cardinality bounds. Views are inlined, subqueries become joins or apply operators, and common expressions are shared. The expression is stored in a memo that can hold many equivalent forms at once. It is hard because every later optimization depends on the properties recorded here, and incorrect ones give silently wrong results.",
    k: ["Memo of equivalent expressions vs rewriting one tree in place: a memo explores many alternatives cheaply; it uses more memory and complexity.", "Eager property derivation vs on demand: eager derivation is simple and consistent; it computes properties that may never be used."],
    p: ["A wrong uniqueness property lets the optimizer drop a distinct and return duplicates.", "Inlining a large view repeatedly multiplies plan size and planning time."],
    v: "Plan a query with joins, subqueries and a view, print the memo's initial expression, and confirm the output columns and key properties match those derived by hand.",
    dep: ["semantic-analysis", "descriptor-cache"]
  },
  "rewrite-rules": {
    s: "Heuristic transformations applied before cost comparison: pushing filters down, pruning unused columns, decorrelating subqueries and simplifying expressions.",
    d: "A library of pattern-matching rules transforms the expression whenever the result is always no worse. Predicates move toward scans, columns not used by parents are dropped, outer joins become inner joins when a filter rejects nulls, and correlated subqueries become joins. Rules fire repeatedly until none apply. In a distributed engine a good rewrite shrinks data before it crosses the network, so pushing filters and limits to the scan matters more than in a single-node system.",
    k: ["Always-apply heuristics vs cost-compared alternatives: heuristics are cheap and rarely wrong; they cannot be right when the best choice depends on data.", "Large rule set vs small: more rules find more plans; interactions create loops and hard-to-explain plans."],
    p: ["A rule that is wrong for null handling changes results on a rare data shape.", "Two rules that undo each other loop until a limit and then leave a poor plan."],
    v: "Plan a join with a selective filter on one side and confirm the filter appears below the join in the final plan, and the result matches a plan with rewrites disabled on the same data.",
    dep: ["logical-plan-builder"]
  },
  "cost-based-optimizer": {
    s: "Searches alternative plans such as access paths, join orders and join algorithms, and picks the one with the lowest estimated cost.",
    d: "Exploration rules add alternatives to the memo: use a secondary index, reorder joins, choose lookup, hash or merge join, push limits. Each alternative is costed from row estimates and per-operation constants for CPU, disk and network. The cheapest tree is extracted. Search is bounded by time and by a cap on join reordering. It is difficult because estimates compound: a small error at the leaves multiplies through joins, and a distributed plan must also account for where each step runs.",
    k: ["Exhaustive join reordering vs capped search: exhaustive finds better plans; planning time grows exponentially with join count.", "Trusting estimates vs adding runtime adaptation: pure estimates are simple and predictable; one bad estimate can pick a plan that never finishes."],
    p: ["A plan chosen for one parameter value is terrible for another and runs at the wrong speed for hours.", "Stale or missing statistics lead to full scans where an index exists."],
    v: "Run a three-way join with accurate statistics and confirm the chosen order and algorithms match the lowest actual runtime among forced alternatives; then skew the data and confirm statistics refresh moves the plan.",
    dep: ["rewrite-rules", "table-statistics", "distribution-aware-costing"]
  },
  "table-statistics": {
    s: "Row counts, distinct counts and value histograms per column, gathered by background jobs and used by the optimizer to estimate selectivity.",
    d: "A background job samples each table across its ranges, merges the samples and writes row counts, null counts, distinct counts and histograms to a system table. Collection triggers automatically when enough rows change. Multi-column statistics capture correlation. Histograms of a skewed column let the optimizer choose differently for common and rare values. The difficulty is staleness and cost: scanning a very large table is expensive, and statistics gathered before a bulk load describe a table that no longer exists.",
    k: ["Sampling vs full scans: sampling is cheap and scales; estimates for rare values and distinct counts have more error.", "Automatic refresh by change threshold vs fixed schedule: change-based refresh tracks need; a steady slow drift may never cross the threshold."],
    p: ["A freshly created table with no statistics yields plans that assume tiny tables.", "Statistics collection competes with foreground traffic during a peak."],
    v: "Load ten million rows into an empty table, wait for automatic collection, and confirm the row count and histogram in the statistics table match a count query within a few percent and the plan switches to an index.",
    dep: ["job-system", "ordered-keyspace"]
  },
  "distribution-aware-costing": {
    s: "Adds network round trips, cross-region latency and range counts to plan cost, so plans minimize hops as well as rows.",
    d: "The cost model knows which locality holds each index's replicas and the latency between localities. It charges for each remote lookup and for rows shipped between regions, and it prefers an index whose leaseholder is in the gateway's region. For tables with a home region per row the planner can try the local region first and fall back, using uniqueness constraints to stop early. It also prefers scans that touch few ranges. It is hard because latency is a property of placement that changes as leases move.",
    k: ["Locality-aware costing vs uniform network cost: locality awareness avoids cross-region trips; it ties plans to current placement, which can change.", "Search of local region first vs a single global scan: local-first is fast for most queries; a miss costs two sequential rounds."],
    p: ["A plan cached while leases were local runs slowly after they move to another region.", "A uniform cost estimate sends a join across an ocean because it counted only rows."],
    v: "Run the same lookup from gateways in two regions on a table homed in one, and confirm the plan reads the local index copy where it can and the measured latency matches the number of cross-region hops shown.",
    dep: ["cost-based-optimizer", "localities", "leaseholder"]
  },
  "prepared-plan-cache": {
    s: "Reuses an optimized plan for a prepared statement, skipping planning when parameters change but the plan stays valid.",
    d: "A prepared statement is parsed and bound once. Its optimized memo is cached by fingerprint and re-planned on definition changes, large statistics changes or settings changes. Plans may be generic, built without parameter values, or custom, rebuilt with the values. The gateway can try custom plans for the first executions and switch to the generic one if the cost is similar. It is hard to choose well: generic plans save work but ignore skew, and each node's cache is private.",
    k: ["Generic vs custom plans per execution: generic plans save planning time; custom plans exploit skew but pay planning every call.", "Local caches vs shared plan cache: local caches need no coordination; each node plans the same statement separately."],
    p: ["A generic plan chosen after common values misses the index needed for a rare one.", "A cache keyed by text but not session settings reuses a plan built under different settings."],
    v: "Execute a prepared statement with a common and a rare parameter value and confirm the second execution reuses the cached plan or re-plans exactly as documented, and a schema change invalidates it.",
    dep: ["cost-based-optimizer", "descriptor-cache"]
  },
});
