// Details for the service proxy plate, part 4: listeners and network filters, TLS and identity, threading and runtime.
ATLAS.details("service-proxy", {
  "listeners": {
    s: "A bound address and port that accepts incoming connections, owns the settings for them, and hands each accepted socket to a worker and a matching filter chain.",
    d: "A listener binds a socket, usually one per worker through port reuse or one shared socket accepted by all, and sets limits such as connection count, buffer size and per-connection timeouts. Listeners are created, updated and removed dynamically. An update that changes filter chains builds the new listener, shifts new connections to it, and drains the old one. It can listen on TCP or UDP, on specific interfaces, or accept connections redirected from elsewhere. It is hard because a listener update must not drop established connections or leave a window where nothing accepts.",
    k: ["A listener per worker with port reuse versus one shared socket: per-worker sockets avoid contention and spread load by the kernel, but spread unevenly when few connections are long-lived.", "In-place update versus replace-and-drain: replace-and-drain is safe for live connections, but briefly runs two versions of the configuration."],
    p: ["Two listeners bind overlapping addresses, and one silently never receives traffic.", "A listener update tears down the old one immediately, resetting established connections."],
    v: "Update a listener's filter chain under load and confirm established connections continue on the old chain while new connections use the new one, with no refused connections during the change.",
    dep: ["listener-filters", "filter-chain-match", "connection-handling"]
  },
  "listener-filters": {
    s: "Filters that run right after accept, before any chain is chosen, to read or recover connection metadata such as the original destination, protocol, server name or client address.",
    d: "They run in order on a connection that has just been accepted, and may peek at the first bytes without consuming them. Typical jobs: recover the address a redirected client originally dialed, parse a proxy-protocol header that carries the real client address, detect whether the bytes are a TLS handshake and extract the server name and offered protocols, or detect an application protocol. Their results are stored on the connection and used to select a filter chain. It is hard because they must wait for enough bytes, so each needs a timeout against clients that connect and send nothing.",
    k: ["Inspecting data before choosing a chain versus choosing by address alone: inspection allows routing by name and protocol on one port, but delays every connection until bytes arrive.", "A timeout on inspection versus waiting indefinitely: a timeout frees resources from silent clients, but may drop slow legitimate ones and server-speaks-first protocols."],
    p: ["A server-speaks-first protocol on an inspected port stalls, because the proxy waits for client bytes that never come.", "Missing timeouts let idle connections accumulate until file descriptors run out."],
    v: "Connect without sending data and confirm the listener-filter timeout closes the connection and increments its counter. Then connect with a TLS client hello and confirm the server name appears in the access log.",
    dep: ["listeners", "protocol-detection", "original-destination", "proxy-protocol"]
  },
  "protocol-detection": {
    s: "Examines the first bytes of a connection to decide whether it is TLS, plain HTTP, HTTP/2, or another protocol, so one port can serve several.",
    d: "TLS handshakes begin with a recognizable record header, HTTP/1.1 starts with a method token, and HTTP/2 prior-knowledge connections begin with a fixed preface. The detector reads a small prefix without consuming it, sets metadata such as transport protocol and application protocols, and the filter chain match uses it. When TLS is present, the offered application protocol list in the handshake gives a more reliable answer. It is hard because detection is a guess based on a few bytes, and protocols where the server speaks first, or whose first bytes are ambiguous, cannot be detected without waiting.",
    k: ["Sniffing the protocol versus declaring it per port: sniffing allows one port for mixed traffic with no client changes, but is probabilistic and adds a wait.", "Falling back to opaque TCP versus rejecting unknown protocols: falling back keeps unusual traffic working, but bypasses all layer 7 policy for it."],
    p: ["An unrecognized protocol falls through to opaque TCP and skips authorization rules written for HTTP.", "A protocol whose first bytes resemble HTTP is misclassified and the proxy returns a parse error."],
    v: "Send TLS, plain HTTP/1.1, HTTP/2 with the preface, and an arbitrary binary protocol to one port, and confirm each is classified correctly in the logs, with the binary one handled as opaque TCP.",
    dep: ["listener-filters", "filter-chain-match"]
  },
  "original-destination": {
    s: "Recovers the address a client was actually trying to reach from a redirected connection, so the proxy can forward to it or apply policy by its real target.",
    d: "When firewall rules redirect a connection to the proxy, the socket's local address is the proxy's, not the client's intended destination. The proxy asks the kernel for the original address stored in the connection tracking state, or reads it from a proxy-protocol header or tunnel. It then selects a filter chain by that address and, for passthrough clusters, connects to it directly. It is hard because it depends on kernel state, IPv6 and IPv4 differ, and an application that connects to the proxy's own address makes the original destination meaningless.",
    k: ["Recovering the destination from kernel state versus requiring clients to name it: kernel recovery works for unmodified applications, but depends on platform-specific mechanisms.", "Forwarding to the original address versus a looked-up cluster: forwarding is generic for unknown services, but bypasses balancing, health checks and load policy."],
    p: ["A passthrough connection forwards to the original address, which is the proxy's own, and loops.", "Policy written for named services does not apply to traffic forwarded by raw address, which silently skips it."],
    v: "Redirect a connection to a service address into the proxy and confirm the access log shows the original destination, and that the proxy connects to that destination rather than itself.",
    dep: ["listener-filters", "traffic-interception"]
  },
  "proxy-protocol": {
    s: "A small header prepended by an upstream balancer to a connection that carries the true client and server addresses, which the proxy reads so it can see the original client.",
    d: "A balancer that forwards raw TCP loses the client's address, since the next hop sees only the balancer. The header, written before any application bytes, contains source and destination addresses and ports, and optionally extra fields such as a TLS server name. The proxy parses it as a listener filter, replaces the connection's remote address and strips the header. It can also write the header when connecting upstream. It is hard because it must be enabled on both ends or neither, and accepting it from untrusted sources lets any client claim an arbitrary address.",
    k: ["Using the header versus forwarding-address HTTP headers: the header works for any protocol including TLS passthrough, but both sides must agree to use it.", "Requiring the header on a listener versus allowing it optionally: requiring is unambiguous, but breaks direct connections, while optional parsing can misread application data."],
    p: ["One side sends the header and the other does not expect it, and every connection fails with a parse error.", "A listener accepts the header from any peer, so clients forge their source address and bypass address-based rules."],
    v: "Connect through a balancer that adds the header and confirm access logs show the true client address. Connect directly from an untrusted address with a forged header and confirm it is rejected.",
    dep: ["listener-filters", "listeners"]
  },
  "filter-chain-match": {
    s: "Selects which chain of network filters handles a connection, by comparing its destination address, server name, application protocol and source against configured criteria.",
    d: "A listener holds several filter chains, each with match criteria on destination port and address, server name, transport protocol, offered application protocols, source address and port. The matcher picks the most specific chain, evaluating criteria in a fixed precedence order, and if none matches the connection is closed or sent to a default chain. This lets one port serve many hostnames with different certificates, or send plain and encrypted traffic to different handling. It is hard because the matching hierarchy is implicit and different criteria can conflict.",
    k: ["Fixed-precedence matching versus ordered rules: fixed precedence makes matches deterministic regardless of declaration order, but is harder to hold in memory than a simple list.", "A default chain versus closing unmatched connections: a default keeps unknown clients working, but may expose a chain that was not meant for them."],
    p: ["A catch-all default chain with a permissive route serves requests meant to be refused for unknown names.", "Two chains overlap, and which wins is determined by a precedence level the author did not consider."],
    v: "Connect with three server names, one unknown, to one listener, and confirm each uses its own chain and certificate, while the unknown one is refused or sent to the default as configured.",
    dep: ["listener-filters", "protocol-detection", "network-filter-chain"]
  },
  "network-filter-chain": {
    s: "An ordered list of filters that process a connection's raw bytes, each able to read, transform or stop them, ending in a terminal filter such as the HTTP manager or TCP proxy.",
    d: "On new data, each read filter in order sees the bytes and returns continue or stop. Write filters process outgoing bytes in reverse. Filters can act on connection events too: connection established, closed, high or low buffer. Examples are authorization by identity, connection rate limits, client-certificate checks, and protocol-specific parsers. The last read filter is terminal: the HTTP connection manager for requests, or the TCP proxy for opaque forwarding. It is hard because filters can pause, buffer and resume bytes, and ordering mistakes change what is protected.",
    k: ["Connection-level filters versus request-level ones: connection filters are cheap and protocol-independent, but cannot see paths or methods.", "A fixed terminal filter versus a pluggable one: pluggable terminals support new protocols, but each must correctly implement back-pressure and lifecycle."],
    p: ["An authorization filter placed after the terminal filter never runs, and the connection is served unchecked.", "A filter buffers data without honoring watermarks and grows memory on a slow peer."],
    v: "Add a counting filter ahead of the terminal filter, send a known amount of data, and confirm the count matches bytes sent, then confirm a rejecting filter prevents the terminal filter from ever seeing data.",
    dep: ["connection-handling", "buffering-watermarks", "extension-registry"]
  },
  "tcp-proxy": {
    s: "The terminal filter that forwards a connection's bytes to an upstream host chosen by cluster, with no knowledge of the application protocol.",
    d: "On a new connection it picks a cluster, directly or through weighted clusters or a route by server name, selects a host with the cluster's balancer, connects and then copies bytes both ways with back-pressure. It enforces idle timeouts, a maximum connection duration and connect attempts, and records bytes and duration in statistics and logs. Half-close is propagated in each direction. It is hard because it knows nothing about requests: it cannot retry a failed connection after data has flowed, balance per request, or attribute errors to a request.",
    k: ["Layer 4 forwarding versus layer 7 proxying: layer 4 is cheap and works for any protocol, but gives per-connection balancing, no retries and no request-level metrics.", "Connecting before or after reading client data: connecting early lowers latency, but cannot use anything in the client's first bytes for routing."],
    p: ["A few long-lived connections pin to hosts, and balancing is per connection, so load stays uneven.", "Idle timeout is unset, and dead connections hold resources forever because no side closes."],
    v: "Open one connection that transfers a large file and several short ones, and confirm bytes in each direction match, idle connections close after the timeout, and the half-close on one side propagates to the other.",
    dep: ["network-filter-chain", "upstream-clusters", "connection-pool", "timeouts-deadlines"]
  },
  "tls-passthrough": {
    s: "Forwards encrypted connections without decrypting them, choosing the destination from the unencrypted server name in the handshake, so keys stay with the backend.",
    d: "A listener filter reads the client hello to extract the server name and offered protocols, without completing the handshake. The filter chain match selects a TCP proxy chain by that name, which forwards the original bytes unchanged to the matching cluster. The proxy never holds the private key and cannot see requests, so there is no layer 7 routing, header policy or request-level statistics. It is chosen when keys must not leave the backend, when the client authenticates directly to the service, or when the protocol is not HTTP.",
    k: ["Passthrough versus terminating at the proxy: passthrough keeps private keys and end-to-end encryption in the backend, but gives up layer 7 routing, policy and observability.", "Routing by server name versus by address: names let many services share one address and port, but depend on clients sending a name."],
    p: ["Clients that send no server name cannot be routed and are dropped or sent to an unintended default.", "Teams expect request metrics or rate limits on passthrough routes, which can never apply."],
    v: "Connect with two server names to one port, confirm each reaches its backend and completes the handshake against that backend's certificate, and confirm the proxy's logs show bytes and names but no request details.",
    dep: ["listener-filters", "filter-chain-match", "tcp-proxy", "sni-alpn-selection"]
  },
  "udp-proxying": {
    s: "Forwards datagrams between clients and upstream hosts, tracking per-client sessions, since UDP has no connections and balancing must be by flow.",
    d: "Datagrams arrive on a listener and are grouped into sessions by client address and port. Each new session picks an upstream host and gets an upstream socket, and datagrams are forwarded in both directions until the session idles out. There is no ordering, delivery or flow control, and the proxy adds none. Hash-based balancing keeps a flow on one host. It is used for name resolution, some real-time and game traffic, and as the carrier for HTTP/3. It is hard because session tables can be exhausted by spoofed sources, and sessions are state with no close signal.",
    k: ["Session tracking with per-flow upstream sockets versus stateless forwarding: sessions allow reply routing and balancing, but cost state per client.", "A short session timeout versus a long one: short timeouts bound table size, but can cut quiet flows."],
    p: ["Spoofed source addresses create sessions up to the table limit and block real clients.", "Replies arrive on a different worker than the session, and are dropped unless packets are steered consistently."],
    v: "Send datagrams from several clients, confirm each keeps one upstream host across packets and receives replies, and confirm idle sessions are removed after the timeout and the table size gauge falls.",
    dep: ["listeners", "network-filter-chain", "connection-ownership"]
  },
  "connection-handling": {
    s: "The lifecycle of each connection: accept, assign to a worker, read and write through filters, apply timeouts and limits, and close cleanly or by reset.",
    d: "After accept, the connection is bound to one worker and registered with its event loop. The worker reads when the socket is readable, runs filters, writes when it can, and applies back-pressure through watermarks. Per-connection state includes buffers, timers and addresses. Limits apply for total connections, idle time and buffer size. On close the proxy flushes pending data if allowed, then closes, with deferred deletion so objects live until callbacks finish. It is hard because every close path, peer reset, timeout, local error or drain, must release exactly the same resources.",
    k: ["Closing after flushing versus closing immediately: flushing delivers final data, but lets a peer that never reads hold the connection open.", "A global connection limit versus per-listener limits: per-listener limits isolate noisy services, but need tuning for each listener."],
    p: ["A connection object is freed while a callback is still queued, and the proxy crashes on a rare timing.", "Half-closed connections are never fully closed because neither side finishes, and they accumulate."],
    v: "Open and close connections in every way, normal, reset, timeout and drain, under load, and confirm the active connection gauge returns to zero and no descriptors or memory remain allocated.",
    dep: ["connection-ownership", "event-loop", "buffering-watermarks", "timers-scheduling"]
  },
  "tls-termination": {
    s: "Completes the TLS handshake with the client, decrypts traffic, and passes plaintext to filters, so layer 7 routing and policy can apply to encrypted traffic.",
    d: "The proxy selects a certificate and key by server name, negotiates protocol version, cipher suite and application protocol, and then decrypts records into the filter chain. Settings restrict versions and ciphers. Resumption tickets reduce handshake cost. Private keys live in the proxy's memory or behind an offload interface. Handshakes are the most expensive operation per new connection, and run on the worker thread. It is hard because handshake cost, certificate selection, and the exposure of plaintext and keys on a shared proxy all matter at once.",
    k: ["Terminating at the proxy versus at the backend: termination enables routing and policy and centralizes certificates, but puts keys and plaintext on the proxy.", "Restricting to modern versions and ciphers versus supporting legacy clients: modern-only is safer, but locks out old clients."],
    p: ["Certificates for a new name are not loaded, and clients get a default certificate and a name mismatch error.", "A burst of new connections makes handshake cost saturate the workers and delay established traffic."],
    v: "Connect with a client for each configured name and confirm the presented certificate, negotiated version and application protocol, and confirm a client offering only a disallowed version is refused.",
    dep: ["sni-alpn-selection", "certificate-rotation", "key-offload", "network-filter-chain"]
  },
  "tls-origination": {
    s: "Starts a TLS connection from the proxy to an upstream, encrypting traffic that the application sent in plaintext or re-encrypting traffic that was decrypted earlier.",
    d: "For clusters configured with a transport security context, the proxy performs a client handshake after the TCP connect, sending a server name and offered application protocols, and verifies the upstream's certificate against trusted roots and expected names. In a mesh this is combined with a client certificate for mutual authentication. Session resumption and connection pooling reduce handshake cost. It is hard because certificate verification must check the expected name, not just chain validity, and a pool of encrypted connections must be replaced on rotation.",
    k: ["Originating TLS at the proxy versus in the application: proxy origination needs no application changes and centralizes trust, but traffic is plaintext between the app and its proxy.", "Verifying the upstream name versus only the chain: name verification prevents impersonation by another valid certificate, but needs correct names everywhere."],
    p: ["Verification is disabled for convenience, and any server on the path can impersonate the upstream.", "The proxy sends no server name, and a shared upstream address returns its default certificate."],
    v: "Connect to an upstream with TLS origination and confirm the handshake in the upstream log, then present a certificate for the wrong name and confirm the proxy refuses the connection.",
    dep: ["upstream-clusters", "peer-validation", "connection-pool", "certificate-rotation"]
  },
  "mutual-tls": {
    s: "TLS in which both sides present certificates, so each connection proves the identities of the caller and the callee, and forms the basis for identity-based policy.",
    d: "The proxy serving a workload requests a client certificate, verifies it against trusted roots and extracts the identity from its name fields. The calling proxy presents its own certificate and verifies the server's identity matches the expected service. The verified identity is stored in connection metadata for authorization filters and access logs. A permissive mode accepts both plaintext and mutual TLS, used while migrating. It is hard because migration requires every caller to be ready before it is enforced, and traffic that is not intercepted bypasses it.",
    k: ["Strict mutual TLS versus permissive: strict gives a real guarantee, but any unmigrated or non-mesh caller is cut off, while permissive keeps working and protects nothing.", "Identity in the certificate versus identity in tokens: certificate identity is checked on every connection without code, but is workload-level, not user-level."],
    p: ["Permissive mode is left on after migration, and plaintext callers continue unnoticed for months.", "The authorization policy reads identity from a header the caller sets, instead of the verified certificate."],
    v: "Call a service with a valid mesh certificate, a certificate from another authority and plaintext, and confirm in strict mode only the first succeeds, with the verified identity visible in the access log.",
    dep: ["tls-termination", "tls-origination", "peer-validation", "certificate-rotation"]
  },
  "certificate-rotation": {
    s: "Replaces certificates and keys on running proxies before they expire, by receiving new secrets from a source and applying them to new connections without restarts.",
    d: "Secrets are delivered over the dynamic configuration channel or read from files that are watched. When a new certificate arrives, the proxy builds a new TLS context and installs it atomically so subsequent handshakes use it, while established connections keep their old session until they end. The proxy requests renewal at a fraction of the lifetime, often half. It is hard because failure modes are delayed: a failing renewal shows up only when the old certificate expires, and long-lived connections hold old trust and credentials.",
    k: ["Delivering secrets over the control channel versus mounting files: the channel is immediate and keeps keys in memory, but needs the channel to be healthy, while files are simple but disk-resident.", "Renewing at half life versus close to expiry: early renewal leaves time to recover from failures, but increases issuer load."],
    p: ["Renewal fails silently for days, and the outage appears all at once when certificates expire together.", "A file-based certificate is replaced non-atomically, and a handshake reads a mismatched certificate and key."],
    v: "Force a rotation on a proxy under load, confirm new handshakes show the new certificate serial, existing connections are not dropped, and the expiry gauge resets to the full lifetime.",
    dep: ["dynamic-config-api", "identity-issuance", "tls-termination"]
  },
  "sni-alpn-selection": {
    s: "Uses the server name and offered application protocols in a TLS handshake to select a certificate, a filter chain and the protocol the connection will speak.",
    d: "The client hello carries the requested server name and an ordered list of protocols it supports. On the serving side, the proxy picks the certificate for the name and the filter chain by name and protocol, and answers with the protocol it chooses, for example HTTP/2 over HTTP/1.1. On the originating side, it sends the cluster's configured name and protocols, which also decides whether to use a multiplexed protocol upstream. It is hard because clients that send no name need a default, and an inconsistent protocol choice breaks pooled connections.",
    k: ["Selecting certificates by name versus a single certificate: by name serves many domains on one address, but requires each to be configured and a default for the rest.", "Negotiating the protocol in the handshake versus assuming it: negotiation avoids guessing and a failed upgrade, but both ends must configure the same list."],
    p: ["Clients without a server name receive the first certificate in the list, which is for an unrelated domain.", "The upstream protocol list omits the multiplexed protocol, so all upstream traffic silently uses one request per connection."],
    v: "Connect with different names and protocol lists and confirm the presented certificate, selected chain and negotiated protocol for each match configuration, and that a client offering no name gets the documented default.",
    dep: ["tls-termination", "filter-chain-match"]
  },
  "peer-validation": {
    s: "Verifies a presented certificate beyond the signature chain: trust roots, validity period, revocation data, and that its names or identities match what the proxy expects.",
    d: "After building the chain to a trusted root, the proxy checks validity dates, optionally consults revocation lists, and matches the certificate's alternative names or identity URIs against an allowed list, such as the expected service identity for an upstream or the permitted callers on a listener. Matches can be exact, prefix or pattern. Pinning to specific certificate hashes is also supported. It is hard because trusting a root without constraining names means any certificate from that authority is accepted for any service.",
    k: ["Matching expected names versus trusting the chain alone: name matching ties a connection to a specific service, but needs correct expected names in configuration.", "Checking revocation versus relying on short lifetimes: revocation checks add dependencies and delays, while short-lived certificates remove the need if renewal is reliable."],
    p: ["Any certificate from the trusted authority is accepted for any service because no name constraint was configured.", "A wildcard pattern in the allowed names matches more identities than intended."],
    v: "Present a valid certificate with the wrong identity, an expired one and an untrusted one, and confirm each is rejected with a distinct reason, while the correct identity is accepted.",
    dep: ["tls-termination", "tls-origination", "trust-federation"]
  },
  "key-offload": {
    s: "Performs private key operations, such as signing during a handshake, in a separate service or hardware module, so the key never sits in proxy memory.",
    d: "During a handshake, the proxy passes the data to be signed or decrypted to a provider, which holds the key and returns the result. Providers can be hardware modules, a local daemon or a remote service. Because the call is asynchronous, the handshake pauses and resumes without blocking the event loop. It protects keys against a compromised proxy process and meets custody rules. It is hard because every new handshake now depends on the provider's latency and availability, and provider throughput limits the connection rate.",
    k: ["Offloaded keys versus in-memory keys: offload limits what a compromise can steal, but adds latency and a dependency to each handshake.", "Asynchronous provider calls versus blocking ones: asynchronous calls keep the loop responsive, but complicate handshake state."],
    p: ["The provider slows down and handshakes queue, so new connections fail while established ones keep working.", "The provider call blocks the worker thread, stalling all connections on it."],
    v: "Run handshakes with the key in a provider, confirm the key is absent from the proxy's memory and files, measure added handshake latency, and stop the provider to confirm new handshakes fail cleanly.",
    dep: ["tls-termination", "event-loop"]
  },
  "worker-threads": {
    s: "A fixed pool of threads, typically one per core, each running its own event loop and handling a separate subset of connections, with a main thread for control.",
    d: "At startup the proxy starts a main thread and a set of workers. The main thread handles configuration, discovery, statistics flushing and administration. Workers accept and serve connections and share nothing on the data path. New connections are spread across workers by the kernel through port reuse, or by a connection balancer. Configuration is posted to workers as messages. It is hard because the model requires that no worker ever block, and a worker's capacity is its core: a single hot connection cannot use more than one thread.",
    k: ["One thread per core versus more threads than cores: matching cores avoids contention and context switches, but a blocking call stalls an entire core's worth of traffic.", "Kernel-level connection spreading versus an explicit balancer: kernel spreading is cheap, but can skew when few long-lived connections dominate."],
    p: ["A few busy long-lived connections land on one worker, and it saturates while others idle.", "A blocking call in an extension freezes all connections on that worker."],
    v: "Run a mixed load and confirm per-worker connection counts and event loop delay are balanced, then add a deliberate blocking call and observe the delay spike confined to one worker.",
    dep: ["event-loop", "thread-local-config", "connection-ownership"]
  },
  "event-loop": {
    s: "A single-threaded loop that waits for readiness events on sockets and timers, runs the callbacks for them, and never blocks, so one thread serves thousands of connections.",
    d: "Each worker waits on a kernel notification mechanism for readable and writable sockets, expired timers and posted messages, then runs the registered callbacks to completion. Callbacks must be short; long work is split or moved elsewhere. Edge-triggered notification means reading until the socket reports empty. A deferred-deletion queue frees objects after the current callbacks finish. It is hard because correctness relies on discipline: any slow callback delays every other connection on the loop, and re-entrancy during callbacks causes subtle bugs.",
    k: ["Run-to-completion callbacks versus preemption: no locks and simple reasoning, but a slow callback blocks everything else on the thread.", "Edge-triggered versus level-triggered readiness: edge-triggered reduces wakeups, but a missed drain stalls the socket until the next event."],
    p: ["A callback does a slow computation, and every connection on that worker sees latency spikes.", "An object is deleted inside its own callback, and a later callback uses it."],
    v: "Measure event loop delay histograms per worker under load and confirm the 99th percentile stays within the target, then inject a slow callback and confirm the delay metric exposes it.",
    dep: ["worker-threads", "timers-scheduling", "buffer-management"]
  },
  "connection-ownership": {
    s: "The rule that each connection, and everything created for it, belongs to exactly one worker for its entire life, so its state needs no synchronization.",
    d: "When a connection is accepted it is bound to a worker and never moves. Its filter state, buffers, timers, upstream connections and pool entries are all created and used on that thread. Requests to upstream hosts use the worker's own pool, so a downstream connection and its upstream connection share a thread. Cross-thread communication happens only through posted messages and read-only snapshots. It is hard because anything shared, such as limits and statistics, must use atomics or per-thread copies, and any code that touches a stream from another thread is a data race.",
    k: ["Strict single-thread ownership versus shared connection state: ownership removes locks and races from the hot path, but prevents rebalancing a connection once accepted.", "Per-thread upstream pools versus shared pools: per-thread pools keep the whole request on one thread, but cost extra upstream connections."],
    p: ["A callback from another thread touches a stream directly instead of posting, and a rare race corrupts state.", "A heavy connection stays on one worker for hours while others are idle, with no way to move it."],
    v: "Run a race detector or thread sanitizer build under a mixed load including drains, resets and updates, and confirm it reports no data races and no cross-thread access to connection objects.",
    dep: ["worker-threads", "event-loop"]
  },
  "thread-local-config": {
    s: "Each worker holds its own read-only copy of listeners, routes, clusters and endpoints, updated by message, so request handling never takes a lock to read configuration.",
    d: "The main thread builds new configuration objects and posts them to every worker. Each worker swaps in its copy between callbacks, and keeps the old one alive through reference counting until its in-flight requests finish. Slots hold typed per-thread data that extensions can use for their own state. Workers may therefore briefly run different versions of the configuration. It is hard because updates are not atomic across workers, and large configurations multiply memory by the number of threads.",
    k: ["Per-thread copies versus a shared locked structure: copies make reads free and contention-free, but cost memory per worker and allow brief version differences between workers.", "Posting whole objects versus sending deltas: whole objects are simple and safe, but make large cluster updates expensive."],
    p: ["A very large endpoint set is copied to every worker on each small update, and the main thread spends its time cloning.", "Old snapshots stay referenced by long streams, so memory for superseded configuration is not reclaimed."],
    v: "Push a configuration change and confirm each worker reports the new version within milliseconds of each other, in-flight requests finish on the old snapshot, and memory returns to baseline after they end.",
    dep: ["worker-threads", "connection-ownership"]
  },
  "thread-local-stats": {
    s: "Each worker updates its own counters and histograms, which the main thread periodically merges, so statistics cost no synchronization on the hot path.",
    d: "Counters are stored per worker and incremented without atomics. On a timer, the main thread collects deltas from all workers and adds them to the shared totals, which sinks and the admin interface read. Gauges that must be exact use atomics or are summed at flush. Histograms are merged by combining buckets. Statistic names are interned so that a worker holds only small handles. It is hard because the memory for names and per-thread values grows with the number of metrics, and data read between flushes is slightly stale.",
    k: ["Merging at flush time versus updating shared atomics: per-thread updates are fastest, but readers see data that lags by up to one flush interval.", "Interning names with handles versus strings per metric: interning cuts memory with many clusters, but adds indirection and lifetime rules."],
    p: ["Counters from a thread that stopped before a flush are lost because they were never merged.", "Thousands of clusters times many metric names exhaust memory in per-thread tables."],
    v: "Send a known number of requests across all workers and confirm the merged counter equals it exactly after the next flush, and that the main thread's flush time stays small as metric count grows.",
    dep: ["worker-threads", "event-loop"]
  },
  "buffer-management": {
    s: "Memory handling for bytes in flight: chunked buffers that avoid copying, shared slices of received data, and accounting that bounds total use.",
    d: "Data is held in a chain of fixed-size slices so appending, draining and splitting avoid copies. Reads fill slices directly from the socket, and codecs and filters can take ownership of slices or reference them. Memory is allocated from per-thread pools to reduce contention, and accounting tracks bytes per stream and per connection so overload logic can find and reset the largest consumers. Buffers feed watermark logic. It is hard because copies are the main CPU cost of a proxy, and fragmentation or per-stream accounting overhead can dominate under many small requests.",
    k: ["Chained slices versus one contiguous buffer: chains avoid copying on append and drain, but make parsing across slice boundaries harder.", "Per-stream memory accounting versus global counting: per-stream accounting lets overload logic choose victims, but adds bookkeeping to every allocation."],
    p: ["A slice referenced by a long-lived object keeps a large block of memory alive for a small amount of data.", "Many tiny requests fragment the allocator, and resident memory stays high after the load ends."],
    v: "Stream gigabytes through the proxy and confirm the resident memory is flat and CPU per byte shows no extra copy, then run many small requests and confirm memory returns to baseline after the load stops.",
    dep: ["event-loop"]
  },
  "timers-scheduling": {
    s: "Per-worker timers for idle, request and retry timeouts, health checks and periodic work, kept efficient even with hundreds of thousands of connections.",
    d: "Each event loop owns a timer structure, usually a hashed or hierarchical wheel, so arming, rearming and cancelling cost constant time. Every connection and stream arms several timers, idle, header, request and stream, and rearms them on activity. Timers fire as callbacks on the loop, and are coalesced to the loop's resolution to reduce wakeups. Cached time reduces clock calls. It is hard because timers outnumber connections many times over, and a thundering herd of timers expiring together can hold the loop for too long.",
    k: ["Coarse timer resolution versus precise: coarse resolution batches expirations and reduces overhead, but timeouts fire up to one tick late.", "Rearming timers on every read versus tracking last activity: rearming is simple, but touching the wheel on every packet adds cost, while last-activity checks do less work."],
    p: ["Hundreds of thousands of connections created together expire together, and the loop stalls running their callbacks.", "A timer is not cancelled when its stream ends and fires against a destroyed object."],
    v: "Open a hundred thousand idle connections with a short idle timeout, confirm they close within one timer tick of the deadline, and that event loop delay during the mass expiry remains within its target.",
    dep: ["event-loop"]
  },
});
