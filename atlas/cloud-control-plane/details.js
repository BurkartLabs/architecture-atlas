// Details for the cloud control plane plate, part 1: resource model, APIs and the request pipeline.
ATLAS.details("cloud-control-plane", {
  "resource-model": {
    s: "The schema of everything a customer can own: typed resources with identity, configuration, state and relationships, shared by every service so the API feels uniform.",
    d: "Each resource type defines its writable configuration, its read-only observed state, its parents and its allowed operations. A common envelope carries the identifier, owner account, region, creation time, tags and a revision. Services own their types but follow shared conventions for naming, pagination, filtering and errors. The hard part is separating what the customer asked for from what the system observed, and keeping relationships such as an instance's attached volumes consistent across services that each own half of the link.",
    k: ["One shared envelope vs per-service shapes: uniform tooling, billing and audit come cheaply; services lose freedom and the envelope becomes expensive to change.", "Desired and observed state in separate fields vs one merged record: reconciliation stays clear; clients must learn to wait for observed state to catch up."],
    p: ["Relationships stored on both sides drift apart after a partial failure, leaving a volume that claims an instance which no longer lists it.", "Resource types designed in isolation produce different pagination and error shapes that every client library must special-case."],
    v: "Create one resource of every type, then list, read and delete each through the public API and confirm every response carries the same envelope fields and the same pagination and error format.",
    dep: ["resource-database"]
  },
  "resource-identifiers": {
    s: "Globally unique, stable names for resources, with a structure that encodes type, region and account so any service can route and authorize a reference without a lookup.",
    d: "An identifier is either an opaque random string or a hierarchical path naming account, region, type and name. Opaque identifiers are never reused, so a stale reference cannot silently point at a new resource. Hierarchical names let policies match patterns and let routers pick a cell from the name alone. Names given by customers are separate and mutable. Difficulty lies in uniqueness across cells, avoiding guessable sequences that leak counts, and deciding what happens to an identifier after deletion.",
    k: ["Random opaque identifiers vs structured paths: opaque ones leak nothing and cannot be forged; structured ones enable pattern policies and routing at the cost of exposing topology.", "Never reusing identifiers vs recycling: no stale reference ever hits a new resource, but identifier space and audit retention grow without bound."],
    p: ["A sequential identifier lets a customer infer how many resources others own.", "Reusing a deleted name lets an old policy or script suddenly act on an unrelated new resource."],
    v: "Create and delete a resource, create another with the same customer name, and confirm the identifier differs and any policy or reference to the first no longer resolves.",
    dep: ["resource-model"]
  },
  "public-api-endpoints": {
    s: "The network-facing addresses and wire protocol through which every customer and tool calls the cloud, one stable set of endpoints per region and service.",
    d: "Each region exposes endpoints per service over HTTP with TLS, using JSON bodies and signed or token-bearing headers. Requests are plain verbs on resource paths, or action-style calls with a name parameter. A regional endpoint resolves by DNS to the front door. Responses carry a request identifier used in audit and support. The difficulty is that the endpoint is a permanent contract: every header, status code and error body becomes something a customer script depends on.",
    k: ["Resource-oriented verbs vs action-style calls: resources are predictable and cacheable; actions map more naturally to operations like reboot or resize that are not CRUD.", "Regional endpoints vs one global endpoint: regional keeps failures and data residency contained; customers must manage region selection themselves."],
    p: ["An undocumented response header or field ordering gets depended on by a major customer, and cannot be changed afterward.", "Error bodies that vary between services make generic retry logic impossible."],
    v: "Send the same malformed request to every service endpoint in a region and confirm each returns the same status class, error body shape and a request identifier that appears in the audit log.",
    dep: ["edge-front-door", "resource-model"]
  },
  "api-versioning": {
    s: "The rules for evolving the API without breaking existing clients: how versions are named, what counts as a compatible change and how long old behavior is kept.",
    d: "Compatible changes such as new optional fields, new resource types and new enum values are added in place. Breaking changes need a new version, selected by a path segment, header or date. Old versions are supported for years because customers rarely update scripts. Servers must ignore unknown fields and clients must tolerate new ones. It is hard because even adding an enum value breaks strict clients, and because every version multiplies the test and operational surface.",
    k: ["Date-stamped versions vs numbered major versions: dates make change small and frequent; numbers make breaks rare but large and painful to migrate.", "Long deprecation windows vs fast removal: customers keep working, but the team carries years of old behavior and its security risk."],
    p: ["A new enum value returned to an old client crashes parsing in a customer's deployment tooling.", "Removing a version after notice still breaks the customers who did not read it, often at a bad moment."],
    v: "Run a recorded corpus of requests written against each supported version against the current build and confirm every response is byte-compatible with what that version returned when recorded.",
    dep: ["public-api-endpoints"]
  },
  "sdks-and-cli": {
    s: "Client libraries and a command-line tool generated from the API's machine-readable definition, handling signing, retries, pagination and waiting on asynchronous operations.",
    d: "A machine-readable description of each service drives code generation for language libraries and the command line. They sign requests, parse errors, follow pagination, retry with backoff and poll operations until they finish, so users write one call instead of a loop. Waiters and paginators are usually added by hand on top of generation. The difficulty is that client behavior, especially retries, is part of the system: a bad default multiplies load during an outage across every customer at once.",
    k: ["Generated clients vs hand-written: generation keeps hundreds of operations consistent and current; hand-written code feels idiomatic but lags and diverges.", "Automatic retry by default vs opt-in: most callers get resilience for free, but a retry storm during an incident is built into every client."],
    p: ["Clients retrying immediately without jitter turn a brief partial failure into a sustained overload.", "A library bug in credential handling affects every customer's automation and cannot be hot-fixed on their machines."],
    v: "Point a client at a server that returns throttling errors for ten seconds and confirm requests back off with jitter, total attempts stay bounded, and the call succeeds once the server recovers.",
    dep: ["public-api-endpoints", "idempotency-tokens"]
  },
  "web-console": {
    s: "The browser interface to the cloud, built as an ordinary client of the public API so it can show nothing a user could not do through automation.",
    d: "A single-page application authenticates the user, then calls the same service APIs that any client could. It adds composition, such as dashboards that join resources from many services, wizards that gather the many parameters of a launch, and resource lists that poll for state. Because it fans out to dozens of calls per page, it is a major source of load. The challenge is staying correct and fast over APIs not designed for screens, and keeping the console from gaining private privileges.",
    k: ["Console as plain API client vs privileged backend: parity and clean authorization stay intact; some views need many calls or slower pages.", "Polling for state vs push updates: polling is simple and uses existing APIs; push feels live but requires a new event channel and its own failure modes."],
    p: ["A page that issues dozens of list calls per refresh throttles its own user and degrades the API for them.", "A console-only feature quietly bypasses a check enforced in the API, creating an authorization hole."],
    v: "Load the main resource page with network capture and confirm every backend call is a public-API call authorized as the logged-in principal, and that no call succeeds that the same principal's CLI would be denied.",
    dep: ["public-api-endpoints", "request-authentication"]
  },
  "tags-and-labels": {
    s: "Customer-defined key-value metadata on resources, used to organize, search, allocate cost and drive policy decisions across every service.",
    d: "Tags attach to nearly any resource as a small map with limits on count, key length and character set. Services store them with the resource and index them for filtering. Policy can match on tags, which makes them a security mechanism as well as a bookkeeping one, and cost reports group by them. The hard parts are consistent propagation to every resource type, keeping tag changes atomic with other updates, and stopping tags from being edited by anyone who should not alter policy outcomes.",
    k: ["Tags usable in access policy vs descriptive only: attribute-based access control becomes possible; anyone allowed to edit tags can then change who may access a resource.", "Free-form tags vs enforced schemas: teams move freely; reports are inconsistent unless an organization policy enforces required keys."],
    p: ["Inconsistent capitalization makes the same cost center appear as three groups in billing.", "A tag-based access rule is bypassed because a broad role can retag a resource to match."],
    v: "Tag a resource, filter by the tag in the list API, see it grouped in a cost report, then use a policy that matches on it and confirm access flips when the tag is changed.",
    dep: ["resource-model", "policy-evaluation"]
  },
  "edge-front-door": {
    s: "The first stop for every request: terminates TLS, picks the target service and cell, applies coarse protections and forwards the request inward.",
    d: "A fleet of stateless proxies terminates TLS, parses the request line and headers, rejects oversized or malformed requests and sheds abusive sources before any expensive work. It selects the destination service from the host and path, often consulting the cell router for the account's cell. It adds the request identifier and trace context. The difficulty is that it is both the largest attack surface and a shared dependency of everything, so it must be simple, heavily tested and nearly impossible to overload.",
    k: ["Thin front door vs one that does authentication: a thin one is simple and fast; putting authentication there removes duplicate work but concentrates risk and coupling.", "Shared fleet vs per-service front doors: shared is cheaper and uniform; per-service limits the damage of one bad deployment."],
    p: ["A parsing bug at the front door becomes a security flaw in every service behind it.", "A slow-client attack holds connections open and exhausts the proxy fleet before any limit triggers."],
    v: "Send oversized headers, slow request bodies and an invalid TLS handshake against production-like capacity and confirm each is rejected quickly with a bounded cost while normal traffic latency stays flat.",
    dep: ["cell-router", "service-discovery"]
  },
  "request-authentication": {
    s: "Establishes which principal made a request by verifying a signature or token, and rejects replayed, expired or tampered requests before any authorization happens.",
    d: "Requests carry either a signature computed from a secret key over the canonical request, or a bearer token issued by the identity service. The verifier recomputes or validates, checks a timestamp window to limit replay, and resolves the principal and its session. Verification must be done at scale without a database round trip per call, so keys are cached or derived. The difficulty lies in canonicalizing the request identically on both sides and handling credential revocation quickly without losing the cache's benefit.",
    k: ["Signed requests vs bearer tokens: signatures never expose the secret on the wire and bind to the request; tokens are simpler for clients but are stolen intact.", "Cache credentials for speed vs check on every call: caches survive identity-service outages; revoked credentials keep working until the cache expires."],
    p: ["Two parts of the stack canonicalize paths differently, so a signature validates for a request that was altered in transit.", "A leaked long-lived key is honored for minutes after revocation because of a cache."],
    v: "Replay a captured request after the timestamp window, alter one header on another, and revoke a key mid-session; confirm all three are rejected and the revocation takes effect within the documented delay.",
    dep: ["principals", "temporary-credentials"]
  },
  "request-validation": {
    s: "Checks the shape and values of a request against the operation's schema before any state changes, returning precise, machine-readable errors.",
    d: "Each operation has a schema covering required fields, types, ranges, formats and cross-field rules. Validation runs after authentication and before the operation record is created, so malformed calls never reach a workflow. Semantic checks that need state, such as whether the referenced subnet exists, happen later in the owning service. Error responses name the field and rule. The difficulty is deciding what belongs at the edge versus in the service, and ensuring validation is identical on every path into the same operation.",
    k: ["Schema validation at the shared layer vs in each service: consistent errors and one fix point; services still need their own stateful checks and may duplicate rules.", "Strict rejection of unknown fields vs ignoring them: typos get caught early; strictness blocks forward-compatible clients."],
    p: ["A rule implemented in the console but not the API lets automation create invalid resources.", "An error message that echoes input unescaped becomes an injection path into logs or consoles."],
    v: "Submit one request violating each declared rule in turn and confirm each is rejected with a 4xx naming the exact field, and that no operation record or resource row was created.",
    dep: ["public-api-endpoints"]
  },
  "throttling": {
    s: "Limits request rates per account, principal and operation so no single caller can degrade the shared control plane, using buckets that allow short bursts.",
    d: "Token buckets are kept per account and per operation class, with higher limits for reads than for writes, and distributed counters or local approximations track them across a fleet of API servers. Callers over limit receive a retryable error with guidance on when to retry. Internal callers have separate limits. The hard part is fairness: a global limit lets one noisy tenant starve others, while per-tenant limits require per-tenant state that must scale and survive restarts.",
    k: ["Local per-server limits vs a global shared counter: local is fast and has no extra dependency; global is exact but adds latency and a point of failure.", "Reject excess requests vs queue them: rejection protects latency and is simple; queuing hides spikes but grows memory and delays everyone."],
    p: ["Limits sized for typical load throttle a customer's legitimate bulk migration, which then retries and makes it worse.", "An internal service sharing the customer limit pool gets throttled during an incident, blocking the repair."],
    v: "Drive one account above its write limit while a second account runs steady traffic, and confirm the first receives throttling errors within its bucket size while the second sees no change in latency or success rate.",
    dep: ["request-authentication", "usage-counters"]
  },
  "idempotency-tokens": {
    s: "Client-supplied tokens that let a create request be retried safely: the same token returns the original result instead of making a second resource.",
    d: "On a create call the server stores the token with a fingerprint of the request and the resulting operation, within the same transaction that records the resource. A retry with the same token and same parameters returns the stored result; the same token with different parameters is an error. Tokens expire after a window. The difficulty is atomicity: if the token record and the resource record are written separately, a crash in between yields either a duplicate or a lost request.",
    k: ["Token stored in the same transaction as the resource vs afterward: strictly safe; requires the token table to live in the same database as the resource.", "Long retention vs short: long windows protect slow retry loops; they cost storage and risk returning stale results for reused tokens."],
    p: ["A client library generates a fresh token per retry, so the retry makes a second resource and the customer is billed twice.", "Reusing a token with changed parameters silently returns the old result and the caller assumes the change applied."],
    v: "Send the same create twice with one token while killing the service between the write and the response; confirm exactly one resource exists and both calls return the same identifier.",
    dep: ["resource-database", "async-operations"]
  },
  "async-operations": {
    s: "A durable record for work that takes longer than a request: it has an identifier, a status and a result the caller can poll or be notified about.",
    d: "Most mutations return immediately with an operation resource in a pending state, while a workflow does the work. The operation moves to running, then succeeded or failed with a structured error, and keeps progress and timestamps. Callers poll by identifier or subscribe to events. Operations must outlive the process that started them and be cancelable where possible. The difficulty is giving a truthful status across several services and defining what a partial failure leaves behind.",
    k: ["Return 202 with an operation vs hold the connection open: no timeouts or lost responses and cheap servers; every client must implement polling.", "Operations as first-class records vs status on the resource only: tracing and cancellation are clean; there is another object type to store, expire and secure."],
    p: ["An operation reports success while a downstream step still failed, leaving a resource in a half-created state.", "Operation records pruned too early make a slow client's poll return not found for work that finished."],
    v: "Start a long operation, restart the API server and the workflow worker in the middle, and confirm the operation still completes and its status moves to succeeded exactly once.",
    dep: ["workflow-engine", "resource-database"]
  },
  "workflow-engine": {
    s: "Executes multi-step provisioning as a durable sequence of steps with retries, timeouts and rollback, so a crash mid-way resumes rather than abandons work.",
    d: "A workflow is a graph of steps such as validate, reserve quota, place, program network, start. State is persisted after each step, workers pick up ready steps from queues, and a failed step is retried with backoff or triggers compensating steps in reverse. Steps must be idempotent because a step may run twice. The difficulty is long-lived workflows across software versions, locks to prevent two workflows editing one resource, and stuck workflows that nothing alerts on.",
    k: ["Orchestrated workflow vs choreography through events: orchestration is easy to reason about and debug; services depend on a central engine that must itself stay available.", "Roll back on failure vs roll forward by retry: rollback frees resources quickly; retrying finishes the customer's request but may hold capacity for hours."],
    p: ["A non-idempotent step runs twice after a worker crash and leaks a resource that nothing tracks.", "A workflow stuck waiting on a dead dependency holds a resource lock forever and blocks later operations on it."],
    v: "Inject a failure at each step of a launch workflow in turn and confirm each run ends either with a complete working instance or with all reservations released, and none remains running without an owner.",
    dep: ["task-queues", "resource-database", "leader-election"]
  },
  "event-notifications": {
    s: "Publishes resource and operation state changes to subscribers, so customers and other services react to change without polling.",
    d: "Services emit an event when state changes, such as an instance becoming running or an operation failing. Events are routed through the message bus to rules that deliver to queues, functions or webhooks, filtered by pattern. Delivery is at least once and unordered across resources, with retries and a dead-letter destination. The difficulty is respecting tenancy when events cross internal boundaries, delivering events only after the state change is durable, and handling customer endpoints that are slow or hostile.",
    k: ["Emit after commit through an outbox vs emit directly from code: events never describe state that rolled back; a relay process and delay are added.", "At-least-once delivery vs exactly once: simple and reliable; consumers must deduplicate by event identifier."],
    p: ["An event is published before the transaction commits, and subscribers act on a resource that then rolls back.", "A customer webhook endpoint that always times out ties up delivery workers and delays every other tenant's events."],
    v: "Change a resource, then confirm the event reaches a subscribed queue once or more with the same identifier, only after a read of the resource shows the new state, and that a failing endpoint ends in the dead-letter queue.",
    dep: ["message-bus", "resource-database", "policy-evaluation"]
  },
});
