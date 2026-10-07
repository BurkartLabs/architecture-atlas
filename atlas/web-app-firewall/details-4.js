// Details for the web application firewall plate, part 4: body parsing, deployment, performance, connections.
ATLAS.details("web-app-firewall", {
  "http-request-parser": {
    s: "Parses the raw request into method, target, version, headers and body framing, and decides what to do with anything malformed or ambiguous.",
    d: "The parser reads the request line and headers, enforces limits on their count and size, validates framing (content length, chunked encoding), and hands the body on to content-specific parsers. It is the first place rejection happens. Strictness is the key choice: a lenient parser accepts what backends accept, and a strict one refuses anything the standard forbids. It is hard because it is exposed to arbitrary bytes, so a bug here is itself a vulnerability.",
    k: ["Strict standard-conforming parsing vs. lenient: strict removes ambiguity and breaks odd clients; lenient matches tolerant backends and keeps differentials.", "Hand-written parser vs. generated or table-driven: hand-written is fast and flexible; generated is easier to verify against the standard."],
    p: ["Accepting a bare line feed as a line end lets an attacker smuggle a second header the backend sees.", "Header size limits lower than the backend's cause large legitimate cookies to be rejected."],
    v: "Send a corpus of malformed and ambiguous requests (bare line feeds, oversize headers, duplicate lengths) and confirm each is rejected with a logged reason, while a standard conformance suite passes.",
    dep: ["connection-acceptor", "header-normalization"]
  },
  "form-and-query-parser": {
    s: "Splits the query string and URL-encoded body into named parameters, applying decoding and the separator and array conventions the backend uses.",
    d: "The parser splits on ampersands and, in some backends, semicolons, separates names from values, decodes both, and handles repeated names and bracket notation. It exposes parameter names and values as collections to rules and enforces limits on count and length. It is hard because conventions vary: nested notation creates objects in some frameworks, and parameter count limits differ, so extra parameters may be ignored by one side and used by the other.",
    k: ["Cap on parameter count vs. unlimited: a cap prevents hash-collision and memory abuse but may truncate legitimate large forms and hide data past the limit.", "Expose names and values separately vs. as raw string: separately allows precise rules; raw string is simpler and matches more noisily."],
    p: ["Parameters past the firewall's count limit are not inspected but still reach the backend.", "Bracketed names create nested structures in the framework that the firewall sees as flat strings."],
    v: "Send requests with more parameters than the limit, semicolon separators and bracket notation, and confirm the firewall either rejects them or inspects the same values the backend receives.",
    dep: ["url-decoding", "http-request-parser", "parameter-pollution-handling"]
  },
  "json-body-parser": {
    s: "Parses JSON request bodies into a tree of keys and values that rules can inspect, with limits on depth, size and duplicate keys.",
    d: "The parser walks the document, producing flattened paths such as an object key and an array index, and exposes both keys and values. It enforces maximum nesting depth and size, and takes a position on duplicate keys, invalid escapes and non-standard extensions such as comments. It is hard because JSON parsers differ on those edge cases, so a document may mean different things to the firewall and the backend, and because deep documents can exhaust memory.",
    k: ["Strict standard parse vs. lenient: strict rejects ambiguous documents and may refuse clients using extensions; lenient accepts what the backend does.", "Flatten to paths vs. inspect the tree: flat paths work with the same rules as form parameters; the tree supports structural rules and costs more."],
    p: ["A duplicate key is read as first-wins by the firewall and last-wins by the backend, hiding the payload.", "A deeply nested document exceeds the parser's depth limit and is passed uninspected."],
    v: "Send JSON with duplicate keys, escapes, deep nesting and a payload in a key name, and confirm the firewall inspects the same value the backend uses or rejects the document.",
    dep: ["http-request-parser", "body-size-limits", "parser-differentials"]
  },
  "xml-body-parser": {
    s: "Parses XML bodies for inspection while refusing the features that enable attacks, such as external entities and entity expansion bombs.",
    d: "The parser extracts element names, attribute values and text, and can validate against a schema. It disables or limits document type definitions, external entity resolution and recursive entity expansion, and bounds depth and size. Content such as SOAP or feed endpoints needs it. It is hard because the firewall's own parser is attackable by exactly the payloads it should detect, and because different XML libraries handle namespaces and encodings differently.",
    k: ["Parse fully vs. inspect as text: full parsing exposes structure but is costly and attackable; text inspection is cheap and easily evaded by encodings and entities.", "Reject documents with a document type declaration vs. restrict features: rejecting is safe and breaks some legacy services; restricting is flexible and needs careful defaults."],
    p: ["The firewall's parser resolves an external entity and is used to read files or reach internal hosts.", "An expansion bomb consumes the memory of the inspection worker."],
    v: "Send an external entity reference and a small expansion bomb to a test endpoint, and confirm both are rejected quickly with bounded memory and that no outbound request or file read occurs.",
    dep: ["http-request-parser", "body-size-limits"]
  },
  "multipart-parser": {
    s: "Splits multipart bodies into parts, exposing each field's name and value and each file's name, type and content, according to the boundary rules.",
    d: "The parser finds boundaries declared in the content type, reads each part's headers and body, and handles nested parts, odd whitespace, repeated boundaries and missing terminators. Parts become form fields or file records. It is a traditional bypass point. It is hard because the format is loosely specified and implementations differ on boundary parsing, header folding, quoted names and what to do with data before the first boundary or after the last.",
    k: ["Strict boundary handling vs. lenient: strict rejects malformed bodies safely; lenient matches permissive frameworks and invites differentials.", "Stream parts to disk vs. buffer in memory: streaming bounds memory for large uploads but complicates inspection of file content."],
    p: ["A part with a boundary the firewall does not recognize is ignored and its payload reaches the backend.", "Quoted or encoded field names are parsed differently, so a rule keyed on the field name misses it."],
    v: "Send multipart bodies with odd boundaries, duplicate headers, preamble text and a missing terminator to a test backend, and confirm the firewall's parts equal those the backend sees or the request is rejected.",
    dep: ["http-request-parser", "body-size-limits", "parser-differentials"]
  },
  "body-size-limits": {
    s: "Maximum sizes for the whole body, for non-file content and for each field, with a defined action for requests that exceed them.",
    d: "The engine cannot inspect an unbounded body, so it sets a limit on how many bytes it will buffer and parse. When a request exceeds it, policy chooses: reject, pass the uninspected remainder, or process only the first part. Separate, larger limits usually apply to file uploads. It is hard because limits are an evasion target: padding a request with harmless data until the payload sits past the inspection limit bypasses the rules unless oversize is rejected.",
    k: ["Reject oversize vs. pass the remainder: rejecting closes the padding bypass and blocks large legitimate requests; passing keeps availability and opens a bypass.", "One global limit vs. per-route limits: global is simple; per-route allows large uploads only where needed."],
    p: ["The limit is raised to accommodate a single large upload route and applies everywhere, increasing memory per request.", "The default action passes oversize bodies, so padding past the limit evades all body rules."],
    v: "Send a body just under, just over and well over the limit with the payload after the limit boundary, and confirm each is handled as the policy states and the over-limit payload is not silently passed.",
    dep: ["body-buffering", "decompression-limits"]
  },
  "body-buffering": {
    s: "Holding the request or response body in memory or on disk while rules inspect it, before it is released to the application or the client.",
    d: "Many body rules need the complete body, so the firewall reads it fully, evaluates, and only then forwards it. Buffering adds latency proportional to size and consumes memory per concurrent request, and large bodies spill to disk. Streaming modes inspect chunks as they arrive and forward them earlier, at the cost of weaker rules that cannot see the whole value. It is hard because slow clients can hold buffers open for a long time.",
    k: ["Buffer whole body vs. stream in chunks: buffering gives full context and simple rules but adds latency and memory; streaming is lighter and can miss payloads that span chunks.", "Buffer in memory vs. spill to disk: memory is fast and bounded by RAM; disk handles large bodies at I/O cost."],
    p: ["Many slow clients each hold a large buffer open and exhaust memory.", "A payload split across chunk boundaries is missed by a streaming inspector."],
    v: "Open many concurrent slow uploads and confirm memory use stays within the configured ceiling and excess requests are limited, while a payload spanning a chunk boundary is still detected.",
    dep: ["body-size-limits", "worker-concurrency"]
  },
  "decompression-limits": {
    s: "Rules for bodies compressed by the client, including how far to decompress, how big the result may be, and what to do with nested or unknown encodings.",
    d: "Requests can carry a compressed body or archive. To inspect it, the firewall must decompress it, which attackers abuse with highly compressed bombs. Limits cap the ratio, output size, nesting and encodings supported; beyond those the request is rejected. Response bodies are also decompressed for outbound inspection. It is hard because a small input can expand enormously, and unsupported encodings must be rejected, since they would otherwise pass uninspected.",
    k: ["Decompress and inspect vs. reject compressed request bodies: inspection covers legitimate clients and costs CPU; rejection is simple and breaks them.", "Ratio limits vs. absolute size limits: ratio catches bombs early; absolute size is simpler and predictable."],
    p: ["A small compressed body expands to gigabytes and exhausts memory before limits are checked.", "An unsupported content encoding is passed through and the backend decodes it."],
    v: "Send a compression bomb and a nested compressed body to a test endpoint, and confirm decompression stops at the limit, the request is rejected and memory stays bounded.",
    dep: ["body-size-limits", "http-request-parser"]
  },
  "inline-bridge-mode": {
    s: "A deployment as a transparent device in the network path that passes traffic between two segments, without changing addresses or terminating connections.",
    d: "The firewall sits between the clients and the servers like a network bridge, inspecting packets and reassembling streams. Applications and clients do not change, and it needs no address changes. Because it does not terminate TLS by default, it can inspect encrypted traffic only if given the server keys or placed after decryption. It is hard because it is a single point of failure in the path, needs bypass hardware for failure, and works at a lower layer than the HTTP semantic checks need.",
    k: ["Transparent bridge vs. explicit proxy: a bridge needs no application or DNS change but has limited protocol awareness; a proxy sees full HTTP semantics and requires traffic redirection.", "Hardware bypass on failure vs. fail closed: bypass preserves connectivity and removes protection; fail-closed protects and causes outages."],
    p: ["Encrypted traffic passes through uninspected because keys are not available at the bridge.", "Failure of the device cuts the site off because no bypass exists."],
    v: "Send an attack through the bridge to a test server and confirm it is blocked; then remove power from the device and confirm the documented failure behavior occurs.",
    dep: ["tls-termination", "fail-open-fail-closed", "http-request-parser"]
  },
  "reverse-proxy-mode": {
    s: "A deployment as a server that terminates client connections, inspects each request, and forwards allowed ones to the application on new connections.",
    d: "Clients connect to the firewall's address, which is published in DNS. It terminates TLS, parses HTTP fully, applies policy and opens its own connections to the application servers. It can also cache, compress and balance load. This gives the firewall full control and the best visibility of any mode. The cost is an extra hop, the client address being replaced by the proxy's unless forwarded, and the proxy becoming a capacity bottleneck.",
    k: ["Reverse proxy vs. in-process module: a proxy is isolated from the application and works for any backend but adds a hop; a module has no hop and shares the host's resources and failures.", "Terminate and re-encrypt to the backend vs. plain to the backend: re-encrypting protects the internal link and costs CPU; plain is cheaper and exposes traffic inside the network."],
    p: ["The backend is still reachable directly by its address, so attackers bypass the firewall entirely.", "The application sees every client as the proxy's address and rate limits or logs break."],
    v: "Request the application directly and through the firewall; confirm the direct path is refused from the internet, the proxied path is inspected, and the backend log shows the true client address.",
    dep: ["tls-termination", "upstream-connection-pool", "client-ip-resolution"]
  },
  "edge-deployment": {
    s: "A deployment at a provider's distributed points of presence, where DNS routes traffic through the provider's inspection before it reaches the origin.",
    d: "Traffic is attracted to the edge by DNS or network announcements, inspected near the user, and only clean requests travel to the origin. Scale is large enough to absorb floods and share reputation intelligence across customers. Rules propagate to every location. It is hard because the origin must accept only edge traffic or the edge is bypassed, because rule changes take time to reach all sites, and because the customer trusts the provider with plaintext traffic.",
    k: ["Edge service vs. self-hosted: edge absorbs volumetric attacks and needs no hardware but moves plaintext to a third party and limits custom behavior; self-hosted keeps control and must be scaled by you.", "Global rule propagation speed vs. staged propagation: fast closes exposure quickly but spreads a bad rule worldwide; staged limits damage and delays protection."],
    p: ["The origin address leaks through old DNS records or other services, and attackers connect to it directly.", "A bad rule reaches all locations within seconds and causes a global outage."],
    v: "Confirm the origin refuses connections not from the edge's published ranges or without an edge-presented credential, then send an attack to the public name and confirm it is blocked at the edge.",
    dep: ["tls-termination", "staged-rule-rollout", "client-ip-resolution"]
  },
  "host-module-mode": {
    s: "A deployment as a module loaded into the web server or application process, inspecting requests with direct access to the server's own parsed data.",
    d: "The engine runs inside the server process, hooks into request handling and sees the request as the server has already parsed it, so decoding and parsing differences are small. It needs no extra network hop and no separate hardware. Rules and logs are configured with the server. It is hard because it shares memory, CPU and crashes with the server, and a bug or a costly rule affects the whole web application.",
    k: ["In-process module vs. external proxy: in-process has no hop and the best parser agreement; the firewall's faults become the server's faults.", "Per-server deployment vs. central: per-server scales with the fleet and must be configured everywhere; central is easier to manage and is a shared bottleneck."],
    p: ["A runaway rule consumes the server's worker threads and the site stops responding.", "Servers in the fleet are upgraded at different times and run different rule versions."],
    v: "Deploy a deliberately slow rule in a test environment and confirm the module's time guard aborts it and the server keeps serving; check all servers report the same configuration version.",
    dep: ["rule-compiler", "worker-concurrency", "config-versioning-rollback"]
  },
  "sidecar-mode": {
    s: "A deployment as a small proxy running alongside each application instance, so every service is protected without a shared inspection tier.",
    d: "In container orchestration, the firewall runs in the same pod or host as the service and receives its inbound traffic, often as part of a service mesh data plane. Policy is distributed by a control plane to each sidecar. It gives per-service policy and internal traffic inspection. It is hard because resource cost multiplies by the number of instances, configuration must reach thousands of sidecars consistently, and rules affect internal call latency.",
    k: ["Sidecar per instance vs. shared gateway: per-instance isolates policy and failure and costs CPU and memory everywhere; a gateway is cheaper and concentrates risk.", "Inspect east-west traffic vs. north-south only: east-west catches lateral movement and multiplies load; north-south covers the public entry."],
    p: ["Sidecar resource limits are too low, and inspection is throttled under load.", "Control plane delays leave some sidecars on an old policy after an emergency rule."],
    v: "Update a policy in the control plane and confirm every sidecar reports the new version within the stated time, then send an attack to one service and confirm only that service's sidecar logs it.",
    dep: ["worker-concurrency", "config-versioning-rollback", "management-api"]
  },
  "out-of-band-mirroring": {
    s: "A deployment that inspects a copy of traffic received from a mirror port or log stream, with no ability to block, only to detect and alert.",
    d: "The firewall receives duplicated traffic or access logs and analyzes them off the request path. It adds no latency and cannot break the site, so it suits evaluation, compliance and monitoring. The verdict can trigger actions elsewhere, for example adding a block rule at another device. It is limited by design: attacks are detected after they reach the application, and encrypted traffic needs a decrypted copy.",
    k: ["Out-of-band detection vs. inline blocking: out-of-band has no outage risk and cannot stop an attack; inline stops attacks and is part of availability.", "Mirror of packets vs. application logs: packets have full content and need decryption; logs are easy and miss bodies."],
    p: ["Dropped mirrored packets leave gaps and false confidence that all traffic was seen.", "Alerts arrive after the data has been exfiltrated, and nobody can undo it."],
    v: "Send a known attack and confirm an alert appears with the rule id and client, and verify through the application's logs that the request was processed, as expected in this mode.",
    dep: ["audit-log", "siem-export", "detection-only-mode"]
  },
  "fail-open-fail-closed": {
    s: "The configured behavior of the data path when the inspection engine is unavailable: forward traffic unprotected, or refuse it.",
    d: "Failures include the engine crashing, rules not loading, timeouts, memory exhaustion and a failing health check. The data plane has an explicit setting for each. Fail-open favors availability. Fail-closed favors security. Many operators choose fail-open for the whole site and fail-closed for specific sensitive routes. Alerts and health checks must reflect protection state, not only process state. It is hard because the setting is rarely tested in production.",
    k: ["Open vs. closed by default: open keeps revenue flowing and drops protection exactly when it fails; closed holds protection and risks a full outage.", "Per-failure-type settings vs. one switch: per-type fits each risk but adds modes that need testing."],
    p: ["The firewall is up but has loaded zero rules, and the health check passes.", "Fail-open is triggered by an overload that is itself an attack, so the attack disables the firewall."],
    v: "Induce each failure type in a staging environment, send an attack, and confirm the traffic result matches the configured posture and an alert fires.",
    dep: ["worker-concurrency", "load-shedding"]
  },
  "latency-budget": {
    s: "The allowed time a firewall may add to a request at the median and at the tail, expressed as numbers that every component must fit within.",
    d: "A budget such as a couple of milliseconds at the median and a hard ceiling at the 99th percentile is split among parsing, normalization, rule evaluation and logging. Engines enforce it with cost limits per rule, per-phase time limits, and abort or skip actions when the budget is exceeded. Measurement uses histograms of added time, not averages. It is hard because the tail dominates user experience and is set by rare expensive inputs.",
    k: ["Hard time limit with abort vs. soft target with alerts: a hard limit bounds the tail and requires a failure decision when it hits; a soft target never drops inspection and allows overruns.", "Budget per request vs. per phase: per request is what users feel; per phase makes problems attributable."],
    p: ["Only average latency is measured, hiding the slow requests that matter.", "A time-limit abort passes the request uninspected without logging that it did."],
    v: "Measure added time with and without the firewall using production-shaped load and worst-case inputs, and confirm p50 and p99 stay under the stated budget and aborts are counted in metrics.",
    dep: ["rule-cost-profiling", "regex-timeout-guards", "worker-concurrency"]
  },
  "rule-cost-profiling": {
    s: "Measuring how much time and memory each rule consumes on real traffic, so expensive rules are found, optimized or removed.",
    d: "The engine records per-rule evaluation time and counts, aggregated into a ranked report. A small number of rules usually account for most of the cost, typically broad targets with complex regular expressions. Profiles guide reordering, cheaper prefilters and narrower scopes. It is hard because profiling itself costs time, because costs depend on traffic mix, and because the worst case is not what average traffic exercises.",
    k: ["Always-on sampled profiling vs. on-demand profiling: always-on finds regressions soon at a small overhead; on-demand has no steady cost and misses problems between runs.", "Profile on production traffic vs. a synthetic corpus: production is representative; synthetic is repeatable and includes adversarial inputs."],
    p: ["Profiling uses average time per rule and misses a rule that is rarely invoked and extremely slow.", "A new managed ruleset version doubles cost and nobody compares it with the old."],
    v: "Produce the per-rule cost report on a fixed replay corpus, confirm the top rules account for the expected share of time, and compare before and after a rule change to verify a regression is visible.",
    dep: ["rule-compiler", "operators", "metrics-and-dashboards"]
  },
  "worker-concurrency": {
    s: "How the engine uses threads or processes to inspect many requests at once, including how rule data and counters are shared between them.",
    d: "Common models are a pool of worker processes each with an event loop, or threads sharing an immutable compiled ruleset. The ruleset is read-only so workers share it without locks; mutable state such as counters and caches needs synchronization or per-worker copies. Slow inspection blocks the loop and delays other requests on that worker. It is hard because one expensive request can starve many others, and because memory scales with workers.",
    k: ["Process per worker vs. threads in one process: processes isolate crashes and cost memory; threads share data cheaply and a fault takes down all.", "Offload inspection to a separate pool vs. inline in the event loop: a separate pool protects connection handling and adds handoff cost."],
    p: ["A single slow inspection blocks an event loop and stalls hundreds of unrelated connections.", "Each process holds its own copy of a large compiled ruleset and memory runs out when workers are added."],
    v: "Send one deliberately expensive request concurrent with normal traffic and confirm normal requests' latency stays within budget; check memory per worker against the configured ceiling.",
    dep: ["rule-compiler", "connection-acceptor"]
  },
  "regex-timeout-guards": {
    s: "Limits on how long or how many steps a single pattern match may run, so a crafted input cannot turn a rule into a denial of service.",
    d: "Backtracking regular expression engines can take exponential time on certain patterns and inputs. Guards include step counters, wall-clock limits, input length caps per match, and use of automaton-based engines that run in linear time. When a guard trips, the engine must choose to treat the match as a hit, a miss or an error. It is hard because limits that are too low drop real detections and too high leave the worker exposed.",
    k: ["Linear-time engine vs. backtracking engine with limits: linear time has a guaranteed bound but lacks some features such as back-references; backtracking is expressive and needs limits.", "Treat a tripped limit as a match vs. as no match: match is safe and blocks innocents; no match is lenient and gives attackers a bypass."],
    p: ["A tripped limit is treated as no match, so an attacker deliberately triggers it to bypass the rule.", "A limit applies to the whole transaction and one rule consumes it, so later rules are skipped."],
    v: "Feed a known catastrophic input to each regular-expression rule and confirm the guard aborts within the limit, the worker stays responsive, and the configured result and a log entry are produced.",
    dep: ["operators", "latency-budget"]
  },
  "decision-cache": {
    s: "A short-lived cache of verdicts for repeated requests or clients, so identical or obviously repeated traffic is not re-inspected from scratch.",
    d: "The firewall remembers recent decisions keyed by something stable, such as a client address that was just blocked, a challenge token that was just validated, or a hash of a static asset request. Hits skip most rule evaluation. It cuts cost during floods of repeated attack traffic. It is hard because cache keys must include everything that influenced the verdict, and because stale verdicts survive rule changes unless the cache is invalidated.",
    k: ["Cache verdicts vs. always evaluate: caching saves CPU under floods and risks serving an outdated verdict; always evaluating is correct and costly.", "Cache blocks only vs. allows too: caching blocks protects capacity; caching allows risks letting an attack through that matches a newer rule."],
    p: ["Cached allow entries survive a ruleset update, so a new virtual patch does not apply to cached clients.", "The key omits the policy scope, so a verdict for one application is applied to another."],
    v: "Block a client with a test payload, confirm later requests are answered from the cache at lower cost, then update the ruleset and confirm the cache is invalidated and the new rule is applied.",
    dep: ["worker-concurrency", "config-versioning-rollback", "client-reputation"]
  },
  "load-shedding": {
    s: "Deliberately skipping lower-value inspection or rejecting some traffic under overload, so the firewall degrades predictably rather than collapsing.",
    d: "When queue depth, CPU or latency passes a threshold, the engine takes graduated steps: skip optional checks such as response inspection, reduce the paranoia level, serve cached verdicts only, challenge or rate-limit unknown clients, and finally reject. The order is configured in advance. It matters during attacks, when load and risk rise together. It is hard because shedding reduces protection precisely when it is needed, and needs careful prioritization.",
    k: ["Shed inspection vs. shed requests: shedding inspection keeps the site up and reduces protection; shedding requests protects the engine and refuses customers.", "Automatic thresholds vs. manual operator switch: automatic reacts in time; manual is deliberate and slower."],
    p: ["Optional checks are dropped without a log entry, so no one knows protection was reduced.", "Shedding never recovers because the trigger has no hysteresis, and the firewall flaps between states."],
    v: "Apply a synthetic load beyond capacity and confirm the documented shedding steps occur in order, are logged and counted, and the system returns to full inspection after load falls.",
    dep: ["latency-budget", "fail-open-fail-closed", "paranoia-levels"]
  },
  "connection-acceptor": {
    s: "The listener that accepts client connections, enforces connection-level limits and timeouts, and hands bytes to the TLS and HTTP layers.",
    d: "It manages listening sockets, accept queues, per-address connection caps, and timeouts for headers, bodies and idle connections. These limits stop slow-connection attacks that hold resources open with tiny amounts of data. In front of it, network devices may absorb volumetric floods. It is hard because its limits conflict with legitimate slow clients and shared addresses, and because it is the part directly exposed to the internet.",
    k: ["Short timeouts vs. long: short timeouts defeat slow-read and slow-header attacks but cut off clients on poor networks; long are friendly and exhaust connections.", "Per-address connection caps vs. none: caps limit one client's share but throttle shared gateways."],
    p: ["Slow header attacks hold all connection slots with a few bytes per second.", "Connection caps keyed on the proxy address block many users when a large network is behind one address."],
    v: "Open connections that send one byte at a time and confirm they are closed at the configured timeout and that normal clients still connect at full capacity.",
    dep: ["worker-concurrency"]
  },
  "tls-termination": {
    s: "Ending the encrypted session at the firewall so it can read the plaintext request, and optionally re-encrypting toward the application.",
    d: "The firewall holds the site's certificate and private key, negotiates protocol versions and ciphers, and decrypts traffic. Plaintext is needed to inspect anything. It also records the negotiated parameters for fingerprinting. Keys are stored in protected hardware or a key service where possible. It is hard because the private key becomes a high-value secret on the firewall, certificate renewal must be automatic, and the firewall's TLS configuration defines the site's security.",
    k: ["Terminate at the firewall vs. pass encrypted traffic through: termination gives visibility; passing through keeps the application end to end and leaves traffic uninspected.", "Re-encrypt to the backend vs. plaintext internally: re-encrypting protects internal links and adds CPU; plaintext is simple and exposes data on the internal network."],
    p: ["An expired certificate takes the whole site down because renewal depended on a manual step.", "Weak protocol versions are left enabled for compatibility and downgrade attacks succeed."],
    v: "Connect with a TLS test client and confirm only the intended protocol versions and ciphers are accepted, the certificate chain is valid and not near expiry, and a traffic sample shows plaintext inspected.",
    dep: ["connection-acceptor"]
  },
  "http2-http3-handling": {
    s: "Handling the multiplexed, binary versions of HTTP, converting streams into the same transaction model rules expect, with limits against protocol-level abuse.",
    d: "Newer protocol versions carry many requests on one connection, compress headers, and have their own flow control and framing. The firewall must reassemble each stream into a request, apply the same inspection as for HTTP/1, and cap streams, header sizes and frame rates. Downgrade to the older protocol toward the backend creates a translation step. It is hard because the version-specific attacks, such as rapid stream resets, target the protocol layer below the rules.",
    k: ["Speak the newer protocol to the backend vs. downgrade: speaking it preserves performance; downgrading is simple and opens translation and smuggling issues.", "Strict stream and frame limits vs. permissive: strict defeats resource exhaustion and may limit heavy legitimate clients."],
    p: ["A stream flood exhausts the engine's state because limits apply per connection, not in total.", "Translation to HTTP/1 lets a header value containing a line break create a second request at the backend."],
    v: "Open many streams with rapid resets against a test instance and confirm limits trigger and legitimate streams still work; send a header containing control characters and confirm it is rejected rather than forwarded.",
    dep: ["tls-termination", "http-request-parser", "connection-acceptor"]
  },
  "websocket-streaming": {
    s: "Handling long-lived upgraded connections and streamed bodies, where traffic continues after the initial request and cannot be buffered whole.",
    d: "The handshake is an ordinary request that rules can inspect; afterward, messages flow in frames. Firewalls either pass the stream after checking the handshake, or inspect messages with a smaller rule set and cost limits. Streaming uploads, server-sent events and long downloads also avoid full buffering. It is hard because rules written for complete requests do not apply, state lasts for hours, and per-message inspection multiplies cost.",
    k: ["Inspect handshake only vs. inspect messages: handshake-only is cheap and leaves the session uncontrolled afterward; message inspection covers it at cost and complexity.", "Idle and total lifetime limits vs. none: limits free resources and break long-lived legitimate sessions."],
    p: ["An attack delivered inside a message after a clean handshake is never inspected.", "Connections stay open for days, and counters and logs for them grow without bound."],
    v: "Open a connection with a valid handshake, then send an attack message inside it, and confirm either the message is blocked or the documented limitation is logged; confirm idle connections close at the configured limit.",
    dep: ["connection-acceptor", "body-buffering", "http-request-parser"]
  },
  "client-ip-resolution": {
    s: "Working out the real client address when requests pass through trusted proxies, by reading forwarding headers only from sources that are allowed to set them.",
    d: "When load balancers or edge networks sit in front, the connection's source is the proxy, and the client's address is in a header or a protocol preface. The firewall keeps a list of trusted proxy ranges, walks the forwarding chain from the nearest hop outward, and stops at the first untrusted address. Rate limits, reputation, geolocation and logs all depend on the result. It is hard because the header can be forged by anyone not behind a trusted proxy.",
    k: ["Trust forwarding headers from listed proxies vs. use the socket address: listed proxies give the real client; the socket address is unforgeable and wrong behind a proxy.", "Take the leftmost vs. the rightmost untrusted entry: leftmost is the claimed client and is forgeable; rightmost-untrusted is the first address a trusted proxy actually saw."],
    p: ["The firewall trusts any value of the forwarding header, and attackers set it to evade rate limits or a block.", "The trusted proxy list is stale after infrastructure changes, and all clients appear to come from one address."],
    v: "Send requests with forged forwarding headers directly and through a trusted proxy, and confirm the logged client address is the real one in both cases and a forged value is ignored when it does not come from a trusted hop.",
    dep: ["header-normalization", "connection-acceptor"]
  },
  "upstream-connection-pool": {
    s: "The reused connections from the firewall to the application servers, with health checks, timeouts and limits so one slow backend does not exhaust the proxy.",
    d: "Opening a connection per request is slow, so the firewall keeps persistent connections to each backend, sized and timed out sensibly, and re-encrypts when configured. It marks unhealthy backends, retries safe requests, and forwards the cleaned request with added headers such as the client address and correlation ID. It is hard because a slow backend holds connections and worker capacity, and because reuse of a connection with a request framing error can mix responses between clients.",
    k: ["Reuse connections vs. one per request: reuse is faster and risks cross-request contamination after framing errors; one per request is safe and slower.", "Retry failed requests vs. fail fast: retrying hides blips and can duplicate non-idempotent actions; failing fast is predictable."],
    p: ["A slow backend fills the pool and every request to the site waits.", "A response mismatch on a reused connection delivers one user's response to another."],
    v: "Slow one backend in a test pool and confirm health checks remove it, requests go to healthy backends, and the pool and queue depth stay within configured limits.",
    dep: ["connection-acceptor", "http-request-parser"]
  },
});
