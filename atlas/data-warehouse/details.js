// Details for the data warehouse plate, part 1: clients, transformations, loading, access control.
ATLAS.details("data-warehouse", {
  "sql-endpoint": {
    s: "The network front door that accepts SQL over a standard protocol, authenticates the caller, and hands each statement to the services layer for planning and routing.",
    d: "Drivers speak SQL over HTTP and TLS, either through a native wire protocol or a standard database API. The endpoint terminates TLS, validates credentials, binds the connection to a session and queues the statement. It does not run queries itself; it forwards them to the services layer and then streams back results or a handle for fetching them. Because the endpoint is shared by many tenants, it enforces limits on request size, concurrency and idle time. The hard parts are keeping long-lived sessions cheap and keeping a stalled client from pinning cluster resources.",
    k: ["Stateless HTTP requests vs persistent connections: stateless calls scale and fail over easily; session context must then be carried explicitly on every request.", "One shared endpoint per region vs per-account endpoints: shared is cheaper to run; per-account allows private networking and isolation but multiplies the endpoints to operate."],
    p: ["Drivers with aggressive retry resubmit a statement that actually succeeded, running a load or insert twice.", "A client that stops reading results leaves the statement and its cluster resources held until a timeout."],
    v: "Open a connection with the standard driver, run a one-row query and a failing query, and confirm both return over TLS with correct result and error codes, and that the session appears in the active sessions view.",
    dep: ["services-layer","authentication-sso"]
  },
  "session-state": {
    s: "Per-connection context that statements depend on: current role, database, schema, cluster, time zone, query tags and session parameters.",
    d: "A session record lives in the services layer and is keyed by a token. It holds the active role stack, default namespace, selected compute cluster, parameter overrides and the open transaction if any. Every statement is resolved against it, so the same text can mean different tables or permissions in different sessions. The token has an idle timeout and a hard expiry, and can be refreshed. The difficulty is that session state is shared across gateways and failover, and must survive a gateway restart without silently reverting to a more privileged or different role.",
    k: ["Server-held session state vs client-sent context: server-held keeps requests small and enables auditing; it makes the services layer stateful and harder to fail over.", "Short token lifetime vs long: short limits the damage of a leaked token; long avoids interrupting multi-hour pipelines."],
    p: ["Connection pools reuse a session after a client changed its role, so the next user inherits elevated permissions.", "A session parameter set for one query, such as a large timeout, persists and applies to every later statement."],
    v: "Switch role in one session, run a query that reports the current role from two pooled connections, and confirm each session reports its own role and that an expired token is rejected rather than silently re-created.",
    dep: ["sql-endpoint","role-hierarchy"]
  },
  "result-delivery": {
    s: "How query results leave the system: written as files to object storage in chunks and fetched in parallel, so large results never flow through a single connection.",
    d: "Workers write finished result rows to a result location in compressed chunks. The client receives metadata and chunk URLs, then downloads them in parallel, decoding as it goes. Small results can be returned inline. The same stored result feeds the result cache and later pagination, and expires after a retention period. The challenge is memory and ordering: sorted results must preserve order across chunks, and a client asking for ten million rows must not make the cluster hold them all in memory.",
    k: ["Chunked files fetched by the client vs streaming through the gateway: chunking scales with parallel downloads and keeps the gateway light; it requires the client to reach storage.", "Persisting every result vs only large ones: persisting enables reuse and pagination; it adds storage writes and retention duties for small throwaway queries."],
    p: ["Result URLs signed for a short window expire before a slow client finishes downloading.", "Clients behind a proxy that blocks the storage domain can run queries but never fetch results."],
    v: "Run a query returning five million rows, confirm the client receives multiple chunk URLs, downloads them in parallel and reconstructs the correct row count and ordering, and the gateway memory stays flat.",
    dep: ["object-store-layer","sql-endpoint"]
  },
  "tool-connectors": {
    s: "Adapters that let BI tools, notebooks, orchestrators and ETL tools use the warehouse through standard drivers, with correct type mapping, pushdown and credentials handling.",
    d: "Connectors translate the tool's metadata calls and generated SQL into dialect-compatible statements, map warehouse types such as decimals, timestamps with zones and nested types onto the tool's types, and pass credentials through the supported flows such as key pairs or token exchange. Good ones push filters and aggregations down to the warehouse instead of pulling rows. They also report query tags so costs can be attributed. The hard part is dialect drift: each tool generates SQL differently, and a single unsupported function can fall back to extracting entire tables.",
    k: ["Pushdown vs local processing in the tool: pushdown uses the warehouse's scale and avoids data transfer; it exposes the warehouse to inefficient tool-generated SQL.", "Service account per tool vs per-user passthrough: service accounts are simple and cacheable; passthrough preserves row-level policies and audit identity but breaks shared caches."],
    p: ["A connector maps timestamp with zone to a zoneless type, so dashboards show times shifted by hours.", "A tool refresh runs a full unfiltered extract every few minutes and consumes the cluster budget."],
    v: "Connect a BI tool, build a filtered chart, and confirm in the query history that the generated statement carries the filter and a tag naming the tool, and that returned types match the table definition.",
    dep: ["sql-endpoint","query-cost-attribution"]
  },
  "transformation-models": {
    s: "SQL select statements managed as named, version-controlled models that build tables or views from other models, forming a dependency graph of the analytics layer.",
    d: "Each model is a query that defines a dataset. A build tool parses references between models, orders them into a graph and runs them as create-table-as or create-view statements, in layers from raw to staged to marts. Materialization choice per model controls whether it is a view, a table or an incremental table. Tests and documentation attach to models. The difficulty is correctness at scale: the graph can contain thousands of models, rebuild times grow, and subtle changes upstream break downstream definitions without any warehouse-level error.",
    k: ["Views vs tables for models: views always show fresh data and cost no storage; tables make downstream queries fast and cheap but go stale between builds.", "Full rebuild vs targeted build of changed models: full is simple and deterministic; targeted saves compute but depends on correct dependency tracking."],
    p: ["A column renamed upstream silently yields nulls downstream because the consuming model uses a loosely typed expression.", "Deep chains of views make every query expand into a massive plan that planning alone takes seconds."],
    v: "Change one staging model, run a build selecting it and its descendants, and confirm only those objects are recreated, row counts of downstream tables update, and tests on them pass.",
    dep: ["sql-endpoint","zero-copy-clone"]
  },
  "incremental-processing": {
    s: "Updating derived tables with only the data that changed since the last run, using merge statements, watermarks or change streams instead of recomputing everything.",
    d: "An incremental model finds new or changed source rows through a timestamp watermark, a change-tracking stream or partition boundaries, then merges them into the target by key. The merge reads matching target files, rewrites them and commits a new table version. Late-arriving data, deletes and updates to history require lookback windows or tracked deletes. Hard parts are idempotence and drift: a rerun after failure must give the same result, and small bugs in the merge predicate slowly diverge the target from a full rebuild.",
    k: ["Watermark on a timestamp vs change tracking from the source table: a watermark works anywhere but misses late updates; change tracking captures all changes but needs the feature and retention.", "Merge into the target vs append plus latest-row view: merge keeps reads simple and fast; append is cheap to write but pushes deduplication cost onto every read."],
    p: ["A late event older than the watermark is never picked up, so the table is permanently missing rows.", "A merge with a non-unique key duplicates target rows or fails with an ambiguous match."],
    v: "Insert, update and delete rows in the source, run the incremental job twice, and confirm the target equals a fresh full rebuild by comparing row counts and a checksum column, with the second run changing nothing.",
    dep: ["change-tracking","transaction-manager","transformation-models"]
  },
  "orchestration-hooks": {
    s: "The interfaces external workflow orchestrators use to run, monitor and retry warehouse work: the SQL API, query tags, asynchronous statement handles and event notifications.",
    d: "An orchestrator submits statements asynchronously, receives a handle, polls or waits on a callback, and reads status and errors from query history. Tags carry the pipeline and task identity so cost and lineage can be traced back. Operators that wait on data use table freshness checks or change streams. The orchestrator owns scheduling, retries and dependencies across many systems; the warehouse owns execution. The hard part is exactly-once behavior: retrying a failed statement is only safe when the statement is idempotent or the state of the earlier attempt is checked first.",
    k: ["Orchestrator-owned scheduling vs in-warehouse task graphs: external covers cross-system dependencies and has richer monitoring; in-warehouse needs no extra service and runs close to the data.", "Synchronous waiting on a statement vs async handle with polling: sync is simple; async frees the orchestrator worker and survives disconnects."],
    p: ["An orchestrator retries after a timeout while the original statement is still running, producing two concurrent loads.", "Missing tags make a failed pipeline impossible to link to the statements it spawned."],
    v: "Submit a long statement asynchronously with a pipeline tag, kill the orchestrator worker, and confirm the statement finishes, the handle can be polled afterward and query history shows the tag.",
    dep: ["sql-endpoint","session-state"]
  },
  "scheduled-tasks": {
    s: "Built-in scheduled and event-triggered SQL jobs, chained into dependency graphs, that run on a compute cluster without an external scheduler.",
    d: "A task has a schedule or a trigger such as new rows in a change stream, a SQL body and a compute assignment, either a named cluster or serverless. Tasks form a graph in which children run after parents finish. The task service records run history, skips runs when the trigger sees no data and suspends tasks after repeated failures. It is simple to use but limited: cross-system dependencies, rich retries and backfills are weaker than in a dedicated orchestrator. A hard part is overlap, where a slow run is still going when the next one fires.",
    k: ["Serverless task compute vs a named cluster: serverless sizes itself and needs no idle cluster; a named cluster has predictable cost but may sit mostly idle.", "Trigger on data arrival vs fixed schedule: triggers reduce empty runs and latency; schedules make load and cost easier to predict."],
    p: ["A task graph is resumed in the wrong order, so a child runs before its parent has ever succeeded.", "Auto-suspension after consecutive failures silently stops a pipeline that nobody was watching."],
    v: "Create a two-task graph triggered by a change stream, insert rows, and confirm the parent runs, the child runs after it, run history shows both, and an insert with no new rows causes a skipped run.",
    dep: ["change-tracking","serverless-compute","auto-suspend-resume"]
  },
  "procedures-and-udfs": {
    s: "User-defined functions and stored procedures that run custom logic inside the warehouse, in sandboxed runtimes next to the data, called from SQL.",
    d: "SQL-defined functions are inlined by the planner. Functions in procedural or general-purpose runtimes execute in a sandbox on the workers, receiving batches of rows and returning batches. Procedures run control flow with several statements and can take a caller or owner privilege. Packages and external libraries are loaded from stages. The hard parts are isolation, since user code must not read other tenants or call out freely, and performance, since row-by-row calls across a sandbox boundary are orders of magnitude slower than native operators.",
    k: ["Inlined SQL functions vs sandboxed runtimes: inlined ones optimize with the plan and cost nothing extra; sandboxed ones can do anything but stay opaque to the optimizer.", "Owner's-rights vs caller's-rights procedures: owner's-rights lets users do controlled actions without direct access; caller's-rights keeps permissions honest but needs broader grants."],
    p: ["A function that makes a network call per row throttles or breaks the cluster and the external service.", "An owner's-rights procedure with string-built SQL exposes the owner's privileges to injection."],
    v: "Call a vectorized function over ten million rows and compare its runtime to the same logic row by row; confirm the batch version is much faster and that a call to a disallowed network address is blocked.",
    dep: ["vectorized-execution","stages","role-hierarchy"]
  },
  "bulk-load": {
    s: "Loading a set of staged files into a table in one transactional statement, parallelized across workers, with validation and a record of which files were loaded.",
    d: "A copy statement lists files in a stage by name or pattern, assigns them to workers, parses each according to a file format and writes the rows as new micro-partitions. The commit adds all new partitions in a single metadata transaction, so readers see all or nothing. Load history prevents the same file from loading twice. Throughput depends on file size and count: many tiny files waste task startup, and one huge file cannot be split if its format is not splittable. Errors can abort, skip rows or skip files.",
    k: ["One transaction per copy statement vs per file: one transaction gives atomic visibility of the batch; a failure late in a large load wastes the earlier work.", "Abort on first error vs skip bad rows: aborting keeps data trustworthy; skipping keeps pipelines moving but needs an error review path."],
    p: ["Thousands of tiny files load slowly and produce many small partitions that hurt later scans.", "A column added upstream shifts positional parsing, so values land in the wrong columns without an error."],
    v: "Load one hundred compressed files of known row counts, confirm the table count equals the sum, the load history lists each file, and rerunning the same statement loads zero rows.",
    dep: ["stages","file-format-handling","load-ledger","micro-partitions"]
  },
  "stages": {
    s: "Named locations for files that are loaded into or unloaded from the warehouse, either internal to the platform or pointing at external object storage with delegated credentials.",
    d: "A stage is an object with a URL, credentials or an assumed identity, optional encryption settings and a default file format. Internal stages store files in platform-managed storage; external stages point at customer buckets. Listing, loading and unloading all go through the stage, and access to it is governed by the same grants as tables. Storage integrations avoid embedding secrets. The difficulty is the boundary with other systems: object stores list slowly at scale, event notifications can be lost, and cross-account permissions are easy to get slightly wrong.",
    k: ["External stage in the customer bucket vs internal managed stage: external avoids copying and keeps the data in place; internal is simpler to secure and has no cross-account setup.", "Embedded keys vs delegated role assumption: delegation avoids long-lived secrets in metadata; it requires trust setup on the storage side."],
    p: ["A listing of a prefix with millions of files takes minutes and makes every load start slowly.", "Overly broad bucket permissions let any user with stage access read unrelated data in the same bucket."],
    v: "Create an external stage with a delegated role, list its files, load one, and confirm that a user without a stage grant cannot list it and that no secret appears in the object definition.",
    dep: ["object-store-layer","role-hierarchy"]
  },
  "file-format-handling": {
    s: "Parsing source files of varied formats into typed columns, handling delimiters, quoting, nested documents, columnar inputs, encodings, compression and schema drift.",
    d: "A file format definition specifies parser, delimiter, quoting, null markers, date formats, encoding and compression. Delimited files are parsed row by row and split by byte range when possible. Self-describing columnar files carry a schema and can be matched by column name. Nested documents go into a flexible column. Schema detection samples files to propose a table definition, and schema evolution adds new columns on load. The hard parts are dirty data, ambiguous types in text and the cost of parsing text compared with binary columnar input.",
    k: ["Load by position vs by name: position is simple and tolerates renamed headers; name tolerates reordered or added columns but fails on typos.", "Strict typing at load vs load as text and cast later: strict catches problems early; text-first never loses rows but pushes cleaning into later transformations."],
    p: ["Embedded newlines in quoted fields defeat naive splitting and corrupt rows at split boundaries.", "A date format ambiguous between day-first and month-first loads silently with swapped values."],
    v: "Load a file with quoted newlines, empty strings and a malformed row, and confirm the table holds the expected rows, empty-versus-null follows the format rule, and the bad row appears in the validation output.",
    dep: ["stages","columnar-format"]
  },
  "continuous-ingestion": {
    s: "Automatically loading files as they arrive in a stage, driven by storage event notifications and serverless compute, so tables stay minutes behind the source.",
    d: "The storage layer emits an event when a file lands. A pipe object receives it into a queue, batches files over a short interval and runs the same copy logic on serverless workers. Load history guards against duplicates. Latency is typically a minute or more because of batching and notification delay. The hard parts are missed or duplicated notifications, which need a periodic reconciliation scan, and cost: per-file overhead makes ingesting millions of small files expensive.",
    k: ["Event-driven ingestion vs scheduled batch loads: event-driven keeps data fresh without a schedule; batch gives more predictable cost and larger files.", "Serverless ingestion compute vs a user-sized cluster: serverless scales with arrivals and needs no idle time; per-file overhead is billed on every small file."],
    p: ["Notifications dropped by the queue leave files unloaded until someone notices a gap in the data.", "Producers writing thousands of tiny files per minute make ingestion cost exceed the storage cost."],
    v: "Drop ten files into the stage at intervals, confirm each is loaded within the target latency, the pipe status shows no backlog, and a file whose notification is suppressed is still picked up by the reconciliation scan.",
    dep: ["stages","bulk-load","serverless-compute","load-ledger"]
  },
  "streaming-ingest": {
    s: "A low-latency write path that accepts rows over an API from applications or stream consumers and makes them queryable in seconds, without staging files first.",
    d: "A client opens a channel to a table and sends batches of rows with an offset token. The service buffers rows, writes them to small files and registers them in metadata after a short flush interval; background compaction merges them later. The offset token lets clients resume after failures and detect gaps. Rows become visible within seconds but not instantly. The difficulty is small-file accumulation, ordering across channels and exactly-once semantics when a client crashes between sending and recording its offset.",
    k: ["Direct row API vs write files and load: the API reaches seconds of latency without file handling; it is limited per channel and bills per volume of rows.", "Many channels per table vs few: many raises throughput and parallelism; it multiplies small files and compaction work."],
    p: ["A client that does not persist the committed offset replays rows after a restart and duplicates them.", "Constant tiny flushes produce so many small partitions that reads slow down until compaction catches up."],
    v: "Stream a thousand numbered rows, kill the client midway, resume from the stored offset, and confirm the table holds each number exactly once and the rows were queryable within the target seconds.",
    dep: ["micro-partitions","load-ledger","transaction-manager"]
  },
  "load-ledger": {
    s: "The metadata record of which files were loaded into which table, with checksums and timestamps, used to skip duplicates and to answer what arrived when.",
    d: "For each table the metadata store keeps entries for loaded file names, sizes, content tags, load time, row counts and errors, for a retention period such as two weeks, and relies on file hashes for longer. A copy statement consults it so a file is loaded once. Operators query it to trace data lineage and diagnose gaps. The hard part is its bounded memory: once an entry expires, a re-sent old file loads again, so the guarantee is time-limited, and a renamed or modified file with the same name creates ambiguity.",
    k: ["Track by file name and tag vs by content hash: names are cheap and match how producers work; hashes catch renamed duplicates at the cost of reading the file.", "Time-limited history vs unlimited: limited keeps metadata small and fast; it permits re-loading old files after expiry."],
    p: ["A producer overwrites a file with corrected content under the same name and the correction is never loaded.", "Replaying a month-old backlog after expiry loads everything again and doubles the table."],
    v: "Load a file, load it again, and confirm zero rows are added and history shows the skip; then force a reload and confirm duplicates appear, proving the ledger is what prevented them.",
    dep: ["metadata-store"]
  },
  "authentication-sso": {
    s: "Verifying who is connecting: passwords with multifactor, key pairs, tokens from an identity provider, federated sign-on, and automatic user provisioning.",
    d: "Interactive users sign in through federated single sign-on with multifactor; programs use key-pair or token-based authentication, since passwords do not suit automation. The services layer validates assertions, maps them to a user object and issues a session token. Provisioning protocols create and disable users when the directory changes. Network policies add an allowlist of addresses. The difficulty is lifecycle: service accounts accumulate, keys are never rotated and a departed employee's access depends on timely deprovisioning.",
    k: ["Federated identity vs local accounts: federation centralizes lifecycle and multifactor; it makes the warehouse unreachable if the identity provider is down.", "Key-pair for programs vs short-lived tokens: key-pair is simple and offline; short-lived tokens limit exposure but require a token service."],
    p: ["Long-lived service keys are stored in a repository and persist after the engineer who created them leaves.", "Local accounts left over from setup bypass multifactor and the identity provider's policies."],
    v: "Sign in through single sign-on, then disable the user in the directory and confirm new sessions are rejected within the provisioning interval; also confirm a connection from a disallowed address is refused.",
    dep: ["services-layer"]
  },
  "role-hierarchy": {
    s: "Privileges are granted to roles, roles are granted to other roles and users, and a session acts under an active role, giving least-privilege access that composes.",
    d: "Objects have owners and grants of privileges such as select, insert and usage on containers. Roles inherit from other roles, forming a hierarchy from narrow functional roles up to administrators. A session activates one primary role and possibly secondary ones. Future grants apply automatically to new objects in a schema. Checks occur at plan time against the active roles. The hard part is sprawl: hundreds of roles with overlapping inheritance make it hard to answer who can see this table, and elevated roles tend to be used for everything.",
    k: ["Role-based vs direct user grants: roles make permissions reviewable and reusable; they add an indirection that must be maintained as teams change.", "Separation of functional and access roles: access roles bind to data, functional roles bind to jobs; it avoids duplication but needs a naming and ownership discipline."],
    p: ["Everyone works under an administrator role because the proper role is missing a grant, and the audit trail loses meaning.", "A role granted to public by accident exposes a schema to every user."],
    v: "As a user with only a reader role, attempt select and insert on a table; confirm select succeeds, insert fails with a privilege error, and the effective-grants view lists the path through which select is allowed.",
    dep: ["metadata-store","catalog-namespaces"]
  },
  "row-access-policies": {
    s: "A predicate attached to a table that is evaluated per row for each query, so different roles see different subsets of the same table.",
    d: "A policy is a boolean expression over the row's columns and the session context, such as the current role or a mapping table lookup. The planner adds it as a filter to every scan of the table, including through views, so the user cannot bypass it. Policies are defined once and attached to many tables. Because the predicate runs on every query, its cost matters, and a lookup against a mapping table becomes a join in every plan. Pruning can still work if the predicate is on a clustered column; otherwise scans grow.",
    k: ["Policy on the table vs filtering in views: table policies cannot be bypassed by querying the base table; view filters are simpler but leak if grants on the base table are too broad.", "Mapping-table lookup vs hard-coded roles: mapping tables scale to many entitlements and change without a redeploy; they add a join and a table to secure."],
    p: ["A policy that leaks through error messages or timing lets users infer rows they cannot see.", "A mapping table that grows large makes every query on a secured table slow."],
    v: "Query the same table as two roles with different entitlements, confirm each sees only their rows, a count over the table differs per role, and the query profile shows the policy filter applied on the scan.",
    dep: ["role-hierarchy","parser-binder"]
  },
  "masking-policies": {
    s: "A function attached to a column that returns the real value, a partial value or a hash depending on who is asking, applied at query time without changing stored data.",
    d: "The policy is a conditional expression evaluated per value with access to the session role and other columns. It is applied where the column is read, including inside views and joins, so downstream objects inherit protection. Tag-based masking attaches the policy to every column carrying a tag such as email. Deterministic masking keeps joinability. Hard parts: masked values can still leak through aggregates or filters, a role allowed to see clear text defeats the mask, and masking cost adds to every scan of the column.",
    k: ["Dynamic masking at query time vs storing masked copies: dynamic keeps one source of truth and updates instantly; copies are faster to read and isolate but multiply storage and drift.", "Static redaction vs deterministic hashing: redaction reveals nothing; hashing keeps join keys usable and allows frequency attacks."],
    p: ["A user filters on the masked column with guessed values and infers the real data from which rows come back.", "A new copy of a table via create-as-select loses the policy and exposes the raw column."],
    v: "Select a tagged email column as an analyst and as a privileged role, confirm the analyst sees masked values, the privileged role sees clear text, and a view over the table still masks for the analyst.",
    dep: ["role-hierarchy","classification-tags","parser-binder"]
  },
  "classification-tags": {
    s: "Labels on objects and columns, either assigned by people or inferred by scanning content, that mark sensitivity or ownership and drive policies and reports.",
    d: "Tags are key-value labels attached to databases, tables, columns and users. Automatic classification samples column values and names to propose semantic labels such as identifier or contact detail, which stewards review. Tags can propagate through lineage to derived columns. Policies then bind to tags rather than to individual columns, so a new column carrying a label is protected from the first query. The difficulty is coverage: unclassified columns have no protection, and sampling misses sensitive values in sparse or free-text columns.",
    k: ["Tag-driven policies vs per-column policies: tag-driven scales to thousands of columns and covers new ones; it makes protection depend on tagging quality.", "Automatic classification vs manual stewardship: automatic is fast and broad; it produces false positives and misses, so a human review step remains necessary."],
    p: ["A derived table copies a sensitive column under a new name and no tag propagates to it.", "Free-text columns containing personal data are labeled as non-sensitive because the sample was clean."],
    v: "Add a column named like an email with sample addresses, run classification, confirm it is suggested, apply the tag and confirm the tag-bound masking policy takes effect on the next query without further changes.",
    dep: ["metadata-store","column-statistics"]
  },
  "access-history": {
    s: "A record of which users ran which queries and which base columns each query actually read, including through views, for audit, lineage and cleanup of unused data.",
    d: "At query completion the services layer logs the statement, user, role, cluster, timing and the set of objects and columns accessed, resolved down to base tables even when the user queried a view. These records land in queryable system views, usually with a delay of minutes to hours and a retention of a year or so. Auditors use them to answer who read personal data; teams use them to find unused tables. The hard part is volume and fidelity: logging every access is large, and shared service accounts hide the real user.",
    k: ["Column-level access logging vs statement text only: column-level answers who saw what; it costs more to resolve and store than the text.", "Delayed system views vs real-time event stream: views are simple to query; alerting on suspicious reads needs the stream and extra plumbing."],
    p: ["A shared service account runs every dashboard query, so the audit shows one user for thousands of people.", "History is retained for a shorter period than the audit window, so evidence is gone when needed."],
    v: "Query a masked column through a view as a named user, then look in the access history and confirm a record exists for that user naming the base table and column, within the documented delay.",
    dep: ["metadata-store","parser-binder"]
  },
});
