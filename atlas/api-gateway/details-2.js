// Details for the API gateway plate, part 2: rate limiting, validation and transformation, routing, protocol translation.
ATLAS.details("api-gateway", {
  "rate-limiter": {
    s: "Caps how many requests a consumer, key, address or route may make in a time window, rejecting the excess with a clear retry hint.",
    d: "A limiter chooses a key, such as consumer plus route, an algorithm, such as fixed window, sliding window or token bucket, and a limit. It increments a counter, local or shared, and returns allow or reject with headers saying when to retry. Limits protect backends and enforce plans. It is hard because accuracy conflicts with speed across many nodes, keys must be chosen so one tenant cannot starve others, and rejected requests must be cheap to serve.",
    k: ["Token bucket versus fixed window: buckets allow bounded bursts and smooth refill, fixed windows are simpler and let double the limit through at window edges.", "Per-node local counters versus a shared counter: local is fast and approximate (limit times node count at worst), shared is accurate and adds a network hop and a dependency."],
    p: ["Limits are keyed by address, so a whole company behind one NAT shares a single bucket.", "Rejections omit a retry-after value and clients retry immediately, amplifying the load."],
    v: "Send requests at twice the limit for a minute from one consumer and confirm about the limit is accepted, the rest get 429 with a retry hint, and a second consumer's traffic is unaffected.",
    dep: ["counter-store", "consumer-identity", "filter-chain"]
  },
  "quota-enforcement": {
    s: "Enforces a total allowance per consumer over a long period, such as a day or month, tied to the subscribed plan.",
    d: "Unlike a rate limit, a quota counts totals over hours to months and often feeds billing. The gateway increments a durable counter and rejects or flags overage per plan rules, with soft limits that warn and hard limits that block. Reset happens on a calendar boundary or rolling period. It is hard because durability matters more than speed, counters must survive restarts and regional failover, and the definition of a counted request must match the invoice.",
    k: ["Hard stop versus overage billing: stopping caps cost and breaks customers mid-month, billing for overage keeps them running and surprises them.", "Strict global counting versus periodic synchronization: strict is exact and slow, periodic sync lets a quota be exceeded slightly between syncs."],
    p: ["Quota counters live only in memory and reset when a node restarts, giving free usage.", "Calendar month reset is computed in the wrong time zone and customers are cut off hours early."],
    v: "Set a small quota, consume it across several nodes, restart one node mid-way, and confirm rejection starts at the quota within the documented tolerance and the count survives the restart.",
    dep: ["counter-store", "subscription-plans", "usage-metering"]
  },
  "counter-store": {
    s: "The shared fast store where limit counters are kept so all gateway nodes see one count for a consumer.",
    d: "Usually an in-memory key-value store with atomic increment and expiry, reached over the network, sometimes replaced by gossip among nodes or by local counters synchronized in batches. Each check performs an atomic increment, so the store sees one operation per request. It is hard because it sits on the hot path: a slow or partitioned store forces a choice between rejecting traffic and letting it through unchecked, and hot keys concentrate load on one shard.",
    k: ["Central store versus node-local with sync: central counts are accurate and put a dependency on every request, local-with-sync is resilient and drifts.", "Increment before the call versus after: before is safe against bursts and counts failures, after counts only completed work and allows overshoot."],
    p: ["The store becomes unreachable and the limiter throws errors, turning a counter outage into a full API outage.", "One popular consumer's key lands on a single shard and saturates it."],
    v: "Block the store from the nodes and confirm the gateway follows its configured fallback (local limits or fail open) within the timeout, logs it, and recovers without a restart when the store returns.",
    dep: ["state-store", "connection-pools", "retries-and-timeouts"]
  },
  "spike-arrest": {
    s: "Smooths bursts by limiting instantaneous rate over very short intervals, protecting backends from sudden floods that a per-minute limit would allow.",
    d: "Spike arrest enforces a rate such as ten per second by spacing permitted requests across the second, or by using a small bucket, rather than counting a whole window. It is deliberately local and approximate and applies before expensive work. It guards a backend's real capacity rather than a commercial limit. It is hard because small intervals interact badly with uneven load balancing, and legitimate clients batch work in bursts that look like attacks.",
    k: ["Smoothing versus bucket with burst: smoothing gives a steady backend load and delays or rejects legitimate bursts, a burst allowance is friendlier and passes spikes through.", "Per-node versus global: per-node needs no coordination and the fleet total varies with node count."],
    p: ["Autoscaling doubles the node count and silently doubles the permitted fleet-wide rate.", "Spike limits are applied to health checks or internal callers and cause false outages."],
    v: "Send 100 requests in 10 ms against a 10-per-second spike limit and confirm roughly ten pass immediately, the rest get 429, and a steady 10 per second stream is never rejected.",
    dep: ["rate-limiter", "worker-model"]
  },
  "concurrency-limits": {
    s: "Caps the number of in-flight requests to a route or upstream, regardless of rate, so slow backends cannot absorb every connection.",
    d: "A counter tracks active requests per upstream, route or consumer and rejects or queues beyond a limit. Because concurrency equals rate times latency, it adapts automatically when a backend slows: fewer requests are admitted exactly when they would pile up. Adaptive variants tune the limit from observed latency. It is hard because the right limit depends on the backend and changes, and because counting must be released correctly on cancellation, timeouts and client disconnects or the counter leaks.",
    k: ["Fixed limit versus adaptive limit: fixed is predictable and needs tuning, adaptive follows capacity and can oscillate or collapse under noisy latency.", "Reject immediately versus queue briefly: rejection sheds load fast, a short queue absorbs small bursts and adds latency."],
    p: ["Counters are not decremented when a client disconnects, slowly lowering capacity until the route refuses all traffic.", "One slow endpoint exhausts a shared limit and blocks fast ones on the same upstream."],
    v: "Make a backend hang and send traffic above the limit. Confirm excess requests are rejected quickly, other routes still answer, and the in-flight gauge returns to zero after the hang ends.",
    dep: ["upstream-pools", "gateway-metrics", "retries-and-timeouts"]
  },
  "throttling-queues": {
    s: "Holds excess requests briefly and releases them at a controlled rate instead of rejecting them, trading latency for fewer errors.",
    d: "Requests over the limit enter a bounded queue per consumer or route and are released as capacity allows, in order or by priority and weight, with a maximum wait after which they fail. It suits batch clients and bursty callers who would otherwise retry. It is hard because queued requests hold memory and connections, queueing hides overload from callers until latency explodes, and fairness between consumers needs explicit scheduling.",
    k: ["Queue versus reject: queues reduce visible errors and add latency and memory use, rejection is honest and cheap and pushes retries to clients.", "FIFO versus weighted fair queueing: FIFO is simple and lets one consumer fill the queue, fair queueing protects small consumers and costs scheduling work."],
    p: ["Queue depth is unbounded and memory grows until the process is killed.", "Requests wait past the client's own timeout and are still forwarded, wasting backend work."],
    v: "Overload one consumer and confirm its requests wait up to the queue limit then fail, while another consumer's latency stays flat and the queue gauge never exceeds its bound.",
    dep: ["rate-limiter", "buffer-management", "consumer-identity"]
  },
  "load-shedding": {
    s: "Deliberately drops lower-priority traffic when the gateway or a backend is overloaded, to keep the most important requests working.",
    d: "Signals such as CPU, queue depth, latency or upstream error rate trigger a shedding mode that rejects requests by priority class: health checks and paying tiers survive, bulk or anonymous traffic goes first. Rejection happens early, before parsing bodies or authenticating, to cost as little as possible. It is hard because the signals lag, priorities must be defined and agreed in advance, and shedding that is too eager causes outages by itself.",
    k: ["Shed by priority versus randomly: priority protects what matters and requires classification, random is fair and simple and hurts critical calls equally.", "Shed at the gateway versus let backends decide: the gateway acts before work is done, the backend has better knowledge of its own health."],
    p: ["Shedding thresholds are tuned on one hardware size and trigger constantly after a node type change.", "Health checks are shed and the front balancer removes healthy nodes, worsening overload."],
    v: "Drive the gateway past capacity in a load test and confirm low-priority traffic is rejected with 503 first, critical routes keep their latency target, and normal service resumes automatically when load drops.",
    dep: ["gateway-metrics", "concurrency-limits", "worker-model"]
  },
  "schema-validation": {
    s: "Checks request parameters and bodies against a declared schema before forwarding, rejecting malformed input with a precise error.",
    d: "The gateway compiles the API specification's schemas into validators, then checks path and query parameters, headers and JSON bodies for type, format, range, required fields and unknown properties. Rejection at the edge saves backend work and blocks classes of injection and parsing bugs. It is hard because it requires buffering the body, schema evolution must not reject legitimate newer clients, and strictness choices, such as unknown fields, decide whether compatible changes break callers.",
    k: ["Strict versus lenient on unknown fields: strict catches typos and breaks forward compatibility, lenient lets clients and servers evolve separately and admits junk.", "Validate at the gateway versus in the service: gateway validation protects all backends uniformly, service validation stays in sync with the code."],
    p: ["Schema in the gateway lags the backend, so new valid fields are rejected after a deploy.", "Deeply nested or huge bodies make the validator itself a denial-of-service target."],
    v: "Post bodies with a missing required field, a wrong type, an extra field and a valid body. The first three return 400 naming the field and the last reaches the backend unchanged.",
    dep: ["buffer-management", "declarative-config", "request-size-limits"]
  },
  "request-size-limits": {
    s: "Bounds the size and count of headers, URLs, bodies and parameters, and the time allowed to receive them.",
    d: "Limits on request line, header count and size, body size and receive time are enforced while reading, so oversized or slow requests are rejected before being buffered whole. Different routes have different needs, such as uploads. It defends against memory exhaustion and slow-sender attacks and is the cheapest protection a gateway offers. It is hard because the right limit differs per route, and a limit applied after buffering protects nothing.",
    k: ["Global default limits versus per-route: global is safe and simple, per-route lets uploads work and spreads configuration over many places.", "Reject on declared length versus enforce while streaming: declared length is cheap and can lie, streaming enforcement is exact and needs counting every byte."],
    p: ["Body size is checked after the whole body is buffered, so the limit does not stop memory exhaustion.", "Limits are too tight for large cookies and break logged-in users."],
    v: "Send a body one byte over the limit with a truthful length and with chunked encoding, and a slow header sender. Each is rejected with the correct 4xx without memory growth beyond the limit.",
    dep: ["http-parser", "buffer-management", "listeners-and-tls"]
  },
  "header-manipulation": {
    s: "Adds, removes, renames or overwrites request and response headers, including stripping internal ones and injecting identity and tracing headers.",
    d: "Rules run in the pipeline to remove headers clients must not control, such as internal identity headers, add the authenticated consumer, correlation identifiers and forwarding information, and clean responses of server details. It is the mechanism by which the gateway passes trust to backends. It is hard because order matters, headers can repeat or vary in case, and a missed strip step lets a client forge an identity header the backend trusts.",
    k: ["Strip all inbound identity headers versus an allowlist of passthrough headers: stripping is targeted and misses new names, an allowlist is safe and breaks custom client headers.", "Rules per route versus global: global is consistent, per-route is flexible and drifts."],
    p: ["Client-supplied X-User headers pass through, so backends trust forged identity.", "Duplicate headers are collapsed or only the first is rewritten, leaving a conflicting copy."],
    v: "Send a request with a forged identity header and confirm the backend receives only the header the gateway set from the real authentication result, and that responses omit internal server headers.",
    dep: ["filter-chain", "consumer-identity", "http-parser"]
  },
  "body-transformation": {
    s: "Rewrites request or response bodies between formats or shapes, such as renaming fields, converting versions or changing encodings.",
    d: "A template or mapping language is applied to the parsed body: rename or drop fields, restructure objects, convert between data formats, or apply a version upgrade or downgrade. It lets an old contract survive after a backend changes. It is hard because transformations need the whole body buffered and parsed, double the cost of large payloads, and become hidden business logic that no service owns and nobody tests with the backend.",
    k: ["Transform in the gateway versus fix the backend: the gateway can keep old clients working immediately, and accumulates logic outside any service's tests.", "Template language versus general scripts: templates are limited and safe to analyze, scripts can do anything and are hard to bound for time and memory."],
    p: ["Transformation of large responses buffers them whole and doubles latency and memory.", "Mapping silently drops fields added later, so new data never reaches clients."],
    v: "Send recorded old-format requests and responses through the transformation and compare outputs with golden files, including a payload with unknown extra fields and one near the size limit.",
    dep: ["buffer-management", "filter-chain", "version-routing"]
  },
  "response-shaping": {
    s: "Reduces or reorganizes what is returned to a client, by filtering fields, paginating or compressing, so callers get only what they need.",
    d: "The gateway applies field selection, size caps, compression and sometimes aggregation of several backend calls into one response. It tailors one backend to many clients, such as mobile and web, without duplicating services. It is hard because composition makes the gateway a business-logic tier with partial-failure semantics, and compression must respect cache keys, content types and already-compressed bodies.",
    k: ["Aggregate in the gateway versus a dedicated composition service: the gateway is close to the edge and becomes a shared monolith, a service has an owner and an extra hop.", "Compress at the gateway versus the backend: gateway compression centralizes tuning and adds CPU on the shared tier."],
    p: ["One failing backend in an aggregated call turns the whole response into an error, or worse, a partial success the client does not notice.", "Compression is applied to already-compressed content and wastes CPU for no gain."],
    v: "Request an aggregated route while one backend fails and confirm the documented behavior: partial data with a clear marker or an error, and the latency matches the slowest allowed backend, not the sum.",
    dep: ["buffer-management", "body-transformation", "retries-and-timeouts"]
  },
  "error-mapping": {
    s: "Converts every failure, from gateway policy, timeouts or backends, into one consistent error format with stable codes and no internal detail.",
    d: "Errors come from many places: authentication, limits, validation, upstream resets, timeouts. The mapper assigns each a correct status, a stable machine-readable code and a safe message, attaches the correlation identifier, and replaces backend error pages that expose stack traces or hostnames. It is hard because status codes carry meaning for retries and caches, and because backends return their own formats that clients may already depend on.",
    k: ["Replace backend errors versus pass them through: replacing gives one format and hides detail that clients sometimes need, passthrough preserves detail and leaks internals.", "Fine-grained codes versus few: fine codes help clients branch and become a contract to maintain."],
    p: ["Upstream timeouts are returned as 500 instead of 504, so clients and caches treat them as permanent.", "Debug mode returns upstream hostnames and stack traces to the public."],
    v: "Trigger each failure type (bad key, over limit, invalid body, upstream down, upstream slow) and confirm every response has the documented status, code and format, includes the correlation identifier and exposes no internal address.",
    dep: ["filter-chain", "correlation-ids", "retries-and-timeouts"]
  },
  "data-masking": {
    s: "Removes or obscures sensitive values in requests and responses, such as card numbers or personal data, based on the caller's rights.",
    d: "Rules identify fields by path or pattern and replace them with masked, tokenized or empty values for callers without permission, or before data reaches logs and third-party backends. It enforces data-handling policy consistently at one place. It is hard because pattern-based detection has false positives and negatives, requires parsing bodies, and masking applied to responses can break clients that rely on the field's format.",
    k: ["Mask by schema path versus by pattern: paths are exact and require a schema, patterns catch unexpected places and misfire on lookalike values.", "Mask in transit versus at the source: gateway masking is quick to deploy, source masking means the data never leaves its owner."],
    p: ["A new field containing personal data is added to the backend and never matches a masking rule.", "Masking is applied to the response but the same field appears unmasked in access logs."],
    v: "Send a recorded payload with known sensitive values as callers with and without permission, and search responses, logs and traces for those values. They appear only for the permitted caller.",
    dep: ["body-transformation", "log-redaction", "scope-and-claim-checks"]
  },
  "route-matching": {
    s: "Selects which route handles a request by comparing method, path, host, headers and query against a table of rules with defined precedence.",
    d: "Routes are compiled into a lookup structure, often a prefix tree or regular-expression set, so matching stays fast with thousands of entries. Precedence rules say what wins between an exact path, a prefix, a pattern and a catch-all. The match decides which policies and which upstream apply. It is hard because ambiguity is easy to create, pattern routes are slow and sometimes vulnerable to expensive evaluation, and path normalization differences let requests bypass policies attached to another route.",
    k: ["Longest-prefix with explicit priority versus first match in order: priority is deterministic and harder to read, ordered lists are intuitive and break when reordered.", "Regular expressions versus simple patterns: regexes are powerful and slow, with risk of pathological inputs, simple patterns are safe and cover most cases."],
    p: ["Encoded slashes or double slashes match a permissive route while the backend resolves them to a protected one.", "Overlapping routes from two teams make behavior depend on load order."],
    v: "Request each variant of a path (trailing slash, encoded characters, case changes, double slashes) and confirm each reaches the intended route and policies, and that matching time stays flat as route count grows.",
    dep: ["http-parser", "declarative-config"]
  },
  "host-and-sni-matching": {
    s: "Chooses configuration by the host name in the request and the server name in the TLS handshake, so one gateway can serve many domains.",
    d: "The TLS server name selects the certificate, and the host header selects the virtual host's routes and policies. Wildcard and exact names have precedence rules. The gateway must also reject mismatches between the two when that matters for security. It is hard because certificates must exist for every name, clients without server name indication need a default, and a mismatch between the handshake name and host header can route one tenant's traffic into another tenant's policies.",
    k: ["Enforce SNI and host agreement versus allow mismatch: enforcement closes a cross-tenant confusion path and breaks some legacy clients and proxies.", "Wildcard certificates versus per-host: wildcards simplify operations and widen the damage of one leaked key."],
    p: ["A default virtual host serves a real application to requests with unknown host names.", "Certificate renewals for new domains are forgotten and handshakes fail for those names only."],
    v: "Request each configured host by name, an unknown host, and a mismatched handshake and host header. Each configured host gets its own certificate and routes, and the unknown or mismatched ones are refused.",
    dep: ["listeners-and-tls", "route-matching", "secrets-store"]
  },
  "version-routing": {
    s: "Directs requests to the right version of an API using the path, a header, a query parameter or the credential's plan, and manages deprecation.",
    d: "Version selection can come from a path segment, a media type, a header or a default pinned per consumer. The gateway maps each version to an upstream or a transformation, adds deprecation and sunset headers, and measures who still uses old versions. It lets backends and clients change at different speeds. It is hard because versions multiply, retiring one requires knowing every caller, and ambiguity about the default version means unversioned callers break when it changes.",
    k: ["Version in the path versus a header: paths are visible, cacheable and easy to route, headers keep URLs stable and are easy to forget and hard to cache.", "Pin each consumer to a version versus always latest: pinning avoids surprise breaks and prolongs support of old versions."],
    p: ["Unversioned requests silently follow the latest version, so a release breaks callers who never chose one.", "An old version is removed while analytics still show active traffic that nobody checked."],
    v: "Call each supported version and an unversioned path, and confirm routing matches the documented rules, deprecation headers appear on old versions, and usage by version is reported.",
    dep: ["route-matching", "path-rewriting", "usage-metering"]
  },
  "path-rewriting": {
    s: "Changes the path, query or method between the public request and the upstream request, so public URLs stay stable while backends move.",
    d: "Rules strip or add prefixes, substitute captured segments, remap query parameters and sometimes change the method. They decouple public design from internal service layout. The gateway must also rewrite redirects and absolute links in responses. It is hard because rewriting interacts with route matching, with signed requests that cover the path, and with backends that generate links from the path they see, and because encoding errors create path traversal and bypass bugs.",
    k: ["Strip the prefix versus forward it intact: stripping lets services ignore where they are mounted and breaks their generated links, forwarding keeps services aware of the public layout.", "Rewrite in the gateway versus in a backend: gateway rewriting is quick and centralizes layout knowledge, backend changes are cleaner and slower."],
    p: ["Rewritten paths are not re-normalized, so dot segments reach unintended internal routes.", "Redirect responses contain internal host names because Location was not rewritten."],
    v: "Send requests with encoded characters and dot segments through each rewrite rule and confirm the upstream sees exactly the documented path, and redirect responses show only public addresses.",
    dep: ["route-matching", "header-manipulation", "http-parser"]
  },
  "service-discovery": {
    s: "Finds the current addresses of backend instances from a registry, DNS or the platform, and updates the gateway as instances come and go.",
    d: "Upstreams are named, and the gateway resolves them through DNS, a registry's watch API or pushed endpoint lists, keeping an in-memory set per upstream with metadata such as zone and weight. Changes arrive while requests are in flight. It is hard because DNS caching and registry lag leave traffic going to dead instances, because the registry is itself a dependency, and because updates must be applied without dropping existing connections.",
    k: ["DNS-based versus registry watches: DNS is universal and slow to change and cache-sensitive, watches are prompt and need a client and a reliable registry.", "Last known endpoints on registry loss versus empty set: keeping them survives outages and can send traffic to stale addresses."],
    p: ["The resolver caches a DNS answer past its lifetime and sends traffic to retired instances after a deploy.", "A registry outage empties the endpoint list and every route returns 503."],
    v: "Add and remove backend instances while sending constant traffic and confirm new ones receive requests within the stated delay, removed ones stop receiving them, and in-flight requests finish.",
    dep: ["upstream-pools", "state-store", "active-health-checks"]
  },
  "load-balancing": {
    s: "Chooses which instance of an upstream handles each request, using an algorithm such as round robin, least connections or consistent hashing.",
    d: "Given the healthy endpoints for an upstream, a policy picks one per request: weighted round robin, least requests, power of two choices, or hash of a key for affinity. Locality awareness prefers same-zone endpoints. It must handle slow-start for new instances and avoid piling on one that is failing. It is hard because many gateway nodes each balance independently, so their combined effect can still overload one instance, and affinity conflicts with even spreading.",
    k: ["Least requests versus round robin: least requests adapts to slow instances and needs live counters, round robin is predictable and blind to load.", "Consistent hashing versus random: hashing gives cache and session locality and creates hot spots and uneven load."],
    p: ["Every gateway node picks the same low-latency instance at once and overloads it (herd behavior).", "A new instance receives full traffic immediately while still cold and fails."],
    v: "Run a load test against uneven instances and confirm request share follows the configured weights, a slowed instance receives less, and a newly added one ramps up over the slow-start period.",
    dep: ["upstream-pools", "active-health-checks", "service-discovery"]
  },
  "upstream-pools": {
    s: "The named group of backend instances behind a route, with its own settings for timeouts, connection limits, protocols and TLS to the backend.",
    d: "An upstream definition holds the endpoint source, load-balancing policy, health checking, connection limits, timeouts and the TLS settings for talking to the backend, including client certificates and server name. Routes point at upstreams, so changing a backend means editing one object. It is hard because defaults are rarely right for a specific backend, and because limits on connections and requests are set per node, so fleet-wide totals scale with the number of gateway nodes.",
    k: ["One upstream per service versus per route: one per service shares connections and limits, per route isolates noisy endpoints and multiplies pools.", "Encrypt to the backend versus plaintext inside the network: encryption protects against internal sniffing and costs handshakes and certificate management."],
    p: ["Per-node connection caps multiplied by node count exceed what the backend can accept.", "Backend certificate verification is disabled to make a test pass and never re-enabled."],
    v: "Inspect the live upstream object for a service, then send traffic and confirm connections stay within limits, TLS verification is on, and timeouts match the documented values.",
    dep: ["connection-pools", "load-balancing", "secrets-store"]
  },
  "rest-to-rpc": {
    s: "Exposes a binary or RPC-style backend as a plain HTTP and JSON API by mapping paths, parameters and bodies to calls and back.",
    d: "A mapping, usually generated from the service's interface definition plus annotations, tells the gateway how a path and verb become a method call, how query and path parameters fill message fields, and how responses and status codes map back. It lets public clients use ordinary HTTP while services keep efficient internal protocols. It is hard because the models differ: streaming, field naming, default values, enums and error codes do not map one to one.",
    k: ["Generate mappings from the interface definition versus handwrite: generation stays in sync and limits the public API's shape, handwriting gives a nicer API that can drift.", "Translate in the gateway versus a separate adapter service: the gateway has no extra hop and carries more logic."],
    p: ["Zero values are omitted in JSON so clients cannot tell false or zero from absent.", "RPC error codes map to a generic 500 and clients cannot distinguish bad input from an outage."],
    v: "Call each mapped endpoint with typical and edge values (zero, empty, large numbers, unknown fields) and compare the resulting backend message and the returned JSON with the interface definition's golden examples.",
    dep: ["body-transformation", "upstream-pools", "error-mapping"]
  },
  "graphql-front": {
    s: "Serves a query-language endpoint at the gateway that fans out to several backends, with depth and cost limits to keep queries safe.",
    d: "A single endpoint accepts client-shaped queries, plans which backends supply each field, calls them, and merges results. Persisted queries and complexity analysis restrict what can run. It reduces client round trips and decouples clients from service boundaries. It is hard because one request can expand into thousands of backend calls, authorization must be applied per field rather than per route, and caching and rate limiting by URL no longer describe the cost.",
    k: ["Gateway-level composition versus a dedicated server: the gateway is one hop and one deployment, a dedicated server isolates query planning load and ownership.", "Open queries versus persisted queries only: open queries are flexible and attackable, persisted ones are cacheable and predictable and need a build step."],
    p: ["Deeply nested queries multiply backend load and bypass per-request rate limits.", "Authorization is checked at the endpoint only, so any field can be read by anyone who can call it."],
    v: "Send an over-deep query, an over-costly one, an introspection request where disabled, and a valid query. The first three are refused with an explicit error, and the valid one makes the expected number of backend calls.",
    dep: ["schema-validation", "rate-limiter", "upstream-pools", "scope-and-claim-checks"]
  },
  "websocket-and-streaming": {
    s: "Carries long-lived and streaming connections such as WebSockets, server-sent events and streamed bodies, with timeouts and policies suited to them.",
    d: "After an upgrade handshake that is authenticated like any request, the connection becomes a byte stream passed between client and backend. Idle and total lifetime timeouts, message size limits, keepalives and per-connection accounting replace per-request logic. It is hard because policies built around request and response do not fit: rate limits count messages, tokens expire mid-connection, and connections pin a node and block graceful drains and deploys.",
    k: ["Authenticate once at connect versus re-check periodically: once is cheap and lets revoked users stay connected, periodic checks add load and enforce revocation.", "Long idle timeouts versus short: long timeouts suit slow streams and hold resources for dead clients."],
    p: ["Deploys wait forever for open connections to end or cut them all at once and cause a reconnection storm.", "Per-request limits never apply because the one request lasts for hours."],
    v: "Open a stream, revoke the credential, deploy a new gateway version, and idle the connection. Confirm it is closed within the stated limits and clients reconnect with backoff rather than all at once.",
    dep: ["listeners-and-tls", "connection-pools", "graceful-reload"]
  },
  "legacy-protocol-adapters": {
    s: "Bridges older enterprise protocols and message formats, such as XML envelopes over HTTP, to modern API conventions.",
    d: "Adapters wrap or unwrap envelopes, convert between XML and JSON, apply schema validation and carry signing or encryption standards used by older systems. They let new clients reach old services without rewriting them, and let old clients keep working while services modernize. It is hard because the standards are large with inconsistent implementations, XML parsing has its own attack classes (entity expansion), and transformations are fragile and hard to test.",
    k: ["Adapter in the gateway versus a separate integration layer: the gateway keeps clients simple, a separate layer isolates the risky parsing from the shared edge.", "Strict standard compliance versus pragmatic leniency: strictness avoids ambiguity and rejects partners' slightly broken messages."],
    p: ["Parsers allow external entity or recursive expansion and a small request exhausts memory.", "Namespace or encoding differences make transformed messages valid XML and rejected by the backend."],
    v: "Send recorded legacy messages, including malicious entity-expansion samples, and confirm valid ones convert correctly, malicious ones are rejected with bounded memory and the converted output matches golden files.",
    dep: ["body-transformation", "request-size-limits", "schema-validation"]
  },
  "async-bridge": {
    s: "Turns an HTTP request into a message on a queue or topic, or consumes events and exposes them as callbacks or streams, so synchronous clients can reach asynchronous systems.",
    d: "A publish route validates and authenticates the request, writes a message with an identifier, and returns 202 with a status address. A consume route lets clients poll, stream or receive webhooks. The gateway handles acknowledgment and delivery rules. It is hard because HTTP semantics, such as timeouts and retries, collide with delivery guarantees, so idempotency keys, ordering and duplicate handling must be explicit.",
    k: ["Return 202 with polling versus block until done: 202 frees connections and requires clients to poll, blocking is simple for callers and ties up connections.", "Webhooks versus streaming for results: webhooks are simple for clients to receive and need retries and signing, streams are immediate and hold connections."],
    p: ["A client retries a timed-out publish and the message is processed twice because no idempotency key exists.", "Webhook delivery targets internal addresses and the gateway becomes a request-forgery tool."],
    v: "Publish the same message twice with one idempotency key and confirm one message is delivered, the status address reports progress, and a webhook to a private address is refused.",
    dep: ["schema-validation", "retries-and-timeouts", "key-issuance"]
  },
});
