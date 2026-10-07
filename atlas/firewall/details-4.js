// Details for the firewall plate, part 4: application identification and inspection, connection tracking.
ATLAS.details("firewall", {
  "protocol-decoders": {
    s: "Parsers that follow a flow's bytes through a protocol's grammar so the firewall can read fields such as commands, hostnames and file names, not just headers.",
    d: "After reassembling the byte stream where needed, a decoder runs a state machine for a protocol and exposes fields to rules, signatures and logs. Decoders also normalize ambiguous encodings so later matching sees what the endpoint will see. They run on untrusted input at high rate. The challenge is fidelity and safety: a decoder that parses differently from the end host creates evasion, and one that fails closed on every unusual but valid message breaks applications.",
    k: ["Full protocol parsing vs header-only matching: parsing enables application-level policy and detection, but costs memory and CPU per flow and expands the attack surface.", "Fail open on unparseable vs fail closed: fail open keeps traffic flowing when the decoder is unsure, while fail closed blocks evasions and legitimate odd clients alike."],
    p: ["A decoder flaw in a privileged process is exploitable remotely by any traffic it inspects.", "Different handling of duplicate or malformed headers than the server lets an attacker hide content."],
    v: "Send valid, truncated and ambiguous messages of a protocol through the device and confirm extracted fields match a reference parser's output for each, with malformed cases handled per the configured behavior.",
    dep: ["flow-table", "fragment-handling"]
  },
  "signature-matching": {
    s: "Matching traffic against known patterns, byte sequences or behavior rules, to identify applications or detect attacks within the data stream.",
    d: "Signatures are compiled into automata that scan reassembled streams or protocol fields, usually matching many patterns at once in a single pass. A match can set an application label, trigger a verdict or raise an alert. Signature sets update frequently from a vendor feed or locally. The hard parts are cost and precision: scanning every byte of every flow limits throughput, patterns split across packets need stream state, and too-general signatures misclassify or block legitimate traffic.",
    k: ["Multi-pattern automaton vs per-signature scan: one pass over the data regardless of signature count, but state tables use large memory.", "Inspect only the first bytes of a flow vs the whole stream: early classification keeps cost low, but misses content that appears later and attacks that start benign."],
    p: ["A signature update with an overly broad pattern blocks business traffic across the whole fleet within minutes.", "Matching only per packet lets an attacker split the pattern across segments."],
    v: "Send a test pattern whole, then split across two segments and out of order, and confirm it is detected in each case; run clean traffic to confirm no false match and measure throughput with the signature set loaded.",
    dep: ["protocol-decoders", "flow-table", "cache-aware-layout"]
  },
  "tls-handshake-inspection": {
    s: "Reading the unencrypted parts of a secure session handshake, such as the server name, version and certificate, to classify and control traffic without decrypting it.",
    d: "The client hello carries the requested server name and supported parameters in clear text, and older protocol versions expose the server certificate. The firewall extracts these, checks them against policy and reputation, and can block by name, version or certificate validity. Newer protocol features that encrypt the hello reduce what is visible. The difficulty is shrinking visibility: encrypted names, session resumption and shared hosting make the name a weak signal, and spoofed names can pass a name-based allow.",
    k: ["Rely on the visible name vs decrypt for full inspection: name checks are cheap and private, but can be forged and are disappearing as handshakes become encrypted.", "Block unknown or invalid certificates vs allow and log: blocking protects users, but breaks internal services with private certificate authorities."],
    p: ["A client names an allowed site in the hello and connects to a different server by address, evading name policy.", "A change to handshake encryption makes the whole name-based policy see nothing overnight."],
    v: "Connect to two named sites, one on a deny list, and confirm the denied one is blocked after the hello with the server name in the log, while the allowed one completes and shows its negotiated version.",
    dep: ["protocol-decoders"]
  },
  "tls-decryption": {
    s: "Terminating and re-establishing encrypted sessions through the firewall so contents can be inspected, using a locally trusted certificate authority and a policy for what to leave alone.",
    d: "For selected flows the device acts as a proxy: it completes the handshake with the server, presents the client a certificate issued by an internal authority that clients trust, decrypts, inspects, and re-encrypts. Exclusions cover categories such as health and banking, pinned applications and mutual authentication. Keys are stored securely. It is hard because it weakens end-to-end security and privacy by design, fails with pinned clients, doubles crypto cost and puts a high-value signing key on the device.",
    k: ["Decrypt selectively by category vs everything: protects privacy and avoids breakage, but leaves encrypted channels uninspected.", "Inline proxy vs key-sharing for passive decryption: inline can block, while passive is non-disruptive and only works with certain cipher choices and server cooperation."],
    p: ["The internal signing key is extracted from the device, letting an attacker impersonate any site to every trusting client.", "Certificate pinning in applications causes failures that look like network outages."],
    v: "Browse a decrypted category and inspect the certificate chain on the client to see the internal issuer; browse an excluded category and see the real chain. Confirm a test pattern inside decrypted traffic is detected.",
    dep: ["tls-handshake-inspection", "flow-table", "hardware-offload"]
  },
  "app-override": {
    s: "A manual rule that assigns a given application label to traffic by address and port, bypassing identification for known or custom applications, for speed and certainty.",
    d: "Administrators define that traffic to a given server and port is application X, and the classifier skips deep inspection for it. This handles proprietary protocols that no decoder knows, and lowers cost for bulk trusted traffic. Policy and logs then treat the flow as X. The challenge is trust: the override asserts identity without checking content, so anything sent to that address and port is permitted as X, including tunneled or malicious data.",
    k: ["Override with a narrow address and port vs rely on detection: narrow overrides are precise and fast, but need upkeep as servers move.", "Skip all inspection for overridden flows vs apply threat scanning anyway: skipping gives throughput, while scanning keeps protection and keeps the cost."],
    p: ["An override on a broad subnet turns a whole range of ports into one trusted application.", "Overrides outlive the server they were written for, and the address is later reused."],
    v: "Create an override for a custom service, send traffic of that service and confirm it is labeled and permitted by the application rule, then send different content to the same port and confirm it is still labeled as the override.",
    dep: ["five-tuple-match", "flow-table"]
  },
  "alg-helpers": {
    s: "Protocol-specific helpers that read control connections which carry addresses and ports in their payload, open the matching data pinholes and rewrite embedded addresses after translation.",
    d: "Protocols like file transfer, call signaling and some tunneling announce data connection endpoints inside the control stream, so a rule on ports alone cannot allow them and NAT would break them. The helper parses the control channel, creates an expected-flow entry for the announced data connection and rewrites embedded addresses to match translation. It works only when the control channel is visible in clear text. The challenge is security: a helper that opens ports on request from the client can be tricked into opening arbitrary ones.",
    k: ["Enable helpers by default vs only when needed: default makes legacy protocols work, but each helper is a parser and a possible exploit and pinhole source.", "Helper rewriting payload vs endpoints that signal their public address: rewriting hides NAT from old clients, while newer protocols avoid it and remove the helper."],
    p: ["A crafted control message makes the helper open a port to an internal host the client could not reach.", "Encrypted control channels leave the helper blind, and the protocol silently fails behind NAT."],
    v: "Run an active-mode file transfer through the device with and without the helper, and confirm only the helper case succeeds, the data pinhole opens for exactly one connection and closes afterward.",
    dep: ["related-flows", "checksum-payload-fixup", "protocol-decoders"]
  },
  "url-dns-filtering": {
    s: "Policy based on the names clients resolve and the web addresses they request, using category databases and custom lists to allow or block destinations by what they are.",
    d: "The device inspects DNS queries and responses, and where decrypted or visible, HTTP request lines and handshake names, then looks the destination up in category and reputation data. Verdicts include allow, block, warn and redirect to a notice page. DNS filtering can also learn the addresses behind a name and apply them to later flows. The challenge is evasion and drift: encrypted DNS and shared content networks hide names, categories misjudge new sites, and cached addresses go stale.",
    k: ["Filter by DNS answers vs by connection-time names: DNS filtering is lightweight and works for any protocol, but is bypassed by direct addresses and encrypted resolvers.", "Local category cache vs live lookup: cache is fast and private, while live lookup is current and adds latency and a dependency."],
    p: ["Clients using an encrypted resolver outside policy never produce visible queries.", "A shared address behind a blocked name also blocks unrelated sites on it."],
    v: "Resolve a blocked name and an allowed one and confirm the first gets the configured sinkhole or error and appears in the log with category, and connecting directly to its address is still handled per policy.",
    dep: ["protocol-decoders", "reputation-feeds"]
  },
  "reputation-feeds": {
    s: "Periodically updated lists of malicious or suspicious addresses, names and certificates from external sources, loaded into the firewall as blocklists or inputs to policy.",
    d: "Feeds arrive over authenticated downloads in simple lists or structured formats. The device validates, deduplicates and loads them into dynamic address groups and name tables, and rules reference them. Entries age out by time. Feeds trade freshness for risk of error. The difficulty is quality and scale: lists contain stale and shared addresses that cause false blocks, large feeds strain memory and update time, and the feed channel is itself an attack path.",
    k: ["Block on a feed match vs log only: blocking stops known threats at once, while logging lets owners tune out false positives first.", "Many feeds vs a few curated ones: breadth catches more, but overlapping low-quality lists increase false positives and memory."],
    p: ["A feed mistakenly lists a major cloud or content network, and the firewall blocks a large share of normal traffic.", "Feed downloads over an unauthenticated channel let an attacker inject entries to block the target's own services."],
    v: "Load a small test feed with one address, confirm connections to it are blocked and logged with the feed name, remove it, and confirm it is unblocked at the next update with no commit required.",
    dep: ["dynamic-address-groups", "incremental-update"]
  },
  "flow-table": {
    s: "The table of active connections, keyed by the packet's identifying fields, holding each flow's state, verdict, translation and counters so later packets skip full policy evaluation.",
    d: "The first packet of a flow is checked against policy; if allowed, an entry is created, usually for both directions so replies match. Later packets are found by lookup and take the stored decision. Entries hold TCP state, timers, byte counts, translation data, application labels and the policy generation. Its size sets how many connections the device can carry. It is hard because it is the most-contended structure in the data path and must tolerate floods of new, never-finishing entries.",
    k: ["Stateful flow lookup vs re-evaluate every packet: flow lookup is fast and permits replies without rules, but memory and state become the failure mode.", "Per-core tables vs one shared table: per-core avoids locks but requires flows to stay on one core, while a shared table tolerates any distribution and contends."],
    p: ["A flood of half-open connections fills the table and blocks legitimate new flows.", "Entries survive a policy change and keep allowing flows the new policy would deny."],
    v: "Open one connection and check that exactly one entry exists with both directions, correct state and counters; close it and confirm the entry ages out within the stated timeout.",
    dep: ["flow-hashing", "timeouts-and-aging"]
  },
  "flow-hashing": {
    s: "The hash function and table structure that find a flow's entry from its address, port and protocol fields quickly and with a balanced distribution across buckets and cores.",
    d: "A hash over the tuple, often symmetric or normalized so both directions find the same entry, indexes into buckets, each holding a short chain or open-addressed slots. The same hash can select the processing core. Resizing, per-bucket locks or lock-free structures manage concurrency. The challenge is adversarial input: a predictable hash lets an attacker craft many flows that collide into one bucket and degrade lookups, so seeds are randomized and chains are bounded.",
    k: ["Symmetric hash for both directions vs separate entries per direction: symmetric keeps replies on the same core and entry, but gives up direction-specific spreading.", "Randomly seeded hash vs fixed: random seeds defeat collision attacks, but make flow placement differ across restarts and failover peers."],
    p: ["Unseeded hashing lets an attacker pile flows into one bucket and stall the core that owns it.", "Hashing after translation sends the reply to a different core than the request."],
    v: "Insert a million random tuples, then report bucket chain lengths, and confirm the longest chain stays within the design bound; verify request and reply of a flow resolve to the same entry.",
    dep: ["cache-aware-layout"]
  },
  "tcp-state-machine": {
    s: "A per-connection model of TCP handshake, established data transfer and closing, which decides whether each segment is valid for its flow and sets the timeout.",
    d: "The entry follows the SYN, SYN-ACK and ACK exchange, established data, and the FIN or RST sequence in each direction, according to what each endpoint is expected to send. A segment inconsistent with the state, such as data before the handshake, is dropped or logged. The state sets timers: short for half-open, long for established. The challenge is that the firewall sees only the middle of the path, so its view of the endpoints' states is inferred and can disagree on loss, retransmission and unusual but legal sequences.",
    k: ["Strict state enforcement vs permissive tracking: strict drops invalid sequences and some attacks, but also breaks legitimate odd stacks and asymmetric paths.", "Track both directions fully vs a simplified model: full tracking is precise and costs memory and CPU, while simple tracking handles load and sees less."],
    p: ["Asymmetric routing sends only one direction through the device, and the strict model drops the connection as invalid.", "Reset segments are accepted without checking their numbers, letting an attacker end a connection."],
    v: "Run a normal connection and capture; confirm state transitions on the device match the packet exchange, then inject a data segment before the handshake and confirm it is dropped and counted as invalid.",
    dep: ["flow-table", "sequence-validation"]
  },
  "sequence-validation": {
    s: "Checking that sequence and acknowledgment numbers fall within the window each endpoint could accept, to reject injected, replayed or out-of-window segments.",
    d: "The entry stores the highest sequence number seen and the advertised window for each direction, along with window scaling learned at handshake. Segments whose numbers fall far outside are dropped. Selective acknowledgments and timestamps need tracking to avoid false rejections. It limits blind injection and reset attacks. The difficulty is correctness under real behavior: window scaling negotiated in a handshake the device never saw, retransmissions and middleboxes that rewrite numbers all break the assumptions.",
    k: ["Tight window check vs loose tolerance: tight rejects more injected segments, while loose avoids dropping real traffic after loss and reordering.", "Learn window scale from the handshake only vs infer later: handshake-only is exact but fails for flows picked up mid-stream, while inference is looser and lets more through."],
    p: ["A flow picked up after a failover without scale information is dropped because its windows look too large.", "A middlebox before the firewall rewrites sequence numbers, and every segment fails the check."],
    v: "Send an in-window and an out-of-window data segment with an otherwise valid tuple on an established flow; confirm the first is forwarded and the second is dropped and counted as out of window.",
    dep: ["tcp-state-machine"]
  },
  "udp-icmp-pseudo-state": {
    s: "Approximate state for connectionless traffic: a request creates an entry, matching replies are allowed for a short time, and related error messages are tied to the flow.",
    d: "UDP has no handshake, so the first outbound datagram creates an entry keyed on the tuple and replies from the reverse tuple are allowed until idle timeout. ICMP echo uses identifier and sequence to pair requests and replies, and ICMP errors carry an embedded copy of the offending packet that is matched to its flow. Timeouts are the only teardown. The challenge is that nothing signals the end: long timeouts keep holes open, and short ones break services with sparse traffic.",
    k: ["Short idle timeouts vs long: short frees entries and closes holes quickly, but breaks quiet sessions that need a refresh packet.", "Allow any reply to the sender's address vs only the exact tuple: any-reply helps peer protocols but opens a hole to arbitrary sources."],
    p: ["A reply-matching rule that ignores source port lets any port on the server send inward.", "Dropping ICMP errors tied to a flow breaks discovery of the path size and leaves connections stalled."],
    v: "Send a datagram out and confirm the reply from the same tuple is accepted while one from a different source port is dropped; confirm the entry expires after the idle timeout and the reply is then dropped.",
    dep: ["flow-table", "timeouts-and-aging"]
  },
  "timeouts-and-aging": {
    s: "The timers that remove flow entries after inactivity or protocol close, tuned per protocol and state, balancing table size against session survival.",
    d: "Each entry has an expiry refreshed by traffic and set by state: seconds for half-open handshakes, minutes for closing connections, hours for established ones, short for datagram protocols. A background process or lazy check on lookup removes expired entries. Timeouts can adapt as the table fills, shortening to reclaim space. The difficulty is that no single value suits all applications, and idle sessions that end silently produce stuck endpoints when the firewall forgets them before they do.",
    k: ["Long established timeout vs short: long keeps idle sessions alive and uses more memory, while short reclaims space and breaks idle connections.", "Adaptive aging under pressure vs fixed values: adaptive keeps the table usable during floods, but quietly breaks legitimate idle flows exactly during stress."],
    p: ["A firewall timeout shorter than an application's keepalive causes sessions to hang with no reset ever sent.", "Aggressive aging during a flood deletes entries for important long-lived sessions along with the attack."],
    v: "Open an idle connection, wait beyond the configured timeout, send data, and confirm it is dropped or reset; repeat with a keepalive and confirm the entry stays, with counters showing the refreshes.",
    dep: ["flow-table"]
  },
  "related-flows": {
    s: "Expected-flow entries created from a control connection or an error message, allowing a specific later connection or reply that no rule would permit on its own.",
    d: "When a helper learns from a control connection that a data connection will follow, or when an ICMP error references an existing flow, the device installs a short-lived expectation for the exact tuple. The first matching packet converts it into a real flow that inherits policy from its parent. Expectations expire if unused. The challenge is precision: too broad an expectation is a hole, and parent policy must carry over correctly, including translation and logging attribution.",
    k: ["Exact-tuple expectations vs wildcarded ones: exact is safe and may fail when the peer chooses a different port, while wildcards work with variation and widen the hole.", "Child flows inherit the parent verdict vs get evaluated on their own: inheritance is simple and consistent, while separate evaluation can apply stricter policy to data."],
    p: ["Expectations never expire when the data connection never starts, and accumulate until the table is exhausted.", "A forged control message creates an expectation toward a host the client had no right to reach."],
    v: "Start a control connection that announces a data port and confirm an expectation with a timeout appears; open the data connection and confirm it becomes a flow linked to its parent, and that other ports are still blocked.",
    dep: ["flow-table", "protocol-decoders"]
  },
  "table-exhaustion-defense": {
    s: "Protections that keep the state table usable under floods: cookies for handshakes, per-source limits, early drop of unvalidated entries and priority for established flows.",
    d: "Floods of spoofed connection attempts try to fill the table with entries that never complete. Defenses include answering handshakes with a stateless challenge so no entry exists until the client proves it can receive replies, limiting new entries per source and zone, using shorter timeouts for unconfirmed entries and evicting them first. The device may switch modes automatically at thresholds. The difficulty is tuning: thresholds too low drop real bursts, and stateless modes lose options negotiated in the handshake.",
    k: ["Stateless handshake challenge vs stateful tracking under attack: challenge costs no memory but drops some options and adds processing, while tracking keeps full fidelity until it runs out.", "Evict unconfirmed entries first vs oldest first: protects established sessions, while oldest-first is simple and kills real connections during floods."],
    p: ["Thresholds tuned for normal load trigger on a product launch and drop legitimate users.", "An attacker with real sources completes handshakes slowly and defeats the unconfirmed-entry logic."],
    v: "Flood the device with spoofed connection attempts at ten times its rate and confirm established sessions continue, new legitimate connections succeed, and counters show challenges issued and entries evicted.",
    dep: ["flow-table", "tcp-state-machine", "connection-limits"]
  },
  "connection-limits": {
    s: "Configured caps on concurrent connections and new connections per second, per source, destination, rule or zone, which contain abuse and runaway clients.",
    d: "Counters track active flows and creation rate per chosen key. When a limit is reached, new flows are dropped, delayed or marked for logging, and existing flows continue. Limits protect servers and the table from one misbehaving host or scan. Keys can be a source address, a rule or a user. The challenge is choosing values: a proxy or NAT gateway legitimately represents thousands of users from one address, and limits must be per key sensibly sized or they cause outages.",
    k: ["Per-source limits vs per-rule limits: per-source contains individual abusers, while per-rule protects a service in aggregate and lets one source take all of it.", "Drop over-limit new flows vs delay them: dropping is simple and immediate, while delaying smooths short bursts and holds resources."],
    p: ["A shared gateway address reaches its per-source cap and blocks every user behind it.", "Counters leak when flows are removed by abnormal paths, so limits trigger on connections that no longer exist."],
    v: "Set a limit of 100 concurrent connections per source, open 150 from one host, and confirm 100 succeed and 50 are refused and counted, while a second host is unaffected.",
    dep: ["flow-table", "rule-ordering"]
  },
});
