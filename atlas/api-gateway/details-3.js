// Details for the API gateway plate, part 3: caching, releases and resilience, proxy runtime, plugins.
ATLAS.details("api-gateway", {
  "response-cache": {
    s: "Stores backend responses and serves repeats from memory or disk, honoring freshness rules, so popular reads never reach the backend.",
    d: "On a cacheable request, the gateway checks a store keyed by method, URL and selected headers, and returns a fresh entry directly. On a miss it forwards, then stores the response if the status, method and cache headers allow. Entries have a lifetime, a size limit and an eviction order. It is hard because correctness is easy to lose: personalized responses stored under a shared key leak data between users, and caching authenticated responses needs deliberate rules.",
    k: ["Shared cache across nodes versus per-node: shared gives a higher hit rate and a network hop and a dependency, per-node is fast and duplicates entries and warms slowly.", "Obey backend cache headers versus override with gateway rules: obeying keeps semantics and depends on backends being correct, overriding gives control and risks staleness."],
    p: ["A response for one user is cached under a key without the credential and served to another.", "Errors are cached with the same lifetime as successes and a brief failure lingers for minutes."],
    v: "Request the same resource twice and confirm the second is a hit with no backend call. Request as two different users for a personalized route and confirm neither sees the other's data.",
    dep: ["cache-keys", "buffer-management", "state-store"]
  },
  "cache-keys": {
    s: "The rule that decides which requests count as the same for caching: which parts of the URL, headers and identity are included.",
    d: "A key combines method, host, path, a chosen subset of query parameters, and any headers the response varies on (language, encoding, version, sometimes the consumer). Too few parts merge different responses; too many fragment the cache and lower hits. Normalization sorts parameters and drops tracking ones. It is hard because the backend's real variation is rarely documented, and mistakes show up as another user's data, not as errors.",
    k: ["Include the consumer in the key versus share across consumers: including is safe and divides the cache by user count, sharing is efficient and only valid for truly public data.", "Allowlist of query parameters versus all parameters: an allowlist raises hit rates and ignores a parameter that actually matters."],
    p: ["The key omits the Accept-Language header and users receive the wrong language.", "Random cache-busting parameters from clients bypass the cache and also fill it with junk."],
    v: "Request a resource with each varying header value and parameter order, and confirm distinct variants get distinct entries and equivalent requests share one, using cache status headers on the responses.",
    dep: ["http-parser", "consumer-identity", "response-cache"]
  },
  "cache-invalidation": {
    s: "Removes or refreshes cached entries when the underlying data changes, by lifetime, explicit purge, tags or events.",
    d: "Entries expire after a lifetime, can be purged by key or by tag through the admin API, or are invalidated by events from the backend. Stale-while-revalidate serves an old copy while refreshing in the background. Purges must reach every node holding the entry. It is hard because purge messages can be lost or delayed, tagging every response costs effort, and the cheapest strategy, short lifetimes, trades freshness against backend load.",
    k: ["Short lifetimes versus explicit purge: short lifetimes need no coordination and cap staleness, purges give exact freshness and require a reliable broadcast.", "Serve stale while revalidating versus block on refresh: stale-serving keeps latency flat and shows old data briefly, blocking is fresh and slow on expiry."],
    p: ["A purge reaches nine of ten nodes and users see different data depending on which node answers.", "Everything expires at the same instant and the backend takes a synchronized load spike."],
    v: "Update the data, issue a purge by tag, then read through every node and confirm the new value appears within the stated time on all of them.",
    dep: ["response-cache", "admin-api", "config-distribution"]
  },
  "conditional-requests": {
    s: "Uses entity tags and modification times so the gateway and clients can revalidate a stored response and receive a small not-modified answer instead of the whole body.",
    d: "The gateway forwards or generates validators with responses, and on later requests checks If-None-Match or If-Modified-Since against its entry or revalidates with the backend. A 304 saves bandwidth and body generation. It also supports safe concurrent updates through preconditions on writes. It is hard because validators must change exactly when content changes, weak versus strong matching must be chosen correctly, and transformation or compression in the gateway can alter bytes without altering the tag.",
    k: ["Strong versus weak validators: strong tags guarantee identical bytes and break on compression changes, weak tags allow equivalent content and cannot support range requests.", "Revalidate with the backend versus trust the lifetime: revalidation keeps data fresh and costs a backend round trip, trusting the lifetime is cheap and can serve outdated data."],
    p: ["The backend generates a tag from a timestamp with one-second precision and two quick updates share a tag.", "Compression changes bodies but not tags, so clients reuse mismatched encodings."],
    v: "Fetch a resource, repeat with its tag and confirm 304 with no body, change the data and repeat the same tag and confirm a full 200 with a new tag.",
    dep: ["response-cache", "header-manipulation", "http-parser"]
  },
  "request-coalescing": {
    s: "Combines simultaneous requests for the same uncached resource into one backend call, so a miss on a popular item does not become a stampede.",
    d: "When many requests arrive for a key that is missing or expiring, the first fetches while the others wait and share the result. Variants include a lock with timeout and serving stale to waiters. It protects backends from thundering herds after a purge, restart or expiry. It is hard because a slow or failed leader blocks every waiter, coalescing must not mix personalized requests, and waiters need their own timeouts so one slow fetch does not stall all of them.",
    k: ["Wait for the leader versus serve stale to waiters: waiting is always fresh and slows everyone on a slow fetch, serving stale keeps latency flat with old data.", "Per-node coalescing versus fleet-wide: per-node needs no coordination and leaves one backend call per node, fleet-wide is minimal and needs shared locks."],
    p: ["The leader request fails and all waiters receive its error instead of retrying individually.", "Coalescing is applied to requests with different credentials and one user's response is shared."],
    v: "Purge a hot entry and send hundreds of concurrent requests. Confirm the backend sees one request per node (or one total), all clients receive correct responses, and a slow leader does not exceed waiters' timeouts.",
    dep: ["response-cache", "cache-keys", "retries-and-timeouts"]
  },
  "canary-routing": {
    s: "Sends a small share of real traffic to a new version, watches its health, and widens or reverses the share based on the results.",
    d: "A canary rule directs a percentage or a selected cohort to the new upstream while the rest goes to the stable one. A controller compares error rates and latency between the two and increases the weight, holds, or rolls back. It limits the damage of a bad release to a small part of traffic. It is hard because small samples are noisy, requests of one user should stay on one version, and the new version's database or cache effects can leak into the stable path.",
    k: ["Automated promotion versus manual: automated analysis is fast and consistent and can promote on misleading metrics, manual is slower and uses judgment.", "Sticky assignment per user versus per request: sticky gives a coherent experience and uneven samples, per request gives clean statistics and flip-flopping behavior."],
    p: ["The canary receives too little traffic to show an error that affects one rare route.", "A bad canary writes incompatible data that the stable version then reads."],
    v: "Release a deliberately faulty build as a canary at 5 percent and confirm the controller detects the error difference and removes it within the stated time, with 95 percent of users never seeing an error.",
    dep: ["traffic-splitting", "gateway-metrics", "cohort-routing"]
  },
  "traffic-splitting": {
    s: "Divides traffic between two or more upstreams by weight, the building block for canaries, blue-green switches and gradual migrations.",
    d: "Each route lists upstreams with weights, and the gateway picks one per request, usually by random draw or a hash of a stable key. Weights can be changed live through configuration. Blue-green is the special case of moving from 0 to 100. It is hard because weights are applied per node and measured over finite samples, and because sessions, caches and connection reuse keep traffic on the old side longer than the weights suggest.",
    k: ["Random draw versus consistent hash: random matches weights statistically, hashing keeps one user on one version and weights only hold across many keys.", "Gradual shift versus instant switch: gradual limits exposure and prolongs running two versions, instant is simple and gives no warning."],
    p: ["Weights are applied on each node independently and low-traffic routes show no traffic at all on the new version.", "Long-lived connections stay on the old version and stay there after the cutover."],
    v: "Set a 90/10 split, send 10,000 requests and verify the shares are close to configured, then set 100/0 and confirm new requests stop reaching the old upstream within the connection reuse time.",
    dep: ["upstream-pools", "route-matching", "config-distribution"]
  },
  "cohort-routing": {
    s: "Routes by request attributes such as headers, cookies, consumer or plan, so specific users, testers or regions reach a particular version.",
    d: "Rules match on header values, consumer groups, claims or geography and select an upstream. It lets internal testers use a new version in production, lets partners pin to a version, and supports dark launches. It is hard because attribute rules grow into hidden logic, clients can forge headers to enter a cohort unless the gateway controls them, and combinations of rules with weights need a clear order.",
    k: ["Match on a trusted identity attribute versus a client-supplied header: identity attributes cannot be forged and need authentication first, headers are easy and open to abuse.", "Cohorts defined in the gateway versus a flag service: gateway rules are simple and local, a flag service shares one definition across systems and adds a dependency."],
    p: ["Any client can send the beta header and reach unfinished code.", "A cohort rule is left behind after a launch and sends some customers to a retired version."],
    v: "Send requests with and without the cohort attribute, and with a forged header from an unauthorized caller. Only authorized cohort members reach the target upstream, as shown by the version header in responses.",
    dep: ["route-matching", "consumer-identity", "header-manipulation"]
  },
  "traffic-mirroring": {
    s: "Copies live requests to a second upstream and discards its responses, so a new version can be tested against real traffic with no effect on users.",
    d: "The gateway forwards each request to the primary and, asynchronously, a duplicate to a shadow target, marked so the shadow knows not to perform side effects. Responses can be compared offline. It exercises a new version under production load and shapes. It is hard because duplicates of writes can cause real side effects, shadow traffic uses capacity and may contain personal data, and slow shadows must never delay the primary response.",
    k: ["Mirror reads only versus all methods: reads only are safe and miss write paths, all methods test fully and need a shadow environment that tolerates writes.", "Compare responses automatically versus inspect manually: automatic diffing finds regressions at scale and needs rules for expected differences."],
    p: ["The shadow service sends real emails or charges because the mirrored request was a write.", "The primary waits for the mirror call, so a slow shadow slows production."],
    v: "Mirror a route to a shadow that sleeps and fails, and confirm primary latency and error rate do not change, the shadow receives each request with the mirror marker, and no data was written by it.",
    dep: ["upstream-pools", "filter-chain", "data-masking"]
  },
  "active-health-checks": {
    s: "Probes backend instances on a schedule and removes failing ones from rotation, restoring them when they pass again.",
    d: "The gateway sends probe requests to a health endpoint at an interval and tracks consecutive passes and failures against thresholds. Passive checks complement it by watching real responses and ejecting instances with errors. Results feed the load balancer's candidate set. It is hard because a health endpoint that only checks the process misses broken dependencies, thresholds that are too eager cause flapping, and mass failure must not eject the whole pool.",
    k: ["Shallow versus deep health endpoints: shallow checks are cheap and say little, deep checks reflect real ability to serve and can fail the whole fleet when a shared dependency blips.", "Active probes versus passive ejection: active probes detect idle failures and add load, passive ejection reacts to real errors and needs traffic."],
    p: ["All instances fail their deep check at once because of a shared database blip, and the pool empties.", "Health checks come from every gateway node and generate more load than the real traffic."],
    v: "Break one instance and confirm it is ejected within interval times threshold and gets no traffic, then restore it and confirm it returns gradually. Break all instances and confirm the documented panic behavior.",
    dep: ["upstream-pools", "load-balancing", "connection-pools"]
  },
  "circuit-breaker": {
    s: "Stops sending requests to a failing backend for a cooling period and fails fast, then probes carefully before resuming.",
    d: "The breaker tracks error rates, timeouts or slow calls over a window, and opens when thresholds are crossed. While open, requests fail immediately or take a fallback. After a delay it goes half-open and lets a few trial requests decide. It prevents overload from worsening a backend failure and frees gateway resources. It is hard because thresholds need tuning per backend, low-traffic routes have too few samples, and each node deciding separately produces inconsistent behavior.",
    k: ["Per-node breaker versus shared state: per-node reacts without coordination and flaps independently, shared state is consistent and slower and adds a dependency.", "Fail fast versus fallback response: fail fast is honest and simple, a cached or default response keeps features working and can mask problems."],
    p: ["A single slow endpoint opens the breaker for the whole upstream and healthy endpoints are blocked.", "The breaker closes too quickly and a recovering backend is flooded and fails again."],
    v: "Make a backend return errors above the threshold and confirm requests fail fast with the documented status, then restore the backend and confirm half-open trials pass and traffic returns in steps.",
    dep: ["upstream-pools", "gateway-metrics", "retries-and-timeouts"]
  },
  "retries-and-timeouts": {
    s: "Sets how long the gateway waits on each stage of an upstream call and when it tries again, with budgets that prevent retry storms.",
    d: "Separate timeouts cover connecting, sending, waiting for the first byte and total duration. Retries apply only to safe, idempotent calls and certain failures, use backoff and jitter, and draw from a retry budget limited to a small share of traffic. It is hard because retries multiply load during outages, retried writes can duplicate effects, timeouts at each layer must nest (client longer than gateway longer than backend) or work is done for callers who have given up.",
    k: ["Retry budget versus fixed attempt count: a budget caps added load during outages, fixed counts are simple and can triple traffic to a failing service.", "Retry only idempotent methods versus all: idempotent-only is safe and leaves write failures to clients, retrying all risks duplicates unless idempotency keys exist."],
    p: ["Three layers each retry three times and one failure becomes twenty-seven calls to a struggling backend.", "The gateway timeout exceeds the client's, so completed work is thrown away."],
    v: "Make a backend slow and then failing and count upstream calls per client request. They stay within the retry budget, POST requests are not repeated without an idempotency key, and total time never exceeds the configured limit.",
    dep: ["connection-pools", "upstream-pools", "gateway-metrics"]
  },
  "fault-injection": {
    s: "Deliberately adds delays, errors or aborts to selected requests, so teams can test how clients and services behave during failure.",
    d: "A rule matches a route, header or cohort and, for a chosen percentage, delays the response, returns an error status or drops the connection. It is used in tests, game days and sandboxes to prove that timeouts, retries and fallbacks actually work. It is hard because the same mechanism in production is dangerous if mis-scoped, so injection needs strict matching, a visible marker, an expiry and an audit trail, and tests must clean up after themselves.",
    k: ["Inject in production with a narrow scope versus only in staging: production reveals real behavior and risks real users, staging is safe and unrepresentative.", "Percentage-based versus header-triggered: percentages exercise statistical behavior, headers give deterministic tests and can be abused without authentication."],
    p: ["A fault rule is left active after a test and silently degrades a route for weeks.", "Any client can send the fault header and trigger errors for others."],
    v: "Enable a 50 percent abort on a staging route for a limited time and confirm about half of requests fail with the marker header, the rule expires automatically and the audit trail records who set it.",
    dep: ["filter-chain", "route-matching", "audit-trail"]
  },
  "listeners-and-tls": {
    s: "Accepts client connections on configured ports, terminates TLS, negotiates protocol versions and presents the right certificate.",
    d: "A listener binds addresses, accepts connections and completes the TLS handshake with configured protocol versions, cipher suites and certificates selected by server name. It negotiates HTTP versions through application-layer protocol negotiation and can require client certificates. Session resumption and OCSP stapling cut handshake cost. It is hard because handshakes are CPU-heavy and an attack surface, certificates expire, and misconfigured protocols or ciphers either fail old clients or leave weak options open.",
    k: ["Terminate TLS at the gateway versus at a front balancer: gateway termination gives direct access to client certificates and puts key material on more nodes, balancer termination centralizes keys and hides client details.", "Support old protocol versions versus require modern: modern is safer and drops legacy clients, legacy support widens the attack surface."],
    p: ["A certificate expires because renewal automation failed silently, and every client gets handshake errors.", "A weak cipher suite stays enabled for one old partner and fails a compliance scan."],
    v: "Scan the endpoint with a TLS testing tool and confirm only intended versions and suites are offered, the correct certificate is served per name, and days until expiry are above the alert threshold.",
    dep: ["secrets-store", "worker-model"]
  },
  "http-parser": {
    s: "Reads bytes from connections into requests, handling the protocol's framing, headers and edge cases strictly, since every later decision depends on this reading.",
    d: "The parser implements HTTP/1.1 text framing, HTTP/2 and HTTP/3 binary framing, chunked bodies, header limits and connection reuse. It normalizes paths and headers into the representation that policies see. Strictness matters: if the gateway and the backend disagree on where a request ends, an attacker can smuggle a second request past all gateway policies. It is hard because the specifications leave room for ambiguity and real clients send malformed data.",
    k: ["Strict rejection versus lenient normalization: strict parsing blocks smuggling and breaks sloppy clients, leniency maximizes compatibility and creates disagreement with the backend.", "Translate between protocol versions versus pass through: translation lets each side use its best version, passthrough keeps semantics exact."],
    p: ["Conflicting Content-Length and Transfer-Encoding headers are accepted and the backend reads a different boundary (request smuggling).", "Header names with unusual whitespace or case are forwarded unchanged and bypass a case-sensitive rule."],
    v: "Run a smuggling and malformed-request test suite against the gateway with the real backend behind it. Ambiguous requests are rejected at the gateway, and no request reaches the backend that the gateway's policies did not see.",
    dep: ["listeners-and-tls", "buffer-management"]
  },
  "filter-chain": {
    s: "The ordered pipeline of steps a request passes through, such as authentication, limits and transformation, and the response passes back through in reverse.",
    d: "Each step receives the request context, may read or change it, short-circuit with a response, or continue. Order is semantically critical: authentication before authorization, cheap rejections before expensive ones, limits before body parsing. Steps are configured per route, with global defaults. It is hard because order bugs are security bugs, each step adds latency, and step interactions (one rewriting what another matches on) are rarely visible in configuration.",
    k: ["Fixed phase order versus user-defined order: fixed phases make safe behavior the default and limit flexibility, free order is powerful and lets someone place authentication last.", "Synchronous steps versus asynchronous: synchronous steps are simple to reason about and block the worker, asynchronous ones scale and complicate error handling."],
    p: ["A transformation step runs before authentication and an unauthenticated request triggers an expensive operation.", "An early step buffers the body, defeating streaming for steps that follow."],
    v: "Dump the effective pipeline for a route and send requests that should be stopped at each stage, confirming the expected step rejects it first and later steps never run, as shown in the per-stage trace.",
    dep: ["http-parser", "worker-model", "buffer-management"]
  },
  "connection-pools": {
    s: "Keeps open, reusable connections to backends, avoiding a handshake per request and bounding how many a backend must accept.",
    d: "For each upstream the gateway holds idle connections, multiplexes streams where the protocol allows, and enforces limits on total connections, requests per connection and idle time. Reuse cuts latency and CPU, particularly with encrypted backends. It is hard because a pool must detect connections the backend or a middlebox closed silently, balance reuse with spreading load across instances, and drain on configuration change without dropping requests in flight.",
    k: ["Large pools versus small: large pools absorb bursts and can overwhelm a backend, small pools protect it and make requests queue.", "HTTP/1.1 keepalive versus multiplexed streams: keepalive needs many connections for concurrency, multiplexing needs few and lets one stalled connection block many requests."],
    p: ["A backend closes idle connections before the gateway's idle timeout and the first request on each stale connection fails.", "Pool limits per node are multiplied by fleet size and exceed the backend's connection capacity."],
    v: "Send steady traffic and watch connection counts: they stay under the configured cap, handshakes per request approach zero, and after a backend restart errors from stale connections remain at or near zero.",
    dep: ["listeners-and-tls", "worker-model", "upstream-pools"]
  },
  "worker-model": {
    s: "How the process uses threads or processes to serve many connections, usually event loops pinned to cores with no shared locks on the hot path.",
    d: "Typical designs run one event-driven worker per core, each owning its connections, with non-blocking I/O and shared-nothing state, plus separate threads for slow work. Configuration updates are applied by swapping an immutable snapshot. It yields high throughput at low memory. It is hard because any blocking call, such as a synchronous lookup or a slow plugin, stalls every connection on that worker, and uneven connection assignment leaves one worker overloaded.",
    k: ["Event loop workers versus thread per request: event loops handle many idle connections cheaply and punish blocking code, threads are simple and cost memory per connection.", "Multiple processes versus threads: processes isolate crashes and duplicate memory and state, threads share state and share failure."],
    p: ["A plugin makes a blocking network call and the worker's other connections stall.", "Connections are unevenly spread, so one core saturates while others idle."],
    v: "Load test with a mixed workload and view per-worker CPU and event-loop lag. All workers run within a similar range, and injecting a slow plugin shows up as measured loop lag, not as unexplained latency.",
    dep: ["listeners-and-tls"]
  },
  "buffer-management": {
    s: "Decides whether bodies are streamed through or held in memory or on disk, and bounds the memory any request or connection may use.",
    d: "Streaming forwards bytes as they arrive and uses little memory. Policies that need the whole body, such as signature checks, schema validation, transformation and caching, force buffering up to a limit, often spilling to disk. Backpressure slows a fast sender when the receiver is slow. It is hard because buffering multiplies memory by concurrency, slow clients hold buffers for a long time, and one buffering step quietly disables streaming for every later step.",
    k: ["Buffer small bodies, stream large ones versus always stream: thresholds give the policies they need cheaply, always streaming limits what can be inspected.", "Spill to disk versus reject over the memory limit: spilling serves big uploads and slows with disk I/O, rejecting is predictable and limits use cases."],
    p: ["Slow uploaders each hold a large buffer and together exhaust memory (slow-body attack).", "Missing backpressure lets a fast client fill memory while a slow backend drains."],
    v: "Upload a large file through a route with and without buffering policies and monitor memory: streaming routes stay flat, buffering routes stay below the configured cap, and 1000 slow uploaders do not exceed the global limit.",
    dep: ["http-parser", "worker-model"]
  },
  "secrets-store": {
    s: "Holds private keys, certificates, signing keys and credentials the gateway needs, delivered securely and refreshed without restarts.",
    d: "Secrets come from a vault or the platform's secret mechanism, are delivered to nodes over authenticated channels, kept in memory or protected files, and reloaded on rotation. They include TLS private keys, upstream credentials, token-signing keys and shared secrets for signature checks. It is hard because the gateway holds the keys to everything it protects, so a node compromise is a total compromise, rotation must not drop traffic, and configuration must reference secrets and not contain them.",
    k: ["Secrets pulled at runtime versus embedded in configuration: runtime retrieval keeps them out of repositories and adds a dependency, embedding is simple and leaks widely.", "Hardware-protected keys versus software keys: hardware protection resists extraction and limits throughput and portability."],
    p: ["Secrets are included in configuration exports, debug dumps or logs.", "Rotation updates the store but nodes keep using the old value until restart."],
    v: "Rotate a certificate and a signing key during live traffic and confirm new handshakes use the new certificate, no requests fail, and searches of configuration exports and logs find no secret material.",
    dep: ["state-store", "audit-trail"]
  },
  "plugin-runtime": {
    s: "The mechanism that loads and runs operator-written extensions inside the request path, with defined hooks, data access and limits.",
    d: "Plugins attach at points in the request lifecycle, such as access, header filter, body filter and log phases, and receive an API to read and change the request, call out, and share state. They may be native modules, scripts in an embedded interpreter, or modules in a sandboxed bytecode runtime. It makes the gateway adaptable. It is hard because a plugin shares the process with every request: a slow or crashing one affects everything, and API stability is a promise to every plugin author.",
    k: ["In-process plugins versus out-of-process: in-process is fast and a defect can crash or stall the gateway, out-of-process isolates faults and adds a hop per call.", "Rich API versus narrow API: a rich API enables more and is hard to keep stable, a narrow one is safe and sends authors to workarounds."],
    p: ["A plugin does synchronous network I/O in the request path and a slow dependency stalls the worker.", "A gateway upgrade changes a plugin API and custom plugins break without notice."],
    v: "Run a load test with the plugin enabled and measure added latency per request. Force it to throw and to hang, and confirm the gateway isolates the failure per its policy and keeps serving other routes.",
    dep: ["filter-chain", "worker-model", "plugin-phases"]
  },
  "plugin-phases": {
    s: "The defined stages at which plugins run, and the rules that order plugins within a stage, so behavior is deterministic.",
    d: "A request moves through phases: connection, request headers, request body, upstream selection, response headers, response body and logging. Each plugin declares its phases and a priority, and configured scope (global, route, consumer) decides which instances apply and which override. It makes interactions predictable. It is hard because priorities are numbers chosen by different authors, scope merging rules are subtle, and a plugin placed in the wrong phase cannot do its job, such as rejecting after the body was sent.",
    k: ["Explicit priority numbers versus declared dependencies: numbers are simple and arbitrary, dependency declarations are clearer and need a solver and cycle handling.", "Most-specific scope wins versus merge: most-specific is easy to predict and duplicates configuration, merging avoids repetition and surprises."],
    p: ["Two plugins with equal priority run in an undefined order that changes after a restart.", "A route-level setting silently replaces a global security plugin instead of adding to it."],
    v: "Print the resolved plugin order for a route and a consumer, then send a request and compare to the per-plugin timing trace. Order is identical across nodes and restarts.",
    dep: ["filter-chain", "declarative-config"]
  },
  "sandboxed-extensions": {
    s: "Runs untrusted or third-party extension code in an isolated runtime with capped memory, time and capabilities.",
    d: "Extensions compiled to a portable bytecode run in a runtime that denies direct system access and exposes only a host interface for reading and changing requests. Limits cap instructions, memory and time per call. It allows multiple teams and customers to add logic safely, in several source languages. It is hard because the host interface is the security boundary and must stay small, each call across it costs time, and debugging inside the sandbox is harder.",
    k: ["Sandbox with a narrow host API versus trusted native code: a sandbox contains defects and costs per-call overhead, native code is fastest and can take down the process.", "Per-request instance versus reused instance: fresh instances isolate state and cost startup time, reuse is fast and can leak data between requests."],
    p: ["A reused instance keeps state from one request and exposes it to the next caller's request.", "No time limit is configured and an infinite loop pins a worker."],
    v: "Load an extension that loops forever, allocates without bound and tries to read a file. Each is stopped or denied within the configured limits, an error is logged with the extension's name, and other routes are unaffected.",
    dep: ["plugin-runtime", "worker-model", "plugin-phases"]
  },
  "declarative-policies": {
    s: "Policies written as configuration or a small constrained language, such as conditions and actions, instead of general programs.",
    d: "A policy lists conditions on request attributes and actions such as add header, reject, route or limit, in a format that can be validated, diffed, tested and analyzed before deployment. The gateway interprets it with bounded time. It covers most needs without code. It is hard because the language tends to grow toward a full programming language with unclear semantics, and because policy mistakes are still logic mistakes that need tests and review.",
    k: ["Constrained language versus general scripting: a constrained language is analyzable and bounded, scripting is expressive and brings loops, state and unbounded cost.", "Policies attached to routes versus in a shared library: shared libraries give consistency and a wide blast radius when changed."],
    p: ["An expression error evaluates to false, and a deny rule silently never matches.", "A shared policy is edited for one API and changes behavior of fifty others."],
    v: "Run the policy test suite with request fixtures covering each rule and its negation, and apply a deliberately broken policy in dry-run mode. The broken one is rejected before reaching any node.",
    dep: ["declarative-config", "config-validation", "filter-chain"]
  },
  "external-processing": {
    s: "Calls an external service during a request so it can inspect or alter the request or response, for example for content scanning or custom authorization.",
    d: "At a chosen phase the gateway sends headers, and optionally the body, to an external server over a fast RPC and applies the returned instructions: continue, change, or reject. It allows extension in any language and shared services such as malware scanners or fraud checks. It is hard because the external call is on the latency path of every matching request, requires buffering when the body is sent, and needs explicit behavior for slow or unreachable processors.",
    k: ["External service versus in-process plugin: external is language-free and independently deployed and costs a hop, in-process is faster and ties versions together.", "Fail open versus fail closed on processor errors: open keeps availability and skips the check, closed keeps the guarantee and creates an outage."],
    p: ["The processor is overloaded and its latency becomes every request's latency.", "Bodies are sent to the processor without size limits and memory spikes on both sides."],
    v: "Stop the processor and send traffic. Confirm the gateway applies the configured failure mode within the timeout, logs the cause and recovers automatically, and that added latency with it healthy matches the budget.",
    dep: ["filter-chain", "retries-and-timeouts", "buffer-management", "connection-pools"]
  },
});
