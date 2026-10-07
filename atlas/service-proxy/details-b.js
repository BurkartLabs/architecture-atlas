// Details for the service proxy plate, part 2: routing, policy filters, HTTP processing, extensions.
ATLAS.details("service-proxy", {
  "virtual-hosts": {
    s: "Groups routes by the request's authority, so one listener can serve many names, each with its own route table and per-host policy.",
    d: "After the connection manager parses a request, it selects a virtual host by matching the authority header or the HTTP/2 authority pseudo-header against domain patterns: exact names first, then wildcard prefixes and suffixes, then a catch-all. The chosen host supplies its routes and any host-level settings such as rate limits or required headers. Matching is by pattern specificity, not by order. It is hard because authority is client-controlled, so a mismatched or missing value must fall to a safe default, and because overlapping wildcards across owners can silently capture another team's traffic.",
    k: ["Exact-then-wildcard precedence versus first-match ordering: precedence is predictable regardless of file order, but makes an unexpectedly specific pattern easy to overlook.", "A catch-all virtual host versus rejecting unknown authorities: a catch-all keeps odd clients working, but exposes internal routes to arbitrary names."],
    p: ["A wildcard host defined by one team captures requests meant for another team's more specific name added later.", "Requests with an absent or port-suffixed authority miss every host and return no-route errors."],
    v: "Send requests with the same path to three different authority values, including one unknown, and confirm each reaches the intended cluster, and the unknown one receives the defined default or rejection.",
    dep: ["http-connection-manager", "route-table"]
  },
  "route-table": {
    s: "An ordered list of match conditions and actions within a virtual host, evaluated to pick the upstream cluster and behavior for a request.",
    d: "Each route pairs a match, on path, headers, query parameters or other attributes, with an action: forward to a cluster, redirect, or return a direct response. Routes are evaluated in order and the first match wins. The action carries settings such as timeout, retry policy, hash policy and header rules. Large tables are compiled into prefix tries or hash maps so lookup cost does not grow linearly. It is hard because ordering errors are silent: a broad route placed above a narrow one makes the narrow one unreachable, and nothing reports it.",
    k: ["First-match ordering versus most-specific-wins: first-match is simple and explicit, but order bugs hide routes, while specificity needs a defined ranking.", "Dynamic route updates versus static tables: dynamic updates allow instant rollout, but every update must be validated for shadowed or unreachable routes."],
    p: ["A catch-all prefix placed first shadows every later route, and the fault is found only when traffic goes to the wrong place.", "A route referencing a missing cluster passes validation and returns errors only when it is first matched."],
    v: "Send requests matching each route, including edge cases at prefix boundaries, and confirm the access log shows the intended route name and cluster. Reorder two routes and confirm behavior changes as predicted.",
    dep: ["header-path-matching", "upstream-clusters", "per-route-overrides"]
  },
  "header-path-matching": {
    s: "The conditions a route can test: exact, prefix, suffix and pattern matches on the path, plus headers, query parameters, method and other request attributes.",
    d: "Path matchers support exact, prefix at segment boundaries, and regular expressions; header matchers support presence, exact, range and pattern tests with optional inversion. Matching works on the normalized path, so decoding and dot-segment removal happen first. Regular expressions are compiled once and must have bounded cost. Matching can also use request metadata such as the authenticated identity or a dynamic metadata value set by an earlier filter. It is hard because ambiguity between the proxy's view of the path and the upstream's view creates routing bypasses.",
    k: ["Prefix matching at segment boundaries versus raw string prefix: segment matching avoids accidentally matching a longer name, but surprises authors who expect plain prefixes.", "Regular expressions versus structured matchers: expressions are flexible, but cost more CPU, risk pathological patterns and are harder to review."],
    p: ["The proxy matches a decoded path while the upstream decodes twice, so an encoded request bypasses an access rule.", "A pattern with nested quantifiers takes seconds on crafted input, stalling a worker's event loop."],
    v: "Send paths with encoded slashes, dot segments, trailing slashes and case differences against each matcher type, and confirm each routes exactly as documented, with none reaching a route it should not.",
    dep: ["http-normalization", "route-table"]
  },
  "weighted-splits": {
    s: "Divides matching traffic among several clusters by configured weights, used for canary releases, gradual migrations and traffic shifting.",
    d: "A route lists several clusters with integer weights. For each request the proxy draws a number and selects a cluster in proportion, or uses a stable value such as a header or cookie hash so one caller stays on one version. Weights can be changed live through configuration, shifting traffic gradually. Each cluster keeps its own load balancer and health state. It is hard because the split is statistical, so small weights over short windows give noisy results, and stickiness conflicts with exact proportions.",
    k: ["Random per-request selection versus hash-based stickiness: random matches weights closely, but a user may see versions flip, while hashing keeps users stable and skews the proportions.", "Splitting at the route versus at the endpoint level: route splits give clean per-version statistics, endpoint splits are simpler but blend versions together."],
    p: ["A canary at one percent receives too little traffic to detect a defect before the weight is increased.", "Weights set across routes and across clusters multiply unexpectedly, sending far less to the new version than intended."],
    v: "Set a 90/10 split, send ten thousand requests and confirm the per-cluster counters fall within sampling error of 90/10. Change to 50/50 and confirm the ratio shifts within the propagation time.",
    dep: ["route-table", "upstream-clusters", "hash-policy"]
  },
  "request-mirroring": {
    s: "Copies a fraction of live requests to a second cluster and discards its responses, so a new version can be tested against real traffic without affecting users.",
    d: "On a matching route the proxy forwards the request to the primary cluster as usual and also sends a copy to the shadow cluster, with the authority marked as shadowed, then ignores the shadow response. Mirroring is asynchronous, with the shadow request's latency and failures kept off the primary path. Only a sampled percentage can be mirrored. It is hard because the copy executes real operations: a mirrored write, payment or email repeats a side effect, and request bodies must be buffered for the copy, which costs memory.",
    k: ["Mirroring live traffic versus replaying recorded traffic: live mirroring is current and zero-effort, but side effects cannot be controlled as they can in a replay environment.", "Fire-and-forget copies versus waiting on the shadow: fire-and-forget protects user latency, but loses any comparison of results."],
    p: ["A mirrored write endpoint runs against a production-connected shadow service and doubles side effects.", "Buffering large bodies for the copy raises the proxy's memory use and slows the primary request."],
    v: "Mirror ten percent of traffic to a logging-only cluster, confirm that cluster receives about that share with the shadow marker, and that primary latency and responses are unchanged when the shadow is stopped.",
    dep: ["route-table", "upstream-clusters", "buffering-watermarks"]
  },
  "redirects-rewrites": {
    s: "Route actions that change the request's host or path before forwarding, or answer directly with a redirect or fixed response instead of contacting an upstream.",
    d: "A prefix rewrite replaces the matched path prefix, a pattern rewrite edits the path with captures, and a host rewrite sets the authority sent upstream, optionally from a header or from the selected endpoint's name. Redirect actions answer with a status and location, including scheme upgrades. Direct responses return fixed status and body, useful for maintenance pages. It is hard because rewrites interact with matching and with the application: the upstream may generate absolute links using the rewritten host or path, so the client receives URLs that do not work.",
    k: ["Rewriting at the proxy versus fixing paths in the upstream: proxy rewrites let legacy services move without changes, but hide the real path from the service and complicate its link generation.", "Redirecting clients versus rewriting transparently: redirects make the new location visible and cacheable, but cost a round trip."],
    p: ["A prefix rewrite strips a segment and the upstream emits redirects to paths that lose the original prefix.", "A scheme redirect loops forever because the proxy sees plain traffic from a front balancer that already terminated TLS."],
    v: "Request a path under a rewritten prefix and confirm the upstream log shows the rewritten path and host while the client sees the original. Request a redirected path and confirm the status and location header.",
    dep: ["route-table", "header-manipulation"]
  },
  "hash-policy": {
    s: "The part of a route that names which request attributes, such as a header, cookie, source address or query parameter, supply the key for hash-based host selection.",
    d: "When a cluster uses a hashing balancer, the route decides what is hashed. Policies list sources in order: a header value, a cookie that the proxy can create if missing, the connection's source address or a query parameter. The first that yields a value produces a hash passed to the load balancer, which maps it to a host. If none yields one, selection falls back to random. It is hard because the key must be stable per caller and well distributed, and because a request with no key silently loses affinity.",
    k: ["Hashing a user or session key versus the source address: user keys give true affinity across devices and networks, but source addresses need no application support and break behind shared gateways.", "Generating a cookie versus requiring a client key: a proxy-issued cookie gives affinity to unmodified clients, but adds state the client may discard."],
    p: ["Many clients sit behind one address, so the source-address hash sends them all to one host.", "A key with few distinct values, such as a tenant with one dominant customer, concentrates load on a single host."],
    v: "Send a thousand requests across fifty distinct keys and confirm each key always reaches the same host while the keys spread across hosts. Send requests with no key and confirm they spread randomly.",
    dep: ["route-table", "ring-hash", "permutation-hashing"]
  },
  "per-route-overrides": {
    s: "Settings attached to one route or virtual host that replace listener-wide defaults, such as timeouts, filter behavior, limits and policy.",
    d: "Many filters have a default configuration at the chain level and accept an override on a specific virtual host, route or weighted cluster. When a request matches, the filter finds the most specific override and applies it: disabling authentication on a health route, tightening a rate limit on a costly endpoint, or extending a timeout for uploads. The proxy evaluates overrides at request time, so the same filter chain serves very different policies. It is hard because the effective policy for a request is the merge of several layers, and operators struggle to predict it.",
    k: ["Per-route overrides versus separate listeners per policy: overrides share one chain and keep configuration compact, but make the effective policy implicit and layered.", "Override replacing the whole setting versus merging fields: replacement is predictable, while merging reduces repetition but obscures what is inherited."],
    p: ["An override disabling authentication is added for a debug path and later matches a broader prefix than intended.", "A route-level timeout longer than the listener's idle timeout is never reached because the connection closes first."],
    v: "Fetch the effective configuration for three routes from the admin interface and confirm each shows its resolved timeout, limit and authentication setting, then verify one by exceeding each limit.",
    dep: ["route-table", "http-filter-chain"]
  },
  "local-rate-limit": {
    s: "A token-bucket limiter evaluated inside each proxy with no network call, which caps the request or connection rate that one proxy instance will accept.",
    d: "Each proxy holds a bucket that refills at a set rate up to a maximum burst. A request takes a token or is rejected immediately with an overload response, optionally with headers telling the client when to retry. Buckets can be selected by descriptor, such as per route or per client address. Because each proxy counts alone, the fleet's real limit is the per-proxy limit multiplied by the number of proxies, and with threads each holding their own bucket the limit is also divided among workers.",
    k: ["A local limiter versus a global one: local has no extra latency and no dependency, but cannot enforce an exact fleet-wide rate when load is uneven.", "Allowing bursts versus a strict rate: burst capacity tolerates normal spikes, but lets a client briefly exceed the average."],
    p: ["The fleet scales out and the effective total limit rises with it, so the protected service sees more than planned.", "Per-worker buckets are unevenly loaded and reject requests while another worker still has tokens."],
    v: "Send traffic at twice the configured rate to one proxy and confirm roughly half is rejected with the limit response and a retry hint, and the upstream sees no more than the configured rate.",
    dep: ["http-filter-chain", "thread-local-config", "timers-scheduling"]
  },
  "global-rate-limit": {
    s: "A limiter that asks a shared external service whether a request is allowed, so many proxies enforce one combined limit across the whole fleet.",
    d: "For each request the filter builds descriptors, key and value pairs such as client identity and route, and sends them to a rate limit service that holds counters in a fast shared store. The service answers allow or deny, and the proxy acts accordingly. To avoid a call per request, designs batch or pre-fetch quota. It is hard because it adds a network dependency to the request path: the proxy must decide in advance whether to fail open or closed when the service is slow or down, and the service becomes a hot, shared bottleneck.",
    k: ["Fail open versus fail closed when the limiter is unreachable: fail open preserves availability but removes the protection exactly when something is wrong, fail closed does the reverse.", "A call per request versus local quota leasing: per-request calls are exact, but add latency and load, while leasing is cheap and allows overshoot."],
    p: ["The rate limit service becomes slow, and every request on the fleet waits for its timeout.", "A descriptor with unbounded values, such as a raw path, creates millions of counters in the shared store."],
    v: "Run three proxies each receiving a third of the traffic against a shared limit and confirm the total admitted matches the limit. Stop the service and confirm the configured fail-open or fail-closed behavior.",
    dep: ["http-filter-chain", "per-route-overrides", "timeouts-deadlines"]
  },
  "header-manipulation": {
    s: "Adds, sets, appends or removes request and response headers according to configuration, including values computed from connection and request attributes.",
    d: "Rules can sit at the listener, virtual host, route or cluster level and run in a defined order on both request and response paths. Values may be literals or formatted from variables such as the client address, the negotiated protocol, the authenticated identity or an upstream header. The proxy also adds and strips headers itself: forwarded-address chains, request identifiers and trace context. It is hard because headers are a trust boundary: internal headers that carry identity or routing hints must be stripped from untrusted inputs, or any client can forge them.",
    k: ["Stripping internal headers at the edge versus trusting them: stripping prevents forgery, but requires every proxy at a boundary to know which headers are internal.", "Appending to forwarding headers versus replacing them: appending preserves the chain through multiple proxies, but lets clients inject entries unless the number of trusted hops is configured."],
    p: ["A client sends its own identity header, the proxy passes it along, and a downstream service trusts it.", "Header rules at several levels apply in an order nobody documented, and a later rule overwrites an earlier one."],
    v: "Send a request containing a forged internal identity header and confirm the upstream receives none, then confirm the proxy-added headers appear with correct values and the response headers are modified as configured.",
    dep: ["http-filter-chain", "per-route-overrides"]
  },
  "authn-filters": {
    s: "Filters that establish who the caller is, by verifying a token's signature and claims or a client certificate, and record the result for later filters to use.",
    d: "A token filter extracts a bearer token from a header, cookie or query parameter, fetches or caches the issuer's signing keys, validates signature, expiry, audience and issuer, and writes claims into request metadata. Other filters handle basic credentials or key lookups, or run a login redirect flow with session cookies. Certificate-based identity arrives from the TLS layer. Per-route requirements say which providers satisfy which route. It is hard because verification must be fast and cached, key rotation must be handled, and failing to enforce on one path leaves it open.",
    k: ["Verifying locally versus calling an identity service per request: local verification is fast and keeps working offline, but cannot honor revocation before expiry.", "Authentication required by default versus per route: default-required is safer, but every public route must be explicitly exempted."],
    p: ["Signing keys are cached forever and a rotated key makes every valid token fail until restart.", "A token is validated for signature but its audience is not checked, so a token meant for one service works on all."],
    v: "Send requests with a valid token, an expired one, one with the wrong audience and none, and confirm only the first succeeds and each failure returns the correct status with a distinct reason in the log.",
    dep: ["http-filter-chain", "mutual-tls", "per-route-overrides"]
  },
  "authz-filters": {
    s: "Filters that decide whether an authenticated caller may perform the request, evaluating allow and deny rules over identity, path, method, headers and destination.",
    d: "Rules are lists of policies, each a set of permissions describing what is requested and principals describing who may request it, combined as allow, deny or audit actions. They run in the network filter chain for connections or in the HTTP chain for requests. Principals come from mutual TLS identity, token claims or addresses. Evaluation uses compiled matchers in the request path with no external call. It is hard because deny must override allow predictably, and the rules are only as good as the identity data they read.",
    k: ["Local rule evaluation versus consulting a policy service: local is fast and available, but policy changes propagate with push delay and logic is limited to what rules can express.", "Layer 4 authorization versus layer 7: layer 4 only needs identity and port and is cheap, while layer 7 can reason about paths and methods but needs parsing."],
    p: ["Rules written against path match the raw path, and an equivalent encoded path passes through unmatched.", "An empty allow list is interpreted as allow everything in one mode and deny everything in another."],
    v: "For a policy allowing one identity to call one method on one path, send nine combinations of identity, method and path, and confirm only the single permitted combination succeeds.",
    dep: ["http-filter-chain", "network-filter-chain", "header-path-matching", "mutual-tls"]
  },
  "external-authz": {
    s: "Delegates the allow or deny decision to a separate service, by sending it the request's attributes and acting on its answer.",
    d: "The filter pauses the request, sends selected headers and metadata, and optionally the body, to an authorization service over an RPC or HTTP call, then forwards or rejects according to the reply. The reply can also add or remove headers, which lets the service inject identity for upstreams. Results can be cached briefly. It is used when decisions need data or logic the proxy cannot hold, such as a user database or complex business rules. It is hard because every request now depends on the service's latency and availability.",
    k: ["An external decision service versus in-proxy rules: external allows arbitrary logic and fresh data, but adds a network hop, a failure mode and a latency floor to every request.", "Caching decisions versus asking each time: caching cuts load and latency, but delays revocation by the cache lifetime."],
    p: ["The service is slow, and with no timeout configured every request in the fleet waits on it.", "The failure mode is set to allow, so an outage of the service silently disables all authorization."],
    v: "Point the filter at a service that denies one user, confirm that user is rejected and others pass, then stop the service and confirm the configured failure behavior, with the added latency visible in timing statistics.",
    dep: ["http-filter-chain", "timeouts-deadlines", "header-manipulation"]
  },
  "fault-injection": {
    s: "Deliberately delays or fails a configurable fraction of requests, so teams can test how callers behave when a dependency is slow or broken.",
    d: "Rules match requests and, with a set probability, add a fixed delay, return a chosen error status, or abort a stream. Selection can be scoped by header, so a test client triggers faults while others are unaffected. The filter sits early in the chain, before routing to the upstream, so it simulates failure without involving the real service. It is hard because faults injected in production require strict scoping and an obvious off switch, and the results are only useful if callers' retries and timeouts are being observed.",
    k: ["Injecting at the proxy versus in the service: the proxy needs no code changes and works for any service, but cannot simulate failures from inside the service, such as partial results.", "Header-triggered faults versus percentage of all traffic: header triggers are safe in production, while random percentages exercise real mixed traffic but risk real users."],
    p: ["A fault rule left enabled after a test keeps failing a fraction of real production traffic.", "Injected delays are counted by retry and timeout logic, producing a retry storm that tests the wrong thing."],
    v: "Enable a rule returning errors for requests carrying a test header, confirm only those requests fail and the upstream sees none of them, then remove the rule and confirm normal responses resume.",
    dep: ["http-filter-chain", "header-path-matching"]
  },
  "http-connection-manager": {
    s: "The network filter that turns a connection's bytes into HTTP streams, owns per-connection and per-stream state, and drives each request through routing and the filter chain.",
    d: "It selects a codec for the connection, creates a stream object for each request and runs the HTTP filter chain over it. It enforces timeouts for idle connections, request headers, whole requests and streams, limits header size and counts, generates request identifiers, applies forwarded-address rules, and creates local replies for errors. It manages the lifetime of each stream through response completion and resets. It is hard because it holds the most per-request state in the proxy and sits where every protocol error and abuse pattern arrives.",
    k: ["Strict limits on headers and streams versus permissive defaults: strict limits blunt abuse, but reject unusual legitimate clients.", "Generating local error responses versus passing upstream errors through: local replies are consistent and explain proxy-side failures, but can mask the upstream's own message."],
    p: ["No header timeout is set, and slow clients hold thousands of connections open by sending headers one byte at a time.", "A stream is destroyed while a filter still holds a reference, producing a crash on a rare timing."],
    v: "Send oversized headers, a slow-header client, and a well-formed request, and confirm the first two are rejected or timed out with the right status and counters, while the third succeeds and is logged.",
    dep: ["network-filter-chain", "http1-codec", "http2-codec", "http-filter-chain", "timers-scheduling"]
  },
  "http1-codec": {
    s: "Parses and generates HTTP/1.1 messages on a connection, handling framing, keep-alive, pipelining, chunked bodies and upgrades.",
    d: "The codec reads a byte stream, finds message boundaries from the start line, headers and either content length or chunked encoding, and produces header and body events. In the other direction it serializes responses. It supports one request at a time per connection in practice, so concurrency needs many connections. It must enforce strict parsing, since lenient handling of malformed framing, conflicting lengths or invalid header characters is the root of request smuggling when two parsers disagree. It is hard because real clients and servers send non-compliant messages, and strictness breaks some of them.",
    k: ["Strict parsing versus tolerance of legacy clients: strictness removes smuggling ambiguity, but rejects some clients and servers that have long worked.", "Allowing pipelining versus processing one request per connection at a time: pipelining saves round trips, but complicates ordering and error handling."],
    p: ["A request with both content length and chunked encoding is forwarded with one interpretation while the upstream uses the other, enabling smuggling.", "A response without a length is read until the connection closes, which holds a pooled connection forever."],
    v: "Send requests with conflicting length headers, invalid header names, and bare line feeds, and confirm each is rejected with a clear error and never forwarded upstream, while a normal chunked request succeeds.",
    dep: ["http-connection-manager", "buffer-management"]
  },
  "http2-codec": {
    s: "Implements HTTP/2 framing on a connection: multiplexed streams, header compression, per-stream and per-connection flow control, priorities and graceful shutdown.",
    d: "One connection carries many concurrent streams, each with its own state machine. Headers are compressed with a shared table, which makes them stateful per connection. Settings frames negotiate limits such as concurrent streams, frame size and window size. Flow control is applied per stream and per connection and must be respected on both the downstream and upstream sides. It is hard because the protocol has many abuse vectors: floods of settings, pings, resets or tiny frames can cost the proxy far more than the sender, so every frame type needs a rate limit.",
    k: ["A high concurrent stream limit versus a low one: high limits improve throughput on few connections, but let one client occupy more worker time and memory.", "Keeping streams independent versus sharing connections between clients upstream: sharing is efficient, but a single connection failure resets all its streams."],
    p: ["A client sends a rapid stream of resets after each request, forcing work for streams that are immediately cancelled.", "Window sizes left small throttle long responses to a fraction of the link's bandwidth."],
    v: "Open a hundred concurrent streams on one connection, confirm they all complete with correct per-stream ordering, then send a reset flood and confirm the connection is closed by the protective limit.",
    dep: ["http-connection-manager", "stream-flow-control", "buffer-management"]
  },
  "http3-codec": {
    s: "Implements HTTP over a multiplexed, encrypted transport carried on UDP, avoiding head-of-line blocking between streams and allowing connections to survive address changes.",
    d: "The transport runs over UDP datagrams and includes its own encryption, loss recovery, congestion control and stream multiplexing. The HTTP layer maps requests onto transport streams with a separate header compression scheme. Connection identifiers let a connection continue when a client changes network. Servers advertise availability through an alternative service header over an earlier protocol, since clients must discover support. It is hard because the work happens in user space for every packet, with more CPU per byte than a kernel stack, and middleboxes often block or rate-limit UDP.",
    k: ["Offering HTTP/3 versus staying on HTTP/2: HTTP/3 helps lossy and mobile networks, but needs UDP reachability, costs more CPU, and requires a fallback path.", "Routing by connection identifier versus by address tuple: identifiers keep connections alive across address changes, but a load balancer must understand them to keep packets on one proxy."],
    p: ["Packets for one connection are spread over several proxy instances by a balancer that only hashes addresses, and the connection fails.", "A network blocks UDP, and clients with no fast fallback pause before retrying on the older protocol."],
    v: "Fetch a resource over the newer protocol, switch the client's network address mid-download and confirm the transfer continues, then block UDP and confirm the client falls back to HTTP/2 and succeeds.",
    dep: ["http-connection-manager", "udp-proxying", "tls-termination", "stream-flow-control"]
  },
  "http-filter-chain": {
    s: "An ordered list of filters that each see a request's headers, body and trailers on the way in, and the response on the way out, able to modify, pause or end the stream.",
    d: "Decoder filters run in order on the request, encoder filters in reverse on the response. A filter can continue, stop and buffer the stream, modify data, or send a local reply that ends processing. Typical filters include authentication, rate limiting, header changes, compression, fault injection and finally the router, which is the terminal filter that sends the request upstream. Filters communicate through shared per-stream metadata. It is hard because filters pause and resume asynchronously, so state at any point may be partly received, and a stream can be reset at any step.",
    k: ["A fixed order of filters versus per-route chains: a fixed chain is easy to reason about, but per-route differences must then be expressed as overrides or disabled filters.", "Buffering in filters versus streaming data through: buffering gives filters the whole message to inspect, but adds latency and memory per request."],
    p: ["A filter ordered after the router never sees the request, so a security check is silently skipped.", "A filter that stops iteration and never resumes leaves the request hanging until a timeout, with no error."],
    v: "Insert a test filter that stamps a header, confirm it appears at the upstream and the response, and reorder it before and after authentication to confirm each order has its expected effect.",
    dep: ["http-connection-manager", "extension-registry", "per-route-overrides"]
  },
  "stream-flow-control": {
    s: "Window-based back-pressure between downstream and upstream, so a fast sender cannot make the proxy buffer unbounded data for a slow receiver.",
    d: "Each side advertises how much data it will accept. The proxy only reads from the faster peer as quickly as the slower peer can drain. This is done by watermarks on buffers: above a high mark the proxy stops reading from the source and stops granting window, and below a low mark it resumes. In HTTP/2 and HTTP/3 this pairs with the protocol's window updates, so back-pressure propagates all the way to the original sender. It is hard because it must be correct across multiple hops and filters, and a missed resume signal stalls a stream forever.",
    k: ["Propagating back-pressure end to end versus buffering to absorb it: propagation bounds memory, but couples both sides' speeds and can stall a stream.", "Small versus large windows: small windows save memory and limit abuse, but reduce throughput on high-latency links."],
    p: ["A resume notification is lost after a filter pauses the stream, and a large download stalls permanently.", "Window sizes are set only on one side, so the proxy buffers whatever the other side allows."],
    v: "Download a large file through the proxy to a client reading slowly and confirm the proxy's memory stays near the watermark, the upstream send rate drops to the client's rate, and the transfer completes intact.",
    dep: ["buffering-watermarks", "http2-codec", "connection-handling"]
  },
  "buffering-watermarks": {
    s: "Bounded in-memory buffers with high and low watermarks that signal readers and writers to pause or resume, so memory use per request has a ceiling.",
    d: "Data between sockets, codecs and filters sits in buffers made of linked chunks. When a buffer passes its high watermark, a callback tells its producer to pause. When it drains below the low watermark, the producer resumes. Filters that need the whole body, such as those that inspect or retry, set a buffer limit, and exceeding it makes the request fail with a defined error. It is hard because buffering is memory times concurrency: a limit that is fine for one request is dangerous when thousands run at once.",
    k: ["Buffering whole bodies to enable retries versus streaming: buffering allows retries and inspection, but costs memory proportional to body size times concurrency.", "A fixed global limit versus per-route limits: a global limit is simple, but forces one size on both small API calls and large uploads."],
    p: ["Retries are enabled on a route that accepts large uploads, and every in-flight upload is buffered whole in memory.", "Buffer limits differ between layers, and the lowest one truncates requests that the upper layers accepted."],
    v: "Send an upload larger than the buffer limit on a route that buffers, and confirm it is rejected with the documented status while memory use stays bounded. Send the same on a streaming route and confirm it succeeds.",
    dep: ["buffer-management", "http-filter-chain"]
  },
  "rpc-streaming": {
    s: "Support for remote procedure calls over HTTP/2, including long-lived bidirectional streams, status carried in trailers, per-call deadlines, and protocol bridging for browsers and legacy clients.",
    d: "RPC calls are HTTP/2 requests with message framing in the body and the final status in trailers, so the proxy must preserve trailers and cannot treat a 200 response as success. Streaming calls may last hours with messages flowing both ways, so timeouts and buffering must be streaming-aware. Filters can translate between RPC and JSON over HTTP, or between browser-compatible framing and the native protocol. It is hard because the call's real outcome lives in trailers, and routing, retries and statistics must read it.",
    k: ["Treating RPC status as the outcome versus HTTP status: RPC status is accurate, but every filter, counter and retry rule must read trailers.", "Per-message timeouts versus whole-stream timeouts: whole-stream timeouts cut long streams, while per-message idle timeouts keep them alive but allow slow trickles."],
    p: ["A stream timeout copied from unary calls ends a healthy subscription after the same short interval.", "Statistics count every call as success because the HTTP status is 200, even when the trailers carry failures."],
    v: "Run a unary call, a server stream lasting minutes and a bidirectional stream, and confirm each completes, the failure status from a deliberately failing call appears in counters, and the stream is not cut by the unary timeout.",
    dep: ["http2-codec", "timeouts-deadlines", "http-filter-chain", "retries"]
  },
  "websocket-upgrades": {
    s: "Handles requests that switch protocols on an existing connection, such as WebSocket, turning the HTTP exchange into a bidirectional byte stream that is forwarded.",
    d: "The client sends a request asking to upgrade, the proxy forwards it if the route allows that upgrade type, and if the upstream accepts with a switching-protocols response, the connection becomes an opaque two-way stream. Normal HTTP processing stops for that connection, though idle and maximum duration timeouts still apply. The proxy keeps both connections open for as long as either side does. It is hard because upgraded connections are long-lived and hold resources, they bypass many request filters after the switch, and they make draining and rolling updates much slower.",
    k: ["Allowing upgrades per route versus globally: per-route control limits where long-lived connections can appear, but needs explicit configuration for each service that needs them.", "Idle timeout versus application keepalives: a timeout reclaims dead connections, but cuts quiet sessions unless the application sends periodic pings."],
    p: ["Upgraded connections never close during a deploy and keep old proxies alive for days.", "Authorization runs only on the upgrade request, and afterwards the stream carries unchecked messages for hours."],
    v: "Open a WebSocket through the proxy, exchange messages in both directions, leave it idle past the configured timeout and confirm it closes, and confirm an upgrade request to a route that disallows it is refused.",
    dep: ["http-connection-manager", "connection-draining", "tcp-proxy"]
  },
  "http-normalization": {
    s: "Rewrites incoming requests into a canonical form, decoding and cleaning paths and validating headers, so routing and policy see what the upstream will see.",
    d: "Normalization removes dot segments, merges adjacent slashes, optionally decodes percent-encoded characters, rejects invalid characters, lowercases header names and checks method and authority form. It runs before route matching so that matchers and authorization rules apply to the same path the upstream interprets. It also handles forwarding headers and strips connection-specific headers that should not cross a hop. It is hard because every normalization step is a guess about how downstream parsers behave, and a mismatch produces path confusion that bypasses access rules.",
    k: ["Normalizing aggressively versus passing the original path: aggressive normalization closes confusion attacks, but may change the meaning of paths for applications that rely on exact bytes.", "Rejecting ambiguous requests versus rewriting them: rejection is safest, but breaks clients that send unusual but harmless forms."],
    p: ["An encoded slash is decoded by the proxy for matching but forwarded encoded, and the upstream treats it as a different resource.", "Hop-by-hop headers are forwarded, causing confusing behavior in the next proxy."],
    v: "Send requests using dot segments, double slashes, encoded slashes and mixed-case headers to a path protected by an access rule, and confirm the rule applies to every variant and the upstream sees the normalized path.",
    dep: ["http-connection-manager", "http1-codec"]
  },
  "inprocess-filters": {
    s: "Filters compiled into or loaded as native code in the proxy, with direct access to its internals, offering the best performance and the least isolation.",
    d: "A filter implements the interfaces for the network or HTTP chain and is registered with a factory, so configuration can name it. It runs on the worker thread in the same address space as everything else, sees raw buffers and can use the proxy's statistics, timers and async clients. This is how all the built-in filters are written. It is hard because a bug is a bug in the proxy: a crash, a leak or a blocking call takes down every connection on that worker or the whole process.",
    k: ["Native filters versus sandboxed plugins: native gives the lowest overhead and full access, but ties custom code to the proxy's release cycle and trusts it completely.", "Building a custom proxy binary versus loading shared libraries: a custom build gets static checks and safety, but forces your own release pipeline."],
    p: ["A filter does a blocking call on the worker thread, and every connection on that thread stalls with it.", "A filter retains a pointer to stream state after the stream is destroyed, and the proxy crashes intermittently under load."],
    v: "Load a filter that stamps a header, confirm it works under a load of thousands of requests per second, and confirm worker event loop delay statistics are unchanged compared with running without it.",
    dep: ["http-filter-chain", "network-filter-chain", "extension-registry", "event-loop"]
  },
  "sandboxed-plugins": {
    s: "Custom filter logic compiled to a portable bytecode and run in an isolated virtual machine inside the proxy, so a plugin cannot corrupt or crash the host.",
    d: "A plugin is written in any language that compiles to the bytecode, loaded from a file or fetched remotely, and instantiated per worker. It sees the proxy only through a defined binary interface: reading and writing headers and bodies, logging, making calls, and reading shared data. Memory and instruction use can be bounded. Updates can be pushed through configuration without restarting. It is hard because every call crosses the sandbox boundary, which costs time and copies data, and the interface is narrower than native filters.",
    k: ["Sandboxed plugins versus native filters: isolation and language choice are gained, but each call across the boundary costs time and some capabilities are unavailable.", "One virtual machine per worker versus a shared one: per-worker instances avoid locks, but multiply memory and make shared state need an explicit mechanism."],
    p: ["A plugin allocates without limit inside its sandbox, and its memory growth is invisible to the proxy's own accounting.", "A plugin compiled for one interface version silently misbehaves under another after a proxy upgrade."],
    v: "Deploy a plugin that adds a header, update it through configuration under load without restarting, and confirm new requests use the new version. Make a plugin trap and confirm the proxy continues serving.",
    dep: ["http-filter-chain", "extension-registry", "worker-threads"]
  },
  "scripting-filters": {
    s: "Small scripts run inline in the filter chain to inspect or modify requests and responses, for logic too specific to configure and too small to justify a plugin.",
    d: "An embedded script interpreter is called at defined points, request headers, body and response, with an API for reading and writing headers, metadata, making asynchronous calls to other clusters, and returning local replies. Scripts are part of configuration, so changing one needs no build step. Execution is on the worker thread with a coroutine model so that waiting for a call does not block the loop. It is hard because scripts are easy to write and hard to bound: they have no strong typing, can be slow, and can accumulate into undocumented business logic in the network layer.",
    k: ["Inline scripts versus plugins or native filters: scripts need no build and are quick to change, but have weaker tooling, testing and performance guarantees.", "Allowing network calls from scripts versus pure transformation: calls enable richer logic, but make every request depend on another service."],
    p: ["A script reading entire bodies into memory slows every request and consumes memory proportional to body size.", "Logic accumulates in scripts across many routes, and no one can say what the proxy actually does to a request."],
    v: "Install a script that rejects requests missing a header, confirm those are rejected with the chosen status, edit the script through configuration and confirm the change applies without restart.",
    dep: ["http-filter-chain", "extension-registry"]
  },
  "external-processing": {
    s: "Streams request and response headers and bodies to an external service that can inspect or rewrite them, moving custom logic out of the proxy process.",
    d: "The filter opens a bidirectional stream to a processing service and sends the pieces of each message according to a configured mode: headers only, or headers and body, per direction. The service replies with mutations or a local response. Because the service can be written, deployed and scaled independently in any language, it is the most flexible extension model. It is hard because each processed message adds at least a network round trip to the request, and body modes require buffering or streaming coordination.",
    k: ["Out-of-process processing versus in-process code: out-of-process is isolated and independently deployable, but costs latency per message and adds an availability dependency.", "Processing headers only versus bodies too: headers only is cheap, while body processing allows content inspection at much higher cost."],
    p: ["The service stalls, and with no message timeout, requests wait until the overall stream timeout.", "Body processing is enabled on all routes by accident, and large downloads are copied through the service."],
    v: "Attach a service that adds a header to every response, confirm the header appears, measure the added latency per request, and stop the service to confirm the configured failure behavior.",
    dep: ["http-filter-chain", "timeouts-deadlines", "buffering-watermarks"]
  },
  "extension-registry": {
    s: "The table of named extension types and their factories, with typed configuration, that lets configuration select filters, balancers and other components by name.",
    d: "Every pluggable component, such as filters, clusters, load balancers, access loggers, tracers and health checkers, registers a name and a factory, along with a schema for its configuration. When configuration is received, the proxy looks up each referenced type, validates its typed settings and constructs it. Unknown types are rejected before they are applied. The registry also records which extensions are linked into this build, so operators can query what a binary supports. It is hard because the set of extensions is a compatibility contract between control plane and proxy.",
    k: ["Typed, schema-validated configuration versus free-form settings: schemas catch errors before they are applied, but make every extension define and version its schema.", "Linking all extensions versus a minimal build: all extensions maximize flexibility, but increase binary size and attack surface."],
    p: ["The control plane sends a filter type a proxy build does not include, and the update is rejected for the whole fleet segment.", "Two extensions register the same name, and which one wins depends on link order."],
    v: "Query the registry on two builds and confirm the lists differ as expected, send configuration naming an absent extension and confirm it is rejected with the missing name, while the previous configuration stays active.",
    dep: ["config-ack-nack"]
  },
});
