// Details, part 1: sockets and traversal, connection and security.
ATLAS.details("multiplayer-netcode", {
  "udp-socket-layer": {
    s: "Non-blocking datagram sockets that send and receive packets without connection state, retransmission or ordering, leaving every reliability decision to the game's own protocol.",
    d: "Real-time games use UDP because a late packet is worth less than a fresh one, and a reliable stream would hold fresh data behind a lost old packet. The socket layer binds an address, sets buffer sizes, marks packets with a traffic class where the path honors it, and reads in a loop until the receive queue is empty. It hands raw datagrams upward with their source address. The difficulty is that UDP gives no guarantees at all, so everything above must assume loss, duplication, reordering and spoofed sources.",
    k: ["Raw datagrams vs a reliable stream: freshness and control over loss behavior, at the cost of building acknowledgement, ordering and congestion handling yourself.", "Large kernel receive buffers vs small ones: bursts survive a slow frame, but queued packets add invisible latency when the application falls behind."],
    p: ["Reading one packet per frame lets the receive queue grow, so latency climbs steadily while nothing appears lost.", "Trusting the source address of a datagram lets any host on the internet impersonate a player."],
    v: "Flood a test server with ten thousand datagrams in a burst while its frame is stalled, then resume. Confirm all are read in one pass and none are dropped by the kernel counters.",
    dep: []
  },
  "network-io-thread": {
    s: "A dedicated thread or event loop that moves datagrams between the socket and the game thread, so network timing does not depend on frame time.",
    d: "If sockets are read only once per frame, a slow frame delays acknowledgements and inflates measured round-trip time. A separate I/O thread drains the socket continuously, timestamps each packet on arrival, decrypts it, and passes it to the simulation through a lock-free queue. Outgoing packets take the reverse path. The hard parts are the handoff, which must not add copies or locks to the hot path, and keeping timestamps meaningful across threads so jitter measurements reflect the network and not the scheduler.",
    k: ["Separate I/O thread vs polling on the game thread: accurate arrival timestamps and prompt acknowledgements, at the cost of a queue and cross-thread ownership rules.", "Per-packet handoff vs batching per tick: lower latency per packet, but more synchronization and cache traffic under load."],
    p: ["Timestamping packets when the game thread reads them, not when they arrive, makes jitter graphs measure frame time.", "An unbounded handoff queue lets a stalled game thread consume all memory during a flood."],
    v: "Stall the game thread for 200 ms while a peer sends at a steady rate. Confirm the measured round-trip time stays flat and the stalled packets are timestamped at their true arrival times.",
    dep: ["udp-socket-layer"]
  },
  "address-discovery": {
    s: "Finds the public address and port a peer appears as to the internet, and classifies how its address translator behaves, using a helper server outside the translator.",
    d: "A machine behind a translator knows only its private address. It sends a datagram to a discovery server on the public internet, which replies with the source address and port it saw. Comparing results from two servers reveals whether the translator keeps the same mapping per destination or allocates a new one each time, which determines whether punch-through can work. The result is gathered as candidate addresses: local, public, and relayed. The difficulty is that mappings expire, change on network switches, and differ by protocol and destination.",
    k: ["Querying two discovery servers vs one: reveals mapping behavior and predicts traversal success, at the cost of extra startup latency and server load.", "Discovering once at startup vs refreshing: simpler, but a mobile player who switches networks mid-session presents a stale address."],
    p: ["Caching the discovered address across a network change sends peers to an address that no longer reaches the player.", "Treating a mapping as stable because one probe worked misses translators that allocate a new port per destination."],
    v: "Run discovery from behind a translator known to assign per-destination ports and confirm the classifier reports it as unpredictable, and that traversal then falls back to a relay.",
    dep: ["udp-socket-layer"]
  },
  "nat-traversal": {
    s: "Opens a direct path between two peers that are both behind address translators by having each send to the other at the same time, using a coordinator to exchange addresses.",
    d: "A translator drops inbound packets from addresses the inside host has not contacted. A coordinator tells each peer the other's candidate addresses, and both fire datagrams at each other nearly simultaneously. Each outbound packet creates a mapping that lets the peer's packet in. Candidates are tried in order of preference with connectivity checks, and the first working pair wins. It fails with symmetric translators, strict firewalls and some mobile carriers, so every design needs a fallback. Timing and retries decide the success rate.",
    k: ["Direct punch-through vs always relaying: lower latency and no relay bandwidth cost, but a failure rate that needs a fallback path.", "Trying all candidate pairs in parallel vs sequentially: faster connection, but more probe traffic and more complex state."],
    p: ["Starting probes before the coordinator has delivered both sides' candidates means the first packets are dropped and the mapping never opens.", "Not detecting the failure quickly leaves players waiting a minute before the relay is tried."],
    v: "Connect pairs of clients behind each translator type in a lab. Confirm the success rate per type is recorded and that failing pairs end on the relay within a few seconds.",
    dep: ["address-discovery", "udp-socket-layer"]
  },
  "relay-server": {
    s: "A public server that forwards packets between peers who cannot reach each other directly, trading added latency and bandwidth cost for guaranteed connectivity.",
    d: "When traversal fails, both peers connect outbound to a relay, which forwards datagrams by session identifier without interpreting game data. Because end-to-end encryption keeps payloads opaque, the relay needs only routing tokens. Relays are deployed in many regions so the extra hop is short, and the same fleet can hide player addresses from each other, which prevents targeted attacks on a home connection. The difficulty is cost and capacity: relayed traffic is every byte twice, and a relay that is overloaded becomes the match's bottleneck.",
    k: ["Relay-only vs direct with relay fallback: simpler and hides addresses, but pays bandwidth for every match and adds a hop of latency to all of them.", "Stateless forwarding by token vs per-session state: scales easily and survives restarts, but offers no per-session rate limiting or accounting."],
    p: ["A relay chosen by geography alone, not measured latency, can add a transcontinental detour to a match between neighbors.", "Forwarding without authenticating the routing token makes the relay an open amplifier for attackers."],
    v: "Force two clients onto a relay and compare round-trip time with the direct path. Confirm the added latency is within budget and that a forged routing token is dropped.",
    dep: ["connection-tokens", "udp-socket-layer"]
  },
  "stream-fallback": {
    s: "Carries the game protocol over a reliable stream or a browser-compatible socket when datagrams are blocked by the network or unavailable on the platform.",
    d: "Some corporate networks block UDP, and browser builds cannot open raw datagram sockets. The fallback tunnels the same packet format over a stream connection. The protocol still sequences and acknowledges its own messages, but the stream underneath retransmits and orders everything, so one lost segment stalls all later data. That is head-of-line blocking, and it makes snapshots arrive late in bursts. Detecting the need, choosing the transport at connect time, and tuning the game to tolerate the stalls are the work; the fallback should be a last resort.",
    k: ["Fallback transport vs UDP only: reaches blocked networks and browsers, but those players get visibly worse jitter and need a larger interpolation buffer.", "Same protocol over the stream vs a separate simple one: one code path to test, but redundant reliability layers waste bandwidth and add delay."],
    p: ["Letting fallback players share a match with UDP players unadjusted makes their hit registration noticeably worse and breeds complaints.", "Enabling Nagle-style packet batching on the stream adds tens of milliseconds to every small input."],
    v: "Block UDP on a test network and confirm the client connects over the fallback within the timeout, labels the connection as degraded, and widens its interpolation buffer.",
    dep: ["connection-handshake"]
  },
  "connection-handshake": {
    s: "The exchange that turns an anonymous datagram source into an authenticated connected client, while spending no server memory on peers who have not proven they can receive replies.",
    d: "The client presents a connection token obtained from a trusted service. The server replies with a small challenge and allocates nothing yet. When the client echoes the challenge back encrypted, the server knows the source address is real and the token valid, and only then creates connection state. Keys, protocol version and initial sequence numbers are agreed along the way. Request packets are padded so the reply is never larger than the request, which prevents amplification. The hard part is making every step resend-safe over a lossy link without becoming a denial-of-service lever.",
    k: ["Stateless challenge before allocating state vs allocating at first packet: immune to spoofed floods, but costs one extra round trip at connect.", "Padding requests to a fixed size vs minimal packets: prevents reflection attacks, but spends bandwidth on every attempt."],
    p: ["Allocating a connection slot on the first unauthenticated packet lets a trivial flood fill the server's capacity.", "Replies larger than requests turn the server into a reflector for attacking third parties."],
    v: "Send ten thousand spoofed connect requests per second from random sources and confirm server memory stays flat and no replies exceed the request size, while a legitimate client still connects.",
    dep: ["connection-tokens", "challenge-cookie", "key-exchange", "udp-socket-layer"]
  },
  "connection-tokens": {
    s: "Short-lived signed credentials issued by a trusted web service that tell a game server who the player is, which server they may join, and what key to use.",
    d: "After matchmaking, a backend that already authenticated the player issues a token containing the server addresses, an expiry, a user identifier, a unique nonce and a per-session key, encrypted and signed with a secret shared only with the game servers. The client cannot read or alter it, only present it. The server verifies signature, expiry and address list, and remembers recent token nonces so a captured token cannot be replayed. This moves login, bans and entitlement checks out of the game server entirely.",
    k: ["Backend-issued tokens vs the game server authenticating players itself: no credentials on game servers and cheap verification, but a hard dependency on the issuing service.", "Short expiry vs long: limits stolen-token damage, but a slow connect or queue can fail legitimate joins."],
    p: ["Not tracking used nonces lets a captured token be replayed to join under another player's identity.", "Sharing one signing secret across all regions means a single compromised server can mint tokens everywhere."],
    v: "Connect with a valid token, then replay it from a second client. Confirm the second attempt is refused, and that an expired token is refused with a distinct reason code.",
    dep: ["packet-encryption", "packet-authentication"]
  },
  "challenge-cookie": {
    s: "A stateless proof that a client can receive packets at the address it claims, implemented as an encrypted value the server can verify without having stored anything.",
    d: "The server derives the challenge from the client address, a timestamp and a rotating server secret, so a valid reply can be checked by recomputation. Only a client that actually received the challenge can return it, which separates real hosts from spoofed sources. Secrets rotate on a schedule with the previous one still accepted for a grace period. It defends the same way cookies defend stream handshakes, but must work over unreliable datagrams where the challenge may need resending.",
    k: ["Stateless derived cookie vs a stored pending-connection table: nothing to exhaust under flood, but each cookie is valid for a time window and cannot be revoked individually.", "Rotating the secret often vs rarely: shortens replay windows, but risks rejecting honest clients mid-handshake."],
    p: ["Binding the cookie to the address but not the port lets one host proxy a verified identity for many connections.", "Rotating the secret without a grace period fails every handshake in flight at the rotation moment."],
    v: "Complete a handshake, rotate the server secret during a second one in flight, and confirm the in-flight handshake still finishes and a cookie from an hour earlier is rejected.",
    dep: ["packet-authentication"]
  },
  "key-exchange": {
    s: "Establishes the symmetric keys for a session, either handed out inside the connection token or agreed by a public-key exchange at connect time.",
    d: "The simplest scheme gives client and server a random key through the connection token, so no public-key math runs on the server per connection. Where no trusted backend exists, an ephemeral key agreement derives a fresh shared secret per session, giving forward secrecy at a cost in connect-time CPU and a need to authenticate the peer some other way. Separate keys are derived per direction. The difficulty is protecting the server from expensive operations triggered by unauthenticated senders, and rotating keys during very long sessions.",
    k: ["Keys in the token vs ephemeral key agreement: nearly free on the server and simple, but a leaked token leaks the session key and gives no forward secrecy.", "One key for both directions vs one per direction: simpler, but reflected packets can be replayed back at their sender."],
    p: ["Running public-key operations before the challenge succeeds hands attackers an easy CPU exhaustion lever.", "Reusing a key and nonce counter after a reconnect breaks the cipher's security completely."],
    v: "Capture a session's packets, then inspect the server's key store after disconnect. Confirm per-direction keys differ and are discarded, and that a fresh connection derives unrelated keys.",
    dep: ["connection-tokens"]
  },
  "packet-encryption": {
    s: "Encrypts every packet after the handshake so observers on the path cannot read game state or inputs, using a fast cipher with a per-packet nonce.",
    d: "Each packet is encrypted with an authenticated cipher keyed per session and direction, with a nonce built from the packet sequence number so it is never reused. Because packets can arrive out of order or twice, each carries enough information to decrypt on its own. Header fields needed for routing stay readable but are bound to the ciphertext as associated data. Encryption stops casual cheating tools that read or edit traffic, and hides player positions from eavesdroppers on shared networks. Cost per packet is small but non-zero at high packet rates.",
    k: ["Authenticated encryption vs encrypt-only: tampering is detected for free in the same pass, with a small fixed tag added to every packet.", "Encrypting the sequence number too vs leaving it readable: hides traffic patterns, but middleboxes and diagnostics lose useful fields."],
    p: ["Deriving the nonce from anything that can repeat, such as a per-frame counter, destroys confidentiality on key reuse.", "Treating encryption as anti-cheat: the cheating client holds the key, so it only blocks outsiders."],
    v: "Capture a session on the wire and confirm no known plaintext fields are visible. Flip one bit of a captured packet, replay it to the server, and confirm it is dropped and counted.",
    dep: ["key-exchange", "packet-header"]
  },
  "packet-authentication": {
    s: "Proves each packet came from the connected peer and was not altered or replayed, by checking a tag and a sequence number against a sliding replay window.",
    d: "The authentication tag, produced by the same pass as encryption, covers the header and payload, so any modification fails the check. A replay window tracks the highest sequence number seen and a bitmask of recent ones. A packet already seen or older than the window is discarded. Packets failing authentication are dropped without any reply, so an attacker learns nothing. Order of checks matters for cost: cheap size and window checks run first, expensive verification last.",
    k: ["Silent drop on failure vs an error reply: gives attackers no oracle and no amplification, but makes genuine key mismatches harder to diagnose.", "A wide replay window vs a narrow one: tolerates heavy reordering, but uses more memory per connection and accepts older replays."],
    p: ["Updating the replay window before the tag verifies lets an attacker advance it with forged packets and lock out the real peer.", "A replay window smaller than real reordering silently discards valid packets on bad links."],
    v: "Replay a captured valid packet and a modified copy to the server. Confirm both are discarded, counters distinguish replay from authentication failure, and the legitimate stream is unaffected.",
    dep: ["packet-header"]
  },
  "connection-state-machine": {
    s: "Tracks each peer through disconnected, connecting, challenged, connected and disconnecting states, with explicit rules for which packets are legal in each.",
    d: "Each connection holds its state, keys, last-receive time, sequence counters and negotiated settings. Incoming packets are accepted only if valid for the current state; for example, game data before the handshake finishes is dropped. Disconnects are sent several times because a single lost message would leave the peer waiting for a timeout. A client slot table maps addresses to connections and enforces limits. The difficulty is the edge cases: simultaneous disconnect and reconnect, delayed packets from a previous session arriving on a reused address, and half-open states.",
    k: ["Explicit states with strict packet legality vs permissive handling: far fewer exploitable paths, but more code and more careful testing of every transition.", "Reusing a slot immediately vs a cooldown: frees capacity quickly, but stale packets from the previous occupant can reach the new one."],
    p: ["Accepting game packets before the handshake completes lets unauthenticated senders reach gameplay parsing code.", "A single disconnect packet that is lost leaves a ghost player holding a slot until the timeout."],
    v: "Kill a client process mid-match, then reconnect from the same address immediately. Confirm the old slot is freed, the new session starts clean, and stale packets are rejected.",
    dep: ["connection-handshake", "packet-authentication"]
  },
  "keepalive-and-timeout": {
    s: "Detects dead peers by timing silence, sending small packets when there is no game traffic and disconnecting a peer that has been quiet for too long.",
    d: "Both sides track the time of the last authenticated packet. When nothing is sent for a short interval, a minimal keepalive goes out so translators keep the mapping open and the peer knows the link is alive. If nothing arrives for the timeout period, the connection is closed and gameplay is told. The timeout must cover transient stalls such as a level load or a mobile radio handoff, yet react quickly enough that a crashed player does not hold the match. Some designs show a connection-problem indicator before disconnecting.",
    k: ["Short timeout vs long: dead players are removed quickly, but brief stalls and loading hitches cause false disconnects.", "Keepalives at translator timescales vs only when idle: maintains mappings through quiet periods, at a small constant bandwidth cost."],
    p: ["Counting unauthenticated packets as signs of life lets an attacker keep a dead player's slot open indefinitely.", "A timeout tuned on wired networks disconnects mobile players at every cell handoff."],
    v: "Block a client's traffic for 3 seconds and confirm the match shows a connection warning without dropping it. Block for the full timeout and confirm disconnection and slot release.",
    dep: ["connection-state-machine"]
  },
  "packet-header": {
    s: "The small fixed prefix on every packet carrying a protocol identifier, a sequence number and acknowledgement data, which the rest of the reliability machinery is built on.",
    d: "Each packet gets a sequence number from a per-connection counter. The header also carries the latest sequence number received from the peer and a bitfield of the preceding ones, which lets each side learn which of its packets arrived. A protocol identifier discards unrelated traffic early. Sequence numbers are short and wrap, so comparisons use modular arithmetic. Because packets are numbered rather than messages, one packet can carry several messages and the loss of a packet is known directly, without waiting for a timeout.",
    k: ["Numbering packets vs numbering messages: loss detection is immediate and header cost is fixed, but retransmission must repackage the lost content into a new packet.", "Short wrapping sequence numbers vs wide ones: save bytes on every packet, but require correct wrap-aware comparison and a bounded reordering window."],
    p: ["Comparing sequence numbers with plain greater-than breaks at the wrap point, and a connection dies hours into a session.", "A protocol identifier that is guessable provides no filtering against random scans."],
    v: "Send packets through a proxy that reorders, drops and duplicates them, with the counter forced near its wrap point. Confirm each side's acknowledged set matches exactly what the proxy delivered.",
    dep: ["udp-socket-layer"]
  },
  "acknowledgement-bitfield": {
    s: "Reports receipt of the last thirty-two or so packets compactly, as the newest sequence number plus a bitmask, so every packet redundantly acknowledges its recent predecessors.",
    d: "The receiver puts the highest sequence number it has seen and a bitmask of which of the previous packets arrived into the header of every outgoing packet. The sender reads it to mark each of its packets acknowledged or, once older than the window, lost. Redundancy means a lost acknowledgement is repaired by the next packet carrying a wider history, so no separate acknowledgement traffic is needed when data flows both ways. It requires packets to flow regularly in both directions, and the window size sets how much loss it can describe.",
    k: ["Piggybacked bitfield vs separate acknowledgement packets: no extra packets and tolerance to ack loss, at a fixed few bytes on every packet.", "A 32-bit window vs a larger one: cheap header, but at high packet rates and long latency, old packets fall out of the window before being confirmed."],
    p: ["At sixty packets per second and 500 ms latency, a 32-packet window ages out unacknowledged packets and marks them lost falsely.", "Treating a packet that falls off the window as lost can resend data that did arrive."],
    v: "Drop every third packet on a test link and confirm the sender's loss counter matches the true count to the packet, with no false losses at the highest tested packet rate.",
    dep: ["packet-header"]
  },
  "rtt-estimation": {
    s: "Measures round-trip time from acknowledgement timing and smooths it, giving the connection its latency figure, jitter figure and retransmission timeout.",
    d: "When a packet is acknowledged, the sender subtracts its send time from the current time, minus any known delay the receiver held it. Raw samples are noisy, so an exponentially weighted average and a variance estimate are kept, as in stream protocols. The values feed retransmission timers, adaptive interpolation buffers, congestion control and the diagnostic overlay. It is hard because samples are inflated by the peer's frame time and by acknowledgements piggybacked on infrequent packets, so the receiver should report how long it held a packet.",
    k: ["Reporting the peer's hold time vs ignoring it: removes frame-time inflation from the estimate, at the cost of an extra header field.", "Heavy smoothing vs light: steadier timers and less jitter in buffer sizing, but slower reaction when the path really changes."],
    p: ["Using samples from retransmitted data as if they were the first transmission gives wildly wrong values.", "An estimate inflated by a low send rate makes the adaptive buffer grow for no network reason."],
    v: "Add a fixed 80 ms delay with 10 ms jitter on a test link and confirm the estimate converges to 80 ms plus overhead within a few seconds and reports the jitter within a few milliseconds.",
    dep: ["acknowledgement-bitfield"]
  },
  "unreliable-channel": {
    s: "Delivers messages at most once with no retransmission, for data that is replaced by newer data before a resend could arrive, such as position updates.",
    d: "Messages sent on this channel are packed into a packet and forgotten. If the packet is lost, nothing is resent, and the next update supersedes it. Receivers may discard messages that arrive older than the newest already seen for the same stream. It is the cheapest channel, with no buffering and no head-of-line blocking, and carries the bulk of traffic: snapshots, inputs, voice. The difficulty is deciding what truly can be dropped, and handling the case where a message turns out to matter after all.",
    k: ["Fire-and-forget vs retransmit: no stalls and no wasted bandwidth on stale data, but the application must tolerate gaps and reordering.", "Sequenced delivery vs unordered unreliable: late packets are discarded for smoother state, but any rare event on the channel is silently lost."],
    p: ["Sending a one-time event such as a door opening on this channel leaves one client permanently out of sync after a single lost packet.", "Not discarding old updates makes entities jump backward when a delayed packet arrives."],
    v: "Run at 10% loss and confirm movement updates remain smooth to the viewer, no entity jumps backward, and the channel's retransmission count remains exactly zero.",
    dep: ["packet-header"]
  },
  "reliable-ordered-channel": {
    s: "Delivers every message exactly once and in the order sent, retransmitting lost data, for things such as chat, level changes and critical game events.",
    d: "Each message gets a channel-local sequence number and stays in a send buffer until acknowledged. If its packet is declared lost, it is resent in a later packet, subject to the retransmission timer and bandwidth budget. The receiver buffers out-of-order messages and releases them to the game only in sequence. A loss therefore stalls everything behind it on that channel, which is head-of-line blocking, so each class of reliable traffic often gets its own channel. Buffer limits matter: a peer that stops acknowledging must be disconnected rather than allowed to grow memory.",
    k: ["One ordered channel for everything vs several: simple and globally ordered, but one lost chat message delays an important gameplay event.", "Resending on timeout vs on acknowledgement gaps: gap-based recovery is faster than waiting, but more sensitive to reordering."],
    p: ["An unbounded send buffer toward a stalled client consumes server memory until the process fails.", "Putting frequent small events on an ordered channel causes visible hitches whenever any packet is lost."],
    v: "Send numbered messages through a link with 15% loss and 100 ms jitter and confirm they arrive once each, in order, and that a peer who stops acknowledging is disconnected at the buffer limit.",
    dep: ["acknowledgement-bitfield", "rtt-estimation"]
  },
  "reliable-unordered-channel": {
    s: "Delivers every message exactly once but in whatever order it arrives, avoiding head-of-line blocking for independent items such as asset chunks or spawn requests.",
    d: "Messages are retransmitted until acknowledged, like the ordered channel, but the receiver delivers each as soon as it arrives and uses an identifier set to suppress duplicates. A lost message delays only itself. It suits streams of independent messages where order does not matter, or where each carries its own sequence for the application to sort. The receiver must remember delivered identifiers for long enough to catch late duplicates, and the window of remembered identifiers must be bounded.",
    k: ["Unordered reliable vs ordered: a loss delays only the lost item, but the application must tolerate arrival in any order.", "Remembering delivered ids for a fixed window vs forever: bounded memory, but a very late duplicate can be delivered twice."],
    p: ["Using it for messages with hidden dependencies, such as an attach after a spawn, makes them arrive in the wrong order and fail.", "A duplicate window shorter than the retransmission timeout delivers retransmitted messages twice."],
    v: "Deliver 1,000 independent messages through a lossy reordering link. Confirm each arrives exactly once and that a lost message does not delay any later message beyond one round trip.",
    dep: ["acknowledgement-bitfield", "rtt-estimation"]
  },
  "fragmentation-and-mtu": {
    s: "Splits messages larger than the path's maximum packet size into numbered fragments and reassembles them, while keeping packets small enough to avoid network-level fragmentation.",
    d: "Packets bigger than the path MTU, around 1,200 bytes to stay safe on the internet, are fragmented by routers, and losing one fragment loses the whole packet. Game protocols therefore fragment themselves: each large message is cut into pieces carrying a message id, index and count, and reassembled at the receiver with a timeout. Fragments are usually sent over a reliable channel, since losing one wastes the rest. The difficulty is bounding reassembly memory, avoiding fragmenting hot-path data at all, and choosing a conservative packet size.",
    k: ["Application-level fragmentation vs relying on the network: loss is visible and controllable, but the protocol carries reassembly state and a timeout.", "Conservative 1,200-byte packets vs discovering the path MTU: works everywhere with no probing, but wastes capacity on paths that allow more."],
    p: ["Letting a full snapshot grow past the MTU quietly makes a single loss destroy it, multiplying effective loss rate.", "Unbounded reassembly buffers let a remote sender claim huge messages and exhaust memory."],
    v: "Send a 50 KB message across a lossy link and confirm it reassembles intact, that incomplete reassembly buffers are freed at timeout, and that no packet on the wire exceeds the configured size.",
    dep: ["packet-header", "reliable-ordered-channel"]
  },
  "congestion-control": {
    s: "Adapts the send rate to what the path can carry, reducing it when loss or rising delay shows queues are building, and recovering when the path clears.",
    d: "Games send at a fixed tick rate, so congestion control mostly chooses how much to send per packet or how often, rather than how fast to push a stream. The sender watches loss, round-trip time and its acknowledgement rate, and lowers its budget by dropping update frequency, lowering quality or deferring low-priority data. The goal is to avoid filling router buffers, which causes delay for everyone on the household link, including the player's own traffic. Simple designs switch between a good mode and a bad mode.",
    k: ["Delay-based vs loss-based signals: delay reacts before packets are dropped, but is noisy on wireless links where delay varies for other reasons.", "Reducing update rate vs reducing fidelity: either keeps latency low, but players notice choppiness more than lower precision."],
    p: ["Ignoring congestion and sending a fixed rate causes bufferbloat, so latency climbs for seconds while nothing is dropped.", "Overreacting to a single loss collapses quality needlessly on normal wireless links."],
    v: "Throttle a test link below the game's rate and confirm the sender reduces its rate within a second, round-trip time stays near baseline, and the rate recovers after the throttle is removed.",
    dep: ["rtt-estimation", "bandwidth-budget"]
  },
  "bandwidth-budget": {
    s: "A per-connection allowance of bytes per second that every sender of data must fit within, with a defined policy for what is dropped when demand exceeds it.",
    d: "The budget is set from the target player's connection, the server's egress cost and the congestion controller's current estimate. Each tick the packetizer collects messages by priority, fills the packet up to the remaining allowance, and carries unsent data forward or discards it. Reliable data and inputs are guaranteed first, then snapshots by relevance, then cosmetic effects. The numbers are measured per feature, so adding a system shows its bandwidth cost. The difficulty is that costs grow with player count, and one profligate feature can starve the rest.",
    k: ["Hard per-connection cap vs soft target: bounds server cost and protects slow links, but legitimately busy moments are throttled and can look like lag.", "Per-feature allocations vs a shared pool by priority: predictable and easy to attribute, but wastes headroom that other features could use."],
    p: ["Sizing the budget on the developer's wired connection leaves mobile and congested players permanently over it.", "No per-feature accounting means a new effect quietly consumes the snapshot budget and degrades player updates."],
    v: "Spawn the maximum entity count and confirm per-client send rate stays within the configured cap, that inputs and reliable data are never dropped first, and that the debug overlay shows bytes by feature.",
    dep: ["packet-header", "replication-priority"]
  },
  "bit-packing": {
    s: "Writes values using only the bits they need, not whole bytes, packing flags, small integers and fractions tightly into a stream so each packet carries more state.",
    d: "A bit writer appends fields of arbitrary width into a buffer and the reader mirrors it exactly. A boolean takes one bit, a value in a range of 0 to 15 takes four, and an enum takes the log of its count. Fields are written in a fixed order, and both sides must agree on widths, so the layout is generated from one description. Savings add up: a snapshot with hundreds of entities shrinks several times over. The cost is code that cannot be inspected as bytes, unaligned reads, and bugs that appear as corrupted data far downstream.",
    k: ["Bit-level packing vs byte-aligned fields: much smaller packets, but harder debugging and slower reads without care for alignment.", "Writer and reader from one shared description vs hand-written pairs: they cannot drift apart, but the description language becomes part of the build."],
    p: ["Writer and reader disagreeing by one bit on a single field corrupts every field after it in the packet.", "Packing without a ranged-value check lets an out-of-range value wrap silently into a different value."],
    v: "Round-trip a million randomized messages through writer and reader, including boundary values, and confirm every field is identical. Compare packet sizes against the byte-aligned version.",
    dep: []
  },
  "quantization": {
    s: "Represents continuous values such as positions and rotations as integers within a known range and precision, trading imperceptible accuracy for far fewer bits.",
    d: "A position within a world of 2,048 units at a precision of 1 cm needs about 18 bits, not 32. Rotations use smallest-three encoding of quaternions, and velocities use coarser steps. Both sides must apply the same rounding, and the server should simulate on the quantized values or the client's prediction will drift from the sent state. Ranges are chosen per field from gameplay limits. Precision that is too low is visible as jitter or snapping, too high wastes the budget, and it affects physics determinism.",
    k: ["Quantizing the simulation state itself vs only the sent copy: prediction and server stay exactly in agreement, but gameplay precision is limited to the network's.", "Per-field ranges vs one global format: bits are spent where they matter, but every new field needs a considered range."],
    p: ["Sending quantized state while the client predicts with full precision causes constant tiny corrections that look like shimmering.", "A range chosen too tight clamps fast objects at the edge and makes them stick."],
    v: "Sweep a value across its full range and confirm the maximum round-trip error equals half the quantization step, and that a fast-moving object near range limits is neither clamped nor wrapped.",
    dep: ["bit-packing"]
  },
  "integer-compression": {
    s: "Encodes small differences and counts with fewer bits using delta coding against a previous value and variable-length integers whose size grows with magnitude.",
    d: "Many values change a little between ticks, so sending the difference from the previous value costs a few bits. Identifiers and counts are sent with variable-length encodings that spend one byte or less when small. Entity ids in a snapshot are sent as gaps from the last id, which are usually one. Where distributions are known, entropy coding assigns shorter codes to likely values. It works against a reference both sides share, so it ties directly to baseline handling, and a missing reference makes the data undecodable.",
    k: ["Delta against the previous value vs absolute values: small, but one lost reference makes later data ambiguous without acknowledged baselines.", "Variable-length integers vs fixed width: great for usually-small values, but worse in the worst case and slower to read."],
    p: ["Deltas computed from the last sent value, not the last acknowledged one, break decoding after any loss.", "Variable-length encoding on already-dense fields adds a continuation bit for no gain."],
    v: "Encode a recorded trace of one hundred entities moving and confirm the mean per-entity size is below the absolute encoding, and that every value decodes identically after packets are dropped.",
    dep: ["bit-packing", "baseline-delta-compression"]
  },
  "schema-definition": {
    s: "A single description of every message and replicated type, from which serialization, validation and documentation code is generated for both client and server.",
    d: "Messages are declared with field names, types, ranges and quantization in a schema file. A generator emits reader, writer and size-estimate code, so both ends match by construction. The same description drives validation of incoming ranges, the debug inspector and the protocol documentation. Without it, hand-written read and write functions drift, and mismatches show up as corrupted packets in production. A schema also gives a hash that identifies the protocol version, which the handshake can compare.",
    k: ["Generated code from a schema vs hand-written serializers: ends writer and reader drift and enables tooling, but adds a build step and a language to learn.", "Reflection at runtime vs generation at build time: easy iteration, but slower and harder to optimize bit by bit."],
    p: ["Hand-edited generated code is silently overwritten at the next build and the fix vanishes.", "A schema that allows unbounded arrays lets a client request allocation of huge buffers."],
    v: "Change a field's range in the schema, rebuild, and confirm both client and server produce the new layout with no manual edits, and that the protocol hash changes and the old build is refused.",
    dep: ["bit-packing", "quantization"]
  },
  "schema-versioning": {
    s: "Rules for how messages change over time so that old and new builds can interoperate or be cleanly refused, with an explicit protocol version in the handshake.",
    d: "Live games are patched while players are online, and clients lag behind servers. Strategies include rejecting any mismatch by protocol hash, keeping a compatibility window where servers accept the previous version, and adding only optional fields at the end of messages. Replays and saved data need versions too. Exact bit-packed formats are brittle: inserting a field shifts every following bit, so evolution must be deliberate. The cost of strictness is forced updates; the cost of looseness is subtle corruption.",
    k: ["Strict equal-version matching vs a compatibility window: simple and safe, but every patch forces all players to update before they can play.", "Append-only fields with defaults vs versioned messages: easy compatible growth, but formats accumulate old fields that cannot be removed."],
    p: ["Reordering fields without bumping the version makes old clients read garbage from valid-looking packets.", "Replays recorded on one version cannot be played on the next, which breaks reviewing old matches."],
    v: "Connect an old-build client to a new-build server. Confirm the result is either a clean refusal with an update message or correct play within the supported window, and never a crash or garbled state.",
    dep: ["schema-definition", "connection-handshake"]
  },
  "message-registry": {
    s: "A table mapping compact message type identifiers to their handlers and serializers, so a packet's contents can be dispatched without parsing text or scanning handlers.",
    d: "Each message type receives a small integer id, assigned deterministically from the schema, and is registered with its serializer, handler, channel and permitted senders. The receiver reads the id, looks up the entry, and refuses types not allowed from that peer, such as a client sending a server-only message. It also records per-type counts and bytes for diagnostics. Ids must be identical on both sides, so assignment cannot depend on registration order at runtime. The registry is where per-type rate limits are enforced.",
    k: ["Ids assigned from the schema vs by registration order: identical on every build with no negotiation, but reordering the schema changes ids and needs a version bump.", "Per-type permission and rate limit in the registry vs inside each handler: enforced uniformly, but handlers lose flexibility to apply special cases."],
    p: ["A handler registered for any sender lets a client send server-only commands such as granting items.", "Registration order differing between client and server dispatches messages to the wrong handlers."],
    v: "Send every server-only message type from a test client and confirm each is refused and logged by type, and that per-type counters appear in the diagnostics view.",
    dep: ["schema-definition"]
  },
  "hostile-input-validation": {
    s: "Treats every received byte as attacker-controlled: bounds-checks lengths, ranges and counts during deserialization and aborts the packet on the first violation.",
    d: "Deserialization reads sizes and counts from the wire and must never trust them for allocation or loops. Every read checks it will not run past the end of the packet; every enumeration is checked against its legal range; every array count against a cap. A packet that fails any check is dropped entirely and the sender's violation score rises. Fuzzing with random and mutated packets is the standard way to find holes. Because deserialization is the largest piece of code reachable by unauthenticated senders, a single missing check can mean remote code execution or a crashed server.",
    k: ["Drop the whole packet on any violation vs skipping the bad field: contains the damage and simplifies reasoning, but a single corrupt byte discards good data in the same packet.", "Checking in the generated reader vs in handlers: uniform and hard to forget, but cannot express rules that depend on game state."],
    p: ["Allocating a buffer from a length field before checking it against the packet size lets one packet request gigabytes.", "Validating ranges only in debug builds leaves release builds trusting the wire."],
    v: "Run a fuzzer with mutated captured packets for an hour against the server and confirm zero crashes or hangs, bounded memory, and rising violation counters for the fuzzing source.",
    dep: ["message-registry", "bit-packing"]
  },
});
