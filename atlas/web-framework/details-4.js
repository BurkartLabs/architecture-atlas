// Details for the web framework plate, part 4: data access, core runtime, cross-cutting concerns.
ATLAS.details("web-framework", {
  "model-layer": {
    s: "Maps database rows to application objects, tracking changes and generating the statements that save them, using either an active-record or a data-mapper design.",
    d: "A model class corresponds to a table: attributes become columns, instances become rows, and a unit of work or per-object dirty tracking decides which statements to issue on save. Active-record objects save themselves and mix persistence with domain logic; data-mapper designs keep plain objects separate from a mapper that persists them. The layer handles type conversion, defaults, identity of loaded objects and enumerations. The difficulty is the mismatch between objects and relations: hidden queries, partially loaded objects and bulk operations that bypass object logic.",
    k: ["Active record vs data mapper: active record is fast to build with and has one class per table, while data mapper keeps domain objects independent but needs more mapping code.", "Mapping every column automatically vs declaring attributes: automatic mapping needs no code, but schema changes alter object behavior without a code change."],
    p: ["Loading whole objects to change one column, or loading thousands into memory, makes simple operations slow and memory-heavy.", "Bulk update or delete statements skip model validation and callbacks, so invariants enforced there are silently bypassed."],
    v: "Create, read, update and delete a record through the model while capturing statements. Confirm only changed columns appear in the update, and that a bulk update behaves as documented regarding callbacks.",
    dep: ["query-builder", "database-adapters", "model-callbacks", "transactions"]
  },
  "query-builder": {
    s: "A composable, programmatic way to build SQL with filters, joins, ordering, grouping and subqueries, binding all values as parameters rather than inserting them into text.",
    d: "Calls such as filter, join, order and limit return new query objects that accumulate clauses, and the final object compiles to dialect-specific SQL plus bound values. The model layer builds on it for scopes, reusable named filters that compose. A raw-expression escape hatch handles what the builder cannot express. The difficulty is leaky abstraction: generated SQL can be inefficient, complex queries become unreadable in builder form, and dialect differences surface in less common features.",
    k: ["Builder expressions vs hand-written SQL strings: builders compose and bind safely, while raw SQL expresses anything and is easier to tune but harder to combine.", "Immutable query objects vs mutating ones: immutability prevents scopes affecting each other, at the cost of allocation per call."],
    p: ["A scope that adds a join duplicates rows when combined with another scope, breaking counts and pagination.", "Developers never look at the generated SQL, so a missing index or a full scan is found only in production."],
    v: "Compose a query from three scopes, print the SQL and bound values, and confirm the plan uses the intended indexes on a production-sized dataset. Pass hostile input and confirm it appears only as a bound value.",
    dep: ["database-adapters", "injection-protection"]
  },
  "relationship-loading": {
    s: "Declares associations between models, such as one-to-many and many-to-many, and controls whether related records load lazily on access or eagerly in batched queries.",
    d: "Associations are declared on models with keys and options for deletion behavior. Lazy loading issues a query on first access, simple but producing one query per parent in a loop, the N+1 problem. Eager loading fetches related records for all parents in a constant number of queries, via a second query or a join, and attaches them. Counts and aggregates can be preloaded. The difficulty is choosing: joins multiply rows, batch loads can be huge, and each pattern fails differently at scale.",
    k: ["Separate batched queries vs a single join: batched queries avoid row duplication, while a join gives one round trip and allows filtering on the related table.", "Lazy loading allowed by default vs forbidden: allowing it is convenient, but forbidding it turns N+1 queries into immediate, visible errors."],
    p: ["Looping over a list and touching an association in each iteration issues hundreds of queries.", "Eager loading everything defensively pulls large related sets into memory that the page never shows."],
    v: "Render a list of a hundred parents with their children and confirm the query count is a small constant, independent of list length, using the query diagnostics tool. Repeat with a thousand and confirm the count is unchanged.",
    dep: ["model-layer", "query-builder", "query-diagnostics"]
  },
  "model-callbacks": {
    s: "Hooks that run around saving, creating or deleting a model, used for defaults, derived values, normalization and side effects such as updating related records.",
    d: "The model layer calls registered methods before and after validation, save, create, update and delete, and after the transaction commits. They are used to normalize input, compute fields, maintain counters and trigger events. Their order is declared by position. Failing a before hook can halt the operation. The difficulty is hidden behavior: callbacks run on every write path, make tests slow, couple models to external services, and are bypassed by bulk operations, so invariants should not depend on them alone.",
    k: ["Callbacks for side effects vs explicit service calls: callbacks guarantee execution on every save, while explicit calls are visible and testable but can be forgotten.", "After-save vs after-commit hooks: after-save runs inside the transaction and can roll it back, while after-commit runs only for durable data but cannot undo."],
    p: ["A callback sends mail or enqueues a job inside the transaction, and the transaction rolls back after the message is sent.", "Chains of callbacks that update other models trigger each other recursively or in surprising orders."],
    v: "Save a model inside a transaction that rolls back and confirm no external side effect occurred, then commit one and confirm exactly one. Run a bulk update and confirm which callbacks did not run, as documented.",
    dep: ["model-layer", "event-dispatcher", "transactions"]
  },
  "migrations": {
    s: "Versioned, ordered scripts that change the database schema and data, tracked in a table so every environment can reach the same state from any earlier one.",
    d: "Each migration describes a change, such as adding a table, column or index, in a database-independent form or in SQL, and usually its reverse. A runner records applied versions and runs pending ones in order, inside a transaction where the database supports transactional schema changes. A schema file snapshots the result for fast setup. The difficulty is production: long locks on large tables, mixing schema and data changes, and deploying code and schema that must work together during rollout.",
    k: ["Reversible migrations vs forward-only: reversible ones allow rollback in development, but production rollbacks of data changes are rarely safe, so forward fixes are common.", "Schema changes before code vs after: expanding first and contracting later keeps old and new code working, but needs several deploys per change."],
    p: ["Adding a column with a default or an index on a large table locks it for minutes and stops the application.", "A migration that references the current model code breaks later when that model changes."],
    v: "Run all migrations from empty, then roll the last one back and forward again, and compare the final schema with the snapshot. Run the newest migration against a production-sized copy and measure lock time.",
    dep: ["database-adapters", "cli-and-console", "transactions"]
  },
  "transactions": {
    s: "Groups several statements into one atomic unit with a chosen isolation level, and provides nesting through savepoints and hooks that run after commit.",
    d: "A block opens a transaction on a connection, runs the enclosed statements and commits, or rolls back on an exception. Nested blocks either join the outer transaction or become savepoints. The framework tracks which objects were saved so that after-commit actions, such as enqueuing jobs, wait for durability. Isolation levels trade anomalies for contention. The difficulty is scope: transactions held open across network calls or user waits hold locks and connections, and concurrent transactions can deadlock or fail serialization and need retry.",
    k: ["Short transactions around data changes only vs wrapping the whole request: short ones minimize lock time, while whole-request wrapping gives simple atomicity but holds connections and locks.", "Default isolation with explicit locks vs stricter isolation: default is cheap and fits most code, while stricter levels catch more anomalies at the price of retries."],
    p: ["An HTTP call to another service inside a transaction holds locks and a connection for as long as that service is slow.", "Deadlocks from inconsistent row ordering surface as intermittent 500 errors with no retry."],
    v: "Make a block fail after its first of two writes and confirm neither persisted. Run two concurrent transactions that update the same rows in opposite order and confirm the loser is retried or reported clearly.",
    dep: ["connection-pooling", "database-adapters"]
  },
  "connection-pooling": {
    s: "Maintains a bounded set of open database connections shared by request handlers and workers, so each use borrows one and returns it instead of reconnecting.",
    d: "A pool holds up to a fixed number of connections per process. A request or job checks one out when it first queries and returns it at the end, and waits with a timeout if none is free. Health checks discard broken connections, and idle ones are closed. The total across all processes must stay under the database's connection limit, so external pooling proxies are common. The difficulty is arithmetic and leaks: workers times pool size exceeds limits, and a connection held by code that never returns it shrinks the pool until requests hang.",
    k: ["Pool per process vs an external pooling proxy: per-process pools are simple, while a proxy multiplexes many processes onto few connections but restricts session-level features.", "Pool size matched to worker threads vs larger: matching avoids waiting, while a smaller pool protects the database but can queue requests."],
    p: ["Threads, processes and workers across all servers together open more connections than the database allows, and new requests are refused.", "A long-running task checks out a connection and holds it while waiting on something else, starving other requests."],
    v: "Under load with more concurrent requests than the pool size, confirm requests wait within the checkout timeout instead of failing, and that the database's connection count never exceeds the configured total.",
    dep: ["database-adapters", "configuration", "application-bootstrap"]
  },
  "database-adapters": {
    s: "Drivers that speak each database's protocol and translate the framework's generic operations into that database's SQL dialect, types and features.",
    d: "An adapter opens connections, executes statements with bound parameters, reads results with type conversion and reports errors as framework exceptions with constraint details. It knows dialect differences: quoting, limit syntax, returning clauses, upsert forms, types and transactional DDL. Applications can target one database or many. The difficulty is portability: each database has features worth using and differences in semantics, such as case sensitivity, null ordering and isolation behavior, which an abstraction cannot hide.",
    k: ["Portable subset across databases vs exploiting one database's features: portability allows switching and testing elsewhere, while native features give performance and correctness the generic subset cannot.", "Test on the production database vs a lightweight substitute: the real database catches dialect and locking differences, while a substitute is faster and simpler."],
    p: ["Tests pass on a lightweight database and fail in production because of different type, collation or locking behavior.", "Driver-level timeouts are not set, so a stalled query holds a worker forever."],
    v: "Run the same test suite against the production database engine and confirm it passes, including constraint violations mapped to the framework's specific exceptions. Set a statement timeout and confirm a slow query is cancelled.",
    dep: []
  },
  "query-diagnostics": {
    s: "Logs and analyzes the statements an application issues, with timings and source locations, and flags repeated queries, slow queries and missing indexes.",
    d: "The adapter reports each statement with duration, bound values and a caller location to subscribers: the logger, the debug toolbar and test helpers. Tools count queries per request, detect the same statement repeated with different parameters as an N+1 pattern, and capture the plan of slow statements. Test assertions can cap the query count per request. The difficulty is volume and sensitivity: logging every statement is costly, and bound values often contain personal data.",
    k: ["Log all queries in development, only slow ones in production: full logs find N+1 patterns early, while slow-only logs keep volume and privacy exposure down.", "Query-count assertions in tests vs periodic review: assertions catch regressions immediately, but need maintenance when legitimate queries change."],
    p: ["Logging bound values writes passwords, tokens and personal data into log files.", "N+1 patterns are noticed only after data grows, because small development datasets make them fast."],
    v: "Load a list page in a test with a query budget and confirm the test fails when an eager load is removed. Trigger a slow query in staging and confirm it appears in the log with its duration and caller.",
    dep: ["database-adapters", "logging"]
  },
  "seed-data": {
    s: "Scripts that create the reference and demonstration records an application needs to run, such as roles, plans and sample content, safe to run repeatedly.",
    d: "Seeds populate lookup tables and baseline records in every environment, and can add sample data for development. They are written as idempotent operations that create or update by a natural key, so rerunning them changes nothing. Production reference data is better managed through migrations when it is part of the schema's meaning. The difficulty is drift: seeds written against old models break after refactors, and environment-specific data leaks into shared seeds.",
    k: ["Idempotent seeds vs one-time seeds: idempotent seeds can be rerun after every deploy, but must handle records that were edited since.", "Reference data in migrations vs in seeds: migrations version with the schema, while seeds are easier to edit but may not run in every environment."],
    p: ["Sample users with known passwords are created by a seed that also runs in production.", "A seed runs against a database that has changed, and duplicates reference records because it lacks a natural key."],
    v: "Run the seeds twice on an empty database and confirm identical row counts after each run. Run them in a production configuration and confirm no sample accounts or credentials are created.",
    dep: ["model-layer", "migrations", "environments"]
  },
  "concurrency-control": {
    s: "Prevents lost updates when several requests change the same record, using version columns for optimistic checks or row locks for pessimistic ones.",
    d: "With optimistic locking, each row carries a version or timestamp; an update succeeds only if the version is unchanged, otherwise the framework raises a conflict that the handler turns into a retry or a message to the user. With pessimistic locking, a select-for-update locks rows until the transaction ends. Atomic statements, such as incrementing a counter in the database, avoid read-modify-write races entirely. The difficulty is finding the races: they appear only under concurrency and are invisible in single-user testing.",
    k: ["Optimistic vs pessimistic locking: optimistic locking is cheap and scales when conflicts are rare, while pessimistic locking prevents conflicts but blocks other writers and risks deadlock.", "Database-side atomic updates vs application read-modify-write: atomic statements are race-free, but only fit simple operations."],
    p: ["Two users edit the same record from stale forms and the last save silently overwrites the first.", "Read-modify-write on a counter or balance loses updates under load."],
    v: "Submit two simultaneous updates to the same row from stale copies and confirm one succeeds and the other receives a conflict. Increment a counter from fifty concurrent requests and confirm the final value is fifty.",
    dep: ["model-layer", "transactions"]
  },
  "service-container": {
    s: "Builds and supplies the objects an application depends on, resolving constructor dependencies by type or name, controlling lifetime, and allowing replacement in tests.",
    d: "Components register factories or classes with a lifetime: one shared instance, a new instance per use or one per request. The container resolves dependencies recursively, often by inspecting declared types, and injects them into handlers, jobs and commands. Tests substitute fakes. Providers bind interfaces to implementations from configuration. The difficulty is hidden wiring and lifetimes: circular dependencies, services that capture request state in a shared instance, and resolution that only fails at runtime.",
    k: ["Constructor injection vs a service locator: injection makes dependencies explicit and testable, while a locator is shorter to write but hides what code needs.", "Resolve automatically from types vs explicit bindings: automatic resolution removes boilerplate, while explicit bindings are searchable and fail earlier."],
    p: ["A shared singleton stores request or user data in a field, leaking it between concurrent requests.", "A circular dependency or missing binding appears only when the first request needing it arrives, not at startup."],
    v: "Boot the application and resolve every registered service at startup, confirming no failures. Send two concurrent requests and confirm a per-request service gets a different instance for each while a shared one stays the same.",
    dep: ["service-providers", "configuration"]
  },
  "service-providers": {
    s: "Units of registration and startup that bind services into the container, publish configuration and routes, and run initialization in a defined order.",
    d: "Each provider has a registration phase, which only binds services and must not use others, and a boot phase that runs after all registrations and can use anything. Framework features and extensions are providers, as are application modules. Providers can be deferred until the service they offer is first needed. The difficulty is ordering and weight: boot-phase work runs on every process start, including commands and workers, and a provider depending on another's boot state creates order bugs.",
    k: ["Eager providers vs deferred ones: eager providers fail at startup if broken, while deferred ones speed startup but fail later on first use.", "One provider per feature vs one central provider: per-feature providers keep modules self-contained, while a central one is easy to read but grows large."],
    p: ["Expensive work such as a network call runs in the boot phase and slows every command and worker start.", "A provider reads configuration in registration before a later provider has set it, and uses wrong defaults."],
    v: "Measure startup time per provider and confirm none exceeds its budget. Start with each provider removed in turn and confirm failures are clear errors at startup, not later request errors.",
    dep: ["service-container", "application-bootstrap"]
  },
  "configuration": {
    s: "Layered application settings loaded from files, environment variables and defaults into a typed structure, validated at startup and read through one interface.",
    d: "Defaults ship with the framework and packages, application files override them, and environment variables or a settings service override per deployment. Values are parsed into typed structures, validated at startup so that missing or malformed values fail immediately, and accessed through a read interface rather than raw environment lookups scattered in code. Some settings can be cached after the first load. The difficulty is precedence and drift: a value overridden in one layer is surprising, and settings differ across environments in ways nobody documented.",
    k: ["Environment variables for deployment settings vs config files per environment: variables follow twelve-factor deployment and keep secrets out of the repository, while files are readable and structured.", "Validate and fail at startup vs on first use: startup validation catches mistakes before traffic, but needs every setting to be validated eagerly."],
    p: ["A misspelled environment variable name silently falls back to a default and production runs with development behavior.", "Configuration read at import time is fixed before overrides are applied, so overrides have no effect."],
    v: "Start the application with a required value removed and confirm it refuses to start with a message naming the setting. Print the effective configuration and confirm each value's source layer.",
    dep: ["environments", "secrets-management"]
  },
  "environments": {
    s: "Named run modes such as development, test and production that switch defaults for debugging, caching, logging, error detail and security strictness.",
    d: "The environment name, taken from a variable, selects a set of defaults: development enables reloading, detailed errors and loose caching, test uses isolated resources and fake drivers, production enables caching, strict security, minimal errors and structured logs. Staging should match production. Feature behavior checks the mode rather than assuming. The difficulty is parity: differences between environments hide bugs that appear only in production, and code that branches on environment name becomes untested in the branch that matters.",
    k: ["Few environments with explicit settings vs many named environments: few modes keep behavior understandable, while many allow tuning but multiply untested combinations.", "Branching code on the environment name vs configuring the behavior: configuring keeps one tested code path, while name checks are quick but fork logic."],
    p: ["Debug mode or detailed errors are accidentally enabled in production through a missing variable.", "Production-only behavior such as asset hashing or caching is never run in testing, so its bugs ship."],
    v: "Start in production mode and confirm detailed errors, the debug toolbar and reloading are off, caching is on and logs are structured. Run the main test suite once in a production-like mode and confirm it passes.",
    dep: ["configuration"]
  },
  "secrets-management": {
    s: "Supplies credentials, keys and tokens to the application at runtime from a protected store or encrypted file, with rotation and no exposure in code or logs.",
    d: "Database passwords, signing keys, encryption keys and third-party tokens are injected through the environment, a mounted secret, an encrypted credentials file with a single master key, or a secrets service fetched at boot. Access is limited by role and audited. Keys used for signing and encryption support rotation with multiple active versions. Logging and error pages filter sensitive parameters. The difficulty is leakage and rotation: secrets spread into build logs, crash reports and copies of the environment, and changing a key means every holder must change together.",
    k: ["Encrypted file in the repository vs an external secrets service: an encrypted file versions with code and needs one key, while a service gives audit and rotation but is a runtime dependency.", "Secrets as environment variables vs files: variables are easy to supply, but are inherited by child processes and appear in crash dumps."],
    p: ["Secrets committed to the repository once remain in history even after removal, and must be rotated.", "Parameter filtering misses a custom field name, and passwords appear in request logs."],
    v: "Search the repository history, build logs and application logs for known secret values and find none. Rotate the signing key and confirm sessions signed with the old key remain valid until the grace period ends.",
    dep: ["configuration"]
  },
  "application-bootstrap": {
    s: "The ordered startup of the application: load configuration, register providers, initialize services, build the router and stack, and signal readiness.",
    d: "On start, the process reads the environment, loads configuration, registers and boots providers, compiles routes, builds the middleware stack, and warms caches or loads code ahead of time. Servers that fork workers can load code once and share memory. The same boot is used by the server, commands, workers and tests, with different entry points. The difficulty is separation: work done before forking is shared but connections opened before the fork are not safe to share, and slow startup delays deploys and autoscaling.",
    k: ["Load code ahead of time vs lazily: ahead-of-time loading finds errors at startup and shares memory across forks, while lazy loading starts faster in development.", "One boot path for all entry points vs lean ones per entry point: one path is consistent, but commands then pay for web-only setup."],
    p: ["A database or cache connection opened before the process forks is shared by workers and corrupts its protocol state.", "Slow boot makes rolling deploys and autoscaling react slowly, so new instances take too long to serve traffic."],
    v: "Time a cold start and confirm it is within budget, check that each worker has its own connections after forking, and confirm the process reports ready only after routes and providers are loaded.",
    dep: ["service-providers", "configuration", "router"]
  },
  "error-handling": {
    s: "Catches exceptions at the edge of the pipeline, classifies them, records them with context, reports to monitoring, and converts them into proper responses.",
    d: "An outermost layer wraps the request: expected errors such as not found, validation failure, unauthorized or conflict map to specific status codes, while unexpected exceptions map to 500 and are logged with the request, user and trace identifiers and sent to an error reporting service. Background jobs and commands have their own handlers. Error classes carry status and safe messages. The difficulty is completeness and safety: errors thrown inside other middleware, streams or jobs can bypass the handler, and error reports can capture sensitive data.",
    k: ["Typed exceptions mapped to responses vs return values: exceptions allow deep code to abort cleanly, while return values make failure paths explicit but verbose.", "Report every exception vs only unexpected ones: reporting all is complete but noisy, while filtering expected errors keeps alerts meaningful."],
    p: ["A catch-all handler swallows an exception and returns 200 or an empty body, hiding a failure from monitoring.", "Error reports include request bodies and headers containing passwords or tokens."],
    v: "Trigger a not-found, a validation error, a permission error and an unexpected exception, and confirm each yields its status code, the last one is reported with a request identifier, and none of the responses shows internals.",
    dep: ["middleware-pipeline", "logging", "error-pages"]
  },
  "error-pages": {
    s: "The responses users and clients see for failures: friendly HTML pages for browsers, structured bodies for APIs, and maintenance and rate-limit pages served even when the application is down.",
    d: "The error layer picks a format by the request's expected content and renders a template or structured body for the status, with a request identifier users can quote to support. Pages must work when the application is in a broken state, so critical ones are static, without database access or complex layouts. Edge servers serve a fallback when the application is unreachable. The difficulty is that error pages are the least-tested code and run in the worst conditions.",
    k: ["Dynamic error pages through the full layout vs minimal static pages: dynamic pages are friendly and branded, while static pages survive failures in the layout and database.", "Different bodies by format vs one for all: format-specific bodies serve each client correctly, but need handling for unknown or missing Accept values."],
    p: ["The error page itself uses the database or session and fails, producing a blank page or an infinite error loop.", "Detailed development error pages with source and variables are shown in production."],
    v: "Stop the database and request a page, then confirm a readable error page with a request identifier appears. Take the application offline and confirm the edge serves the static fallback.",
    dep: ["error-handling", "template-engine", "content-negotiation"]
  },
  "logging": {
    s: "Structured records of what the application did, with levels, request and user identifiers, sensitive-field filtering and routing to files, streams or collectors.",
    d: "Code emits events with a level and fields, and the framework adds a request identifier, route, status, duration and user to each request's record. Output is structured, usually one JSON object per line, written to standard output for a collector, with levels adjustable per environment. Filters redact passwords, tokens and personal data. The difficulty is volume and usefulness: debug-level logging in production is costly, plain text is hard to query, and logs without a correlation identifier cannot be followed across services.",
    k: ["Structured logs vs plain text: structured logs are queryable and aggregated reliably, while plain text is readable at a terminal but fragile to parse.", "Log to standard output vs to files: standard output lets the platform route and rotate, while files need rotation and disk management in the application."],
    p: ["Logging request parameters in full writes passwords and personal data to a store with broad access.", "Logs from jobs, requests and commands carry no shared identifier, so one user action cannot be traced end to end."],
    v: "Send a request and find a single structured line with request identifier, route, status and duration. Submit a password and confirm it appears redacted. Follow one identifier from the request into its job.",
    dep: ["configuration", "middleware-pipeline"]
  },
  "tracing-and-metrics": {
    s: "Measures requests, queries, jobs and external calls as spans and counters with identifiers that propagate across services, for latency analysis and alerting.",
    d: "Instrumentation wraps the request, database calls, cache operations, outbound HTTP calls and jobs in timed spans linked by a trace identifier passed in headers and job metadata. Counters and histograms record request rates, error rates, durations, queue depth and pool use, exported to a collector. Sampling controls volume. The difficulty is context propagation and cardinality: context lost at async boundaries breaks traces, and metrics labeled with unbounded values such as user identifiers or raw URLs overwhelm storage.",
    k: ["Head sampling vs tail sampling: head sampling decides at the start and is cheap, while tail sampling keeps the slow and failed traces but needs buffering.", "Automatic instrumentation vs manual spans: automatic coverage is broad and quick, while manual spans add business meaning and cost maintenance."],
    p: ["Metric labels built from raw URLs or user identifiers create millions of series and exhaust the metrics store.", "Trace context is not passed into background jobs, so work done for a request appears as unrelated traces."],
    v: "Make one request that runs a query, a cache call and enqueues a job, and view a single trace containing all of them, including the worker's span. Confirm metric label cardinality stays bounded after a load test.",
    dep: ["logging", "middleware-pipeline", "job-workers"]
  },
  "health-checks": {
    s: "Endpoints that report whether the process is alive and whether it can serve traffic, so orchestrators and load balancers route to healthy instances and restart broken ones.",
    d: "A liveness check answers cheaply that the process is running and not deadlocked; a readiness check verifies that dependencies such as the database and cache are reachable, migrations have run and boot has finished. Orchestrators call them on an interval and remove or restart instances that fail. Graceful shutdown flips readiness off first so traffic drains. The difficulty is calibration: a readiness check that depends on a shared service can take every instance out of rotation at once, and a liveness check that does too much causes restart storms.",
    k: ["Shallow checks vs dependency checks: shallow checks are stable and cheap, while dependency checks catch real problems but can cascade a shared outage across all instances.", "Separate liveness and readiness vs one endpoint: separate checks let an instance stay alive while temporarily unready, but need two definitions maintained."],
    p: ["A liveness check that queries the database restarts every instance when the database is slow, deepening the outage.", "Readiness returns healthy before boot completes, so traffic arrives at an instance that cannot serve it."],
    v: "Stop the database and confirm readiness fails while liveness still passes and the instance leaves rotation without restarting. Send a termination signal and confirm readiness fails before the process stops accepting connections.",
    dep: ["application-bootstrap", "connection-pooling", "server-adapters"]
  },
  "request-scoped-state": {
    s: "Where data tied to one request lives, such as the current user, locale, transaction and trace identifier, and how it is kept from leaking between concurrent requests.",
    d: "Request state is passed explicitly through arguments or the request object, or stored in a context bound to the current thread, task or fiber. Explicit passing is clear and safe but verbose; ambient context is convenient but must be cleared at request end and propagated into any code that moves to another thread, task or job. Choosing early shapes the whole codebase, because the current user and tenant are needed by logging, authorization, queries, caching and mail.",
    k: ["Ambient context vs explicit passing: ambient context keeps signatures short, while explicit passing makes dependencies visible and survives async boundaries.", "Request-scoped services in the container vs a context object: container scoping fits injection, while a context object is simpler and cheaper."],
    p: ["Context set on one request is not cleared and appears in the next request handled by the same worker.", "Ambient context is lost when work moves to a thread pool or job, so the work runs without the tenant or user."],
    v: "Run concurrent requests for different users and tenants through a handler that spawns a thread and a job, and confirm every log line, query and message carries the right identity and nothing from the previous request.",
    dep: ["request-lifecycle", "service-container", "logging", "authorization-policies"]
  },
  "concurrency-model": {
    s: "How the framework runs many requests at once, with processes, threads, event loops or a mix, and what that means for blocking calls, shared state and resource limits.",
    d: "Process-per-worker models isolate memory and tolerate unsafe code but use more memory; threads share memory and require thread-safe code; event loops handle thousands of idle connections but any blocking call stalls everyone. Frameworks combine them, with several processes each running threads or loops. The choice determines how connection pools are sized, how long requests may hold resources, how websockets are handled and which libraries are usable.",
    k: ["Processes vs threads vs event loop: processes isolate failures but cost memory, threads share resources but need thread safety, and event loops scale connections but punish blocking.", "Synchronous code on worker pools vs asynchronous throughout: synchronous code is simple and uses all libraries, while asynchronous code spends less per idle connection but spreads through every call."],
    p: ["A blocking call such as a slow query in an event loop stalls every other connection on the process.", "Global mutable state written under threads produces rare, unreproducible corruption."],
    v: "Load test with slow dependencies and confirm throughput and latency match the model's expectations: a slow call should delay only its own request, never unrelated ones, and no worker should exceed its memory limit over an hour.",
    dep: ["server-adapters", "connection-pooling", "websocket-handling", "job-workers"]
  },
  "convention-over-configuration": {
    s: "How much behavior comes from naming and file layout rather than explicit declarations, trading less code and faster onboarding for hidden rules and harder-to-trace behavior.",
    d: "Conventions decide which file holds which class, how a controller name maps to a route and view, how a model name maps to a table and how migrations are ordered. They remove decisions and boilerplate and make projects look alike. Explicit configuration states each fact where it is used. Frameworks mix both. The choice affects generators, tooling, search ability and the cost of leaving the conventional path, such as a legacy table with different names.",
    k: ["Strong conventions vs explicit declarations: conventions cut boilerplate and make projects familiar, while explicitness makes code searchable and unsurprising.", "Autoloading by file name vs explicit imports: autoloading removes import lists, but hides dependencies and makes load order and renames risky."],
    p: ["A file or class is renamed and silently stops being found, because the convention that connected it is invisible.", "New developers cannot find where behavior comes from, since nothing in the code refers to it."],
    v: "Pick a route and trace by search alone from URL to handler, view, model and table. If any hop requires knowing a naming rule not written in the code or documentation, record the convention.",
    dep: ["code-generators", "router", "model-layer"]
  },
  "trust-boundaries": {
    s: "Where untrusted input becomes trusted data: every place the framework must validate, escape, authorize or sandbox, and which layer owns each check.",
    d: "Data crosses boundaries at the network edge, at the parser, at the database, at the template and at every external call. Each crossing needs a specific treatment: parse and bound, validate, parameterize, escape for the output context, authorize against the identity. Assigning each check to one layer prevents both gaps and false confidence from checks done elsewhere. Defaults matter most, since the common path is the one most code takes.",
    k: ["Safe by default with explicit escape hatches vs safe only when asked: safe defaults protect the average developer, but escape hatches then concentrate the risk and need review.", "Defense at each layer vs a single strong gate: layered defense survives one failure, but duplicates logic and can blur ownership."],
    p: ["Each layer assumes another has already validated, so input reaches the query unchecked.", "Escape hatches such as raw output and raw SQL multiply with no list of where they are used."],
    v: "Send crafted input through every entry point: path, query, body, header, cookie, upload and websocket message. Trace each to its sinks and confirm a named layer validated or escaped it for that sink.",
    dep: ["injection-protection", "output-escaping", "authorization-policies", "validation", "body-parsing"]
  },
  "extension-and-upgrade-path": {
    s: "How the framework evolves and how applications and packages keep working through it: versioning, deprecation, extension interfaces and what counts as public API.",
    d: "A framework publishes which interfaces are stable, deprecates with warnings and a timeline, and ships upgrade guides and automated rewrites. Packages declare compatible versions. Applications that patch internals, copy generated code or depend on undocumented behavior pay at every upgrade. Long-term support releases trade features for stability. The pace of upgrades determines how long known vulnerabilities live in deployed applications, so the path has to be cheap enough to be taken regularly.",
    k: ["Frequent small upgrades vs infrequent large ones: small upgrades are easy to diagnose, while large ones batch the risk and often get postponed past support.", "Strict public API surface vs open internals: a strict surface protects upgrades, but forces extension authors to wait for hooks or patch internals."],
    p: ["An application stays on an unsupported version because one package or customization blocks the upgrade, and security fixes stop arriving.", "Deprecation warnings are logged but ignored until the removal breaks the build."],
    v: "Upgrade to the next minor release in a branch with deprecation warnings treated as errors, and run the full tests and a smoke test of the main flows. Count the changes needed outside upgrade guide steps.",
    dep: ["plugin-system", "package-ecosystem", "test-harness"]
  },
  "statelessness-and-scaling": {
    s: "Keeping request-handling processes free of local state, so any instance can serve any request and capacity grows by adding instances behind a load balancer.",
    d: "Stateless processes store sessions, uploads, caches, locks, rate counters and jobs in shared services rather than local memory or disk, so instances can be added, removed and restarted freely. State that remains local, such as in-process caches, websocket connections and temporary files, must be treated as disposable or routed with affinity. The database becomes the shared bottleneck, so connection use, caching and read replicas are the next limits. Deploys, autoscaling and failure recovery all depend on this decision.",
    k: ["Shared external state vs sticky routing to local state: shared state allows free scaling and restarts, while stickiness is simple but makes instances precious and rebalancing hard.", "Scale web processes vs scale the database first: adding instances is easy but pushes load onto the database, while the database needs caching, pooling and replicas to keep up."],
    p: ["Uploads or sessions written to local disk vanish or become unreachable when requests reach another instance.", "Scaling out web instances multiplies database connections and slows everything."],
    v: "Run three instances behind a balancer, route consecutive requests of one session to different instances, upload a file through one and fetch it through another, and kill an instance mid-session without user-visible loss.",
    dep: ["session-store", "cache-store", "file-storage", "connection-pooling"]
  },
});
