// Details for the web server plate, part 4: TLS termination, connections, process model, modules and memory.
ATLAS.details("web-server", {
  "tls-handshake": {
    s: "Negotiates version, cipher and keys with the client and proves the server's identity with its certificate, before any application bytes are exchanged.",
    d: "The server reads the client's hello, selects a version, cipher suite and certificate, performs a key exchange, signs the transcript with its private key and verifies the client's finished message. The handshake is a state machine driven by readable and writable events, and its public-key operations are the most expensive step in accepting a connection. Handshakes run on the event loop, so a flood of new connections is a CPU attack, and slow clients hold handshake state in memory until a timeout.",
    k: ["Handshake on the event loop versus offloaded to threads or hardware: inline is simple and fast for modern curves, but a heavy burst blocks other connections on that worker.", "Short handshake timeout versus long: short frees resources from stalled clients, but fails on poor networks."],
    p: ["A flood of new connections with expensive key exchange saturates the CPU while established connections starve.", "Handshake failures are not logged with a reason, so certificate and protocol mismatches look like random disconnects."],
    v: "Connect with a test client and confirm the negotiated version, cipher and certificate chain match policy; then open a thousand handshakes per second and confirm CPU use and latency for established connections.",
    dep: ["certificate-selection", "protocol-policy", "private-key-handling", "event-notification", "timeouts"]
  },
  "certificate-selection": {
    s: "Chooses which certificate and key to present for a handshake, using the requested server name and the client's supported signature and key types, with a default fallback.",
    d: "The client hello carries a server name, which the server matches to a site's certificate list before it knows the Host header. A site can hold several certificates, such as elliptic-curve and RSA, so the server picks one the client supports. Wildcard certificates cover names under a domain. When nothing matches, a default certificate is presented. It is hard because mismatches show as browser errors, and because the default certificate can reveal hostnames or let a scanner enumerate sites.",
    k: ["Several certificates per site versus one: multiple types give small fast handshakes to modern clients and compatibility for old ones, but double the renewal work.", "Wildcard certificate versus one per name: a wildcard simplifies issuance, but a leaked key exposes every subdomain."],
    p: ["Clients that send no server name receive the default certificate, which is for a different site and fails validation.", "Renewal updates one of two certificates and clients selecting the other get an expired one."],
    v: "Connect with each configured name, a wildcard match, an unknown name and no name, and confirm the presented certificate subject matches the intended one in each case, and the unknown name gets the neutral default.",
    dep: ["vhost-selection", "private-key-handling", "tls-handshake"]
  },
  "session-resumption": {
    s: "Lets returning clients skip most of the handshake using a stored session or an encrypted ticket, optionally sending early data on the first flight.",
    d: "After a handshake the server gives the client a ticket containing encrypted session state, or an identifier for state kept in a shared cache. On return the client presents it and the server derives keys without public-key operations, cutting CPU and a round trip. Early data lets the client send a request in its first flight. It is hard because resumption must work across workers and machines, which means shared keys or caches, and because early data can be replayed by an attacker, so only safe requests may be accepted in it.",
    k: ["Stateless tickets versus a server-side cache: tickets need no storage and work across servers, but depend on key rotation and distribution.", "Accept early data versus disable it: acceptance saves a round trip, but exposes the application to replay of the first request."],
    p: ["Each worker has its own ticket key, so resumption works only when the client returns to the same worker.", "A state-changing request sent as early data is replayed by a network attacker and executed twice."],
    v: "Connect, then reconnect with the stored session and confirm the second handshake reports resumption and uses far less server CPU; then replay early data and confirm unsafe methods are refused.",
    dep: ["tls-handshake", "ticket-keys", "shared-memory-zones"]
  },
  "ticket-keys": {
    s: "The keys that encrypt session tickets, generated, rotated on a schedule and shared across all workers and servers that must accept each other's tickets.",
    d: "A key set holds one active key for issuing tickets and previous keys for accepting older ones. Rotation adds a new key and retires the oldest on a timer, with every instance receiving the same set from a file or distribution service. Because anyone with a ticket key can decrypt recorded sessions' resumption secrets, long-lived keys weaken forward secrecy. It is hard because rotation must reach every server before it starts issuing tickets with the new key, and keys must be protected like private keys.",
    k: ["Short rotation interval versus long: short intervals limit the window in which a leaked key exposes past sessions, but need reliable distribution.", "Per-server random keys versus shared keys: per-server keys never leave memory, but resumption fails when a client lands on a different server."],
    p: ["Keys are generated at start and never rotated, so a server running for months can decrypt all tickets from that time.", "Distribution lags and servers issue tickets that peers cannot read, so resumption quietly falls back to full handshakes."],
    v: "Rotate keys and confirm tickets issued before rotation still resume until their retirement, new tickets use the new key, and all servers in a pool resume each other's tickets.",
    dep: ["session-resumption", "private-key-handling", "shared-memory-zones"]
  },
  "ocsp-stapling": {
    s: "Attaches a recent signed statement from the certificate authority that the certificate has not been revoked, so clients need not contact the authority themselves.",
    d: "The server fetches the authority's signed status response for each certificate in the background, caches it until shortly before it expires, and includes it in the handshake when the client asks. This saves clients a lookup and keeps their browsing private. A failed fetch should not break connections: the server keeps the last good response or sends none. It is hard because fetching must be non-blocking and retried, stale responses must not be served past expiry, and some certificates require stapling, so a missing response becomes a connection failure.",
    k: ["Fetch in the background versus at handshake time: background fetch keeps handshakes fast, but the first connections may go out without a response.", "Keep serving the last response through fetch failures versus drop it: serving covers authority outages, but must stop before the response's own expiry."],
    p: ["The response is fetched once at start and expires, and clients that require stapling reject the site days later.", "The server cannot reach the authority from its network segment and never staples, with no visible error."],
    v: "Connect with a client that requests status and confirm a valid stapled response is present with a validity window; block the authority and confirm the cached response is served until just before expiry.",
    dep: ["tls-handshake", "certificate-selection", "upstream-dns"]
  },
  "private-key-handling": {
    s: "How private keys are loaded, protected and used: file permissions, encryption at rest, separation from worker processes, and optional hardware or remote signing.",
    d: "Keys are read by the master before privileges are dropped, so workers can run as an unprivileged user, and in some designs a separate process or hardware module performs the signing so keys never enter worker memory. Passphrases are supplied without being stored in configuration. Reloads re-read the files, and a mismatch between certificate and key is detected at validation. It is hard because workers handle untrusted input and have the key in memory, so a memory disclosure bug exposes it, and because renewal has to replace keys without exposing old copies.",
    k: ["Key in worker memory versus a separate signing process: in-process is fast and simple, but any memory disclosure leaks the key; a separate signer adds a hop but isolates it.", "Rotate the key at each renewal versus reuse: new keys limit exposure from an old leak, but pinned deployments must update."],
    p: ["Key files are world-readable, or committed alongside the configuration in a repository.", "A passphrase stored in the configuration file defeats the encryption of the key."],
    v: "Inspect permissions and ownership of key files and process memory maps to confirm workers run unprivileged, that the key cannot be read by the worker user from disk, and that certificate and key match on load.",
    dep: ["master-process", "config-validation"]
  },
  "protocol-policy": {
    s: "The configured set of protocol versions, cipher suites, key exchange groups and signature algorithms the server will accept, balancing security against client compatibility.",
    d: "A policy lists minimum and maximum versions, ordered or server-preferred cipher choices, curves and signature types. Modern policies drop old versions and weak ciphers and prefer forward-secret key exchange. Different sites or listeners can have different policies. Changes are tested against the real client population, observed in handshake logs. It is hard because a tight policy blocks old but real clients such as embedded devices, a loose one leaves known weaknesses, and policy is global to a listener since negotiation happens before the site is known unless the name is read first.",
    k: ["Strict modern policy versus broad compatibility: strict gives the strongest guarantees, but excludes old clients silently.", "Server-preferred cipher order versus client-preferred: server order enforces the operator's ranking, while client order can choose faster ciphers for its hardware."],
    p: ["Old protocol versions stay enabled for one legacy client and expose every site on the listener to downgrade-style attacks.", "A tightened policy is deployed without checking logs, and a share of real users get handshake failures."],
    v: "Scan the listener with a tool that tries each version and cipher and confirm only the intended set is accepted; then review handshake logs for the share of clients failing before and after a change.",
    dep: ["tls-handshake", "config-language"]
  },
  "alpn": {
    s: "Negotiates the application protocol inside the handshake, so the server and client agree on HTTP/1.1, HTTP/2 or another protocol without an extra round trip.",
    d: "The client lists protocol identifiers in its hello, and the server selects the first in its preference order that it supports and answers in its response. The chosen identifier determines which protocol engine takes over the decrypted stream. Different identifiers can be used for non-HTTP services on the same port. It is hard because the choice is made before the site is known in some setups, because proxies that terminate and re-originate may offer different protocols upstream, and because a mismatch with a downstream device that cannot handle a protocol causes failures that look like network problems.",
    k: ["Prefer HTTP/2 when offered versus HTTP/1.1: HTTP/2 multiplexes and compresses headers, but exposes the server to its additional attack surface.", "Same protocol list for every site on a listener versus per site: a single list is simple, but negotiation occurs before per-site settings are applied."],
    p: ["The server offers HTTP/2 on a listener behind a device that mishandles it, producing intermittent hangs.", "A protocol identifier is accepted at negotiation but its engine is disabled for the site, and connections fail after the handshake."],
    v: "Connect with clients offering different protocol lists and confirm the selected protocol and the first frames match the choice, and that a client offering none gets HTTP/1.1.",
    dep: ["tls-handshake", "http2-framing", "http1-parser"]
  },
  "client-cert-verify": {
    s: "Requests a certificate from the client during the handshake and verifies its chain, validity and revocation status against configured trust anchors.",
    d: "The server sends a certificate request with the list of acceptable authorities, validates the received chain up to a configured trust store, checks dates, usage constraints and revocation through lists or online status, and records the outcome and subject for later rules. Verification can be required, optional or lenient so that applications decide. It is hard because trust stores must be curated, an optional mode that lets failures through without the application checking the result is a common hole, and revocation checks add network dependencies on the handshake path.",
    k: ["Required at handshake versus optional with later checks: required rejects early and cheaply, but optional mode supports mixed clients and needs every rule to check the result.", "Revocation by lists versus online status: lists work offline but go stale, while online checks are current but add latency and an availability dependency."],
    p: ["Optional verification is configured and no later rule checks the outcome, so clients without certificates reach protected content.", "The trust store includes a public authority bundle, so any certificate it issued is accepted as a client."],
    v: "Connect with a valid certificate, an expired one, one from an untrusted authority, a revoked one and none, and confirm the verification result variable and the allowed outcomes match the policy in every case.",
    dep: ["tls-handshake", "private-key-handling", "config-validation"]
  },
  "listen-sockets": {
    s: "The bound and listening sockets for each configured address and port, created by the master, with options for backlog, address reuse and protocol hints.",
    d: "At start the master binds each address, sets options such as backlog length, keep-alive probing, deferred accept and address reuse, and puts them into the listening state before dropping privileges. Descriptors are inherited by workers and handed to new generations on reload or upgrade. Wildcard and specific addresses are merged to avoid conflicting binds, and dual-stack behavior is set explicitly. It is hard because binding low ports needs privilege, because errors such as address in use abort a reload, and because the socket must outlive any one process to avoid dropped connections.",
    k: ["Bind in the master and share with workers versus each worker binding: master binding keeps sockets alive across restarts, but means one accept queue shared by workers.", "Wildcard binding versus specific addresses: wildcards are simple and survive address changes, but conflict with other services on specific addresses."],
    p: ["A reload tries to bind an address that another listener in the new configuration also claims and aborts.", "The listen queue is left at a small default and bursts are dropped at the kernel before the server sees them."],
    v: "List listening sockets from the operating system and confirm each configured address and port is bound by the master, with the expected options, and still bound after a reload.",
    dep: ["master-process", "fd-limits"]
  },
  "accept-distribution": {
    s: "How a new connection is assigned to one of many workers waiting on the same listening socket, avoiding both idle workers and a thundering herd of wakeups.",
    d: "With a shared listening socket every worker is woken for each connection and one wins. Mechanisms to reduce this include exclusive wakeups in the kernel, a user-space mutex held by one worker at a time, and per-worker sockets. Some servers accept many connections per wakeup, and some balance by moving connections among workers. It is hard because distribution can be uneven: a worker that wins the lock repeatedly takes more connections, while long-lived connections can concentrate on a few workers and leave others idle.",
    k: ["One shared queue with exclusive wakeup versus per-worker queues: shared is naturally work-conserving, but can bias towards recently active workers.", "Accept many connections per wakeup versus one: batching cuts system calls under load, but one worker may take a large share of a burst."],
    p: ["A few workers hold most long-lived connections while others sit idle, and latency on the busy ones climbs.", "All workers wake for every connection and burn CPU in a thundering herd at high connection rates."],
    v: "Open a large number of connections and read per-worker connection counts from metrics, confirming the spread stays within a small factor, and measure CPU spent in accept wakeups at a high connection rate.",
    dep: ["listen-sockets", "event-notification", "port-reuse"]
  },
  "port-reuse": {
    s: "Allows several sockets to bind the same address and port so the kernel spreads incoming connections or datagrams across them, one per worker.",
    d: "With port reuse each worker opens its own listening socket on the shared address, and the kernel hashes new connections by address and port tuple to one of them. This removes the shared accept queue and its lock contention and scales across cores, and for datagrams it keeps a flow on one worker. It is hard because the hash is blind to load, so uneven connection lifetimes cause imbalance; a worker that exits or is replaced closes its queue and the connections waiting in it are reset; and during reload old and new generations share the same hashing.",
    k: ["Per-worker sockets versus a shared socket: per-worker avoids contention and scales on many cores, but loses the work-conserving behavior of a shared queue.", "Hash by tuple versus steer by processor: tuple hashing is simple, while processor-aware steering improves cache locality but needs support in the kernel and cards."],
    p: ["A worker restart closes its socket and every connection queued on it is reset instead of moved to another worker.", "One heavy client opens many connections that hash to a single worker and pins it."],
    v: "Start workers with port reuse, send many short connections and confirm an even spread across per-worker sockets, then restart one worker under load and count resets.",
    dep: ["listen-sockets", "accept-distribution", "worker-supervision"]
  },
  "event-notification": {
    s: "The operating system interface that reports which of many sockets are readable or writable, so one thread can wait on thousands of connections at once.",
    d: "Workers register descriptors with a kernel event facility and block waiting for a batch of ready events, then run handlers for each. Edge-triggered modes report changes and need handlers to drain until the operation would block; level-triggered modes report while data remains. Timers are kept in a sorted structure and drive the wait timeout. Newer asynchronous interfaces submit operations to the kernel and receive completions. It is hard because handlers must never block, edge-triggered code that stops early loses wakeups forever, and fairness across ready connections needs bounded work per event.",
    k: ["Edge-triggered versus level-triggered notification: edge fires fewer events, but one missed drain stalls a connection permanently.", "Readiness model versus completion model: readiness is portable and well understood, while completion lets the kernel do the I/O and can reduce system calls at the cost of buffer ownership complexity."],
    p: ["A handler reads only part of the available data in edge-triggered mode and the connection never gets another event.", "A single connection with constant data monopolizes a worker because per-event work is unbounded."],
    v: "Hold ten thousand idle connections and confirm a worker sleeps with near-zero CPU, then send data to a few and confirm only those handlers run, with latency unaffected by the idle count.",
    dep: ["connection-state-machine", "timeouts", "fd-limits"]
  },
  "connection-state-machine": {
    s: "Each connection moves through defined states, such as handshaking, reading headers, processing, writing, idle and closing, driven by events and timers with a small footprint.",
    d: "A connection object holds the socket, its buffers, current state, timers and the request in progress. Events advance the state: readable data moves from waiting to parsing, a completed response moves to idle or close. Closing is staged so that pending output is flushed and the peer's final data is read, avoiding resets. The memory per connection is the main scale limit, so buffers are allocated lazily and returned when idle. It is hard because error and half-close paths multiply states, and a missed transition leaves a connection stuck consuming a descriptor forever.",
    k: ["Explicit state machine versus one coroutine or thread per connection: explicit states cost little memory per connection, but logic is split across handlers and harder to follow.", "Release buffers when idle versus keep them: releasing cuts memory for many idle connections, but allocates again on activity."],
    p: ["A connection waiting for a closing handshake never gets its final event and sits in a half-closed state until restart.", "Buffers are kept for idle keep-alive connections, and memory grows linearly with the number of idle clients."],
    v: "Open and close connections in every pattern, including client reset, half-close and timeout, and confirm connection and descriptor counts return to baseline with no connection left in an intermediate state.",
    dep: ["event-notification", "keep-alive", "timeouts", "memory-pools"]
  },
  "keep-alive": {
    s: "Keeps a connection open between requests so later ones skip connection setup and handshake, with limits on idle time and the number of requests per connection.",
    d: "After a response completes the connection returns to an idle state, reading again for the next request. Idle time and maximum requests are configured, and the server announces them to the client. Closing is chosen when the request had a close token, the body was not fully read, or a limit is reached. For multiplexed protocols the connection is kept for longer with its own idle limit. It is hard because idle connections cost memory and descriptors, a limit that is too long exhausts them under many clients, and one that is too short wastes handshakes.",
    k: ["Long idle timeout versus short: long saves setup for returning clients, but holds descriptors and memory for each idle connection.", "Cap requests per connection versus unlimited: a cap rebalances connections across workers and frees memory, but forces periodic reconnects."],
    p: ["The server closes an idle connection at the same moment a client or proxy sends a request on it, and the client sees a reset.", "Unread request bodies on error paths are left unconsumed and the next request on the connection is misparsed."],
    v: "Make several requests on one connection and confirm one connection setup, then wait past the idle timeout and confirm closure at the configured time, and confirm an unread body causes a close rather than reuse.",
    dep: ["connection-state-machine", "timeouts", "graceful-drain"]
  },
  "timeouts": {
    s: "Deadlines on client-side waits, such as handshake, header read, body read, send and idle, enforced with a timer structure keyed to each connection's current state.",
    d: "Each connection arms a timer when it begins waiting and cancels or re-arms it on progress. Timers live in an ordered structure or a wheel, and the loop's wait time is bounded by the earliest. On expiry the server closes the connection or answers with a request timeout status. Separate values exist for each phase. It is hard because re-arming on every byte lets a slow client extend a deadline indefinitely, timer structures must be cheap with huge counts, and timers cancelled on one path but not another fire on freed connections.",
    k: ["Timer per connection in an ordered structure versus a coarse wheel: ordered gives exact deadlines, while a wheel is cheaper to update at high rates but fires with some granularity.", "Reset on any progress versus absolute deadline for a phase: reset tolerates slow large transfers, but absolute stops slow-drip attacks."],
    p: ["The header read timeout resets with every received byte, so a client sending slowly holds the connection forever.", "A timer is left armed after the connection closes and fires into a reused slot."],
    v: "Stall a connection at each phase in turn and confirm it is closed at the configured time with the expected status and log phase name, and that active transfers making progress are not closed.",
    dep: ["connection-state-machine", "event-notification"]
  },
  "proxy-protocol": {
    s: "A small header prepended by a front-end connection forwarder that carries the original client address, so a server behind it can see real clients instead of the forwarder.",
    d: "The first bytes of the connection are a text or binary header giving the source and destination addresses and optionally extra fields such as the original server name. The server must be configured to expect it on a listener and to accept it only from trusted sources, then restores the addresses before any request processing. All later address-based rules, logs and limits use the restored values. It is hard because accepting it from anyone lets clients forge their address, and because a listener expecting the header fails on direct connections that lack it.",
    k: ["Proxy header versus a forwarded HTTP header: the proxy header works for any protocol and cannot be forged by the client inside the stream, but needs both ends configured identically.", "Accept from a list of trusted forwarders versus any: a list prevents forged addresses, but must be updated when the front tier changes."],
    p: ["The listener accepts the header from any peer, and clients choose their own address to bypass address rules.", "Direct health checks to a listener expecting the header fail because they do not send it."],
    v: "Connect through the forwarder and confirm the logged client address is the original one, then connect directly from an untrusted address with a forged header and confirm it is rejected.",
    dep: ["listen-sockets", "ip-access-rules", "rate-limiter"]
  },
  "write-backpressure": {
    s: "Stops producing output for a connection whose socket cannot accept more, and resumes on writability, so slow readers cost bounded memory instead of growing queues.",
    d: "A write attempt that cannot send everything leaves the remainder queued and registers interest in writability; the producer, such as a file reader or upstream reader, is paused until the queue drains below a mark. Limits on the output queue size and on the kernel send buffer control how much is in flight. For multiplexed protocols the pressure is applied per stream and per connection. It is hard because every producer must observe the signal, one that does not buffers without bound, and pausing must not deadlock when the pause condition depends on the data being drained.",
    k: ["Small output buffers with pausing versus large buffers: small buffers bound memory per slow client, but add wakeups and may underfill fast links.", "Pause the upstream read versus buffer to disk: pausing holds the upstream connection, but disk buffering frees it at the cost of disk I/O."],
    p: ["A producer ignores the pause signal and queues the whole response in memory for a client reading one byte a second.", "Pausing the upstream read also stops reading its close or error, and the failure is never noticed."],
    v: "Download a large file with a client that reads slowly and confirm server memory per connection stays below the configured bound, then resume reading and confirm throughput recovers.",
    dep: ["event-notification", "connection-state-machine", "buffer-chains"]
  },
  "master-process": {
    s: "A privileged supervisor that reads the configuration, binds sockets, starts and monitors workers, and handles signals for reload, upgrade, log reopen and shutdown.",
    d: "The master does little work itself. It parses and validates configuration, opens sockets and files that need privilege, creates shared memory, forks workers that drop privileges, and loops waiting for signals and child exits. It coordinates generations during reload, restarts crashed workers, and writes its identifier to a pidfile. It is hard because it is the single point that must never fail or stall, it holds the keys and the sockets, and its own attack surface must be tiny since it runs with the most privilege.",
    k: ["Separate master and workers versus a single process: separation allows privilege dropping, restarts and reloads, but adds process management and shared memory.", "Master does only supervision versus also serving: a supervisor-only master stays small and safe, but costs a process and its memory."],
    p: ["The master dies and workers keep running without anyone to restart or reload them.", "The pidfile points to an old master after an upgrade, and signals go to the wrong process."],
    v: "List processes and confirm one privileged master and unprivileged workers, kill a worker and confirm it is replaced, and send reload and reopen signals and confirm the documented effects.",
    dep: ["worker-supervision", "listen-sockets", "shared-memory-zones"]
  },
  "prefork-model": {
    s: "A model with a pool of single-threaded processes, each handling one connection at a time, with simple isolation but a high cost per concurrent connection.",
    d: "The master starts a number of processes that each accept a connection and handle all of its requests before taking another. A scaling policy adds or removes processes based on how many are idle. Processes share nothing by default, so a crash or memory leak affects only one connection, and non-thread-safe extensions are fine. It is hard because concurrent connections equal processes: idle keep-alive clients occupy workers, so a handful of slow clients exhaust the pool, and memory per process limits how many can exist.",
    k: ["Process per connection versus event loop: processes isolate faults and allow blocking code, but each idle connection costs a whole process.", "Dynamic pool sizing versus fixed: dynamic adapts to load and saves memory, but spawning during a burst adds latency."],
    p: ["Slow clients or long keep-alive hold every process and new clients wait in the accept queue.", "Pool growth under a burst exhausts memory, and the system starts swapping."],
    v: "Open as many slow connections as there are processes and confirm a new request waits or is refused, then close them and confirm service recovers; record memory per process times pool size against available memory.",
    dep: ["master-process", "worker-supervision", "keep-alive"]
  },
  "threaded-model": {
    s: "A model where each connection or request is handled by a thread from a pool, with shared memory between handlers and blocking calls allowed on the request path.",
    d: "A pool of threads blocks accepting or takes connections from a queue, runs the whole request including blocking file and network calls, and returns to the pool. Threads share caches, counters and configuration without any copying, and use less memory than processes. A thread stack is still a cost per concurrent connection. It is hard because shared mutable state needs locking, a fault in one thread can take down the process, and thread counts that match connections grow into the thousands, with scheduling and stack memory costs.",
    k: ["Thread per connection versus event loop: threads allow simple blocking code and cheap sharing, but concurrency is limited by stack memory and scheduling cost.", "Shared state with locks versus message passing: locks are direct and fast when uncontended, but contention and ordering bugs are easy to introduce."],
    p: ["A crash or memory corruption in one request thread kills the process and every connection with it.", "A lock held across a blocking call stalls every thread that needs it."],
    v: "Run a load with thousands of concurrent slow connections and confirm thread count, memory and context switches stay within limits, and a handler holding a blocking call stalls only its own connection.",
    dep: ["master-process", "shared-memory-zones", "memory-pools"]
  },
  "event-loop-workers": {
    s: "Few single-threaded workers, one per core, each running a non-blocking event loop that multiplexes thousands of connections with state machines instead of threads.",
    d: "Each worker waits on the event interface, runs short handlers for readable, writable and timer events, and never blocks. Connections are owned by one worker, so most data needs no locks. A configured count, usually the number of cores, is started and optionally bound to cores. Memory per connection is small and stable. It is hard because every handler must be bounded in time: a slow call, a heavy regular expression or a blocking disk read stalls all of that worker's connections, and uneven connection distribution leaves some workers hot.",
    k: ["One loop per core, shared-nothing versus a thread per connection: loops scale to enormous idle connection counts cheaply, but all code must be non-blocking.", "Bind workers to cores versus let the scheduler move them: binding improves cache locality and interrupt alignment, but can leave a core idle when another is overloaded."],
    p: ["A handler does a blocking disk read on a cold file and the whole worker stalls for tens of milliseconds.", "A module runs heavy computation inline, and tail latency rises for every connection on its worker."],
    v: "Measure loop iteration time under load and confirm a high percentile below a few milliseconds, then inject a blocking call and confirm which connections are delayed.",
    dep: ["event-notification", "connection-state-machine", "timeouts", "thread-pool-offload"]
  },
  "hybrid-model": {
    s: "A combination such as several processes each running event loops plus helper threads, or processes for isolation with threads for blocking work, chosen to match the hardware and the workload.",
    d: "A common arrangement runs one process per group of cores, each with several event-loop threads sharing a listener and caches, plus a pool for blocking operations. Another splits by site: separate worker groups run different configurations under different users. Mixed models trade isolation against sharing: processes limit fault spread and let memory be reclaimed, while threads inside a process share caches and connection tables. It is hard because the model has to be explained and tested as a whole, and failures cross boundaries in unexpected ways.",
    k: ["Several processes with threads versus one process: several processes limit the blast radius of a crash and reduce lock contention, but split caches and counters.", "Group by site versus identical workers: grouping isolates tenants and users, but needs more processes and uneven resource use."],
    p: ["Shared counters and limits are assumed global but are per process, and limits are multiplied by the process count.", "A crash in a shared thread pool takes down every loop thread in its process at once."],
    v: "Kill one process in the hybrid and confirm only its share of connections fail while others continue, and that cache hit rate and limits behave as documented across the process boundary.",
    dep: ["event-loop-workers", "thread-pool-offload", "shared-memory-zones", "master-process"]
  },
  "thread-pool-offload": {
    s: "A pool of helper threads that runs blocking operations, such as disk reads and writes or slow lookups, for the event loops, which resume the request on completion.",
    d: "A handler packages a blocking operation into a task, places it on a queue and returns to the loop. A pool thread runs it and notifies the loop through an event when finished, and the request continues. Queue length and thread count are bounded, and tasks have a completion handler that runs back on the owning loop. It is hard because the queue is a new source of latency and failure: when it is full, requests must be delayed or failed, completion must handle a connection that closed in the meantime, and offloading a fast operation costs more than doing it inline.",
    k: ["Offload blocking disk I/O versus rely on the page cache: offloading protects the loop from cold reads, but adds hand-off cost to hot, cached files.", "Bounded queue versus unbounded: a bound limits memory and latency under overload, but requires a defined behavior when it fills."],
    p: ["A task completes after the client has gone and writes to a freed connection.", "A burst of cold-file requests fills the queue and every static request waits behind slow disk reads."],
    v: "Serve cold files from a slow disk with the pool enabled and confirm unrelated connections keep low latency, queue length is reported in metrics, and a closed client does not crash the completion.",
    dep: ["event-notification", "event-loop-workers", "memory-pools"]
  },
  "worker-supervision": {
    s: "Detects worker exit or hang, replaces it, and limits restart rates, while keeping the rest of the service running and recording the cause.",
    d: "The master receives child-exit notices, logs the exit status or signal, and starts a replacement. Optional watchdogs detect hung workers through heartbeats in shared memory and terminate them. Restart rate limits prevent a crash loop from consuming the machine. Crash dumps can be enabled for diagnosis. It is hard because a crash in a worker that holds shared locks can leave shared state inconsistent, and restarting changes connection distribution, resetting connections that were queued for that worker.",
    k: ["Automatic restart versus fail the service: restart keeps traffic flowing after isolated faults, but a crash loop can hide a persistent bug.", "Heartbeat watchdog versus exit detection only: a watchdog also catches hangs, but needs tuning so slow but healthy workers are not killed."],
    p: ["A worker crashing on a specific request is restarted and the same request is retried by the client, producing a crash loop.", "A hung worker holds connections and is never detected because it has not exited."],
    v: "Kill a worker with a signal and confirm a replacement starts and the event is logged with the cause, then block a worker in a loop and confirm the watchdog restarts it within its interval.",
    dep: ["master-process", "shared-memory-zones"]
  },
  "shared-memory-zones": {
    s: "Named memory areas shared by all workers, holding cache indexes, rate limit tables, health state and counters, managed by a slab allocator and protected by locks or atomics.",
    d: "The master creates zones before forking, sized by configuration, and each worker maps them. Structures inside, such as hash tables and trees, are built from a slab allocator and guarded by spin locks or atomic operations. Zones allow limits, caches and health to be global across workers. They cannot be resized live, and they are lost on restart unless backed by files. It is hard because a worker that dies holding a lock blocks others, zones fill up and must evict or fail, and layout changes between versions make them incompatible during an upgrade.",
    k: ["Shared zones versus per-worker structures: shared give true global limits and state, but add lock contention and a failure mode when a holder dies.", "Fixed-size zones versus growable: fixed zones are simple and predictable, but a wrong size is only fixed by a restart."],
    p: ["A zone sized too small evicts live rate-limit or cache entries and limits stop working under load.", "A worker killed while holding a lock leaves other workers spinning until a timeout recovers it."],
    v: "Fill a zone past its size and confirm the documented eviction or error behavior with a log message, and kill a worker holding a lock and confirm others recover within the lock timeout.",
    dep: ["slab-allocator", "master-process"]
  },
  "fd-limits": {
    s: "The operating system limits on open descriptors and memory that the server must raise and stay under, since every connection, file and upstream socket consumes a descriptor.",
    d: "Each client connection, upstream connection, cached file, log and listening socket uses a descriptor, and a proxied request uses at least two. The master raises the per-process limit to match the configured connection count, and the system also has global and per-user ceilings, ephemeral port ranges for upstream connections, and connection tracking tables in firewalls. When any limit is hit, accepts fail. It is hard because the limit that is hit is often not the one that was raised, and the failure appears as intermittent refusals rather than a clear error.",
    k: ["Raise limits to match the maximum connection setting versus rely on defaults: matching avoids accept failures, but each connection also costs kernel memory.", "Reserve descriptors for internal use versus use all for connections: a reserve keeps logging and file serving working at the limit, but lowers peak connections."],
    p: ["Upstream connections are exhausted by ephemeral port range limits long before the descriptor limit, and new proxied requests fail with connect errors.", "The limit is raised in the shell used for testing but not in the service definition that runs in production."],
    v: "Drive connections to the configured maximum and confirm accepts succeed up to it, then past it confirm the documented failure and a logged message, and read the running process's limits from the system to confirm they match configuration.",
    dep: ["master-process"]
  },
  "module-api": {
    s: "The defined interface for adding features: configuration directives, per-scope settings, request-phase handlers, filters and lifecycle callbacks, with a fixed registration table.",
    d: "A module declares its directives with their contexts and parsers, callbacks to create and merge settings at each scope, and hooks called at start, per-worker start and exit. Handlers register in request phases and filters in the chain. Modules have access to request and connection structures, memory pools and shared zones. It is hard because the interface is in-process and unprotected: a module with a bug can corrupt memory, a blocking call stalls the loop, and the order of modules decides filter and handler order.",
    k: ["In-process modules versus out-of-process extensions: in-process is fast and powerful, but a fault takes down the worker and a blocking call stalls everything.", "A narrow stable interface versus direct access to internals: a narrow interface survives upgrades, but limits what modules can do."],
    p: ["A third-party module allocates from the wrong pool and the memory is freed while still referenced.", "Module order is changed and a filter now runs before the one whose output it depends on."],
    v: "Load a test module that registers a directive, a handler and a filter, and confirm each is called in the expected phase with the right merged settings, and that unloading it at reload releases all its resources.",
    dep: ["memory-pools", "filter-chain", "phase-pipeline"]
  },
  "module-loading": {
    s: "Builds modules into the binary or loads them from shared libraries at start, with version checks so a module compiled against another version is refused.",
    d: "Static modules are compiled in and fixed. Dynamic modules are loaded by a configuration directive, resolved against the server's symbol table, and checked for matching interface version and build signature. The order of loading sets the order of registration. Loading happens at start and reload, not at runtime for running workers. It is hard because a mismatched module crashes in unpredictable ways, some build options change structure layouts silently, and dynamic loading widens the supply chain by running code from outside the base build.",
    k: ["Dynamic loading versus compile-time inclusion: dynamic allows adding features without rebuilding, but needs signature checks and widens the supply-chain risk.", "Strict build signature match versus tolerant loading: strict refuses incompatible modules early, but forces rebuilds for every server upgrade."],
    p: ["A module built against a different version loads and corrupts memory later under specific requests.", "A module directory is writable by a less privileged user, who can place code that runs as the server."],
    v: "Attempt to load a module built for a different version and confirm it is refused with a clear message, then load a matching one and confirm its directives are available and it is listed in the loaded module report.",
    dep: ["module-api", "config-validation", "master-process"]
  },
  "filter-chain": {
    s: "An ordered chain of output filters through which every response body passes in buffer chains, each transforming or forwarding to the next until the connection writer.",
    d: "Header filters run first and can change status and headers; body filters receive chains of buffers, process them and call the next filter. Typical order is range handling, compression, substitution, chunking and then write. Modules insert themselves in a defined order at start. Filters can hold data and must be told when it ends and when to flush. It is hard because one filter that misbehaves breaks everything after it, header filters must run before the headers are sent, and the order determines semantics, since compressing before chunking is not the same as the reverse.",
    k: ["Static ordered chain versus per-request composition: a static chain is simple and fast, but each response pays for every filter that must check applicability.", "Streaming filters versus whole-body filters: streaming bounds memory, but filters needing global knowledge must buffer."],
    p: ["A filter returns without passing the end marker, so the chunked response never terminates.", "A header filter changes the length after a body filter already depended on it."],
    v: "Enable several filters and fetch a response, confirming the order of operations in the debug log, correct final headers and body bytes, and a correct termination when a filter holds data until the end.",
    dep: ["buffer-chains", "module-api", "memory-pools"]
  },
  "embedded-scripting": {
    s: "A small embedded interpreter or compiled-to-bytecode runtime that lets operators write request logic, such as custom routing, authentication or response edits, without building a module.",
    d: "Scripts run inside a request phase with an API to read and write headers, variables, subrequests and shared tables, using non-blocking primitives scheduled on the event loop through coroutines. Each request gets a lightweight coroutine, and compiled code is cached. Limits on memory, time and calls protect the worker. It is hard because scripts run inside the worker process: an infinite loop or a blocking call stalls every connection, and unbounded memory use affects the process, and mistakes in handling untrusted values give injection into headers or paths.",
    k: ["Embedded scripts versus compiled modules: scripts are quick to change and safe from build issues, but are slower and run inside the worker with limited isolation.", "Non-blocking API with coroutines versus blocking calls in threads: coroutines keep the loop free, but all libraries used must be non-blocking."],
    p: ["A script performs a CPU-heavy loop and stalls every connection on its worker.", "A script builds a header from a request value without escaping, allowing response splitting."],
    v: "Run a script that sets a header and makes a subrequest, confirm both work under concurrent load without stalling other requests, then run one with an endless loop and confirm the configured time limit stops it.",
    dep: ["module-api", "phase-pipeline", "event-notification", "shared-memory-zones"]
  },
  "memory-pools": {
    s: "Per-connection and per-request allocation arenas that hand out memory by bumping a pointer and free everything at once when the request or connection ends.",
    d: "Each request creates a pool with a first block; allocations are carved from it with a pointer increment, new blocks are chained when it is full, and large allocations go to a separate list. Cleanup callbacks registered in the pool release files and other resources. The pool is destroyed in one operation at the end, so there are no individual frees on the hot path and no leaks from forgotten frees. It is hard because lifetimes must be right: memory from a request pool referenced after the request ends is a use-after-free, and long-lived connections with pools never reset grow without bound.",
    k: ["Pool per request freed in bulk versus individual allocation and free: pools are fast and prevent leaks, but hold memory until the end and make lifetime mistakes subtle.", "Connection-lifetime pool versus request-lifetime pool: connection pools suit data reused across requests, but must be bounded on long keep-alive connections."],
    p: ["A pointer to request memory is stored in a connection-level structure and read after the request pool is destroyed.", "A long-lived upgraded connection grows its pool for days as data accumulates with nothing to reset it."],
    v: "Run a million requests and confirm memory per worker stays flat, with allocation and cleanup counts balanced, and run a memory error checker under a request corpus to confirm no use-after-free.",
    dep: []
  },
  "buffer-chains": {
    s: "Linked lists of buffer descriptors that point to memory or file ranges, so bodies are passed between stages without copying and can mix in-memory data with file segments.",
    d: "A buffer descriptor holds start and end pointers or a file offset and length, flags for last, flush and temporary data, and a link to the next. Modules and filters pass chains along, and consumers send them with gathered writes. Free lists recycle descriptors. Buffers that point to files can be sent without reading. It is hard because ownership is shared: a buffer must not be recycled while a downstream stage or the kernel still references it, and splitting or merging chains correctly at boundaries requires strict handling of the last and flush markers.",
    k: ["Chains of references versus contiguous copies: chains avoid copying large bodies, but every stage must handle fragmented data and ownership.", "Recycle descriptors in free lists versus allocate each time: recycling cuts allocation cost, but reuse bugs corrupt data and are hard to find."],
    p: ["A buffer is recycled while the kernel still holds a reference for a pending write, and the client receives corrupted data.", "A filter drops the last-buffer marker when splitting a chain, and the response never completes."],
    v: "Pass a large mixed memory-and-file body through the filter chain and confirm the bytes received match the source exactly, with the terminating marker present, and that buffer counts return to baseline afterwards.",
    dep: ["memory-pools"]
  },
  "slab-allocator": {
    s: "A fixed-size-class allocator managing the contents of shared memory zones, since the zones cannot call the general allocator and must avoid fragmentation.",
    d: "A zone is divided into pages and each page into slots of one size class, with bitmaps tracking which are free. Allocation rounds the request up to a class and takes a slot, and freeing returns it, merging empty pages back. A lock protects the allocator, and structures built on top such as trees and queues use it. Eviction policies recover space when it runs out. It is hard because fragmentation is permanent once classes are carved, large objects do not fit small classes, and a single global lock makes allocation a contention point under many workers.",
    k: ["Size classes versus general-purpose allocation: classes are fast and bounded, but waste space inside slots and fragment across classes.", "One lock per zone versus finer locking: one lock is simple and correct, but becomes the bottleneck on many cores."],
    p: ["Many small entries carve all pages into one class and then a request for another size fails despite free memory.", "A high allocation rate under a single zone lock makes workers spend their time waiting on it."],
    v: "Fill and empty a zone repeatedly with mixed sizes and confirm used and free counts return to baseline, then measure allocation latency with many workers contending and compare it against the lock hold time.",
    dep: []
  }
});
