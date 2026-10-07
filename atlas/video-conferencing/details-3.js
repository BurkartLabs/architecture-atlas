// Details for the video conferencing plate, part 3: client media engine and media servers.
ATLAS.details("video-conferencing", {
  "capture-pipeline": {
    s: "Acquires camera and microphone data from the operating system, handles device changes and permissions, and delivers timestamped frames and audio blocks to the processing chain.",
    d: "The pipeline opens devices with requested resolution, frame rate and sample rate, receives buffers on driver callbacks, and stamps each with a capture time. It handles hot-plugging, format conversion, and devices that deliver different settings than requested. Audio capture runs on a real-time thread with small fixed blocks; video may pass through hardware scaling. It is hard because device behavior varies widely, timestamps from different devices drift against each other, and a stall in capture delays everything downstream.",
    k: ["Request exact format vs accept the device's native format: exact requests give control but fail on some cameras, while native formats always work but need conversion work.", "Single clock for audio and video vs per-device clocks: one clock simplifies sync, but devices with their own crystals drift and need periodic correction."],
    p: ["A camera that silently lowers its frame rate in low light makes video look stuttery while the sender reports full rate.", "Audio and video capture clocks drift apart so lip-sync worsens over a long call."],
    v: "Record a flashing, beeping reference for ten minutes and compare capture timestamps of the flash and beep; offset should stay within 40 ms, and unplugging the camera switches devices without dropping audio.",
    dep: ["clocks-and-sync"]
  },
  "echo-cancellation": {
    s: "Removes the sound from the speakers that the microphone picks up, so remote participants do not hear themselves returned, while keeping near-end speech intact.",
    d: "An adaptive filter models the path from speaker to microphone using the playback signal as reference, subtracts the predicted echo, and a nonlinear stage suppresses what remains. It must estimate delay between playback and capture, adapt as the room changes, and handle double talk when both sides speak. It runs in tens of milliseconds blocks on the audio thread. It is hard because playback delays vary with devices and drivers, speakers distort, and a reference that is not sample-aligned breaks the filter.",
    k: ["Software echo cancellation vs platform or hardware: platform versions are tuned for the device and cost little, while software gives consistent behavior across devices at CPU cost.", "Aggressive suppression vs preserving double talk: aggressive removal kills echo reliably but clips the person trying to interrupt."],
    p: ["Two devices in the same room, each with a microphone and speaker, create acoustic loops no single filter can cancel.", "A device change while playing resets the delay estimate and echo returns for several seconds."],
    v: "Play recorded far-end speech through speakers while a near-end talker speaks; measure echo return loss enhancement above the target, and confirm near-end words in double talk are not clipped.",
    dep: ["capture-pipeline", "clocks-and-sync", "render-and-av-sync"]
  },
  "noise-suppression": {
    s: "Reduces steady and sudden background sounds in the microphone signal, such as fans, typing and traffic, while preserving speech clarity.",
    d: "Classical methods estimate a noise spectrum and subtract it; learned models separate speech from noise and handle non-stationary sounds like keyboards. Processing runs per block on the capture path, usually after echo cancellation. Strength can be adjusted, and some modes preserve music. It is hard because the same model must be small enough for phones, not distort speech or reject legitimate sounds, and must cooperate with automatic gain control so noise is not amplified.",
    k: ["Learned suppression vs classical spectral methods: learned models remove sudden noise well but cost more CPU and may alter voices, while classical methods are light but weak on keyboards.", "Always on vs user setting: always-on improves most calls, but musicians and instructors need a mode that leaves their sound alone."],
    p: ["Suppression treats a singing voice or instrument as noise and cuts it out.", "Over-suppression gives speech a watery, clipped quality that fatigues listeners."],
    v: "Mix known speech with recorded keyboard and fan noise at several signal-to-noise ratios, and verify a measured speech quality improvement and noise reduction without distorting the clean-speech control.",
    dep: ["echo-cancellation", "capture-pipeline"]
  },
  "gain-control": {
    s: "Adjusts microphone level automatically so quiet and loud speakers arrive at a consistent volume, without clipping or amplifying noise.",
    d: "The control loop measures signal level, compares it to a target, and changes analog or digital gain slowly, with faster attack for loud peaks. It uses voice detection so it does not raise gain on silence. A limiter prevents clipping. Devices with their own hardware gain interact with the software loop. It is hard because gain must settle fast enough at the start of a call, yet not pump up background noise between words, and fighting with an operating-system level control causes oscillation.",
    k: ["Digital gain only vs controlling the device's analog gain: analog control improves signal-to-noise ratio at the source, but operating systems and drivers may fight it.", "Fast adaptation vs stability: quick settling gets voices to level sooner, but audible volume pumping appears when speech has pauses."],
    p: ["Gain rises during silence and a sudden cough or door slam clips before the limiter responds.", "The operating system's own gain control and the application's loop oscillate against each other."],
    v: "Feed speech at minus thirty and minus ten decibels full scale and confirm output levels converge within a few seconds to the same target without clipping.",
    dep: ["capture-pipeline", "noise-suppression"]
  },
  "audio-encoder": {
    s: "Compresses speech into small packets at a bitrate that adapts to the network, with built-in loss resilience and silence suppression to save bandwidth.",
    d: "A voice codec operates on short frames, around 10 to 20 ms, and can switch bandwidth and bitrate as conditions change. Features include in-band redundancy for lost packets, discontinuous transmission that stops sending during silence, and stereo or music modes. Frame size sets a floor on latency and packet rate. It is hard because lower frame duration cuts delay yet raises packet overhead, and audio must be protected first when bandwidth falls because people tolerate poor video but not broken speech.",
    k: ["Short frames vs long frames: short frames reduce delay and loss impact, while long frames lower overhead and bitrate at a latency cost.", "Redundancy vs retransmission: redundancy repairs loss without waiting, but spends bandwidth even on clean links."],
    p: ["Silence suppression combined with a mistuned voice detector clips word beginnings.", "Fixed high bitrate on a congested link causes loss that damages audio more than a lower rate would."],
    v: "Send speech over a link with five percent random loss and confirm quality scores stay above the target using redundancy, while bandwidth over a silent period drops to near zero with suppression on.",
    dep: ["gain-control", "rtp-rtcp", "bandwidth-estimator", "forward-error-correction"]
  },
  "video-encoder": {
    s: "Compresses camera video in real time, optionally producing several quality versions at once or a layered stream, with fast keyframe response and bounded delay.",
    d: "The encoder runs in low-delay mode with no frame reordering, tuned for stable bitrate and frequent recovery points. For forwarding architectures the sender produces several resolutions at once, or one stream with nested temporal and spatial layers, so the server can pick per receiver. Hardware encoders save battery but offer less control. Output goes to packetization with layer metadata. It is hard because the encoder shares the device with everything else, and its rate control must follow a bitrate target that changes every second.",
    k: ["Software encoder vs hardware encoder: software gives control and uniform behavior, while hardware preserves battery and heat but limits layers and tuning.", "Several independent streams vs one layered stream: independent streams are widely supported and robust, while layering saves sender bitrate and eases switching if receivers support it."],
    p: ["Encoder overload under CPU pressure lowers frame rate and increases delay, and nothing tells the bandwidth logic.", "Several simultaneous streams multiply encode cost and drain a laptop's battery in a long call."],
    v: "Run a call with three simulcast layers and read encoder statistics: each layer's bitrate and frame rate should match its target within ten percent, and a keyframe request is answered in under a few hundred milliseconds.",
    dep: ["capture-pipeline", "bitrate-allocator", "layer-topology", "rtp-rtcp"]
  },
  "screen-content-encoder": {
    s: "Encodes shared screens with settings tuned for text and sharp edges, favoring resolution and detail over frame rate and handling bursts when the content changes.",
    d: "Screen content has large static areas, abrupt changes and fine text. The encoder uses content-aware modes, lower frame rates, higher resolution, and tools for repeated patterns. It detects whether the content is a slide, scrolling text or video, and shifts the balance between sharpness and motion. When nothing changes it sends almost nothing, then spends bits on a clean refresh. It is hard because the right trade-off differs per second, and keyframes on shared screens are expensive.",
    k: ["Prioritize sharpness vs prioritize smooth motion: sharpness is right for slides and documents, but a shared video or animation then looks choppy, so detection or user choice is needed.", "Keyframe on every join vs reusable recovery points: frequent keyframes help new viewers join, but cost many bits in a large share."],
    p: ["Sharing a video file at document settings gives viewers a slideshow of the video.", "A viewer joining a share waits for the next keyframe, seeing nothing for seconds."],
    v: "Share a page of nine-point text and confirm viewers can read it at the standard receive resolution, then play a video in the shared window and confirm the encoder shifts to a higher frame rate within a couple of seconds.",
    dep: ["video-encoder", "keyframe-manager", "bitrate-allocator"]
  },
  "audio-jitter-buffer": {
    s: "Holds incoming audio briefly to reorder packets and absorb arrival-time variation, then releases it at a steady pace while stretching or compressing audio to keep the delay small.",
    d: "Packets arrive with variable delay. The buffer measures this variation and chooses a target delay, a balance between waiting for late packets and adding latency. Audio plays out from the buffer at a constant rate; when it grows, the engine speeds up slightly, when it empties it slows or conceals. Time stretching uses signal processing that keeps pitch natural. It is hard because delay estimates must follow bursts quickly yet not overshoot, and the buffer shares timing with video through synchronization.",
    k: ["Adaptive target delay vs fixed delay: adaptive reacts to network changes and keeps latency low, but mispredicts after sudden bursts and then glitches.", "Time-scale modification vs dropping or repeating samples: stretching preserves quality, while sample dropping is cheap but audible."],
    p: ["Buffer delay grows during a bad period and never shrinks, leaving the call with half a second of delay.", "A burst of late packets overruns the target and produces clicks and gaps."],
    v: "Inject a network profile with 100 ms jitter and bursts, and confirm playout delay stays within a target band, concealment duration is under the limit and delay returns to baseline after the jitter ends.",
    dep: ["rtp-rtcp", "loss-concealment", "render-and-av-sync"]
  },
  "video-jitter-buffer": {
    s: "Reassembles video frames from packets, orders them, waits for missing pieces within a deadline, and releases complete frames to the decoder at the right time.",
    d: "The buffer collects packets until a frame is complete, checks that its references arrived, and holds it for a delay set by jitter and decode time. Missing packets trigger retransmission requests; if the deadline passes, the frame is dropped and a keyframe request or a lower layer is used. With layered streams, it handles switches without breaking references. It is hard because a single lost reference frame invalidates many successors, so the buffer must decide quickly whether to wait, skip or ask for repair.",
    k: ["Wait for retransmission vs request a new keyframe: waiting repairs cheaply on low-delay paths, while a keyframe is expensive but resolves long gaps.", "Larger buffer for smoothness vs smaller for latency: larger buffers hide jitter and loss, but add delay that hurts conversation."],
    p: ["A missing reference frame freezes video until the next keyframe, which may be seconds away.", "Keyframe requests from many viewers at once make the sender produce a burst of expensive frames."],
    v: "Drop one percent of packets in a controlled test and measure freeze duration and keyframe requests per minute; frames should recover within a retransmission round trip rather than waiting for periodic keyframes.",
    dep: ["rtp-rtcp", "nack-retransmit", "keyframe-manager", "render-and-av-sync"]
  },
  "loss-concealment": {
    s: "Fills in audio, and sometimes video, that never arrived so gaps sound or look like continuous speech or motion, using models of what came just before.",
    d: "For audio, the decoder extrapolates the last received waveform for a few tens of milliseconds, fades if the loss continues, and smooths the transition back when packets resume. Redundant data can reconstruct a lost frame exactly. For video, concealment copies or interpolates parts of the previous frame, but is limited by the codec. It is hard because concealment hides loss from the listener but also from the system, so quality reports must still count concealed samples as degradation.",
    k: ["Conceal at the decoder vs request redundancy: concealment is free in bandwidth and works for short gaps, while redundancy repairs better but spends bits.", "Fade quickly on longer loss vs extrapolate longer: fading avoids robot-like repeats, while longer extrapolation sounds better for brief gaps."],
    p: ["Concealed audio is counted as received, so dashboards show good quality while users complain of garbled speech.", "A long burst of loss produces repeated sounds that sound like a stutter."],
    v: "Drop a controlled twenty-millisecond audio frame and compare listening quality with and without concealment; also verify that concealed sample counts are reported in the client statistics.",
    dep: ["audio-jitter-buffer", "audio-encoder", "client-stats-collector"]
  },
  "render-and-av-sync": {
    s: "Plays decoded audio and draws video frames at the right moment, keeping them aligned using timestamps so lips and voices match.",
    d: "Audio plays out on its own device clock, which becomes the reference. Video frames, tagged with capture-time timestamps mapped through sender reports, are shown when the audio clock reaches their time, being delayed or dropped to stay aligned. Rendering also handles scaling, rotation, display refresh and many simultaneous tiles. It is hard because each remote stream has its own network delay, so synchronization needs a per-participant buffer, and the playback device's clock may differ from the sender's.",
    k: ["Audio as master clock vs video as master: audio-master is standard since glitches in sound are more noticeable, but video must then occasionally drop or repeat frames.", "Synchronize per participant vs globally across the room: per participant is natural, while global alignment between different speakers is rarely worth the added delay."],
    p: ["Video is delayed behind audio by hundreds of milliseconds because the video buffer grew and sync lagged.", "Rendering twenty tiles at full resolution stalls the user interface thread."],
    v: "Display a clap from a reference recording and measure the offset between the visible flash and the sound at the receiver; it should remain within about 45 ms early to 125 ms late.",
    dep: ["audio-jitter-buffer", "video-jitter-buffer", "rtp-rtcp", "clocks-and-sync"]
  },
  "rtp-forwarder": {
    s: "The core of a forwarding server: receives each participant's packets and sends copies to the participants subscribed to them, without decoding the media.",
    d: "Packets arrive on a transport, are decrypted if the server terminates security, matched to a published track and passed to every subscribed downstream. The server rewrites headers per receiver and re-encrypts. Work per packet must be tiny: a node handles hundreds of thousands of packets per second, so it uses lock-free queues, batching and avoids copies. It is hard because fan-out scales quadratically with participants, and egress bandwidth, not CPU, often becomes the limit.",
    k: ["Terminate security at the server vs pass through end to end: terminating lets the server inspect and repair streams, while pass-through protects content from the server at the cost of features.", "One thread per room vs shared worker pool: per-room threads simplify state, while pools use cores better but need careful handling of hot rooms."],
    p: ["A single very large room saturates one core while the rest of the machine is idle.", "Packet copies per subscriber exhaust memory bandwidth before the network is full."],
    v: "Load a node with rooms of fifty participants until egress approaches line rate, and confirm packet loss at the node stays near zero, per-packet forwarding delay stays under a few milliseconds and CPU is spread across cores.",
    dep: ["sfu-worker-model", "rtp-rewriter", "dtls-srtp", "subscription-manager"]
  },
  "subscription-manager": {
    s: "Tracks what each receiver wants to see and hear, which tracks and at what size, and connects those wishes to the forwarding paths within the receiver's bandwidth.",
    d: "Clients request tracks and a maximum quality per track, based on tile sizes and visibility. The manager combines requests with the receiver's available bandwidth and policy, then configures forwarding. Audio is usually limited to the most active few speakers; video to the visible tiles plus a pinned or shared stream. It must change quickly as layouts change but not thrash. It is hard because requested quality and available bandwidth conflict, and with many participants someone must decide who gets reduced quality first.",
    k: ["Client-driven requests vs server-driven choice: client requests know what is on screen, while server decisions respond faster to network changes but lack UI context.", "Subscribe to everything vs on demand: subscribing to all is instant on layout change but wastes bandwidth, so most systems subscribe to a visible subset plus a few likely next."],
    p: ["Subscriptions to hidden tiles keep consuming bandwidth after scrolling because nobody unsubscribed.", "Rapid layout changes produce a stream of subscribe and unsubscribe operations that overload the node."],
    v: "Page through a fifty-person grid and confirm downlink falls to match the visible subset within a second, and that returning to a previously seen tile restores video in under a second.",
    dep: ["layer-selector", "rtp-forwarder", "active-speaker-detection", "state-event-bus"]
  },
  "layer-selector": {
    s: "Chooses, per receiver and per stream, which simulcast or scalable layer to forward, switching up or down as bandwidth and tile size change.",
    d: "The selector knows the layers available for each published stream and each receiver's estimated bandwidth and requested size. It forwards the highest layer that fits, switching at points where decoding is possible, such as keyframes or layer-switch markers. It adds hysteresis so brief dips do not cause oscillation and allows probing upward carefully. It is hard because it needs all-receivers visibility, and switching up often requires a keyframe, a request to the sender that every other receiver also pays for.",
    k: ["Switch down quickly and up slowly vs symmetric: asymmetric switching avoids oscillation and visible quality swings, but recovers slowly after a bad moment.", "Switch only at keyframes vs at any layer-switch marker: keyframe-only switching is simple but slow, while markers allow quick switches if the encoder emits them."],
    p: ["Receiver oscillation between layers causes a visible pulse in sharpness every few seconds.", "Many receivers simultaneously switching up force repeated keyframes that raise sender bitrate for everyone."],
    v: "Throttle a receiver's link from 5 Mbps to 1 Mbps and back; confirm the forwarded layer steps down within two seconds, up within ten, and no more than one switch per interval.",
    dep: ["subscription-manager", "bandwidth-estimator", "keyframe-manager", "layer-topology"]
  },
  "active-speaker-detection": {
    s: "Identifies who is speaking now from audio levels, smoothed so the speaker highlight and pinned video follow the conversation without flickering from coughs and noise.",
    d: "Clients send audio level indicators in packet headers, or the server measures them. The server tracks a smoothed loudness per participant over a window, picks the dominant speaker with a minimum hold time, and publishes changes through room state. It also decides which few audio streams to forward in a large meeting. Voice activity helps exclude noise. It is hard because loud background sounds look like speech, and different microphones vary in gain, so levels are normalized.",
    k: ["Header level indicators vs decoding on the server: header levels cost nothing and work with encrypted media, while decoding is more accurate but expensive and impossible under end-to-end encryption.", "Quick switching vs hold time: quick switching tracks interjections, but a hold time stops constant flipping."],
    p: ["A participant with a noisy fan or no mute control becomes the permanent active speaker.", "Detection treats echo returned from a participant's speakers as a second speaker."],
    v: "Play scripted turns with overlapping coughs and a constant fan from separate clients; the detector must name the correct speaker within about one second of each turn and ignore the noise.",
    dep: ["rtp-forwarder", "header-extensions", "state-event-bus"]
  },
  "rtp-rewriter": {
    s: "Rewrites sequence numbers, timestamps and stream identifiers so a receiver sees one continuous stream even as the server switches between sources or layers.",
    d: "When the selector changes layers, or a speaker slot changes owner, the new source has unrelated sequence numbers and timestamps. The rewriter keeps a per-receiver offset that makes the output contiguous and monotonic, and maps source identifiers to the receiver's negotiated ones. It also adjusts header extensions. It is hard because the mapping must stay correct through packet loss and reordering, otherwise the receiver's loss detection and jitter buffer misinterpret the switch as damage.",
    k: ["Per-receiver rewriting vs same numbers for all: per-receiver rewriting allows switches and slots to look continuous, but state per receiver grows with fan-out.", "Fixed audio slots vs one stream per speaker: fixed slots keep the number of receivers' streams constant, but require remapping as speakers change."],
    p: ["A wrong offset after a layer switch makes the receiver think packets were lost and request retransmission.", "A timestamp jump on a switch breaks lip-sync until the next sender report."],
    v: "Force twenty layer switches with injected reordering and confirm the receiver sees strictly increasing sequence numbers, zero spurious loss reports and no decoder resets.",
    dep: ["rtp-forwarder", "layer-selector", "rtp-rtcp"]
  },
  "retransmission-cache": {
    s: "Keeps recently forwarded or received packets for a short time so lost packets can be resent on request without involving the original sender.",
    d: "The server stores packets per stream for a window of around a second, indexed by sequence number. When a receiver reports a gap, the server resends from the cache, rewritten for that receiver. For upstream loss, the server requests resend from the sender and then fans the repaired packet out. Placing the cache close to receivers shortens the repair loop. It is hard because repairs must be rate-limited, otherwise they use bandwidth in the congested state they are meant to fix.",
    k: ["Cache at the server vs request from the sender: a server cache repairs in one short round trip, but memory per stream grows with window and bitrate.", "Repair everything vs only useful packets: skipping packets too old to be decoded saves bandwidth, but requires knowing decode deadlines."],
    p: ["Repair traffic doubles load on a link already losing packets and deepens congestion.", "A cache window shorter than the receiver's round trip means requests always miss."],
    v: "Drop packets on the downlink and verify the receiver's loss repaired within one round trip from the cache, the sender sees no repair requests, and repair bandwidth stays under its cap.",
    dep: ["rtp-forwarder", "nack-retransmit", "rtp-rtcp"]
  },
  "keyframe-manager": {
    s: "Coordinates requests for full-refresh frames from many receivers so the sender is not asked too often, while still letting new viewers and recovering viewers start quickly.",
    d: "Receivers ask for a keyframe when they join, switch layers or lose references. The manager coalesces requests per stream, rate-limits them to a minimum interval, and forwards a single request upstream. It may serve a cached last keyframe to joiners where the codec allows. It also tracks whether the sender answered. It is hard because keyframes cost many times a normal frame, so a burst of joiners or a lossy network can push the sender into repeated expensive frames that worsen the very loss that triggered them.",
    k: ["Coalesce requests vs honor each immediately: coalescing protects the sender, but recovering viewers wait for the next permitted frame.", "Periodic keyframes vs on-demand only: periodic keyframes provide recovery points without requests, but waste bits when nobody needs them."],
    p: ["A large meeting join wave causes the sender to emit keyframes continuously, reducing quality for everyone.", "A lost keyframe is not retransmitted and viewers wait for the next interval."],
    v: "Have twenty receivers join within one second and confirm the sender emits at most the rate limit of keyframes, and all receivers display video within the target start time.",
    dep: ["rtp-forwarder", "video-encoder", "rtp-rtcp"]
  },
  "sfu-cascade": {
    s: "Links forwarding servers to each other so a meeting spans several of them, with each participant connecting to a nearby one and servers exchanging only the streams needed.",
    d: "Each server forwards its local publishers to peers, which forward them to their local subscribers. Servers send a stream across the link once, regardless of how many remote receivers want it, and choose layers by remote demand. Links run over a private backbone or the internet with their own congestion control. It is hard because cascading adds a hop of delay, requires consistent room state across servers, and creates routing questions: loops, partial failures and which links to build in a mesh versus a tree.",
    k: ["Full mesh vs tree between servers: mesh gives the lowest delay but link count grows quadratically, while a tree scales better with extra hops.", "Forward all layers across links vs only requested ones: all layers make switching instant, but waste scarce inter-region bandwidth."],
    p: ["A link between servers fails and half the participants cannot see the other half although both are online.", "Duplicate paths create loops that send each packet twice."],
    v: "Run a meeting across three regions and confirm each stream crosses each inter-region link once, end-to-end delay adds only the link delay, and cutting a link causes rerouting within seconds.",
    dep: ["rtp-forwarder", "backbone-and-relays", "room-state-service", "layer-selector"]
  },
  "mcu-mixer": {
    s: "Decodes all participants' media and combines it into one composed video and mixed audio stream per receiver, for devices that cannot handle many streams.",
    d: "The mixer receives and decodes every stream, composes the video into a layout, mixes audio (excluding each listener's own voice), then encodes one stream per receiver or per layout class. Receivers see a single simple stream. Compute grows with participants and with distinct outputs. It is used for legacy endpoints, phones and recording. It is hard because decoding and encoding add delay and cost, and quality is capped at what the mixer encodes for the weakest receiver class.",
    k: ["Mix on the server vs forward and let clients compose: mixing minimizes client load and bandwidth but costs the server per receiver, while forwarding scales better with capable clients.", "Shared output per layout vs per-receiver mix: shared outputs save encodes, but audio needs a per-listener mix-minus anyway."],
    p: ["Each added receiver class requires another encode, so cost jumps unexpectedly with mixed endpoint types.", "Without mix-minus a listener hears their own voice delayed, triggering echo."],
    v: "Join one legacy and several modern clients, confirm the legacy endpoint receives one composed stream with all others audible but not itself, and measure the added delay against the target.",
    dep: ["transcoding-bridge", "rtp-forwarder", "audio-encoder", "video-encoder"]
  },
  "transcoding-bridge": {
    s: "Converts between codecs, formats and protocols so endpoints with different capabilities can talk, used selectively because it is expensive.",
    d: "A bridge decodes one format and re-encodes another: legacy audio codecs to the modern meeting codec, one video codec to another, or a different transport to the standard one. It may also adjust resolution and frame rate for a weak receiver. It usually runs on separate compute pools so its load does not affect forwarding. It is hard because it adds delay and cost per stream, so the system tries to negotiate a common codec first and only bridges when that fails.",
    k: ["Negotiate common codec when possible vs always bridge: negotiating avoids compute and delay, but forces a lowest-common-denominator codec on everyone.", "Dedicated transcoder pool vs inline in forwarders: a pool isolates cost and scales separately, but adds a network hop for each bridged stream."],
    p: ["A single bridged participant in a large meeting causes a transcode of every publisher for them.", "Bridge capacity is exhausted and the endpoint is refused with a vague error."],
    v: "Join with a client that supports only a legacy codec and confirm media flows both ways through the bridge, with added delay under the stated limit and bridge CPU shown per participant.",
    dep: ["mcu-mixer", "audio-encoder", "video-encoder", "capacity-scheduler"]
  },
  "sfu-worker-model": {
    s: "How a media server divides packet work across threads and cores, and keeps rooms isolated, so one busy meeting does not slow others.",
    d: "Servers run a fixed number of worker threads pinned to cores, each owning a set of rooms or transports, with run-to-completion packet handling and batched sends. Control operations are passed in as messages. Placement of a room on a worker is decided at creation and may be rebalanced. Kernel bypass or batched system calls cut per-packet overhead. It is hard because load is uneven and bursty: a very large room cannot be split across workers easily, so one core becomes the bottleneck.",
    k: ["Room pinned to one worker vs spreading a room over workers: pinning avoids shared state and locks, but caps the room size at one core's capacity.", "Kernel networking vs kernel bypass: standard networking is simpler and safer, while bypass reaches higher packet rates but needs dedicated hardware and care."],
    p: ["Garbage or pause behavior in the runtime stalls a worker and a whole batch of rooms glitches together.", "Workers are unevenly loaded because room sizes were assumed uniform at placement."],
    v: "Run a mix of one large and many small rooms on a node, and confirm per-packet forwarding delay percentiles stay flat for the small rooms when the large room grows to its cap.",
    dep: ["rtp-forwarder"]
  },
});
