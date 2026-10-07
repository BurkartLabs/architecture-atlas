// Details part 5: connectors, observability, cross-cutting concerns.
ATLAS.details("graph-query-server", {
  "data-source-abstraction": {
    s: "A uniform interface that resolvers call to reach backends, hiding protocol, pagination, errors and credentials behind domain-level methods that can be faked in tests.",
    d: "Instead of resolvers talking to databases or services directly, they call a data source object with methods like get user by id or list orders for customer. The data source owns the client, authentication, batching and request-level caching, and translates backend errors into the server's error model. It is created per request or holds per-request state through the context. This keeps resolvers thin and gives one place to add retries, tracing and caching for a backend.",
    k: ["Data source layer vs direct client calls in resolvers: a layer centralizes concerns and testing; direct calls are quicker to write and scatter policy.", "One data source per backend vs per domain: per backend matches connections; per domain matches how resolvers think."],
    p: ["Data sources constructed once at startup carry per-request state between callers.", "Backend pagination quirks leak into resolver code when the layer does not normalize them."],
    v: "Replace the data source with a fake in a test and run the full operation. Confirm the response is correct without a network, and that the real source emits one trace span per backend call.",
    dep: ["backend-connection-pooling", "backend-resilience"]
  },
  "relational-connector": {
    s: "The adapter that translates field arguments and selections into SQL queries, with parameter binding, paging, ordering and mapping of rows to object shapes.",
    d: "It builds queries with bound parameters from arguments such as filters, order and cursors, applies the caller's data-level constraints, and maps rows into the shapes the schema expects, including nested objects from joins. Keyset pagination uses the sort key from the cursor. It must manage transactions for mutations and the isolation level seen by one operation's several queries. The danger is injection through dynamically built filters and sort fields, and slow queries from filters on unindexed columns.",
    k: ["Query builder vs hand-written statements: a builder composes dynamic filters safely; hand-written statements are tuned but cannot express arbitrary argument combinations.", "One transaction per operation vs per query: one transaction gives a consistent snapshot but holds a connection; per query is lighter and can show inconsistent data."],
    p: ["Sorting on a client-chosen field name without an allow-list leads to injection or full table scans.", "Offset pagination on large tables degrades linearly with page depth."],
    v: "Send filter and sort arguments including injection-shaped strings. Confirm all values are bound parameters in the logged statements, and an explain plan shows index use for allowed sorts.",
    dep: ["backend-connection-pooling", "connection-pagination", "data-level-filtering"]
  },
  "remote-service-adapters": {
    s: "Adapters that call HTTP or remote-procedure services and map their requests, pagination, errors and data shapes into the graph's types.",
    d: "An adapter holds the base address, credentials, timeouts and a mapping from service responses to schema types. It converts the graph's cursor pagination to the service's paging, translates status codes into the error model, and forwards trace context. Services returning more fields than the graph needs waste bandwidth, and ones returning fewer force extra calls. Differences in naming and nullability between the service contract and the schema are absorbed here, so the schema stays clean.",
    k: ["Adapt each service in the graph server vs expose a graph in each service: adapters centralize mapping; per-service graphs push ownership down and lead to federation.", "Share one client per service vs one per request: shared reuses connections; per request carries identity but needs pooling underneath."],
    p: ["A service's field renamed upstream silently turns a mapped field into null.", "No timeout on the adapter lets one slow service hold request resources indefinitely."],
    v: "Stub the service to return an error, a slow response and an unexpected shape. Confirm each maps to a distinct error code in the response, within the timeout, with the trace showing the call.",
    dep: ["backend-resilience", "backend-connection-pooling", "error-model"]
  },
  "document-and-search-adapters": {
    s: "Adapters for document stores and search indexes, translating filters, text queries, facets and sorting into the store's query form and shaping hits into graph types.",
    d: "Search backends have their own query languages, scoring, facets and eventual consistency. The adapter maps a search field's arguments to a query, returns hits with scores and cursors, and exposes facets as separate fields. Document stores return nested documents that map naturally to objects but may lack join support, so relationships are resolved with batched lookups. Results can lag writes, so a mutation followed by a search may not show the new item.",
    k: ["Expose store query syntax vs structured arguments: raw syntax is flexible but couples clients and allows costly queries; structured arguments are safe and portable.", "Rely on search index for lists vs the primary database: index is fast and rich; the database is consistent but slow for text queries."],
    p: ["Letting clients pass raw query strings allows expensive wildcard searches.", "Reading your own write immediately after a mutation misses it because the index has not refreshed."],
    v: "Create an item through a mutation and search for it right away. Confirm behavior matches the documented consistency, and that a wildcard-heavy query is rejected or bounded.",
    dep: ["data-source-abstraction", "connection-pagination", "backend-resilience"]
  },
  "backend-connection-pooling": {
    s: "Reusing a bounded set of connections to each backend across requests, so concurrent resolvers do not open unbounded connections and wait times stay predictable.",
    d: "A pool opens connections lazily up to a maximum, hands them to callers, and returns them after use, queueing callers when empty with a wait timeout. Pool size must reflect the backend's capacity divided by server instances. With parallel execution, one operation can request many connections at once, so a single wide query can drain the pool and block others. Long-held connections, from transactions or streams, compound the problem.",
    k: ["Large pool vs small pool: large pools lower queueing but can overload the backend; small pools protect it and add waiting.", "Dedicated pools per workload vs one shared: dedicated pools isolate heavy queries; one pool uses connections more efficiently."],
    p: ["Instances times pool size exceeding the backend's connection limit causes refused connections during scale-out.", "One operation holding connections while awaiting others deadlocks when the pool is exhausted."],
    v: "Load the server with concurrent wide queries and confirm pool wait time stays within the budget, active connections never exceed the cap, and backend connection count matches instances times pool size.",
    dep: ["data-source-abstraction"]
  },
  "backend-resilience": {
    s: "Timeouts, bounded retries, circuit breakers and fallbacks around backend calls, so one failing dependency degrades a field instead of the whole server.",
    d: "Each call has a deadline derived from the operation's remaining time. Retries apply only to safe operations, with backoff and a budget. A circuit breaker opens after repeated failures and returns errors immediately, then probes for recovery. Fallbacks return stale cache or defaults for non-critical fields. Combined with nullable fields, these confine failure. Poor settings are harmful: aggressive retries amplify an outage, and breakers that open too eagerly turn blips into errors.",
    k: ["Retry with budget vs no retries: a budget absorbs transient errors without storms; none keeps load predictable but exposes blips.", "Fallback to stale data vs return an error: stale keeps screens working but may mislead; errors are honest but visible."],
    p: ["Retrying non-idempotent mutations duplicates their effects.", "Per-call timeouts longer than the operation deadline mean the deadline never takes effect."],
    v: "Inject latency and errors into one backend in a test. Confirm the breaker opens at the threshold, other fields keep serving, and it closes again after the backend recovers.",
    dep: ["timeouts-and-cancellation"]
  },
  "schema-from-sources": {
    s: "Generating schema types and resolvers automatically from a database schema, API description or remote graph, to cover many backends without hand-written mappings.",
    d: "A generator reads table definitions, API descriptions or an existing graph, and emits types, filter and sort arguments, pagination fields and basic resolvers. It gets a working graph quickly. The generated schema mirrors the backend's structure and naming, which couples clients to storage details and leaks columns that should stay internal. Customization layers rename, hide and add computed fields. Backend changes flow straight into the public schema unless gated.",
    k: ["Generated schema vs hand-designed: generated is fast and complete but mirrors storage; hand-designed expresses the domain and costs effort.", "Regenerate automatically vs on review: automatic keeps up with backends but can expose or break fields silently; review keeps control."],
    p: ["A new database column appears in the public schema, exposing data nobody meant to publish.", "Generated filter arguments allow unindexed queries on any column."],
    v: "Add a column to a table and regenerate. Confirm the diff shows the new field for review, and that excluded columns and tables never appear in the published schema.",
    dep: ["relational-connector", "schema-construction", "breaking-change-detection"]
  },
  "field-tracing": {
    s: "Recording start time and duration for each resolver call, tied to its path, so a slow response can be broken down by field.",
    d: "The engine wraps resolver execution with timers, producing spans per field or per sampled field, including parent path, parent type and errors. Output goes to a tracing system with the request's trace id, or in a header for development. Tracing every field in a large list is costly, so servers trace only fields that call out or exceed a duration, and sample requests. It exposes N plus one patterns and slow backends that response timing alone hides.",
    k: ["Trace every field vs only resolvers that do work: every field is complete but expensive; selective tracing keeps overhead low and hides trivial hops.", "Sample requests vs trace all: sampling bounds cost; tracing all guarantees the slow request is there when needed."],
    p: ["Tracing each element of a large list generates millions of spans and slows the very requests it measures.", "Parallel resolvers produce overlapping spans that mislead anyone summing them."],
    v: "Run a query with a deliberately slow resolver and confirm the trace shows its path, duration and parent, and that the sum along the critical path matches total latency.",
    dep: ["execution-engine", "trace-propagation"]
  },
  "operation-naming": {
    s: "Identifying each operation by a stable name and hash so metrics, logs, limits and usage tracking can group traffic without storing the full query text.",
    d: "Clients send an operation name; the server also computes a signature from the normalized document, with literals stripped and fields sorted, and the hash of it. Metrics and logs use name plus signature as labels. This groups requests that differ only in variables, and separates different operations that share a name. Cardinality needs control: unlimited unique names or signatures from attackers explode metric storage, so unknown ones are bucketed together.",
    k: ["Client-supplied names vs server-derived signatures: names are readable but unverified; signatures are exact but opaque.", "High-cardinality labels vs bucketing unknowns: full labels are precise but risk blowup; bucketing bounds storage at the cost of detail."],
    p: ["Unbounded unique names from clients exhaust the metrics system.", "Two different operations given the same name merge their latency into one misleading series."],
    v: "Send the same operation with different variables and a different operation sharing its name. Confirm one signature for the first and a separate one for the second in metrics.",
    dep: ["document-ast", "operation-selection"]
  },
  "operation-metrics": {
    s: "Counters and histograms per operation and per field: request counts, latency percentiles, error rates, cost, resolver durations and cache hit rates.",
    d: "The server emits metrics labeled by operation name, type and outcome, and histograms for latency, estimated cost, response size and backend call counts. Field-level metrics are aggregated by coordinates rather than by request. Dashboards track error rates by code and latency by operation. Because the HTTP status is nearly always success, error rate must come from the errors array. Alerts built on status alone miss almost all failures.",
    k: ["Per-field metrics vs per-operation only: per-field shows the slow resolver; per-operation is cheap and cannot locate the cause.", "Count a response with errors as failure vs success: counting as failure matches user experience; counting as success matches HTTP semantics."],
    p: ["Alerting only on HTTP status never fires while most requests return partial errors.", "Averages hide the slow tail that real clients experience."],
    v: "Inject a failing resolver at a known rate. Confirm the error-rate metric for that operation matches the injected rate within sampling error while HTTP status stays success.",
    dep: ["operation-naming", "error-classification"]
  },
  "trace-propagation": {
    s: "Passing a trace context from the incoming request through resolvers to every backend call and, in federation, to subgraphs, so one request is one trace across services.",
    d: "The server extracts trace and span identifiers from headers, creates a span for the operation and child spans for resolvers and backend calls, and injects the context into outgoing requests. Logs carry the trace id. For subscriptions, each event may start a new trace linked to the originating mutation. It is how cross-service latency is attributed to a service rather than the graph. It breaks wherever a hop drops headers, and sampling decisions must be consistent end to end.",
    k: ["Head sampling at the entry vs tail sampling after completion: head is cheap but may miss slow or failed traces; tail captures them and needs buffering.", "Propagate to all backends vs only trusted ones: all gives full traces; trusted-only avoids leaking identifiers to third parties."],
    p: ["An adapter that creates its own HTTP client without injecting context orphans every downstream span.", "Sending trace headers to external services leaks internal identifiers."],
    v: "Make one request through the router and two subgraphs. Confirm a single trace id appears in logs of all three and the trace view shows nested spans for each hop.",
    dep: ["http-transport"]
  },
  "structured-logging": {
    s: "Machine-readable logs of requests and errors with trace ids and operation names, with variables, arguments and results redacted so personal data does not land in log storage.",
    d: "Each request logs name, signature, caller, duration, cost and error codes. Variables and responses are not logged by default because they contain user data; where needed for debugging they are sampled and masked by field or by schema annotations marking sensitive values. Query text is safe when persisted, but unpersisted text may embed secrets in literals. Log levels distinguish expected failures from server faults to keep alerts quiet.",
    k: ["Log variables for debugging vs never: logging speeds reproduction but stores personal data; never is safe and slows diagnosis.", "Redact by schema annotation vs by pattern: annotation is reliable and needs upkeep; patterns catch accidents but miss new fields."],
    p: ["Logging full variables stores passwords and tokens passed to login mutations.", "Logging a validation error that echoes user text injects attacker-controlled content into logs."],
    v: "Run a login mutation and a failing query. Search the log store for the password value and for the response body. Neither may appear, while name, trace id and error code are present.",
    dep: ["operation-naming", "error-classification"]
  },
  "error-classification": {
    s: "Sorting errors into categories such as validation, authentication, forbidden, not found, rate limited and internal, each with a stable code, a log level and an alert policy.",
    d: "A central mapper converts exceptions into error codes with safe messages and decides how each is logged and counted. Client mistakes log at low levels and increment counters; server faults log at error level with the cause and page someone. Codes are part of the public contract, since clients branch on them. Unclassified exceptions default to internal with masked text. The discipline is in keeping expected domain failures from firing alerts while real faults do.",
    k: ["Closed set of codes vs free-form codes: a closed set is documented and stable; free-form is flexible and drifts.", "Alert on internal errors only vs on all errors: internal-only keeps alerts meaningful; all errors drown real faults."],
    p: ["Treating not found as an internal error pages on-call every time a client asks for a deleted item.", "Changing an error code breaks clients that branch on it."],
    v: "Trigger one error of each category. Confirm code, masked message, log level and metric label match the table, and only the internal one raises an alert.",
    dep: ["error-model"]
  },
  "schema-as-contract": {
    s: "The schema is a published promise to clients you cannot enumerate: every field you add is a commitment, and every removal needs evidence that nobody depends on it.",
    d: "Clients, including old mobile builds, codegen output and third-party integrations, fix their expectations at compile time. That makes naming, nullability, enum values and semantics permanent in practice. It argues for small, additive, well-described surfaces, for review of every schema change, and for usage data before removal. It affects tooling, deprecation, testing and release process, and cannot be retrofitted once a public API has users.",
    k: ["Expose a rich schema early vs a minimal one that grows: rich satisfies more clients and is hard to retract; minimal is safe to extend and may block adopters.", "Model the domain vs mirror storage: domain models are stable; storage mirrors are quick and break on migrations."],
    p: ["Fields added for one screen become permanent obligations after other clients copy them.", "Semantics changes under an unchanged name break clients with no diff to warn them."],
    v: "Pick any five public fields and trace each to a named owner, a description, recorded usage by client and a deprecation path. Any without all four reveal a gap in the contract process.",
    dep: ["schema-registry", "deprecation", "additive-only-policy"]
  },
  "nullability-and-partial-failure": {
    s: "Which fields can be null decides how failures spread: a graph can return what it knows with errors attached, or collapse a large response because one dependency failed.",
    d: "Every field is a place where a backend can fail. Nullable fields let the server answer partially; non-null fields promise presence and propagate failure upward. The choice is made field by field in the schema, and it shapes error handling in clients, federation failure behavior, authorization denial and caching, since partial results are often uncacheable. It must be designed with backend reliability in mind, because it sets the failure domain of every service.",
    k: ["Resilient nullable schema vs strict non-null schema: nullable survives failures and complicates client code; non-null simplifies clients and fails loudly.", "Return partial data vs fail whole operations: partial improves availability but needs clients that check errors."],
    p: ["Non-null fields on remote data turn one slow service into broad outages.", "Clients ignoring the errors array present nulls as real absence."],
    v: "For each backend, fail it in a test and measure what share of the top operations still return usable data. The result should match the failure budget the product set.",
    dep: ["nullability-model", "null-propagation", "error-model"]
  },
  "request-scoped-state": {
    s: "All mutable state, identity, loaders, caches and cancellation, lives in one request's context and dies with it, because resolvers run concurrently and the server serves many callers at once.",
    d: "Resolvers execute interleaved on shared threads or event loops. Any state kept outside the request, in a module variable, a long-lived loader or a shared cache, is visible to other callers. Keeping state in the context gives isolation, testability and cancellation. It shapes how loaders are built, how authentication reaches resolvers, how tracing is correlated and how subscriptions maintain per-connection state. It is easy to violate and hard to notice, because tests with one caller pass.",
    k: ["Context object vs ambient globals: a context is explicit and isolated; globals are convenient and cross-contaminate.", "Fresh services per request vs shared ones with request keys: fresh is safe and costs construction; shared is efficient and error-prone."],
    p: ["A memoized value stored in a module-level variable returns one user's data to the next caller.", "Mutating shared configuration per request changes behavior for concurrent requests."],
    v: "Run two concurrent operations as different users against the same fields in a loop for several minutes. No response may ever contain data belonging to the other identity.",
    dep: ["resolver-context", "request-scoped-loaders"]
  },
  "cost-model": {
    s: "A single query can cost anything from microseconds to minutes, so the server needs an explicit model of cost that drives limits, rate budgets, pagination bounds and caching decisions.",
    d: "Because clients write the query, the server cannot know the cost from the endpoint alone. A coherent model defines weights, list-size bounds, per-caller budgets and timeouts, and uses them consistently in analysis, throttling and billing. It shapes schema design, since fields without size limits are unbounded, and shapes resolvers, since each field's real cost must match its annotation. Without one, protection is a pile of unrelated limits that attackers route around.",
    k: ["Static estimates vs measured cost: estimates act early and cheaply; measurements are accurate and arrive late, so both are used.", "Uniform limits for all callers vs per-tier budgets: uniform is simple; tiers fit commercial APIs and need accounting."],
    p: ["Lists with no maximum page size make the model meaningless.", "Estimated cost drifts from real cost as backends change, with nothing flagging the divergence."],
    v: "Compare estimated and measured backend cost for the top fifty operations. Large divergence points to wrong weights; the worst allowed query should still finish within the timeout.",
    dep: ["complexity-analysis", "rate-limiting", "timeouts-and-cancellation"]
  },
  "trust-boundaries": {
    s: "Every layer decides what it believes about the one before: the edge about the client, the router about subgraphs, resolvers about identity headers, and the data layer about the resolvers.",
    d: "Client text is untrusted and must be validated and limited. Identity forwarded from a gateway is trusted only from that gateway. Subgraphs trust the router only if network paths and tokens enforce it. Resolvers should not be the only enforcement point for data access. Each boundary needs an explicit statement of what crosses and who verifies it. This affects authorization placement, introspection policy, error masking, federation context and logging, and gaps at a boundary are where leaks occur.",
    k: ["Enforce at every layer vs at a single gateway: every layer survives bypass and repeats logic; a gateway is simple and a single point of failure.", "Trust internal networks vs verify everywhere: trusting is simpler; verifying contains a compromised service."],
    p: ["A service exposed directly bypasses all gateway protection.", "Treating the resolver layer as the only access check leaves loaders and direct data paths open."],
    v: "For each boundary, try to cross it with forged input from outside: forged identity header, direct subgraph call, hand-written query. Every attempt must be refused at the layer documented as responsible.",
    dep: ["authentication-context", "field-authorization", "context-propagation"]
  },
  "change-compatibility": {
    s: "Clients, servers and subgraphs deploy independently, so every change must work with the versions on either side during rollout and rollback.",
    d: "At any moment, several client versions, server versions and schema versions coexist. Additions must reach servers before clients use them; removals must wait until clients stop. Federated services add ordering between teams. Persisted operations, caches and plans from older schemas stay alive after a change. Handling this requires checks against real traffic, ordered publishing, expiry rules for stored artifacts and the ability to roll back code and schema together.",
    k: ["Expand then contract rollouts vs coordinated releases: expand and contract need no coordination and take longer; coordinated releases are quick and fragile.", "Long-lived compatibility for old clients vs forced upgrades: long-lived protects users and carries legacy; forcing keeps the surface small and costs users."],
    p: ["Rolling code back while the registry still advertises new fields breaks clients mid-rollout.", "Plan, validation and response caches keep entries from the previous schema after a deploy."],
    v: "Deploy a schema change in a staging environment with the previous server and client versions running. Then roll back one component at a time. Every combination must serve the recorded operation set without errors.",
    dep: ["schema-publishing", "breaking-change-detection", "persisted-query-manifest"]
  },
});
