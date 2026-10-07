// Details for the intrusion detection plate, part 3: protocol parsing, reassembly, capture.
ATLAS.details("intrusion-detection", {
  "protocol-identification": {
    s: "Determines which application protocol a flow carries, from the first bytes and behavior rather than the port number, and selects the right parser.",
    d: "Attackers and ordinary software run protocols on unexpected ports, so the sensor probes the first payload in each direction against signatures of known protocols, optionally narrowed by port hints. When a protocol is confirmed the flow is tagged and handed to its parser; if detection fails after a few packets the flow is marked unknown. Both directions can disagree. The difficulty is early decisions with incomplete data: identification must happen before enough bytes exist to be certain, and a wrong guess sends traffic to a parser that rejects it.",
    k: ["Port hint first versus content detection first: ports are fast and usually right, while content detection finds disguised or moved services and costs a probe per flow.", "Commit to the first match versus allow reclassification: committing is simple and cheap, while reclassification handles protocol upgrades such as in-session encryption."],
    p: ["A flow tagged unknown is never parsed, so every rule needing a decoded field skips it.", "A protocol that starts as one and upgrades to another, such as a plain session turning encrypted, keeps the old parser."],
    v: "Send an HTTP session to an unusual port and a non-HTTP stream to port 80 and confirm the first is identified as HTTP and parsed, and the second is not, both with an event recording the mismatch.",
    dep: ["flow-table", "tcp-reassembly"]
  },
  "http-parser": {
    s: "Decodes web requests and responses into methods, URIs, headers, bodies and transactions, handling pipelining, chunking and the many ways clients and servers differ.",
    d: "The parser follows the stream, delimiting messages by length headers or chunk markers, associating each response with its request, and exposing fields as buffers. It normalizes the URI, decodes content encodings and tracks keep-alive and upgrade to other protocols. It must handle bad input exactly as the target does, since attackers exploit differences in how duplicate headers, bare line feeds or oversized fields are treated. It is among the most complex parsers because HTTP is so widely implemented and loosely followed.",
    k: ["Lenient parsing versus strict rejection: leniency mimics real servers and keeps detection working on messy traffic, while strict rejection flags anomalies at the cost of missing attacks inside tolerated malformations.", "Buffer the whole body versus stream it: buffering allows simple matching, while streaming caps memory and needs matchers that work across chunk boundaries."],
    p: ["A request split in an unusual way is parsed differently by the sensor and the server, hiding an exploit.", "Unbounded body buffering lets one large upload exhaust sensor memory."],
    v: "Send chunked, pipelined and keep-alive sequences with known contents and confirm each transaction is logged separately with the correct method, URI, headers and response pairing, and an overlong header produces an anomaly event.",
    dep: ["tcp-reassembly", "decompression-normalization", "protocol-identification"]
  },
  "dns-parser": {
    s: "Decodes name lookup messages into queries, answers and records, handling name compression, truncation, zone transfers and transport over both datagrams and streams.",
    d: "The parser walks the message, resolves compression pointers with loop protection, and exposes the query name and type, the answer records with times to live, and response codes. It pairs responses with queries by identifier, address and port, noting unanswered and mismatched ones. Fields feed rules, anomaly models and logs. Hard parts are the details: compression pointers can be crafted to loop, responses can carry mismatched or unsolicited answers, and large responses split across datagrams or move to a stream.",
    k: ["Parse answers fully versus only questions: full answers support domain-to-address mapping and threat matching, while question-only parsing is cheaper and avoids exploit surface in record parsing.", "Pair on identifier alone versus the full tuple: identifier-only pairing is lenient, while the full tuple catches spoofed responses."],
    p: ["A crafted compression pointer causes an infinite loop or out-of-bounds read in a naive parser, turning the sensor into the victim.", "Truncated responses retried over streams are logged twice and confuse analysis."],
    v: "Replay captures of normal, truncated, compressed and malformed responses and confirm all valid ones are decoded to the expected records, malformed ones raise anomalies, and the parser neither hangs nor crashes.",
    dep: ["protocol-identification", "flow-table"]
  },
  "tls-handshake-parser": {
    s: "Decodes the unencrypted opening of encrypted sessions: version, cipher offers, extensions, server name and, where visible, the certificate chain.",
    d: "TLS handshakes begin in the clear, so the parser can extract the client's offered versions and suites, extension list, server name, application protocol choices, and the server's selected parameters and, for older versions, certificates. After the handshake, the rest of the session is opaque except for record lengths and timing. The parser tracks the state, notes version downgrades, resumption and failed negotiations. The challenge is evolution: new extensions and protocol versions change what is visible, and a parser that cannot handle them stops reporting.",
    k: ["Parse only the first flights versus follow the whole session: first flights are cheap and cover most uses, while following later messages sees renegotiation and alerts but needs reassembly.", "Reject unknown extensions versus skip them: skipping keeps parsing working as the protocol evolves, while rejection flags unusual clients."],
    p: ["A new protocol version moves the certificate behind encryption, and certificate rules quietly stop working.", "Handshake messages split across several records or segments are misparsed when reassembly is incomplete."],
    v: "Parse captures from several client libraries and versions and confirm versions, ciphers, extensions and server name are extracted and logged correctly, and a truncated handshake produces an event instead of a crash.",
    dep: ["tcp-reassembly", "protocol-identification"]
  },
  "remote-file-and-rpc-parsers": {
    s: "Decode the protocols used inside networks for file sharing, remote procedure calls and directory access, where much lateral movement happens.",
    d: "Internal protocols carry authentication, file operations, service control and remote execution. Parsers decode message types, commands, share and file names, user identities, and the function being called in a remote procedure call, including calls that create services or read credentials. They track multiplexed requests on one connection and extract transferred files. Detections cover reconnaissance, credential theft and spread. The difficulty is volume and complexity: these protocols are chatty, have long histories of variants, and much of the real traffic is legitimately administrative.",
    k: ["Detect on specific calls versus on volumes of activity: call-level rules are precise for known techniques, while volume rules need baselines to separate admin work.", "Sensor placement inside the network versus at the perimeter: internal placement sees lateral movement, but a perimeter sensor never does."],
    p: ["A sensor at the network edge sees none of this traffic, and a lateral-movement rule set is deployed with no effect.", "Signed or encrypted sessions hide the commands, leaving only connection metadata."],
    v: "Run a remote service creation and a file copy between two lab hosts and confirm the sensor logs the call name, share, file and user, and a rule on service creation fires only for the first.",
    dep: ["tcp-reassembly", "protocol-identification", "file-extraction"]
  },
  "decompression-normalization": {
    s: "Reverses the encodings that hide content from matchers: compression, percent escapes, character sets, redundant path segments and mixed case, producing one canonical form.",
    d: "Attackers encode payloads in many equivalent ways. Normalization decodes percent-encoding and character encodings, resolves path traversal segments, removes redundant whitespace and comments where the receiver would ignore them, and decompresses bodies encoded with common algorithms within size and ratio limits. Rules then match the canonical form. It must follow what the target would do, not what is neat. The difficulty is bombs and ambiguity: small compressed data can expand enormously, and different applications decode the same bytes differently.",
    k: ["Normalize for the likely target versus keep several forms: one canonical form is fast and simple, while matching multiple interpretations catches ambiguity at higher cost.", "Limit decompression by size and ratio versus unlimited: limits stop compression bombs but let oversized hidden payloads pass."],
    p: ["A compression bomb expands a few kilobytes into gigabytes and exhausts memory.", "Decoding twice when the target decodes once creates a match on content the target never sees."],
    v: "Send an attack payload as plain, percent-encoded, double-encoded and compressed bodies and confirm the rule fires on the forms the target accepts, and a bomb is stopped at the limit with an event.",
    dep: ["memory-pools"]
  },
  "file-extraction": {
    s: "Reassembles files transferred over web, mail and file-share protocols from the stream, storing them or hashing them for analysis and matching.",
    d: "As a parser sees a body that is a file, the extractor assigns it a name, type from content rather than extension, and size, and writes the bytes to disk, or feeds a hash and signature scanner as they arrive. Handling gaps from lost packets is explicit, so the extractor knows when a file is incomplete. Extracted files can be submitted to a scanner or sandbox. Limits on size, type and total disk apply. The hard part is volume and safety: a sensor on a busy link sees terabytes of files, and stored malware must not be executable by accident.",
    k: ["Extract all files versus selected types: all files maximize evidence but need large storage, while selected types are affordable and miss unexpected formats.", "Hash on the fly versus store then analyze: on-the-fly needs no disk but only supports hashes, while stored files allow deeper analysis at greater cost."],
    p: ["Extracted files stored with their original names and permissions can be opened or run by an analyst's tool.", "Packet loss produces silently truncated files whose hashes never match known samples."],
    v: "Download a test file in several protocols and confirm each is extracted with correct type, size and hash equal to the source, and one with a deliberately dropped packet is flagged incomplete.",
    dep: ["http-parser", "tcp-reassembly", "local-storage"]
  },
  "parser-anomaly-events": {
    s: "Events the parsers raise when input is malformed, inconsistent or unsupported, which both explain missed detections and flag attempts to exploit parser bugs.",
    d: "Parsers continue as far as they can and emit an event stating the problem: truncated message, invalid length, unknown version, resource limit hit or conflicting data. Each carries the flow and a code. The events are logged and optionally alerted. They serve two roles: exploit traffic often violates protocols, and a rising count of events on a flow means the sensor's view of it is incomplete. The hard part is meaning: events from broken but harmless software are far more common than from attacks, and must be separable from evasion attempts.",
    k: ["Alert on every anomaly versus count and report: alerts catch evasion quickly but are noisy, while counts show trends without drawing attention to each event.", "Continue parsing after an error versus stop for the flow: continuing keeps detection partly working, while stopping avoids misleading results but blinds the sensor."],
    p: ["Resource-limit events ignored for months hide that large bodies are never inspected.", "A parser anomaly treated as noise includes the one malformed message that was an exploit."],
    v: "Send a set of deliberately malformed messages and confirm each produces one event with the right code, and that the aggregate counter by code is visible in sensor metrics.",
    dep: ["runtime-metrics", "detection-event"]
  },
  "flow-table": {
    s: "The sensor's table of active conversations, keyed by endpoints and protocol, holding state, counters and pointers to stream and parser data for each.",
    d: "Every packet is looked up by a hash of its five-tuple, with both directions mapping to one entry. The entry stores protocol state, byte and packet counts, the detected application, reassembly buffers, markers set by rules and the timestamp of last activity. Lookup must be fast and lock-free where possible, usually per thread. Memory per flow times the number of flows bounds the table. It is hard under attack: a flood of unique flows exhausts the table, and eviction has to pick victims without letting an attacker erase their own state.",
    k: ["Per-thread tables versus a shared table: per-thread tables avoid locks and rely on consistent flow-to-thread hashing, while a shared table handles asymmetric paths at a cost of contention.", "Fixed preallocated memory versus dynamic growth: preallocation gives predictable behavior and a hard limit, while dynamic growth adapts and can run the machine out of memory."],
    p: ["Hash functions not symmetric for both directions split one conversation across two entries.", "A scan with spoofed sources fills the table and forces eviction of long-lived legitimate flows."],
    v: "Open a million flows from a generator and confirm table size stays within its limit, lookup latency is flat, eviction counters report what was dropped, and an established long-lived flow survives.",
    dep: ["memory-pools", "flow-timeouts-eviction"]
  },
  "ip-defragmentation": {
    s: "Rebuilds IP packets that were split into fragments, applying the same rules for overlaps and ordering as the destination host, before higher layers see them.",
    d: "Fragments arrive out of order, duplicated or overlapping. The sensor collects them per datagram identifier, keeps their offsets in a list, and when a full set is present, produces a single packet. Limits on fragments per datagram, total memory and time prevent exhaustion. Overlapping fragments with different data are resolved by a policy matching the target operating system, such as favoring the first or the last. Attackers use fragmentation to hide a pattern across pieces, which is why different targets need different policies.",
    k: ["One global policy versus per-target policy: global is simple, while per-target matches each host's behavior and needs knowledge of what the hosts run.", "Defragment fully before inspection versus inspect fragments individually: full reassembly sees what the target sees, while per-fragment is cheap and misses split patterns."],
    p: ["Using the wrong overlap policy lets an attacker send one version for the sensor and another for the host.", "Unlimited fragment buffering allows a flood of incomplete datagrams to consume memory."],
    v: "Send a known exploit split into fragments, in order, shuffled and with conflicting overlaps, and confirm the rule fires according to the configured policy and that incomplete datagrams time out and free memory.",
    dep: ["packet-decoding", "overlap-policy", "memory-pools"]
  },
  "tcp-reassembly": {
    s: "Reconstructs the byte stream of each TCP direction from segments, handling reordering, retransmission and gaps, and delivers ordered data to parsers and rules.",
    d: "For each direction, the reassembler keeps segments ordered by sequence number in a buffer, delivers contiguous data to consumers in chunks, and discards data already acknowledged by the receiver. It must account for retransmissions with different data, window limits, missing segments the sensor never saw, and out-of-window data. Matching proceeds on the stream, not on individual packets. The difficulty is the gaps and the memory: a missing segment may be a sensor drop or an attacker's trick, and each flow needs a buffer.",
    k: ["Reassemble as the target does versus a single interpretation: target-faithful policies defeat overlap tricks but need per-host knowledge, while one policy is simpler and evadable.", "Deliver data only after acknowledgment versus on arrival: waiting for acknowledgment matches what the receiver accepted, while eager delivery detects sooner and may match data the target discards."],
    p: ["Memory per flow is large enough that a few thousand idle connections with gaps exhaust the stream budget.", "Gaps from dropped capture packets are treated as missing data in the stream and stop all later matching."],
    v: "Send an exploit split across segments, delivered shuffled with a retransmission carrying different bytes, and confirm the matched stream equals what the target host reassembled, and a stream gap is counted.",
    dep: ["tcp-state-tracking", "overlap-policy", "flow-table", "memory-pools"]
  },
  "tcp-state-tracking": {
    s: "Follows each connection through the handshake, data transfer and closing, deciding which packets are valid, which are out of window and which are probes or evasion.",
    d: "The tracker keeps per-flow state: the handshake stage, sequence and acknowledgment windows for both directions, flags, window scaling and timestamps. It validates each packet against the state and marks invalid ones, such as data before the handshake, resets with out-of-window numbers or acknowledgments for unsent data. Packets the target would ignore must not be fed to detection. Joining a connection mid-stream is allowed when the sensor starts after it began. The challenge is fidelity to real stacks, which differ in what they accept.",
    k: ["Strict validation versus pickup of mid-stream connections: strict state rejects forged packets and loses connections that began before the sensor, while permissive pickup keeps visibility with less protection.", "Trust resets versus require valid sequence numbers: trusting resets is simple, while validation prevents forged resets from ending flows only in the sensor's view."],
    p: ["A forged reset accepted by the sensor ends tracking while the target keeps the session, so later attack data is never inspected.", "A sensor that sees only one direction cannot validate acknowledgments and drifts out of sync."],
    v: "Replay captures of normal sessions, mid-stream pickups, and sessions with out-of-window resets and confirm states match a reference stack, invalid packets are counted, and the forged reset does not end inspection.",
    dep: ["flow-table", "packet-decoding"]
  },
  "overlap-policy": {
    s: "The setting that decides, for overlapping or conflicting fragments and segments, which version of the data the sensor believes, matching the operating system of the target.",
    d: "When two pieces claim the same bytes with different contents, hosts differ on the winner: some keep the first, some the last, others use rules about offsets. The sensor holds a policy per target, chosen by address range, which says how to resolve conflicts in defragmentation and stream reassembly. Policies are named for the families of systems they imitate. Hard part: knowing the target. Policies come from configuration or passive operating system detection, and when wrong, the sensor sees different bytes than the host.",
    k: ["Per-address policy versus one default: per-address matches targets and needs maintenance, while a default is easy and exposed to targeted evasion.", "Alert on any conflicting overlap versus resolve silently: alerting exposes evasion attempts since benign overlaps are rare, but noisy on faulty networks."],
    p: ["Policy tables not updated after a server operating system change leave a window for evasion.", "Silent resolution hides that a conflicting overlap occurred at all."],
    v: "Send overlapping segments carrying different content to two targets configured with different policies and confirm the sensor's reassembled bytes equal what each real target received, and a conflict event is logged.",
    dep: ["sensor-configuration"]
  },
  "tunnel-decapsulation": {
    s: "Unwraps traffic carried inside other packets, such as virtual network encapsulation, generic tunnels and layered labels, so detection sees the inner flow.",
    d: "Data centers, carriers and VPN-like links wrap packets in outer headers. The decoder recognizes known encapsulations, strips the outer layers and processes the inner packet as its own flow, remembering the tunnel identity so alerts name both. Nested tunnels up to a limited depth are handled. Without this, all traffic in a tunnel looks like one flow between two gateways. The difficulty is variety and cost: many encapsulations exist, each adds parsing work, and malicious tunnels created by attackers can nest many layers to hide traffic or waste resources.",
    k: ["Decode all tunnel types versus only expected ones: all types maximize visibility, while a limited set reduces parser surface and cost.", "Treat inner flows as independent versus tied to the tunnel: independent flows are simple, while linking keeps context for attribution across tunnel endpoints."],
    p: ["Tunnel depth unlimited allows a packet that is wrapped dozens of times to consume large amounts of CPU.", "Alerts report only the outer gateway addresses and cannot be traced to the real endpoints."],
    v: "Send a known exploit through one, two and three levels of tunnels and confirm each alert names the inner endpoints with the tunnel identifier, and a packet beyond the depth limit raises a counted event.",
    dep: ["packet-decoding", "flow-table"]
  },
  "flow-timeouts-eviction": {
    s: "The rules for removing flows: idle timeouts per protocol and state, closed-connection cleanup, and what to drop first when memory runs low.",
    d: "Each flow has a timeout depending on state: short for half-open attempts, longer for established sessions, shorter for closed ones, and different for connectionless protocols. A timer wheel or sorted list finds expired flows cheaply. Under memory pressure the table enters an emergency mode: shorter timeouts, then eviction of the least useful flows, such as unestablished and unidirectional ones. Evicted flow state is gone, so later packets start a new, incomplete flow. The difficulty is balance: short timeouts drop quiet but real sessions; long ones allow tables to fill.",
    k: ["Aggressive emergency timeouts versus refusing new flows: shortening keeps new traffic inspectable, while refusing preserves existing state at the price of not seeing new connections.", "Per-protocol timeouts versus one value: per-protocol values fit real behavior and need tuning, while one value is simple and either wastes memory or evicts live flows."],
    p: ["Timeouts shorter than a real application's idle period break stateful rules for long-lived but quiet sessions.", "An attacker waits just past the timeout, so the next packet is treated as a new unknown flow."],
    v: "Open sessions, leave them idle past each timeout and confirm removal at the expected times, then fill the table and verify emergency eviction removes unestablished flows first and increments the evicted-flows counter.",
    dep: ["flow-table", "time-synchronization"]
  },
  "tap-and-span-input": {
    s: "The physical or switch-based source of the traffic copy: a network tap, a mirror port or a packet broker delivering a duplicate of the monitored link.",
    d: "A passive tap sits in the cable and copies both directions to monitor ports without electrical dependence on the sensor. A mirror port on a switch copies selected ports or VLANs, subject to the switch's capacity. A broker aggregates several sources, filters, load-balances and deduplicates. The sensor's input port is configured to receive only, with no address. The difficulty is completeness: switches can drop mirrored frames when oversubscribed, two directions may arrive on separate ports, and encapsulation added by the source may confuse decoding.",
    k: ["Hardware tap versus switch mirror: a tap is complete, passive and costs hardware per link, while mirroring is free and can silently drop frames and alter timing.", "Aggregate through a broker versus direct connection: a broker allows filtering, sharing among sensors and deduplication, but adds a device that can fail or alter packets."],
    p: ["An oversubscribed mirror port drops traffic during peaks, and the sensor shows no loss.", "Both directions arriving on separate interfaces are processed as two unrelated one-way flows."],
    v: "Send a counted stream through the link and confirm the sensor's received packet and byte counts match the sender's within tolerance in both directions, including at peak rate.",
    dep: ["nic-receive-path"]
  },
  "nic-receive-path": {
    s: "The network adapter and its driver as the entry point for packets: receive queues, interrupt handling, buffer descriptors and the hand-off to the operating system or sensor.",
    d: "The adapter writes frames by direct memory access into buffers described by a ring, and signals the host by interrupt or by polling. Modern adapters split traffic into several queues by a hash of the flow, each processed by a separate core. Settings such as ring size, interrupt moderation, flow hash fields and offloads affect loss and latency. The challenge is that defaults suit general servers: small rings, coalesced interrupts and merged segments all cause drops or wrong views for a sensor.",
    k: ["Interrupt-driven versus polling reception: interrupts save power at low rate, while polling avoids overhead under load and burns cores continuously.", "Many hardware queues versus one: many queues scale across cores and need symmetric hashing for flow affinity, while one is simple and a single-core bottleneck."],
    p: ["A small default receive ring overflows during microbursts and drops packets before the sensor sees them.", "Hashing that treats the two directions of a flow differently delivers them to different cores."],
    v: "Send traffic at line rate with bursts, read the adapter's own statistics, and confirm zero missed or overrun frames, that both directions of a test flow land on one queue, and that ring size matches the plan.",
    dep: ["os-tuning", "offload-handling"]
  },
  "kernel-bypass-capture": {
    s: "A capture method that maps adapter buffers straight into the sensor's memory, avoiding the operating system's network stack and its per-packet overhead.",
    d: "Instead of copying each packet through the kernel's protocol stack, the sensor receives access to the adapter's rings, either through a polling driver in user space or through a kernel facility that exposes packets in shared memory. It processes batches without interrupts and without per-packet system calls, and hands buffers back when finished. This is how line rate is reached at ten gigabits and above. The cost is that the interface is dedicated to the sensor and normal tools no longer see it, and each hardware family needs a supported driver.",
    k: ["User-space polling driver versus kernel shared-memory capture: user-space is fastest and dedicates the device, while the kernel facility keeps the device usable and costs some speed.", "Zero-copy versus copying into sensor buffers: zero-copy is fastest but holds adapter buffers while the sensor works, while copying frees them quickly at higher cost."],
    p: ["Holding zero-copy buffers too long starves the adapter of free buffers and causes drops.", "A dedicated interface is no longer visible to monitoring tools that run on the host."],
    v: "Run a line-rate generator for an hour through the capture path and confirm received count equals sent count, CPU per core stays below the limit, and drop counters read zero.",
    dep: ["nic-receive-path", "ring-buffers", "memory-pools"]
  },
  "ring-buffers": {
    s: "Fixed-size circular queues in shared memory that hand packets from capture to processing threads without locks and without copying more than necessary.",
    d: "A producer writes packet descriptors into slots and advances a head; one consumer reads and advances a tail, so no lock is needed. Rings exist between the adapter and the driver, between kernel and sensor, and between capture threads and workers. Size sets how much burst can be absorbed. When a ring is full, new packets are dropped at that point, so each ring must have its own drop counter. The difficulty is sizing and memory ordering: too small drops during bursts, too large wastes cache, and incorrect ordering corrupts packets under load.",
    k: ["Large rings versus small: large rings absorb bursts and add latency and cache pressure, while small rings stay hot in cache and drop sooner.", "One ring per consumer versus a shared one: per-consumer rings avoid contention and need correct distribution, while a shared ring balances load and contends."],
    p: ["A ring with no drop counter loses packets without any record.", "A consumer that stalls fills the ring and causes drops that look like network loss."],
    v: "Pause a consumer for a controlled time under known traffic and confirm the ring drop counter equals the expected packet count, and that normal operation has zero drops with correct packet contents.",
    dep: ["memory-pools", "drop-accounting"]
  },
  "capture-filters": {
    s: "Rules applied early to discard traffic the sensor should not analyze, such as trusted bulk transfers or its own management traffic, before it consumes processing.",
    d: "A filter expression, evaluated in the kernel, adapter or broker, drops packets by address, port, VLAN or protocol so that they never enter the sensor. Typical exclusions are encrypted backup streams, video, and known high-volume trusted services. Filters sit before the engine, so what they discard can never alert. They are a performance tool with a security cost. The difficulty is staleness and breadth: a filter written for a performance problem three years ago may exclude a subnet that now holds sensitive systems.",
    k: ["Filter early in hardware versus late in software: early filtering saves the most work and is limited in expressiveness, while late filtering is flexible and has already spent the cost.", "Exclude trusted bulk traffic versus inspect it at lower depth: exclusion is simple, while reduced inspection keeps some visibility, such as headers and connection logs."],
    p: ["A permanent exclusion for a busy host leaves a blind spot attackers can use by routing through that host.", "Filter syntax differences between layers cause a filter to apply in the wrong place."],
    v: "Apply a filter excluding one test host, send matching and non-matching traffic, and confirm the excluded host's packets never reach the engine, and that the filter and its purpose are listed in the sensor's inventory.",
    dep: ["hardware-filtering", "sensor-configuration"]
  },
  "packet-timestamping": {
    s: "Attaches an accurate time to each packet at the earliest practical point, so events can be ordered, correlated across sensors and replayed faithfully.",
    d: "Timestamps can be taken by the adapter hardware as the frame arrives, by the driver on receipt, or by software later. Hardware stamps are most accurate and independent of host load; software stamps drift with queueing and interrupt delay. The clock is synchronized to a reference. Timing features, timeouts, rate thresholds and cross-sensor correlation all depend on it. The hard part is consistency: stamps from different sensors or sources must be comparable, and a clock step backwards breaks timeouts and ordering.",
    k: ["Hardware versus software timestamps: hardware stamps are precise and need adapters supporting them, while software stamps are universal and include queueing delay.", "Packet time versus wall-clock time for logic: packet time makes replay deterministic, while wall-clock time is simpler for live use and misbehaves when the sensor lags."],
    p: ["Using processing time for timeouts makes a lagging sensor expire flows early and misjudge rates.", "A clock stepped by correction software moves backwards and produces negative durations."],
    v: "Send packets with known spacing and confirm recorded intervals match within the stated accuracy, and that two sensors capturing the same link agree on each packet's time within the specified bound.",
    dep: ["time-synchronization", "nic-receive-path"]
  },
  "packet-decoding": {
    s: "Parses the link, network and transport headers of each frame into a structured packet, validating checksums and lengths and detecting malformed or truncated input.",
    d: "The decoder peels layers in order: link framing and labels, network headers including options and extension headers, and transport headers. It checks lengths against the captured size, flags invalid fields, and records offsets for later layers. Checksums are verified or deliberately ignored, since offloading means captured packets often carry unfinished ones. Results go to defragmentation, flow lookup and detection. The challenge is robustness: decoders face deliberately corrupted input at wire speed and must neither crash nor mis-sized read, nor treat unvalidated data as trusted.",
    k: ["Verify checksums versus ignore them: verification discards corrupted and forged packets as the target would, while ignoring avoids false drops when offload leaves them blank.", "Decode lazily versus fully up front: lazy decoding saves time for packets filtered early, while full decoding gives later stages one consistent structure."],
    p: ["A decoder that trusts a length field reads past the buffer on a crafted packet.", "Offloaded checksums mark every packet invalid, and the sensor drops all of its traffic."],
    v: "Feed a corpus of valid, truncated and fuzzed packets and confirm valid ones decode to correct fields, invalid ones raise a decode event with a reason, and the decoder never crashes or reads out of bounds.",
    dep: ["packet-timestamping", "memory-pools"]
  },
});
