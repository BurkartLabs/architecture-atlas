// Details for the VPN gateway plate, part 3: negotiation and keys, routing and traffic steering.
ATLAS.details("vpn-gateway", {
  "handshake-state-machine": {
    s: "The sequence of messages, timers and retries by which two peers establish, change and tear down a tunnel, with defined states for every message that can arrive.",
    d: "Each tunnel is tracked as a state: initiating, authenticating, established, rekeying, closing. Every message type is valid in some states and not others, and retransmission timers resend lost messages with backoff. Both peers can start an exchange at the same moment, so simultaneous initiation must resolve to one tunnel and not two. The hard part is the volume of edge cases: duplicated, reordered, delayed or forged messages, and a peer that restarts and forgets everything while the other still believes the tunnel is up.",
    k: ["Strict state machine that drops out-of-state messages vs. tolerant handling: strictness rejects forged input, but breaks against peers with minor deviations.", "Initiator and responder roles fixed vs. symmetric: fixed roles simplify logic, but symmetric peers must handle both sides starting at once."],
    p: ["Both sides initiating at once creates two parallel tunnels, and traffic then flows on one while the other expires.", "Unbounded half-open state allows a flood of first messages to exhaust memory."],
    v: "Start both peers simultaneously, drop each third message, restart one peer mid-handshake, and confirm exactly one tunnel ends up established and the stale state on the other side is cleaned up.",
    dep: ["cookie-dos-protection", "cipher-negotiation"]
  },
  "key-exchange": {
    s: "The cryptographic exchange by which two peers compute a shared secret over an open network without ever sending it, using ephemeral public values.",
    d: "Each peer generates a fresh key pair, sends the public value, and combines its private value with the other's public value to reach the same secret. Groups based on elliptic curves are now common for speed and size, and hybrid constructions add a post-quantum component. The result feeds key derivation. Authentication is a separate step that signs the exchange so a man in the middle cannot substitute values. It is hard because group choice, parameter validation and the cost of large public values affect compatibility, performance and fragmentation.",
    k: ["Elliptic curve groups vs. large-integer groups: curves are faster and smaller, but older peers may only support the integer form.", "Classical only vs. hybrid with post-quantum: hybrid protects recorded traffic against future machines, but enlarges messages and adds interoperability risk."],
    p: ["Not validating a received public value allows an attacker to force a weak or predictable shared secret.", "Large post-quantum values push handshake packets over the path size and cause fragmentation failures."],
    v: "Capture a handshake, confirm only public values cross the wire, and confirm two successive handshakes between the same peers produce different shared secrets and different session keys.",
    dep: ["random-number-source", "peer-identity-binding"]
  },
  "cipher-negotiation": {
    s: "Selects the encryption, integrity and key-exchange algorithms from the lists each peer offers, applying the gateway's preference order and refusing weak combinations.",
    d: "The initiator offers algorithm suites, and the responder picks one it supports, normally by its own preference. Modern designs use authenticated encryption that combines confidentiality and integrity, so there are few choices. Gateways keep an allowed list and drop retired algorithms on a schedule. Negotiated parameters are included in the authenticated transcript so downgrade attempts are detected. It is hard because every algorithm kept for old clients is an attack surface, while removing one breaks someone.",
    k: ["Server picks vs. client picks: server preference enforces policy, whereas client preference lets constrained devices choose what they handle fast.", "Many suites for compatibility vs. a short list: many suites connect everything, but keep weaker options available to a downgrade attacker."],
    p: ["Leaving a legacy algorithm enabled for one old device lets an attacker force every connection down to it if the transcript is unprotected.", "Proposal lists that differ slightly between sites cause tunnels that fail with no useful message."],
    v: "Offer only a retired algorithm from a test client and confirm the gateway refuses with a no-proposal-chosen error, and that a normal client's connection log shows the negotiated suite.",
    dep: ["crypto-agility", "handshake-state-machine"]
  },
  "key-derivation": {
    s: "Turns the shared secret and exchanged values into separate keys for each direction and purpose, so no key is reused across encryption, integrity or authentication.",
    d: "A key derivation function takes the exchanged secret, nonces and context labels and expands them into the needed keys: one for each direction of traffic, one for the rekey channel, and values used to authenticate the handshake. Mixing in a pre-shared secret or session identifiers binds the keys to this exchange. Child keys for data tunnels derive from the control channel keys. It is hard because the derivation inputs must match exactly on both sides, and omitting a context value can allow keys from one session to be valid in another.",
    k: ["Separate keys per direction vs. one shared key: separate keys prevent reflecting a peer's packet back at it, at the cost of more state.", "Deriving child keys from the parent vs. fresh exchange: derivation is quick, but compromise of the parent exposes its children unless forward secrecy is added."],
    p: ["Omitting the peer identities from the derivation lets an attacker splice two sessions.", "Reusing a key and nonce pair with a stream cipher exposes the plaintext of both packets."],
    v: "Run two sessions with identical configuration and confirm every derived key differs between them and between directions, and that a one-bit change in either peer's nonce changes all of them.",
    dep: ["key-exchange", "pre-shared-keys"]
  },
  "forward-secrecy": {
    s: "A property ensuring that stealing a long-term key later cannot decrypt past recorded sessions, because session keys came from ephemeral values that were then discarded.",
    d: "Each session's keys come from a fresh exchange whose private values are deleted after use, while long-term credentials only sign and never encrypt. An attacker who records traffic today and obtains the gateway's certificate key next year still cannot read it. Rekeying with a new exchange extends the property inside a long session. It is hard because it only holds if ephemeral values are really erased, session keys are not written to logs or dumps, and resumption features do not reintroduce a reusable secret.",
    k: ["Fresh exchange at every rekey vs. derive from the previous key: a fresh exchange limits exposure from one compromised key, but costs more computation on a busy gateway.", "Strict forward secrecy vs. session resumption tickets: tickets speed reconnects, but the ticket key then protects every resumed session."],
    p: ["Session keys exported for debugging and kept in a log undo the property for every captured session.", "A long-lived ticket encryption key quietly turns a forward-secret design into one with a single point of exposure."],
    v: "Record a session, then give the analyst the gateway's long-term private key and confirm the recording still cannot be decrypted, while the same recording is decryptable only with that session's exported keys.",
    dep: ["key-exchange", "rekeying", "session-resumption"]
  },
  "peer-identity-binding": {
    s: "Cryptographically ties the authenticated identity to the specific key exchange, so a man in the middle cannot relay a valid identity over a tunnel it controls.",
    d: "Each peer signs, or computes a message authentication code over, a transcript that includes both exchange values and its own identity. The other side verifies the signature against the identity's key and checks the identity matches what is expected for that peer. Without this tie, an attacker could forward authentication messages while running separate exchanges with each side. The gateway must also decide which identity it expects from each connection. The hard part is the matching policy: accepting any valid certificate is not the same as accepting the right peer.",
    k: ["Expect a specific identity per peer vs. any identity from a trusted issuer: specific is strong but needs per-peer configuration, whereas issuer-only trust is simple and broad.", "Include the whole transcript vs. only the exchange values: the whole transcript also detects downgrade of negotiated algorithms."],
    p: ["A gateway that authenticates the peer but never checks which peer it was lets a valid-but-wrong site connect as another.", "Leaving the negotiated algorithms out of the signed data permits downgrade attacks."],
    v: "Place a relay between two peers that forwards authentication messages unchanged, and confirm the handshake fails at signature verification instead of establishing a tunnel through the relay.",
    dep: ["certificate-auth", "key-exchange"]
  },
  "cookie-dos-protection": {
    s: "A stateless challenge that makes an initiator prove it can receive replies at its claimed address before the gateway commits memory or expensive computation.",
    d: "Under load or attack, the responder answers a first message with a small cookie computed from the sender's address and a secret, and keeps no state. Only an initiator that repeats the request with the cookie proceeds to the costly key exchange. This defeats floods from spoofed source addresses. Cookies are enabled adaptively when the number of half-open handshakes crosses a threshold. It is hard because the cookie round trip adds latency, large replies could be used for amplification, and the secret must rotate without breaking in-flight clients.",
    k: ["Always require a cookie vs. only under load: always is simple and safe, but adds a round trip for every connection even when idle.", "Short reply to the first message vs. a rich one: small replies avoid becoming an amplification tool, though they carry less negotiation."],
    p: ["A first-message response larger than the request lets an attacker use the gateway to flood a victim.", "Cookie secrets that never rotate let one captured cookie be replayed indefinitely."],
    v: "Flood the gateway with first messages from spoofed addresses and confirm memory use stays flat, handshake cookies are issued, and a legitimate client with a real address still connects within a second.",
    dep: ["handshake-state-machine", "random-number-source"]
  },
  "rekeying": {
    s: "Replaces the keys of a running tunnel before they age out by bytes or time, without dropping traffic, by building a new key set and switching to it.",
    d: "Keys are limited by lifetime in seconds and volume in bytes because ciphers weaken with use and counters must not wrap. Before expiry, one peer starts an exchange that creates a new security association alongside the old one. Once both sides have it, traffic moves to the new keys and the old ones are kept briefly for packets in flight, then deleted. It is hard because both peers may rekey at once, delayed packets arrive under old keys, and a failed rekey must leave the tunnel working until it truly expires.",
    k: ["Rekey with a fresh exchange vs. reuse the old secret: fresh restores forward secrecy, but costs computation spread across many tunnels renewing together.", "Overlap old and new keys vs. hard cutover: overlap avoids loss of in-flight packets, but extends the lifetime of old key material."],
    p: ["Many tunnels created together all rekey together, producing a computation spike every lifetime.", "Rekey failures ignored until hard expiry cause a tunnel to drop at a predictable, repeating interval."],
    v: "Set a one-minute lifetime, send a continuous stream across it, and confirm the logs show a new key set at each interval with no packet loss beyond what the network itself caused.",
    dep: ["key-exchange", "sequence-counters", "security-association-db"]
  },
  "dead-peer-detection": {
    s: "Finds out that the other end has vanished, by sending probes when traffic stops, so stale tunnels are removed and a reconnect can begin.",
    d: "If outbound traffic has been sent but nothing has come back for an interval, the gateway sends an authenticated probe and waits for an answer, retrying several times before declaring the peer dead and deleting the tunnel state. Some designs probe regularly instead. Detection frees the address and routes and allows a client's new attempt to succeed. It is hard because timers trade detection speed against false positives on a lossy link, and because the peer may return after a reboot with no memory of the tunnel.",
    k: ["Probe only when traffic is one-way vs. on a fixed schedule: on demand saves bandwidth, but a quiet tunnel is not tested until something fails.", "Aggressive timers vs. patient ones: aggressive recovers fast on a good link, but tears down tunnels over short mobile signal drops."],
    p: ["Slow detection leaves a stale tunnel holding a user's address while their new connection is refused.", "A probe interval shorter than a carrier's brief outages causes a reconnect storm after each one."],
    v: "Cut the network between peers and confirm the gateway removes the tunnel after the configured detection time, frees the address and logs the reason, and that a restarted peer reconnects at once.",
    dep: ["keepalives", "handshake-state-machine"]
  },
  "traffic-selectors": {
    s: "Define which packets belong in a tunnel by source and destination addresses, ports and protocol, agreed by both ends and checked on every packet in both directions.",
    d: "Each tunnel carries a pair of selector sets, one for local and one for remote traffic. Outbound packets matching them are encrypted into that tunnel, and decrypted inbound packets must match too, or they are dropped. The peers negotiate them and narrow to the overlap. Route-based designs use a permissive selector and let routing decide instead. It is hard because mismatched selectors give silent failure where the tunnel is up and no traffic flows, and because many networks per tunnel multiply the entries.",
    k: ["Policy-based selectors vs. route-based tunnels: selectors express intent in the tunnel itself, whereas route-based lets ordinary routing and dynamic protocols decide.", "Narrow selectors vs. any-to-any with filters: narrow is self-enforcing, but needs renegotiation for every network added."],
    p: ["One side adding a subnet while the other did not leaves the tunnel up but dropping that subnet's traffic.", "Overlapping selectors across two tunnels send the same traffic to whichever one was matched first."],
    v: "Send a packet from an in-selector address and one just outside it, and confirm the first emerges at the far end while the second does not use the tunnel and a drop counter records it.",
    dep: ["security-policy-db", "access-policy-model"]
  },
  "route-table-install": {
    s: "Installs and withdraws the routes that point traffic at the tunnel, on the gateway for client networks and on the client for the networks it should reach.",
    d: "When a tunnel comes up, routes are added to the table for the remote networks, and removed when it goes down. On a client, the routes pushed by the gateway steer applications toward the virtual interface. Metrics decide between competing paths and between a tunnel and a direct route. The gateway may announce client addresses to the internal network so return traffic finds it. It is hard because stale routes outlive a crashed tunnel, and a route to the gateway's own address through the tunnel makes the tunnel carry its own packets.",
    k: ["Static routes per tunnel vs. dynamic announcement: static is simple and predictable, whereas dynamic follows topology changes without edits.", "Routes owned by the VPN process vs. by the system routing manager: owning them gives tight lifecycle control, but can conflict with other software."],
    p: ["A route that covers the gateway's own address sends the encrypted packets back into the tunnel, and the connection loops and dies.", "Routes left in place after an unclean exit black-hole traffic until a reboot."],
    v: "Connect a client, list its routing table and confirm exactly the intended prefixes point at the tunnel interface with the gateway's address excluded. Kill the client abruptly and confirm routes are removed on restart.",
    dep: ["virtual-interface", "traffic-selectors"]
  },
  "split-tunneling": {
    s: "Sends only traffic for designated internal networks through the tunnel and lets everything else go out directly from the client's own connection.",
    d: "The gateway pushes a list of prefixes for the client's routing table. Internet traffic does not pass through the gateway, which saves its bandwidth and the user's latency, and keeps video calls off the corporate link. Variants include excluding specific services from a full tunnel. The cost is that direct traffic is outside the organization's inspection, and a compromised internet-side process on the client can reach the internal network through the tunnel. Inverse and domain-based rules are hard to implement reliably.",
    k: ["Split tunnel vs. full tunnel: split saves gateway capacity and gives better performance, but bypasses monitoring and filtering for most traffic.", "Route by IP prefix vs. by domain name: domains follow cloud services that change address, but depend on the client resolving and tracking them."],
    p: ["An internal hostname resolved by a public resolver leaks the name outside the tunnel.", "Split routing with a client bridging two networks lets the tunnel become a path from the internet into the corporate network."],
    v: "Connect with split tunneling on and confirm a trace to an internal address passes the gateway while a trace to an internet address leaves directly, and that a DNS query for an internal name is answered by internal servers.",
    dep: ["route-table-install", "split-dns"]
  },
  "full-tunnel-redirect": {
    s: "Routes all of the client's traffic through the gateway, so it is inspected and leaves from the organization's address, with an exception for the tunnel's own transport.",
    d: "The client installs a default route through the virtual interface and keeps a specific route to the gateway via its real gateway so the outer packets still leave. All applications then appear to come from the organization, are subject to its filters, and are protected on untrusted networks. It also protects against a hostile local network. The costs are bandwidth and latency through the gateway, and trouble with local resources such as printers, which need a local-network exception.",
    k: ["Redirect everything vs. only internal prefixes: full redirect gives complete inspection and protection on hostile networks, but places all user traffic on the gateway.", "Allowing local network access vs. blocking it: allowing keeps printers working, but lets a hostile local device reach the client."],
    p: ["Forgetting the exception for the gateway's own address loops the tunnel onto itself.", "A full tunnel with a small uplink at the gateway makes video calls unusable for the whole company."],
    v: "Connect in full-tunnel mode, request a public address-reporting page, and confirm it reports the gateway's address while a trace to the gateway itself still leaves by the client's real interface.",
    dep: ["route-table-install", "bandwidth-shaping"]
  },
  "dynamic-route-exchange": {
    s: "Runs a routing protocol across tunnels so sites learn each other's networks and reroute around failures, instead of relying on prefixes typed into configuration.",
    d: "Over a route-based tunnel, gateways run a standard routing protocol that announces local prefixes and learns remote ones. If a tunnel fails, routes through it are withdrawn and traffic moves to another path. Protocol timers are tuned against the tunnel's own failure detection. Route filters stop a site from announcing prefixes it should not. It is hard because a mis-announcement can attract the whole network's traffic, and because routing convergence and tunnel rekey events interact.",
    k: ["Dynamic routing vs. static prefixes: dynamic adapts to failures and growth, but adds a protocol to secure, filter and monitor.", "Routing inside the tunnel vs. outside it: inside keeps routing messages protected, but they are lost when the tunnel is down and cannot help restore it."],
    p: ["Accepting every prefix a branch announces lets a mistake there blackhole traffic for the whole company.", "Routing timers slower than the tunnel's failure detection leave traffic sent into a dead tunnel for minutes."],
    v: "Bring down the primary tunnel between two sites and confirm the learned routes move to the backup path and traffic resumes within the expected convergence time, with the withdrawal visible in the route log.",
    dep: ["site-to-site-tunnels", "route-table-install"]
  },
  "policy-based-routing": {
    s: "Chooses a path by attributes other than destination, such as source user group, application or time, so different traffic classes use different tunnels or exits.",
    d: "Rules match on source address, inner protocol or marking, and select a routing table or next hop. Typical uses are sending a vendor group through a restricted tunnel, keeping latency-sensitive traffic on the best link, or sending selected cloud traffic directly. The rules run before the ordinary route lookup. It is hard because several rule sets interact with selectors and with return paths: traffic must come back the same way it left, or stateful devices on the path drop it.",
    k: ["Rules on the gateway vs. separate gateways per class: rules need one device, whereas separate gateways give clean isolation and simpler failure domains.", "Marking at ingress vs. matching at lookup: marking lets later stages reuse the decision, but marks may not survive encapsulation."],
    p: ["Asymmetric paths that send replies another way make stateful firewalls drop the return traffic.", "Rule order that nobody has documented lets a late addition silently take over traffic from earlier rules."],
    v: "Send traffic from two different groups to the same destination and confirm, from path traces and per-tunnel counters, that each takes the tunnel its policy names, with replies returning on the same one.",
    dep: ["route-table-install", "access-policy-model"]
  },
  "split-dns": {
    s: "Answers internal names from internal resolvers and everything else from public ones, by pushing resolver settings and domain rules to the client at connect time.",
    d: "The gateway tells the client which resolver addresses to use and for which domains. Queries for internal zones go through the tunnel to internal servers, and the rest go to the local network's resolver or a protected public one. Clients handle this differently, and some applications bypass system settings. A name that resolves differently inside and outside, a split-horizon zone, must resolve to the right answer for the path that will be used. It is hard because resolver behavior varies by client, and a mistake leaks internal names or breaks them.",
    k: ["Domain-scoped resolver rules vs. all queries through the tunnel: scoped is efficient and keeps public lookups local, but depends on the client honoring domain rules.", "Internal resolver reached by tunnel address vs. through the gateway as a proxy: direct is simple, but the proxy can hide internal server addresses."],
    p: ["Clients that send the query to every configured resolver leak internal names to the public one.", "A search domain list that differs between client platforms makes short names work for some users only."],
    v: "Connected, resolve an internal-only name and a public name from a test client and confirm from resolver logs that the first was answered only by internal servers and the second never reached them.",
    dep: ["profile-distribution", "split-tunneling"]
  },
  "overlapping-subnet-nat": {
    s: "Translates addresses between sites that use the same private ranges, so two networks that cannot be renumbered can still talk through one tunnel.",
    d: "Each side maps its real addresses into a distinct translated range for the other, either one-to-one for every host or many-to-one for outbound access. The translation happens at the gateway before encapsulation and after decapsulation, and must also rewrite addresses embedded in application payloads. Selectors are written in the translated ranges. It is hard because it hides real addresses from logs and filters, breaks protocols that carry addresses in their data, and makes troubleshooting a matter of keeping two address maps in mind.",
    k: ["One-to-one mapping vs. many-to-one translation: one-to-one allows connections to start from either side, but needs an address range as large as the real network.", "Translate at the gateway vs. renumber one site: translation is quick and non-disruptive, but is a permanent complexity compared with a clean renumbering."],
    p: ["Logs at the destination show translated addresses, so incident responders cannot tell which real host sent the traffic.", "Protocols embedding addresses in their payload fail across the translation unless a helper rewrites them."],
    v: "Connect two sites with identical ranges, ping a host by its translated address, and confirm from the destination's capture that the source shows the translated address and the reply returns to the real originator.",
    dep: ["traffic-selectors", "encap-decap-pipeline"]
  }
});
