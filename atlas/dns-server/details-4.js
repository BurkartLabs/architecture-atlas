// Details for the DNS server plate, part 4: message format, transports, platform and deployment.
ATLAS.details("dns-server", {
  "message-header": {
    s: "The fixed 12-byte start of every message: a transaction identifier, flag bits, an operation code, a response code and counts of the records in each section.",
    d: "The header carries a 16-bit identifier the client chooses and the server echoes, flag bits for query or response, authoritative answer, truncation, recursion desired and available, and authenticated data, plus four counts. Parsers must check the counts against the actual data. It is hard because it is the first thing parsed from untrusted input: counts that lie, reserved bits and unusual operation codes are common sources of crashes and misbehavior.",
    k: ["Strict validation of header fields vs lenient parsing: strict rejection stops malformed probing and breaks odd but working clients; lenient parsing maximizes compatibility and widens the attack surface.", "Echoing unknown flag bits vs clearing them: clearing is clean and safe; echoing preserves information for future extensions at the risk of confusing peers."],
    p: ["Trusting section counts allocates huge arrays or reads past the buffer.", "A 16-bit identifier alone is too small to resist guessing without other randomness."],
    v: "Send messages with inconsistent counts, reserved bits set and unknown operation codes and confirm the server returns defined error codes or drops them without crashing, with each case counted in metrics.",
    dep: ["rcodes-and-flags"]
  },
  "question-section": {
    s: "The part of a message naming what is being asked: a domain name, a record type and a class, repeated as the first section of both query and response.",
    d: "A query carries one question with a name encoded as length-prefixed labels, a 16-bit type and a 16-bit class, nearly always the internet class. Responses repeat it so the client can match. Resolvers compare the echoed question exactly as part of anti-spoofing. Multiple questions are legal in the format and unsupported in practice. It is hard to parse because names have length limits per label and total, and compression pointers are forbidden here but appear in malicious packets.",
    k: ["Rejecting multiple questions vs accepting them: rejecting avoids ambiguity in response codes and flags; accepting follows the format literally and has no practical use.", "Case-preserving echo vs normalized echo: preserving case supports case randomization defenses; normalization simplifies internal processing."],
    p: ["Names exceeding the 255-byte total length cause buffer errors when not checked.", "A class other than the internet class is mishandled by code that assumes only one."],
    v: "Send queries with a 63-byte label, a 64-byte label, a maximum-length name and a name over the limit, and confirm each valid one is answered and each invalid one gets a format error.",
    dep: ["message-header","name-compression"]
  },
  "resource-record-format": {
    s: "The layout of one record: owner name, type, class, time to live, data length and type-specific data, used in the answer, authority and additional sections.",
    d: "Every record has the same envelope followed by data whose structure depends on type: an address, a name, a text string, a preference plus a name, or a structured set of fields. Records of one name, type and class form a set that is treated as a unit for caching, ordering and signing. It is hard because many types include names that are compressible in some cases and must not be compressed in others, and because unknown types must be carried opaquely.",
    k: ["Parsing known types into structures vs carrying data opaquely: parsing validates and enables policy; opaque carrying forwards new types without software changes.", "Preserving record order in a set vs sorting: preserving order allows round-robin rotation; sorting is canonical for signing and comparison."],
    p: ["A data length that does not match the parsed structure lets a record hide extra bytes.", "Compressing names inside a type that forbids it breaks older receivers."],
    v: "Round-trip a record of every supported type through parse and serialize and confirm bytes are identical, and confirm a record of an unknown type passes through the server unchanged.",
    dep: ["name-compression","record-types"]
  },
  "name-compression": {
    s: "A space-saving scheme where a repeated name or suffix in a message is replaced by a two-byte pointer to its earlier occurrence.",
    d: "A name is a sequence of labels ending with a zero length or a pointer to an offset elsewhere in the message. Writers keep a table of names already emitted to point at; readers follow pointers to rebuild the name. Compression is limited to the first 16 kilobytes by the pointer size. It is a repeated source of vulnerabilities: pointer loops, forward pointers and pointers into the middle of other data must be rejected, and the expanded size must be bounded.",
    k: ["Aggressive compression vs minimal: aggressive compression fits more into 512 bytes and costs table maintenance; minimal is faster to write and wastes space.", "Following pointers with a hop limit vs recording visited offsets: a hop limit is trivial and cheap; visited tracking is exact and costs memory per name."],
    p: ["A pointer to itself or in a cycle causes an infinite loop in naive parsers.", "Expanding many pointers makes a small message decompress into enormous names."],
    v: "Feed the parser a message with a pointer loop, a forward pointer and a maximum-depth chain and confirm it rejects the first two and parses the third within a fixed number of steps.",
    dep: ["question-section"]
  },
  "edns-options": {
    s: "The extension mechanism carried in a pseudo-record that advertises larger UDP sizes, flags such as the signature-aware bit, and typed options like cookies and client subnet.",
    d: "A client adds an extra record to the additional section to say how big a UDP reply it accepts, whether it wants signature records, and optional extension data. The server echoes support and replies with options. Extensions include cookies, padding, client subnet and error detail codes. It is hard because the mechanism must degrade gracefully: unknown options are ignored, the buffer size field is a security-sensitive value, and some old servers answer such queries with errors.",
    k: ["Large advertised buffer vs conservative: large buffers avoid TCP fallback and risk fragmentation loss and amplification; conservative sizes stay under path limits and use TCP more often.", "Padding replies on encrypted links vs not: padding hides lengths from observers and increases bandwidth; skipping saves bytes and leaks which names were asked."],
    p: ["A buffer size set above the path MTU causes fragmented responses that firewalls silently drop.", "Servers that reject unknown options break clients that send new extensions."],
    v: "Send queries with different buffer sizes and an unknown option and confirm the reply respects the advertised size, ignores the option and echoes the extension record with the server's supported flags.",
    dep: ["message-header","resource-record-format"]
  },
  "rcodes-and-flags": {
    s: "The result codes and flag bits that describe an outcome: success, format error, server failure, nonexistent name, not implemented or refused, plus authority, truncation and recursion bits.",
    d: "Clients decide what to do next from the code and flags. Success with an empty answer means no data; the nonexistent-name code means the name is absent; server failure means the server could not complete the lookup; refused means policy denies service. Extension error codes add detail, such as stale answer, signature expired or blocked by policy. It is hard because the same code is used for many causes and clients treat them very differently, including caching them.",
    k: ["Detailed extended error codes vs plain codes: detail speeds up diagnosis and reveals a bit about internals; plain codes are minimal and hide the reason.", "Refused vs dropped for policy denials: refused is explicit and cheap; dropped avoids acknowledging the server's existence."],
    p: ["Returning server failure for validation errors is indistinguishable from an outage without the extended code.", "Sending a nonexistent-name code for a failing upstream causes negative caching of valid names."],
    v: "Trigger each outcome with test names, a blocked source, a bad signature and a dead upstream, and confirm the response code, flags and extended code in each reply match the documented table.",
    dep: ["message-header","edns-options"]
  },
  "record-types": {
    s: "The registry of record types the server understands and serves: addresses, names, mail routing, text, services, certificates, security parameters and the types used by signing.",
    d: "Each type defines its data layout, text form, whether embedded names compress, and rules for how it interacts with others, such as an alias not coexisting with other data. Servers handle the common ones specially and treat unknown types opaquely using a generic format. New types are added by standards, and the long list of obsolete types remains parsed. It is hard to keep tidy because new types may need server logic, such as additional-section processing, and not just storage.",
    k: ["Built-in knowledge of each type vs generic handling: built-in knowledge validates and fills additional data; generic handling adds new types without a release but cannot check them.", "Supporting obsolete types vs rejecting them: supporting them keeps old zones loading; rejecting reduces code and breaks legacy data."],
    p: ["Zone files with an unsupported type fail to load for the entire zone.", "A server that refuses unknown types in queries breaks clients using newer ones."],
    v: "Load a zone containing a known type, an obsolete type and an unregistered type written in the generic format, and confirm all are served byte-exact and the known type's additional records are included.",
    dep: ["resource-record-format"]
  },
  "udp-transport": {
    s: "Carrying one query and one reply in single datagrams, the default and fastest transport, limited by packet size and by the absence of any proof the sender is who it claims.",
    d: "A client sends a datagram to port 53 and waits; the server replies from the same address. There is no connection, so servers hold no per-client state, and one socket serves many clients. Replies larger than the limit are truncated. Because the source address is unverified, the transport is the basis of reflection attacks. It is hard to operate: loss requires client retries, fragmentation breaks through filters, and handling millions of packets a second needs careful I/O design.",
    k: ["Stateless datagrams vs connections: datagrams scale cheaply and allow spoofing and amplification; connections prove the sender and cost memory and handshakes.", "Large payload with fragmentation vs capped payload with TCP fallback: fragmentation avoids TCP and is often dropped by networks; capping at about 1,200 bytes avoids fragmentation and sends more traffic over TCP."],
    p: ["Fragmented replies that are dropped by middleboxes cause timeouts only for large answers.", "Retrying immediately on loss multiplies load during an overload."],
    v: "Measure query latency and loss with a load tool at increasing rates and confirm replies stay correct up to the target rate, with fragmented replies absent when the payload cap is set.",
    dep: ["socket-layer","message-header"]
  },
  "tcp-transport": {
    s: "Carrying messages over a stream connection, each prefixed with a length, used for large answers, zone transfers and anywhere proof of the sender's address is needed.",
    d: "The client opens a connection, sends a two-byte length and the message, and receives the same. A single connection can carry many queries. The server keeps per-connection state and must limit how many connections it accepts and how long they idle. TCP is required of every implementation. It is hard because the connection state is a resource attackers can exhaust, and because slow clients hold memory.",
    k: ["Accepting many connections vs capping: many connections serve legitimate fallback demand and can be exhausted by an attacker; caps protect the server and refuse real clients under load.", "Short idle timeouts vs long: short timeouts free resources quickly and force reconnection; long timeouts help clients with bursts and hold memory longer."],
    p: ["No idle timeout lets slow connections accumulate until the process runs out of descriptors.", "A server that cannot answer over TCP fails every truncated query."],
    v: "Open the configured maximum number of idle connections and confirm the server enforces its limit and idle timeout while still answering new queries from existing clients over UDP.",
    dep: ["socket-layer","worker-threading"]
  },
  "truncation-fallback": {
    s: "The mechanism where a server sets a truncation flag when a reply does not fit in a datagram and the client repeats the query over a stream connection.",
    d: "The server fits as many whole records as possible, sets the truncation bit, and sends the shortened reply. The client sees the bit and retries over TCP, getting the full answer. Truncation can also be used deliberately, as a rate-limit response, to push a client to prove its address. It is hard because some middleboxes block TCP port 53, so truncated answers become permanent failures, and because partial replies must not be cached as complete.",
    k: ["Truncating early to push clients to TCP vs sending the largest UDP reply: early truncation reduces amplification and spoofing; large UDP replies avoid TCP cost and risk fragmentation.", "Dropping extra records vs the whole answer set on truncation: dropping extras keeps the answer usable; dropping the answer forces TCP for every large set."],
    p: ["Networks that block TCP to port 53 make every large response permanently unreachable.", "Caching a truncated reply as complete serves incomplete record sets."],
    v: "Query a name whose answer exceeds the buffer size, confirm the UDP reply has the truncation flag and the client then succeeds over TCP with the full set.",
    dep: ["udp-transport","tcp-transport","edns-options"]
  },
  "connection-reuse": {
    s: "Keeping a stream connection open for many queries, with pipelining and out-of-order replies, to amortize the cost of connection and encryption setup.",
    d: "A client sends several queries on one connection without waiting for each reply, and the server may answer them in any order, with the identifier matching them. Idle timeouts bound how long the connection lives. Servers must apply fairness so one client's burst does not starve others, and client-side keepalive options coordinate how long to keep the link. It is hard because head-of-line blocking, slow answers and per-connection memory trade against the savings.",
    k: ["Out-of-order replies vs strictly ordered: out-of-order avoids slow lookups blocking fast ones and requires client matching; ordered is simple and stalls on the slowest.", "Per-connection query limits vs unlimited: limits stop one connection monopolizing workers; unlimited is simplest and unfair under abuse."],
    p: ["Clients that open a new connection per query throw away the benefit and exhaust the server.", "A pipelined burst on one connection fills a worker queue and delays other users."],
    v: "Send 100 pipelined queries on one connection with slow and fast names mixed and confirm fast answers return before slow ones and all identifiers match, with only one connection setup in the capture.",
    dep: ["tcp-transport","dns-over-tls"]
  },
  "dns-over-tls": {
    s: "Carrying DNS messages over a TLS-protected stream connection on a dedicated port, hiding queries from network observers and authenticating the server.",
    d: "After the TLS handshake, the client and server exchange length-prefixed messages exactly as over TCP. The client authenticates the server by certificate name or a pinned key and may use opportunistic mode that encrypts without verifying. Session resumption cuts the handshake cost. Servers need certificates and spend CPU and memory per connection. It is hard because encryption hides the traffic from network operators who used to filter it, and because blocking is easy on a dedicated port.",
    k: ["Strict authentication vs opportunistic encryption: strict protects against active attackers and fails when certificates are wrong; opportunistic always works and only defeats passive observers.", "Dedicated port vs shared port: a dedicated port is clear and easily blocked; sharing with other protocols is harder to block and complicates server logic."],
    p: ["An expired server certificate makes every strict client fail at once.", "Handshake floods consume CPU because each new connection costs a public-key operation."],
    v: "Connect with a client that checks the certificate name, send a query, and confirm the capture shows only encrypted data after the handshake and that a mismatched certificate name causes the client to refuse.",
    dep: ["tcp-transport","connection-reuse","transport-discovery"]
  },
  "dns-over-https": {
    s: "Carrying DNS messages inside HTTP requests over an encrypted connection, so they travel on the same port as web traffic and can use web infrastructure.",
    d: "Each query is a request, either carrying the binary message in the body or encoded in the URL, to a well-known path, and the response carries the reply with a media type and cache headers. It runs over multiplexed streams, so many queries share a connection. Applications can use it without operating-system support. It is hard because HTTP adds overhead and a second set of caching rules, and moving resolver choice into applications can bypass the network's configured policy.",
    k: ["POST of the binary message vs GET with encoded URL: POST is compact and not cacheable by intermediaries; GET enables HTTP caching and puts the query in logs and URLs.", "Application-level resolver choice vs system resolver: application choice protects privacy from the local network and bypasses local filtering and split-horizon names."],
    p: ["HTTP cache lifetimes that differ from the DNS TTL serve answers longer or shorter than intended.", "Queries in URLs end up in web server and proxy logs."],
    v: "Send a query with each method to the endpoint, confirm the answer matches a plain query, and inspect the response headers to confirm the cache lifetime matches the answer's smallest TTL.",
    dep: ["connection-reuse","dns-over-tls","transport-discovery"]
  },
  "dns-over-quic": {
    s: "Carrying DNS messages over an encrypted multiplexed transport built on datagrams, giving encryption without head-of-line blocking and with faster connection setup.",
    d: "Each query uses its own stream within one encrypted connection, so a lost packet delays only the affected stream. Zero- or one-round-trip resumption makes repeat connections nearly as fast as plain datagrams. It uses its own port and the same certificate model as the TLS variant. It is hard because user-space transport implementations are heavier than kernel TCP and some networks block or throttle unknown datagram flows.",
    k: ["Stream per query vs shared stream: stream per query avoids blocking and costs slightly more state; a shared stream is simpler and brings blocking back.", "Early data on resumption vs full handshake: early data saves a round trip and exposes the first query to replay; a full handshake is slower and safer."],
    p: ["Networks that drop unknown UDP flows silently break connections, so a fallback transport is required.", "Replayed early-data queries can repeat state-changing requests such as updates."],
    v: "Resolve through the transport on a lossy link with 2% packet loss and confirm tail latency is lower than the same test over the TLS variant, and confirm resumption completes without a full handshake.",
    dep: ["udp-transport","dns-over-tls","transport-discovery"]
  },
  "transport-discovery": {
    s: "How a client learns that a resolver supports encrypted transports and with which address, port and certificate name, instead of being configured by hand.",
    d: "A client can read the network's configuration, which names the resolver, then ask it for a service binding record that lists encrypted protocols, ports and addresses, or use designated names for a well-known upgrade. A discovered resolver is validated by matching the certificate to the address the client began with. It is hard because the first query is unprotected and a network can offer forged discovery data.",
    k: ["Discovery by service record vs manual configuration: discovery works automatically and trusts the first unprotected step; manual config is explicit and does not follow network changes.", "Automatic upgrade only when the address matches vs allowing redirection: matching prevents a hostile network from redirecting to another party; redirection allows flexible deployments and trusts the network."],
    p: ["Accepting discovery data from an untrusted local network points the client at a hostile resolver.", "Stale binding records keep clients using a port the server no longer listens on."],
    v: "Query the resolver for its service binding record, confirm it lists the encrypted protocols and ports, and confirm the client connects over the discovered transport and falls back when the endpoint is blocked.",
    dep: ["dns-over-tls","dns-over-https","record-types"]
  },
  "socket-layer": {
    s: "The operating-system interface the server uses to receive and send packets: sockets for datagrams and streams, with options for buffers, address reuse and receive-side steering.",
    d: "The server opens sockets for each listening address and transport, tunes buffer sizes, and reads and writes in batches to reduce system calls. Reply packets must leave from the address that received the query, which matters on multi-address hosts. Several sockets may share a port so the kernel spreads load across workers. It is hard because defaults are tuned for general use, and drops at the socket buffer happen silently when the server is momentarily slow.",
    k: ["Batch receive and send vs one packet per call: batching cuts system call overhead at high rates and adds a little latency; one at a time is simple and CPU-heavy.", "One socket per worker with shared port vs one shared socket: per-worker sockets avoid contention and need kernel support for balancing; a shared socket is simple and serializes."],
    p: ["Receive buffers too small drop packets silently during bursts, which looks like network loss.", "Replying from the wrong source address on multi-homed hosts makes clients discard the reply."],
    v: "Send a burst at twice the sustained rate and read the kernel's socket drop counters, confirming zero drops at the target rate and visible, explained drops above it.",
    dep: ["interface-binding"]
  },
  "kernel-bypass-io": {
    s: "Receiving and sending packets directly from the network card to user space, skipping most of the kernel's network stack, to reach many millions of queries per second.",
    d: "The server polls the network card's queues, parses the packets itself and writes replies directly, pinning workers to cores and giving each its own queue. This removes per-packet kernel overhead and copying. The server must provide its own handling for address resolution, fragments and stream transport, or hand those to the kernel. It is hard because it ties the server to specific drivers and hardware, complicates debugging and loses the ordinary operating-system tools.",
    k: ["Kernel bypass vs the normal stack: bypass can reach several times the throughput per core and needs custom code for features the kernel gives for free; the normal stack is portable and well tested.", "Polling constantly vs interrupt-driven: polling gives low latency and burns full cores; interrupts save power and add latency under load."],
    p: ["Packets that the user-space path does not handle, such as fragments or stream traffic, are dropped without being passed to the kernel.", "A bug in custom packet parsing runs without the kernel's protections."],
    v: "Run a load generator at a target rate on the bypass path and the standard path with the same replies, and confirm response contents are identical and the bypass path sustains the higher rate with latency percentiles reported.",
    dep: ["worker-threading","memory-management"]
  },
  "worker-threading": {
    s: "How query work is spread across processor cores: worker threads or processes, how they are assigned sockets, and what state they share.",
    d: "Typical designs run one worker per core, each with its own socket or receive queue, and share the zone data read-only. Resolvers add shared or per-worker caches. Slow work, like zone loading or signing, runs on separate threads so it does not delay queries. It is hard to scale: lock contention on the cache, memory bandwidth, and cross-core cache traffic limit throughput, and a crash in a shared process takes down all workers.",
    k: ["Threads in one process vs several processes: threads share caches and memory cheaply; processes isolate crashes and privileges and duplicate data.", "Pin workers to cores vs let the scheduler decide: pinning gives predictable performance and wastes idle cores; scheduler placement adapts to load at some jitter."],
    p: ["A lock around a shared cache serializes all workers and flattens scaling at a few cores.", "Heavy background work on query workers causes latency spikes during reloads."],
    v: "Measure throughput at 1, 2, 4 and 8 workers on a fixed workload and confirm scaling is near linear up to the core count, then run a reload and confirm query latency percentiles do not rise.",
    dep: ["socket-layer","memory-management"]
  },
  "memory-management": {
    s: "How the server allocates and frees memory for zones, caches and in-flight queries, so that allocation cost stays low, fragmentation stays bounded and usage never exceeds a set limit.",
    d: "Hot paths use pre-sized pools or arenas for per-query objects, and long-lived data such as zones lives in compact structures. Caches have an explicit memory budget and shed entries to stay under it. Some servers avoid general-purpose allocation on the query path altogether. It is hard because memory grows with zone count, cache size and connections, and exhaustion has to degrade the service in a controlled way rather than crash.",
    k: ["Per-query arenas vs general allocator: arenas free everything at once and prevent leaks per query; a general allocator is flexible and slower and fragments over time.", "Hard memory limit vs advisory limit: a hard limit prevents exhaustion and rejects work at the limit; an advisory limit is flexible and lets a flood push the host into swapping."],
    p: ["Fragmentation after many reloads makes resident memory grow while live data stays constant.", "No limit on in-flight queries lets a slow upstream exhaust memory."],
    v: "Run a soak test with repeated zone reloads and a mixed query load for 24 hours and confirm resident memory plateaus below the configured limit with no growth trend.",
    dep: []
  },
  "clock-sync": {
    s: "Keeping the server's clock accurate, because signature validity windows, authentication timestamps and expiry decisions all depend on the current time.",
    d: "Validators compare signature inception and expiry to local time, transaction-signing checks the message timestamp, and caches and secondaries compute expiry from elapsed time. A clock that drifts or jumps breaks validation or authentication. Servers use network time sync with several sources and monotonic clocks for intervals, so a step adjustment does not shorten or extend TTLs. It is hard because failure appears as sudden validation failures on one machine.",
    k: ["Monotonic clock for intervals vs wall clock: monotonic time keeps TTLs correct through adjustments; wall-clock time is required for signature windows and cannot be avoided.", "Several time sources vs one: several sources detect a faulty one and need more configuration; one source is simple and a single point of error."],
    p: ["A virtual machine resumed from a snapshot with an old clock rejects valid signatures.", "Stepping the clock backwards makes cache entries live longer than intended."],
    v: "Set the clock ahead of a signature's expiry on a test resolver and confirm validation fails with an expired-signature error, then correct the clock and confirm validation succeeds without a restart.",
    dep: []
  },
  "privilege-separation": {
    s: "Limiting what a compromised server process can do: binding privileged ports then dropping rights, running unprivileged, in a restricted filesystem view and with limited system calls.",
    d: "The server starts with enough rights to bind low ports and read keys, then drops to an unprivileged account, enters a restricted directory and applies a system call filter. Parsing untrusted packets is the risky part, so it may run in a separate process from key handling or file writing. It is hard because restrictions must still allow reloads, logging and key access, and each limit adds configuration that can break after updates.",
    k: ["Separate processes by role vs one process with sandboxing: separate processes contain a parser bug strongly and add communication complexity; one sandboxed process is simpler and gives weaker isolation.", "Tight system call filters vs default allow: tight filters stop many exploits and break on library updates; default allow is stable and exposes more."],
    p: ["A server running as the superuser turns a parsing bug into full control of the machine.", "Dropping privileges before opening files needed for reload makes later reloads fail."],
    v: "Inspect the running server and confirm it runs as an unprivileged account in a restricted directory, then attempt an operation outside its allowed set and confirm the system blocks and logs it.",
    dep: ["socket-layer"]
  },
  "interface-binding": {
    s: "Choosing which addresses and ports the server listens on, and making sure replies leave from the right address and the server does not accidentally answer where it should not.",
    d: "Servers bind to specific addresses, to every address, or to the anycast address on loopback or a virtual interface. Different roles, such as an internal resolver and a public authoritative service, bind to separate addresses. Hosts with several addresses need replies sourced from the address queried. It is hard because new interfaces appear at runtime, binding to all addresses can open a resolver publicly by accident, and listening on an anycast address requires the route to exist first.",
    k: ["Bind to explicit addresses vs all addresses: explicit binding avoids accidental exposure and needs updating when addresses change; all-address binding adapts and exposes everything.", "Dynamic interface detection vs static configuration: dynamic detection follows changes and can listen where it should not; static configuration is predictable and needs a restart."],
    p: ["Binding to all addresses on a multi-homed host sends replies from the wrong source address.", "Starting before the anycast address exists makes the server miss the interface until a restart."],
    v: "Start the server on a host with three addresses, probe each address and port from a test client, and confirm it answers only on the configured ones and replies with the same source address it received on.",
    dep: ["socket-layer"]
  },
  "anycast-announcement": {
    s: "Advertising the same service address from many sites through routing, so each client's traffic goes to the topologically nearest site and floods are spread across all of them.",
    d: "Each site's server answers on a shared address, and a routing daemon announces that address to neighbors. Routing then selects the closest announcement for each client. A site that fails withdraws its route and traffic shifts elsewhere. It works well for short UDP exchanges; long streams can break when routing changes mid-connection. It is hard because the nearest site by routing is not always nearest by latency, and each site adds operational surface.",
    k: ["Many small sites vs a few large ones: many sites lower latency and spread attacks and cost more to run and keep consistent; few large sites are simple and absorb less.", "Global announcement vs regional with scoped communities: global is simple and sends traffic to unexpected sites; scoped announcements control placement and need careful routing policy."],
    p: ["Stream connections break when a route flap sends later packets to a different site.", "A site announcing the address while its server is dead blackholes all nearby clients."],
    v: "Query a site-identity record from probes at many locations and confirm each reaches the expected nearest site, then withdraw one site's route and confirm its clients move to another within the convergence target.",
    dep: ["route-withdrawal","interface-binding","instance-load-balancing"]
  },
  "route-withdrawal": {
    s: "Removing a site's route announcement automatically when its server stops answering correctly, so clients are never routed to a site that cannot serve them.",
    d: "A local health check queries the server for known names and verifies the answers. If checks fail repeatedly, a controller withdraws the route announcement, and restores it after a sustained recovery. Withdrawal happens at the site, not in a central system, so it works even when the center is unreachable. It is hard because a flapping check causes route flapping, because withdrawing every site at once creates a total outage, and because the check must test real answering and not just the process.",
    k: ["Local autonomous withdrawal vs central control: local reacts in seconds and cannot see global state; central coordinates and can fail with the network it is meant to protect.", "Withdraw on any check failure vs require several: immediate withdrawal is fast and flaps on transient errors; requiring several failures reduces flapping and delays removal."],
    p: ["A health check that tests only that the process is running leaves a hung server attracting traffic.", "Every site failing the same check at once, such as on a shared bad zone, withdraws the whole service."],
    v: "Stop the server on one site and measure the time until its route disappears from neighboring routers and clients are answered elsewhere, then confirm the route returns only after a stable recovery period.",
    dep: ["anycast-announcement","synthetic-probes"]
  },
  "instance-load-balancing": {
    s: "Spreading queries across the several server instances inside one site, by hashing on packets in the network or by a load balancer, while keeping each instance's cache effective.",
    d: "Within a site, equal-cost routing or a packet-level balancer sends each query to one of many instances. For resolvers, consistent hashing on the query name sends the same name to the same instance and keeps caches hot. For authoritative servers any instance works. It is hard because stateful features, such as cookies, rate limits and stream connections, need either shared state or affinity, and the balancer is itself a point of failure.",
    k: ["Hashing by client address vs by query name: client hashing keeps connections and rate limits on one instance; name hashing improves cache hit rate and uneven load follows popular names.", "Balancing at the network layer vs in the application: network balancing is fast and transparent; application-aware balancing can steer by content and adds a processing hop."],
    p: ["Round-robin across instances with separate caches multiplies upstream queries by the instance count.", "Rate-limit state held per instance allows an attacker to receive the limit times the instance count."],
    v: "Send a replayed query log through the balancer and confirm load per instance stays within 20% of the mean, and that a name repeated 100 times causes one upstream fetch when name hashing is enabled.",
    dep: ["worker-threading","anycast-announcement"]
  },
  "nameserver-set-diversity": {
    s: "Choosing the set of name servers listed for a zone so that no single network, provider, software or location failure can make all of them unreachable.",
    d: "Operators list name servers on different networks and addresses in both IP families, in separate geographic regions, and sometimes under different providers and software implementations. The set must be small enough to fit in a referral and large enough to survive losses. Resolvers pick among them by speed, so slow servers still see traffic. It is hard because diversity is expensive, and correlated dependencies such as shared registrars, keys or upstream providers are easy to miss.",
    k: ["Several providers vs one provider with many sites: several providers survive a provider failure and need synchronization and consistent features; one provider is simpler and shares fate.", "Different software implementations vs one: diverse software avoids a shared bug taking all servers down and multiplies testing and tooling."],
    p: ["Name servers that all sit behind one upstream network fail together, even with many addresses.", "A mix of servers with different answers for the same name causes inconsistent behavior that is hard to reproduce."],
    v: "List each server's network, provider, address family and software identity and confirm no single failure covers all of them, then block each in turn and confirm the zone still resolves.",
    dep: ["multi-provider-sync","delegation-monitoring","availability-and-redundancy"]
  },
  "zone-distribution": {
    s: "Pushing zone data and configuration from the place where it is edited to every serving site, safely and in an order that keeps all sites consistent.",
    d: "Distribution uses standard transfers, file synchronization or a message bus. Changes are staged: first a canary site, then regions, with checks at each step, and a way to stop propagation. Signed zones add validity windows that must remain valid during distribution. It is hard because a bad zone distributed everywhere is the same as taking every server down, and because slow sites hold old versions while others move on.",
    k: ["Staged rollout vs immediate global push: staged rollout contains bad changes and takes longer for urgent fixes; immediate push is fast and spreads mistakes just as fast.", "Pull by each site vs push from the center: pull lets sites verify and retry independently; push is controlled and needs the center to track every site."],
    p: ["A syntax error accepted by distribution but rejected by a server's loader leaves some sites with old data.", "No way to pause an in-flight rollout turns a detected error into a global one."],
    v: "Publish a change with an intentional error to the canary site and confirm distribution halts there, other sites keep the previous version, and an alert names the failing site.",
    dep: ["zone-change-control","axfr","atomic-zone-swap"]
  },
  "capacity-headroom": {
    s: "Provisioning enough query, bandwidth and state capacity at each site to absorb floods and the loss of other sites, rather than sizing for average load.",
    d: "Planners estimate normal peak rates, the share each site takes when neighbors fail, and expected attack volume, then add margin for query types that cost more, such as signed answers, TCP and encrypted connections. Capacity of the network link, the server's packet rate and the upstream scrubbing arrangement each limit throughput. It is hard because attacks grow faster than hardware, and the cheapest defense is often more capacity than the attacker has.",
    k: ["Over-provisioning for peak attacks vs relying on upstream scrubbing: spare capacity is always ready and costs money idle; scrubbing services scale on demand and add dependency and delay.", "Sizing each site for its share vs for absorbing a failed neighbor: share sizing is cheaper; neighbor sizing survives a failure during an attack."],
    p: ["Capacity planned in queries per second ignores that signed or large responses use much more bandwidth.", "Redundant sites that were each sized at 60% load fail in sequence when one falls."],
    v: "Run a load test at the planned attack rate at one site with a neighbor withdrawn and confirm legitimate query success rate and latency stay within objectives, with link utilization below the limit.",
    dep: ["anycast-announcement","kernel-bypass-io","query-flood-filtering"]
  },
});
