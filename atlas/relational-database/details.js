// Details for the relational database plate, part 1: operations, security, connections, SQL front end.
ATLAS.details("relational-database", {
  "configuration-system": {
    s: "The set of named settings that control memory, concurrency, durability and planner behavior, with defined scopes, sources and rules for when a change takes effect.",
    d: "Settings come from a file, command-line overrides, per-database and per-role defaults, and per-session or per-transaction commands. Each parameter has a type, a range and a context saying whether it can change live, needs a signal to reload, or needs a restart. The server records where each effective value came from. It is hard because settings interact: buffer memory, connection limits and per-operation memory multiply into total footprint, and a few settings silently trade durability for speed.",
    k: ["Scoped settings (server, database, role, session): let workloads tune themselves without touching the server, at the cost of a precedence order operators must reason about when behavior surprises them.", "Restart-only versus live-reloadable parameters: structural settings such as shared memory size are fixed at startup for simplicity, which makes some tuning changes require downtime."],
    p: ["A setting changed on disk but never reloaded leaves operators believing a fix is live when it is not.", "Per-session overrides of durability or planner settings leak through connection pools and apply to unrelated clients."],
    v: "Change one live setting, reload, and confirm the statistics view shows the new value with its source. Change a restart-only setting and confirm the server reports it as pending until restart.",
    dep: []
  },
  "runtime-statistics-views": {
    s: "Queryable views over live counters: per-table and per-index activity, per-statement timings, lock waits, cache hit rates and replication lag, exposed through SQL itself.",
    d: "Counters are updated cheaply in shared memory by every backend and aggregated by a collector or read directly, then exposed as system views so ordinary tools and queries can inspect them. Some are cumulative since reset, others are instantaneous snapshots of current sessions and locks. Per-statement statistics normalize literals into a fingerprint so similar queries aggregate. The difficulty is overhead and consistency: counters on hot paths must not add contention, and a view read mid-update can be internally inconsistent.",
    k: ["Cumulative counters with explicit reset: cheap to maintain and let external monitors compute rates, but readers must handle resets and wraparound themselves.", "Statement fingerprinting by normalized text: groups workloads usefully, but different plans or parameters hiding behind one fingerprint blur the data."],
    p: ["Reading cumulative counters as current values hides a problem that ended hours ago or one that just began.", "Unbounded per-statement tracking exhausts memory under workloads that generate unique statement text."],
    v: "Run a known workload of one thousand identical lookups and confirm the statement view shows one fingerprint with a call count of one thousand and the table view shows matching index scans.",
    dep: ["background-workers"]
  },
  "slow-query-logging": {
    s: "Records statements that exceed a duration threshold, optionally with their plans and wait breakdown, so operators can find expensive queries after the fact.",
    d: "At statement end the session compares elapsed time to a threshold and writes a log line with text, duration, parameters and optionally the executed plan with actual row counts. Sampling reduces volume on busy systems. The log goes to files or a collector in a structured format. The hard parts are cost and safety: capturing plans for every statement slows the system, logs can contain sensitive literals, and a statement that never finishes is never logged unless there is also a running-time check.",
    k: ["Threshold-triggered logging: bounds log volume and highlights outliers, but misses the cheap query run a million times that actually dominates load.", "Logging parameters with text: makes slow cases reproducible, at the risk of writing personal data into logs with weaker access control than the tables."],
    p: ["Logging at threshold zero on a busy server fills the disk and slows every statement.", "A hung statement produces no completion event, so it never appears in the slow log."],
    v: "Set the threshold to 100 ms, run a query that sleeps for one second and one that finishes quickly, and confirm only the slow one appears with a duration, text and bound parameters.",
    dep: ["configuration-system"]
  },
  "background-workers": {
    s: "Server-managed processes or threads that run continuously outside any client session: the log writer, checkpointer, page writer, statistics collector and cleanup tasks.",
    d: "The server starts a fixed set of helper workers at boot and supervises them, restarting any that exit. Each owns a loop with a wakeup interval or a latch signaled by other processes: flushing the log, writing dirty pages, shipping log to replicas, vacuuming. Some systems also allow extensions to register workers. Coordination is the challenge: workers share memory with sessions, so a crash in one may force a full restart to avoid corrupt shared state, and their I/O competes with foreground queries.",
    k: ["Dedicated workers instead of inline work: foreground latency stays low and work batches efficiently, but background I/O needs throttling or it starves queries.", "Crash of any shared-memory worker triggers a restart of all processes: sacrifices availability for a guarantee that no one continues with possibly torn shared state."],
    p: ["A stalled worker, such as a blocked log shipper, silently lets disk usage grow until the server halts.", "Too many parallel workers compete with foreground sessions for the same I/O budget."],
    v: "List running workers, kill one non-critical worker and confirm it is restarted without disturbing sessions. Then confirm a stalled log writer shows up in wait-event output within seconds.",
    dep: []
  },
  "maintenance-scheduler": {
    s: "Decides when to run routine upkeep such as version cleanup, statistics refresh and index rebuilds, triggering them from measured table churn rather than a fixed clock.",
    d: "A launcher wakes periodically, reads change counters per table, and starts workers on tables whose dead-row or modified-row counts cross a threshold scaled by table size. It applies cost-based throttling so cleanup does not overwhelm foreground I/O, and cancels itself when it blocks a schema change. It also drives statistics refresh. The difficulty is calibration: thresholds that suit a small table are wrong for a billion-row one, and maintenance that falls behind compounds into bloat and stale plans.",
    k: ["Threshold proportional to table size: avoids constant work on small tables, but very large tables wait long enough for bloat to accumulate unless thresholds are set per table.", "Throttled cleanup with cost limits: protects foreground latency, at the cost of cleanup that cannot keep up with a very high update rate."],
    p: ["A long-running transaction pins old versions so scheduled cleanup runs repeatedly yet reclaims nothing.", "Default thresholds leave huge tables with stale statistics, producing sudden bad plans after a data shift."],
    v: "Update every row of a large table twice, wait for the scheduler, and confirm dead-version counts drop, statistics timestamps advance and foreground query latency stays within normal bounds during the run.",
    dep: ["version-garbage-collection", "statistics-collection", "background-workers"]
  },
  "resource-governance": {
    s: "Limits that stop one session, role or workload from consuming all memory, CPU, I/O or connections, including timeouts, per-role quotas and statement cancellation.",
    d: "Controls come at several levels: per-operation memory budgets, statement and lock timeouts, idle-in-transaction timeouts, connection limits per role, and in some systems workload classes with CPU and I/O shares. Enforcement is cooperative: operators check interrupt flags at safe points, and timeouts raise errors that roll back the statement. It is hard because the engine cannot always interrupt promptly inside long native operations, and limits that cut off a victim must not leave locks or shared state half-released.",
    k: ["Cooperative cancellation at safe points: keeps shared structures consistent, but a long operation without checks can overrun its limit.", "Per-session memory budgets rather than a global pool: simple to reason about, yet many concurrent sessions can still exceed physical memory in total."],
    p: ["An idle transaction left open by an application holds locks and old versions indefinitely unless a timeout ends it.", "Setting per-operation memory high for one report lets concurrent runs multiply it into an out-of-memory kill."],
    v: "Set a one-second statement timeout, run a long query, and confirm it is cancelled with a timeout error and its locks are gone. Open a transaction idle past the idle limit and confirm the session is terminated.",
    dep: ["configuration-system", "connection-handling"]
  },
  "roles-and-privileges": {
    s: "The access-control model: roles that can own objects and be members of other roles, and grants of specific privileges on databases, schemas, tables, columns and routines.",
    d: "Roles unify users and groups; membership can inherit privileges. The catalog stores grants as access-control lists on each object. At analysis time, and again at execution for dynamic cases, the engine checks the effective role against required privileges, including column-level and default privileges for objects created later. Routines may run with the caller's or the owner's rights. Complexity comes from ownership transfer, inheritance, default grants and elevated routines, which together make the effective permission of a role hard to predict.",
    k: ["Privilege checks at plan or analysis time with cached results: fast per statement, but revokes must invalidate cached plans or they linger.", "Owner-rights routines: let applications expose narrow, controlled operations without table access, at the risk of privilege escalation if the routine builds queries from caller input."],
    p: ["A revoke on a role does not remove privileges it inherits through membership, leaving access the operator believed removed.", "Owner-rights routines with an unqualified search path can be hijacked by objects the caller creates."],
    v: "Create a role with select on one column, confirm it can read that column and gets a permission error on another, then revoke and confirm a cached prepared statement now fails.",
    dep: ["system-catalog", "analyzer-and-binder"]
  },
  "row-level-security": {
    s: "Attaches predicate policies to tables so each role sees and modifies only the rows it is permitted to, enforced inside the engine regardless of how the query is written.",
    d: "A policy is a boolean expression, defined per table, command and role. The rewriter injects the applicable predicates as mandatory qualifications on every access to the table, before user-written conditions can reveal anything, and checks write policies against new row values. It is hard because the predicate must run before any user-defined function that could leak data, can interact poorly with index selection and statistics, and the optimizer must not reorder untrusted functions ahead of security filters.",
    k: ["Policy injected during rewriting: it applies uniformly to all queries and views, but costs an extra predicate on every access and can change plan choices.", "Security-barrier ordering of predicates: prevents leaks through side-effecting functions, at the price of less freedom for the optimizer to push cheap user filters down."],
    p: ["Table owners and administrative roles often bypass policies by default, so tests run as an owner pass while real users fail.", "A policy that calls a lookup on another protected table can recurse or become very slow."],
    v: "Insert rows for two tenants, query as each tenant role, and confirm each sees only its own rows through direct selects, joins and views. Attempt to insert a row for the other tenant and confirm rejection.",
    dep: ["roles-and-privileges", "query-rewriter"]
  },
  "encryption-in-transit": {
    s: "Protects client, replica and administrative connections from eavesdropping and tampering using negotiated transport encryption with server and optional client certificate verification.",
    d: "The protocol begins with a plaintext handshake that offers an upgrade to an encrypted channel, after which authentication runs inside it. The server presents a certificate, and can require client certificates that map to roles. Settings control minimum protocol version and cipher choices, and can reject unencrypted connections per address range. Complexity includes certificate rotation without downtime, verification being optional on the client by default, and the cost of encrypting high-volume result streams.",
    k: ["Upgrade negotiated inside the protocol: one port serves both modes and eases rollout, but a downgrade is possible unless the server and client both insist on encryption.", "Client certificates as authentication: strong and automatable, at the cost of a certificate lifecycle that operators must run."],
    p: ["A client that encrypts but does not verify the server certificate is exposed to impersonation while appearing secure.", "Expired server certificates cause an outage at the moment of expiry unless reload and rotation are rehearsed."],
    v: "Connect with a client that demands verified encryption and confirm it succeeds. Point it at a server with the wrong hostname certificate and confirm refusal. Confirm a plaintext connection is rejected by host rules.",
    dep: ["wire-protocol", "authentication"]
  },
  "encryption-at-rest": {
    s: "Encrypts data files, log segments, temporary files and backups on storage so that stolen media or copied files reveal nothing without keys held separately.",
    d: "Encryption may sit at the volume, file or page level, or in individual columns inside the database. Page-level schemes encrypt on write from the buffer pool and decrypt on read, using a per-database key protected by a master key held in an external key service. The log and spill files must be covered too. Hard problems include key rotation without rewriting everything, keeping page checksums and compression useful, and defending against anyone with access to the running process.",
    k: ["Page-level encryption inside the engine: covers all files uniformly and survives file copies, but adds CPU per page and complicates checksums and compression order.", "Wrapped data keys under a master key: rotating the master is cheap, though rotating data keys needs a rewrite of the data."],
    p: ["Temporary spill files and logs left unencrypted leak the same data the tables protect.", "Losing the master key makes the database and every backup permanently unreadable."],
    v: "Write a recognizable string, flush it to disk and search the raw data and log files for it: it must not appear. Then restart with the wrong key and confirm the server refuses to open the files.",
    dep: ["buffer-pool", "write-ahead-log", "spill-to-disk"]
  },
  "audit-logging": {
    s: "Writes a tamper-resistant record of who ran which statements or touched which objects, at a configurable level of detail, for compliance and incident investigation.",
    d: "Hooks in the executor and in privilege and DDL paths emit events carrying role, session, timestamp, statement class, target objects and success or failure. Output goes to a separate stream or table that ordinary roles cannot edit, often shipped off-host. Object-level audit records only access to chosen tables. Hard parts are volume, the need to record failed attempts that never reach execution, logging parameters without leaking secrets, and ensuring that an audited action cannot complete when its audit write fails.",
    k: ["Session-level versus object-level auditing: session mode captures everything at high volume, object mode logs only sensitive tables but can miss access through unaudited routes.", "Synchronous audit writes: guarantee a recorded action, at the cost of availability when the audit sink is slow or full."],
    p: ["Auditing statements by text misses data touched indirectly through views, triggers or routines.", "Audit records stored in the audited database can be altered or removed by a privileged administrator."],
    v: "Run a select, a failed update without permission, and a privilege grant as different roles, then confirm each appears with role, time and outcome. Confirm a normal role cannot read or delete the records.",
    dep: ["roles-and-privileges"]
  },
  "wire-protocol": {
    s: "The framed message protocol clients speak to the server: startup, authentication, query submission, row streaming, errors, notices, and bulk copy.",
    d: "Messages are length-prefixed with a type tag. A simple mode sends text and returns all results; an extended mode separates parse, bind and execute so statements can be prepared, parameters sent in binary, and results fetched in portions. Result rows carry per-column format and type identifiers. Asynchronous messages deliver notices and notifications. Difficulties include evolving the protocol compatibly, handling cancellation on a separate connection, and the large installed base of client drivers that depend on exact behavior.",
    k: ["Separate parse, bind and execute messages: allow plan reuse and safe parameter passing, but add round trips unless pipelined.", "Binary versus text result formats: binary is smaller and faster, but demands that clients understand each type's exact encoding."],
    p: ["Sending parameters inline as text invites injection and defeats plan reuse.", "A client that stops reading the result stream stalls the server session and any resources it holds."],
    v: "Capture a session with a protocol analyzer, run a parameterized query through extended mode, and confirm parse, bind and execute are distinct messages and that the second run skips parse.",
    dep: []
  },
  "connection-handling": {
    s: "Accepts incoming connections and gives each a server-side execution context, either a process or a thread, while enforcing connection limits and clean teardown.",
    d: "A listener accepts sockets and creates a backend per connection, which then performs the startup handshake and authentication. Process-per-connection gives isolation and simple memory handling, thread-per-connection is cheaper to start, and event-driven designs multiplex many connections over few workers. Each active backend uses memory for caches and sort space, so limits matter. Harder issues are cleaning up after a client that vanishes mid-transaction, dead peer detection, and connection storms after an outage.",
    k: ["Process or thread per connection: simple blocking code and strong failure isolation, but memory and context-switch costs grow with connection count.", "Hard connection limit with reserved slots: guarantees administrators can still log in under overload, by shrinking the capacity available to applications."],
    p: ["Thousands of mostly idle connections consume memory and slow snapshot computation that scans all active sessions.", "A client crash without a clean close leaves a backend holding locks until keepalive detection fires."],
    v: "Open connections up to the limit and confirm the next application login is refused while a reserved administrative login still works. Kill a client mid-transaction and confirm locks are released within the keepalive window.",
    dep: ["wire-protocol", "authentication"]
  },
  "connection-pooling": {
    s: "Shares a small number of server connections among many client connections, in the application, a proxy or the server, so that connection cost no longer scales with client count.",
    d: "A pooler holds warm backend connections and lends one to a client for a session, a transaction or a single statement. Transaction-level pooling gives the best sharing but breaks anything tied to session state, such as temporary tables, advisory locks, session settings and server-side prepared statements. Pools must reset state on return, queue when exhausted and detect broken connections. The hardest part is correctness: session state leaking between borrowers produces confusing failures.",
    k: ["Transaction-level pooling: multiplexes thousands of clients onto tens of backends, but forbids session-scoped features unless the pooler tracks and replays them.", "State reset on return: protects borrowers from each other, at the cost of an extra round trip or the loss of prepared statement reuse."],
    p: ["A session setting changed by one client persists on the shared backend and alters another client's behavior.", "Pool size set larger than the server can run concurrently only moves the queue inside the database, where it is harder to see."],
    v: "Have two hundred clients share ten backends, then set a session variable in one and confirm another client never sees it. Confirm backend count in the activity view stays at ten under load.",
    dep: ["connection-handling", "session-state"]
  },
  "authentication": {
    s: "Verifies who is connecting, using password challenge-response, external identity services or client certificates, and maps the verified identity to a database role.",
    d: "Rules are evaluated in order against connection source, target database and requested role to pick a method. Password methods store salted, iterated verifiers and use a challenge exchange that never sends the secret. External methods delegate to directory or token services. After success the session runs as the mapped role. Hard concerns are brute-force throttling, handling slow or unavailable identity providers without blocking the listener, and migrating stored verifiers to stronger schemes.",
    k: ["Ordered, address-aware rule list: expresses different policies for local, internal and public clients, but a mis-ordered rule can silently permit too much.", "Challenge-response with stored verifiers: the server never holds usable plaintext, so a stolen catalog is harder to exploit, but old weaker schemes must be actively retired."],
    p: ["A trust rule left from setup lets any local user connect as a superuser role.", "Authentication that blocks on a remote identity service can exhaust connection slots during an outage of that service."],
    v: "Attempt login with a wrong password, correct password, and an address excluded by rules, and confirm results are denied, accepted and denied. Confirm the log records the reason for each.",
    dep: ["wire-protocol", "roles-and-privileges"]
  },
  "session-state": {
    s: "Everything the server remembers about one connection between statements: current role, settings, prepared statements, temporary objects, open cursors and transaction status.",
    d: "A session holds its role, search path, time zone and other overrides, plus prepared statements, portals, temporary tables and advisory locks. Transaction state tracks whether the session is idle, inside a block or failed and awaiting rollback; statements run under an implicit transaction otherwise. On commit or rollback, transaction-scoped settings and locks revert. The difficulty is that session state is what makes pooling, failover and replica routing hard, since it cannot move with the connection.",
    k: ["Aborted-transaction state that rejects further statements until rollback: prevents work built on partial failure, but forces clients to handle errors explicitly.", "Session-scoped versus transaction-scoped settings: scope controls blast radius, at the price of subtle bugs when a client assumes the wrong one."],
    p: ["Temporary tables and session locks survive in the session after the application believes it is finished.", "After failover, a reconnecting client silently loses prepared statements and settings that its code still assumes."],
    v: "Open a transaction, force an error, and confirm later statements fail until rollback. Then set a transaction-local setting, commit, and confirm it reverts while a session-level setting persists.",
    dep: ["transaction-manager", "wire-protocol"]
  },
  "result-streaming": {
    s: "Delivers query results to the client incrementally, through server-side cursors or row batches, so large results do not have to fit in memory on either side.",
    d: "The executor produces rows as the client reads them. A simple query streams rows into network buffers, blocking when the client is slow. A named cursor suspends the plan between fetches, holding its snapshot and resources, and can be scrollable or forward-only. Holdable cursors survive commit by materializing results. The challenges are backpressure, long-lived snapshots that block cleanup, and clients whose drivers buffer entire results by default and defeat the mechanism.",
    k: ["Pull-based streaming with backpressure: bounds server memory by client speed, but a slow reader holds locks and snapshots open.", "Materializing holdable cursors at commit: lets results outlive the transaction, at the cost of storing the whole result."],
    p: ["A driver that buffers the full result set exhausts client memory on a large select despite the server streaming.", "An abandoned cursor keeps its snapshot, preventing cleanup of old row versions."],
    v: "Select one hundred million rows through a cursor fetching one thousand at a time, and confirm client memory stays flat, the first batch returns immediately, and the snapshot releases when the cursor closes.",
    dep: ["iterator-model", "snapshot-management", "wire-protocol"]
  },
  "lexer-and-parser": {
    s: "Splits SQL text into tokens and builds a raw syntax tree from the grammar, reporting precise syntax errors before any catalog lookup occurs.",
    d: "The lexer handles identifiers, quoted names, literals, comments, operators and case folding. The parser, typically generated from a grammar, builds a tree for each statement without knowing whether tables exist. Dialect size is the main challenge: SQL's grammar is large, ambiguous in places, and extended with vendor features and user-defined operators with their own precedence. Fast paths matter because parsing is repeated for every non-prepared statement. Error messages need an exact position.",
    k: ["Parsing independent of the catalog: statements are checked and cached cheaply, but anything depending on object meaning, such as operator types, must wait for analysis.", "Generated parser from a grammar: easier to extend and verify, at the cost of conflict resolution and harder custom error messages."],
    p: ["Treating a quoted identifier case-insensitively, or an unquoted one case-sensitively, breaks portable schemas.", "Very long statements with huge in-lists or deep nesting can overflow parser stack or take quadratic time."],
    v: "Feed a corpus of valid statements and confirm trees round-trip to equivalent text. Feed malformed statements and confirm the error points at the offending token. Parse a ten-thousand-element in-list within milliseconds.",
    dep: []
  },
  "analyzer-and-binder": {
    s: "Resolves every name in the raw tree to a catalog object, checks types and privileges, and produces a validated query tree that downstream stages can transform.",
    d: "The analyzer looks up tables, columns, functions and operators using the search path, expands wildcards, assigns aliases, resolves ambiguous references, picks overloads and checks grouping rules. It records which objects the query depends on so cached plans can be invalidated, and takes needed locks on referenced tables. It is hard because name resolution has scoping rules for subqueries and joins, overload resolution has many cases, and the output must be a stable contract for the rewriter and optimizer.",
    k: ["Locking referenced objects at analysis time: guarantees the schema holds still while planning, at the cost of lock waits before the query even runs.", "Recording object dependencies on the tree: allows precise plan invalidation after DDL, but needs every analysis path to remember to record them."],
    p: ["Resolving names through a mutable search path lets a new schema object change what a stored query means.", "Missing a dependency record leaves a cached plan pointing at a dropped or altered object."],
    v: "Prepare a query on a table, drop and recreate a column it uses, and confirm the next execution re-analyzes and either succeeds with the new definition or fails with a clear error instead of reading wrong data.",
    dep: ["lexer-and-parser", "system-catalog", "type-coercion", "roles-and-privileges"]
  },
  "type-coercion": {
    s: "Defines the built-in and user-defined data types, their operators and functions, and the rules that convert between types implicitly or on request.",
    d: "Each type has input and output functions, comparison and hashing semantics, a binary form and cast rules. Operator and function overloads are resolved by type category and implicit cast preferences. Collations determine string order and equality, and numeric semantics define overflow, rounding and exactness. Hard issues are NULL handling in three-valued logic, time zone semantics, locale-dependent sorting that changes index order when libraries upgrade, and implicit casts that quietly defeat index use.",
    k: ["Implicit casts only in safe widening directions: protect queries from surprising conversions, but require explicit casts users find verbose.", "Collation-aware comparison in indexes: gives language-correct ordering, but a change in collation rules can corrupt existing indexes."],
    p: ["Comparing a numeric column with a text parameter casts the column and disables its index.", "Upgrading the collation library changes sort order, leaving existing indexes inconsistent with new comparisons."],
    v: "Compare an indexed integer column to a text literal and an integer literal, and confirm via the plan that only the second uses the index. Confirm null comparisons follow three-valued logic in filters and joins.",
    dep: ["system-catalog"]
  },
  "views-and-expansion": {
    s: "Stores named queries and substitutes their definitions into referencing queries, optionally materializing results on disk for fast reads.",
    d: "A plain view is a stored query tree. When referenced, the rewriter replaces the reference with the definition, so the optimizer sees one flattened query and can push filters through it. Views run with the owner's privileges unless declared otherwise. Updatable views map changes to the base table. A materialized view stores results and is refreshed on demand or incrementally. Difficulties include security barriers, expansion explosion in nested views, and keeping stored results fresh without blocking readers.",
    k: ["Inline expansion rather than evaluate-then-filter: the optimizer can reorder across view boundaries, but the same logic may be re-planned in many places.", "Materialized results with explicit refresh: reads become cheap, while staleness becomes the application's problem."],
    p: ["A view defined with select-star does not pick up columns added later, surprising developers who expect it to.", "Refreshing a materialized view with an exclusive lock blocks all readers for the whole rebuild."],
    v: "Query a filtered view and confirm in the plan that the filter is pushed down into the base table scan. Refresh a materialized view concurrently while readers run and confirm they never block.",
    dep: ["query-rewriter", "system-catalog"]
  },
  "query-rewriter": {
    s: "Applies semantics-preserving tree transformations before costing: view expansion, rule application, policy injection, constant folding and flattening subqueries into joins.",
    d: "Rule-based rewrites run on the analyzed tree. They expand views, inject row-security predicates, apply user-defined rewrite rules, fold constants, simplify predicates, remove redundant joins and convert correlated subqueries into joins where equivalent. They are applied to a fixpoint or a fixed sequence. The challenge is correctness: transformations must preserve null semantics, duplicates and ordering, and each new rewrite interacts with the others, while the output tree must remain debuggable.",
    k: ["Rewrites before cost-based planning: cheap, always-beneficial simplifications shrink the search space, but any rewrite that is sometimes worse needs cost-based choice instead.", "Unnesting subqueries into joins: unlocks join reordering, but must preserve null and duplicate behavior of anti and semi cases."],
    p: ["Unnesting a not-in subquery as an anti-join ignores null semantics and returns wrong rows.", "Applying predicate pushdown across a security barrier lets an untrusted function see rows the policy hides."],
    v: "Run a corpus of equivalent query pairs, with and without nulls and duplicates, and confirm results are identical before and after each rewrite, including not-in, exists and outer-join cases.",
    dep: ["analyzer-and-binder", "views-and-expansion"]
  },
  "cte-and-recursion": {
    s: "Supports named subquery blocks, including recursive ones that iterate until no new rows appear, to express hierarchies and graph walks in SQL.",
    d: "A common table expression names a subquery. Non-recursive ones may be inlined or evaluated once and reused. A recursive one has a non-recursive seed and a recursive term that references the working set; the executor loops, feeding each iteration's output as the next input and de-duplicating when requested, until the working table is empty. Difficulties include optimization fences when results are materialized, cycle detection, and unbounded recursion that must be limited by guard conditions or resource limits.",
    k: ["Inline versus materialize non-recursive blocks: inlining enables filter pushdown, materializing avoids repeated work when referenced multiple times.", "Iteration with a working table: simple to implement and fast per step, but cannot optimize across iterations."],
    p: ["A recursive query over cyclic data never terminates and consumes memory until the server stops it.", "Materialized blocks hide filters from the optimizer, scanning far more rows than the outer query needs."],
    v: "Walk a tree of one million nodes with a recursive query and confirm complete results. Run it on data with a cycle and confirm the cycle guard stops it. Compare plans with inline and materialized settings.",
    dep: ["analyzer-and-binder", "iterator-model"]
  },
});
