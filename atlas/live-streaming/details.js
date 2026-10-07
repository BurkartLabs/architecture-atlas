// Details for the live streaming plate, part 1: ingest and transcoding.
ATLAS.details("live-streaming", {
  "rtmp-ingest": {
    s: "Accepts a continuous push of audio and video from a broadcaster's encoder over a long-lived TCP connection, the most widely supported way to start a live stream.",
    d: "The encoder opens a connection, authenticates with a stream key, and sends interleaved audio and video messages in a chunked container. The server parses the chunk stream, reassembles messages, extracts codec configuration and hands frames to the rest of the pipeline. Because it rides on TCP, a congested uplink stalls rather than drops, so latency grows silently. It is hard because encoders are written by many parties and each interprets the specification differently: odd timestamps, missing configuration messages and unexpected reconnects are routine.",
    k: ["TCP push vs retransmission over UDP: universal encoder support and simple firewalls, but head-of-line blocking turns any packet loss into added delay.", "Accept any encoder quirk vs reject nonconforming streams: leniency keeps broadcasters on air, but every tolerated quirk becomes a bug downstream."],
    p: ["A broadcaster's uplink saturates, TCP buffers fill, and the stream falls minutes behind real time without any error.", "Encoders reconnect with timestamps restarting at zero, which breaks segment numbering if not normalized."],
    v: "Push a test stream through a throttled link that drops 2% of packets. Confirm the server logs the measured bitrate and receive delay, and that frames arrive in order with monotonically increasing timestamps.",
    dep: ["stream-keys-and-auth","ingest-edge-points","timestamp-normalization"]
  },
  "srt-ingest": {
    s: "Receives live feeds over a UDP-based protocol that retransmits lost packets within a fixed latency window, trading a bounded delay for resilience on bad networks.",
    d: "Sender and receiver agree on a latency budget, typically a few round-trip times. Packets carry sequence numbers; the receiver requests retransmission of gaps and releases data in order at the end of the window, dropping anything still missing. Encryption is built in. The server must size the buffer to the path: too small and recoverable loss becomes visible glitches, too large and delay is wasted. It is used for contribution from remote venues, vehicles and cellular links, where TCP behaves badly.",
    k: ["Fixed latency window vs unbounded reliability: delay is predictable and bounded, but loss bursts longer than the window still corrupt the picture.", "Per-stream tuned buffers vs one platform default: tuning suits each link, but requires encoders and operators who understand round-trip time."],
    p: ["A window set below the path's round-trip time makes every retransmission arrive too late, so it adds overhead and recovers nothing.", "Firewalls that block unfamiliar UDP ports leave the broadcaster unable to connect with no clear error."],
    v: "Inject 5% random loss on a test path with 80 ms round trip. With a 400 ms window the output should show no visible damage and the receiver stats should report retransmissions recovered and zero dropped.",
    dep: ["ingest-edge-points","stream-keys-and-auth","timestamp-normalization"]
  },
  "webrtc-ingest": {
    s: "Lets a broadcaster go live straight from a browser or app camera using a real-time peer protocol, with no separate encoder software.",
    d: "The browser captures camera and microphone, negotiates a session with the platform over an HTTP-based signaling exchange, then sends encrypted media over UDP with congestion control that adapts bitrate to the uplink. The platform terminates the session, reads the RTP packets and rebuilds frames. It lowers the barrier to broadcasting but gives the platform little control over encoder settings, and the browser may change resolution or frame rate mid-stream when it detects congestion, which downstream encoders must tolerate.",
    k: ["Browser-native capture vs dedicated encoder: no install and instant start, but fewer quality controls and weaker handling of long sessions.", "Sender-side congestion control vs fixed bitrate: protects the uplink, but quality can drop suddenly and unpredictably."],
    p: ["Resolution or frame-rate changes mid-session reach a transcoder that assumed constant parameters and stall it.", "Session negotiation fails behind strict networks when no relay is available, so some broadcasters cannot start."],
    v: "Start a stream from a browser on a throttled uplink and confirm the platform receives a continuous feed, records bitrate steps as the link degrades, and the transcoder survives the resolution change without restarting.",
    dep: ["ingest-edge-points","stream-keys-and-auth","timestamp-normalization"]
  },
  "ingest-edge-points": {
    s: "Servers placed close to broadcasters that terminate their connections, so the long first mile is short and the platform's own network carries the stream the rest of the way.",
    d: "A DNS or anycast lookup steers each encoder to a nearby site. The edge authenticates the connection, accepts the stream and forwards it over the backbone to wherever transcoding for that stream runs. Moving the first hop close to the broadcaster reduces round-trip time, which matters for retransmission protocols and TCP throughput alike. Placement is difficult: broadcasters are unevenly distributed, edge capacity must handle surges, and a stream's processing location may differ from where it entered.",
    k: ["Many small edges vs few large ingest regions: lower first-mile loss and delay, but more sites to operate and more backbone transfers.", "Edge-local transcoding vs forward raw video: saves backbone bandwidth, yet spreads expensive hardware over many sites."],
    p: ["Latency-based routing sends a broadcaster to a nearby edge that is already full, giving them worse service than a farther one.", "Anycast routing shifts mid-stream, resetting the connection of a broadcaster who did nothing."],
    v: "From three distant regions, connect a test encoder and confirm each lands on its nearest edge, that connect time and jitter are lower than a single-region baseline, and that the stream reaches the same transcoder.",
    dep: ["edge-network","stream-registry"]
  },
  "stream-keys-and-auth": {
    s: "Verifies that a connecting encoder may broadcast on a given channel, using a secret key or token that identifies the channel and can be revoked.",
    d: "Each channel has a secret key or short-lived token, presented at connect time and checked against the identity service. The check must be fast, since it sits in the connection path, and must also confirm the account is allowed to stream: not banned, not already live elsewhere, and within any limits. Keys are visible to the broadcaster and often pasted into untrusted software, so they leak. Rotation, scoped tokens and detection of the same key from two places are the main defenses.",
    k: ["Long-lived static key vs short-lived signed token: static keys fit every encoder, but a leak gives lasting control of the channel.", "Reject a second connection vs let it replace the first: rejection blocks hijacking, but replacement lets a crashed encoder reconnect quickly."],
    p: ["A leaked key lets a stranger broadcast on a trusted channel to its whole audience.", "A slow auth lookup during a reconnect storm leaves broadcasters unable to resume after a brief outage."],
    v: "Rotate a channel's key while a stream is live and confirm the old key is refused on the next connect, the audit log records the attempt, and a second simultaneous connection is handled per the stated policy.",
    dep: ["identity-and-auth","stream-registry"]
  },
  "redundant-ingest": {
    s: "Accepts two or more simultaneous copies of the same stream over separate paths and switches between them, so one failed link or encoder does not end the broadcast.",
    d: "A broadcaster sends a primary and a backup feed, often from separate encoders and connections, to different ingest points. The platform aligns the copies using their timestamps and picks the healthy one, either failing over on loss or merging packet by packet. The hard part is alignment: the copies must carry identical timestamps and keyframe positions, or the switch causes a visible jump and breaks every segment boundary downstream. Platforms also provide hot standby of their own ingest servers.",
    k: ["Active-active merge vs active-standby switch: merging hides loss on either path, but needs tightly synchronized copies and more bandwidth.", "Platform-side failover vs broadcaster-side: the platform sees both feeds, but only the broadcaster knows whether the backup is truly independent."],
    p: ["Both feeds share one upstream router, so a single outage takes both and the redundancy was never real.", "A backup with different timestamps causes a jump or duplicated frames at the moment of failover."],
    v: "Stream two aligned copies, cut the primary link mid-stream, and confirm the output continues with no gap longer than one frame and no discontinuity in segment numbering or timestamps.",
    dep: ["timestamp-normalization","ingest-edge-points","stream-registry"]
  },
  "timestamp-normalization": {
    s: "Rewrites the broadcaster's timestamps onto one continuous platform timeline so jumps, resets and drift in the source do not break segmenting or playback.",
    d: "Encoders emit presentation and decode timestamps that start anywhere, wrap, jump after a reconnect, or drift against wall-clock time. The ingest stage maps them onto a monotonic timeline anchored to platform time, smoothing small errors and detecting large discontinuities. It also separates audio and video clocks that run slightly differently. Everything downstream, from segment durations to player synchronization, assumes this timeline is trustworthy, which makes it one of the highest-leverage and least visible components.",
    k: ["Trust source timestamps vs generate from arrival time: source timestamps preserve audio-video alignment, arrival time hides source faults but adds network jitter to the timeline.", "Correct drift gradually vs cut at discontinuities: gradual fixes avoid glitches but cannot absorb large jumps."],
    p: ["A source clock that runs 0.1% fast slowly accumulates seconds of audio-video offset over a multi-hour stream.", "A reconnect with timestamps restarting at zero produces a backward jump that players treat as a new stream and stall."],
    v: "Feed a stream with an artificial 30-second timestamp jump and 100 ppm drift for an hour. Confirm output timestamps stay monotonic, audio-video offset stays under 40 ms, and segment durations remain within tolerance.",
    dep: ["clock-and-timecode"]
  },
  "encoder-guidance": {
    s: "The published settings and checks the platform gives broadcasters: recommended bitrate, keyframe interval, codec profile and a test that flags a configuration before it goes live.",
    d: "Most live quality problems start at the source, so the platform tells broadcasters what to send: constant bitrate within their measured uplink, a fixed keyframe interval of two seconds or less, a supported profile, and a consistent frame rate. It may also run a pre-flight test that measures upload speed and inspects a short sample. The difficulty is that broadcasters use hundreds of encoder products and hardware setups, and the platform cannot see most of their configuration beyond what arrives in the stream.",
    k: ["Strict published requirements vs tolerant ingest: strict rules make downstream simple, but exclude casual broadcasters.", "Pre-flight test vs live feedback only: catches faults before an audience arrives, but cannot predict conditions that change mid-stream."],
    p: ["A variable keyframe interval makes segments uneven and forces the transcoder to insert keyframes, lowering quality.", "Recommending a bitrate near the measured uplink leaves no headroom, so any congestion causes a stall."],
    v: "Run the pre-flight check against a deliberately misconfigured encoder with a ten-second keyframe interval and confirm it reports that value and the recommended one, then confirm a corrected encoder passes.",
    dep: ["ingest-health-metrics"]
  },
  "abr-ladder": {
    s: "The set of renditions produced from one source, each with a resolution, frame rate and bitrate, so any viewer can choose one their connection and device support.",
    d: "A typical ladder runs from a small low-bitrate rendition for poor mobile links to the full source quality. Each rung is encoded in real time from the same decoded source, with matching keyframes so a player can switch between them at any segment boundary. The ladder determines the lowest bandwidth that still works, the quality ceiling and the compute bill, since every rung is another encode. Choosing rungs is a tradeoff between coverage of viewer bandwidths and cost per stream.",
    k: ["Many closely spaced rungs vs few: smoother quality adaptation, but each rung costs compute and splits the cache, lowering hit rates.", "Same ladder for every stream vs per-category ladders: simplicity versus encoding a still slide show at the same bitrate as fast sports."],
    p: ["A missing low rung leaves viewers on weak connections with constant buffering because nothing fits their bandwidth.", "Rungs with mismatched keyframes make switching glitchy or impossible."],
    v: "Probe the packaged stream and confirm every rung has identical keyframe timestamps, that the lowest rung plays on a throttled 400 kbps link, and that bitrate and resolution match the published ladder.",
    dep: ["live-video-encoder","keyframe-alignment"]
  },
  "per-title-ladder": {
    s: "Adjusts the ladder for each stream's content and the audience's likely connections, giving simple content lower bitrates and demanding content higher ones.",
    d: "A static ladder wastes bits on easy content and starves hard content. Per-stream tuning measures complexity, such as motion and detail, from the live source or from the category's history, and picks bitrates that reach a target quality score at each resolution. In live it must decide quickly with little lookahead, so it often relies on category profiles and the first seconds of the stream. It may also use audience data, dropping rungs nobody uses, which saves compute.",
    k: ["Content-adaptive ladders vs fixed ladder: better quality per bit, but more complexity, less predictable bitrates and more variants for the cache to hold.", "Decide at start vs adapt continuously: stability for caches and players, against fitting content that changes from menu screen to action."],
    p: ["Tuning from the first minute of a stream mislabels a broadcaster whose content is calm at first and intense later.", "Frequent ladder changes confuse players that cached the earlier rendition list."],
    v: "Encode a static slide stream and a fast-motion stream, then compare quality scores and bitrates at each rung: the slide stream should hit the target at markedly lower bitrate with no loss in measured quality.",
    dep: ["abr-ladder","viewer-qoe-metrics"]
  },
  "live-video-encoder": {
    s: "Compresses decoded frames into each rendition in real time, under a hard deadline: every frame must be finished before the next arrives, with only a few frames of lookahead.",
    d: "Unlike file encoding, a live encoder cannot take extra passes or look far ahead. It uses rate control tuned for low delay, a bounded group of pictures with regular keyframes, and presets that trade compression for speed. If it falls behind real time, the stream falls behind or drops frames. The encoder also controls bitrate spikes that would overflow the viewer's buffer, so output must respect a video buffer model. Quality per bitrate depends heavily on how much compute a stream is allowed.",
    k: ["Slower presets vs real-time safety margin: better compression and lower delivery cost, but any load spike causes dropped frames.", "Constant vs capped variable bitrate: constant is predictable for networks and players, while capped variable saves bits on easy scenes."],
    p: ["An encoder pinned to full CPU use falls behind on a scene change, and the stream silently accumulates delay.", "Bitrate spikes at scene changes overflow the player's buffer model and cause visible stalls on slower rungs."],
    v: "Encode a worst-case high-motion clip at real-time speed for an hour and confirm per-frame encode time stays below the frame interval, with no dropped frames and output bitrate within the declared cap.",
    dep: ["transcode-scheduler","hardware-encode-pool","keyframe-alignment"]
  },
  "audio-transcode": {
    s: "Decodes and re-encodes the audio into compatible formats and bitrates, keeping it in sync with video and at consistent loudness across streams.",
    d: "Audio is smaller than video but viewers notice its faults first. The stage decodes the source, may resample, mix down channels, normalize or measure loudness, and encode to the formats players support, usually at a couple of bitrates. It must keep timestamps continuous across gaps, since encoders pause audio when muted, and fill silence if the source drops out. Segment boundaries need clean audio frames so players do not click at joins.",
    k: ["Re-encode audio vs pass it through: re-encoding guarantees compatibility and consistent loudness, but adds delay and a generation of quality loss.", "Normalize loudness vs preserve source dynamics: viewers get consistent volume between streams, but music broadcasters lose intended dynamics."],
    p: ["An encoder that stops sending audio while muted leaves a gap that shifts later audio against the video.", "Rounding errors in sample counts per segment create audible clicks at every segment boundary."],
    v: "Play a one-hour stream containing muted intervals and verify audio stays within 40 ms of video throughout, with no clicks at segment boundaries when inspecting the waveform around each join.",
    dep: ["keyframe-alignment","timestamp-normalization"]
  },
  "hardware-encode-pool": {
    s: "A fleet of machines with dedicated video encoding hardware, used to produce many renditions per machine at lower cost and power than general processors.",
    d: "Dedicated encoder blocks and accelerators handle many streams per machine, but each has limited sessions, fixed feature sets and quality that differs from software encoders. The pool tracks free session slots per machine, assigns streams, and falls back to software when it is full. Drivers and firmware versions affect output, so mixed fleets need compatibility testing. The difficulty is capacity planning: slots, not CPU, are the limit, and a failed accelerator drops every stream on it at once.",
    k: ["Hardware vs software encoding: much higher density and lower cost per stream, but lower compression efficiency and a fixed feature set.", "Pack machines tightly vs spread streams: tight packing saves money, spreading limits how many streams one failure takes down."],
    p: ["A driver update changes output slightly, breaking keyframe alignment between machines serving the same stream.", "Session limits are hit before CPU or GPU load shows anything, so autoscaling on utilization never triggers."],
    v: "Fill a machine to its session limit, start one more stream, and confirm the scheduler routes it elsewhere or to software within seconds. Then fail the machine and confirm all its streams resume on others.",
    dep: ["transcode-scheduler","live-video-encoder"]
  },
  "keyframe-alignment": {
    s: "Ensures every rendition places keyframes at exactly the same moments, so a player can switch between them at any segment boundary without a glitch.",
    d: "Segments must start with a keyframe, and quality switching works only if every rendition's segment covers the same time span. The system forces keyframes at fixed time intervals rather than fixed frame counts, derived from the normalized timeline, so independent encoders on separate machines agree. Variable source frame rate complicates this, as does redundant encoding for failover, where two encoders must produce identical boundaries without talking to each other. Misalignment shows up only as player glitches.",
    k: ["Forced keyframes at fixed time vs scene-cut keyframes: fixed times guarantee alignment, but waste bits on static content and force extra keyframes mid-scene.", "Deriving boundaries from the shared timeline vs coordinating encoders: no communication needed, but it relies entirely on trustworthy timestamps."],
    p: ["A source with variable frame rate lands keyframes a frame off on different rungs, and switching shows a visible stutter.", "Two redundant encoders choose slightly different boundaries, so failover duplicates or drops a segment."],
    v: "Extract keyframe timestamps from every rendition for ten minutes and confirm they are identical across all rungs and across a redundant encoder pair, with no boundary differing by even one frame.",
    dep: ["timestamp-normalization","clock-and-timecode"]
  },
  "transcode-scheduler": {
    s: "Assigns each incoming stream's encoding jobs to machines with free capacity, restarts them on failure and keeps a stream's renditions together.",
    d: "When a stream goes live the scheduler picks encoders for each rung, preferring machines near the ingest point and with spare real-time capacity. It tracks health through heartbeats and moves work when a machine fails, which must happen within seconds and without resetting the stream. It also decides ladder shape from the stream's tier, and degrades gracefully under load by dropping optional rungs. The hard constraint is that jobs cannot be paused or queued: a stream starts now or is late, and capacity must be reserved ahead.",
    k: ["Spread rungs across machines vs keep a stream's rungs together: spreading uses capacity evenly, but a stream split across hosts has more failure points and sync issues.", "Reserve headroom vs run hot: headroom absorbs surges, but idle capacity costs money continuously."],
    p: ["Failing over a job to a new machine restarts the encoder, producing a visible discontinuity unless state and timestamps carry over.", "A scheduling storm when a popular channel and many follow-on streams start at once exhausts slots and delays everyone."],
    v: "Kill an encoder host carrying 50 live streams and confirm every stream resumes on other hosts within the target of a few seconds, with output continuity measured at the CDN edge showing at most one dropped segment.",
    dep: ["stream-registry","control-plane-api","event-bus"]
  },
  "source-passthrough": {
    s: "Delivers the broadcaster's original encoded stream to viewers without re-encoding, which saves compute and preserves quality for trusted high-quality sources.",
    d: "If the incoming stream already meets platform requirements, it can be repackaged directly, adding only a rendition at the source quality. This removes a full encode, lowers delay and avoids a generation loss. It requires the source to be clean: stable keyframes, conforming codec parameters, and bitrate low enough for viewers. Platforms use it for premium partners or very low-latency modes, and often transcode a lower ladder alongside it. It exposes the platform directly to the source's faults, since nothing repairs them.",
    k: ["Passthrough vs transcode: lower cost, delay and no quality loss, but viewers on weak links need a separate ladder, and source flaws reach everyone.", "Verify the source before passthrough vs trust the partner: verification protects viewers, at the cost of rejecting some inputs."],
    p: ["A source bitrate above most viewers' bandwidth is passed through unchanged and buffers for everyone without a lower rung.", "A source with irregular keyframes passes through and produces segments of wildly different sizes."],
    v: "Pass a conforming 1080p stream through and compare output bytes to input to confirm no re-encode, then confirm end-to-end delay is lower than the transcoded path by the encoder's processing time.",
    dep: ["segmenter","keyframe-alignment","ingest-health-metrics"]
  },
  "caption-extraction": {
    s: "Pulls closed caption data embedded in the incoming stream, or generates captions from speech, and turns it into text tracks that travel alongside the video.",
    d: "Broadcast sources carry captions in the video stream's side data; the platform extracts these, converts them to web text formats and attaches them as separate tracks. Where none exist, automatic speech recognition can produce captions, with a delay of a few seconds and imperfect accuracy. Tracks must stay synchronized with video through any change in timing, and be segmented in step with the media. Language selection, positioning and legal requirements for accessibility make this more than a convenience.",
    k: ["Embedded captions vs separate sidecar tracks: embedded survive any pipeline step, but sidecar tracks are easier to edit and style.", "Automatic speech recognition vs human captioners: automatic is cheap and immediate, with errors, while human captioners are accurate but need scheduling and add cost."],
    p: ["Captions drift against the audio when the source timeline is adjusted and the text track keeps its original timing.", "A stream re-encode strips caption side data, so captions disappear without any error."],
    v: "Stream a source with known captions through the platform and confirm each caption cue appears within 500 ms of its spoken words in the player, in every rendition, and survives a source reconnect.",
    dep: ["timestamp-normalization","segmenter"]
  },
  "thumbnail-generator": {
    s: "Captures still frames from live streams at regular intervals, producing the preview images shown in directories, notifications and seek bars.",
    d: "A lightweight job decodes a keyframe from a low rung every few seconds, scales it, encodes it as an image and uploads it to storage behind the CDN. The same frames can feed classifiers for moderation and quality checks. The challenge is volume and freshness: hundreds of thousands of channels each producing images, cached widely, where stale previews mislead viewers and black frames from an encoder start look like a broken stream. Seek-bar sprites for recordings are built from the same source.",
    k: ["Frequent thumbnails vs infrequent: previews reflect the stream and feed detection, but cost compute, storage writes and cache churn.", "Capture from the transcoder vs from segments: reuse of existing output avoids a decode, but couples previews to the packaging path."],
    p: ["A thumbnail taken during a transition shows a black or glitched frame that stays in directories for a minute or more.", "Long cache lifetimes show a preview of a previous game after the broadcaster has changed content."],
    v: "Start a stream, change the on-screen content, and confirm the directory thumbnail updates within the target interval and is never a black frame across a hundred consecutive captures.",
    dep: ["abr-ladder","object-storage","edge-cache"]
  },
  "latency-budget": {
    s: "The allocation of the total delay from camera to screen across capture, ingest, encoding, packaging, delivery, buffering and decoding, and the explicit choice of how much each stage may spend.",
    d: "End-to-end delay is the sum of every stage, and most of it hides in buffers: encoder lookahead, segment length, packaging, cache refresh, and the player's safety buffer. Cutting delay means shrinking every one of them, and each cut reduces the margin that hides jitter and loss. Different products accept different totals: broadcast-style streams tolerate tens of seconds, interactive ones need a second or less. A platform needs a stated target per tier and a measurement for each stage, or the delay creeps up unnoticed.",
    k: ["Low delay vs resilience: smaller buffers cut delay but make every network hiccup visible as a stall.", "One latency tier vs several: a single tier is simpler to cache and operate, but interactive features need delays the standard tier cannot meet."],
    p: ["Each team adds a second of safety buffer, and nobody owns the total, so delay doubles without any single bad decision.", "Chat shows reactions to events the viewer has not seen yet because video and chat run at different delays."],
    v: "Burn a visible timestamp into the source and compare it with the player's screen at once per minute over an hour. Each stage's contribution should be itemized and the total within the stated target.",
    dep: ["latency-tiers","live-edge-sync","segmenter"]
  },
  "timestamps-and-clocks": {
    s: "The rule that every component agrees on one timeline: how media timestamps, wall-clock time and program time are related, and who corrects them when they diverge.",
    d: "Live video involves many clocks: the camera's, the encoder's, the ingest server's, the segmenters', the player's and the viewer's own. Each runs at a slightly different rate. The platform defines a canonical timeline, maps every source onto it, and carries wall-clock time in manifests so players and other services can align. Chat, ad breaks, clip boundaries and analytics all rely on it. Without discipline, failures are subtle: audio drifts, segments overlap, ad markers fire late and recordings are cut at the wrong place.",
    k: ["One canonical timeline vs per-service clocks: simple to reason about and join data, but all services depend on the time source being reliable.", "Wall-clock time in manifests vs relative time only: players can synchronize with other events, but need correct server clocks."],
    p: ["A server with a drifting clock produces segments stamped in the future that players refuse to play.", "Ad-break markers computed from wall-clock time fire at the wrong moment when media timestamps were adjusted upstream."],
    v: "Compare timestamps for the same frame at ingest, segmenter, CDN edge and player across all servers. Differences should be within a tight stated bound, and server clock offsets from the reference should be monitored.",
    dep: ["clock-and-timecode","timestamp-normalization"]
  },
  "redundancy-and-failover": {
    s: "Deciding which components are duplicated, where failures must stay contained, and how switching happens fast enough that viewers never see it.",
    d: "A live stream has no second chance: a failure during the broadcast is lost content. The platform duplicates ingest paths, encoders, packagers, origins and CDNs, and decides at which layer each failure is repaired. Switchover must preserve timestamps and segment numbering, or players see a discontinuity. The decisions concern independence: duplicates sharing a power feed, software version or configuration fail together. Teams must also rehearse failover regularly, since untested redundancy is the usual way a backup fails exactly when needed.",
    k: ["Active-active duplicates vs standby: no switching delay and constant proof they work, but double the cost and tight synchronization.", "Failover at each layer vs one top-level switch: local repair is faster and narrower, but multiplies the mechanisms to test."],
    p: ["Primary and backup run the same buggy release, so one bad deploy takes down both.", "Failover has never been exercised under load, and the standby proves to have stale configuration."],
    v: "During a scheduled game day, kill each tier in turn under production-like load and measure the viewer-visible gap. Every tier should recover within its stated target without manual action.",
    dep: ["regional-failover","origin-failover","redundant-ingest"]
  },
  "cost-per-viewer-hour": {
    s: "Treating the cost of delivering one hour of video to one viewer as the central number, and judging every design choice by its effect on it.",
    d: "Most of the bill is delivery bandwidth, then transcoding and storage. Cost per viewer hour is the sum of those divided by hours watched, and revenue per hour must exceed it. It changes with choices that look technical: ladder size, codec efficiency, cache hit ratio, how much audience each CDN carries, and retention of recordings. Audience shape matters: a few huge streams are cheap per viewer, millions of tiny ones are not, because transcoding cost is per stream rather than per viewer.",
    k: ["More efficient codecs vs wide device support: lower bandwidth cost, but extra renditions and many devices that cannot decode them.", "Transcode everything vs transcode on demand: simple and always ready, against saving compute on streams almost nobody watches."],
    p: ["Optimizing average cost hides that a small set of streams with huge audiences or many renditions dominates the bill.", "A free feature such as long retention of recordings silently becomes the largest storage cost."],
    v: "Produce a weekly breakdown of cost per viewer hour split by bandwidth, compute and storage and by stream size bucket, and confirm it reconciles with the invoices to within a few percent.",
    dep: ["egress-cost-controls","multi-cdn-steering","abr-ladder"]
  },
  "content-protection": {
    s: "The set of rules and mechanisms that decide who may watch, copy or redistribute a stream, from signed links to encryption to forensic marking.",
    d: "Protection is applied in layers. Access control checks entitlements and issues short-lived signed URLs or tokens. Encryption protects segments in transit and at rest, with keys released by a license service to approved players. Watermarking can identify the source of a leak. Each layer adds latency and breaks some devices, and none stops a determined person pointing a camera at a screen. The decisions concern how much friction to accept for what content: free community streams, paid events and licensed sports need very different levels.",
    k: ["Strong encryption and device checks vs broad reach: licensed content demands it, but it excludes older devices and adds seconds to startup.", "Short token lifetimes vs simplicity: short tokens limit link sharing, but players must renew them without interrupting playback."],
    p: ["Tokens that never expire are posted publicly and the stream is rebroadcast by others.", "Strict device checks reject legitimate viewers on unusual browsers, who then blame the platform."],
    v: "Copy a signed segment URL, wait for its expiry, and confirm requests are refused at the edge. Then play an encrypted stream on an unapproved player and confirm no license is issued.",
    dep: ["signed-urls","content-encryption","entitlements","drm-license-client"]
  },
  "end-to-end-observability": {
    s: "The ability to follow one stream from encoder to viewer screen with the same identifiers and clocks, so a problem can be located to a single stage within minutes.",
    d: "Each stage emits metrics and logs tagged with a stream identifier and the shared timeline: ingest bitrate, encoder speed, segment publish times, cache hit ratios, player stalls. Joined together, they let an operator see that stalls in one region began when one CDN's error rate rose, not guess. Without consistent identifiers, every team sees only its own system as healthy. The cost is volume: telemetry from millions of players is itself a large streaming system that must not harm the playback it measures.",
    k: ["Sample player telemetry vs collect all: sampling bounds cost, but rare problems on small streams may never be seen.", "Common identifiers everywhere vs per-team logs: joining becomes possible, but every team must adopt and keep the convention."],
    p: ["Dashboards show healthy servers while thousands of viewers stall, because only machine metrics are collected.", "A telemetry surge during a big event overloads the analytics pipeline exactly when it is most needed."],
    v: "Inject a fault, such as a delayed segment publish for one stream, and confirm an operator can trace the viewer stalls back to the stage and server responsible using only the shared identifiers, within five minutes.",
    dep: ["viewer-qoe-metrics","ingest-health-metrics","cdn-log-pipeline","alerting-and-slos"]
  },
});
