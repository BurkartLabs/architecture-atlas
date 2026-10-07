// Details part 4: framing and multiplexing, transport, cross-cutting concerns.
ATLAS.details("rpc-framework", {
  "message-framing": {
    s: "The envelope around each message on a byte stream: a flag for compression and a length prefix, so receivers can find message boundaries in a continuous stream of data.",
    d: "Each message is prefixed with a small header giving its length and whether it is compressed, then the payload. The transport delivers an ordered byte stream, so framing is what turns bytes into discrete messages. A message can span several transport frames and a frame can hold parts of more than one message. Hard because boundaries and transport frames are unrelated, so a receiver must reassemble across frames, enforce size limits before buffering everything, and cope with truncated streams.",
    k: ["Length-prefixed messages vs delimiter-based: length prefixes allow binary data and quick skipping; delimiters are simple to read by eye and need escaping.", "Per-message compression flag vs whole-stream compression: per-message lets each message choose and be independently decoded; whole-stream compresses better and ties all messages together."],
    p: ["A receiver that waits for a whole large message before delivering it holds memory and latency proportional to message size.", "Stream ends in the middle of a message, and a naive reader reports success with truncated data."],
    v: "Send messages of 0 bytes, 1 byte and 10 MB, and a stream truncated mid-message; confirm the receiver delivers the first three intact and reports the truncated one as an error.",
    dep: ["stream-multiplexing", "compression-negotiation"]
  },
  "compression-negotiation": {
    s: "How the two sides agree on a compression algorithm: each advertises the ones it accepts, and the sender picks one it knows the other supports.",
    d: "The client lists accepted encodings in a header and the encoding of its request; the server replies likewise. A sender must not use an encoding the peer did not advertise, and falls back to uncompressed. Per-call and per-message overrides allow skipping compression for small or already compressed payloads. Hard issues are misconfiguration: one side enabling an algorithm the other lacks yields failed calls with unimplemented-style errors, and proxies that decompress or recompress alter sizes.",
    k: ["Compress by default vs opt-in per call: default saves bandwidth everywhere and burns CPU on small messages; opt-in targets large messages and needs people to choose.", "Server-chosen response encoding vs client-requested: client-requested follows the client's CPU and bandwidth; server choice is simple and may not suit the client."],
    p: ["Compressing small messages costs more CPU than the bytes it saves and adds latency.", "A client sends compressed data to a server that never advertised support, and every call fails."],
    v: "Call with each combination of client and server supported encodings; confirm negotiated results match the intersection, unsupported requests fail with a clear status, and uncompressed fallback works.",
    dep: ["compression-codecs", "request-metadata"]
  },
  "compression-codecs": {
    s: "The algorithms available for message compression, from fast low-ratio to slow high-ratio, plugged into the framework so each channel or call can choose one.",
    d: "Codecs implement compress and decompress over buffers or streams. Fast general-purpose ones add little latency and save 2-4x on text-like data; slower ones achieve more at greater CPU. Binary encoded messages with small integers compress modestly; large strings and repeated structures compress well. Hard parts: decompression can expand data enormously (a decompression bomb), so output size must be bounded, and sensitive data compressed together with attacker-controlled data can leak through size changes.",
    k: ["Fast low-ratio codec vs high-ratio codec: fast is nearly free and saves less; high-ratio saves bandwidth for cross-region links and costs CPU on every call.", "Dictionary-trained compression vs plain: trained dictionaries greatly help small similar messages and need distribution and versioning; plain needs no setup."],
    p: ["A tiny compressed message expands to gigabytes on decompression and exhausts memory.", "Compressing secrets alongside attacker-chosen input reveals the secret through length differences."],
    v: "Compress representative payloads with each codec and record ratio, CPU time and added latency; also feed a crafted high-ratio input and confirm decompression stops at the configured output limit.",
    dep: ["message-framing", "message-size-limits"]
  },
  "stream-multiplexing": {
    s: "Many independent calls interleaved over one connection, each as its own numbered stream, so one connection serves thousands of concurrent calls without head-of-line blocking at the call level.",
    d: "Each call opens a stream with a unique identifier; frames from different streams are interleaved on the connection and reassembled by identifier. Streams have independent state and flow control and can be reset without closing the connection. This amortizes handshake cost and keeps connection counts low. Hard because the transport underneath is still one ordered byte stream: a lost packet delays every stream until retransmission (head-of-line blocking at the transport level), and one stalled stream can monopolize a shared window.",
    k: ["Multiplexed streams vs one connection per call: multiplexing is cheap and shares fate; separate connections isolate calls and cost handshakes and sockets.", "Ordered reliable transport vs independent-stream transport: ordered reliable is ubiquitous and has transport-level blocking; independent streams avoid it and have less mature middlebox support."],
    p: ["One connection saturating its congestion window slows every call at once, which looks like a server problem.", "A single hot stream consuming the shared window starves others."],
    v: "Run a large transfer and 100 small calls on one connection; confirm small-call latency stays within a small multiple of idle latency, and that resetting one stream leaves the others untouched.",
    dep: ["message-framing", "stream-flow-control", "stream-limits"]
  },
  "header-compression": {
    s: "Compressing headers across calls on a connection by indexing repeated names and values in a shared table, so metadata that repeats on every call costs a few bytes.",
    d: "Both ends keep a dynamic table of recently sent header fields. A repeated header is replaced by a small index; new ones are added to the table, subject to a size limit. This makes per-call metadata such as paths, content types and tokens almost free after the first call. It is hard because the tables are connection state shared by all streams: header blocks must be decoded in order, tables consume memory per connection, and high-entropy values such as unique tokens defeat the gains.",
    k: ["Indexing sensitive headers vs marking them never-indexed: indexing compresses well and can enable guessing attacks; never-indexed costs bytes and avoids the exposure.", "Large dynamic table vs small: large saves bytes and costs per-connection memory; small is cheap and compresses less."],
    p: ["Unique per-call IDs in headers add to the table and evict useful entries.", "A header block that is lost or decoded out of order corrupts the table and kills the whole connection."],
    v: "Make 1,000 calls with identical headers and measure bytes on the wire for header frames; confirm after the first few they shrink to a few bytes, and that a never-indexed credential does not appear in the table.",
    dep: ["stream-multiplexing", "request-metadata"]
  },
  "stream-flow-control": {
    s: "Window-based backpressure per stream and per connection: a sender may transmit only as many bytes as the receiver has granted, so a slow reader cannot be overrun.",
    d: "Each stream and the connection have a window of bytes the receiver is ready to accept. Sending consumes it; the receiver grants more as the application reads. A writer blocked on window shows up as a not-ready signal to application code. Window sizes bound memory per stream and throughput: throughput is limited by window divided by round-trip time. Hard because defaults are small for fast long-distance links, large windows cost memory times streams, and application code that ignores readiness buffers without limit.",
    k: ["Large windows vs small: large windows give high throughput over long links and use more memory per stream; small windows bound memory and limit throughput.", "Automatic window sizing vs fixed: automatic tuning adapts to bandwidth-delay product and can use a lot of memory; fixed values are predictable and poorly suited to varied links."],
    p: ["Writing into a stream without checking readiness buffers unbounded data in memory when the peer is slow.", "A small window on a high-latency link caps throughput far below the bandwidth available."],
    v: "Transfer a large stream to a deliberately slow reader and confirm the sender's memory stays bounded and writes block; then run across a high-latency link and confirm throughput matches the window over round-trip time.",
    dep: ["stream-multiplexing", "message-framing"]
  },
  "stream-limits": {
    s: "A cap on the number of simultaneously open streams per connection, advertised by each side, to bound server state and make clients open more connections when saturated.",
    d: "Each peer announces the maximum concurrent streams it will accept (commonly 100 or more). A client that reaches the limit queues new calls until streams close or opens another connection if the implementation allows it. Servers use the limit to bound memory and defend against abuse such as rapid stream opening and resetting. Hard because it silently becomes a throughput limit: with long-lived streams, a few hundred of them can consume the entire allowance and leave short calls waiting.",
    k: ["Low per-connection limit with more connections vs high limit with fewer: low limits bound work per connection and spread across connections; high limits cut connection overhead and concentrate risk.", "Queue excess calls vs fail them: queueing smooths bursts and hides saturation; failing fast surfaces it."],
    p: ["Long-lived streams fill every slot, and unary calls queue behind them though the server is idle.", "Rapid open-and-reset patterns consume server CPU while never exceeding the stream limit."],
    v: "Open streams up to the advertised limit, then issue one more call; confirm it queues or opens a second connection as configured, and that the queue-wait time appears in client metrics.",
    dep: ["stream-multiplexing", "resource-limits"]
  },
  "transport-abstraction": {
    s: "The internal interface that separates call logic from the byte-moving layer, so the same stubs run over network connections, local sockets or in-process channels.",
    d: "The core talks to a transport through a small interface: create stream, send headers and messages, receive events, reset, close and report state. Concrete transports implement it for multiplexed network connections, local sockets and in-memory pipes. This lets features such as interceptors, deadlines and retries live once above it. The difficulty is keeping the interface honest: transports differ in framing, flow control and error semantics, and leaks (such as a transport-specific error) force callers to special-case.",
    k: ["A thin common interface vs transport-specific features exposed: thin keeps swapping easy and hides capabilities; exposing features helps performance and splits code paths.", "Event-driven transport interface vs blocking calls: events scale to many connections; blocking is simpler and uses a thread per stream."],
    p: ["A transport-specific error code leaks to callers and gets handled in one place only, so another transport behaves differently.", "A new transport that does not implement flow control correctly works in tests and fails under load."],
    v: "Run the same conformance suite (all four call shapes, deadlines, cancellation, large messages) against every transport implementation and confirm identical results.",
    dep: ["connection-establishment", "stream-multiplexing", "local-transports"]
  },
  "connection-establishment": {
    s: "Opening a connection: resolving the address, completing the transport handshake, securing it, negotiating protocol parameters and reporting the result to the subchannel.",
    d: "The sequence is TCP connect, TLS handshake (with protocol negotiation inside it), then exchange of settings frames. Each step has a timeout and can fail differently. Connection establishment costs several round trips, so the framework reuses connections and may attempt addresses in parallel to hide a slow one. It is hard because failure modes are numerous (refused, reset, timeout, certificate error, protocol mismatch) and their handling decides whether a client recovers quickly or hammers a failing server.",
    k: ["Parallel connection attempts to several addresses vs sequential: parallel hides slow or dead addresses and doubles attempts; sequential is polite and slow when the first is down.", "Connect eagerly at startup vs lazily on first call: eager removes first-call latency and surprises servers with a connection burst; lazy spreads the load and delays the first call."],
    p: ["Connect timeout longer than the call deadline means the call fails with deadline-exceeded and never reveals the underlying refusal.", "Thousands of clients restarting together send a handshake burst that overloads the server's CPU."],
    v: "Time each stage of connection setup against a remote server, then block the port, reset mid-handshake and present a bad certificate, and confirm each produces a distinct logged reason and does not exceed the connect timeout.",
    dep: ["tls-mtls", "protocol-negotiation", "transport-abstraction"]
  },
  "tls-mtls": {
    s: "Encrypting and authenticating connections with TLS, and with mutual TLS also verifying the client's certificate, so peers know who they are talking to.",
    d: "The server presents a certificate that the client validates against trusted roots and the expected name; in mutual TLS the client presents one too. The handshake yields keys for encrypting the connection, and the verified identity becomes the peer identity for authorization. Certificates are short-lived and rotated automatically. It is hard operationally: expiry causes outages, rotation must reload without dropping connections, trust stores differ between services, and name verification against addresses behind balancers is easy to misconfigure.",
    k: ["Mutual TLS everywhere vs TLS plus token authentication: mutual TLS gives strong machine identity with automatic transport trust; tokens give user-level identity and need handling at every hop.", "Short-lived certificates with automated rotation vs long-lived: short-lived limits damage from theft and requires reliable automation; long-lived is simple until one expires unnoticed."],
    p: ["A certificate expires on a weekend because renewal was manual, and every call between services fails.", "Disabling certificate verification 'temporarily' for testing ships to production."],
    v: "Connect with a valid certificate, an expired one, a wrong name and no client certificate; confirm only the first succeeds, the others fail with distinct errors, and the server reports the verified peer identity.",
    dep: ["connection-establishment", "protocol-negotiation"]
  },
  "protocol-negotiation": {
    s: "Agreeing on the application protocol during the secure handshake, so both ends know the connection speaks the RPC framing and not something else.",
    d: "During TLS setup the client lists the protocols it speaks and the server picks one, in a standard extension for this purpose. This prevents sending RPC frames to a port expecting something else and allows several protocols on one port. Without TLS, clients use prior knowledge or an upgrade request. Hard where intermediaries are involved: a proxy terminating TLS may negotiate a different protocol than the origin, and a mismatch shows up as confusing errors rather than a clean refusal.",
    k: ["Negotiate within the handshake vs prior knowledge: negotiation costs no extra round trip and supports several protocols per port; prior knowledge is simple and brittle.", "Fail hard on negotiation failure vs fall back to another protocol: failing is clear and strict; fallback keeps older peers working and hides misconfiguration."],
    p: ["A proxy that does not support the extension silently downgrades to a protocol that cannot carry trailers or streams.", "Cleartext connections on an internal port are assumed secure and carry credentials."],
    v: "Connect to a server that supports the RPC protocol and one that only supports another; confirm the first negotiates it and the second causes an immediate clear error naming the mismatch.",
    dep: ["tls-mtls"]
  },
  "keepalive": {
    s: "Periodic small pings on idle connections to detect dead peers and to stop middleboxes from silently dropping idle connections.",
    d: "If no data arrives for an interval, one side sends a ping and expects an acknowledgment within a timeout; if none arrives, the connection is declared dead and its calls fail so retry or failover can start. Servers limit how often clients may ping and may close abusive ones. Hard because settings must be coordinated: a client that pings more often than the server permits is disconnected, and intermediaries have their own idle timers that must be shorter than the ping interval.",
    k: ["Frequent pings vs infrequent: frequent pings find dead peers fast and cost battery, bandwidth and server load; infrequent ones are cheap and leave dead connections in use longer.", "Ping only while calls are active vs always: only-active saves resources on idle connections; always keeps connections alive through middleboxes and costs fleet-wide traffic."],
    p: ["Client ping interval below the server's minimum triggers a too-many-pings close, which looks like random disconnects.", "No keepalive behind a stateful middlebox: the connection is dropped silently and the next call waits for a timeout."],
    v: "Block packets between client and server without closing the socket and confirm the client declares the connection dead within interval plus timeout, fails in-flight calls and reconnects.",
    dep: ["connection-establishment", "abort-detection"]
  },
  "reconnect-backoff": {
    s: "The delay policy between connection attempts after failure: exponential with jitter and a cap, so clients return gradually to a recovering server.",
    d: "After a failed attempt, the subchannel waits a randomized, growing interval before trying again, up to a maximum; a successful connection resets it. Calls waiting for a connection fail fast or wait depending on the call's settings. It reduces thundering herds on recovery. Hard because the maximum delay sets recovery speed: a high cap leaves clients disconnected long after the server is back, and a low one repeats the storm a restarting server cannot handle.",
    k: ["Wait-for-ready calls vs fail-fast calls: wait-for-ready hides short outages and holds callers; fail-fast reports errors immediately and lets callers decide.", "Reset backoff on connect vs on first successful call: resetting on connect is simple and can flap if the server accepts and then drops; resetting on success is conservative."],
    p: ["A cap of minutes means clients stay disconnected well after the server returns.", "Backoff resets on every successful TCP connect, and a server that accepts and immediately closes is hammered continuously."],
    v: "Stop a server for one minute with 200 clients; record connect attempt times and confirm they spread and grow with a cap, and that all clients are connected within the cap after restart.",
    dep: ["connection-establishment", "subchannel-pool"]
  },
  "goaway-drain": {
    s: "A notice from a server that a connection will close soon, listing the last stream it will process, so clients stop sending new calls on it and move elsewhere.",
    d: "The server sends a go-away signal with the highest accepted stream identifier. Streams up to that point continue; later ones are refused, and clients retry them on another connection without counting a failure. Servers also use it to rotate old connections periodically, so clients rebalance after scaling. Hard parts are races: calls in flight when the notice is sent may be rejected, so refused-before-processing must be distinguishable and safely retryable, and rotation of long streams needs application cooperation.",
    k: ["Two-phase drain (warn, then stop) vs immediate close: two-phase gives clients time to move and avoids failed calls; immediate close is simple and fails calls in flight.", "Periodic connection max-age rotation vs connections live forever: rotation rebalances load and picks up new instances; permanent connections avoid churn and never rebalance."],
    p: ["A client treats a refused stream after the go-away as a failure rather than a transparent retry, and returns errors during every deploy.", "No maximum connection age: after scale-up, new instances sit idle while old ones carry all traffic."],
    v: "During a rolling deploy under load, confirm zero failed calls caused by the restarts, every refused-before-processing stream retried transparently, and old connections replaced within the max age.",
    dep: ["connection-establishment", "stream-multiplexing"]
  },
  "proxy-traversal": {
    s: "Operating through intermediaries (forward proxies, reverse proxies, mesh sidecars, gateways) that terminate, inspect or rebalance connections, and which may not fully support the protocol.",
    d: "A proxy may terminate TLS, forward whole streams, buffer messages, apply its own timeouts and limits, or balance per connection rather than per call. Every one of these changes behavior: per-connection balancing sends all of a client's multiplexed calls to one backend, idle timeouts drop long streams, and buffering breaks streaming. The framework must therefore work with deadlines, trailers and keepalives in the presence of devices that interpret them differently, and operators need a clear map of what each hop does.",
    k: ["Balance per call at a proxy vs per connection: per call spreads load evenly and requires the proxy to understand the protocol; per connection is generic and leaves skew.", "Mesh sidecar proxies vs library-only client logic: sidecars give uniform policy across languages and add hops and resources; libraries are lean and must be reimplemented per language."],
    p: ["A layer 4 balancer pins a client's connection to one backend, so one instance receives all of that client's calls.", "A proxy's idle timeout is shorter than the keepalive interval and kills quiet streams."],
    v: "Send calls of each shape through the production path and directly to a backend; confirm identical results, that trailers and deadlines survive, and that load across backends is even by call count, not by connection count.",
    dep: ["protocol-negotiation", "keepalive", "trailers"]
  },
  "local-transports": {
    s: "Transports for caller and callee on the same machine or process: in-process channels and Unix domain sockets, which skip the network stack but keep the call semantics.",
    d: "An in-process transport passes messages between channel and server in memory, optionally still serializing so tests and production behave alike. Unix sockets use the same framing over the operating system's local socket with file-permission-based access control. Sidecars and local agents use them. Hard parts are fidelity and security: skipping serialization hides bugs and changes mutability rules, and a socket path with loose permissions lets any local process call the service.",
    k: ["Serialize in the in-process transport vs pass objects directly: serializing keeps behavior identical to the network and costs CPU; passing objects is fast and exposes shared mutable state.", "Unix socket with filesystem permissions vs loopback TCP with TLS: sockets are fast and easily access-controlled; loopback TCP works across containers and needs credentials."],
    p: ["A handler mutates a request object that the caller still holds, a bug the network version never had.", "A socket file created world-writable lets any local user call an administrative service."],
    v: "Run the transport conformance suite over the in-process and Unix socket transports and confirm identical results to the network; check the socket path's permissions allow only the intended user.",
    dep: ["transport-abstraction"]
  },
  "failure-semantics": {
    s: "What a caller can conclude from a failed call: never ran, may have run, or ran partially, and the delivery guarantee (at most once, at least once) each layer provides.",
    d: "A call that returns an error after the request was sent leaves the outcome unknown: the server may have executed it. At-most-once means never retry; at-least-once means retry and tolerate duplicates; exactly-once effects need idempotency keys and durable dedup state. The decision shapes retry policy, status code use, API design and storage. It is cross-cutting because every layer, including interceptors and proxies, may resend or drop, and any one of them can change the effective guarantee.",
    k: ["At-most-once vs at-least-once delivery: at-most-once never duplicates and loses work on failure; at-least-once never loses work and requires idempotent handlers.", "Report unknown outcomes explicitly vs map them to plain failure: explicit unknown lets callers reconcile; mapping hides the uncertainty and invites repeated side effects."],
    p: ["Retries added in three layers give an effective guarantee nobody chose and duplicate effects appear under load.", "A timeout is treated as 'did not happen' and a payment is submitted again."],
    v: "Kill a server after it commits but before it replies; confirm the client reports an unknown outcome and that, following the policy for that method, the final state shows exactly one effect.",
    dep: ["idempotency", "retry-policy", "status-codes"]
  },
  "compatibility-policy": {
    s: "The rules, tools and ownership that keep schemas, generated code, libraries and deployed services interoperable across versions during rolling deployment.",
    d: "It defines which changes are allowed, how breaks are detected before merge, how long old versions are supported, which library versions may mix and who approves exceptions. It covers wire compatibility, source compatibility of generated code and behavioral compatibility of defaults. It is cross-cutting because every layer has a version: schema, compiler, plugin, runtime library, service config and wire protocol. The hard part is that safe changes are semantic, which tools check only partly.",
    k: ["Strict automated gate vs review by owners: automation is consistent and misses semantic breaks; reviewers catch meaning and vary and get tired.", "Support N versions of libraries vs force latest: supporting several lets teams upgrade independently and multiplies test matrix; forcing latest is cheap to maintain and coordinates upgrades."],
    p: ["A compatible-looking change in default behavior breaks old callers while all tools pass.", "Library upgrades are compatible with the wire and break source compatibility of generated code across many repositories at once."],
    v: "Run the previous and current release of client and server in all four pairings in a staging environment, with the full method suite, and confirm no failures; also confirm the breaking-change gate fails a seeded break.",
    dep: ["breaking-change-detection", "additive-evolution", "field-numbering"]
  },
  "security-model": {
    s: "Who may call what, and how that is established and enforced at every layer: transport identity, call credentials, authorization policy, input validation and exposure of tooling.",
    d: "It combines mutual TLS for machine identity, tokens for user identity, per-method authorization, validation of untrusted input, limits on size and rate, and restricted reflection and admin services. Identity must propagate along call chains without letting a service act with more authority than the original request carried. It is cross-cutting because each interceptor and tool is an attack surface and any gap is exploitable. The hard part is the confused deputy: a service with broad power called on behalf of a weak caller.",
    k: ["Network location as trust vs per-call identity: location is easy and fails when anything inside is compromised; per-call identity is stronger and costs work at each hop.", "Central policy service vs policy in each service: central is consistent and a dependency; local is fast and drifts."],
    p: ["Internal services trust any caller on the internal network, and one compromised host reaches everything.", "Debug and reflection endpoints enabled in production on the same listener as public methods."],
    v: "From a low-privilege identity, attempt every method including admin and reflection endpoints; confirm each is denied with the expected status, and audit logs show caller identity and decision for each attempt.",
    dep: ["tls-mtls", "auth-interceptor", "call-credentials", "server-reflection"]
  },
  "observability-model": {
    s: "How a call is seen from outside: consistent metrics, traces and logs per method, with identifiers that tie client and server views and every hop of a chain together.",
    d: "Standard signals include per-method rate, errors by status code and latency histograms on both client and server, spans linked by propagated trace context, and structured logs with call identifiers. Client and server views differ and the difference localizes faults to the network, queueing or the handler. It is cross-cutting because each layer can add or hide latency and a missing hop breaks a trace. Hard to do within cost limits: cardinality, sampling and log volume.",
    k: ["Instrument in the framework vs in each service: framework instrumentation is uniform and lacks business context; service instrumentation is rich and inconsistent.", "Full detail on sampled calls vs summary on all: sampling keeps detail affordable and misses rare events; summaries cover everything and cannot explain individual calls."],
    p: ["Only server-side metrics exist, so queueing, connection and retry delay on the client side are invisible.", "A hop that does not forward trace context splits every trace in two."],
    v: "Pick a slow request and, from the trace alone, attribute its latency to client queueing, network, server queueing and handler time, and confirm the numbers add up to the end-to-end latency within a small error.",
    dep: ["telemetry-interceptor", "context-baggage", "status-codes"]
  },
  "resource-limits": {
    s: "The bounds applied at every layer (message size, concurrent calls and streams, connections, metadata, queue depth, per-tenant rates) that keep one caller from exhausting a shared service.",
    d: "Each layer enforces its own caps and an overload shows up as the lowest one that is hit. Good configuration chooses limits so that the cheapest layer rejects first, with clear statuses, and so that load is shed before memory or threads run out. Fairness means one tenant's limit hits that tenant, not everyone. It is cross-cutting because limits compose: concurrency times message size gives memory, and retries multiply requests. The hard part is knowing real capacity and keeping limits in step with growth.",
    k: ["Shed load early with rejections vs absorb with queues: shedding keeps latency bounded and rejects some work; queues smooth bursts and make latency and memory unbounded under sustained overload.", "Per-tenant quotas vs global limits: per-tenant isolates noisy neighbors and needs identification and bookkeeping; global limits are simple and let one caller starve the rest."],
    p: ["Limits are set at one layer only, and the first overload exhausts another layer's memory.", "A noisy tenant triggers a global limit and every tenant sees errors."],
    v: "Overload the service with one tenant at 10 times its quota; confirm that tenant sees resource-exhausted, other tenants' latency and success rate stay within target, and server memory and thread counts stay bounded.",
    dep: ["rate-limiting", "message-size-limits", "stream-limits", "metadata-limits"]
  },
  "multi-language-parity": {
    s: "Keeping client and server libraries in many implementation languages behaving identically on edge cases, features and defaults, so a service works the same whoever calls it.",
    d: "Each language has its own runtime library and generator, and differences show in details: default values, 64-bit integers, unknown fields, deadline handling, retry defaults, error mapping, metadata casing and threading. Parity needs a shared conformance suite, interoperability tests across every language pair, and a feature matrix. It is cross-cutting because any layer can differ. The hard part is cost: each feature lands in every library on a different schedule, so the lowest common feature set often ends up defining what services can rely on.",
    k: ["Common conformance suite vs per-language tests: a shared suite catches differences between languages; per-language tests are idiomatic and miss disagreement.", "Same feature set in every language vs best-effort per language: same set lets services depend on it and slows features to the slowest port; best-effort ships fast and creates silent gaps."],
    p: ["A retry feature configured in service config is honored by two libraries and ignored by a third, and failure handling differs by caller language.", "Integer handling differs and a large identifier is truncated in only one language."],
    v: "Run the interoperability suite across every client and server language pair, covering all call shapes, deadlines, cancellation, metadata, compression and error details, and confirm each pair passes with identical observed statuses.",
    dep: ["codegen-plugins", "wire-encoding", "status-codes"]
  },
});
