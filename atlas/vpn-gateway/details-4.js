// Details for the VPN gateway plate, part 4: NAT traversal, tunnel protocols and the packet path.
ATLAS.details("vpn-gateway", {
  "nat-detection": {
    s: "Discovers during the handshake whether an address translator sits between the peers, by comparing the addresses each side sees with the ones it believes it has.",
    d: "Each peer sends hashes of the source and destination address and port as it sees them. The receiver computes the same hashes from the packet's actual header. A mismatch means a translator rewrote the address on the path, and tells which side it is on. Detection switches the tunnel to a form that survives translation. It is hard because translators vary: some change only the address, some the port, some expire mappings in seconds, and some have layered translation at both the home and the carrier.",
    k: ["Detect in the handshake vs. always assume translation: detection avoids overhead on clean paths, but always-on encapsulation is simpler and has fewer states.", "Hash comparison vs. a reflexive address service: hashes need no extra infrastructure, while a reflector also reveals the public address and port."],
    p: ["A translator that rewrites the address inside payloads confuses a detection scheme that does not hash the right fields.", "Detection run once at connect misses a network change that adds translation later in the session."],
    v: "Place a translator between a client and gateway and confirm the handshake log reports translation detected on the client side and the session then uses the encapsulated form, while a direct session reports none.",
    dep: ["handshake-state-machine", "udp-encapsulation"]
  },
  "udp-encapsulation": {
    s: "Wraps encrypted packets in an ordinary datagram header so address translators and firewalls, which understand only simple transports, will pass and track them.",
    d: "When translation is detected, protocol-number-based tunnel packets that translators cannot map are carried inside datagrams on a known port, with a small marker so the receiver can tell tunnel data from handshake messages on the same port. The header adds overhead, which shrinks the usable inner packet. Many modern tunnel protocols use datagrams natively and need no extra wrapper. The hard parts are the added size, per-packet cost, and sharing a port between control and data traffic without ambiguity.",
    k: ["Datagram wrapper always vs. only when needed: always gives one code path and fewer surprises, but pays the overhead on clean paths.", "Port shared with handshake vs. separate port: sharing needs fewer firewall openings, but requires a reliable marker to tell the two apart."],
    p: ["Forgetting the extra header in size calculations produces packets that exceed the path and vanish.", "Networks that rate-limit or block unfamiliar datagram traffic make the tunnel work for some users and not others."],
    v: "Capture on the outer interface behind a translator and confirm tunnel data appears as datagrams on the expected port with the marker, and measure that the inner packet size is reduced by the header length.",
    dep: ["esp-tunnel-mode", "mtu-discovery"]
  },
  "keepalives": {
    s: "Small periodic packets sent through an idle tunnel to keep translator mappings and firewall state from expiring, so the other end can still reach the client.",
    d: "Translators drop a mapping after a quiet period that may be as short as thirty seconds for datagrams. The client sends a tiny packet at an interval shorter than that, which refreshes the mapping and lets the gateway send to it at any time. The gateway may also probe. Interval choice depends on the shortest timeout on the path, which is unknown. It is hard because short intervals cost battery and mobile data, and long ones lose the mapping so inbound traffic is dropped until the client next sends.",
    k: ["Short fixed interval vs. adaptive probing: fixed is easy and reliable, whereas adaptive saves power by finding the longest working interval, at the price of a few lost mappings.", "Keepalive from client only vs. both sides: client-only is enough for the mapping, but both sides also help detect a dead peer."],
    p: ["A keepalive interval longer than a carrier's mapping timeout leaves the phone unreachable for incoming traffic until it next sends.", "Aggressive keepalives on a phone drain the battery and keep the radio awake."],
    v: "Leave a tunnel idle behind a translator with a short mapping timeout and confirm that with keepalives the gateway can still reach the client after ten minutes, and without them it cannot.",
    dep: ["udp-encapsulation", "dead-peer-detection"]
  },
  "port-floating": {
    s: "Moves handshake and data traffic from the standard port to a translation-friendly one once a translator is found, and tracks the changed source port afterward.",
    d: "The first exchange uses the well-known port. After detection, both peers switch to a second port, so a translator that treats the first port specially no longer interferes. The gateway then identifies the peer by its tunnel identifier and not by its source address and port, because both can change when the mapping is renewed. Keeping the connection state keyed by identifier rather than address is the key design point. It is hard because the gateway must accept packets from a new source without opening itself to spoofing.",
    k: ["Identify peers by tunnel identifier vs. by source address: identifier survives remapping, but then each packet must be authenticated before the address is updated.", "Floating to a second port vs. staying on one: a second port avoids special handling by some devices, but needs another opening in firewalls."],
    p: ["Updating a peer's address on any packet that claims its identifier lets an attacker redirect the tunnel.", "A firewall allowing only the first port leaves floated tunnels failing after the switch."],
    v: "Force a mapping change mid-session by restarting the translator and confirm the gateway updates the peer's address only after an authenticated packet arrives from the new source, and traffic then continues.",
    dep: ["nat-detection", "security-association-db"]
  },
  "tcp-fallback": {
    s: "Carries the tunnel over a stream connection, often on the standard secure web port, when datagram traffic is blocked by a restrictive firewall or proxy.",
    d: "The tunnel's packets are framed inside a TLS-protected stream to the gateway, which looks like ordinary web traffic to the network. It passes where datagrams do not, such as hotel and corporate guest networks. It has a cost: carrying a reliable stream inside another reliable stream means a lost packet stalls everything behind it and retransmissions occur at two levels, producing slow, bursty throughput. It is hard to avoid that interaction, so it is a fallback, not the preferred path.",
    k: ["Stream fallback vs. no fallback: fallback gets users connected from locked-down networks, but delivers poor performance that generates support requests.", "Same port as the web service vs. a dedicated port: sharing passes more networks, but needs the gateway to sort tunnel connections from web requests."],
    p: ["Nested retransmission turns a one percent packet loss into a collapse of throughput for every flow in the tunnel.", "Inspecting proxies that terminate TLS break the tunnel unless the client trusts, or avoids, the proxy."],
    v: "Block datagram traffic at a test firewall and confirm the client falls back to the stream transport within the configured timeout, shows the active transport in its status, and still reaches internal resources.",
    dep: ["tls-based-tunnel", "protocol-selection"]
  },
  "relay-rendezvous": {
    s: "Helps two peers that are both behind translators find each other and connect directly, or relays their traffic through a public server when that fails.",
    d: "Peers register with a rendezvous service that tells each the other's public address and port. They send packets toward each other at the same moment, creating mappings that let the packets through, which is called hole punching. Some translators refuse this, so a relay forwards the encrypted traffic as a fallback. The relay sees only ciphertext. It matters in mesh and peer-to-peer designs, less for classic gateways. It is hard because success depends on the translator types on both sides, and the relay becomes a bandwidth cost.",
    k: ["Direct paths with relay fallback vs. always relayed: direct is faster and cheaper to run, but needs the rendezvous logic and is not always possible.", "Self-run relays vs. none: relays guarantee connectivity, but must be sized for the worst case where nothing connects directly."],
    p: ["Symmetric translators defeat hole punching, so a design with no relay leaves some pairs unable to connect at all.", "A relay that is overloaded looks like a slow tunnel and is rarely monitored separately."],
    v: "Connect two clients behind different translators and confirm from counters whether traffic flows directly or via the relay, then block direct paths and confirm the session continues over the relay.",
    dep: ["nat-detection", "mesh-topology"]
  },
  "protocol-selection": {
    s: "Decides which tunnel protocol serves each client and site, based on what the client supports, what the network allows and what the policy requires.",
    d: "A gateway often offers several: a standards-based suite for built-in clients and site links, a TLS-based tunnel that passes through restrictive networks, and a lightweight datagram protocol for speed. The client tries them in a preferred order with timeouts, or is told which to use. The choice affects overhead, performance, battery use and which networks work. It is hard because each protocol has its own configuration, its own failure modes and its own logs, so every one that is enabled multiplies operational work.",
    k: ["Many protocols vs. one: many cover every client and network, but multiply testing, patches and attack surface.", "Client chooses by trying in order vs. gateway directs it: trying adapts to the network automatically, while direction gives predictability at the cost of a failing choice."],
    p: ["Long timeouts between fallback attempts make the connection feel broken for half a minute.", "An old protocol left enabled for one legacy client remains reachable by everyone."],
    v: "From a client on an open network confirm the preferred protocol is selected, and from a network blocking it confirm the next one is chosen automatically, with the selected protocol shown in the connection log.",
    dep: ["esp-tunnel-mode", "tls-based-tunnel", "modern-udp-tunnel"]
  },
  "esp-tunnel-mode": {
    s: "The standards-based approach of encrypting whole inner packets inside a new outer packet with its own header and addresses, widely built into operating systems and routers.",
    d: "The inner packet is encrypted and authenticated as the payload of an encapsulating packet that carries a security index and a sequence number, with new outer addresses of the two gateways. A separate control protocol negotiates the keys. Because it is a network-layer standard, it works for any inner protocol and is supported by hardware. It uses its own protocol number, so translators need special handling, which is why it is usually wrapped in datagrams. It is hard because of its many options and the interoperability gaps among them.",
    k: ["Tunnel mode vs. transport mode: tunnel mode hides the inner addresses and suits gateways, whereas transport mode saves a header and suits host-to-host links.", "Standards-based suite vs. a simpler newer protocol: the standard is everywhere and offloadable, but is large and has many knobs to misconfigure."],
    p: ["Mismatched lifetimes or proposals between vendors give tunnels that come up and drop at every rekey.", "Without datagram encapsulation, the protocol is dropped by many translators."],
    v: "Capture on the outer interface and confirm packets carry the security index, a rising sequence number and only ciphertext, and decrypting with the negotiated key reveals the expected inner header.",
    dep: ["security-association-db", "encap-decap-pipeline", "udp-encapsulation"]
  },
  "tls-based-tunnel": {
    s: "A tunnel built on the standard secure transport, used by user-facing remote access because it passes through most firewalls and works with existing certificate and identity infrastructure.",
    d: "The client opens a secure connection to the gateway on the standard web port, authenticates, and then exchanges inner packets framed inside it, sometimes also using a datagram variant of the same security protocol for better performance. It runs in user space and needs no kernel support on the client. It reuses certificate checks and session features of the secure transport. It is hard because the reliable-stream form has poor behavior on lossy links, and because the client and server often depend on large libraries.",
    k: ["Stream transport vs. datagram transport: streams pass any firewall, but datagrams avoid the double retransmission and head-of-line blocking.", "User-space client vs. kernel integration: user space is portable and easy to update, but is slower and needs more copying."],
    p: ["A large library dependency in the tunnel client makes every transport-library vulnerability a VPN vulnerability.", "Accepting old protocol versions for compatibility exposes the tunnel to known downgrade attacks."],
    v: "Connect from a network that allows only the standard web port, confirm the session establishes, and measure throughput on a link with one percent loss to see the stream form's reduced rate against the datagram form.",
    dep: ["certificate-auth", "tcp-fallback", "virtual-interface"]
  },
  "modern-udp-tunnel": {
    s: "A compact datagram tunnel with a small fixed set of modern algorithms, a short handshake and peers identified by public key, designed to be fast and simple to audit.",
    d: "Each peer has a key pair and a list of the public keys it accepts together with the inner addresses allowed for each. A single handshake of two messages establishes keys, which rotate frequently. There is no algorithm negotiation: the suite is fixed, and changing it means a new protocol version. The tunnel is silent to unauthenticated packets, so it does not answer scans. It is hard because the minimal design leaves user management, address assignment and policy to other tools, and the lack of negotiation means upgrades are coordinated.",
    k: ["Fixed algorithms vs. negotiation: fixed removes downgrade attacks and code, but a break in one algorithm needs a new version rolled out everywhere.", "Peers identified by key vs. by certificate: keys are simple and small, but there is no built-in expiry, revocation or hierarchy."],
    p: ["Treating the list of accepted keys as a user directory leaves no record of who holds a key once staff leave.", "Static keys with no expiry remain valid forever unless someone removes them by hand."],
    v: "Establish a tunnel, confirm a packet from an unlisted key gets no reply at all, and confirm that removing a peer's public key from the allowed list ends its ability to send within one handshake interval.",
    dep: ["key-exchange", "virtual-interface", "secure-key-storage"]
  },
  "layer2-bridged-tunnel": {
    s: "Carries Ethernet frames, not just IP packets, so remote machines appear on the same local segment and broadcast-based protocols work across the tunnel.",
    d: "The virtual interface is a bridge port or a frame-level device. Frames, including broadcasts and non-IP protocols, are encrypted and forwarded to the remote end, where they appear on the local segment. This supports legacy applications that rely on discovery by broadcast. The cost is that broadcast and unknown-destination traffic crosses the wire, bridging loops become possible, and the larger inner frame uses more of the path size. It is hard to run at scale, and most designs prefer routed tunnels.",
    k: ["Bridged frames vs. routed packets: bridging supports broadcast-dependent software, but spreads a failure domain across sites and wastes bandwidth.", "Gateway as bridge member vs. as a router with relay of selected broadcasts: bridging is complete, whereas the router form limits what leaks."],
    p: ["A bridging loop between two sites floods both networks and brings them down within seconds.", "Broadcast chatter from many remote machines saturates a slow uplink."],
    v: "Connect a remote machine and confirm it obtains an address from the local server by broadcast and appears in the local segment's address table, with a counter showing the broadcast volume crossing the tunnel.",
    dep: ["virtual-interface", "mtu-discovery"]
  },
  "site-to-site-tunnels": {
    s: "Permanent tunnels between gateways that join two or more networks, with both ends configured in advance and traffic from any host on either side using them without client software.",
    d: "Two gateways authenticate each other with certificates or shared secrets, establish a tunnel that is kept up or brought up by traffic, and route the sites' prefixes through it. The hosts behind each gateway are unaware. Redundant tunnels across two links provide failover. Addresses on both sides must not overlap unless translated. It is hard because both ends must have matching selectors, lifetimes and algorithms, and because a gateway that is behind an address translator or has a changing address needs special identity handling.",
    k: ["Always-up tunnels vs. on-demand: always-up gives fast first packets and early failure detection, but holds state for idle sites.", "Two tunnels over separate links vs. one: two cost more and need path selection, but one failed link no longer cuts the site off."],
    p: ["Only one end initiating after a failure leaves the tunnel down when that end is the one that restarted.", "A site with a dynamic public address needs its identity set by name, and otherwise the peer rejects it after each change."],
    v: "Ping from a host in one site to a host in another and confirm the packets are encrypted on the outer link; then pull one physical link and confirm traffic moves to the second tunnel within the target time.",
    dep: ["esp-tunnel-mode", "traffic-selectors", "active-passive-failover"]
  },
  "mesh-topology": {
    s: "The arrangement of tunnels among many sites: a hub that all branches connect to, a full mesh of direct tunnels, or a hybrid that creates direct links on demand.",
    d: "In hub-and-spoke, each branch has one tunnel to a central gateway and branch-to-branch traffic passes through it, which is simple but concentrates load and delay. A full mesh needs a tunnel for each pair, which grows with the square of the sites. Dynamic designs begin through a hub and create a direct tunnel when two branches talk. Each choice needs matching routing. It is hard because configuration, key distribution and failure behavior change with the shape, and so does the number of tunnels to monitor.",
    k: ["Hub-and-spoke vs. full mesh: a hub is simple to manage and inspect, but adds a hop and a bottleneck; a mesh gives the shortest paths at far higher configuration cost.", "Dynamic direct tunnels vs. static ones: dynamic scales, but adds a signaling mechanism and more states to troubleshoot."],
    p: ["A hub that fails takes down every branch-to-branch path at once.", "Mesh sizes beyond a few dozen sites make hand-configured tunnels the main source of outages."],
    v: "With three branches on a hub design, trace branch-to-branch traffic and confirm it traverses the hub; enable direct tunnels and confirm the second trace skips the hub with a lower latency.",
    dep: ["site-to-site-tunnels", "dynamic-route-exchange", "multi-site-orchestration"]
  },
  "virtual-interface": {
    s: "The software network device that represents the tunnel to the operating system: packets routed into it are encrypted, and decrypted packets appear from it as if from a real link.",
    d: "The device has an address and an interface size, and shows up in the routing table like a real interface. A packet sent to it is passed to the tunnel process or kernel module, which encrypts and sends it. Received and decrypted packets are injected into the stack as if arriving on that interface. Route-based designs use one interface per tunnel or one per gateway. It is hard because the interface boundary decides where firewalling, accounting and size limits apply, and because per-client devices do not scale to thousands of sessions.",
    k: ["One interface per tunnel vs. one shared by all clients: per tunnel gives isolation and simple policy, but costs memory and management at scale.", "Kernel device vs. user-space device: kernel is faster, whereas user space is portable and easier to isolate."],
    p: ["Interface size that is not reduced for tunnel overhead causes oversized packets that are fragmented or dropped.", "Forgetting to filter on the interface exposes the gateway's own services to clients."],
    v: "Bring up a tunnel, send a ping to the remote address, and confirm the packet counters on the virtual interface rise on both ends and the interface's size is lower than the physical link's by the overhead.",
    dep: ["network-stack-hooks", "packet-io-driver"]
  },
  "security-association-db": {
    s: "The table of active tunnels' cryptographic state: keys, algorithms, sequence numbers, lifetimes and peer addresses, looked up for every packet by a security index.",
    d: "Each tunnel direction has an entry holding the keys, the cipher, the replay window, byte and time counters, and the outer addresses. Inbound packets carry an index that locates the entry directly in a hash table; outbound ones find it through the policy table. Entries are created by the negotiation process, expire on lifetime, and are replaced on rekey. It is hard because lookups must be fast and lock-light on many cores, while the table must also be updated safely while packets use it.",
    k: ["Index in the packet vs. match on addresses and ports: an index gives a constant-time lookup and survives address changes, but needs unique allocation.", "Per-core copies of the table vs. a shared table with locks: copies avoid contention, but updates must reach every copy consistently."],
    p: ["Deleting an entry while packets are still in flight causes drops or use of freed keys.", "Index values chosen predictably let an attacker probe for valid tunnels."],
    v: "Establish many tunnels, then dump the table and confirm one entry per direction with matching lifetimes, and confirm that after a rekey the old entry disappears after its grace period.",
    dep: ["rekeying", "sequence-counters"]
  },
  "security-policy-db": {
    s: "The ordered rules that decide, for each outbound packet, whether to encrypt it into a tunnel, let it pass or drop it, and for each inbound packet whether it was allowed to arrive protected.",
    d: "Rules match on addresses, ports and protocol, as in the traffic selectors, and name an action and the tunnel to use. Outbound lookup happens before encryption; inbound lookup after decryption checks that the packet matched a rule for the tunnel it came in on, which stops one peer injecting traffic for another's range. Lookups run for every packet, so the table uses compiled structures. It is hard because rule order and overlap change behavior, and because large tables slow the fast path.",
    k: ["Check inbound against policy vs. trust the tunnel: checking prevents peer spoofing across tunnels, but costs a lookup per packet.", "Linear rule list vs. compiled lookup structure: a list is simple to reason about, but slow beyond a few hundred rules."],
    p: ["Skipping the inbound policy check lets a compromised site send packets with another site's addresses.", "A catch-all rule above specific ones swallows traffic intended for other tunnels."],
    v: "Send from a peer a packet with a source address outside its negotiated selectors and confirm it is decrypted but dropped by the inbound policy check, with the drop counter recording the reason.",
    dep: ["traffic-selectors", "security-association-db"]
  },
  "encap-decap-pipeline": {
    s: "The per-packet sequence that encrypts and wraps outbound packets, and unwraps, verifies and decrypts inbound ones, with a defined order of checks and drops.",
    d: "Outbound: match policy, pick the tunnel, build the headers, increment the counter, encrypt and authenticate, add outer headers, send. Inbound: validate the outer header, find the tunnel by index, check the replay window, verify and decrypt, check the inner packet against policy, forward. The order of the checks matters: cheap rejections first, expensive crypto after cheap checks, and no decryption of unauthenticated data. It is hard because this is the hottest code in the gateway, and tiny changes affect throughput and security together.",
    k: ["Authenticate then decrypt vs. decrypt then verify: verifying first rejects forgeries without handing attacker-chosen data to the decryptor, which is the safer order.", "Batch processing vs. one packet at a time: batching amortizes cost, but adds a small latency and complicates error handling."],
    p: ["Doing the replay check after the expensive decryption lets a flood of old packets burn CPU.", "Inner-packet errors reported back to the sender leak information about internal addresses."],
    v: "Inject a corrupted packet, a replayed packet and an out-of-policy packet, and confirm each is dropped at its intended stage with the matching counter incremented and none reaches the virtual interface.",
    dep: ["security-association-db", "security-policy-db", "anti-replay-window", "virtual-interface"]
  },
  "anti-replay-window": {
    s: "A sliding record of recently seen sequence numbers that lets the receiver reject duplicated or very old packets while tolerating normal reordering.",
    d: "Each tunnel direction carries an increasing sequence number. The receiver keeps the highest value seen and a bitmap of the last few hundred or thousand below it. A packet inside the window is accepted once and marked; a packet below it, or already marked, is dropped. The check runs after authentication so forged packets cannot move the window. It is hard because heavy reordering from multicore senders or multipath can exceed the window and drop good packets, and a larger window costs memory.",
    k: ["Large window vs. small window: large tolerates reordering from parallel paths, but needs more memory and per-flow state.", "Strict ordering vs. a window: strict is simplest but drops any reordered packet, which is common on the internet."],
    p: ["Advancing the window on unauthenticated packets lets an attacker push it ahead and make all real traffic look old.", "A sender splitting one tunnel across cores can reorder beyond the window and cause random loss."],
    v: "Capture a valid packet and send it again, and confirm the duplicate is dropped with the replay counter incremented; then deliver packets out of order within the window and confirm all are accepted.",
    dep: ["sequence-counters", "encap-decap-pipeline"]
  },
  "sequence-counters": {
    s: "The per-direction numbers that increase with every packet, used both for replay protection and, in many ciphers, as part of the nonce that must never repeat under one key.",
    d: "The sender increments a counter for each packet and includes it, in full or truncated, in the header. Some designs use extended counters of sixty-four bits where only the low part is sent, and the receiver reconstructs the rest. Because a repeated nonce can destroy the security of the cipher, the counter must never wrap or reset under one key, so the tunnel must rekey before it nears the limit. It is hard to maintain across cores and across failover, where a replicated counter may lag.",
    k: ["Counter per tunnel with a lock vs. per-core ranges: a lock is simple but contended; ranges scale but complicate the replay window.", "Rekey well before wrap vs. at the limit: early is safe, but increases the number of handshakes."],
    p: ["After failover the standby resumes from an old counter and reuses nonces under the same key.", "A counter reset on process restart with the same keys repeats nonces."],
    v: "Force a tunnel to a counter near its limit in a test and confirm a rekey completes before it wraps, with a log entry showing the trigger, and no nonce repeated in a capture of the transition.",
    dep: ["security-association-db", "rekeying"]
  },
  "mtu-discovery": {
    s: "Works out the largest inner packet that fits through the tunnel without fragmenting, accounting for the encapsulation overhead and the path's own limit.",
    d: "The inner size equals the path limit minus the added headers, trailer, padding and authentication tag, which differ by protocol and cipher. The virtual interface is set to that size, and path discovery uses messages from routers that report a too-large packet. The gateway should also relay such messages for inner packets back to the sender. It is hard because those messages are often filtered, so senders never learn the limit and large transfers stall while small packets work, which is the classic tunnel symptom.",
    k: ["Set a conservative fixed interface size vs. rely on discovery: fixed is robust against filtered messages, but wastes some capacity on paths that could carry more.", "Clear the do-not-fragment bit vs. honor it: clearing lets the gateway fragment and succeed, but fragments are slower and often dropped."],
    p: ["Blocked path messages create black holes where logins work and large downloads hang.", "Overhead computed for one cipher is used for another and leaves packets a few bytes too large."],
    v: "Send packets of increasing size with the do-not-fragment bit set through the tunnel and confirm the largest successful size equals the path limit minus the computed overhead.",
    dep: ["packet-size-budget", "udp-encapsulation"]
  },
  "fragmentation-handling": {
    s: "Splits or reassembles packets that are too large for the path, deciding whether to fragment before encryption or after, and handling fragments that arrive in the tunnel.",
    d: "If an inner packet will not fit after overhead, the gateway can fragment it before encrypting, so each fragment is encrypted and sent as a whole packet, or let the outer packet fragment, so the receiver must reassemble before it can decrypt. The first is preferred because reassembly of outer fragments is expensive and fragile. Inbound fragments need policy matching, which is difficult since only the first carries port information. It is hard because fragments are a classic route to evading filters and exhausting memory.",
    k: ["Fragment before encryption vs. after: before keeps each fragment independently decryptable and cheaper, whereas after hides the inner sizes but needs reassembly.", "Reassemble in the gateway vs. forward fragments: reassembly allows full inspection, but needs a buffer that attackers can try to exhaust."],
    p: ["Outer fragments dropped by a network device make large packets disappear while smaller ones pass.", "An unbounded reassembly buffer is a memory exhaustion vector."],
    v: "Send a packet larger than the tunnel's inner limit with fragmentation allowed and confirm it arrives intact, with the capture showing independently encrypted fragments and the reassembly buffer back to zero.",
    dep: ["mtu-discovery", "security-policy-db"]
  },
  "mss-clamping": {
    s: "Rewrites the maximum segment size in connection setup packets so stream connections choose segments that fit the tunnel and never need fragmentation.",
    d: "The gateway looks at connection-opening packets passing through and lowers the advertised segment size to the tunnel's inner limit minus the transport headers. Both endpoints then send segments that fit. This works around filtered path-discovery messages for the most common traffic, though not for datagram traffic. It must be applied in both directions and adjusted for the address family. It is hard because it modifies user packets, and a miscalculated value either wastes capacity or leaves some packets oversized.",
    k: ["Clamp on the gateway vs. rely on endpoints: clamping works for every client with no changes, but touches user traffic and can be bypassed by other transports.", "Clamp to a computed value vs. a safe round number: computed is efficient, whereas a round number is robust to future overhead changes."],
    p: ["Clamping only one direction fixes uploads while downloads still stall.", "Datagram-based applications are unaffected and still fail at large sizes."],
    v: "Capture a connection opening through the tunnel and confirm the segment size option is lowered to the expected value on both setup packets, and that a large download then completes without fragments.",
    dep: ["mtu-discovery", "virtual-interface"]
  }
});
