// Details for the VoIP & PBX plate, part 4: media transport, NAT traversal, media servers, trunks.
ATLAS.details("voip-pbx", {
  "rtp-packetization": {
    s: "Slicing encoded audio into small timestamped packets, usually one every 20 milliseconds, and sending them over UDP in sequence.",
    d: "Each packet carries a header with a sequence number, a timestamp in codec clock units, a payload type and a source identifier, followed by one or more codec frames. The receiver uses the sequence to detect loss and reorder, and the timestamp to schedule playout. Packet interval trades overhead against delay: shorter intervals reduce delay and multiply headers. Ports are chosen from a range and usually come in pairs with control traffic. Hard parts are clock drift and a firewall that must open ports dynamically.",
    k: ["20 ms packets vs 30 or 40 ms: longer packets cut header overhead and bandwidth, and add delay and make each lost packet more audible.", "Even and odd port pairs vs multiplexed control and media on one port: pairs are traditional, multiplexing halves the ports for firewalls and needs support at both ends."],
    p: ["Packet interval mismatch between sender and receiver causes buffer under- or overruns that sound like clicks.", "A narrow firewall port range limits concurrent calls without any signaling error."],
    v: "Capture a call, check packets arrive at the negotiated interval within a millisecond or two, sequence numbers are continuous, timestamps advance by exactly the packet duration, and payload type matches the answer.",
    dep: ["codec-negotiation","voice-codecs"]
  },
  "rtcp-feedback": {
    s: "The control stream alongside RTP that carries sender and receiver reports, participant identity and requests such as retransmission or keyframes.",
    d: "RTCP runs on its own port or multiplexed with RTP and is limited to about five percent of session bandwidth. Sender reports pair media timestamps with wall-clock time, enabling lip sync and delay computation. Receiver reports describe loss and jitter. Extensions carry feedback such as packet loss notices and bitrate hints, and some devices use them to adapt. In voice-only deployments RTCP is often disabled or blocked, losing the main source of quality data.",
    k: ["Enabling RTCP everywhere vs only where monitored: everywhere provides data and uses bandwidth, while selective is cheap and leaves blind spots.", "Rely on feedback to adapt vs fixed behavior: adapting uses bandwidth better, while fixed settings are predictable and less likely to oscillate."],
    p: ["A firewall opens only the RTP port and drops RTCP, so monitoring shows no data for those calls.", "Bandwidth limits for RTCP set too high waste capacity on low-rate links."],
    v: "Make a call through each network path and confirm that RTCP reports from both sides arrive at the collector every few seconds, with round-trip time close to ping time measured separately.",
    dep: ["rtp-packetization"]
  },
  "codec-negotiation": {
    s: "Selecting one voice codec that both ends and every hop between them support, balancing quality, bandwidth and CPU cost.",
    d: "Each side lists codecs by preference in its session description. The answerer chooses from the offer, usually by its own preference or the offerer's, and the server may filter or reorder codecs by policy, for example removing high-bandwidth ones for a remote site. If the legs have no codec in common a transcoder is inserted. Telephone-event and comfort noise formats are negotiated too. Mid-call changes are possible. Hard part is a multi-hop call, where each leg may settle differently.",
    k: ["Prefer wideband codecs vs prefer narrowband for compatibility: wideband sounds better and needs support everywhere, narrowband works with every carrier.", "Pass codecs through end to end vs transcode at the edge: passing preserves quality and CPU, transcoding allows each leg its own best choice."],
    p: ["An answer selects a codec the media path cannot carry because of the bandwidth limit, and audio breaks.", "Differing payload type numbers for the same codec across legs cause mismatched decoding when numbers are copied blindly."],
    v: "Call between endpoints with different codec lists across a trunk and verify the actual RTP payload types used on each leg match the negotiated descriptions, and that audio is clear in both directions.",
    dep: ["sdp-offer-answer","voice-codecs","device-profiles"]
  },
  "voice-codecs": {
    s: "Algorithms that compress speech for transmission: older narrowband codecs with simple coding, and wideband codecs that sound better at similar rates.",
    d: "Narrowband codecs carry 300 to 3400 Hz at 8 to 64 kbit/s, and the uncompressed 64 kbit/s one is universal on the phone network. Wideband codecs carry up to 7 kHz or more, adapt bit rate and include loss concealment and in-band redundancy. Choice affects CPU, quality under loss, delay from frame size, and whether transcoding is needed at the carrier boundary. Licensing may limit use. Difficulty lies in interactions: compression with fax, music on hold or tones.",
    k: ["Uncompressed narrowband vs compressed wideband: uncompressed is universal and heavy on bandwidth, compressed is efficient and sounds better, but needs support and CPU.", "Variable bit rate vs constant: variable adapts to speech and complicates bandwidth planning and monitoring."],
    p: ["A heavily compressing codec on music on hold sounds distorted, because it is tuned for speech.", "Two compression stages in a row, for example a mobile network and a trunk, degrade speech more than either alone."],
    v: "Play a standard speech set through each codec and loss level in a lab, then compare quality scores with a signal-comparison tool, and confirm results meet the minimum for the chosen default.",
    dep: ["rtp-packetization"]
  },
  "jitter-buffer": {
    s: "A receiver buffer that holds arriving packets briefly and plays them at an even rate, trading added delay for smooth audio.",
    d: "Packets arrive at uneven intervals. The buffer holds them a short while, reorders by sequence and releases on a steady clock. A fixed buffer has constant delay. An adaptive one grows when jitter rises and shrinks when it falls, stretching or compressing audio imperceptibly. Packets that arrive after their playout time are discarded as lost. Buffer size is the main control over mouth-to-ear delay. Hard to get right: adaptation that lags a burst, or that shrinks too fast and clicks.",
    k: ["Fixed vs adaptive depth: fixed has predictable delay and fails on changing networks, adaptive follows conditions and adds complexity and artifacts.", "Aggressive low delay vs conservative: low delay feels natural in conversation and drops more late packets, high delay is clean and makes talk awkward."],
    p: ["A buffer sized for a quiet network discards bursts on a busy link and the audio breaks up.", "Buffers in series, at phone, gateway and mixer, add their delays and push total delay past comfort."],
    v: "Add controlled jitter of 40 ms in a lab, measure discarded packets and playout delay during a call, and confirm audio remains continuous and delay stays within the design limit.",
    dep: ["rtp-packetization","packet-loss-concealment"]
  },
  "packet-loss-concealment": {
    s: "Hiding lost or late packets by synthesizing audio to fill the gap, so short losses are not heard as clicks or silence.",
    d: "When the buffer has no packet for the next slot, the decoder generates a replacement by extending the previous waveform, fading it out for longer gaps. Some codecs carry redundancy for the previous frame or forward error correction, letting the next packet repair the lost one. Concealment works well for single packets and poorly for bursts. It cannot repair what the network loses repeatedly. The balance is between concealment quality and the bandwidth spent on redundancy.",
    k: ["Decoder-side concealment alone vs added redundancy: decoder-only costs no bandwidth and fails on bursts, redundancy repairs bursts and increases bitrate and delay.", "Retransmission for voice vs none: retransmission repairs loss when delay allows and rarely fits a conversational budget."],
    p: ["Loss of two or three consecutive packets exceeds concealment and sounds like a dropout.", "Redundancy enabled on an already congested link adds traffic and increases the loss it was meant to fix."],
    v: "Apply random five percent and bursty loss in a lab, and compare quality scores with and without concealment and redundancy, confirming the configured setting reaches the target quality score.",
    dep: ["jitter-buffer","voice-codecs"]
  },
  "dtmf-events": {
    s: "Carrying keypad digits across IP either as special named events in the media stream (RFC 4733), as tones in the audio, or as signaling messages.",
    d: "In-band tones are passed as audio, and a compressing codec can distort them so they are missed. The event method sends digit, duration and volume as separate packets with redundancy, which survives loss and compression. A third approach sends digits in signaling messages. Both ends must agree through negotiation, and a gateway converts between methods. IVR systems and conference controls depend on it. Typical faults are doubled digits from retransmitted end packets and digits lost when methods mismatch.",
    k: ["Events in RTP vs in-band tones: events are reliable and need negotiated support, in-band tones work anywhere with a clean uncompressed codec.", "Events vs signaling-based digits: signaling is reliable and unsynchronized with the audio, events stay aligned with the voice."],
    p: ["A gateway receives events and ignores them because the payload type differs from what it negotiated, so menus never see digits.", "A repeated end-of-event packet is counted as another keypress and the PIN has an extra digit."],
    v: "Send a known 16-digit string from each device type through each trunk to an IVR that echoes what it received, and confirm exact digits with no doubles or drops at 5 percent loss.",
    dep: ["rtp-packetization","codec-negotiation"]
  },
  "echo-cancellation": {
    s: "Removing the far-end voice that leaks back from a speaker into a microphone, so the talker does not hear their own delayed voice.",
    d: "An adaptive filter models the acoustic or line path from the speaker to the microphone and subtracts the predicted echo from the captured signal. Delay in an IP network lengthens echo so it becomes noticeable and annoying, so cancellation is essential at speakerphones and at gateways to analog lines. Filters need time to converge and struggle with double talk, when both speak at once. It lives in phones, headsets and gateways. Faults arise when two cancelers operate in series, or when it interferes with fax and modem tones.",
    k: ["Cancel at the device creating the echo vs at the network gateway: at the device is best and requires every device to do it, gateway cancellation covers legacy lines and adds processing.", "Aggressive suppression vs gentle: aggressive removes echo and clips the start of words, gentle keeps natural speech and lets some echo through."],
    p: ["Tail length shorter than the real echo path leaves audible echo on speakerphone calls.", "A canceler left on during a fax call corrupts the tones and fails the transmission."],
    v: "Make a speakerphone call over a path with 150 ms delay, speak a test sentence, and measure the echo return loss on the far side's recording, confirming it stays above the design threshold after convergence.",
    dep: ["rtp-packetization"]
  },
  "rport-contact-fixing": {
    s: "Using the source address a message actually came from, rather than the address inside it, to reply and to route later requests to a phone behind a translator.",
    d: "A phone behind NAT puts its private address in Via and Contact headers. The rport extension asks the server to record and reply to the observed public address and port. The server also rewrites or remembers the Contact so mid-call requests go to the observed address, over the same connection if needed. This fixes most signaling problems for registering phones. It does not fix addresses inside the media descriptions. Hard part is that bindings change when the translator changes mapping.",
    k: ["Rewrite Contact at the server vs record the observed source separately: rewriting is simple and visible in every hop, separate bookkeeping preserves the original and demands more logic.", "Apply to all clients vs only those detected behind NAT: all is uniform, detection avoids touching addresses that are fine but can misjudge."],
    p: ["A translator that changes the source port between requests breaks the stored binding and calls fail until re-registration.", "Applying the fix to a public-address phone breaks proxies that expected the original contact."],
    v: "Register phones from behind two different translators, call each from outside, and confirm in a capture that requests are sent to the translator's public address and reach the phone, both at registration and mid-call.",
    dep: ["registrar","location-service","sip-transports"]
  },
  "symmetric-rtp-latching": {
    s: "Learning where to send a call's audio from the address its first incoming media packet came from, ignoring the unreachable private address in the session description.",
    d: "The media relay or endpoint waits for the first packet from the other side, then sends return audio to that packet's source address and port. It works when the translator keeps the same mapping for both directions. A latch may be restricted to the first packet or relearned if the source changes. It is the main practical NAT fix for media, since it needs no discovery protocol. The security hazard is that anyone who sends a packet first can hijack the stream, so latching is restricted by timing and validation.",
    k: ["Latch on the first packet vs trust the description: latching works behind NAT automatically, while trusting the description is safe and fails for private addresses.", "Allow relatching when the source changes vs lock after the first packet: relatching follows network changes and invites hijack, locking is safer and fails after a mapping change."],
    p: ["An attacker sends packets to the relay port before the real party and takes over the audio.", "Both ends behind translators wait for each other to send first and neither does, so there is silence."],
    v: "Place calls with each side behind a translator and the phones silent for the first seconds, and confirm both directions of audio start within a second of the first packet and the relay shows the latched address.",
    dep: ["media-relay","rtp-packetization"]
  },
  "stun-discovery": {
    s: "A simple query to a server on the public internet that tells a client what public address and port its traffic appears to come from.",
    d: "The client sends a binding request to a STUN server and the server replies with the source address it saw. The client then advertises that address in its session description as a candidate. It also helps detect the type of translator by repeating from different ports. It works for translators that map consistently regardless of destination, and fails for symmetric ones that use a different port per destination. It is a building block of ICE. It adds startup delay and requires a reachable server.",
    k: ["Own STUN servers vs public ones: own servers are reliable and controlled, public ones cost nothing and may be removed or blocked.", "Query once at startup vs for every call: once saves traffic and goes stale when mappings change, per call is accurate and adds delay."],
    p: ["A reflexive address gathered earlier is no longer valid after a translator rebinding and the call has one-way audio.", "Symmetric translators give a different mapping for the peer, and the discovered address is useless."],
    v: "From behind several translator types, run discovery against the server and confirm the reported address matches the translator's public address, and that a direct call using it works or correctly falls to a relay.",
    dep: ["ice-negotiation"]
  },
  "ice-negotiation": {
    s: "A procedure where both ends gather candidate addresses, exchange them and test pairs of them to find the best working path for media.",
    d: "Each side collects host, server-reflexive from STUN and relayed candidates from TURN, and sends them in its session description. Both then send connectivity checks on every pair in priority order, and the nominated pair carries media. It can be restarted when the network changes. It prefers direct paths, then relays. It handles most NAT cases without any help from the signaling servers. The costs are setup time, complexity and many candidate pairs, and the need for both ends to implement it.",
    k: ["Full ICE vs lite ICE at servers: full tests every pair for correctness, lite is simple for public servers that only answer checks.", "Gather all candidates before sending the offer vs trickle them: waiting simplifies and delays ringing, trickling starts faster and complicates signaling."],
    p: ["Checks take several seconds on a path with many failing candidates and the caller hears nothing after answer.", "A network change mid-call without an ICE restart leaves the call silent until it is torn down."],
    v: "Call across NAT type combinations and measure time to first audio, confirm the chosen candidate type for each, and that moving a client between networks recovers audio within a few seconds.",
    dep: ["stun-discovery","turn-relays","sdp-offer-answer"]
  },
  "turn-relays": {
    s: "Servers on the public internet that forward media between two clients that cannot reach each other directly, used as a last resort.",
    d: "A client requests an allocation of a relay address from the server, authenticates, and sends its media to the server for forwarding to the peer. Media then flows through the relay for both directions, adding delay and consuming the operator's bandwidth. It works through the strictest firewalls, particularly when run over TCP or TLS on a common port. Deployment needs capacity planning and abuse prevention, since an open relay can carry anyone's traffic. Credentials are short-lived and tied to the user.",
    k: ["Relay only as a fallback vs relay always: fallback saves bandwidth and uses direct paths, always hides addresses and gives consistent recording at a cost.", "UDP relay vs TCP or TLS on port 443: UDP is better for audio and often blocked, TCP or TLS passes most firewalls and suffers when packets are lost."],
    p: ["A relay with long-lived shared credentials is found and used to carry unrelated traffic at the operator's expense.", "Relays placed far from the users add delay that pushes calls over the delay budget."],
    v: "Block all direct UDP in a test network and confirm calls connect through the relay, measure the added delay, and verify credentials stop working after their expiry.",
    dep: ["ice-negotiation","media-relay","rate-limiting-acls"]
  },
  "router-alg-pitfalls": {
    s: "Routers that inspect and rewrite SIP packets in transit, which sometimes help and often break signaling by changing addresses the system already corrected.",
    d: "An application-layer gateway in a router looks for SIP messages and rewrites addresses and media ports inside them, and opens pinholes for the media. Implementations are often old, incomplete or wrong, and conflict with TLS (which it cannot read), with a server doing its own fixing, and with unusual headers. Symptoms are registrations that work for a while then fail, calls with one-way audio, or corrupted messages. Standard advice is to disable it and let the system handle NAT.",
    k: ["Disable the router's ALG vs depend on it: disabling gives the voice system full control, depending on it is acceptable only if tested and fails with new devices.", "Use TLS so the router cannot read signaling vs plain signaling: TLS stops interference and encrypts, while plain allows the router to help and corrupt."],
    p: ["Router rewrites addresses in a message the server has already fixed, producing an address that is unreachable from anywhere.", "The ALG applies a short idle timeout and drops registrations on quiet phones."],
    v: "Toggle the ALG on a representative router, capture messages before and after the router, and confirm the system works with it disabled for registration, calls, hold and transfer for at least a day.",
    dep: ["rport-contact-fixing","sip-over-tls"]
  },
  "media-server": {
    s: "A server that handles audio on behalf of call control: playing prompts, recording, mixing, detecting digits and bridging calls, under commands from the signaling side.",
    d: "Call control sends a command, such as play this file, collect digits or join this room, over a control interface. The server performs the work on the call's RTP stream and reports results. Each active stream uses CPU and memory, so capacity is counted in concurrent sessions. Media servers are separate from signaling so that each scales and fails independently. Hard parts are low latency under load, thousands of streams on timed packet pacing, and cleaning up after a controller that disappears.",
    k: ["Separate media servers vs integrated with signaling: separate scales and fails independently, integrated is simpler and ties media capacity to signaling nodes.", "Pooled media servers vs assigned per tenant: pooled uses capacity best, assigned isolates heavy users."],
    p: ["A controller crash leaves sessions running on the media server forever, consuming channels.", "Pacing jitter in the server from CPU contention shows up as audio breakup for all calls on that node."],
    v: "Load the server with its rated count of simultaneous streams, measure packet pacing jitter at the output and confirm it stays below the target, and kill the controller to confirm sessions are reclaimed within the timeout.",
    dep: ["media-control-interface","realtime-scheduling","rtp-packetization"]
  },
  "conference-mixer": {
    s: "The component that combines the audio of every participant into per-listener mixes, applying gain control and speaker selection.",
    d: "For each interval the mixer decodes every participant to linear audio, selects active speakers, sums them, subtracts each listener's own audio and re-encodes. Mixing at one sample rate and converting others adds quality loss and CPU. Automatic gain control evens volume. Large conferences limit mixing to a few loudest speakers and send everyone the same mix. Silence is detected so idle streams cost less. Hard parts are CPU growth with participants and the added delay of decoding and encoding.",
    k: ["Mix N minus one for each listener vs a single common mix: per-listener excludes echo of oneself at a cost that grows with participants, a common mix is cheap and needs echo handling.", "Decode and re-encode vs forwarding encoded streams: mixing works with every phone, forwarding saves CPU and needs endpoints to mix."],
    p: ["Participants on different sample rates are all converted to the lowest and the whole room sounds narrow.", "Automatic gain control pumps up the noise of a muted-by-accident open microphone."],
    v: "Run a room at its maximum size with synthetic talkers, check each listener's mix excludes their own signal, delay through the mixer is below the budget, and CPU stays below its limit.",
    dep: ["media-server","voice-codecs","jitter-buffer"]
  },
  "transcoder": {
    s: "Converts audio from one codec to another when two parties have no codec in common, at the cost of CPU, delay and some quality.",
    d: "The transcoder decodes each packet to linear audio and re-encodes it with the other leg's codec, handling different frame sizes, sample rates and packet intervals. It also converts DTMF events to or from in-band tones, and comfort noise. Each call needing it uses a dedicated channel, so capacity is planned separately and scarcity can reject calls. Hardware acceleration may be used. The common aim is to avoid it: choose codecs so most calls pass through untouched.",
    k: ["Avoid transcoding by aligned codec policy vs transcoding freely: aligned policy saves CPU and preserves quality, free transcoding makes everything connect and silently consumes capacity.", "Dedicated transcoding hardware vs general CPUs: dedicated gives high density per watt and fixed capacity, CPUs are flexible and cost more per channel."],
    p: ["Capacity runs out at peak and calls needing a conversion fail, while pass-through calls work.", "Two chained transcodes in the path produce clear quality loss that nobody traces to the cause."],
    v: "Place the rated number of simultaneous calls requiring conversion and confirm all succeed with the quality score above the target, then place one more and confirm it is rejected or routed cleanly with a clear reason.",
    dep: ["voice-codecs","media-server","codec-negotiation"]
  },
  "media-relay": {
    s: "A component that sits in the media path of a call and forwards packets between the two sides, hiding addresses, fixing NAT and giving a point to observe or record.",
    d: "Call control rewrites each leg's session description to point at the relay's addresses and tells the relay which two legs to join. The relay forwards without decoding, so it is cheap, latches on the first packet from each side and can enforce limits and copy the stream for recording. It can also apply DSCP markings and drop unauthorized packets. A relay adds a hop of delay and a place for failure. Hard parts are choosing a relay near the endpoints and keeping state in sync with the signaling.",
    k: ["Relay every call vs only when needed: relaying every call gives uniform control and uses bandwidth, selective is efficient and complicates every feature that needs the media.", "Relay near each party vs one central relay: near each reduces delay and needs placement logic, central is simple and detours audio."],
    p: ["A relay failure drops every call through it, even though signaling servers are healthy.", "The relay forwards to an address learned from a spoofed first packet."],
    v: "Route calls through the relay between hosts on different networks, verify packets flow in both directions through its address only, measure added delay at most a few milliseconds, and kill the relay to confirm the recovery path.",
    dep: ["symmetric-rtp-latching","state-store","proxy-and-b2bua"]
  },
  "tones-announcements": {
    s: "Generating the sounds the phone network uses, such as dial, ring, busy and error tones, and playing recorded prompts and messages.",
    d: "Tones are synthesized from frequency and cadence definitions that vary by country. Announcements are audio files in the codec of the call, cached and played by the media server on command. Some are played before answer as early media, some after. The system must choose the right language and the local tone set. Faults include prompts recorded in a format needing transcoding on every play and tones that sound foreign to local callers.",
    k: ["Pre-encode prompts per codec vs transcode on play: pre-encoding saves CPU and storage multiplies, transcoding is flexible and costs on every call.", "Generate tones locally at the phone vs from the network: local tones are immediate and device specific, network tones are consistent and need early media."],
    p: ["A busy tone of the wrong country is heard and callers think the line is broken.", "Prompt files with different sample rates play at the wrong speed."],
    v: "Call a busy extension, an invalid number and a restricted destination from each site, and confirm the correct tone or announcement plays for each with the right cadence and language.",
    dep: ["media-server","early-media-100rel"]
  },
  "media-control-interface": {
    s: "The protocol or API through which call control tells a media server what to do with a call's audio and learns what happened.",
    d: "Interfaces carry commands such as create a connection, play, record, start a conference and collect digits, plus events such as digits received or playback finished. Variants are text protocols over SIP, a gateway control protocol, HTTP or event socket APIs. The control channel must tolerate server failure and reconnection and keep command ordering. A well-designed interface makes the media server replaceable. Hard parts are state: after the link breaks, who owns the sessions, and what if both sides have different views.",
    k: ["Standard interface vs vendor-specific API: standard allows swapping the media server and covers only common functions, specific APIs are richer and tie the system down.", "Stateless commands vs sessions held by the server: stateless is easy to recover, session state allows rich features and needs reconciliation."],
    p: ["A lost completion event leaves the flow waiting forever for a prompt that finished.", "Commands arriving out of order on separate connections start a recording on a call that already ended."],
    v: "Drive a script of play, collect and conference commands through the interface while dropping the control link mid-script, and confirm the system reconnects, reconciles session state and finishes or cleans up every call.",
    dep: ["media-server","sip-transports"]
  },
  "sip-trunking": {
    s: "A carrier service that delivers calls to and from the public phone network over SIP across an IP connection, replacing physical phone lines.",
    d: "The trunk is configured either by registration with credentials, or by trust of the carrier's source addresses and the customer's own. It has a number of concurrent channels, calls per second limits, a format for numbers and a list of permitted codecs. Health is checked by periodic OPTIONS messages. Several trunks are used for redundancy and cost. The details differ by carrier, so most deployment effort goes into adapting header usage, number formats and failure behavior to each.",
    k: ["Registration-based trunk vs IP-authenticated: registration works from dynamic addresses and adds load and a credential, IP authentication is simple and needs a fixed address.", "One carrier vs several: one is simple to manage, several gives resilience and price leverage and multiplies integration work."],
    p: ["Channel limit on the trunk is exceeded at peak and the carrier rejects calls with a generic error.", "Carrier maintenance changes its addresses and IP-trusted calls start being rejected."],
    v: "Place and receive calls across the trunk in every number format used, hold at the channel limit to confirm rejection is graceful, and check OPTIONS health detection by blocking the carrier addresses.",
    dep: ["session-border-controller","signaling-normalization","carrier-interconnect"]
  },
  "session-border-controller": {
    s: "A device at the network edge that terminates calls from outside, hides the internal structure, enforces policy, normalizes signaling and anchors media.",
    d: "It is a back-to-back agent specialized for the border. It accepts only known peers, rate-limits and validates messages, rewrites headers and addresses to hide topology, converts transports and encryption, fixes NAT and optionally transcodes. It also provides call admission control and records. All calls cross it, so capacity, redundancy and performance are critical. The hard parts are keeping rules per carrier, and doing it all without adding delay or breaking features that rely on end-to-end headers.",
    k: ["Dedicated border device vs border functions inside the call server: dedicated isolates the core and is another box to run, built-in is simple for small deployments.", "Anchor all media vs only when needed: all gives policy, recording and NAT handling and costs bandwidth, selective saves capacity."],
    p: ["A single border device with no standby takes the whole company's calls offline when it fails.", "Overly aggressive message validation rejects legitimate calls from a carrier using an unusual header."],
    v: "Send valid calls, malformed messages and a flood from an unknown source through the border and confirm valid calls complete, malformed ones are dropped, the flood is limited, and internal addresses never appear in outside captures.",
    dep: ["proxy-and-b2bua","signaling-normalization","rate-limiting-acls","media-relay"]
  },
  "tdm-gateways": {
    s: "Hardware that connects the IP system to traditional digital phone lines such as PRI circuits and analog trunks, converting signaling and audio between them.",
    d: "A gateway terminates circuits with their own signaling, such as ISDN, converts call setup to SIP and audio between time-slotted and packet form, and provides echo cancellation and clock recovery. Circuits must be synchronized to the carrier's clock, or slips cause clicks. Used where IP service is unavailable, where legacy equipment lives, or as a fallback. Faults are in clocking, mismatched signaling variants, and cause code mapping between the two worlds.",
    k: ["Gateway at each site vs centralized: local gateways give survivability for outages of the WAN, central ones reduce hardware and add dependence on the WAN.", "Circuits kept as backup vs retired: keeping costs rent and protects against IP failures, retiring saves money and accepts the risk."],
    p: ["Mismatched clock sources cause periodic slips heard as clicks every few minutes.", "Release causes are mapped incorrectly and a busy line is reported to callers as an invalid number."],
    v: "Place calls in both directions over each circuit, observe clock slip counters over a day at zero, and compare release cause mapping for busy, unassigned and congestion conditions against the table.",
    dep: ["sip-trunking","voice-codecs","echo-cancellation"]
  },
  "carrier-interconnect": {
    s: "The commercial and technical arrangement between the system and carriers: peering points, supported formats, capacity, rates and the process to add numbers and routes.",
    d: "An interconnect includes the signaling and media addresses and ports of both sides, security (IP allow lists or mutual TLS), supported codecs and number formats, and how failures and quality are measured. Larger operators connect directly to several carriers to control cost and quality. Test calls certify each new interconnect. Rates and routes are managed in tables. The hard parts are the operational ones: change notices, fault reporting between companies, and billing reconciliation.",
    k: ["Direct interconnects vs aggregator: direct gives control and price and takes engineering and contracts, aggregator is quick and adds margin and an extra hop.", "Mutual TLS vs address allow lists: certificates resist spoofing and need management, allow lists are simple and weaker."],
    p: ["A carrier changes its supported number format without notice and calls fail only to some prefixes.", "The agreed capacity is exceeded in a promotion and the carrier silently rate-limits."],
    v: "For each interconnect, run the certification suite of calls covering formats, codecs, DTMF and failure cases, and reconcile one month of record counts and minutes with the carrier's statement.",
    dep: ["sip-trunking","session-border-controller"]
  },
  "signaling-normalization": {
    s: "Rewriting headers and parameters on the way in and out so that equipment and carriers with slightly different dialects of SIP can interoperate.",
    d: "Rules add, remove, or modify headers and parameters per peer: changing the format of identity fields, removing unsupported extensions, fixing the user-agent, adjusting timers or mapping response codes. They are scripts or tables attached to a trunk or device profile. They are the tools used to adapt to a known peer's quirks. Over time they accumulate. Risks are rules that fix one peer and break another, and hidden dependencies between rules.",
    k: ["Normalize at the border for all peers vs per-peer rules: global is consistent and per-peer matches reality, with per-peer needing more upkeep.", "Fix peers by configuration vs ask them to fix their equipment: configuration works today and builds a pile of workarounds."],
    p: ["A rule removing an extension header stops a feature working for other trunks that use it.", "Rules that no one remembers keep running after the peer is upgraded and now cause failures."],
    v: "Replay captured calls from each peer through the normalization rules in a test environment, compare outputs against stored expected messages, and confirm real call tests pass for every peer.",
    dep: ["sip-parser","device-profiles"]
  },
  "number-portability": {
    s: "Looking up where a telephone number is currently hosted, since people can keep their numbers when changing carriers, so calls are sent to the right network.",
    d: "Before routing an outbound call, the system may query a number portability database or a carrier service that returns the current serving network for the number. The result drives route selection and the price. Responses are cached with a lifetime, since numbers move. Inbound, the hosting carrier delivers the call to the customer's trunk. The difficulty is the added lookup delay, the cost per query, and data that lags a recent port.",
    k: ["Query each call vs rely on carrier lookup: querying gives control of routes and costs delay and fees, the carrier handles it and hides the information.", "Long caching vs short: long caching saves cost and sends calls to the wrong network after a port, short is accurate and costs more."],
    p: ["A cached entry for a number ported last week sends calls to the old carrier, where they fail.", "Lookup service outage blocks call setup because nothing handles the timeout."],
    v: "Port a test number, place calls before and after, and confirm the lookup result changes, the route follows within the cache lifetime, and call setup succeeds when the lookup service is disabled.",
    dep: ["external-routing","route-selection","number-inventory"]
  },
  "caller-id-attestation": {
    s: "Cryptographic signing of outbound calls to show that the caller is entitled to use the presented number, and verification of that signature on inbound calls (STIR and SHAKEN).",
    d: "The originating provider signs a token containing the calling and called numbers and a level of trust: full, partial or gateway. The token travels in a signaling header and the terminating provider verifies it against a certificate chain from a trusted authority. Results can be shown to the user or used in blocking. The operator must know which numbers a customer owns to sign at full level. Unsigned and mis-signed calls come from legitimate sources too, so strict blocking loses real calls.",
    k: ["Sign everything at the highest provable level vs conservative: highest gets calls through and requires solid number ownership records, conservative is safe and lowers trust of the calls.", "Block on verification failure vs label only: blocking reduces fraud and blocks valid calls transiting old networks, labeling is mild."],
    p: ["Customer numbers are signed as full without proof of ownership, and the operator's certificate is penalized.", "A call passing through a network that strips the header arrives unsigned and is labeled as suspicious."],
    v: "Place calls with owned, unowned and forwarded numbers through the signing service and confirm each receives the correct attestation level, then check an independent verifier validates the signature and certificate chain.",
    dep: ["number-inventory","number-translation","sip-over-tls"]
  },
});
