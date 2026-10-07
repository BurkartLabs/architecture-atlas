// Details part 2: call surface, interceptors, deadlines and cancellation, errors and retries.
ATLAS.details("rpc-framework", {
  "client-stub-api": {
    s: "The typed object application code calls to invoke remote methods, which hides serialization and transport but still exposes deadlines, metadata, cancellation and status.",
    d: "A stub is created from a channel (the logical connection to a service) and offers one method per RPC. Each call takes a request, optional per-call options such as deadline, credentials and metadata, and returns a response or a stream. Internally it picks serializers, starts a call on the channel and waits. The hard part is honesty: making a call look like a local function hides latency and failure, so a good API makes the deadline impossible to forget and failures impossible to ignore.",
    k: ["Required deadline on every call vs optional with a default: required prevents unbounded waits but adds friction; defaults are convenient but hide a hang waiting to happen.", "One shared channel with many stubs vs a channel per stub: sharing multiplexes over few connections; per-stub channels isolate failures but multiply connections and resolver load."],
    p: ["Creating a new channel for every request pays the full connection and TLS cost each time and exhausts file descriptors.", "Stubs with no default deadline let one stalled dependency pin every calling thread."],
    v: "Make 1,000 sequential calls on one stub and confirm via connection metrics a single connection was used; then call a handler that sleeps past the deadline and confirm a deadline-exceeded status returns on time.",
    dep: ["call-context", "unary-calls", "subchannel-pool", "deadlines"]
  },
  "server-handler-registry": {
    s: "The table mapping fully qualified method names to handler functions, populated at startup by registering service implementations.",
    d: "When a service implementation is registered, the generated registration code adds one entry per method, each describing the path, the request and response decoders and the streaming shape. At request time the dispatcher looks up the path in this table. Registration is also where interceptors and per-method options attach. It is hard because the table is the server's whole attack surface and routing identity: the registry must reject duplicates, expose unregistered methods as unimplemented without side effects, and be immutable once serving starts.",
    k: ["Static registration at startup vs dynamic add and remove at runtime: static is simple and race-free; dynamic supports plugin systems but requires locking and careful drain of in-flight calls.", "One registry per server vs per listener: one is simple; per listener allows different services on public and internal ports and prevents accidental exposure."],
    p: ["Registering an internal admin service on the same listener as a public one exposes it to the internet.", "Two implementations registered for the same service silently replace each other depending on initialization order."],
    v: "List the registered method paths from a running server, compare them with the deployed schema, and confirm that calling an unregistered path returns unimplemented with no handler code executed.",
    dep: ["service-definitions", "stub-generation"]
  },
  "method-dispatch": {
    s: "The server step that reads the request path, finds the handler, decodes the message, runs interceptors and the handler, and writes the response and status.",
    d: "Dispatch begins when headers arrive: it parses the path, looks up the handler, builds a call context with deadline and metadata, and starts the interceptor chain. For unary methods it waits for the full message; for streaming it hands the handler a reader and writer. After the handler returns, it sends trailing status. The hard parts are concurrency and resource control: which thread or task runs the handler, how many calls may run at once, and what happens to a handler that never returns.",
    k: ["Handlers on a dedicated worker pool vs on the network event loop: a pool isolates slow handlers from I/O; running inline avoids context switches but a blocking handler stalls every connection.", "Unbounded concurrency vs a limit with rejection: unbounded is simple until memory runs out; a limit sheds load with a clear resource-exhausted status."],
    p: ["A blocking call inside a handler running on the event loop freezes every call on that thread.", "An exception thrown in a handler that is not converted to a status leaves the call open until the client times out."],
    v: "Drive the server beyond its configured concurrency limit and confirm the excess calls fail fast with resource-exhausted, while in-flight calls complete and the server's memory stays flat.",
    dep: ["server-handler-registry", "server-interceptors", "call-context"]
  },
  "call-context": {
    s: "The per-call object carrying deadline, cancellation signal, peer identity, incoming metadata and trace state, passed to handlers and propagated to outgoing calls.",
    d: "A context is created on the server when a call arrives and on the client when it begins. It holds the absolute deadline, a cancelled flag with callbacks, request and response metadata, authenticated peer information and tracing identifiers. Handlers pass it to outgoing calls so deadline and trace flow downstream. The hard part is discipline: if any layer fails to forward the context, deadline, cancellation and trace are all silently lost together.",
    k: ["Explicit context argument vs implicit thread-local context: explicit is visible and works across async boundaries; implicit is less boilerplate but is lost when work moves to another thread.", "Immutable derived contexts vs mutable shared ones: immutable derivation makes timeouts and values safe to scope; mutation is cheaper but causes cross-call interference."],
    p: ["Work moved to a background task with a fresh empty context outlives its call and ignores cancellation.", "Putting large objects in the context makes every derived copy expensive and leaks them past the call."],
    v: "Call service A with a 2-second deadline that calls B and C; inspect B and C logs and confirm both received the remaining deadline, the same trace identifier and the caller identity.",
    dep: ["deadlines", "cancellation", "request-metadata"]
  },
  "async-bindings": {
    s: "The client and server programming models offered for the same method: blocking, callback, future and stream-based forms, each with different threading and backpressure rules.",
    d: "Blocking calls are simplest and consume a thread per call in flight. Callback and future styles let a few threads drive many calls; streaming styles expose messages as sequences with explicit demand signals. The runtime maps all of them onto the same event-driven core. Difficulty comes from mixing them: calling a blocking stub from an event thread deadlocks, a callback that blocks stalls the transport, and each style reports errors and cancellation differently.",
    k: ["Thread-per-call blocking vs non-blocking callbacks: blocking code is easy to write and debug but limits concurrency to thread count; callbacks scale but are harder to read and to trace.", "Push-style stream delivery vs pull-based demand: push is simple but can overrun slow consumers; pull with explicit demand gives backpressure at more code."],
    p: ["A blocking call made from the transport's callback thread deadlocks when the response is delivered on that same thread.", "Unbounded queues between an async producer and a slow consumer grow until the process runs out of memory."],
    v: "Issue several thousand concurrent calls in each style against a slow handler and compare thread counts and peak memory; confirm the async style stays near its configured thread pool size.",
    dep: ["client-stub-api", "stream-flow-control"]
  },
  "unary-calls": {
    s: "The simplest shape: one request message in, one response message out. It maps to a function call and accounts for most traffic in practice.",
    d: "The client serializes one message, sends headers and the message, half-closes, and waits for headers, a message and trailing status. The server decodes the request, runs the handler and replies once. Because the whole exchange is bounded, retries, caching and load balancing are straightforward. Its limit is size and latency: large payloads must be sent whole, and the entire response must be ready before anything arrives, which is why large or long-lived results use streaming.",
    k: ["Large unary payload vs chunked streaming: unary is simple and retryable as a whole; streaming bounds memory and shows progress but is harder to retry and test.", "Paginating through repeated unary calls vs one server stream: pagination is stateless and cacheable; a stream is lower overhead but ties up a connection and server state."],
    p: ["A unary response that grows over time quietly exceeds the message size limit and starts failing for the largest customers first.", "Request messages that embed unbounded lists make memory per call unpredictable."],
    v: "Call a unary method 10,000 times, record the latency histogram and the status distribution, and confirm all calls ended with one status and none left half-open in the server's active-call count.",
    dep: ["message-framing", "method-dispatch"]
  },
  "server-streaming": {
    s: "One request, then a sequence of responses over time: results delivered as available, progress updates, change feeds and large result sets.",
    d: "The client sends a single request and then reads messages until the server ends the stream with a status. The server writes as results are produced, subject to flow control: a slow client pauses the writer. The stream can last seconds or days. Hard issues are lifecycle: detecting a vanished client, resuming after interruption without duplicates or gaps, and ensuring long streams re-resolve to healthy servers rather than pinning a dying instance forever.",
    k: ["Resumable stream with a cursor vs restart from the beginning: cursors tolerate interruption cheaply but need server-side position tracking; restarts are simple but repeat work.", "One long-lived stream vs periodic short calls: long streams give low latency and push semantics; polling is stateless and balances load better."],
    p: ["The server keeps producing for a client that disconnected because it never checks cancellation.", "A stream pinned to one instance prevents rolling restarts from completing, since the instance never drains."],
    v: "Open a server stream, kill the client mid-way and confirm the server detects cancellation and releases resources within seconds; restart the stream with the last cursor and confirm no gaps or duplicates.",
    dep: ["stream-flow-control", "cancellation", "abort-detection"]
  },
  "client-streaming": {
    s: "A sequence of request messages followed by one response: uploads, batch ingestion and aggregation where the answer depends on all the input.",
    d: "The client opens the call and writes messages, subject to flow control, then half-closes to say it is done. The server reads messages, usually accumulating state, and replies once. The server may also answer early, for example on error or quota, ending the call before the client finishes. The difficulty is partial work: if the stream breaks midway, the server holds a partial result and the client does not know how much was accepted, so applications need acknowledgments or idempotent chunk identifiers.",
    k: ["Streaming upload vs sending chunks as separate unary calls: streaming avoids per-call overhead and keeps ordering; separate calls are individually retryable and easier to balance.", "Server commits incrementally vs only at half-close: incremental commit bounds memory and loss; commit-at-end gives atomicity but requires holding everything."],
    p: ["The client retries a failed stream from scratch and the server applies the first part twice.", "The server replies early with an error but the client keeps writing, wasting bandwidth until it checks status."],
    v: "Upload 10,000 messages, break the connection after 4,000, and confirm the server reports exactly how many were committed and that resuming from that count yields a total of 10,000 with no duplicates.",
    dep: ["stream-flow-control", "idempotency"]
  },
  "bidirectional-streaming": {
    s: "Both sides send independent message sequences over one call, interleaved in time: chat, collaborative sessions, control channels and request pipelines.",
    d: "After the call opens, each direction is its own ordered stream with its own flow control and half-close. Applications define the protocol on top: whether responses answer requests one by one or independently. Either side may end the call with a status, and the other must notice. It is the hardest shape to get right because correctness lives in application protocol: ordering, acknowledgments, reconnection and what state survives a break are not provided by the framework.",
    k: ["Lock-step request/response over a stream vs fully independent directions: lock-step is easy to reason about but loses the benefit of pipelining; independent directions are efficient and need explicit correlation.", "One long call vs reconnect with session identifiers: a long call is simple until it breaks; session identifiers allow resumption but require server session storage."],
    p: ["Both sides wait for the other to write first, and the call deadlocks with nothing in flight.", "A reader that does not drain incoming messages stalls the writer through flow control, which looks like a hang."],
    v: "Run a bidirectional session with a deliberate stall on each side in turn and confirm the other side's backpressure engages without loss; then drop the connection and confirm the client resumes and receives each message once.",
    dep: ["stream-flow-control", "stream-multiplexing", "cancellation"]
  },
  "client-interceptors": {
    s: "Code wrapped around every outgoing call on the client that can modify options, metadata, messages and results, used for credentials, tracing, retries and logging.",
    d: "A client interceptor receives the method, the call options and the next step in the chain. It may add metadata, set a deadline, wrap request or response streams, short-circuit with a cached result or a failure, and observe status. Interceptors are configured on the channel or stub and run for every call. Their difficulty is that they see all four call shapes, which have different forms, so an interceptor written for unary calls often mishandles streams or never sees them at all.",
    k: ["Interceptors as the extension point vs configuration flags on the framework: interceptors can do anything but run on every call and can hide bugs; flags are limited and predictable.", "Per-channel interceptors vs per-call opt-in: per-channel guarantees uniform behavior; per-call is flexible but easy to forget."],
    p: ["A tracing interceptor that handles only unary calls leaves every streaming call without spans.", "An interceptor that catches and retries on its own multiplies with the framework's retry layer, producing exponential attempts."],
    v: "Install a counting interceptor, make one call of each shape, and confirm it observed all four with correct method names and final status, including a cancelled call.",
    dep: ["client-stub-api", "call-context", "interceptor-chain"]
  },
  "server-interceptors": {
    s: "Code wrapped around every incoming call on the server, running before and after the handler, used for authentication, authorization, logging, metrics and limits.",
    d: "A server interceptor receives the call context, the request (or stream) and the next handler. It may reject the call early, enrich the context, wrap streams to observe each message, or transform errors on the way out. Chains run in registration order on the way in and reverse on the way out. Complexity comes from streaming, where the interceptor sees many messages per call, and from performance, since every call pays for every interceptor.",
    k: ["One generic interceptor interface vs separate unary and stream interfaces: a generic interface needs one implementation but handles streams awkwardly; separate ones are explicit and double the code.", "Interceptors vs handler-level code for cross-cutting work: interceptors give uniform enforcement; handler code is explicit and testable but easy to omit on a new method."],
    p: ["An authorization interceptor that skips methods it does not recognize leaves new methods open by default.", "Logging full request messages in an interceptor writes secrets and personal data to logs."],
    v: "Call a protected method without credentials and confirm it is rejected before the handler runs, observed by a handler-entry counter staying at zero, and that the rejection appears in logs and metrics.",
    dep: ["server-handler-registry", "call-context", "interceptor-chain"]
  },
  "interceptor-chain": {
    s: "The ordered composition of interceptors, whose order decides what each can see: for example whether tracing wraps authentication, and whether retries wrap or sit inside metrics.",
    d: "Interceptors are applied as nested wrappers. On the way in, the first registered runs first; on the way out, last. Order matters for correctness: a limiter before authentication spends capacity on anonymous callers, a metrics interceptor inside a retry layer counts attempts instead of calls. Frameworks give a fixed place for built-in behaviors such as deadlines and compression. The difficulty is that order is a hidden, global configuration, and wrong order produces plausible but misleading data.",
    k: ["Explicit ordered list vs priority numbers per interceptor: a list is easy to read in one place; priorities allow modular registration but make final order hard to see.", "Outermost tracing and metrics vs innermost: outermost measures what the caller experiences, including queuing and auth; innermost measures only handler work."],
    p: ["Authentication placed after logging writes unauthenticated credentials into logs before they are rejected.", "A new interceptor added at the end of a long list runs after a short-circuiting one and is never reached."],
    v: "Log the effective chain order at startup, send one call, and confirm in a trace that the span nesting matches the declared order; then reorder two interceptors in test and confirm a test asserting order fails.",
    dep: ["client-interceptors", "server-interceptors"]
  },
  "auth-interceptor": {
    s: "The interceptor that establishes who the caller is from transport identity or tokens and decides whether the call is allowed, before any handler runs.",
    d: "Authentication extracts a credential from the connection (a client certificate) or from metadata (a bearer token), verifies it and attaches an identity to the context. Authorization then checks that identity against method-level policy, often keyed by full method path. Token validation may call a remote service or use cached keys. The difficulty is failure behavior: whether an unreachable identity provider denies or allows calls, how revoked credentials are noticed, and how identity travels on downstream calls.",
    k: ["Authenticate at the edge only vs on every service: edge-only is cheap but trusts the whole internal network; per-service checks cost more and contain a breach.", "Verify tokens locally vs call the issuer: local verification is fast but cannot see revocation until expiry; calling the issuer is current but adds latency and a dependency."],
    p: ["Fail-open when the key service is unreachable lets anyone in during exactly the outage when attention is elsewhere.", "Forwarding the end user's token to every downstream service gives every service the user's full power."],
    v: "Call every method with no credential, an expired one and a valid one lacking permission, and confirm statuses unauthenticated, unauthenticated and permission-denied respectively, with no handler entry for the first three.",
    dep: ["server-interceptors", "call-credentials", "tls-mtls"]
  },
  "telemetry-interceptor": {
    s: "The interceptor that records per-call latency, status counts, message sizes and trace spans, giving every method the same metrics with no handler code.",
    d: "On call start it opens a span, extracts trace context from metadata and notes the start time. On finish it records duration, final status and byte counts into histograms and counters keyed by service, method and status code, and closes the span. For streams it also counts messages. It is hard to do without damaging the system it watches: label cardinality must be bounded, sampling must be consistent across hops, and timing must define clearly whether it includes queueing and serialization.",
    k: ["Label by method and status only vs also by caller or tenant: method and status keep metric series bounded; extra labels give detail but explode storage costs.", "Head-based vs tail-based trace sampling: head-based is cheap and consistent but misses rare failures; tail-based keeps interesting traces and needs buffering."],
    p: ["Using the raw request path or an ID as a label creates unbounded series and takes down the metrics store.", "Measuring only handler time hides queueing and serialization delay that dominates tail latency."],
    v: "Make calls that succeed, fail and time out; confirm the metrics show the expected count per status code and the trace shows one span per hop with correct parent links and durations that sum plausibly.",
    dep: ["server-interceptors", "client-interceptors", "context-baggage"]
  },
  "rate-limiting": {
    s: "Server-side admission control that rejects or delays calls beyond configured rates or concurrency, per method, caller or tenant, to protect the server and keep tenants fair.",
    d: "A limiter counts calls or in-flight work against a budget using token buckets or concurrency counters, keyed by method, caller identity or both. Rejected calls get a resource-exhausted status, ideally with a retry delay in metadata. Limits may be local to each instance or coordinated across instances through a shared store or a quota service. The difficulty is correct keying and cost: a call is not one unit of work, so a flat count lets one expensive method starve cheap ones.",
    k: ["Local per-instance limits vs a global shared quota: local limits are fast and always available but drift with instance count; a global quota is accurate and adds a dependency on the hot path.", "Reject immediately vs queue briefly: rejecting protects latency and signals clients to back off; queueing smooths bursts but increases latency and memory."],
    p: ["A retried rejected call is counted again, so retries inflate the very load that caused the rejection.", "Limits keyed only by IP address group all users behind a shared gateway into one bucket."],
    v: "Send a burst above one tenant's limit while a second tenant sends normal load; confirm the first receives resource-exhausted with a retry hint and the second sees no change in latency or errors.",
    dep: ["server-interceptors", "status-codes", "resource-limits"]
  },
  "request-validation": {
    s: "Checking incoming messages against schema-declared constraints (required, ranges, formats, sizes) before the handler runs, so invalid input is rejected uniformly.",
    d: "Constraints are declared as schema options and compiled into validation code, or defined in a separate rule file. A server interceptor runs the validator on each request and returns invalid-argument with a structured list of violations. This keeps handlers free of repeated checks and gives clients precise errors. It cannot cover business rules that need state. It is hard to keep strictness in step with evolution: tightening a rule is a breaking change for existing callers, and loosening one may expose handlers that relied on it.",
    k: ["Declarative constraints in the schema vs validation code in handlers: declarative rules are uniform and visible to clients; handler code can express any rule but varies by team.", "Validate at the edge only vs at every service: edge-only avoids repetition; per-service validation protects against internal callers and bypassed gateways."],
    p: ["A new constraint rolled out immediately rejects traffic from clients that still send previously accepted values.", "Validation messages that echo the offending value leak sensitive data into logs and error responses."],
    v: "Send requests violating each declared constraint and confirm every one returns invalid-argument naming the field path, and that the handler-entry counter does not increase.",
    dep: ["server-interceptors", "schema-options", "error-details"]
  },
  "deadlines": {
    s: "A call's absolute time limit, set by the caller, after which the call is abandoned with a deadline-exceeded status on both sides.",
    d: "The client sets a deadline, as an absolute instant or a duration converted to one, and sends the remaining time with the call. Both sides enforce it with timers: the client stops waiting and cancels, the server sees the deadline in context and should stop work. Deadlines are the main defense against hangs. They are hard to choose: too short produces spurious failures, too long lets stalls pile up, and they must account for retries, queueing and every downstream hop.",
    k: ["Absolute deadlines vs per-hop timeouts: absolute deadlines share one budget across the chain and shrink naturally; per-hop timeouts add up and can exceed what the original caller is willing to wait.", "Default deadline everywhere vs per-method values: defaults ensure none is forgotten; per-method values fit actual latency and need ongoing tuning."],
    p: ["No deadline set means a stalled dependency holds threads and connections indefinitely.", "Clock skew between machines makes absolute timestamps wrong when sent as wall-clock times rather than remaining durations."],
    v: "Call a handler that sleeps longer than the deadline and confirm the client returns deadline-exceeded at the deadline (not later) and the server's handler observes cancellation within a short grace period.",
    dep: ["call-context", "cancellation"]
  },
  "deadline-propagation": {
    s: "Forwarding the remaining time on every downstream call, so a chain of calls shares one budget and nobody works for a caller that has already given up.",
    d: "A handler takes the remaining time from its incoming context and sets it on outgoing calls, usually automatically when the context is passed on. On the wire, the remaining duration travels as a header and is recomputed at each hop. If less time remains than a call needs, a service can fail fast. The difficulty is leakage: background work, queues and async hops that drop the context turn a bounded request into an unbounded one.",
    k: ["Automatic propagation through the context vs explicit handling per call: automatic is hard to forget but can surprise; explicit gives control but is skipped under pressure.", "Reserve a margin for the return path vs pass the entire remainder: a margin lets the caller return a response in time; passing everything is simpler and often fails right at the deadline."],
    p: ["A handler that starts a new context for a downstream call gives that call a fresh full timeout, so the chain outlives its caller.", "Dropping the deadline when handing work to a queue lets expired work run for nobody."],
    v: "Send a call with a 500 ms deadline through three services where the third sleeps; confirm all three observe cancellation near 500 ms and that the third's incoming deadline was lower than the first's.",
    dep: ["deadlines", "call-context", "request-metadata"]
  },
  "cancellation": {
    s: "A signal that the caller no longer wants the result, which propagates to the server and to the calls it made, so work and resources are released.",
    d: "A client cancels by resetting the call's stream; the server's context is marked cancelled and registered callbacks run. Handlers should check the signal at points where they wait or loop and pass it to downstream calls, which in turn cancel theirs. Cancellation is cooperative: the framework can free the stream but cannot stop a running computation. The hard problem is that a cancelled call may already have had side effects, so cancellation means 'I stopped waiting', not 'it did not happen'.",
    k: ["Cooperative cancellation vs forced termination: cooperative is safe for data but depends on handlers checking; forcing frees resources but can leave state half-written.", "Cancel downstream calls automatically vs leave them to finish: automatic cancellation saves capacity; letting them finish can be needed for operations that must complete once started."],
    p: ["A handler running a long database query never checks the signal and keeps working for minutes after the client left.", "Treating cancelled as failure in alerts produces noise whenever clients time out normally."],
    v: "Start a call that triggers a long downstream chain, cancel it from the client and confirm every hop's handler stops within a second and in-flight downstream active-call gauges return to baseline.",
    dep: ["call-context", "stream-multiplexing"]
  },
  "abort-detection": {
    s: "How the server learns a client has gone: stream reset, connection loss, deadline expiry or keepalive failure, so it can stop work and free state.",
    d: "A closed connection or a reset frame marks all or one of the calls as cancelled. A half-dead peer (power loss, network partition) sends nothing, so detection depends on keepalive pings and flow-control stalls and can take tens of seconds. Server code reacts through cancellation callbacks or checks on write failures. Hard cases are streams that only read: a server that never writes never discovers the failure of a vanished client unless a timer or ping detects it.",
    k: ["Rely on transport keepalives vs application heartbeats: transport pings are automatic but coarse and may be disabled by intermediaries; application heartbeats are visible and tunable at the cost of protocol design.", "Aggressive short timeouts vs tolerant ones: aggressive detection frees resources fast but drops flaky mobile clients; tolerant waits longer for slow networks and holds more state."],
    p: ["A middlebox silently drops idle connections, and the server holds thousands of dead streams with their memory until the OS gives up.", "A stream that only reads input has no write to fail, so the leak is never noticed."],
    v: "Open streams from a client, then cut its network without closing the sockets and confirm the server's active-stream count returns to zero within the configured keepalive timeout.",
    dep: ["cancellation", "keepalive", "call-context"]
  },
  "graceful-shutdown": {
    s: "Stopping a server without failing calls: stop accepting new work, tell clients to go elsewhere, let in-flight calls finish up to a limit, then close.",
    d: "On a stop signal the server marks itself not-serving in health checks, sends a drain notice on each connection so clients stop starting new calls, waits for in-flight calls up to a grace period and then cancels what remains. Clients move to other instances using the notice or health results. It is hard because long-lived streams never finish on their own, load balancers learn of the change with delay, and orchestrators kill the process after their own timer, which may be shorter than the grace period.",
    k: ["Long grace period vs short: a long period lets most calls finish and slows deploys; a short one is fast and cuts streams and slow calls.", "Server-initiated stream termination with a resume hint vs wait forever: ending streams cleanly lets clients reconnect elsewhere; waiting never completes for long streams."],
    p: ["The process manager's kill timeout is shorter than the drain period, so every deploy cuts in-flight calls.", "The server stops listening before health status changes, and the balancer keeps sending new calls to a closed port."],
    v: "Under steady load, restart one instance and confirm the error rate stays at baseline, in-flight calls complete, new calls go to other instances, and the instance exits within the grace period.",
    dep: ["goaway-drain", "health-service", "cancellation"]
  },
  "status-codes": {
    s: "A small fixed set of canonical result codes (ok, cancelled, deadline exceeded, not found, unavailable and so on) shared by every method, that clients and retry logic can act on.",
    d: "Every call ends with exactly one status: a code from the fixed set plus a message and optional details. Codes describe the class of failure, not the application: invalid-argument is the caller's fault, unavailable is transient and often retryable, failed-precondition requires a state change first. Retry policy, metrics and alerting key off them. The difficulty is consistent use: with only a few dozen codes, teams disagree on which one fits, and a wrong code misleads retries and dashboards.",
    k: ["A small shared vocabulary vs application-specific code lists: a small set lets generic machinery (retries, alerts, proxies) work everywhere; application codes are precise but opaque to infrastructure.", "Distinguishing caller errors from server errors in codes vs in details: in codes lets infrastructure count blame correctly; in details keeps codes minimal but hides blame."],
    p: ["Returning an internal error for validation failures pages on-call for caller mistakes and triggers pointless retries.", "Returning not-found for permission failures hides real outages behind apparent missing data."],
    v: "Trigger each failure class in a test service, such as bad input, missing record, unavailable dependency and deadline, and confirm each yields the documented code, and that retry and alert rules fire only for the intended ones.",
    dep: ["trailers", "retry-policy"]
  },
  "error-details": {
    s: "Structured information attached to a failed status: which fields were invalid, how long to wait before retrying, what quota was exceeded, so clients can act without parsing messages.",
    d: "The status carries an optional list of typed messages, defined in the schema, serialized into a trailer. Standard shapes cover field violations, retry information, quota failures and debugging data. Clients unpack the ones they understand and ignore the rest. It is hard to keep useful and safe: details are an API too and must be compatible across versions, and they are a leak path for stack traces, internal addresses and personal data.",
    k: ["Typed details vs human-readable messages only: typed details are machine-actionable and versioned; messages are easy and unreliable to parse.", "Rich details to all callers vs verbose only for trusted ones: rich details speed debugging; limiting them for external callers prevents leaks."],
    p: ["Clients parse the English message text to decide behavior, and a wording change breaks them.", "Server exception text and stack traces are copied into details and exposed to outside callers."],
    v: "Trigger a validation failure and confirm a client reads the exact field paths from typed details without touching the message; then confirm an external caller's response contains no internal host names or stack frames.",
    dep: ["status-codes", "trailers", "message-schemas"]
  },
  "error-mapping": {
    s: "Translating errors across boundaries: from library exceptions to statuses on the server, from downstream statuses to what this service returns, and from statuses to domain errors on the client.",
    d: "At each boundary a mapper decides which code and message to expose. A server converts a database not-found into not-found but a connection failure into unavailable. A service that receives unavailable from a dependency usually should not pass it on blindly, since the caller will wrongly assume this service is unavailable and may retry the whole chain. Hard because every layer has a mapping and they drift apart, producing inconsistent codes for the same condition.",
    k: ["Pass downstream codes through unchanged vs translate to this service's own meaning: pass-through is simple and preserves detail but misleads callers about who failed; translation is accurate and needs deliberate rules.", "Central mapping table vs per-handler mapping: central gives consistency; per-handler adapts to local context and diverges."],
    p: ["A downstream deadline-exceeded is returned as-is to a caller who has plenty of time left, so they see a timeout for a different cause.", "Catch-all conversion of every exception into internal hides recoverable conditions that clients could retry."],
    v: "Inject a downstream unavailable, a not-found and a deadline error into a service; confirm the status each caller sees matches a documented table and differs correctly from the downstream status where specified.",
    dep: ["status-codes", "server-interceptors"]
  },
  "retry-policy": {
    s: "Rules for which failed calls the client may retry automatically: which status codes, how many attempts, and with what delay, usually declared per method.",
    d: "A policy lists maximum attempts, retryable codes (typically unavailable), initial backoff, multiplier and cap. The client retries only before any response message is received, or when the transport confirms the request never reached the server (a transparent retry). Retries respect the original deadline. Hard because retrying is only safe for idempotent calls, and because every layer that retries multiplies attempts: three layers of three attempts each can mean 27 calls from one failure.",
    k: ["Retry in the framework vs in application code: framework retries apply uniformly and are configured declaratively; application retries understand semantics and are easy to nest by accident.", "Retry only idempotent methods vs retry any with dedup keys: idempotent-only is safe and limited; dedup keys extend retries to writes at the cost of server-side state."],
    p: ["Retrying a non-idempotent write after a timeout charges a customer twice.", "Retries at every layer of a deep call chain turn a brief dependency blip into a self-inflicted overload."],
    v: "Make the server fail the first two attempts with unavailable and confirm the call succeeds on the third; make it fail with invalid-argument and confirm exactly one attempt; confirm total elapsed time never exceeds the deadline.",
    dep: ["status-codes", "backoff-jitter", "idempotency", "retry-budgets"]
  },
  "backoff-jitter": {
    s: "Increasing the delay between retries, with random variation, so many clients that fail together do not retry in lockstep and overload a recovering server.",
    d: "Delay grows exponentially from an initial value up to a cap, and a random factor spreads each client's next attempt across an interval. Without randomness, clients that failed at the same moment return at the same moment. The server can also provide a minimum delay in details, which clients honor. Hard in practice because the parameters trade recovery time against load, and the right values depend on server capacity and fleet size that the client does not know.",
    k: ["Full jitter vs equal jitter: full jitter spreads load best and may retry very quickly; equal jitter keeps a minimum wait but spreads less.", "Client-chosen delays vs server-provided retry hints: client-chosen needs no cooperation; server hints reflect true recovery times but depend on every server setting them."],
    p: ["Fixed-interval retries from thousands of clients create periodic traffic spikes that keep the server down.", "A cap set too high leaves clients waiting minutes after the server has recovered."],
    v: "Fail a server for 10 seconds under 500 clients; plot attempt timestamps and confirm they spread over the interval rather than clustering, and that load after recovery stays below capacity.",
    dep: ["retry-policy"]
  },
  "retry-budgets": {
    s: "A cap on the fraction of calls that may be retries (or a token bucket drained by failures), so retries cannot amplify an outage past the point of recovery.",
    d: "Each channel tracks tokens: successes refill slowly, failures drain faster. When tokens run out, further failed calls are not retried, and the status is returned immediately. This bounds retry traffic to a small percentage of normal load, even when everything is failing. The hard part is tuning: too small and ordinary transient errors go unretried; too large and the budget no longer limits anything, and the budget is per client so it does not coordinate across the fleet.",
    k: ["Ratio-based budget vs fixed attempts per call: a ratio limits fleet-wide amplification during outages; per-call limits protect single calls but do not bound total load.", "Per-channel vs shared per-process budgets: per-channel isolates targets; shared is simpler but lets one failing dependency use up retries for healthy ones."],
    p: ["Setting only per-call attempt limits leaves total retry volume unbounded during a regional failure.", "A budget so tight that it blocks retries during normal single-instance restarts causes avoidable errors."],
    v: "Take a backend fully down under load and confirm total request rate from clients stays within the configured percentage above the normal rate, rather than multiplying by the attempt count.",
    dep: ["retry-policy", "status-codes"]
  },
  "idempotency": {
    s: "Making repeated execution of a call safe, by operations that naturally have no extra effect or by client-supplied keys the server uses to detect and collapse duplicates.",
    d: "An idempotent method yields the same state whether run once or many times, such as setting a value. Others, such as appending or charging, need a unique key per logical operation. The server records the key with the outcome for a retention window and returns the stored result for repeats. The record and the effect must be written atomically, and concurrent duplicates must wait or fail. It is hard because the key store must be as durable as the effect and the window must outlast any plausible retry.",
    k: ["Naturally idempotent method design vs dedup keys: natural idempotency needs no state and fits few operations; keys cover everything and need a durable store.", "Key window of hours vs days: short windows save storage but let a late retry duplicate; long windows are safe and grow storage."],
    p: ["The key is stored after the side effect in a separate step, and a crash between them lets a retry repeat the effect.", "The client generates a new key on each attempt, so the server cannot link the retries."],
    v: "Send the same keyed write 10 times, including 3 concurrent, and confirm exactly one effect occurred and every response carries the same result.",
    dep: ["request-metadata", "retry-policy"]
  },
  "hedging": {
    s: "Sending the same request to a second server if the first has not answered within a delay, and using whichever replies first, to cut tail latency.",
    d: "After a hedging delay (often near the 95th percentile of latency), the client sends a duplicate to a different instance and cancels the loser when one succeeds. This trims slow outliers caused by a bad instance, garbage collection or queueing. It adds load, typically a few percent when the delay is high. Safe only for idempotent calls, and it needs retry-like throttling so that during overload hedging does not double traffic exactly when capacity is short.",
    k: ["Hedge after a delay vs send to two servers immediately: delayed hedging adds little load; immediate duplication cuts latency most and doubles cost.", "Cancel the loser vs let it finish: cancelling saves capacity if servers honor it; leaving it running is simpler and wastes work."],
    p: ["Hedged writes without idempotency execute twice.", "During an overload, slow responses trigger hedges, which add load, which slow responses further."],
    v: "Inject a slow response on one instance in 5 percent of calls; confirm 99th-percentile latency drops while total request volume rises by less than the configured fraction and duplicates are cancelled.",
    dep: ["retry-policy", "idempotency", "lb-policies", "cancellation"]
  },
});
