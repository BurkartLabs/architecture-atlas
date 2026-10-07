// Details part 3: metadata, client-side routing, serialization.
ATLAS.details("rpc-framework", {
  "request-metadata": {
    s: "Key-value pairs sent with a call, outside the message body: credentials, trace identifiers, tenant, version hints and idempotency keys.",
    d: "Metadata is a list of lowercase text keys with text or binary values, sent in the call's initial headers. Clients set it per call or through interceptors; servers read it from the context. Reserved prefixes belong to the framework (deadline, encoding, content type). It is cheaper to add than a schema field but is untyped and invisible to the schema compiler, so it becomes an undocumented second API. Hard parts are size limits, proxies that drop or rewrite unknown headers, and sensitive values ending up in logs.",
    k: ["Metadata vs fields in the message: metadata crosses layers without schema changes and is visible to proxies; fields are typed, documented and versioned with the API.", "Allow arbitrary keys vs a registry of known keys: arbitrary is flexible and invites sprawl; a registry gives order and slows teams down."],
    p: ["A key that a proxy strips works in direct tests and vanishes in production.", "Authorization values written to access logs expose credentials to everyone with log access."],
    v: "Send a call with custom metadata through every proxy hop to a handler that echoes what it received; confirm the keys and values match, binary values included, and that reserved keys cannot be spoofed by the client.",
    dep: ["trailers", "metadata-limits"]
  },
  "trailers": {
    s: "Metadata sent after the response body, which carries the final status and any end-of-call values that were not known when the response started.",
    d: "A call's response has initial headers (sent first), zero or more messages, then trailers containing the status code, message, details and optional custom entries. Because trailers come last, a server can report an error after streaming partial results, and compute values like a checksum or timing. Their difficulty is support: some proxies and browser APIs drop or cannot read trailers, so status delivery may need an alternative encoding.",
    k: ["Status in trailers vs in headers: trailers allow errors after partial output; headers are widely supported but require knowing the outcome before sending anything.", "Custom trailing metadata vs including data in the final message: trailers add values without changing the schema; the message is typed and survives tools that drop trailers."],
    p: ["An intermediary that discards trailers makes every call look as if it ended without a status, which clients may treat as unknown error.", "A server that errors after sending headers must still send trailers, or the client waits forever."],
    v: "Stream three messages and then fail with a specific code; confirm the client receives all three messages followed by that code and the custom trailer, through each proxy in the path.",
    dep: ["message-framing", "header-compression"]
  },
  "call-credentials": {
    s: "Credentials attached to individual calls, typically bearer tokens in metadata, obtained and refreshed by the client from an identity system, as distinct from the connection's certificate identity.",
    d: "A credentials provider returns a token for each call or caches one until near expiry; an interceptor or channel option adds it to metadata. Combined credentials mix channel credentials (TLS) with call credentials, and the framework may refuse to send call credentials on an insecure channel. They allow per-user and per-request identity over shared connections. Hard parts include refresh races when many calls need a new token simultaneously, and scope: which token goes to which service.",
    k: ["Per-call tokens vs connection-level identity: per-call tokens identify end users over shared connections; connection identity is simpler and identifies only the machine.", "Token refresh in the background vs on demand: background refresh avoids latency spikes; on demand is simpler and stalls many callers at expiry."],
    p: ["Sending a token to a service that was not meant to receive it lets that service replay it elsewhere.", "Every caller refreshes at once when the token expires and overloads the identity service."],
    v: "Run calls past token expiry with a short-lived token; confirm that exactly one refresh occurred per expiry across concurrent calls, that no call failed unauthenticated, and that tokens are not sent over a plaintext channel.",
    dep: ["request-metadata", "tls-mtls", "client-interceptors"]
  },
  "context-baggage": {
    s: "Request-scoped values (trace ids, tenant, priority, experiment flags) that follow a request through every service it touches, carried in metadata and copied between incoming and outgoing contexts.",
    d: "Each service reads designated keys from incoming metadata into its context and writes them into outgoing metadata automatically. Trace context uses a standard header format so different tools agree; other baggage uses application-defined keys. This is how a trace crosses dozens of services and how a tenant or priority classification follows. Hard because it works only if every hop forwards it, size grows with every addition, and untrusted callers can inject values that downstream services then believe.",
    k: ["Propagate all metadata automatically vs an allowlist: automatic is easy and risks leaking or amplifying data; an allowlist is safe and needs maintenance.", "Trust incoming baggage vs re-derive at the edge: trusting is simple; re-deriving stops spoofing of tenant or priority by outside callers."],
    p: ["An external caller sets a priority or tenant key and receives other tenants' treatment because internal services trust it.", "A service that makes calls from a background pool drops the baggage, and traces break into disconnected pieces."],
    v: "Send a call through four services with a trace id and tenant value; confirm every service's logs show the same trace id and tenant, and that a spoofed tenant value from outside the edge is overwritten.",
    dep: ["request-metadata", "call-context"]
  },
  "metadata-limits": {
    s: "Maximum sizes for headers and metadata per call, enforced by each hop, which protect servers and proxies from oversized or malicious headers.",
    d: "Each layer sets a cap on total header bytes and sometimes on individual values: the framework, the HTTP/2 implementation and every proxy. Exceeding it yields a failed call with a resource or internal status, or a dropped connection. Because the limits differ by hop, a call can work in one environment and fail in another. Hard in practice because metadata grows silently: every new interceptor, token or baggage item adds bytes.",
    k: ["Low limits vs generous limits: low limits protect memory and fail early; generous ones accommodate large tokens and baggage and are an easier target for abuse.", "Compress headers vs shrink what is sent: compression helps repeated values; shrinking the values (short tokens, reference IDs) helps everywhere."],
    p: ["A token that grows with each added permission eventually exceeds a proxy limit, and only the largest users fail.", "Mismatched limits across hops give errors with no clear source."],
    v: "Send metadata at 90, 100 and 110 percent of the lowest configured limit along the path, and confirm the first two succeed and the third fails with a clear status that names the limit.",
    dep: ["request-metadata", "header-compression"]
  },
  "name-resolution": {
    s: "Turning a logical service name into a set of addresses, from DNS records, a service registry or a static list, and updating it as instances come and go.",
    d: "A resolver takes a target such as a name with a scheme and returns addresses plus optionally a service config and attributes such as locality or weight. It watches for changes: DNS by polling and TTL, registries by push. The channel hands addresses to the balancer. Hard problems include caching: DNS answers are cached by many layers, so removal of an instance reaches clients slowly, and a resolver that returns an empty result under error can empty the whole pool.",
    k: ["DNS-based resolution vs registry push: DNS works everywhere and updates slowly; a registry updates quickly and adds a dependency and a client protocol.", "Resolve once at startup vs continuous re-resolution: once is cheap but never sees changes; continuous follows scaling and costs load on the resolver."],
    p: ["On resolver failure the client discards its address list instead of keeping the last good one, and every call fails.", "Long DNS TTLs keep clients sending traffic to terminated instances for minutes."],
    v: "Add and remove instances behind a name while a client runs; confirm new instances receive traffic within the expected interval, removed ones stop, and a simulated resolver outage leaves traffic on the last known list.",
    dep: ["service-config", "lb-policies"]
  },
  "service-config": {
    s: "Per-service settings delivered with name resolution or configured locally: which balancing policy, retry and hedging rules, timeouts and message size limits apply per method.",
    d: "The config is a structured document matched on service and method names. A resolver can supply it, so operators change timeouts and retry behavior across the fleet without redeploying clients. The channel applies it when addresses update. Hard because it is a remote control of every client: a bad config applies everywhere at once, clients must validate it and fall back on the last good one, and precedence between local settings and delivered config must be clear.",
    k: ["Server-delivered config vs client-local config: delivered config lets operators change behavior fast; local config is explicit in code and needs a release to change.", "Per-method matching vs one config per service: per-method fits real differences (a slow report vs a fast lookup); per-service is simpler."],
    p: ["A malformed config pushed to all clients disables retries or sets zero timeouts fleet-wide.", "Teams forget a delivered config exists, and local code changes seem to have no effect."],
    v: "Push a config that changes one method's timeout and retry count; confirm clients apply it without restart, that an invalid config is rejected with the previous one kept, and that metrics show the change.",
    dep: ["name-resolution", "retry-policy", "deadlines"]
  },
  "lb-policies": {
    s: "The algorithm a client uses to pick a server per call: first available, round-robin, least-loaded or weighted random, among those that are connected.",
    d: "A balancing policy receives the address list and subchannel state changes and provides a picker used for each call. Pick-first uses one address and keeps it; round-robin rotates; least-request prefers the connection with fewest outstanding calls; ring-hash maps keys to servers. Policies are plugins. The difficulty is that the policy's view is local and stale: each client sees only its own calls, so many clients using least-loaded can all pile onto the same instance that looked idle.",
    k: ["Round-robin vs least-outstanding-requests: round-robin is simple and fair for uniform calls; least-outstanding adapts to slow instances and varied call costs but needs per-connection counts.", "Power-of-two random choices vs full scan: sampling two and picking the better avoids herding and is cheap; scanning all gives a better local pick that many clients choose identically."],
    p: ["Pick-first used with a many-instance service sends all traffic from one client to a single instance.", "Round-robin over connections with long-lived streams balances connections rather than load."],
    v: "Run 1,000 clients against 10 instances, one of which is half speed; confirm per-instance request counts follow the policy's intent and tail latency does not collapse onto the slow instance.",
    dep: ["subchannel-pool", "name-resolution", "client-health-checking"]
  },
  "subchannel-pool": {
    s: "The set of connections a client keeps to individual server addresses, each with its own state (idle, connecting, ready, failed), shared across stubs and calls.",
    d: "Each resolved address gets a subchannel that opens a connection on demand, reports state transitions to the balancer and reconnects with backoff. Calls are assigned to a ready subchannel by the picker. Subchannels may be shared between channels pointing at the same target to avoid duplicate connections. Hard parts include connection counts for large fleets, idle subchannels holding resources, and states that flap and trigger churn in the balancer.",
    k: ["Eager connect to all addresses vs connect on demand: eager gives instant failover and many idle connections; on demand saves resources and delays first calls.", "Share subchannels across channels vs separate pools: sharing reduces connections; separate pools isolate tenants and settings."],
    p: ["Thousands of clients each holding a connection to thousands of servers makes connection count quadratic.", "Subchannels rapidly cycling between ready and failed cause a balancer to reshuffle constantly."],
    v: "Start a client against 50 addresses, record open connection counts, kill three servers, and confirm those subchannels leave ready state and reconnect with backoff while calls continue on the others.",
    dep: ["connection-establishment", "reconnect-backoff", "transport-abstraction"]
  },
  "client-health-checking": {
    s: "The client asking each server about its serving status, using the health service, and avoiding those that report not serving, so traffic leaves unhealthy instances before connections fail.",
    d: "For each ready subchannel, the client can open a health watch stream. A not-serving report removes that address from the picker without closing the connection. This catches a server that accepts connections but cannot serve (starting up, overloaded, dependency down). It is distinct from passive detection from call results. Hard because it adds load (N clients times M servers), delays vary, and a server wrongly reporting healthy or unhealthy has fleet-wide effect.",
    k: ["Active health watching vs relying on connection state and failures: active detection reacts before real calls fail; passive costs nothing and discovers failure with real traffic.", "Client-side checks vs checks by a central balancer: client-side avoids a proxy but multiplies check traffic; central checks scale better and give one view."],
    p: ["Every client watching every server creates a request storm on the health service at startup.", "A server's health flaps under load and the whole fleet oscillates in and out of rotation."],
    v: "Make one server report not-serving while its port stays open, and confirm every client stops sending it new calls within the check interval, then resumes after it reports serving.",
    dep: ["health-service", "subchannel-pool"]
  },
  "outlier-ejection": {
    s: "Passive detection that removes a server from rotation temporarily when its recent calls fail or run slow compared with its peers, then re-admits it after a cool-down.",
    d: "The client tracks consecutive failures and success rates for each address. Instances that exceed thresholds, or are statistical outliers against the fleet, are ejected for a period that increases with repeated ejection. A cap on the share of the fleet that can be ejected prevents removing everything. It needs no extra traffic. It is hard to tune: with low request volume the statistics are noise, and one bad dependency can make all servers look unhealthy together.",
    k: ["Consecutive-failure ejection vs success-rate outlier detection: consecutive failures catch dead instances fast; success-rate comparison catches partially degraded ones and needs enough volume.", "Fixed cool-down vs growing ejection time: growing times keep repeat offenders out longer and take longer to recover from false positives."],
    p: ["Without a cap on ejected share, a shared dependency failure ejects the entire fleet and every call fails immediately.", "Low-traffic clients eject healthy instances based on a few random failures."],
    v: "Make one instance return errors on all calls; confirm clients stop using it within a few failed calls, re-admit it after the cool-down when healthy, and never eject more than the configured percentage.",
    dep: ["lb-policies", "subchannel-pool", "status-codes"]
  },
  "lookaside-balancer": {
    s: "A separate balancer service that tells clients which servers to use, based on global load information, while the clients still send calls directly to servers.",
    d: "Clients ask the balancer for an address list or assignment and report load; the balancer, which sees the whole fleet, returns weights or specific targets. The data path stays client-to-server, so the balancer carries no call traffic. Systems may refresh assignments every few seconds and fall back to local policies if the balancer is down. Hard because it is a control-plane service on which every client depends, and because its view is delayed.",
    k: ["Look-aside balancing vs in-path proxy balancing: look-aside avoids a hop and a bottleneck on the data path; a proxy sees every call and has a simpler client.", "Fail to local policy vs fail closed when the balancer is unreachable: local fallback keeps calls flowing with worse balance; failing closed avoids misrouting and takes everything down."],
    p: ["A balancer outage with no fallback stops all calls though every server is healthy.", "Stale weights keep sending traffic to an instance that was drained minutes ago."],
    v: "Stop the balancer under load and confirm clients continue on the last assignment, then fall back to a local policy after expiry, with request success rate staying above the target and a metric showing the fallback.",
    dep: ["lb-policies", "name-resolution", "weighted-locality"]
  },
  "weighted-locality": {
    s: "Preferring nearby or cheaper servers (same zone, then region) and weighting by capacity, spilling to farther ones only when closer ones are full or unhealthy.",
    d: "Each address carries attributes such as zone and weight from the resolver. The policy groups addresses by locality, chooses localities by priority and weight, and balances within them. Overflow rules shift a share of traffic outward when the preferred group's healthy fraction falls. This reduces latency and cross-zone transfer costs. It is hard because weights and priorities must match real capacity, and a failure in one zone can push a surge on another that was sized for its own share.",
    k: ["Strict zone preference vs weighted spread: strict preference cuts latency and cost and leaves capacity stranded; spreading uses all capacity and pays cross-zone costs.", "Static weights vs load-reported weights: static weights are predictable; reported weights adapt to real utilization and add feedback loops."],
    p: ["A zone fails and its whole traffic lands on the next zone, which was sized for its own share only.", "Weights copied from instance counts ignore different instance sizes."],
    v: "Fail a zone in a staging fleet and confirm the share of traffic that moves to each other zone matches the configured overflow rule and that latency and error rates remain within target.",
    dep: ["lb-policies", "name-resolution"]
  },
  "affinity-routing": {
    s: "Sending calls with the same key (user, shard, session) to the same server, using hashing or explicit assignment, so caches and local state stay useful.",
    d: "A request key from metadata or a message field is hashed on a ring of servers, so each key maps to the same instance while membership is stable. When an instance joins or leaves only a fraction of keys move. Services with sharded state use it to reach the owner directly. It trades balance for locality: popular keys create hot servers. Hard cases are membership changes during which the same key may go to different servers on different clients.",
    k: ["Consistent hashing vs random balancing: hashing gives cache locality and stateful routing; random is even and ignores state.", "Routing by client hash vs a shard map from a directory: hashing needs no lookup but cannot place hot keys specially; a shard map is flexible and needs a consistent directory."],
    p: ["One very popular key sends all its traffic to one instance, which is overloaded while others idle.", "Clients with different views of membership route the same key to different instances, and a server sees writes it does not own."],
    v: "Send 100,000 calls with 1,000 keys; confirm each key lands on one instance, spread is within tolerance, and removing an instance moves only roughly its share of keys.",
    dep: ["lb-policies", "request-metadata", "name-resolution"]
  },
  "wire-encoding": {
    s: "The compact binary format that turns a message into bytes as a sequence of tagged fields, each carrying its field number and a wire type.",
    d: "Each field is written as a key combining its number and a wire type (varint, fixed width, length-delimited), followed by the value. The decoder uses the schema to interpret values and the wire type to skip fields it does not know. Fields may appear in any order and repeat. Absent fields cost nothing. Since the format has no self-describing type names, correct decoding needs the same schema, and corrupted bytes can decode into plausible nonsense.",
    k: ["Tagged self-delimiting fields vs fixed positional layout: tagged fields allow reordering, omission and evolution at a few bytes per field; positional layout is smaller and faster and cannot evolve.", "Schema-required decoding vs self-describing data: schema-driven is compact and fast; self-describing is debuggable without the schema and larger."],
    p: ["Decoding bytes with the wrong schema often succeeds and returns wrong values, with no error.", "Duplicate non-repeated fields rely on 'last one wins', which differs between parsers."],
    v: "Encode a known message and compare the bytes with a hand-computed expected sequence; decode with a second implementation in another language and confirm field-for-field equality.",
    dep: ["varints", "length-delimited"]
  },
  "varints": {
    s: "A variable-length integer encoding using seven bits per byte plus a continuation flag, so small numbers take one byte; zigzag maps signed numbers so small negatives are also short.",
    d: "Each byte contributes seven value bits and one bit saying more follows, least significant group first. A value under 128 takes one byte; a full 64-bit value takes up to ten. Plain two's-complement negatives would always take ten bytes, so signed fields can use zigzag, which interleaves positive and negative values (0, -1, 1, -2 map to 0, 1, 2, 3). Hard parts: decoders must reject overlong and overflowing sequences, and the choice of signed type at design time cannot change later.",
    k: ["Variable-length vs fixed-width integers: varints are small for typical values and slower to decode; fixed width is faster and wins for values that are usually large or random.", "Zigzag signed type vs plain signed type: zigzag keeps small negatives small; the plain type is wasteful for negatives, and changing between them later breaks decoding."],
    p: ["Using the plain signed type for fields that are often negative costs ten bytes each.", "A decoder that does not bound the number of bytes can be fed an endless continuation sequence."],
    v: "Encode 0, 127, 128 and 300 and confirm 1, 1, 2 and 2 bytes; the largest 64-bit value takes 10 bytes; -1 takes 10 bytes plain but 1 byte zigzag; a crafted 11-byte input is rejected.",
    dep: ["wire-encoding"]
  },
  "length-delimited": {
    s: "The wire type for strings, bytes, nested messages and packed repeated fields: a length prefix followed by that many bytes, which lets decoders skip or slice without parsing contents.",
    d: "After the field key comes a varint length and then the payload. A nested message is encoded recursively inside the payload, and packed repeated scalars are concatenated values in one payload. The length lets a decoder skip unknown fields and lets code hold a view of the bytes instead of copying. It is hard because lengths must be validated against remaining input and size limits before allocating, and a nested message's length cannot be written until its size is known, which forces size computation or a patch-up pass.",
    k: ["Precomputing sizes vs buffering and back-patching the length: precomputing walks the tree twice and writes straight into the output; back-patching copies or needs reserve space.", "Packed repeated fields vs one key per element: packed is smaller and faster for numbers; unpacked is simpler for compatibility with older readers."],
    p: ["A length field of several gigabytes read from untrusted input triggers a giant allocation before any data arrives.", "Deeply nested messages cause stack overflow in recursive parsers."],
    v: "Feed a decoder a length exceeding the remaining buffer and a nesting depth over the limit; confirm both are rejected with errors and no large allocation happens.",
    dep: ["wire-encoding", "message-size-limits"]
  },
  "json-mapping": {
    s: "A defined, canonical mapping between messages and JSON objects, used by gateways, debugging tools and configuration, with rules for names, numbers, bytes, enums and unknowns.",
    d: "Field names map to lowerCamelCase keys, enums to names, bytes to base64, and 64-bit integers to strings because many JSON readers use floating point. Defaults may be omitted or printed. Parsers can ignore or reject unknown keys. The mapping lets humans and web code read the same schema. Hard parts: the mapping is a second compatibility surface, since renaming a field breaks JSON consumers even though the wire format is untouched, and it is lossy for unknown fields.",
    k: ["Names as JSON keys vs numbers: names are readable and make renames breaking; numbers survive renames and are unreadable.", "Ignore unknown JSON fields vs reject: ignoring supports evolution; rejecting catches typos and misspelled fields."],
    p: ["A 64-bit identifier sent as a JSON number loses its low digits in a browser.", "A field rename is safe on the wire and breaks every JSON client at once."],
    v: "Round-trip messages with maximum 64-bit values, empty and unset fields, enum values and bytes through JSON and back, and confirm equality and that the JSON matches the documented key names.",
    dep: ["message-schemas", "wire-encoding"]
  },
  "canonical-encoding": {
    s: "A byte-for-byte reproducible encoding of a message, needed for signing, hashing, caching and comparing, which the ordinary format does not promise.",
    d: "The standard wire format allows several valid encodings of the same message: fields in any order, optional packing, varints padded, map entries in any order. Deterministic modes fix the order (by field number, sorted map keys) and the form, within one implementation and version. Still not guaranteed across languages or releases. It is hard because developers assume stable bytes and build hashes and cache keys on them, and the first library upgrade changes every key.",
    k: ["Hash the encoded bytes vs hash a canonical form defined by the application: encoded bytes are easy and fragile; a defined canonical form is stable and requires extra code.", "Deterministic mode in the library vs sorting fields in the message: library mode costs little and offers limited guarantees; application-level sorting is portable and manual."],
    p: ["A cache keyed by the hash of encoded bytes loses all entries after a library upgrade changes field order.", "A signature computed over one language's encoding fails verification in another."],
    v: "Encode the same logical message in two languages and two library versions with map entries inserted in different orders; confirm either identical bytes or, where the format makes no promise, that the system never depends on it.",
    dep: ["wire-encoding", "message-schemas"]
  },
  "zero-copy-buffers": {
    s: "Using buffer views, chunked buffers and arenas to serialize and parse without copying payload bytes repeatedly, which dominates cost on large messages.",
    d: "Serializers write into a chain of buffer chunks that the transport can send directly; parsers can return views into the receive buffer for strings and bytes instead of copying. Arena allocation puts all of a message's objects into one region that is freed together. These cut copying and allocator pressure. It is hard because views extend buffer lifetime: a retained string keeps the whole receive buffer alive, and releasing buffers early causes use-after-free in languages without safety.",
    k: ["Views into the receive buffer vs copies: views are fast and tie object lifetime to the buffer; copies are safe and cost time and memory.", "Arena allocation vs general allocation per object: arenas make parse and free cheap and cannot free individual objects; general allocation is flexible and slower."],
    p: ["A small cached field that is a view into a large buffer keeps megabytes alive per entry.", "Mutating a buffer that the transport still owns corrupts an in-flight message."],
    v: "Profile allocations and copy counts for a 10 MB message through a full call; confirm that payload bytes are copied no more than the documented number of times and memory returns to baseline afterward.",
    dep: ["length-delimited", "message-framing"]
  },
  "message-size-limits": {
    s: "Maximum sizes for received and sent messages, per method or per channel, which cap memory use and make oversized messages fail with a clear status.",
    d: "Receivers set a maximum message length (often a few megabytes by default); the sender may have its own. The length prefix is checked before allocating the buffer, so oversized messages fail early with resource-exhausted. Limits can be raised per method. They protect servers from memory exhaustion and slow-read attacks. Hard because limits are easy to hit by growth: a result list that was small in testing crosses the limit with the largest customer, and it fails only for them.",
    k: ["Small default limits vs large: small defaults protect memory and cause surprising failures; large defaults hide oversized designs and weaken protection.", "Raising the limit vs streaming or paginating: raising the limit is a one-line change that moves the problem; streaming or pagination fixes the design and costs code."],
    p: ["Sender and receiver limits differ, so the sender succeeds in serialization and the receiver rejects, hiding the real source of the error.", "A limit raised on the server but not on an intermediate proxy keeps failing at the proxy."],
    v: "Send messages at the limit and one byte above on every hop; confirm the first succeeds and the second fails with resource-exhausted and a message naming the limit, with server memory unchanged.",
    dep: ["length-delimited", "stream-limits"]
  },
});
