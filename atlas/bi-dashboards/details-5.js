// Details for the BI & dashboard plate, part 5: caching and acceleration, data source connections, application platform.
ATLAS.details("bi-dashboards", {
  "result-cache": {
    s: "A store of recent query results keyed by the query and the viewer's permissions, serving repeated requests without touching the source.",
    d: "After a query completes, its rows are stored in memory, a fast store or local disk with a time to live. The next identical request, from the same or an equivalent user, returns the stored rows. With many viewers on the same dashboards, hit rates are high. Entries carry the time they were computed so the interface can show freshness. Size limits, eviction and compression matter, since a few huge results can push out thousands of small ones.",
    k: ["Cache by default with short expiry vs opt-in per dataset: default caching saves most load and risks surprising staleness, while opt-in is predictable and leaves most queries uncached.", "In-process memory vs shared store: in-process is fast and not shared across servers, while a shared store raises hit rates and adds a network hop."],
    p: ["A result computed for a privileged user is served to a restricted one because the key ignored permissions.", "A cached error or empty result is stored and served for the full time to live."],
    v: "Open the same dashboard as two users with identical permissions, then as a third with different row rules. The second request is a hit with no source query, the third is a miss, and each tile shows its computed-at time.",
    dep: ["cache-key-derivation", "cache-invalidation", "freshness-vs-cost"]
  },
  "cache-key-derivation": {
    s: "Building the key under which a result is stored from the normalized query, parameters, source, and every factor that changes what rows a viewer would get.",
    d: "Two requests may share a result only if they would return the same rows. The key therefore combines the logical request in a canonical form, the data source and version, bound parameter values, the time zone, and the user's row-level and masking attributes, hashed into a compact string. A key that is too specific wastes the cache; one that omits a factor leaks data or returns wrong numbers. Relative dates such as today must be resolved before hashing.",
    k: ["Key from the logical request vs from the SQL text: logical keys survive compiler changes and match equivalent requests, while SQL keys are simple and miss near-duplicates.", "Include user identity vs include permission attributes: identity is safe and shares nothing, while attributes share results among equivalent users and require an exact list of the factors."],
    p: ["Relative dates are hashed as text, so the key for last 7 days is the same on every day and serves old data.", "A new row-level attribute is not added to the key, and users with different values share results."],
    v: "Request the same chart with a permutation of the same filters, a different time zone, a different row-level attribute and a relative date on two successive days. Only the permutation hits the cache, and the others produce distinct keys.",
    dep: ["query-planner-ir", "row-level-security", "filter-and-parameter-binding"]
  },
  "cache-invalidation": {
    s: "Deciding when stored results are stale: by time, by a data-load event, by an explicit purge or by a change in the definitions they were computed from.",
    d: "The simplest rule is time to live. Better tools also invalidate on signals: a pipeline finishing a load can call an API to purge related entries, or the tool can poll a table's last-modified marker or a version column. Changes to a metric definition or a permission rule must also remove entries computed under the old rule. Pure expiry is easy to reason about; event-driven refresh is fresher and fails silently if an event is missed, so a maximum age should remain as a backstop.",
    k: ["Time to live only vs event-driven plus a backstop: time-only is simple with bounded staleness, while events give fresh data after loads and need reliable signaling and a fallback.", "Purge on change vs let entries expire: purging avoids wrong answers and spikes load after each purge, while expiry is smooth and serves outdated numbers longer."],
    p: ["A metric definition is changed and dashboards continue to serve results computed with the old formula for hours.", "A purge after a nightly load empties the cache at once and every morning's first viewers hit the source together."],
    v: "Load new rows into a source table, signal the load, and request the dashboard. It shows the new numbers immediately with a fresh timestamp. Then change a metric definition and confirm older cached values for that metric are not returned.",
    dep: ["result-cache", "metric-definitions", "application-api", "freshness-vs-cost"]
  },
  "extracts-and-materialization": {
    s: "Local copies of source data, held in the tool's own fast engine or a staging table and refreshed on a schedule, so queries do not depend on the original source.",
    d: "An extract pulls selected tables or queries into an optimized columnar store inside or next to the tool. Dashboards query the copy, which is fast and independent of source availability. Refreshes can be full or incremental, based on a modified-time column or key. The cost is staleness, storage and a job to monitor. Extracts also change the security story: the copy holds data outside the source's controls, so permissions must be re-applied against it.",
    k: ["Extract vs live connection: extracts are fast and shield the source, while live connections are always current and need a capable source.", "Incremental refresh vs full rebuild: incremental is cheap and misses updates and deletes of old rows, while full rebuilds are correct and expensive."],
    p: ["Incremental refresh keyed on a modified time never sees deleted rows, and the extract drifts from the source.", "An extract of a sensitive table is stored without row-level rules and is readable through the extract path."],
    v: "Update and delete rows in the source, run an incremental refresh and compare row counts and a checksum with the source. The refresh reports exactly how many rows changed, and deleted rows are gone or flagged.",
    dep: ["driver-adapters", "job-queue-and-workers", "freshness-vs-cost", "data-permissions"]
  },
  "aggregate-awareness": {
    s: "Automatically rewriting a query to read a smaller precomputed summary table when one can answer it, instead of the detailed table.",
    d: "The model lists aggregate tables with their grain and measures. The planner checks whether all requested measures and dimensions are available at that grain (or coarser by additive roll-up) and whether filters only use dimensions present in the summary. If so it queries the aggregate, cutting scan size by orders of magnitude. The decision must be correct: using an aggregate that lacks a needed filter or has stale data gives wrong numbers invisibly.",
    k: ["Automatic rewrite vs explicit selection: automatic is transparent to authors and hard to debug, while explicit selection is predictable and requires authors to know the tables.", "Rewrite only when fresh enough vs always when applicable: freshness checks protect accuracy and reduce hits, while always rewriting maximizes speed and can serve outdated numbers."],
    p: ["A summary built daily is used for a today filter, and shows zero.", "Summary and detail tables diverge after a late correction, and the same chart differs by filter."],
    v: "Request a metric by month on a table with a daily aggregate. The query reads the aggregate table (visible in the plan), the result matches the detail query, and adding a filter on a field missing from the aggregate falls back to the detail table.",
    dep: ["pre-aggregation-builder", "query-planner-ir", "aggregation-semantics"]
  },
  "pre-aggregation-builder": {
    s: "The job that creates and refreshes summary tables chosen from observed query patterns or declared by authors, in the source or a dedicated store.",
    d: "Definitions say which measures and dimensions to roll up and at what grain and refresh policy. Some tools recommend them by analyzing the query log for common groupings. Builds run as background jobs, usually partition by partition so only recent data is recomputed. Each build needs a storage destination, which should be the source warehouse where possible. Costs include storage, build compute and operational drift as the model evolves.",
    k: ["Declared pre-aggregations vs recommended from usage: declared ones are deliberate and manual, while recommendations adapt to usage and may chase transient patterns.", "Build in the source vs in a separate store: building in the source avoids copying data, while a separate store protects the source and adds a system to run."],
    p: ["Dozens of rarely used summaries are never removed and keep refreshing at real cost.", "A model change leaves summaries built from the old definition, and they continue to serve."],
    v: "Declare a daily rollup, run the build, then update the last day in the source and refresh. Only the latest partition is rebuilt, the summary matches a direct query, and an unused summary shows zero reads in the usage report.",
    dep: ["job-queue-and-workers", "metric-definitions", "driver-adapters", "usage-analytics"]
  },
  "query-coalescing": {
    s: "Merging identical in-flight requests so that when many people ask for the same result at once, one source query runs and all of them share its answer.",
    d: "The server keeps a table of running queries by cache key. A new request with a key already running waits for that execution instead of starting its own. This prevents the stampede that occurs when a cache entry expires under load or a popular dashboard opens at the start of the workday. Cancelling needs reference counting: the query stops only when all waiting viewers have gone. Coalescing works across users only if their cache keys are equal.",
    k: ["Wait for the running query vs start an independent one: waiting saves source work, while independent queries isolate slow runs and multiply load.", "Serve stale while refreshing vs block until fresh: serving stale keeps pages fast and shows old numbers briefly, while blocking shows current numbers and makes everyone wait."],
    p: ["The first requester navigates away, the query is cancelled, and all waiters get an error.", "A failed shared query returns the same error to everyone for the full coalescing window."],
    v: "Fire fifty identical requests simultaneously on a cold cache. The source query log shows one execution, all fifty callers receive the same rows, and cancelling the first caller does not interrupt the others.",
    dep: ["cache-key-derivation", "query-cancellation", "async-query-queue"]
  },
  "async-query-queue": {
    s: "A queue that accepts queries, runs them with bounded concurrency and priorities, and lets clients poll or be notified, so slow work never ties up web requests.",
    d: "Requests are placed in a queue with a priority (interactive above scheduled above exports), a deadline and the identity to run as. Workers pull jobs subject to per-source and per-user concurrency limits, so a heavy source is never saturated. Clients get a job handle and poll or subscribe for completion. Results are stored briefly for download. Queue depth and wait time are monitoring signals, and when overloaded, shedding low-priority work protects interactive use.",
    k: ["Priority queues vs first-in first-out: priorities protect interactive work and can starve exports, while FIFO is fair and lets a huge export block a dashboard.", "Per-source concurrency caps vs global caps: per-source caps respect what each database can take, while global caps are simple and either waste or overload."],
    p: ["A big batch of scheduled reports fills the queue, and interactive dashboards wait minutes.", "Results held for later download are never cleaned up and exhaust disk."],
    v: "Submit a hundred scheduled queries and one interactive query to a single source. The interactive query starts within its target time, the source never exceeds its concurrency cap, and queue depth and wait times are visible in monitoring.",
    dep: ["job-queue-and-workers", "connection-pooling", "query-limits-and-cost-guard"]
  },

  "connection-registry": {
    s: "The catalog of configured data sources: type, address, database, options, who may use it, and its health, with each query referring to a connection by name.",
    d: "An administrator adds a source by choosing its type and entering host, port, database and options, then testing it. The registry stores these, ties secrets to the credential store, records ownership and permissions, and tracks status. Everything else, from the explorer to schedules, refers to connections by id, so a change of host happens in one place. Environment mapping allows the same name to point at different hosts in development and production.",
    k: ["Central admin-managed connections vs user-created ones: central connections are controlled and slow to get, while user-created ones are fast and spread credentials and unmanaged sources.", "One connection per source vs per use: one connection is easy to manage and shares limits, while several allow separate quotas and credentials for dashboards and exports."],
    p: ["A source host changes and dozens of copied connection definitions still point to the old one.", "A connection tested once is never rechecked, and its failure is found by users."],
    v: "Add a connection, run the test, then stop the source. Health status turns unhealthy within the check interval with a readable cause, dependent dashboards show a clear connection error, and recovery returns them to normal without edits.",
    dep: ["credential-storage", "driver-adapters", "metadata-store"]
  },
  "driver-adapters": {
    s: "The per-source-type modules that speak a source's protocol, map its types to the tool's types and report its capabilities.",
    d: "An adapter implements connecting, running a query with cancellation, streaming rows, listing schemas and mapping types such as decimals, timestamps with zones and arrays. It also declares capabilities: window functions, approximate counting, supported date functions and limits. The SQL compiler reads these to choose what to push. A good adapter converts errors into understandable messages. Adapters are numerous and each has quirks, so this is where much of a BI tool's maintenance effort lives.",
    k: ["Standard database connectivity layer vs native protocol drivers: a standard layer covers many sources with lowest-common-denominator behavior, while native drivers are faster and richer and need one per source.", "Adapters as plugins vs built in: plugins allow community support and varied quality, while built-ins are tested together and release more slowly."],
    p: ["A decimal type is mapped to a floating-point number, and large amounts lose cents.", "Timestamps with zones are returned as local times, and data shifts by hours for some users."],
    v: "Query a table containing high-precision decimals, timestamps with zones, nulls and very long text through the adapter. Values arrive without precision loss, timestamps preserve their instants, and the capability list matches what the source actually supports.",
    dep: ["connection-registry", "connection-pooling", "query-cancellation"]
  },
  "credential-storage": {
    s: "Encrypted storage of passwords, keys and tokens used to reach data sources and delivery gateways, with controlled access and rotation.",
    d: "Secrets are encrypted with a key held outside the metadata database, or stored in an external secret manager and fetched on use. They are never returned to the browser after entry, and are redacted from logs. Rotation changes a secret without redefining connections. Per-user credentials for impersonation add volume. The key hierarchy matters: a backup of the database must not be enough to read the secrets, and permission to edit a connection should not imply permission to read its password.",
    k: ["Encrypted in the application database vs external secret manager: the database is easy to set up and keeps key and data close, while an external manager separates duties and adds a dependency.", "Static passwords vs short-lived tokens: tokens limit damage when leaked and need an issuance mechanism the source supports."],
    p: ["Connection test errors echo the password in logs.", "A database backup with the encryption key stored beside it exposes every source credential."],
    v: "Create a connection, then fetch it through the API and inspect logs and a backup. The secret never appears in responses, logs or the exported configuration, and after rotation queries succeed with the new credential and fail with the old.",
    dep: ["metadata-store", "configuration-and-feature-flags"]
  },
  "connection-pooling": {
    s: "Reusing a limited set of open connections to each source across queries, with bounds, timeouts and health checks, so the tool never overwhelms the source.",
    d: "Opening a connection to a database is slow and sources limit how many can exist. Pools keep warm connections, hand them to queries, test them before reuse and recycle idle ones. Sizes are set per source and sometimes per identity when impersonation is used. Queries that never return and connections dropped silently by firewalls are the usual failures. Separate pools for interactive and background work stop long jobs from blocking dashboards.",
    k: ["Large pool vs small pool: larger pools give parallelism and can exhaust the source's connection limit, while small pools protect the source and queue work.", "One pool shared by all users vs per identity: shared pools are efficient, while per-identity pools keep permissions clean and multiply idle connections."],
    p: ["A firewall silently drops idle connections, and the next queries fail with a reset error.", "Every web server has its own pool of fifty, and together they exceed the source's limit."],
    v: "Run a load test above the pool size and kill idle connections at the network layer. Concurrent queries never exceed the configured cap at the source, the excess waits and is reported, and dropped connections are replaced without failing user requests.",
    dep: ["driver-adapters", "connection-registry", "query-impersonation"]
  },
  "schema-sync": {
    s: "Reading and refreshing the structure of each source, its tables, columns, types and keys, so authors see current fields and the model can detect drift.",
    d: "A sync job queries the source's catalog on a schedule or on demand, stores a snapshot and computes the difference from the last one. Added columns appear for authors, and removed or retyped columns raise warnings on the fields and dashboards that depend on them. Filters decide which schemas to scan, since large warehouses hold thousands of tables. Sync also collects statistics for profiling. The hard part is large catalogs and permissions: the sync account sees more than users should.",
    k: ["Scan on schedule vs on demand: scheduled keeps the catalog current at a steady cost, while on demand is cheap and finds changes only when someone looks.", "Sync everything vs only selected schemas: everything is convenient and slow with clutter, while selection is fast and requires curation."],
    p: ["A column is dropped and queries break before the next sync notices.", "The sync account sees restricted tables, and their names appear in the author's field picker."],
    v: "Add a column and drop another in a test table, run a sync, and open the explorer. The new column is available, the dropped one is flagged on dependent fields and dashboards, and a restricted table remains hidden from users without access.",
    dep: ["driver-adapters", "connection-registry", "dependency-and-impact-tracking"]
  },
  "query-cancellation": {
    s: "Stopping a running query at the source when a user leaves, a timeout expires or a guard trips, instead of only abandoning the client side.",
    d: "Each running query is tracked with its source session or process id. Cancellation sends a cancel command through a separate connection or a protocol message, then verifies the query stopped and the connection can be reused. Sources differ: some cancel instantly, some only when the next row is produced, and some cannot be cancelled. Without reliable cancellation, abandoned filter changes leave dozens of expensive queries running to completion.",
    k: ["Cancel at the source vs drop the client connection: source cancel frees resources and needs protocol support, while dropping the connection is universal and may leave the query running.", "Cancel on navigation away vs let run into the cache: cancelling saves resources, while letting it finish helps a user who returns."],
    p: ["A cancel request goes to the wrong session after a pooled connection is reassigned.", "The source ignores the cancel, and the query runs for an hour holding a pool slot."],
    v: "Start a long query on each supported source type, cancel it from the page, and inspect the source's running-query list. The query disappears within seconds on each, and the pooled connection is reused successfully afterward.",
    dep: ["driver-adapters", "connection-pooling"]
  },
  "private-network-access": {
    s: "Reaching sources that are not exposed to the internet, through tunnels, private links, agents inside the customer network or allow-listed addresses.",
    d: "Many sources sit in private networks. Options include a secure tunnel over a bastion host, a cloud provider private link, a small agent running inside the network that dials out to the tool, or fixed outbound addresses that the customer allow-lists. Each has different latency, setup effort and failure modes. Encryption of traffic and verification of the source's certificate are required. The component must also prevent the tool being used as a gateway to scan internal addresses.",
    k: ["Inbound tunnel vs outbound agent: tunnels need firewall changes in the customer network, while agents only make outbound calls and add software to run and update.", "Fixed address allow-listing vs private links: allow-lists are simple and cross the public internet, while private links stay inside the provider network and are provider specific."],
    p: ["A user-created connection with an internal address is used to probe the tool's own network.", "A tunnel drops silently, and queries hang until the pool times out."],
    v: "Connect to a source reachable only through the tunnel, verify its certificate, and interrupt the tunnel. Queries work normally, a connection to a metadata-service address is rejected, and the interruption surfaces as a clear health error within the check interval.",
    dep: ["connection-registry", "credential-storage", "driver-adapters"]
  },
  "file-and-api-sources": {
    s: "Sources that are not databases: uploaded spreadsheets and delimited files, object storage files and web service responses, loaded into a queryable form.",
    d: "Uploaded files are parsed, typed and loaded into a small embedded engine or a staging table, then treated as ordinary tables. File sets in object storage can be scanned directly by a compatible query engine. Web service responses are fetched by a connector that handles pagination, authentication and rate limits, flattened into tables on a schedule. These sources are where inconsistent formats and ad hoc shadow data appear, so size limits, type inference and refresh behavior must be explicit.",
    k: ["Infer types vs require a schema: inference is quick and guesses wrong on edge values, while declared schemas are exact and slow to set up.", "Load a copy vs query in place: copies are fast and need refreshes, while in-place querying is current and depends on the engine's file format support."],
    p: ["A zip code column is inferred as a number and loses leading zeros.", "An uploaded file with personal data is shared across the tool with no owner or retention."],
    v: "Upload a file with leading-zero codes, mixed date formats and an empty column, then chart it. Types match the declared schema, bad rows are reported with line numbers, and re-upload replaces the table without breaking dashboards using it.",
    dep: ["extracts-and-materialization", "driver-adapters", "data-profiling-preview"]
  },

  "application-api": {
    s: "The HTTP interface behind the user interface and external clients: authentication, content and query endpoints, pagination, rate limits and a stable versioned contract.",
    d: "Everything the web interface does goes through the same API that scripts, the embedding SDK and automation use. It authenticates each call, authorizes against content and data rules, and exposes resources for dashboards, questions, connections, users and runs. Long operations return job handles. Because customers script against it, backward compatibility and deprecation policy matter as much as features. Rate limits and request size limits protect the service.",
    k: ["Same API for the UI and the public vs a separate public API: sharing means complete coverage and exposes internal churn, while a separate API is stable and always lags the UI.", "Resource-style endpoints vs a query-style single endpoint: resources are simple to cache and secure, while a single endpoint reduces round trips and is harder to control."],
    p: ["A field is renamed in a minor release, and customer automation breaks.", "A list endpoint without pagination times out on large installations."],
    v: "Run a contract test suite from the previous release against the current one. Every documented endpoint returns the same shape, unauthorized calls are refused with distinct codes, and a paginated list of ten thousand items is returned in pages.",
    dep: ["authentication-and-sso", "content-permissions", "metadata-store"]
  },
  "metadata-store": {
    s: "The tool's own transactional database holding dashboards, questions, models, users, permissions, schedules and run history, separate from the data it analyzes.",
    d: "It stores every definition and its versions, relationships between objects, settings, and operational records such as schedule runs. It is read on almost every request, so queries must be indexed and cached, and it is written in small bursts by authors. It must support schema migration across releases without downtime, backup and restore, and sometimes multiple installations. It is a single point of failure for the tool, though not for the underlying data.",
    k: ["Embedded single-file database vs separate server database: embedded is trivial for small installs and cannot scale or fail over, while a server database supports concurrency and high availability.", "Normalized relational model vs documents for definitions: relational supports queries over dependencies, while documents are flexible and make impact analysis harder."],
    p: ["Run history grows without limits and slows every page that reads settings.", "A migration locks a large table and the tool is unavailable during upgrade."],
    v: "Upgrade a copy of a production-sized metadata database to the next release while users are active. The migration finishes inside the stated window, page latency stays within target, and a restore from the pre-upgrade backup brings back all content.",
    dep: ["backup-and-migration"]
  },
  "job-queue-and-workers": {
    s: "Background execution for scheduled reports, extract refreshes, alert checks and exports, with retries, concurrency limits and visibility of each run.",
    d: "Jobs are put on a durable queue and picked up by worker processes that can be scaled separately from the web servers. Each job has a type, priority, attempts and a timeout, and its status is stored for the run history. Workers are isolated by kind so that a flood of exports cannot starve alert checks. Idempotency matters: a retried job must not deliver a report twice or double-apply an incremental refresh. Rendering workers need much more memory than others.",
    k: ["Database-backed queue vs dedicated message broker: a database queue is simple and limited in throughput, while a broker scales and adds an operational dependency.", "Retry automatically vs fail and notify: retries cover transient errors and can repeat harm or cost, while notifying is safe and needs a human."],
    p: ["A worker crashes mid-job, the job is retried, and a recipient receives the report twice.", "Rendering jobs on the same pool as alert checks cause alert checks to be delayed by minutes."],
    v: "Kill a worker during each job type and watch recovery. The job is reassigned within its visibility timeout, completes once with no duplicate delivery, and the run history shows both attempts with timing.",
    dep: ["metadata-store", "observability-and-health"]
  },
  "tenant-isolation": {
    s: "The mechanisms that keep one tenant's content, data access, caches, schedules and compute use separate from another's inside a shared installation.",
    d: "Isolation operates at several layers: a tenant identifier on every metadata row and enforced in every query to the metadata store, tenant-scoped connections and credentials, cache keys that include the tenant, separate queues or quotas for background work, and separate encryption keys for secrets where required. Testing is the difficulty, because a missing filter on one endpoint is a leak, so automated tests must try cross-tenant access on every route.",
    k: ["Row-level tenant filter in one database vs a database per tenant: one database is efficient and a single bug can expose everything, while per-tenant databases isolate strongly and make migrations and operations multiply.", "Quotas per tenant vs fair scheduling only: quotas bound the worst case and need tuning, while fairness is automatic and permits bursts."],
    p: ["A new endpoint forgets the tenant filter, and its list call returns other tenants' dashboards.", "One tenant's heavy schedules consume all workers, and others' reports arrive late."],
    v: "Run an automated cross-tenant test: with a token from tenant A, request every API route using tenant B's ids and names. All return not found, and a load test from tenant A shows tenant B's latency unchanged.",
    dep: ["metadata-store", "cache-key-derivation", "job-queue-and-workers", "application-api"]
  },
  "observability-and-health": {
    s: "Metrics, logs and traces of the tool itself: query timings per source, queue depth, cache hit rate, render failures and error rates, with alerts for operators.",
    d: "Each query is traced from request through compilation, queue wait, source execution and rendering, so a slow dashboard can be attributed to the source, the queue or the browser. Health checks cover the metadata store, workers, connections and delivery gateways. Dashboards of the tool's own health and alerts for failing schedules let operators notice before users do. Careful redaction is needed since query text and filters can contain personal data.",
    k: ["Detailed per-query traces vs aggregated counters: traces explain individual slow pages and cost storage and privacy risk, while counters are cheap and cannot show why.", "Synthetic checks vs real-user metrics: synthetic checks find outages when nobody is using the tool, while real-user metrics show actual experience and need traffic."],
    p: ["Logs record raw filter values containing personal data and are shipped to a third-party system.", "Average load time looks healthy while the slowest tenth of dashboards take over a minute."],
    v: "Introduce a slow source and a failing delivery gateway. Traces show where each delay occurs, health checks report both within a minute, and alerts reach the operator with the affected dashboards and schedules listed.",
    dep: ["job-queue-and-workers", "metadata-store", "query-limits-and-cost-guard"]
  },
  "configuration-and-feature-flags": {
    s: "Settings and switches that control behavior per installation, tenant and user: limits, defaults, enabled features and gradual rollouts, with defined precedence.",
    d: "Settings come from environment variables and files at startup, from an administrator interface stored in the metadata database, and per tenant overrides. Feature flags enable new capabilities for a subset before everyone. Precedence and change history need to be clear, and sensitive settings must be handled with the secret store. The risk is combinatorial: every flag doubles the states to test, and old flags that are never removed make behavior unpredictable.",
    k: ["Static configuration vs runtime-changeable: static is predictable and requires restarts, while runtime changes apply instantly and can be changed wrongly in production.", "Per-tenant overrides vs one global value: overrides fit customer needs and multiply support cases, while a global value is simple and does not serve all."],
    p: ["A flag turned on for testing is left on, and its behavior becomes undocumented dependency.", "A per-tenant row limit override survives an upgrade that changed its meaning."],
    v: "Change a limit for one tenant at runtime. The change applies within seconds for that tenant only, is recorded with who changed it and the previous value, and reverting restores the earlier behavior without restart.",
    dep: ["metadata-store", "credential-storage"]
  },
  "backup-and-migration": {
    s: "Backing up the tool's own database and secrets, restoring them, and moving content between installations or upgrading across versions without losing definitions.",
    d: "Backups cover the metadata store, uploaded files, stored extracts that cannot be rebuilt, and the key material needed to decrypt secrets, kept separately. Restore procedures are rehearsed, since an untested backup is a hope. Migration between installations uses export and import of definitions with id remapping. Version upgrades run schema migrations and may need to rebuild derived stores such as dependency graphs and caches. Content is small, while the real risk is that restoring one without the other produces broken references.",
    k: ["Whole database backup vs content export: database backups restore everything exactly, while content export moves between versions and loses history and run records.", "Rebuild derived data vs back it up: rebuilding keeps backups small and slows recovery, while backing up speeds recovery and stores copies that may be stale."],
    p: ["The backup contains encrypted secrets but not the key, so no connection works after restore.", "Restore is never tested, and the first attempt reveals a missing component during an incident."],
    v: "Restore a backup into an empty environment and run a checklist. All dashboards open, connections test successfully with restored secrets, schedules resume without duplicate deliveries, and the elapsed time is within the stated recovery objective.",
    dep: ["metadata-store", "credential-storage"]
  },
});
