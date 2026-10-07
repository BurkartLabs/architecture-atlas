// Details for the video conferencing plate, part 4: end-to-end encryption, transport and adaptation.
ATLAS.details("video-conferencing", {
  "frame-encryption": {
    s: "Encrypts each encoded audio or video frame on the sender with a key only participants hold, so forwarding servers carry packets they cannot decrypt.",
    d: "After encoding and before packetization, the client encrypts the frame payload with a per-sender key, leaving the headers a forwarder needs, such as layer markers, readable. Receivers decrypt after reassembly and before decoding. Hop-by-hop transport security still protects the outer packets. A small counter in each frame lets receivers select the right key as keys rotate. It is hard because encryption happens inside the media pipeline on every frame, adds overhead, and must be cooperatively applied by encoder, packetizer and every client implementation.",
    k: ["Encrypt the frame payload vs the whole packet end to end: frame encryption leaves routing metadata visible so servers can still forward and select layers, while whole-packet encryption would blind them.", "Per-sender keys vs one shared group key: per-sender keys limit damage from a compromised member, but multiply key distribution."],
    p: ["A receiver without the current key shows black video or silence with no indication of why.", "Encrypting before layer metadata is separated breaks server-side layer switching."],
    v: "Capture packets at the forwarding server and confirm payloads are unintelligible to it, while a participant with the key decodes the same frames; an outsider with a copy of the packets sees only noise.",
    dep: ["group-key-agreement", "video-encoder", "audio-encoder", "header-extensions"]
  },
  "group-key-agreement": {
    s: "A protocol by which all participants derive shared secrets without any server learning them, with efficient handling of members joining and leaving.",
    d: "Participants publish public key material, and a group protocol builds a tree of secrets so a join or leave updates keys in logarithmic work rather than a pairwise exchange. The result is an epoch with fresh keys that each member derives locally. The server only orders and relays handshake messages. Authentication ties keys to identities. It is hard because membership changes constantly in meetings, handshakes must be fast, and unreliable ordering of messages can leave members in different epochs.",
    k: ["Tree-based group protocol vs pairwise keys: a tree scales for large meetings, while pairwise is simple but needs a message per pair for each change.", "Server orders handshake messages vs peer consensus: a server ordering role is simple and available, but must be trusted for ordering though not for secrecy."],
    p: ["A member who misses a handshake message decrypts nothing until it resyncs.", "A late joiner can read earlier media if keys are not rotated on join."],
    v: "Add and remove participants in rapid succession and confirm every remaining member reaches the same epoch within a second, and a removed member cannot decrypt frames sent after its removal.",
    dep: ["verification-and-identity", "signaling-gateway", "key-rotation"]
  },
  "key-rotation": {
    s: "Replaces encryption keys when membership changes or on a schedule, so departed participants lose access and a stolen key stops being useful.",
    d: "On a leave or removal, the group moves to a new epoch so the departed member cannot read future media. On a join, rotation can also protect past media. Within an epoch, per-sender keys ratchet forward at intervals. Receivers keep the previous key for a short overlap to decode in-flight frames. It is hard because rotation must be coordinated: too slow leaves a removed member reading, too fast drops frames that arrive with an old key, and rotating in a large meeting causes a burst of key traffic.",
    k: ["Rotate on every membership change vs batch changes: per-change rotation gives the tightest security, but large meetings with churn produce constant handshakes.", "Keep old keys for overlap vs drop immediately: overlap avoids glitches around the switch, but extends the window in which an old key still works."],
    p: ["Frames in flight at rotation are undecryptable and cause a visible flash of black.", "A removed host keeps decrypting for several seconds because the new key reached others slowly."],
    v: "Remove a participant, then capture the next frames and verify the removed device cannot decrypt anything after the new epoch, while remaining participants show no more than one dropped frame.",
    dep: ["group-key-agreement", "frame-encryption", "roster-and-presence"]
  },
  "verification-and-identity": {
    s: "Lets participants check that the people in the meeting hold the keys they claim, through identity bindings and out-of-band comparison such as short codes.",
    d: "Each participant's key is bound to an identity by a credential from the organization, or checked manually by comparing a short code derived from the group's keys. The client shows verified and unverified states. A mismatch indicates a man-in-the-middle or a compromised server substituting keys. It is hard because most people do not compare codes, so the default experience relies on server-provided identity, and the user interface must make verification meaningful without alarming users constantly.",
    k: ["Organization-issued credentials vs manual code comparison: credentials scale and need no user effort, but trust the issuing authority, while manual codes trust nobody and are rarely used.", "Block unverified participants vs warn: blocking is safest, but a warning avoids breaking legitimate calls when credentials expire."],
    p: ["Users ignore verification warnings and so a malicious key substitution goes unnoticed.", "Credential expiry mid-meeting flags legitimate participants as unverified."],
    v: "Insert a test proxy that substitutes a participant's key and confirm other clients show a mismatch in the verification code and flag the participant as unverified.",
    dep: ["guest-and-sso-auth", "group-key-agreement"]
  },
  "exposed-metadata": {
    s: "What a server can still see under end-to-end encryption: who joins, when, how much media each sends and some headers, and the decision about how much to expose.",
    d: "Forwarders must read enough to route: stream identifiers, sequence numbers, layer markers and audio levels. Traffic patterns, such as who is sending video and when, remain visible. Optional protection of audio level indicators or participant lists reduces what leaks but also what the server can do. Roster and chat may or may not be protected. It is hard because every feature the server performs uses some metadata, so reducing exposure always removes a capability.",
    k: ["Expose audio levels for speaker detection vs hide them: exposing enables server-side speaker selection, while hiding protects speaking patterns but moves selection to clients.", "Minimize headers vs keep standard extensions: minimal headers leak less, but standard extensions keep interoperability and simpler servers."],
    p: ["Treating the call as private while the roster and timing remain visible to the operator misleads users about what is protected.", "Server logs capture identifiers that correlate participants across meetings."],
    v: "Inspect everything the server receives and stores for an encrypted call, and list each field; the list should match the published statement of what is visible and contain no payload content.",
    dep: ["frame-encryption", "header-extensions", "active-speaker-detection"]
  },
  "e2ee-feature-limits": {
    s: "The features that cannot work, or work differently, when the server cannot see media: server recording, captions, mixing, phone bridging and some moderation.",
    d: "Anything that needs the audio or video content on the server stops working unless a participant-side agent does it. Recording needs a trusted client that joins and saves the media. Captions run on-device or per participant. Phone and room-system bridges cannot join without receiving keys. Large webinars are limited as attendee scaling relies on server composition. It is hard because the limits must be shown to hosts before the meeting, and enabling the mode after features are planned surprises people.",
    k: ["Encrypted mode as an opt-in per meeting vs the default: opt-in preserves features for most meetings, while default maximizes privacy but constrains the product.", "Trusted client for recording vs no recording: a trusted participant client keeps recording possible, but makes that participant a place where content is available."],
    p: ["A host enables encryption and later finds that cloud recording and dial-in are unavailable during the meeting.", "A recording bot added as a participant silently weakens the guarantee the meeting claimed."],
    v: "Start an encrypted meeting and check each server-dependent feature: the interface should disable it before use and name why, and a recording client should appear in the roster as a participant.",
    dep: ["frame-encryption", "recording-orchestrator", "live-captions", "telephony-gateway"]
  },
  "ice-agent": {
    s: "Finds a working network path between two endpoints by gathering candidate addresses, testing pairs with connectivity checks and selecting the best that works.",
    d: "The agent gathers host, server-reflexive and relayed candidates, forms pairs with the peer's candidates, and sends checks in priority order. Successful checks nominate a pair, which carries media. It keeps checking to detect path failure and can restart on network change. With a forwarding server, the server is usually reachable at a public address, so checks are simple. It is hard because of NAT types, firewalls that allow only certain ports, and networks that change underfoot.",
    k: ["Prefer direct paths vs prefer relay: direct paths are cheaper and faster, while relay is more reliable in restrictive networks at server cost.", "Aggressive parallel checks vs ordered checks: parallel checks connect faster but create bursts that some firewalls treat as scans."],
    p: ["A path that passes checks but drops larger packets leaves a call connected yet silent for video.", "Candidate pairs across many interfaces make setup slow on machines with virtual adapters."],
    v: "Join from networks with a symmetric NAT, a UDP-blocking firewall and a normal home router; each must connect, and the report shows the chosen path type and time to connect for each.",
    dep: ["stun-and-turn", "ice-candidate-exchange", "tcp-tls-fallback", "dtls-srtp"]
  },
  "stun-and-turn": {
    s: "Servers that tell a client its public address and, when no direct path works, relay its media, providing connectivity at the price of extra hops and bandwidth.",
    d: "A discovery server answers requests with the address it saw the packet come from. A relay allocates a public address for the client and forwards packets between it and the peer. Credentials are short-lived. Relays are deployed in many regions and often on well-known ports to pass firewalls. Many deployments combine the relay with the media server. It is hard because relays carry real media load, cost bandwidth, and must be protected against abuse as free open proxies.",
    k: ["Dedicated relay fleet vs relay built into media servers: a fleet isolates cost and scaling, while built-in relays save a hop and reduce moving parts.", "Relay always vs only on failure: relay always gives uniform behavior and privacy of client addresses, but costs the most."],
    p: ["Relay credentials that never expire or are shareable let outsiders use the relay for their own traffic.", "Relay in the wrong region adds a long detour that shows up as delay."],
    v: "Force relay-only mode and confirm media flows through the nearest relay with added delay under the target, that credentials expire as configured, and a request with expired credentials is refused.",
    dep: ["edge-selection", "tcp-tls-fallback", "join-tokens"]
  },
  "tcp-tls-fallback": {
    s: "A last-resort path over TCP on the standard secure web port, for networks that block all UDP, accepting worse latency and head-of-line blocking.",
    d: "The client connects to the media server or relay over a TLS connection on the standard secure port, which most firewalls allow, and tunnels media within it. Packets are framed on the stream. The cost is that loss on the path stalls all following data until retransmitted, and the connection reacts to congestion in ways that interact poorly with real-time rate control. It is hard because it must work through proxies that inspect traffic, and quality is noticeably worse, so it must be used only when nothing else connects.",
    k: ["Try UDP first and fall back after a timeout vs run both in parallel: sequential fallback wastes seconds on blocked networks, while parallel racing connects fast but doubles setup traffic.", "Tunnel media over TLS vs over a web transport: TLS tunnels pass nearly everywhere, while newer transports are better for loss but are blocked in more places."],
    p: ["Fallback chosen too late makes people wait ten seconds to connect on a corporate network.", "Head-of-line blocking over TCP causes bursts of freeze followed by catch-up."],
    v: "Block UDP at a test firewall and confirm the client connects over TLS within the target time, reports the transport type, and keeps audio usable with measured added delay.",
    dep: ["ice-agent", "stun-and-turn"]
  },
  "dtls-srtp": {
    s: "Authenticates both ends and encrypts media in transit: a handshake over the media path derives keys, and each packet is then encrypted and integrity-protected.",
    d: "After connectivity is established, endpoints perform a handshake over the same path, verify certificate fingerprints that were exchanged in signaling, and derive session keys. Subsequent RTP packets are encrypted with those keys and carry authentication tags. Keys are per direction and may be rolled. The server terminates this layer in a forwarding design. It is hard because the signaling channel must be trusted to carry the fingerprints, handshake packets can be lost over unreliable paths, and each packet's cost adds up at server scale.",
    k: ["Fingerprints via signaling vs certificate authority checks: signaled fingerprints avoid certificate management, but trust the signaling channel's integrity.", "Hop-by-hop encryption terminated at servers vs end to end: hop-by-hop lets servers repair and route, while end-to-end excludes them from content."],
    p: ["Handshake packet loss causes slow or failed setup on lossy networks without retransmission.", "A compromised signaling path can swap fingerprints and allow a man in the middle."],
    v: "Capture traffic between a client and server and confirm packets are encrypted with changing sequence-bound nonces, tampered packets are rejected, and a wrong fingerprint aborts the handshake.",
    dep: ["ice-agent", "signaling-gateway", "sdp-negotiation"]
  },
  "rtp-rtcp": {
    s: "The packet format and control protocol for real-time media: sequence numbers, timestamps and payload types on data packets, plus reports on loss, delay and synchronization.",
    d: "Each media packet has a header with a sequence number to detect loss and reorder, a timestamp in the codec's clock, a stream identifier and payload type. A companion control protocol carries sender reports mapping timestamps to wall clock, receiver reports with loss and jitter, and feedback messages such as retransmission and keyframe requests. Large frames are split across packets. It is hard because feedback must be timely yet small, and every feature is added through extensions that both ends must agree on.",
    k: ["Many small packets vs fewer large packets: small packets limit the impact of loss and delay, but header overhead is high at low bitrates.", "Frequent feedback vs sparse feedback: frequent reports speed adaptation, but use bandwidth and processing, so they are rate-limited as a fraction of the media rate."],
    p: ["Packets larger than the path limit are fragmented or dropped, so some video frames never arrive.", "Misinterpreted timestamps clock-rate cause audio or video to play too fast or slow."],
    v: "Capture a call and confirm sequence numbers increase by one per packet per stream, sender reports map timestamps to wall time within a few milliseconds, and feedback messages follow loss within one report interval.",
    dep: ["dtls-srtp", "ice-agent"]
  },
  "header-extensions": {
    s: "Optional per-packet metadata fields negotiated between endpoints, such as audio levels, layer markers, transport-wide sequence numbers and absolute send times.",
    d: "Extensions add information without changing the payload format. Servers read layer markers to forward the right video layer, audio levels for speaker detection, and transport-wide counters for bandwidth estimation. Each is negotiated by an identifier in the session description and takes a few bytes per packet. It is hard because extensions are optional, so every combination of endpoint support must work, and the overhead accumulates in small audio packets.",
    k: ["Rely on extensions vs parse the payload: extensions let servers forward without decoding anything, while payload parsing works without negotiation but breaks under end-to-end encryption.", "Many extensions vs a minimal set: more extensions give richer behavior, but each adds bytes per packet and a compatibility case."],
    p: ["An endpoint that does not support a negotiated extension silently disables a feature such as bandwidth estimation.", "Extension identifiers collide across sessions after renegotiation, mislabeling data."],
    v: "Negotiate a call with and without the layer and level extensions and verify features degrade as documented: forwarding still works but layer switching or speaker detection falls back.",
    dep: ["sdp-negotiation", "rtp-rtcp"]
  },
  "bundling-and-muxing": {
    s: "Carries all audio, video and data streams of a session over one network port, so only one path has to be found, kept alive and secured.",
    d: "Instead of separate ports for each media type and control, a single transport multiplexes everything and demultiplexes at the receiver by stream identifier and the first bytes of each packet. This means one connectivity check, one handshake and one set of firewall openings per client. It simplifies server load balancing by using a single address per participant. It is hard because multiplexing demands unambiguous demultiplexing rules, and a failure on the single path takes down everything at once.",
    k: ["Single port per participant vs port per stream: a single port reduces setup and firewall cost, while separate ports isolate failures but multiply connections.", "Port per room on a server vs shared port with demultiplexing by address: shared ports conserve addresses, but demultiplexing on source address breaks when a client's address changes."],
    p: ["A client's address changes with mobile roaming and the server's address-based demultiplexing drops all its packets.", "Port exhaustion on servers when each participant uses a unique port."],
    v: "Open a session with audio, video and data and confirm exactly one transport is in use, and a client changing address resumes all streams after a connectivity check.",
    dep: ["ice-agent", "rtp-rtcp", "sdp-negotiation"]
  },
  "data-transport": {
    s: "A message transport beside media for application data, offering ordered or unordered, reliable or best-effort delivery over the same secured path.",
    d: "A stream-oriented protocol runs over the encrypted datagram path and provides multiple independent channels, each with its own reliability and ordering. Applications use it for control messages, chat, files and cursor positions. Congestion control applies to the transport, so large transfers could squeeze media if not limited. It is hard because the transport shares the path with real-time media and a bulk transfer on it competes with video, and because behavior must be consistent across implementations.",
    k: ["Datagram data transport vs a separate reliable connection: a shared path needs no extra connectivity, while a separate connection isolates bulk data from media.", "Reliable per-message retransmission limits vs unlimited: limits keep latency bounded for state that goes stale, but drop messages the application may need."],
    p: ["A large file sent on the data channel delays media on the same path.", "An application assumes ordered delivery on a channel configured as unordered."],
    v: "Send a file over the data channel while a call is in progress, and confirm media quality metrics stay within normal ranges and the file arrives intact with its checksum matching.",
    dep: ["dtls-srtp", "pacer", "bundling-and-muxing"]
  },
  "pacer": {
    s: "Spreads outgoing packets evenly over time instead of sending a frame's packets in one burst, so queues on the path do not overflow and delay estimates stay clean.",
    d: "Encoded frames are queued; the pacer releases packets at a rate derived from the bandwidth estimate, with some headroom for repairs and probes, and a priority order that puts audio first. Smoothing prevents the sender's bursts from creating the very delay the estimator reads as congestion. It also feeds probing clusters. It is hard because pacing too slowly adds delay at the sender, too fast reintroduces bursts, and the pacer's own queue must be reported to the encoder so it can reduce the bitrate.",
    k: ["Pace at estimated rate vs send immediately: pacing keeps queues small and estimation accurate, but adds a bit of sender delay.", "Strict audio priority vs weighted share: strict priority protects speech, but a heavy audio load could starve repairs and video."],
    p: ["A paced queue grows when the estimate falls and the encoder keeps producing frames, creating seconds of delay.", "Large keyframes released at the pacing rate take hundreds of milliseconds to leave."],
    v: "Send a keyframe-heavy stream through an emulated 1 Mbps link and confirm queue delay at the bottleneck stays small and the pacer reports queue depth to the rate controller.",
    dep: ["bandwidth-estimator", "bitrate-allocator", "rtp-rtcp"]
  },
  "bandwidth-estimator": {
    s: "Continuously estimates how fast the sender can safely transmit on the path, combining the trend in packet arrival delays with observed loss.",
    d: "The receiver, or the sender using feedback, records per-packet arrival times. Growth in inter-arrival delay indicates a queue is filling, so the estimate falls; stable delay allows careful increase. Loss-based limits act as a backstop. Feedback arrives in frequent small reports that carry a transport-wide sequence. The estimate drives the pacer and the allocator. It is hard because the path is shared with other traffic, wireless links add noise that looks like congestion, and the estimator must be fair to competing flows while still reaching high rates quickly.",
    k: ["Send-side estimation vs receiver-side estimation: send-side uses richer feedback and holds all logic at the sender, while receiver-side needs less feedback traffic but gives the sender less insight.", "Delay-based vs loss-based control: delay-based reacts before loss and keeps latency low, while loss-based is robust to jittery links but fills queues first."],
    p: ["Wireless jitter is misread as congestion, so the estimate collapses on a healthy link.", "Competing bulk transfer fills the queue and the estimator backs off permanently, starving the call."],
    v: "Emulate a link stepping from 5 to 1 Mbps and back with 50 ms queue; the estimate should fall within about one second, stay below capacity, and recover to above ninety percent of capacity in tens of seconds.",
    dep: ["delay-and-loss-controller", "rtp-rtcp", "header-extensions", "probing"]
  },
  "delay-and-loss-controller": {
    s: "The decision logic that turns delay trends and loss rates into increase, hold or decrease actions, and sets the final target rate.",
    d: "A trend filter fits the sequence of delay gradients and compares it to an adaptive threshold, producing states such as normal, overusing and underusing. Overuse triggers a multiplicative decrease relative to the measured throughput; normal allows gradual increase. A separate loss controller caps the rate when loss exceeds thresholds. The final target is the minimum of the two. It is hard because thresholds that are right for one network are wrong for another, so they adapt, and the controller can oscillate if its feedback is slow.",
    k: ["Adaptive thresholds vs fixed thresholds: adaptive thresholds keep fairness against loss-based competitors, but make behavior harder to predict.", "Multiplicative decrease vs gentle decrease: sharp decreases clear queues fast, but visibly drop quality on a transient blip."],
    p: ["Slow feedback makes the controller act on stale data and oscillate between over- and under-use.", "Thresholds tuned on a wired testbed misbehave on cellular links."],
    v: "Run a library of recorded network traces through the controller offline and check that target rate, queue delay and fairness against a competing flow stay within defined limits on each trace.",
    dep: ["bandwidth-estimator", "pacer"]
  },
  "probing": {
    s: "Briefly sends extra packets in tightly spaced clusters to test whether more bandwidth is available, instead of waiting for slow incremental increase.",
    d: "After a startup, a drop, or a layer being enabled, the pacer sends short bursts at a multiple of the current rate. The receiver's measurement of how quickly the bursts arrive gives an estimate of capacity. Padding or redundant packets fill the probes when no media is available. The result raises the estimate quickly. It is hard because probes add load on a possibly congested path and can cause the delay they are meant to avoid, so probing is limited in size and frequency.",
    k: ["Active probing vs gradual increase: probing reaches the right rate in a fraction of a second, but injects load that can harm a shared link.", "Probe with padding vs with real media: padding is cheap and flexible, while using repair or redundant media wastes nothing but is not always available."],
    p: ["Frequent probing on a marginal link repeatedly pushes it into congestion.", "Probes smaller than the packet-pair resolution give noisy estimates."],
    v: "Start a call on an idle 10 Mbps link and confirm the rate reaches above eight Mbps within a couple of seconds due to probes, while queue delay returns to baseline after each probe.",
    dep: ["bandwidth-estimator", "pacer", "bitrate-allocator"]
  },
  "bitrate-allocator": {
    s: "Divides the available sending rate among audio, video layers and screen share according to priority, producing a target for each encoder.",
    d: "Given the estimate, the allocator gives audio its needed share first, then enables layers in priority order: the most important stream's base layer, then others' base layers, then upgrades. Screen share usually outranks camera. Layers that cannot be sustained are paused rather than starved. It also considers what receivers want, which can lower the total needed. It is hard because the best split is subjective and changes with context, and on-off decisions for layers must not flip rapidly.",
    k: ["Strict priority order vs proportional share: strict order guarantees the key stream, while proportional share degrades everything evenly.", "Pause layers vs reduce all layers: pausing preserves quality of what remains, but a paused layer takes time to restart."],
    p: ["A layer toggling on and off every few seconds is more annoying than steady lower quality.", "The allocator does not know receivers dropped a layer and keeps sending bits nobody uses."],
    v: "Reduce available bandwidth in steps and confirm streams are dropped in the documented order: audio stays, then base video layer, then upper layers, with no layer toggling more than once per hysteresis period.",
    dep: ["bandwidth-estimator", "layer-topology", "audio-priority", "video-encoder"]
  },
  "nack-retransmit": {
    s: "A receiver names the sequence numbers it did not get, and the sender or a server resends them, repairing loss at the cost of one round trip.",
    d: "The receiver detects gaps and sends compact negative acknowledgements. The sender looks the packets up and resends them, often wrapped so they can be told apart from originals and counted in rate control. It works when round trip is short compared to the decode deadline; otherwise the request is pointless. Limits on request rate and age keep it from adding to congestion. It is hard because retransmission competes with new data for bandwidth, and a long round trip makes repairs arrive too late.",
    k: ["Retransmit vs forward error correction: retransmission spends bandwidth only on losses and is exact, while forward correction repairs without a round trip but costs bandwidth always.", "Request all gaps vs only repairable ones: requesting everything is simple, but wastes bandwidth on packets that would arrive after the frame deadline."],
    p: ["Repair requests continue during heavy congestion, amplifying it.", "Retransmitted packets are counted as new data and double-counted in estimates."],
    v: "At 50 ms round trip and two percent loss, confirm over ninety percent of lost packets are repaired in time and the repair traffic stays under its cap; at 400 ms confirm requests are suppressed.",
    dep: ["retransmission-cache", "rtp-rtcp", "bitrate-allocator"]
  },
  "forward-error-correction": {
    s: "Sends extra coded packets with the media so receivers can rebuild lost packets without waiting for a resend, trading steady overhead for repair without delay.",
    d: "The sender computes parity packets over a group of media packets, and the receiver can recover one or more missing packets from the rest. The amount of redundancy is adapted to measured loss and round trip. For audio, redundancy can also embed the previous frame in the next packet. It is hard because bursty loss defeats parity designed for random loss, and redundancy raises bitrate exactly when the network has the least to spare.",
    k: ["Higher redundancy on high-delay paths vs retransmission on low-delay paths: redundancy is the tool when round trips are too long for repairs, while repairs cost less when they are fast.", "Protect only keyframes and base layers vs everything: unequal protection spends bits where loss does the most damage."],
    p: ["Parity sized for random loss does nothing against a loss burst of several packets.", "Overhead on a congested link increases loss, which increases the redundancy added."],
    v: "Apply ten percent random loss at 300 ms round trip and compare freeze counts with correction on and off; correction should cut freezes sharply with overhead near the configured ratio.",
    dep: ["rtp-rtcp", "bitrate-allocator", "audio-encoder"]
  },
  "resolution-adaptation": {
    s: "Lowers or raises video resolution and frame rate to fit the bitrate and the sender's processing capacity, choosing which of the two to sacrifice by content type.",
    d: "When the target bitrate falls, the encoder or sender reduces resolution, frame rate or both. For camera video of people, resolution drops first; for screen content, frame rate drops first to keep text sharp. It also reacts to CPU overload and encode time, signaled when frames take too long. Changes are applied with hysteresis, as each change may need a keyframe. It is hard because the best choice depends on content and viewing size, and quality scores correlate poorly with bitrate.",
    k: ["Degrade resolution vs degrade frame rate: dropping resolution preserves motion for faces, while dropping frame rate preserves sharpness for text.", "React to bandwidth only vs also to CPU: bandwidth-only is simpler, but an overloaded encoder at plenty of bandwidth yields frozen video."],
    p: ["Resolution flaps between two sizes around a threshold, creating visible pulses.", "CPU overload is misdiagnosed as network problems and bitrate is cut needlessly."],
    v: "Limit a sender's bitrate to 300 kbps then restore it, with CPU stressed in a second run; confirm resolution steps match the policy for each case and rises again within the hold period.",
    dep: ["bitrate-allocator", "video-encoder", "screen-content-encoder"]
  },
  "audio-priority": {
    s: "Rules that protect audio when the network degrades: reserve its bandwidth, prioritize its packets and drop video first, because broken speech ends a meeting faster than frozen video.",
    d: "Audio uses little bandwidth, so the allocator sets it aside before video. The pacer sends audio packets ahead of video bursts, and marking on packets lets networks that support it treat them preferentially. Under severe constraint, the system can switch a participant to audio-only. Receivers prefer audio in jitter handling too. It is hard to apply fairness: a participant on a tiny link may consume a large share of their link for audio, and in a room of many such, the server's forwarding priorities must remain consistent.",
    k: ["Audio-only fallback automatic vs user-chosen: automatic keeps calls alive on poor links, but removes video without the user's consent and may surprise them.", "Network-level priority marking vs application-only: markings help when honored, but many networks ignore or rewrite them."],
    p: ["Video burst fills a shared queue and delays audio packets despite application prioritization.", "Audio-only mode is entered but never exited after the network recovers."],
    v: "Cut a receiver's link to 100 kbps and confirm speech stays intelligible with jitter within bounds, video pauses or lowers first, and video returns within seconds after the link recovers.",
    dep: ["bitrate-allocator", "pacer", "audio-encoder"]
  },
  "layer-topology": {
    s: "The design choice between publishing several independent resolutions and publishing one scalable stream with dependent layers, and how receivers switch among them.",
    d: "With simulcast, a sender encodes separate low, medium and high streams that decode independently, so a server forwards exactly one per receiver and switches at keyframes. With scalable coding, one stream has a base layer and enhancement layers, so a server can drop layers without keyframes, and the sender spends less total bitrate. Temporal layers lower frame rate by dropping frames. It is hard because scalable coding support varies across devices and hardware encoders, and simulcast multiplies sender encode cost.",
    k: ["Simulcast vs scalable coding: simulcast works with any encoder and is robust to loss, while scalable coding is more efficient and switches faster but needs codec and hardware support.", "Number of layers: more layers fit more receivers closely, but cost sender CPU and uplink."],
    p: ["Sender's uplink cannot carry all simulcast layers, so the top layer is starved and no receiver gets high quality.", "Scalable layer dependencies break when an enhancement layer is lost and the base is not protected."],
    v: "Send three layers and confirm each decodes independently as expected, then drop to a single receiver on a lower link and confirm the server forwards the matching layer with no keyframe stall in the scalable case.",
    dep: ["video-encoder", "layer-selector", "bitrate-allocator"]
  },
});
