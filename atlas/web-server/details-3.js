// Details for the web server plate, part 3: reverse proxy, load balancing, HTTP protocol engines.
ATLAS.details("web-server", {
  "proxy-handler": {
    s: "The content handler that forwards a request to an upstream and relays its response to the client, coordinating the pool, buffering, timeouts and retry logic.",
    d: "It selects an upstream through the balancer, obtains a connection, sends the built request, reads the response status and headers, applies header and cache rules, and relays the body to the client. State is tracked for both sides at once: the client connection and the upstream connection are each reading and writing, and either may fail first. It is hard because the two sides run at different speeds, errors can occur after part of the response has been sent, and cleanup must release the upstream connection and every buffer on every exit path.",
    k: ["Relay as data arrives versus hold until complete: relaying gives low latency and memory use, but an error midway cannot be retried or replaced with an error page.", "Return upstream errors unchanged versus replace with local pages: unchanged preserves detail for clients, replacement gives a consistent experience."],
    p: ["The upstream fails after headers were sent, so the client receives a truncated body with a success status.", "A path where the upstream connection is not released leaks a connection per failed request until the pool is exhausted."],
    v: "Proxy a request and confirm the client receives the exact status, headers and body bytes sent by the upstream; then kill the upstream mid-body and confirm the client connection is reset rather than ended cleanly.",
    dep: ["upstream-request-build", "upstream-pool", "body-buffering", "streaming-relay", "retries-failover", "upstream-groups"]
  },
  "upstream-request-build": {
    s: "Builds the request sent upstream from the client's: rewrites the target, sets the host, strips hop-by-hop headers, and adds forwarding information about the real client.",
    d: "The method and path are mapped to the upstream, with optional rewriting. The host header is set to the original or the upstream name. Hop-by-hop headers and connection management fields are removed, and forwarding headers record the client address, scheme and original host, appending to any existing chain only if the previous hop is trusted. The protocol version to the upstream is chosen independently of the client's. It is hard because forwarded headers are forgeable if appended blindly, and because differences in the version and body framing must be translated without creating ambiguity.",
    k: ["Append to the forwarded chain versus replace it: appending preserves the path for trusted hops, but lets untrusted clients inject entries.", "Pass the original host versus the upstream's name: the original preserves application behavior such as links, but virtual-host upstreams may need their own name."],
    p: ["The application trusts the first entry in the forwarded chain, which the client supplied.", "The path is decoded and re-encoded differently, so the upstream receives a different resource than the proxy authorized."],
    v: "Send a request with a forged forwarded header and confirm the upstream sees the real client address as determined by the proxy, no hop-by-hop headers, and the expected host and path.",
    dep: ["header-manipulation", "http1-parser", "smuggling-defenses"]
  },
  "upstream-pool": {
    s: "Keeps idle connections to upstreams open for reuse, with limits on idle count, age and requests per connection, saving connection setup and handshake cost.",
    d: "After a response completes, the upstream connection goes into a per-worker idle list for its destination and is reused by the next request. Limits cap idle connections, total age and requests served. A connection is checked for readability to detect closes by the peer before reuse. For multiplexed upstream protocols, one connection serves many streams. It is hard because reuse races: the upstream may close an idle connection at the moment the proxy sends on it, so a request on a reused connection can fail without having been processed, and only some requests are safe to retry.",
    k: ["Keep idle connections versus open per request: pooling saves setup and handshake time, but idle sockets use descriptors and race with peer timeouts.", "Idle timeout shorter than the upstream's versus longer: shorter avoids using connections the peer is about to close, but reduces reuse."],
    p: ["The upstream closes idle connections after five seconds and the proxy keeps them for sixty, producing a steady trickle of reset errors.", "Pool limits per worker multiply by worker count and exhaust the upstream's connection capacity."],
    v: "Send sequential requests and confirm only the first opens a connection to the upstream while the others reuse it, then let it idle past the upstream's timeout and confirm the next request opens a fresh one without error.",
    dep: ["event-notification", "upstream-timeouts", "fd-limits"]
  },
  "body-buffering": {
    s: "Holds request and response bodies in memory, spilling to temporary files past a threshold, so slow clients do not occupy upstream connections and bodies can be retried.",
    d: "Request buffering reads the whole body from the client before connecting upstream; response buffering reads from the upstream into memory buffers and then a disk file as fast as possible, letting the upstream finish while a slow client drains. Buffer sizes, counts and file thresholds are configured per route. It is hard because buffers multiply by connection count, disk spill adds I/O under pressure, and buffering delays the first byte for streaming content unless disabled for those routes.",
    k: ["Buffer responses to disk versus memory only: disk bounds memory under many slow clients, but adds disk I/O and temporary file management.", "Buffer requests fully before forwarding versus stream: full buffering shields the application from slow uploads, but delays it and doubles storage."],
    p: ["Many concurrent large responses spill to a small temporary partition and requests fail with write errors.", "Buffered response for a long-poll or event endpoint never reaches the client until the buffer fills."],
    v: "Download a large response through the proxy using a deliberately slow client and confirm the upstream request completes quickly while the client continues; check temporary file use rises and then is cleaned up.",
    dep: ["buffer-chains", "write-backpressure", "buffering-policy"]
  },
  "streaming-relay": {
    s: "Passes body data between client and upstream as it arrives, with bounded buffers and backpressure in both directions, for large transfers, events and long polling.",
    d: "Each side has a small buffer. Data read from the upstream is written to the client as soon as possible; when the client's socket is not writable the proxy stops reading from the upstream until it drains, and the reverse for uploads. Streaming gives low latency and constant memory. It is hard because both directions must pause and resume correctly, errors on one side have to tear down the other and, because the proxy cannot retry after sending, failures are visible to the client.",
    k: ["Stream with backpressure versus read ahead into buffers: backpressure keeps memory small and bounded, but a slow client holds the upstream connection open.", "Unbuffered for selected routes versus a global default: per-route streaming serves event feeds well, but needs deliberate configuration."],
    p: ["Backpressure is not applied on one direction, so the proxy buffers an unbounded amount from a fast upstream to a slow client.", "A half-closed side is not propagated, leaving a connection open on the other side indefinitely."],
    v: "Relay a multi-gigabyte response to a slow client and confirm proxy memory stays near constant while the upstream send rate falls to match the client's.",
    dep: ["write-backpressure", "event-notification", "buffer-chains"]
  },
  "upgrade-proxying": {
    s: "Switches a connection to another protocol on request, such as WebSocket, and then relays bytes in both directions without interpreting them.",
    d: "The client sends a request asking to upgrade; the proxy forwards the upgrade header pair explicitly, since they are hop-by-hop, and on a switching-protocols answer converts both connections into opaque tunnels. Idle timeouts apply separately, and keepalive pings may be needed to hold the connection through intermediaries. It is hard because the connection now lives long, so draining, reload and limits all interact with it, and because origin checks and authentication that happened at the upgrade request cannot be repeated afterward.",
    k: ["Long idle timeout versus short: long keeps quiet sockets alive without traffic, but holds descriptors for dead peers; short needs application heartbeats.", "Authenticate only at the upgrade versus per message: upgrade-time checks are cheap, but later permission changes are not noticed."],
    p: ["The default read timeout closes quiet WebSocket connections after a minute, and clients reconnect in a storm.", "The origin header is not checked at upgrade, so any web page can open authenticated sockets from a user's browser."],
    v: "Open a WebSocket through the proxy, exchange messages in both directions, leave it idle past the idle timeout and confirm closure at the configured time, and confirm a forged origin is rejected.",
    dep: ["streaming-relay", "http1-parser", "graceful-drain", "upstream-timeouts"]
  },
  "retries-failover": {
    s: "Tries the next upstream when a request fails before any response is delivered, within limits on attempts and time, and only for requests that are safe to repeat.",
    d: "On a connect failure, timeout or selected error status, the handler picks another backend from the group and resends the request, bounded by an attempt count and a total time. A request is retried only if no bytes of the response have been sent and, for non-idempotent methods, only if the failure happened before the request could have been processed. Failures feed passive health state. It is hard because a retry of a request that actually executed duplicates side effects, and a retry storm during an overload multiplies the load.",
    k: ["Retry only idempotent methods versus all: idempotent-only avoids duplicated side effects, but non-idempotent calls fail on a single connection error.", "Retry budget limited to a fraction of traffic versus per-request attempts: a budget prevents retry storms in overload, but a single request may have fewer chances."],
    p: ["A POST that timed out after the backend committed it is retried and the order is placed twice.", "All servers are slow, so every request tries three of them and the load triples."],
    v: "Make one backend refuse connections and confirm requests succeed on the next one with the failure counted; then make a backend time out after processing a POST and confirm it is not retried.",
    dep: ["upstream-groups", "passive-health-checks", "upstream-timeouts", "upstream-pool"]
  },
  "upstream-timeouts": {
    s: "Separate deadlines for connecting to the upstream, sending the request, and waiting for each part of the response, so a stuck application cannot hold a connection forever.",
    d: "The connect timeout bounds the handshake with the backend, the send timeout bounds writing the request between successive writes, and the read timeout bounds the gap between reads, not the total time. Each expiry produces a gateway timeout or bad gateway status and counts as a failure for health tracking. Values are chosen from the application's real latency. It is hard because read timeouts are gaps rather than totals, so a slow trickle never trips them, and because setting them without regard to the client's deadline wastes work on abandoned requests.",
    k: ["Read timeout as the gap between reads versus a total deadline: gap timeouts allow long streams that make progress, but do not bound the total time of a slow-trickle response.", "Short connect timeout versus long: short fails over quickly to healthy backends, but spurious failures appear under brief packet loss."],
    p: ["A long read timeout copied from a report endpoint is applied to the whole site, so slow requests pile up during an outage.", "The proxy waits longer than the client's own timeout and keeps doing work no one will read."],
    v: "Point a route at a backend that accepts but never answers, and confirm a gateway timeout status at the configured read timeout, the failure counted in health state, and the upstream connection closed.",
    dep: ["event-notification", "timeout-budgets", "passive-health-checks"]
  },
  "gateway-protocols": {
    s: "Clients for application protocols other than HTTP, such as a binary gateway interface or a multiplexed application protocol, translating requests into that format and responses back.",
    d: "The handler builds the protocol's records from the request: parameters taken from headers and variables, then the body in framed chunks, and parses the response records into HTTP status, headers and body. Connections are pooled and, for multiplexed variants, shared by several requests. Error output from the application is separated from the response body and logged. It is hard because the translation is a trust boundary: the application derives path and script information from parameters the server computes, and mistakes in splitting a path from its path info have caused execution of uploaded files.",
    k: ["A gateway protocol versus plain HTTP to the application: gateway protocols avoid HTTP parsing and carry server variables, but tie applications to a specific interface.", "Computed server variables versus passing the raw request: computed values are convenient for applications, but a wrong computation reaches the application as trusted data."],
    p: ["A path ending in an uploaded file name with a script suffix is passed to the interpreter, running attacker content.", "Application error output is mixed into the response body and shown to users."],
    v: "Send a request through the gateway client and confirm the application receives the expected parameters and body, headers and status return correctly, and a request to an uploaded file path is not executed.",
    dep: ["upstream-pool", "proxy-handler", "path-resolution"]
  },
  "stream-proxy": {
    s: "Forwards raw TCP connections or UDP datagrams to backends without interpreting HTTP, with the same balancing, health and TLS options, for databases, mail and custom protocols.",
    d: "A separate listener type accepts connections, optionally terminates TLS, selects a backend using the balancer, and relays bytes in both directions until close, with timeouts on idle and on connect. For UDP it tracks a short-lived session per client and forwards datagrams, expiring idle sessions. Name-based selection can use the handshake's server name without decrypting. It is hard because there are no request boundaries: retries, buffering and per-request logging do not apply, and one long connection pins a backend.",
    k: ["Terminate TLS at the proxy versus pass through: termination centralizes certificates and allows inspection, but pass-through keeps the application's end-to-end identity.", "Session tracking for datagrams with idle expiry versus stateless forwarding: tracking keeps a client on one backend, but needs memory and a timeout."],
    p: ["One long-lived connection holds a backend through a drain, so deployments stall until the deadline.", "Idle UDP sessions are never expired and the session table fills."],
    v: "Proxy a plain TCP service and a UDP service, confirm bytes pass unchanged in both directions, a dead backend is skipped, and an idle datagram session expires at the configured time.",
    dep: ["upstream-groups", "event-notification", "tls-handshake", "timeouts"]
  },
  "upstream-groups": {
    s: "Named sets of backend servers with weights, limits and roles such as backup, along with the selection policy and the shared state used to apply it across workers.",
    d: "Each member has an address, weight, maximum connections, failure thresholds and flags for backup or down. The group holds the policy, a shared-memory state of counters and health, and the list of members. Requests choose through the policy, skipping unhealthy members, and fall to backup members only when all primary ones are unavailable. It is hard because the state must be shared by all workers to be accurate, membership changes need to be applied without disturbing existing connections, and per-worker counters drift from true totals.",
    k: ["Shared state across workers versus per-worker state: shared state gives accurate counts and health, but adds locking and shared memory; per-worker is simple but each worker discovers failures separately.", "Static member list versus dynamic membership from a registry: static is predictable, but dynamic fleets need updates without a reload."],
    p: ["Per-worker health state means a failed backend is retried by every worker in turn, multiplying failed requests.", "A weight of zero or a missing backup flag is mistaken for removal, so the member still receives traffic."],
    v: "Define three members with weights two, one and zero and send a thousand requests, and confirm the traffic splits two to one with none to the zero-weight member until others fail.",
    dep: ["shared-memory-zones", "round-robin", "active-health-checks", "passive-health-checks"]
  },
  "round-robin": {
    s: "Cycles through backends in proportion to their weights, producing a smooth interleaving rather than long runs to one server.",
    d: "The smooth variant keeps a running score per member, adds each member's weight every selection, picks the highest and subtracts the total weight from it, producing even interleaving. It needs no knowledge of load and costs one pass over the members. It assumes equal request cost and equal backend capacity per unit of weight. It is hard because real requests differ greatly in cost, so equal counts do not mean equal load, and the sequence restarts at each worker unless state is shared, which clusters traffic.",
    k: ["Weighted round robin versus load-aware choice: round robin is stateless and fast, but ignores differing request cost and backend speed.", "Smooth interleaving versus simple repetition: smooth spreads bursts evenly, but repetition is cheaper to compute and easier to reason about."],
    p: ["Every worker starts its cycle at the first member, so a low-traffic site sends all its requests to one server.", "Long requests pile up on one slow backend because rotation continues regardless."],
    v: "Send ten thousand requests across members of weights five, one and one, and confirm the counts within a small tolerance of seven to one to one, and the longest run to one member is short.",
    dep: ["upstream-groups"]
  },
  "least-connections": {
    s: "Sends each request to the backend with the fewest active requests relative to its weight, adapting to slow servers and uneven request cost.",
    d: "The balancer reads each member's current in-flight count, divided by weight, and picks the lowest, breaking ties by round robin. It adapts quickly when one server slows, because its count grows. Counts are kept in shared memory and updated on start and completion of every request. It is hard because counts lag reality for new or restarted backends, which then receive a flood, and because counts kept per worker give each worker a partial view that leads to herding on one backend.",
    k: ["Least connections versus round robin: least connections protects against slow backends and mixed request cost, but needs accurate shared counts.", "Count requests versus count connections: requests reflect real work, but pooled connections show nothing about it."],
    p: ["A freshly started backend has zero connections and receives every request until its caches warm and it falls over.", "Failed requests that never decrement the counter make a healthy backend look permanently busy."],
    v: "Slow one backend artificially and confirm its share of new requests falls while the others' rise, and that counts return to zero when load stops.",
    dep: ["upstream-groups", "shared-memory-zones", "slow-start-drain"]
  },
  "hash-balancing": {
    s: "Maps a request attribute such as the client address or URL to a backend by hashing, optionally with consistent hashing so membership changes move few keys.",
    d: "The key is hashed and mapped to a backend, either by modulo of the member count or by placing members at many points on a hash ring and choosing the next point clockwise. The same key goes to the same backend, which suits caches and per-user state held in memory. Consistent hashing limits the keys that move when a member is added or removed, and weights are expressed as the number of points. It is hard because hot keys cause hot spots that hashing cannot spread, and plain modulo reshuffles nearly everything on change.",
    k: ["Consistent hashing versus modulo: consistent moves only about one over the member count of keys on change, but is more complex and needs enough points for even spread.", "Hash on client address versus on a request attribute: address is always available, but shared gateways make a few keys very heavy."],
    p: ["A popular URL always hashes to one backend, which becomes overloaded while the others idle.", "Removing a failed member with plain modulo remaps almost all keys and empties every backend's cache."],
    v: "Send a fixed key set, remove one backend, and confirm that only the keys that were on it move, all others keep the same backend, and the spread across members stays within a small tolerance.",
    dep: ["upstream-groups", "cache-key"]
  },
  "two-choice": {
    s: "Picks two backends at random and sends the request to the less loaded one, giving near-optimal balance with a tiny amount of state and no global view.",
    d: "Two members are sampled, uniformly or by weight, and the one with fewer in-flight requests, or lower recent latency, is chosen. This avoids the herding that happens when every balancer sends to the globally least loaded backend at the same moment, and it needs only local counts. It works well across many independent proxies. It is hard because the quality depends on how load is measured: connection counts are crude, and latency estimates need smoothing and decay or they react to noise.",
    k: ["Two random choices versus full least-connections scan: two choices avoid herding and scale to many proxies, but give slightly less even results with one proxy.", "Load measured by in-flight count versus smoothed latency: counts are exact and cheap, while latency reflects true slowness but is noisy."],
    p: ["Load estimates are never decayed, so a backend that had one slow minute is avoided for hours.", "Sampling with replacement picks the same server twice and degrades to random choice."],
    v: "Run a simulated skewed workload with five backends and confirm the maximum load stays within a small multiple of the mean and noticeably below plain random selection.",
    dep: ["upstream-groups", "least-connections"]
  },
  "session-affinity": {
    s: "Keeps a client on the same backend across requests using a cookie, a header value or a hash, for applications that hold session state in memory.",
    d: "The first request is balanced normally and the response sets a cookie naming the backend, or the proxy derives the choice from an existing identifier. Later requests carrying it go to the same member while it is healthy; if it is down they fall to another. Expiry and signing of the cookie are configured. It is hard because affinity fights balance: sticky users do not move when a backend is drained or added, and a failure loses the state held in that backend, so affinity should be a performance aid, not a correctness requirement.",
    k: ["Cookie assigned by the proxy versus application session identifier: proxy cookies work with any application, but need a response header and cookie handling.", "Strict affinity versus preferred affinity: strict honors the application's assumptions, while preferred allows failover and drain at the cost of lost state."],
    p: ["The backend's real address is exposed in the affinity cookie and reveals internal topology.", "Draining a backend never completes because sticky users keep arriving and are sent back."],
    v: "Make a series of requests with the issued cookie and confirm all reach one backend; stop that backend and confirm requests move to another and the cookie is updated.",
    dep: ["upstream-groups", "header-manipulation", "hash-balancing"]
  },
  "active-health-checks": {
    s: "Periodically probes each backend with a synthetic request and marks it up or down based on consecutive passes and failures, independent of real traffic.",
    d: "A timer sends a request to a configured path and judges the answer by status, body match or protocol handshake. Thresholds for consecutive failures and successes prevent flapping, and the interval controls detection time. Results update shared state used by the balancer. Checks run from every proxy or from one place. It is hard because the probe must exercise what real requests need: a shallow check passes while the database behind the application is down, and a deep check can itself overload a struggling backend.",
    k: ["Shallow check of the process versus deep check of dependencies: shallow is cheap and stable, but misses failures that matter; deep catches them but can take a whole fleet out when a shared dependency blips.", "Short interval with low thresholds versus long: short detects failures fast, but flaps on transient errors and adds load."],
    p: ["A deep check fails on a shared database error and marks every backend down, turning a partial failure into a total outage.", "Checks run only at the first startup, and backends that become ready later are never added."],
    v: "Stop a backend and confirm it is marked down within the interval times the failure threshold and receives no traffic; restart it and confirm it returns after the success threshold.",
    dep: ["upstream-groups", "shared-memory-zones", "event-notification"]
  },
  "passive-health-checks": {
    s: "Marks a backend as failed after real requests to it fail a configured number of times within a window, and retries it after a pause.",
    d: "Connect errors, timeouts and selected status codes count against the member; after a threshold within a time window it is skipped for a fail timeout, then given a trial request. No extra traffic is generated and detection depends on request volume. Counts are in shared memory. It is hard because low traffic means slow detection, real users pay for the discovery, and one slow endpoint can mark a healthy backend as failed for requests that would have succeeded.",
    k: ["Passive only versus combined with active: passive adds no probe load and reflects real failures, but needs real traffic and sacrifices a few requests to find a failure.", "Count status codes as failures versus only connection errors: counting codes catches application faults, but one failing endpoint can sideline a whole server."],
    p: ["A single slow endpoint times out repeatedly and the server is removed for all routes, increasing load on the others.", "After the fail timeout every worker sends a trial request simultaneously to a still-broken backend."],
    v: "Make a backend return errors for a few requests and confirm it is skipped for the fail timeout with the transition logged, then fixed, and confirm one trial request restores it.",
    dep: ["upstream-groups", "shared-memory-zones", "retries-failover"]
  },
  "slow-start-drain": {
    s: "Raises a returning or new backend's share of traffic gradually, and removes a leaving backend by stopping new requests while existing ones finish.",
    d: "Slow start scales a member's effective weight from near zero to full over a configured period after it returns, giving caches and connection pools time to warm. Drain marks a member as accepting no new sessions while allowing in-flight work to finish, so it can be stopped without errors. Both are changes to weights and state in the shared group. It is hard because the right ramp depends on the application's warmup, and drains must interact with affinity and long-lived connections or they never finish.",
    k: ["Linear ramp over a fixed period versus waiting for a readiness signal: a ramp needs no application support, but a signal adapts to real warmup.", "Drain by weight zero versus a draining flag: weight zero is a simple change, but a flag can distinguish a planned removal from a failure for reporting."],
    p: ["A restarted server gets a full share at once, with cold caches, and fails again immediately.", "A drained server still receives sticky and hashed requests that bypass the weight."],
    v: "Restart a backend under load and confirm its request rate climbs over the configured period instead of jumping; drain another and confirm its in-flight count falls to zero with no failed requests.",
    dep: ["upstream-groups", "session-affinity", "least-connections"]
  },
  "upstream-dns": {
    s: "Resolves backend host names to addresses at start or periodically at runtime, honoring record lifetimes and spreading requests across all returned addresses.",
    d: "A resolver client sends queries to configured servers using the event loop, caches results for the record's lifetime or a configured override, and updates the group's members when the addresses change. Multiple records become multiple members. Failure to resolve keeps the last known addresses. It is hard because name resolution at start only goes stale as services move, a blocking system resolver stalls a loop, and short record lifetimes produce frequent queries and brief windows of mixed old and new addresses.",
    k: ["Resolve only at start versus re-resolve at runtime: start-only is simple and stable, but backends that move are never found until reload.", "Own non-blocking resolver versus system resolver: an own resolver keeps loops responsive, but must implement caching and failure handling."],
    p: ["Addresses resolved once at start become stale after a rolling deployment and traffic goes to retired hosts.", "A blocking resolver call stalls the event loop when the name server is slow."],
    v: "Change the record behind a backend name, wait one record lifetime and confirm new requests go to the new address and not the old, and that a resolver outage keeps traffic flowing to the last known addresses.",
    dep: ["upstream-groups", "event-notification", "timeouts"]
  },
  "http1-parser": {
    s: "Incrementally parses the request line and headers from a byte stream with a state machine, tolerating arbitrary packet boundaries and rejecting malformed input.",
    d: "The parser consumes bytes as they arrive and advances through states for method, target, version, header names, values and the blank line, saving its position when data runs out so the next read resumes. It validates characters, line endings, header name syntax and the version, and records offsets into the buffer instead of copying. The target form is interpreted as origin, absolute or authority. It is hard because the specification leaves room, and being lenient or strict in different ways than a neighboring parser creates smuggling, and because handling split input correctly is the usual source of bugs.",
    k: ["Strict rejection of malformed syntax versus tolerant recovery: strictness blocks parser disagreement attacks, but fails with sloppy clients.", "Zero-copy offsets into the read buffer versus copying fields: offsets avoid allocation and copying, but the buffer must live until the request ends."],
    p: ["A header split across two reads is parsed wrongly because the state was not saved at the boundary.", "Bare line feeds or spaces before the colon are accepted, while an upstream treats them differently."],
    v: "Feed the same request split at every possible byte boundary and confirm identical parsed results, then feed malformed variants, such as a space before the colon and bare line feeds, and confirm rejection.",
    dep: ["header-limits", "smuggling-defenses", "memory-pools", "connection-state-machine"]
  },
  "smuggling-defenses": {
    s: "Rules that remove ambiguity about where a request ends, such as rejecting conflicting length headers, and normalizing messages before forwarding so the proxy and upstream agree.",
    d: "Smuggling occurs when two hops disagree on message boundaries, letting an attacker hide a second request inside the first. The server rejects requests with both a length and a transfer coding or with conflicting lengths, rejects invalid length values and unknown codings, forbids obsolete folded headers and whitespace tricks, and sends upstream a single, canonical framing. Connections to upstreams are not reused after a framing anomaly. It is hard because exploits use differences of one byte in what each parser accepts, and downgraded HTTP/2 requests can carry fields that mean something different in HTTP/1.1.",
    k: ["Reject ambiguous requests versus pick an interpretation: rejecting closes the whole attack class, but breaks a few legacy clients.", "Re-serialize the request upstream versus pass bytes through: re-serializing guarantees canonical framing, but costs CPU and may alter exotic requests."],
    p: ["A downgraded HTTP/2 request carries a content length that disagrees with its frame lengths and is forwarded as-is.", "A connection to the upstream is reused after a rejected request, and leftover bytes become the next client's request."],
    v: "Send a corpus of ambiguous requests, including both length and transfer coding, duplicate lengths and obscured coding names, through the proxy to a recording backend and confirm each is rejected and none produces a second request.",
    dep: ["http1-parser", "chunked-codec", "upstream-request-build", "h2-streams"]
  },
  "chunked-codec": {
    s: "Encodes and decodes the chunked transfer coding that frames bodies of unknown length, including chunk sizes, extensions and trailers, with strict limits.",
    d: "On receive, the decoder reads a hexadecimal size line, then that many bytes, then a terminator, ending at a zero-size chunk followed by optional trailers. On send, filters wrap output buffers in chunk headers when no length is known. Size parsing guards against overflow and absurd values, extensions are ignored or limited, and trailers are size-bounded. It is hard because decoding is a security boundary: lenient size parsing differs between implementations, trailers can carry fields that were never validated, and a decoder that does not enforce the body limit lets chunks bypass it.",
    k: ["Strict size and terminator parsing versus tolerance: strict parsing prevents smuggling through parser differences, but rejects malformed but harmless encoders.", "Drop trailers versus forward them: dropping avoids unvalidated fields reaching applications, but loses data some protocols need."],
    p: ["A size field with a leading sign or extra digits is accepted by the proxy and read differently by the upstream.", "Chunks are counted against the body limit only after decoding is complete, so a huge body is buffered first."],
    v: "Decode valid chunked bodies split at arbitrary boundaries and confirm exact output, then send oversized, negative and overflowing sizes and malformed terminators and confirm each is rejected without reading further.",
    dep: ["http1-parser", "body-size-limits", "response-filters"]
  },
  "header-limits": {
    s: "Caps on request line length, individual header size, header count and total header bytes, applied while parsing so oversized input is rejected early.",
    d: "A large buffer holds the header block, a bounded number of such buffers is allowed per request, and the parser fails once the limits are reached, answering with the matching status for a long target or oversized header fields. Limits are tuned for cookies and tokens that legitimately grow. The same idea applies to HTTP/2 header lists and decoded dynamic table sizes. It is hard because limits must fit real traffic: tokens and cookies exceed small defaults, while generous limits multiply memory per connection and give attackers room.",
    k: ["Small limits with explicit increases versus large defaults: small limits cut memory and abuse, but legitimate large cookies fail until someone finds the setting.", "Allocate header buffers on demand versus up front: on demand saves memory for idle connections, at the cost of allocation work when headers arrive."],
    p: ["An application's growing cookie exceeds the limit and users see an unexplained client error from only some pages.", "Oversized limits times many connections exhaust memory with slow header uploads."],
    v: "Send requests with a header just under and just over each limit and confirm the first succeeds and the second gets the expected status and an error log line naming the limit.",
    dep: ["http1-parser", "memory-pools", "hpack"]
  },
  "http2-framing": {
    s: "Reads and writes the binary frames of HTTP/2, such as headers, data, settings, window updates and pings, over a single connection with a fixed header and length.",
    d: "Every frame has a length, type, flags and stream identifier. The reader assembles frames from the byte stream, validates sizes against the negotiated maximum, checks stream and ordering rules, and dispatches by type. Settings are exchanged and acknowledged at start. Header blocks may span continuation frames that must arrive contiguously. The writer interleaves frames from many streams respecting priorities and flow-control. It is hard because the connection-level state machine is large, protocol errors have to be classified as stream or connection errors, and malformed sequences are a source of denial-of-service attacks.",
    k: ["Strict protocol error handling versus tolerance: strict handling closes malformed connections quickly, but may reject quirky clients.", "Large maximum frame size versus the default: large frames cut overhead for big transfers, but delay interleaving and increase memory per stream."],
    p: ["A header block with endless continuation frames is accepted and buffered without limit.", "Settings changes are not acknowledged or applied at the right time, and peer and server disagree on limits."],
    v: "Run a conformance suite against the server covering frame types, ordering errors and settings, and confirm each violation produces the specified stream or connection error code and nothing causes a crash or hang.",
    dep: ["h2-streams", "hpack", "tls-handshake", "alpn", "connection-state-machine"]
  },
  "h2-streams": {
    s: "Tracks each request and response as a numbered stream on one connection, through idle, open, half-closed and closed states, with a limit on concurrent streams.",
    d: "A stream is created by a headers frame, carries data in each direction, and ends by flags or a reset. The server enforces a maximum number of concurrent streams, assigns each to a request handler as though it were a separate connection, and schedules writes among them. Stream identifiers must increase, and closed stream state is kept briefly to handle late frames. Reset and goaway frames end streams or the connection. It is hard because each stream is a full request with its own buffers and timers multiplexed on one socket, and cancelling cleanly across proxied upstream streams needs propagation.",
    k: ["Low concurrent stream limit versus high: low limits bound memory and CPU per client, but cut throughput for pages with many resources.", "Map each stream to an upstream connection versus multiplex upstream: separate connections isolate stalls, but multiplexing saves connections and needs careful flow control."],
    p: ["Closed streams are removed immediately and late frames for them are treated as connection errors.", "A client reset is not propagated, and the proxy continues to fetch and discard a large upstream response."],
    v: "Open the maximum number of concurrent streams, confirm the next is refused or queued as designed, reset one mid-response and confirm its upstream work stops while others continue.",
    dep: ["http2-framing", "h2-flow-control", "connection-limiter", "proxy-handler"]
  },
  "h2-flow-control": {
    s: "Window-based flow control applied per stream and per connection, so a receiver bounds how much data a sender may have outstanding, with updates announcing freed space.",
    d: "Each stream and the connection have a send window that data frames consume and window update frames replenish. The server sends data only while both windows are positive, and grants more as its application or the client's socket consumes the data. Initial and per-stream sizes are set by settings. Coupling windows to the next hop's progress passes backpressure through a proxy. It is hard because windows that are too small throttle throughput on high-latency links, ones that are too large permit memory exhaustion, and one stalled stream must not block others through the shared connection window.",
    k: ["Large windows versus small: large windows keep long links full, but let slow consumers hold a lot of memory per stream.", "Update the window as the data is consumed versus as it arrives: consuming-time updates give true backpressure, but need the next hop to report progress."],
    p: ["A stalled response consumes the connection window and every other stream on that connection stops.", "A peer that never sends updates holds buffered response data indefinitely."],
    v: "Download a large response through a link with added latency and confirm throughput reaches the bandwidth-delay product, then stall one reader and confirm other streams continue and server memory for it stays bounded.",
    dep: ["h2-streams", "write-backpressure", "streaming-relay"]
  },
  "hpack": {
    s: "Header compression for HTTP/2 using a static table, a dynamic table shared per connection direction and Huffman coding, with a bounded table size.",
    d: "Headers are encoded as references to table entries or literals, optionally added to the dynamic table, both ends keeping tables in lockstep. The table size is bounded by a setting and changes are signaled in the stream. Header blocks must be decoded in order even if their streams are unrelated, because decoding mutates shared state. Sensitive headers can be marked as never indexed. It is hard because decoding is stateful across streams, a decompression bomb can expand a small block into a huge list, and indexing secrets together with attacker-controlled values risks leaking them.",
    k: ["Large dynamic table versus small: large tables compress repeated headers better, but cost memory per connection.", "Index sensitive headers versus never-index them: indexing saves bytes on repeated tokens, but exposes them to size-based guessing attacks."],
    p: ["No limit on the decoded header list size lets a tiny block expand to megabytes.", "A decoding error is treated as a stream error, leaving the shared table out of sync with the peer."],
    v: "Decode a conformance corpus of header blocks and confirm exact fields, then send a block that expands beyond the decoded size limit and confirm the connection is closed with a compression error.",
    dep: ["http2-framing", "header-limits"]
  },
  "h2-abuse-limits": {
    s: "Limits on cheap-to-send frames that cost the server work, such as resets, settings, pings, empty frames and priority changes, with connection closure when they are exceeded.",
    d: "Counters track the rate of resets, control frames, empty data frames, window updates and header blocks per connection over a sliding period. Exceeding a threshold triggers a connection error and logging. Concurrent stream limits are enforced including streams already reset but still doing upstream work. Limits are chosen so normal browsers never hit them. It is hard because each attack uses a legal message the server must process, such as a request followed immediately by a reset, repeated at high rate, and the cost is in setup and teardown rather than data.",
    k: ["Count resets toward the concurrent-stream limit versus ignoring them: counting stops rapid-reset floods, but may penalize clients that cancel legitimately.", "Close the connection at the threshold versus slow it: closure ends the abuse quickly, but a legitimate client must reconnect and lose in-flight work."],
    p: ["Reset streams do not count as concurrent, so a client opens and cancels streams indefinitely at no limit.", "Thresholds are set so tight that a browser loading a busy page triggers them."],
    v: "Send a flood of requests each followed by an immediate reset, a flood of pings and empty data frames, and confirm each connection is closed at its threshold while CPU use stays bounded and normal clients are unaffected.",
    dep: ["http2-framing", "h2-streams", "connection-limiter"]
  },
  "quic-transport": {
    s: "A user-space transport that runs over UDP, providing encrypted, multiplexed streams with its own loss recovery, congestion control and connection migration.",
    d: "Packets arrive on UDP sockets and are routed to connections by identifiers rather than address pairs, so a client changing networks keeps its connection. Each packet is decrypted, acknowledgments and loss detection drive retransmission, and a congestion controller sets the send rate. Streams are independent, so a lost packet blocks only the streams in it. Address validation tokens limit spoofed amplification. It is hard because the whole transport lives in the server: pacing, timers and batched socket I/O set performance, and connection identifiers must route to the right worker in multi-process servers.",
    k: ["User-space transport versus kernel transport: user space evolves quickly and avoids head-of-line blocking, but uses more CPU per byte without offloads.", "Route by connection identifier to a worker versus by address hash: identifier routing survives migration, but the identifier must encode its worker or a shared table is needed."],
    p: ["Packets of one connection reach different workers after a client's address changes, and the connection dies.", "Firewalls block or throttle UDP, and clients without a fallback to TCP cannot connect."],
    v: "Fetch a resource over the new transport, change the client's address mid-transfer and confirm the transfer completes, then drop packets randomly and confirm recovery without a stalled unrelated stream.",
    dep: ["port-reuse", "event-notification", "tls-handshake", "alpn"]
  },
  "h3-qpack": {
    s: "Maps HTTP semantics onto QUIC streams with its own framing, and compresses headers with a scheme designed to avoid blocking when packets arrive out of order.",
    d: "Each request uses its own bidirectional stream; control streams carry settings and shutdown signals; two unidirectional streams synchronize the header compression tables. A header block can reference a table entry that has not arrived yet, so the decoder may have to hold the stream, up to a configured number of blocked streams. Servers advertise support through an alternative-service announcement in earlier responses. It is hard because the blocked-stream bound trades compression against head-of-line stalls, and clients must be able to fall back when UDP does not work.",
    k: ["Allow many blocked streams versus few: more blocking improves compression, but one lost packet can delay several requests.", "Advertise through alternative-service headers versus prior knowledge: advertisement needs no client configuration, but the first visit always uses the older transport."],
    p: ["The advertisement is sent but UDP is blocked on the network, so clients try it, time out, and add delay before falling back.", "The decoder buffers header blocks waiting for table updates with no bound on memory."],
    v: "Load a page over HTTP/3 after an initial HTTP/2 visit with the announcement, confirm the switch, and drop the packet carrying a table update and confirm only the affected requests are delayed.",
    dep: ["quic-transport", "header-limits", "h2-streams"]
  }
});
