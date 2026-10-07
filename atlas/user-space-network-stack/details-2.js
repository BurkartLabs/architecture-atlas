// Details part 2: TCP & datagram transport, IP & link layers.
ATLAS.details("user-space-network-stack", {
  "connection-state-machine": {
    s: "Tracks each connection through its states, from listening and handshake to established and closing, and decides what every arriving segment or application call does next.",
    d: "Each connection is a compact control block holding state, sequence numbers, windows, timers and queue pointers. An incoming segment is matched to its block through the flow table, validated against the window, and applied to the state machine, which may produce acknowledgments, data for the application, or a reset. Control blocks are sized and laid out to fit a few cache lines because millions may be live. The challenge is exact compliance with corner cases: simultaneous opens and closes, out-of-window segments, and reset handling, all of which real peers exercise.",
    k: ["Compact control block vs. rich per-connection state: compact blocks keep millions of connections cache-friendly, but leave less room for features such as detailed per-connection statistics.", "Strict standards compliance vs. a fast-path subset: the full machine interoperates with everything, while a subset is faster and fails on unusual peers."],
    p: ["Mishandling a segment that arrives for a state the code never anticipated leaves connections half-open and leaking memory.", "Sequence-number comparison written without wraparound arithmetic breaks after four gigabytes on a long-lived connection."],
    v: "Run a protocol conformance suite and a long-duration interoperability test against several unrelated peer stacks, and confirm no connection is left in an unexpected state and control blocks return to the pool after teardown.",
    dep: ["flow-table", "timer-wheel", "packet-buffer-pools"]
  },
  "segmentation-reassembly": {
    s: "Cuts outgoing byte streams into segments sized for the path and puts incoming segments, which may arrive out of order or duplicated, back into the correct byte sequence.",
    d: "On send, application data is chunked to the maximum segment size, often delegated to the card. On receive, in-order segments go straight to the application's queue; out-of-order ones are held in a reassembly structure keyed by sequence number until gaps fill, then released together. Overlaps and duplicates are trimmed. The hard parts are memory and attack resistance: an unbounded out-of-order buffer lets a sender consume the pool, and overlapping segments are a classic trick to confuse monitors.",
    k: ["Holding out-of-order data in buffers vs. dropping it: holding saves a retransmission and bandwidth, but ties up pool memory that a hostile peer can exhaust.", "Linked list vs. interval tree for gaps: lists are cheap for the usual one or two gaps, while trees keep worst-case cost bounded under heavy reordering."],
    p: ["Accepting overlapping segments without a consistent rule lets different bytes reach different observers of the same stream.", "Per-connection reorder limits missing means one slow-loss peer can hold thousands of buffers."],
    v: "Send a stream through a path that reorders and duplicates one segment in ten and confirm the application receives exactly the original bytes while peak reassembly memory stays under the configured per-connection cap.",
    dep: ["connection-state-machine", "chained-buffers", "packet-buffer-pools"]
  },
  "retransmission": {
    s: "Resends data not acknowledged in time, using a timeout computed from measured round-trip times and earlier triggers from duplicate acknowledgments or selective feedback.",
    d: "Each sent segment stays in a send queue, referencing its buffer, until acknowledged. A retransmission timer estimates the round trip with smoothing and backs off exponentially on repeated failure. Faster recovery triggers on three duplicate acknowledgments or on selective acknowledgment blocks, and newer variants use time-based loss detection. The challenge is timer cost at scale and not retransmitting needlessly: a spurious resend wastes bandwidth and confuses the congestion estimate, while a late one stalls the connection.",
    k: ["Time-based loss detection vs. duplicate-acknowledgment counting: time-based works for short flows and reordering, but needs accurate clocks; counting is simple and misreads reordered paths as loss.", "Keeping buffers referenced until acknowledged vs. copying for the send queue: referencing is copy-free, but pins pool memory until the peer responds."],
    p: ["A retransmission timer rearmed on every acknowledgment instead of when the oldest data changes produces needless timer churn.", "A retransmitted buffer modified by the application after submission sends different data than the original."],
    v: "Drop one packet in a hundred on a test link and confirm the transfer completes with byte-exact data, the retransmission count is close to the drop count, and recovery uses duplicate-ack or time-based triggers rather than timeout most of the time.",
    dep: ["timer-wheel", "connection-state-machine", "buffer-lifetime", "clock-source"]
  },
  "congestion-control": {
    s: "Adjusts how much data a connection may have in flight, probing for bandwidth and backing off on loss or delay so the stack shares the path fairly and does not collapse it.",
    d: "A per-connection algorithm keeps a congestion window and updates it on every acknowledgment and loss signal. Loss-based variants grow steadily and cut sharply on drops; delay-based and model-based ones estimate bandwidth and round-trip time and aim for a smaller queue. In a data center a variant reacting to explicit congestion marks keeps queues short. The difficulty is that the stack's speed removes the kernel's natural pacing: bursts of line-rate segments overflow shallow switch buffers, so congestion control needs pacing and must be chosen for the network it runs in.",
    k: ["Loss-based vs. delay- or mark-based control: loss-based fills queues and coexists with legacy traffic; delay- or mark-based keeps latency low but can lose share to aggressive flows.", "Pluggable algorithms vs. one built in: pluggable lets operators match the network, at the cost of a per-ack indirect call and a testing matrix."],
    p: ["Sending a full window as a line-rate burst overruns switch buffers and causes loss that congestion control then misreads as a path limit.", "Algorithms tuned in a lab collapse when the real path has deeper buffers or competing flows."],
    v: "Run a transfer across a bottleneck link with a competing flow and confirm the stack's throughput converges near its fair share, queue delay stays within the algorithm's target, and no synchronized loss bursts appear.",
    dep: ["retransmission", "packet-pacing", "flow-control-windows"]
  },
  "flow-control-windows": {
    s: "Limits the data a sender may transmit to what the receiver has space for, advertising a window that shrinks as the application falls behind and reopens as it reads.",
    d: "The receiver advertises how many bytes it can accept, derived from free space in its receive queue. The sender stops when its in-flight data fills that window. Window scaling extends the field to cover high bandwidth-delay paths. Zero-window conditions are probed periodically. Auto-tuning sizes buffers to the measured path. The difficulty is memory: a large window per connection multiplied by many connections can exceed the packet pool, and a small window caps throughput below link speed.",
    k: ["Large fixed receive buffers vs. auto-tuned buffers: fixed is simple and may waste pool memory on idle connections; auto-tuned uses memory in proportion to need and takes time to ramp.", "Advertising the window based on pool headroom vs. per-connection space only: pool-aware avoids global exhaustion, but couples connections that should be independent."],
    p: ["A window advertisement that shrinks by silly small amounts causes tiny segments and wasteful traffic.", "A receiver that stops reading holds buffers indefinitely, draining the pool for every other flow."],
    v: "Have the application read slowly and confirm the advertised window falls to zero, the sender pauses and probes, and throughput resumes at line rate when reading speeds up, with pool use bounded by the configured cap.",
    dep: ["connection-state-machine", "packet-buffer-pools", "option-negotiation"]
  },
  "option-negotiation": {
    s: "Agrees on optional protocol features during the handshake: segment size, window scaling, selective acknowledgment, timestamps and explicit congestion signaling.",
    d: "Options ride in the handshake segments. The stack offers the features it supports and enables each only if the peer also offers it. Results are stored in the connection's control block and change how later segments are built and parsed. The difficulty is middleboxes and odd peers that strip or alter options, and the memory cost of each feature: timestamps add bytes to every segment, selective acknowledgment adds scoreboard state, and offloads interact with all of them.",
    k: ["Offering every option vs. a minimal set: a full set gives better loss recovery and measurement, while a minimal one costs less per segment and fewer interoperability risks.", "Per-connection negotiated state vs. global defaults: negotiated state is correct with each peer, but widens the control block."],
    p: ["Assuming window scaling was agreed when only one side offered it causes both sides to misread window sizes.", "A segment size chosen from the local link ignores a smaller path limit and triggers fragmentation or loss."],
    v: "Handshake with peers that support different subsets and confirm, from a packet capture and the control block dump, that only mutually offered options are active and data flows correctly in each case.",
    dep: ["connection-state-machine", "checksum-handling"]
  },
  "listen-and-syn-defense": {
    s: "Accepts new connections on listening ports and defends against floods of connection requests that never complete, using cookies or compact half-open state.",
    d: "A listener keeps a queue of connections that completed the handshake and are waiting for the application. Pending requests are held in a lightweight table, or not held at all: a cookie encoded in the sequence number lets the stack rebuild the state when the final acknowledgment arrives. Limits cap queue lengths, and rate limits cap per-source acceptance. The challenge is staying fast under attack: a flood arrives at line rate, so each bogus request must cost almost nothing and legitimate clients must still get through.",
    k: ["Cookies vs. stored half-open state: cookies survive floods with no memory, but cannot keep options negotiated in the first segment; stored state keeps them and can be exhausted.", "Distributed listeners per core vs. one shared listener: per-core avoids contention and needs flows steered to a core with a listener, while shared needs locking on accept."],
    p: ["Dropping the half-open table when full also drops legitimate clients in the same burst as the attack.", "An accept queue the application does not drain fills, and later handshake completions are silently discarded."],
    v: "Flood the listener with spoofed handshake requests at several million per second while a legitimate client connects repeatedly, and confirm legitimate connections still succeed within normal latency and memory use stays flat.",
    dep: ["connection-state-machine", "rate-limiting", "flow-to-core-mapping"]
  },
  "teardown-and-time-wait": {
    s: "Closes connections cleanly and keeps a short-lived record of recently closed ones, so stray late segments are not mistaken for a new connection with the same addresses.",
    d: "Closing exchanges finish segments in each direction; the side that closes first lingers in a wait state for twice the maximum segment lifetime. At high connection rates, those lingering records pile up by the millions. Techniques shorten the wait using timestamps, reuse ports safely, or store the record in a compact table. Abortive close with a reset skips it. The difficulty is balancing safety against capacity: too short a wait lets old data corrupt new connections, too long exhausts ports and memory.",
    k: ["Full wait period vs. timestamp-based early reuse: the full period is always safe, while early reuse frees resources faster but depends on both peers using timestamps.", "Compact wait records vs. full control blocks: compact records cost bytes instead of hundreds, but hold less state to answer odd late segments."],
    p: ["A client making thousands of short connections per second runs out of source ports because closed connections wait too long.", "Skipping the wait altogether lets a delayed duplicate from an old connection be accepted by a new one."],
    v: "Open and close 100,000 short connections per second between two hosts for a minute and confirm no port exhaustion, memory remains flat after the wait period, and no stale segment is delivered to a later connection.",
    dep: ["connection-state-machine", "timer-wheel", "option-negotiation"]
  },
  "datagram-transport": {
    s: "Sends and receives connectionless datagrams: no handshake, no retransmission, just addressed messages with optional checksums, delivered to whichever application owns the port.",
    d: "Incoming datagrams are matched by destination address and port to a bound endpoint, which queues them for the application. Outgoing ones are built from the application's buffer with headers prepended in a pre-reserved gap. Multicast and broadcast delivery fan out to several endpoints. Large datagrams need fragmentation. It is simple but unforgiving: with no flow control a slow reader just loses data, and the stack is often used to carry latency-critical protocols where jitter matters more than loss.",
    k: ["Per-socket queues with drop on overflow vs. blocking senders: dropping keeps the stack moving and loses data silently; blocking applies pressure but cannot slow a remote sender.", "Prepending headers in place vs. a separate header buffer: in place is copy-free, but requires headroom reserved in every buffer."],
    p: ["A receive queue sized for average load overflows on a burst, dropping packets the application never learns about.", "Sending datagrams larger than the path limit with fragmentation disabled fails with no application-visible error."],
    v: "Send a numbered stream of datagrams at a rate above the receiver's speed and confirm the application sees gaps equal to the drop counter on the socket, with no corrupt or duplicated payloads.",
    dep: ["flow-table", "ip-processing", "fragmentation-reassembly", "checksum-handling"]
  },
  "ethernet-framing": {
    s: "Builds and parses link-layer frames: destination and source addresses, type field, optional tags and padding, and checks the frame length against the interface's maximum size.",
    d: "On receive the stack reads the frame header from the buffer's first bytes, discards frames not addressed to the interface, and dispatches by type to the IP, neighbor-resolution or other handlers. On transmit it prepends a header into reserved headroom. Frame size limits set the buffer layout, and jumbo frames change pool geometry. The details are simple but must be exact: minimum padding, address filtering in hardware and software, and the interaction of tags with offloads.",
    k: ["Software address filtering vs. relying on the card: the card discards early and saves CPU, but promiscuous or multicast needs may require software to see everything.", "Fixed buffer size for jumbo frames vs. chained buffers: fixed is fast and wastes memory on small packets; chaining is flexible and slows the common path."],
    p: ["A frame shorter than the minimum is padded by the card on transmit but a software loopback path never pads it, breaking a test that passes on hardware.", "Jumbo frames enabled on the interface but not on the pool cause silent truncation."],
    v: "Send frames at minimum, standard and maximum sizes and with a tag present, and confirm from a capture on the wire that each is received and sent unmodified, with length counters matching.",
    dep: ["buffer-layout", "device-abstraction", "vlan-and-tunnel-handling"]
  },
  "neighbor-resolution": {
    s: "Maps a next-hop IP address to a link-layer address by asking the network, caching the answer and answering the same questions from other hosts.",
    d: "When a packet needs a next-hop address that is not in the neighbor cache, the stack parks it, sends a request, and releases the packet when a reply arrives or drops it on timeout. Entries age through states such as reachable, stale and probing. The stack must also reply to requests for its own addresses, or the host becomes unreachable. It is hard because it is control traffic inside a data-path stack: requests, replies, duplicates and floods must be handled without slowing normal packets or letting a flood fill the cache.",
    k: ["Parking packets awaiting resolution vs. dropping them: parking avoids the first-packet loss, but needs bounded memory per pending entry.", "Handling requests in the stack vs. forwarding to the kernel: in-stack answers are fast and need correct implementation; forwarding reuses the kernel but adds a hop to every new neighbor."],
    p: ["A cache sized too small for a large subnet thrashes, so each packet triggers a new resolution.", "Not answering requests for the stack's own address makes the host unreachable though the stack runs fine."],
    v: "Start with an empty cache, send a packet to an unseen neighbor, and confirm one request goes out, the packet is delivered after the reply, a second packet uses the cache, and the stack answers a request for its own address within a millisecond.",
    dep: ["ethernet-framing", "timer-wheel", "exception-path"]
  },
  "ip-processing": {
    s: "Validates and forwards or delivers IPv4 and IPv6 packets: header checks, time-to-live, option handling, extension headers, and choosing between local delivery and forwarding.",
    d: "The stack checks version, length and checksum (IPv4), verifies the destination is local or routes onward, decrements the hop limit, and hands the payload to the right transport. IPv6 adds extension header chains, which must be parsed within a bound. Source address selection chooses the outgoing address. The difficulty is doing it for every packet at line rate: header parsing is branch-heavy, and malformed or option-laden packets are slower and a common attack vector.",
    k: ["Fast path for plain headers vs. full parsing of everything: the fast path handles most traffic cheaply, while rare packets fall to a slower generic path that is a target for abuse.", "Own IPv6 extension parsing vs. dropping packets with extensions: parsing is complete and more attack surface; dropping is safe and breaks some legitimate uses."],
    p: ["Unbounded extension header chains let a packet cost far more cycles than its size suggests.", "Forgetting to decrement the hop limit when forwarding allows packets to loop forever."],
    v: "Send valid, expired-TTL, bad-length and extension-heavy packets and confirm the stack delivers, drops with the right ICMP error, or counts each correctly, with throughput on plain traffic unchanged.",
    dep: ["route-lookup", "checksum-handling", "icmp-handling", "ethernet-framing"]
  },
  "fragmentation-reassembly": {
    s: "Splits packets that exceed the path's size limit into fragments and rebuilds the original from fragments arriving later and possibly out of order.",
    d: "Outgoing packets over the path limit are cut into fragments with offsets and a shared identifier. Incoming fragments are placed in a table keyed by source, destination and identifier, held until all pieces arrive or a timer expires. Because fragments do not carry transport headers after the first, flow steering and offloads often fail on them. It is hard because reassembly is stateful, memory-hungry and a classic attack surface: overlapping or never-completing fragments can exhaust memory.",
    k: ["Reassembling in the stack vs. dropping fragments: reassembly keeps legacy traffic working, while dropping removes a large attack surface and breaks tunnels that rely on fragments.", "Steering fragments by address pair only vs. full flow: address pairing keeps all fragments of a datagram on one core but may unbalance load."],
    p: ["Fragments of one datagram land on different cores because only the first has ports, so reassembly never completes.", "A flood of incomplete fragment sets fills the reassembly table and blocks all legitimate fragmented traffic."],
    v: "Send a datagram in shuffled fragments and confirm exact reconstruction on one core, then send a flood of never-completing fragments and confirm table use stays at its cap and normal traffic continues.",
    dep: ["ip-processing", "timer-wheel", "packet-buffer-pools", "flow-to-core-mapping"]
  },
  "icmp-handling": {
    s: "Generates and processes control messages such as echo, destination unreachable, time exceeded and packet-too-big, which the network relies on for diagnostics and path discovery.",
    d: "Incoming control messages are validated, then either answered (echo) or delivered to the affected connection: a packet-too-big message lowers that connection's segment size. The stack also originates errors when it drops packets it should report, rate-limited so it cannot be used for amplification. For IPv6, control messages also carry neighbor discovery and router advertisements. The difficulty is trust and volume: forged messages can reset or throttle connections, and answering every drop with an error doubles load under attack.",
    k: ["Strict validation of embedded headers vs. accepting plausible messages: strict validation resists forgery, but drops legitimate messages that middleboxes alter.", "Rate-limited error generation vs. unlimited: rate limits stop amplification, but hide how many packets were actually dropped."],
    p: ["Accepting a forged packet-too-big message with a tiny size throttles a connection to a crawl.", "Replying to broadcast pings turns the host into an amplifier for a flood."],
    v: "Ping the stack, trigger an expired-TTL error, and send a forged too-big message that fails validation, then confirm the first two work, the third is ignored and counted, and error generation never exceeds its configured rate.",
    dep: ["ip-processing", "rate-limiting", "connection-state-machine"]
  },
  "route-lookup": {
    s: "Finds the next hop and outgoing interface for a destination address by longest-prefix match, in a few memory accesses per packet.",
    d: "Routes are held in a trie or compressed multibit table designed so a lookup touches a handful of cache lines. Updates from the control channel are built into a new table and swapped in, or applied under a read-copy-update scheme so lookups never lock. Policy routing adds source and mark-based selection. The challenge is size and update rate: a full routing table has hundreds of thousands of entries and changes constantly, and lookups on every core must not stall during updates.",
    k: ["Multibit trie with tens of megabytes vs. compact structure: the large table is fastest, while a compact one fits in cache at the cost of extra steps per lookup.", "Swapping in a rebuilt table vs. in-place update: swapping is safe for readers and slow for frequent changes; in-place is quick and needs careful memory reclamation."],
    p: ["Updating the table in place while another core reads it produces a lookup that returns a half-written entry.", "A table larger than the last-level cache turns every lookup into main-memory latency."],
    v: "Load a full-size routing table, run line-rate traffic across random destinations, apply thousands of updates per second, and confirm every lookup matches a reference implementation and lookup cost per packet stays constant.",
    dep: ["numa-aware-allocation", "control-channel", "cache-line-discipline"]
  },
  "checksum-handling": {
    s: "Computes and verifies the checksums in IP, TCP and UDP headers, in the card when it can and in software, vectorized, when it cannot.",
    d: "The card can verify received checksums and mark each buffer good, bad or unknown, and can compute outgoing ones if the stack fills in the pseudo-header partial sum. When offload is not available, or for packets such as tunneled ones the card cannot see into, software sums using wide vector instructions. It is hard because the metadata must stay correct across rewriting: changing an address or tunneling a packet invalidates the old result, and mixed offload states per packet must be tracked in every buffer.",
    k: ["Offload to the card vs. software computing: offload frees cycles, but must be tracked per packet and fails for unusual encapsulations; software is universal and costs CPU on every byte.", "Trusting a card's good flag vs. rechecking: trusting is cheap and leaves undetected corruption inside the card; rechecking costs the saving."],
    p: ["Rewriting an address without updating the checksum produces packets every peer silently discards.", "A packet marked unknown by the card is treated as good, passing corruption to the application."],
    v: "Send packets with a wrong checksum at every layer and confirm each is dropped with the correct reason, and that valid packets pass whether the check was done by hardware or software, with a capture on the wire confirming outgoing sums.",
    dep: ["checksum-offload", "buffer-layout", "vectorized-paths"]
  },
  "vlan-and-tunnel-handling": {
    s: "Adds, strips and interprets tags and encapsulation headers (VLAN tags, tunnels carrying one network inside another) so inner traffic is classified and delivered correctly.",
    d: "VLAN tags may be stripped by the card into buffer metadata or left in the frame. Tunnel handling decapsulates arriving packets, runs classification on the inner headers, and on transmit builds outer headers from per-tunnel state. Each added layer changes header offsets, MTU and checksum coverage. The difficulty is that hardware features often handle one encapsulation depth only, hashing may see just the outer headers (collapsing all inner flows onto one queue), and the stack must track which offsets each stage should use.",
    k: ["Hardware tag stripping vs. leaving tags in the frame: stripping speeds parsing and moves the tag to metadata, but loses it if the packet is forwarded raw.", "Hashing on outer vs. inner headers: inner hashing spreads tunneled flows across queues but needs card support; outer hashing is universal and clusters them."],
    p: ["All flows inside one tunnel hash to a single queue, so one core is saturated while the rest idle.", "Encapsulation shrinks the usable payload, and unchanged segment sizing causes oversize packets that are fragmented or dropped."],
    v: "Pass traffic with stacked tags and one tunnel layer, and confirm inner packets are classified by their real flows, spread across queues, and that overhead-adjusted segment size avoids any fragmentation.",
    dep: ["ethernet-framing", "receive-side-scaling", "flow-table", "checksum-handling"]
  },
});
