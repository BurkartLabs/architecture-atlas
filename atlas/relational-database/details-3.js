// Details part 3: catalog, programmability, transactions.
ATLAS.details("relational-database", {
  "system-catalog": {
    s: "The database's description of itself, stored as ordinary tables and indexes: every table, column, type, index, constraint, function, role, grant and statistic.",
    d: "Catalog tables hold one row per object with identifiers that other rows reference. Because they are normal tables, they get versioning, logging and recovery for free, and users can query them. The engine reads them constantly, so hot entries are cached in each session and invalidated by messages when another session changes them. Bootstrap is the hard part: the code that reads the catalog needs the catalog's own definition, so a minimal hardcoded core is needed first.",
    k: ["Catalog stored as ordinary tables: reuses transactions, recovery and queries, but the engine itself must carefully avoid circularity at startup.", "Stable numeric object identifiers rather than names: renames are cheap and references survive, but dumps and replicas must map identifiers carefully."],
    p: ["Direct edits to catalog tables bypass dependency checks and corrupt the database in ways crash recovery cannot repair.", "Catalog bloat from creating many temporary objects slows every planning step."],
    v: "Create a table, index and view, then query the catalog to confirm each appears with correct columns and dependencies. Drop the table and confirm every dependent row, including statistics, is gone.",
    dep: ["heap-files", "btree-index"]
  },
  "ddl-execution": {
    s: "Carries out statements that create, alter or drop schema objects: updating catalog rows, creating or rewriting storage files, rebuilding indexes and invalidating cached plans.",
    d: "A DDL statement takes strong locks on the target object, updates catalog entries, creates or removes the physical files, and broadcasts invalidations so other sessions refresh cached definitions. Some changes are metadata-only, such as adding a nullable column with a default stored in the catalog; others rewrite the whole table, such as changing a column type. The difficulty is that rewriting operations hold locks for the duration and need space for old and new copies.",
    k: ["Metadata-only changes where possible: make common alterations instant, but the engine must handle rows lacking the new column's physical data.", "Strong locks during schema change: simple and safe, but a queued DDL statement can block all new queries behind it."],
    p: ["A DDL lock waiting behind one long transaction forms a queue that blocks every later query on the table.", "Rewrite-style alterations need free disk equal to the table size and can take hours."],
    v: "Add a column with a default to a hundred-million-row table and confirm it completes in milliseconds and old rows show the default. Alter a column type and confirm a full rewrite is reported with its lock held.",
    dep: ["system-catalog", "lock-manager", "plan-cache"]
  },
  "transactional-ddl": {
    s: "Makes schema changes part of the transaction: they can be rolled back, and other sessions never see a half-applied change.",
    d: "Because catalog changes are versioned rows, a transaction that creates a table, adds an index and alters a column can commit or abort as a unit, and concurrent readers keep seeing the old definitions until commit. Physical file creation and removal are deferred or logged so rollback deletes new files and commit removes dropped ones. Some designs instead auto-commit DDL. The cost is interaction with locking and caches: the catalog cache must respect visibility.",
    k: ["DDL inside the transaction: gives atomic migrations and safe rollback, at the cost of holding strong locks until the transaction ends.", "File operations deferred until commit or abort: keep rollback correct, but crashes between steps need the log to finish the cleanup."],
    p: ["A migration that does DDL and a long data backfill in one transaction holds exclusive locks for the whole backfill.", "Crash after commit but before dropped files are removed leaves orphaned files unless recovery cleans them."],
    v: "Begin, create a table and alter another, roll back, and confirm neither exists. Repeat with a crash before commit and confirm after recovery no trace remains, including data files.",
    dep: ["ddl-execution", "mvcc-versioning", "write-ahead-log"]
  },
  "online-schema-change": {
    s: "Alters large tables while they stay readable and writable, by building the new structure alongside the old, replaying concurrent changes and swapping with a brief lock.",
    d: "Common techniques build a shadow table or index in the background, capture concurrent modifications through triggers or the log, backfill existing rows in batches, then switch names or definitions under a short exclusive lock. Index builds use multi-phase protocols that tolerate concurrent writes. Constraint additions can be added unvalidated and validated later with a weaker lock. Hard parts are consistency of the replay, disk and load cost, and safe abort and resume.",
    k: ["Shadow copy with change capture: keeps the table available throughout, at the cost of doubled space and write amplification during the change.", "Add constraint unvalidated then validate: avoids a long exclusive lock, though rows written between the steps are only checked going forward."],
    p: ["The final swap waits for a long transaction and its queued lock blocks all traffic for that table.", "A failure midway leaves a half-built shadow structure or invalid index that must be cleaned up."],
    v: "Run a continuous write load, change a column type online on a large table, and confirm no write errors, a lock held under one second at the swap, and a row-for-row match with the expected result.",
    dep: ["ddl-execution", "concurrent-index-build", "constraint-enforcement"]
  },
  "table-partitioning": {
    s: "Splits one logical table into physical pieces by range, list or hash of a key, so maintenance, pruning and data lifecycle operate on parts rather than the whole.",
    d: "The parent table stores no rows; each partition is its own table with its own storage and indexes, and inserts are routed by the partition key. Bounds are recorded in the catalog and checked for overlap. Dropping or detaching an old partition removes data instantly, and maintenance runs per partition. Difficulties include unique constraints, which must contain the key, foreign keys across partitions, many-partition planning cost, and moving a row when its key is updated.",
    k: ["Physical partitions as real tables: allow instant drops, separate maintenance and parallelism, but multiply catalog entries and planning work.", "Unique constraints must include the partition key: keeps checks local to a partition, but restricts the keys a schema can declare unique."],
    p: ["Thousands of partitions make planning and catalog caching dominate short queries.", "Inserting a key outside every range fails unless a default partition exists, and that default can grow without bound."],
    v: "Load a year of daily data, drop the oldest partition, and confirm it vanishes instantly with no per-row deletion. Confirm rows are routed to the right partition and an out-of-range insert is rejected.",
    dep: ["system-catalog", "heap-files", "constraint-enforcement"]
  },
  "constraint-enforcement": {
    s: "Rejects rows that violate declared rules: not-null, check, unique and primary key constraints, evaluated as part of every insert and update.",
    d: "Not-null and check constraints evaluate expressions on the new row before it is stored. Unique constraints are enforced through an index: insertion checks for a conflicting live key, waiting for concurrent transactions that may commit one. Deferrable constraints are checked at commit rather than per statement. The hard part is concurrency: two transactions inserting the same key must serialize, and a conflict with an uncommitted row requires waiting on its outcome.",
    k: ["Unique enforcement through an index: efficient and automatic, but it needs a wait on in-progress inserts and adds index cost to every write.", "Deferrable constraints checked at commit: allow temporary violations within a transaction, at the cost of errors surfacing only at the end."],
    p: ["Application-level existence checks before insert race with each other and create duplicates without a database constraint.", "Adding a check constraint to a big table scans it under a strong lock unless added unvalidated first."],
    v: "Run two concurrent transactions inserting the same unique key and confirm exactly one commits and the other waits then fails. Update a row to violate a check and confirm rejection with the constraint name.",
    dep: ["btree-index", "expression-evaluation", "mvcc-versioning"]
  },
  "foreign-keys": {
    s: "Guarantees that referencing rows always point to existing referenced rows, and defines cascading actions when referenced rows are deleted or changed.",
    d: "Implemented as internal triggers or checks on both tables. Inserting a child checks the parent exists, and takes a shared lock on the parent row so it cannot be deleted before commit. Deleting a parent checks for children, or cascades by deleting or nulling them. An index on the referencing column makes this cheap. Difficulties include lock contention on hot parent rows, missing child indexes causing full scans, and checks that must see concurrent uncommitted changes correctly.",
    k: ["Shared row lock on the parent during child insert: prevents dangling references under concurrency, but serializes with parent updates and causes contention.", "Cascading actions in the engine: keep integrity automatic, but a single delete can fan out into very large hidden work."],
    p: ["No index on the referencing column makes each parent delete scan the whole child table.", "Bulk-loading in an order that violates references fails unless constraints are deferred or disabled with later validation."],
    v: "Delete a parent that has children and confirm rejection or cascade as declared. Run a concurrent child insert and parent delete and confirm one waits and the final state has no orphan rows.",
    dep: ["constraint-enforcement", "lock-manager", "btree-index"]
  },
  "triggers": {
    s: "Runs user-defined routines automatically before or after row or statement changes, for derived data, auditing, validation and cascading logic.",
    d: "A trigger is attached to a table and event, optionally with a condition. Before-row triggers can modify or reject the new row; after-row triggers fire once the change is made, often queued until statement end, and can see transition tables of all affected rows. Triggers run inside the same transaction, so their effects roll back together. The danger is hidden cost and complexity: ordering among triggers, recursion, and per-row invocation that turns a bulk statement into millions of calls.",
    k: ["Row-level versus statement-level triggers: row triggers see each row, statement triggers with transition tables are far cheaper for bulk changes.", "Triggers in the same transaction: keep derived data consistent atomically, but make writes slower and invisible to application code."],
    p: ["A trigger that updates the same table recursively loops until the stack or limit is reached.", "A slow trigger makes bulk loads many times slower and is easily forgotten when diagnosing."],
    v: "Insert one million rows into a table with an audit trigger and confirm one audit row per input row, all rolled back when the transaction aborts. Compare row-level and statement-level timings.",
    dep: ["stored-procedures", "constraint-enforcement", "transaction-manager"]
  },
  "stored-procedures": {
    s: "Server-side routines written in a procedural language, callable from SQL, that can contain control flow, variables, cursors and in some designs their own transaction control.",
    d: "A routine body runs in an embedded language runtime with access to run SQL through an internal interface, which caches plans per statement inside the routine. Procedures can commit or roll back inside themselves when invoked outside a transaction block; functions cannot. They reduce round trips and centralize logic. Costs are portability, debugging and versioning, plus the fact that the planner treats the routine as a black box with default cost and row estimates.",
    k: ["Logic next to data: removes network round trips and enforces consistent behavior, but ties application logic to one database and complicates deployment.", "Per-routine statement plan caching: avoids replanning each call, but may hold a plan that suits the first parameters only."],
    p: ["A routine with default cost and row estimates misleads the planner when used in a query.", "Long procedures holding a transaction open keep locks and old versions alive for their whole duration."],
    v: "Call a procedure that loops over ten thousand rows and commits in batches, kill the session midway, and confirm completed batches are persisted and the in-flight batch is rolled back.",
    dep: ["analyzer-and-binder", "transaction-manager", "plan-cache"]
  },
  "user-defined-functions": {
    s: "Extends SQL with custom scalar, aggregate, table-returning and operator functions, declared with volatility, cost and parallel-safety attributes the planner depends on.",
    d: "A function is defined in SQL, a procedural language or a compiled library, with typed arguments and result. The declaration carries properties: immutable, stable or volatile; estimated cost and rows; whether it is safe in parallel workers; and whether it is strict on nulls. Simple SQL functions can be inlined into the calling query. Compiled functions run in-process for speed but can crash the server. Wrong declarations cause wrong results rather than errors.",
    k: ["Declared volatility and cost: let the optimizer fold, cache and parallelize, but trust the author to be truthful and the engine cannot verify it.", "In-process compiled functions: fastest, but a fault in one can take down the whole server, so they need privileged installation."],
    p: ["A volatile function wrongly marked stable returns the same value across rows or is moved by the optimizer.", "Calling a function per row in a filter prevents index use because the planner cannot see through it."],
    v: "Define an immutable function and an expression index on it, confirm the index serves matching queries, and confirm mislabelling the function volatile causes the index definition to be rejected.",
    dep: ["expression-evaluation", "type-coercion", "extension-framework"]
  },
  "extension-framework": {
    s: "A packaging mechanism that lets code add new types, operators, index methods, functions and background workers to the server and version them with the schema.",
    d: "An extension bundles SQL scripts, optional shared libraries and metadata with a version number. Installing runs scripts that register objects in the catalog and records them as members, so dropping the extension removes them together, and upgrades apply version-to-version scripts. Hook points let libraries observe or alter planning and execution. It is hard because extension code runs with full trust inside the server, has to survive major upgrades, and must integrate with dump and restore.",
    k: ["Extensions run in-process with full trust: maximum capability and performance, but a defect or exploit compromises the whole server.", "Versioned upgrade scripts: let objects migrate in place, but each combination of old and new versions must be tested."],
    p: ["An extension library not rebuilt for a new server version crashes at load after upgrade.", "Dump and restore without the matching extension available fails halfway through the restore."],
    v: "Install an extension at one version, create dependent objects, upgrade it, and confirm objects still work. Drop it and confirm all members are removed. Restore a dump on a fresh server and confirm extension objects return.",
    dep: ["system-catalog", "user-defined-functions"]
  },
  "transaction-manager": {
    s: "Assigns transaction identities, tracks each transaction's state from begin to commit or abort, and coordinates commit with the log so the outcome is atomic and durable.",
    d: "On the first write, a transaction receives an identifier and is entered into a shared structure of active transactions. At commit, a commit record is written to the log and flushed; only after that is the transaction marked committed and visible to new snapshots, and its locks released. Abort marks the transaction aborted so its versions are ignored and cleaned later. The ordering of flush, state change and lock release is the delicate part, and so is scalability of the shared structure under thousands of short transactions.",
    k: ["Commit by single log record flush: makes commit atomic and cheap, but the commit moment is the log write, not the state update.", "Lazy cleanup after abort rather than eager undo: rollback is instant, while dead versions linger until garbage collection."],
    p: ["Making a transaction visible before its commit record is durable lets other transactions see data that disappears after a crash.", "A global lock around the active-transaction structure becomes the bottleneck at high commit rates."],
    v: "Commit and crash immediately after acknowledgement and confirm the transaction is durable. Abort a large write transaction and confirm rollback returns in milliseconds and its rows are never visible.",
    dep: ["write-ahead-log", "transaction-id-management", "snapshot-management", "lock-manager"]
  },
  "mvcc-versioning": {
    s: "Keeps multiple versions of each row, stamped with the transactions that created and removed them, so readers see a consistent state without blocking writers.",
    d: "An update does not overwrite in place: it writes a new row version and marks the old one as ended by the updating transaction. Visibility is decided by comparing the version's creator and ender with the reader's snapshot and the commit state of those transactions. Old versions are either kept in the table, chained to newer ones, or moved to a separate undo store. Costs include storage bloat, index entries for each version, and cleanup that must know when no snapshot can see a version.",
    k: ["Old versions stored in the table: cheap rollback and simple reads, but bloat the table and indexes until cleanup runs.", "Old versions kept in a separate undo area: tables stay compact, but reading old data means reconstructing it by applying undo records."],
    p: ["Frequent updates to a wide row create many full copies and indexes get an entry for each, inflating the table.", "A single long-running snapshot prevents cleanup of every version newer than it, system-wide."],
    v: "In one session start a transaction and read a row; in another update and commit that row; confirm the first still sees the old value and is not blocked, while a new transaction sees the new value.",
    dep: ["tuple-format", "snapshot-management", "version-garbage-collection"]
  },
  "snapshot-management": {
    s: "Builds and tracks the point-in-time view that decides which row versions each statement or transaction can see, and tells cleanup how far back versions must be kept.",
    d: "A snapshot records which transactions were committed or in progress at its creation, typically as a horizon identifier plus a list of active ones. Statement-level isolation takes a new snapshot per statement; repeatable and serializable levels take one per transaction. Snapshot creation scans the active-transaction list, so it must be cheap under many connections. The oldest snapshot in use defines the cleanup horizon, which is why exported, replica-reported and long cursor snapshots all matter.",
    k: ["Snapshot per statement versus per transaction: per-statement sees fresh commits and keeps horizons short, per-transaction gives repeatable reads but holds old versions longer.", "Snapshot as horizon plus active list: compact and fast to test, but creation cost scales with active transaction count."],
    p: ["Snapshot creation cost grows with connection count and becomes a throughput limit with thousands of sessions.", "Replica feedback pins the primary's horizon so a lagging or stuck replica causes bloat on the primary."],
    v: "Open a repeatable-read transaction, commit changes from another session, and confirm no change is visible. Check the oldest-snapshot view reports it and that cleanup progress resumes once it closes.",
    dep: ["transaction-manager", "transaction-id-management"]
  },
  "isolation-levels": {
    s: "The selectable contract for what concurrent transactions may observe: from read committed through repeatable read to serializable, each forbidding more anomalies at higher cost.",
    d: "Read committed gives each statement a fresh snapshot, so repeated reads can differ. Snapshot or repeatable read fixes one snapshot per transaction but still permits write skew. Serializable adds conflict detection so outcomes equal some serial order. Writers of the same row conflict: at lower levels the later one waits and rereads, at higher levels it fails with a retryable error. The difficulty is that levels are defined by anomalies, names differ across systems, and applications must handle failures.",
    k: ["Read committed as default: minimal retries and blocking, but statements within one transaction may see different data.", "Snapshot-based repeatable read: stable view and no read locks, but write skew remains possible and conflicts abort the later writer."],
    p: ["Assuming repeatable read is serializable permits write skew, such as two doctors both going off call.", "Applications at higher levels that do not retry serialization failures surface them to users as random errors."],
    v: "Run a write-skew scenario with two concurrent transactions at each level and confirm it succeeds at snapshot level and one transaction receives a serialization failure at serializable.",
    dep: ["snapshot-management", "mvcc-versioning", "lock-manager", "serializable-validation"]
  },
  "serializable-validation": {
    s: "Detects dangerous patterns of concurrent read-write dependencies and aborts one transaction to guarantee outcomes equal a serial execution, without blocking readers.",
    d: "Serializable snapshot isolation tracks read-write conflicts between concurrent transactions by recording what each read using non-blocking predicate markers and noticing when a write touches something another transaction read. A dangerous structure of two consecutive conflicts between concurrent transactions triggers an abort of one. It produces false positives, is memory-intensive for large read sets, and can promote fine-grained markers to coarser ones. Alternatives use strict two-phase locking or optimistic validation at commit.",
    k: ["Optimistic conflict detection instead of read locks: readers never block, but some transactions abort needlessly and must be retried.", "Coarsening predicate markers under memory pressure: bounds memory, but widens conflicts and increases false aborts."],
    p: ["Large scans in serializable transactions create huge read sets and many false-positive aborts.", "Applications mixing long reports and writers at serializable see sporadic failures that only a retry loop hides."],
    v: "Run a set of concurrent transactions known to produce a cycle and confirm one aborts with a serialization error, then replay committed ones serially and confirm the final state matches.",
    dep: ["isolation-levels", "snapshot-management", "lock-manager"]
  },
  "lock-manager": {
    s: "Grants and queues locks on tables, rows, pages and arbitrary resources in a hierarchy of modes, blocking incompatible requests until holders finish.",
    d: "A shared hash table maps lock tags to holders and waiters. Modes include shared, exclusive and intent modes that let a coarse table lock coexist with fine row locks, with a compatibility matrix deciding grants. Row locks are often stored in the row itself to avoid unbounded memory. Locks release at transaction end. Fairness matters: a queued exclusive request must block later shared ones or it starves. Difficulties are lock memory, lock escalation, and contention on the lock table itself.",
    k: ["Intent locks over a hierarchy: allow table-level and row-level locking to coexist efficiently, at the cost of more modes and a larger matrix.", "Row locks recorded in the row rather than a table: bounded memory regardless of rows locked, but waiters must be found through the owning transaction."],
    p: ["A queued exclusive request for DDL blocks all later shared requests, producing a pile-up from one waiting statement.", "Updating many rows in different orders in different transactions creates lock cycles and deadlocks."],
    v: "Hold a row lock in one transaction and update the same row from another, confirm it waits and proceeds on commit. Request a table-level exclusive lock and confirm it queues ahead of new readers.",
    dep: ["transaction-manager", "latches"]
  },
  "deadlock-detection": {
    s: "Finds cycles in the wait-for graph among blocked transactions and aborts one victim so the others can proceed, or avoids cycles through timeouts and ordering rules.",
    d: "After a request has waited a short interval, the waiter runs a search of the wait-for graph from itself through holders and the transactions they wait on. If the search returns to the start, there is a cycle and a victim is chosen, usually the detector or the youngest or cheapest to roll back, and receives a deadlock error. Running detection only after a delay avoids paying for it on ordinary waits. Distributed systems use timeouts or global detection instead.",
    k: ["Detect after a delay: ordinary short waits never pay for graph search, but real deadlocks last the delay before resolving.", "Victim selection by cost or age: limits wasted work and prevents starvation, but needs bookkeeping that can mispredict."],
    p: ["Applications that do not retry after a deadlock error surface a transient condition as a failure.", "A very long deadlock timeout leaves stuck sessions looking like a hung database for many seconds."],
    v: "Make two transactions lock two rows in opposite orders and confirm exactly one receives a deadlock error within the configured delay while the other completes, with the event logged along with both statements.",
    dep: ["lock-manager", "transaction-manager"]
  },
  "latches": {
    s: "Short-lived internal locks protecting in-memory structures such as buffer pages, hash tables and index nodes, held for microseconds and never exposed to users.",
    d: "Latches are spinlocks or reader-writer locks built on atomic instructions with queuing under contention. They have no deadlock detection, so code acquires them in a fixed order and never holds one across I/O or a heavyweight lock wait. Techniques such as lock-free reads, optimistic latch coupling and partitioning of hot structures reduce contention. Latch contention is invisible to SQL-level locking and appears as wait events; it is the usual limit on multicore scaling.",
    k: ["Strict acquisition order instead of deadlock detection: keeps latches extremely cheap, but one ordering mistake becomes a rare unreproducible hang.", "Partitioned or optimistic structures: scale across cores, but increase complexity and subtle correctness risk."],
    p: ["Holding a latch while waiting on I/O stalls every session that needs the same structure.", "A single hot latch, such as for the log insert position or a root page, caps throughput at higher core counts."],
    v: "Run an insert-heavy benchmark while increasing client threads, sample wait events, and confirm latch waits stay a small share of time. Check throughput rises near-linearly up to the core count.",
    dep: []
  },
  "version-garbage-collection": {
    s: "Removes row versions that no current or future snapshot can see, reclaims their space and index entries, and updates the maps that let scans skip clean pages.",
    d: "Cleanup finds versions ended by committed transactions older than the oldest active snapshot, removes index entries pointing at them first, then marks the heap space reusable and updates free-space and visibility maps. It also freezes old transaction identifiers so they do not wrap. It runs on demand or automatically, and can be restricted to pages with recent changes. Difficulties include running without blocking writes, bounded work per run, and the long transaction that prevents any progress.",
    k: ["Background cleanup in passes: avoids blocking foreground writes, but lags behind churn and lets tables bloat in bursts.", "Index entries removed before heap space: guarantees no index points at reused space, but needs a full index scan per pass."],
    p: ["A forgotten open transaction or stuck replica holds the horizon back, and cleanup runs endlessly without reclaiming anything.", "Cleanup that cannot keep up with an update-heavy table lets a table become many times its live size."],
    v: "Update every row of a table several times, run cleanup, and confirm table size stops growing and reuses space. Hold an old snapshot open and confirm cleanup reports versions retained and reclaims nothing.",
    dep: ["snapshot-management", "free-space-map", "visibility-map", "index-maintenance"]
  },
  "transaction-id-management": {
    s: "Allocates the monotonically increasing identifiers that stamp row versions, and keeps the limited identifier space from wrapping around by freezing old rows.",
    d: "Each writing transaction receives the next identifier from a shared counter; compare operations treat the space as circular, so only half the range, about two billion identifiers, is considered older. Before an identifier would appear in the future, old row versions are marked frozen, meaning visible to everyone. A commit-status log maps identifiers to committed or aborted. Pressure from wraparound forces aggressive cleanup and, at the limit, stops accepting writes to protect data.",
    k: ["Fixed-width circular identifiers: compact stamps on every row, but force periodic freezing work across all tables.", "A commit status log separate from rows: rows need no update when a transaction ends, though visibility checks consult a cached lookup."],
    p: ["Disabled or blocked cleanup lets identifiers approach the limit, at which the server refuses writes until a long freeze completes.", "Frozen status lost during copy or recovery makes very old rows suddenly invisible."],
    v: "Lower the freeze age setting, run a write workload, and confirm old rows are frozen and the table's oldest-identifier age drops. Confirm warnings and a write stop appear as the limit is approached on a test instance.",
    dep: ["mvcc-versioning", "version-garbage-collection"]
  },
  "savepoints": {
    s: "Named points inside a transaction to which work can be rolled back without aborting the whole transaction, implemented with nested subtransactions.",
    d: "Establishing a savepoint starts a subtransaction with its own identifier and lock set, tracked in the parent's state. Rolling back to it marks the subtransaction aborted, so its row versions are invisible, and releases its locks acquired after the point. Commit of the parent resolves all children. Exception blocks in routines use them implicitly, so heavy use can surprise. Cost scales with nesting depth, and the number of open subtransactions can overflow cached state and slow visibility checks.",
    k: ["Subtransactions with their own identifiers: allow partial rollback by ordinary abort handling, but each consumes an identifier and tracking state.", "Cache of subtransaction parentage with overflow to a slower path: keeps common cases fast, but a loop creating many savepoints falls off a performance cliff."],
    p: ["A routine with an exception block inside a per-row loop silently creates a subtransaction per row and slows dramatically.", "Rolling back to a savepoint does not release locks acquired earlier than it, which surprises developers."],
    v: "Insert three rows, set a savepoint, insert two more, roll back to the savepoint, commit, and confirm exactly three rows persist. Loop ten thousand savepoints and confirm run time stays linear.",
    dep: ["transaction-manager", "transaction-id-management"]
  },
});
