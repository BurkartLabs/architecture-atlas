// Details for the video conferencing plate, part 5: global routing, operations and cross-cutting concerns.
ATLAS.details("video-conferencing", {
  "edge-selection": {
    s: "Chooses the media server or relay a client should connect to, using measured latency, geography and load rather than a static assignment.",
    d: "At join, the client receives a ranked list of candidate edges from the control plane, based on its approximate location, the room's placement and server load. It may probe the top candidates with small round-trip tests and pick the best measured. Choices are cached per network. Mobile clients re-evaluate after a network change. It is hard because geographic proximity is a poor proxy for network distance, location databases are wrong for mobile and corporate networks, and probing delays the join.",
    k: ["Server-side choice from location data vs client-side probing: server choice is instant but guesses, while probing measures reality at the cost of join delay.", "Always the nearest edge vs the least loaded among near ones: nearest minimizes latency, but a hot edge degrades quality for everyone on it."],
    p: ["A corporate network that exits at a distant gateway is mapped to the wrong continent and sent to a far edge.", "Probing blocked by a firewall returns no data and the client picks arbitrarily."],
    v: "Join from clients on five networks in different regions and confirm each connects to the edge with the lowest measured round trip, with total time to choose and connect under two seconds.",
    dep: ["traffic-steering", "capacity-scheduler", "network-probes"]
  },
  "meeting-placement": {
    s: "Decides which region or regions host a meeting's media, balancing the participants' locations, expected size, residency rules and cost, and whether to span several.",
    d: "Placement uses the first participants, the invited list and history to guess where attendees will be. Small or single-region meetings live on one server. Meetings with distant participants may use servers in several regions linked by cascading, so each person has a short last hop. Policies override: data residency may pin a meeting to a region. It is hard because the participant set is unknown at the start and changes, and moving a running meeting is disruptive.",
    k: ["Single region for simplicity vs cascade across regions: a single region is cheaper and simpler, but penalizes distant participants with long hops.", "Decide early from invites vs adapt as people join: early decisions avoid mid-meeting moves, while adaptation matches reality but needs migration."],
    p: ["A meeting is started by someone in one region and later fills with people in another, who all suffer long delay.", "Cascading is triggered for two distant participants even in a ten-person meeting dominated by one region, raising cost for little gain."],
    v: "Create a meeting with attendees in three continents and verify it is cascaded with each participant's edge within the target round trip, and a single-region meeting stays on one node.",
    dep: ["room-allocator", "residency-routing", "sfu-cascade", "capacity-scheduler"]
  },
  "capacity-scheduler": {
    s: "Tracks available media capacity by region and server, forecasts demand and reserves headroom, so new meetings are accepted without overloading nodes.",
    d: "Servers report load in terms that matter, such as egress bandwidth, packets per second and participant slots, not just CPU. The scheduler aggregates these, reserves room for scheduled large events, and exposes headroom to the allocator. It uses historical patterns, such as the start of the hour, to pre-scale. It is hard because meeting load is bursty and synchronized at fixed times, and measured load lags reality, so the scheduler must plan for demand it has not yet seen.",
    k: ["Reserve capacity for known events vs best effort: reservations guarantee large events, but leave capacity idle if attendance is lower.", "Measure load by egress vs by participant count: egress reflects true cost, while participant count is easier to predict but ignores differences between meetings."],
    p: ["Everyone joins at the top of the hour and the allocator sees stale low load while nodes fill.", "Capacity is reserved for an event that is later cancelled and never released."],
    v: "Replay the traffic of a past peak hour in a test environment and confirm no node exceeds its target load, reserved events get their capacity, and join failures stay at zero.",
    dep: ["server-telemetry", "autoscaling-and-drain", "load-testing"]
  },
  "autoscaling-and-drain": {
    s: "Adds media servers ahead of demand, removes them when idle, and drains them gently so live meetings are not cut off by a scale-down or deployment.",
    d: "New servers start, warm up and register capacity. When shrinking or deploying, a node is marked draining: it accepts no new rooms, existing meetings continue until they end or are moved, with a deadline. Moving a live meeting means migrating state and re-attaching participants. Scaling is tied to forecasts, not just current load, because starting servers takes minutes. It is hard because meetings can last hours, so draining takes time, and impatient scale-down kills real calls.",
    k: ["Wait for meetings to end vs migrate them: waiting is safe but slows deployments and keeps costs, while migration is fast but risks glitches.", "Scale on current metrics vs scheduled forecasts: reactive scaling is simple but late for synchronized spikes, while scheduled scaling needs good predictions."],
    p: ["A deploy drains nodes faster than meetings end and forcibly disconnects long calls.", "Scale-down removes a node holding a meeting that the allocator had just assigned to it."],
    v: "Drain a node holding live meetings and confirm it takes no new rooms, existing rooms finish or migrate within the deadline with at most a brief media gap, and no participants are dropped.",
    dep: ["capacity-scheduler", "regional-failover", "room-state-service", "reconnect-and-resume"]
  },
  "backbone-and-relays": {
    s: "The network links between regions that carry cascaded media, which may be a private backbone with controlled quality or the public internet with relays and extra congestion control.",
    d: "Inter-region traffic is the expensive and delay-sensitive part of a global service. A private backbone gives predictable latency and loss but costs money; the public internet is cheap and variable. Links carry aggregated media between servers and use their own bandwidth estimation. Relay nodes at the edge terminate client connections and carry them onto the backbone. It is hard because capacity between regions is limited and must be shared across many meetings, and routing around a failed path must be quick.",
    k: ["Private backbone vs public internet between regions: a backbone offers consistent latency and loss, while the public path is cheaper but less predictable.", "Dedicated relay tier vs media servers doing both: a relay tier simplifies edges, but adds a component and a hop."],
    p: ["A congested inter-region link degrades every cascaded meeting through it at once.", "Failover to the public path increases loss and the estimator reacts slowly."],
    v: "Inject loss on one inter-region link and confirm affected meetings reroute to an alternate path within seconds, with the end-to-end loss measured at participants staying within the target.",
    dep: ["sfu-cascade", "bandwidth-estimator", "edge-selection"]
  },
  "regional-failover": {
    s: "Moves meetings and new joins to healthy regions when a data center, server pool or link fails, with a defined recovery plan for live meetings.",
    d: "Health checks and telemetry detect loss of a region or cluster. New joins are steered away through the allocator and routing layer. Live meetings reconnect: clients detect the loss, request a new edge and rejoin the room, whose state is recovered from checkpoints or rebuilt from participants. Capacity in the receiving regions must exist. It is hard because failover is a thundering herd: every affected client reconnects simultaneously to the same few survivors.",
    k: ["Active-active regions with spare capacity vs active-passive: active-active recovers fastest and uses capacity daily, while active-passive is cheaper but cold.", "Rebuild room state from checkpoints vs from client reports: checkpoints are quick but may be slightly stale, while client reports are always current but slower."],
    p: ["A failover sends the entire displaced population to one region and overloads it, causing a second outage.", "Rooms recovered from stale checkpoints show participants who left or miss ones who joined."],
    v: "Fail a region in a staging environment during a load test and measure the time until ninety-five percent of affected participants have media again and the survivors stay under their load limit.",
    dep: ["room-state-service", "reconnect-and-resume", "capacity-scheduler", "traffic-steering"]
  },
  "residency-routing": {
    s: "Keeps a meeting's media, recordings and metadata inside required geographic boundaries, by routing and placing servers and storage according to customer policy.",
    d: "Customers or laws require that data be processed in particular countries or regions. The policy attaches to the account or meeting and constrains placement, relays, recording storage and logging destinations. Cascading across a boundary must be disallowed or limited to encrypted pass-through. It is hard because it conflicts with latency optimization: a participant abroad may have to connect to a distant allowed region, and every subsystem, including support tooling and analytics, must obey it.",
    k: ["Strict residency vs best-effort proximity: strict residency meets legal needs but forces distant participants through long paths, while proximity gives quality but breaks the rule.", "Region-scoped control plane vs global control plane: a regional plane keeps metadata local but duplicates operations, while a global plane is simpler but processes data everywhere."],
    p: ["Logs and diagnostics are shipped to a central region and quietly violate the residency promise.", "A failover path sends a restricted meeting out of region."],
    v: "Run a residency-restricted meeting with an out-of-region participant and audit every server, relay, log and storage destination touched; all must be inside the allowed region.",
    dep: ["meeting-placement", "recording-storage", "meeting-policies", "server-telemetry"]
  },
  "traffic-steering": {
    s: "Uses name resolution and network-level routing to direct clients to nearby, healthy entry points and shift traffic during incidents or maintenance.",
    d: "Geographic name resolution returns different addresses depending on the requester's location and the health of each region. Anycast advertises the same address from many sites so network routing picks the closest. Weights and health data shift traffic. TTLs control how fast changes take effect. It is hard because resolver locations differ from client locations, caches ignore short TTLs, and routing changes can shift traffic abruptly and unpredictably.",
    k: ["Name-based steering vs anycast: name-based steering is controllable and observable, while anycast is fast to converge and needs no client cooperation, with less control over where traffic lands.", "Short TTL for fast failover vs longer TTL for stability: short TTL moves traffic quickly, but increases resolution load and makes outages in the resolver more damaging."],
    p: ["Clients keep using a failed address because intermediate resolvers ignore the short TTL.", "An anycast route flap moves an in-progress call to another site, breaking the session."],
    v: "Withdraw one region in a test and measure how fast new joins stop landing there, and what share of existing clients keep resolving to it after one TTL.",
    dep: ["edge-selection", "regional-failover"]
  },
  "client-stats-collector": {
    s: "Samples detailed per-call measurements on each client, such as bitrate, loss, jitter, frame rate and device events, and ships them for analysis.",
    d: "The client reads statistics from its media engine every few seconds, aggregates them per stream, and uploads them over signaling or a telemetry path, with batching and sampling controls. Fields include round trip, concealed audio, freeze counts, resolution and the adaptation reasons. Clients are the only place that sees what the user experienced. It is hard because volume is high at scale, the data is privacy sensitive, and inconsistent definitions across platforms make aggregated numbers misleading.",
    k: ["Report every few seconds vs summary at the end: periodic reports give a timeline and survive crashes, but cost bandwidth and storage, while end summaries are cheap and lose the shape of problems.", "Full detail for all vs sampled detail: full detail is complete, but sampled data cuts cost and still finds fleet trends."],
    p: ["Clients that crash never upload their final, most interesting statistics.", "Counters reset at renegotiation and appear as impossible drops in the aggregate."],
    v: "Run a call with a scripted impairment and confirm uploaded statistics show the impairment in the right time window, with consistent field meanings across two client platforms.",
    dep: ["rtp-rtcp", "loss-concealment", "bandwidth-estimator"]
  },
  "quality-score": {
    s: "Condenses loss, delay, jitter, frame rate and concealment into a single rating per participant per interval, estimating how good the call felt.",
    d: "A model maps measurable inputs to a mean-opinion-style score separately for audio and video, often trained on listening and viewing tests, and combines them with context such as device and network. Scores are computed on the client or the pipeline and aggregated by region, network and version. It is hard because the score is a proxy for perceived quality; averages hide the participants having the worst time, and models trained on one type of impairment miss others.",
    k: ["Model-based score vs user feedback ratings: models cover every call objectively, while ratings measure real opinion but are sparse and biased to extremes.", "Per-participant scores vs per-meeting scores: per-participant scores find who is suffering, while per-meeting scores are easier to read but hide the outliers."],
    p: ["A mean score is stable while a small fraction of users in one network have unusable calls.", "A score that ignores concealment rates audio as good when it was heavily patched."],
    v: "Correlate scores with user ratings on a sample of calls and confirm that low scores predict low ratings, and a known degraded test call is scored below the alert threshold.",
    dep: ["client-stats-collector", "loss-concealment"]
  },
  "server-telemetry": {
    s: "Metrics, logs and traces from media and signaling servers: load, packet rates, queue delays, room counts and errors, tied to meeting and participant identifiers.",
    d: "Each server emits counters and histograms of forwarding delay, egress rate, drops, room and participant counts, and event logs of joins and leaves. Traces follow a join across gateway, allocator, state owner and media node. Identifiers let engineers join server data with client reports for the same session. It is hard because per-packet data cannot be kept, so sampling and aggregation decide what questions can be answered later, and identifiers are personal data with retention limits.",
    k: ["High-cardinality labels by meeting vs aggregates only: per-meeting labels allow tracing a complaint, but explode storage, while aggregates are cheap and cannot find one bad call.", "Retain raw logs briefly vs keep summaries long: raw logs help debugging, while summaries support long-term trends within privacy limits."],
    p: ["Telemetry load from a busy node adds delay to the forwarding path it measures.", "A missing identifier in one service breaks the join between client and server views of the same call."],
    v: "Pick a meeting by ID and reconstruct its join sequence, media node, per-stream rates and any errors from server telemetry alone, matching what the client reported.",
    dep: ["state-event-bus", "rtp-forwarder", "signaling-gateway"]
  },
  "session-timeline": {
    s: "A merged, time-ordered view of one participant's call: joins, network changes, bitrate and layer changes, device events and errors from client and server together.",
    d: "A diagnostics tool joins client reports, signaling events and media node logs by session identifier, aligns clocks, and renders a timeline with quality over time and annotated events. Support and engineers use it to answer why one person's call went badly. It highlights causes such as a bandwidth drop followed by layer downgrade. It is hard because clocks differ between sources, data arrives late, and explanations must be careful not to confuse correlation with cause.",
    k: ["Join data at query time vs precompute timelines: query-time joins are flexible and cheap to store, while precomputed timelines are fast to open but fixed in shape.", "Show raw events vs inferred causes: raw events are honest, while inferred causes save time but can be wrong and mislead support."],
    p: ["Clock skew between client and server places an event before its cause.", "Missing client data for crashed sessions leaves a timeline that ends without explanation."],
    v: "Reproduce a call with a known network cut, and confirm the timeline shows the cut, the estimate drop, the layer change and the recovery, in order and within a second of ground truth.",
    dep: ["client-stats-collector", "server-telemetry", "clocks-and-sync"]
  },
  "network-probes": {
    s: "Short tests before or during a call that measure reachability, bandwidth, delay and loss to the service, and report the findings to the user or the system.",
    d: "A probe sends bursts of packets to a test endpoint over each transport the client may use, measures how many return and how fast, and detects blocked ports and proxies. Results inform edge choice, initial bitrate and warnings, and are reported to the quality dashboard. Probes also run in the background from many vantage points to watch the network. It is hard because a short test is a noisy sample of a changing network and it consumes bandwidth and time.",
    k: ["Probe before joining vs infer during the call: probing avoids a bad start but delays the join, while inference is free but learns slowly.", "Probe against the real media edge vs a separate test service: the real edge reflects the true path, while a test service avoids load and mixing concerns."],
    p: ["A pre-call test says the network is fine and conditions change a minute later.", "Tests blocked by the same firewall rule that blocks media give a false alarm or none."],
    v: "Run the probe from networks with known bandwidth and blocking, and confirm measured values are within ten percent of truth and blocked transports are named correctly.",
    dep: ["ice-agent", "tcp-tls-fallback", "stun-and-turn"]
  },
  "synthetic-meetings": {
    s: "Scripted bots that join real meetings in each region on a schedule, send and receive media, and measure end-to-end quality like users would.",
    d: "Bots run on cloud machines in many regions and networks, joining test meetings, publishing known audio and video patterns and checking what arrives: delay, loss, decoded frames and audio content. They exercise the full path including signaling, allocation, media and transport. Failures page the on-call. It is hard because bots on data center networks behave unlike home connections, so they find outages quickly but miss last-mile problems.",
    k: ["Bots in real regions on real networks vs inside the cluster: external bots test the whole path including routing, while internal bots are simpler and detect server faults only.", "Frequent short meetings vs long-running ones: short meetings test join paths, while long ones catch leaks and slow degradation."],
    p: ["Bots report health while real users fail because bots use a path that real clients do not.", "A bot's own network issue creates false alarms that train people to ignore pages."],
    v: "Disable one region's media nodes in staging and confirm the bots in that region report failure within the alert window while others stay green, and each alert names the failing stage.",
    dep: ["edge-selection", "client-stats-collector", "alerting-and-slos"]
  },
  "alerting-and-slos": {
    s: "Targets for join success, call quality and delay measured from users' view, and alerts that fire when the fleet or a segment breaches them.",
    d: "Service-level objectives are defined on user-visible measures: percent of joins that succeed within a time, percent of participant-minutes above a quality score, media start time. Alerts use burn rate over several windows to tell brief blips from sustained problems, and are sliced by region, network type and client version to find narrow regressions. It is hard because fleet averages hide small affected groups, a new client version can regress quality for one platform, and alerts must be actionable.",
    k: ["Alert on symptoms users feel vs on causes like CPU: symptoms catch unknown failures, while cause alerts are quicker to act on but miss novel problems.", "Segment-level alerts vs global: segmenting finds narrow regressions, but multiplies alerts and requires enough data per segment."],
    p: ["A regression affecting one client version on one network is invisible in the global quality average.", "Noisy alerts about expected load swings train the team to dismiss pages."],
    v: "Inject a ten percent join failure in one region, and confirm the alert fires within minutes, identifies the region and stage, and does not fire for a one-minute blip.",
    dep: ["quality-score", "server-telemetry", "client-stats-collector"]
  },
  "load-testing": {
    s: "Generates realistic meeting load with many synthetic participants to find the limits of nodes and the control plane before real events do.",
    d: "Load tools launch thousands of lightweight clients that join rooms, publish and subscribe to media according to meeting shapes: small, large, webinars, with join waves. They record delay, loss, join latency and resource use at servers. Tests find per-node limits that feed the capacity model and verify autoscaling and failure behavior. It is hard because synthetic clients lack real network jitter, their own machines become the bottleneck, and meeting shapes in production keep changing.",
    k: ["Full clients with real decoding vs lightweight packet generators: full clients are realistic but expensive, while generators reach scale cheaply and miss client-side effects.", "Replay recorded production shapes vs invented scenarios: recorded shapes are realistic, while invented scenarios test extremes production has not yet produced."],
    p: ["The load generator saturates before the system under test, and the results measure the test machines.", "Tests use evenly spaced joins while production has a synchronized wave at the hour."],
    v: "Ramp to the target participant count with a synchronized join wave and confirm join success, forwarding delay percentiles and loss meet the targets, and record the load at which each first degrades.",
    dep: ["synthetic-meetings", "capacity-scheduler", "rtp-forwarder"]
  },
  "latency-budget": {
    s: "The decision to treat conversational delay as a fixed budget, around 150 to 400 ms from mouth to ear, and divide it among capture, encode, network, buffering and playback.",
    d: "People talk over each other when one-way delay passes a few hundred milliseconds. The budget is spent in capture and processing, codec frame size, network distance, forwarding hops, jitter buffer and render. Every component negotiates for some of it: a larger jitter buffer buys smoothness at the cost of delay; a cascade hop buys proximity for added hops. Teams measure the real delay end to end. The budget forces trade-offs, since improving robustness nearly always spends delay.",
    k: ["Spend delay on smoothness vs on interactivity: larger buffers hide jitter and loss, but make conversation awkward, so meetings choose small buffers and conceal damage.", "Extra hops for proximity vs direct long paths: cascading adds forwarding delay but shortens unreliable last miles, which usually wins for distant participants."],
    p: ["Each component adds a little buffering and the total reaches half a second unnoticed.", "Delay measured per component looks fine while the sum fails because nobody owns the whole."],
    v: "Measure glass-to-glass and mouth-to-ear delay with a timestamped test signal across regions; the sum of per-stage budgets should match the measured total and stay under the target at the ninety-fifth percentile.",
    dep: ["audio-jitter-buffer", "audio-encoder", "sfu-cascade", "render-and-av-sync", "capture-pipeline"]
  },
  "loss-tolerance": {
    s: "The decision to run over unreliable datagrams and design every stage to degrade gracefully when packets are late, lost or reordered, rather than waiting for perfect delivery.",
    d: "Retransmitting everything, as a reliable stream does, would turn a lost packet into a pause for all later data. Real-time media accepts loss and repairs selectively: concealment for audio, retransmission when time allows, redundancy and correction when it does not, and skipping to a keyframe when references are gone. Each layer decides how much loss it tolerates. The choice shapes codecs, buffers, transports and congestion control, and rules out the simplest delivery model.",
    k: ["Unreliable delivery with selective repair vs reliable streams: selective repair keeps delay bounded, while reliable streams give exact data but unbounded stalls on loss.", "Spend bandwidth on protection vs on quality: protection keeps calls stable on lossy links, but costs bits on clean ones, so it adapts to measured loss."],
    p: ["Treating the fallback reliable path as equivalent hides the stalls it causes in practice.", "Each layer assumes another repairs the loss, and nobody does."],
    v: "Run the call through a loss profile of random and bursty loss from zero to ten percent and confirm audio intelligibility and freeze counts stay within the stated targets at each level.",
    dep: ["loss-concealment", "nack-retransmit", "forward-error-correction", "video-jitter-buffer", "tcp-tls-fallback"]
  },
  "scaling-topology": {
    s: "The decision about how media flows between participants, full mesh, forwarding server or mixing server, and how that grows with meeting size and region count.",
    d: "In a mesh each person sends to everyone, which fails past a few people. A forwarding server needs one uplink per sender and gives each receiver only what it needs, so cost grows mostly in server egress. A mixing server shifts the cost into decode and encode but gives receivers a single stream. Large audiences add distribution trees, and global meetings add cascaded servers. Nearly every other component, from layers to recording, follows from this topology choice.",
    k: ["Forwarding vs mixing: forwarding scales cheaply and gives clients control but needs capable endpoints, while mixing supports any device at a high compute cost.", "Peer-to-peer for two people vs always through a server: peer-to-peer saves server cost and delay, but then needs a switch to a server when a third joins and offers no server features."],
    p: ["A design choice for ten participants fails at a thousand because the topology was never revisited.", "Switching from peer to server on the third join causes a visible glitch."],
    v: "Add participants to a room one by one and watch uplink per sender and server egress; uplink stays flat and egress grows as expected for the chosen topology until the documented limit.",
    dep: ["rtp-forwarder", "mcu-mixer", "sfu-cascade", "audience-fanout"]
  },
  "trust-and-privacy": {
    s: "The decision about who may see media and metadata: transport-only encryption with a trusted server, or end-to-end encryption, plus what is recorded, retained and visible to hosts.",
    d: "Transport encryption protects against the network but gives the service access to content, which enables recording, captions, mixing and moderation. End-to-end encryption removes server access and with it those features. Beyond content, the system decides what identity is shown, which data stays in region, what the host can see about others, and how long anything is kept. Consent for recording and transcription differs by place. These choices must be explainable to participants.",
    k: ["Server-visible media with rich features vs end-to-end encryption with fewer: server-visible is the default for product breadth, while end-to-end suits sensitive meetings that accept the limits.", "Collect detailed quality data vs minimize: detail finds problems quickly, but retains personal data and widens exposure."],
    p: ["Users believe a meeting is private in ways the design does not guarantee.", "A diagnostic feature collects data that policy said would not be collected."],
    v: "For each meeting mode, list who and what can access audio, video, chat, recordings and metadata, and verify by test that access matches the published statement.",
    dep: ["dtls-srtp", "frame-encryption", "meeting-policies", "recording-storage"]
  },
  "clocks-and-sync": {
    s: "The decision of which clocks define time in a call, and how capture times, playout times and server events are aligned despite devices that drift and networks that vary.",
    d: "Every device has its own oscillator, so audio capture, video capture and playback drift from each other and from remote devices. Media timestamps are in the codec's own clock; sender reports map them to wall time; receivers use audio as a master and align video to it. Servers use wall clocks for logs, and diagnostics must correct skew between them. Sampling-rate mismatches between capture and playback cause slow buffer growth or underrun that engines correct by resampling.",
    k: ["Audio clock as master vs a shared network time: audio-master needs no time infrastructure and keeps sound smooth, while shared time aligns across participants but needs synchronization.", "Resample to absorb drift vs drop or repeat samples: resampling is inaudible but costs processing, while dropping is simple and produces clicks."],
    p: ["A tiny rate mismatch grows a playback buffer for an hour until delay is seconds.", "Server logs with unsynchronized clocks mis-order events across machines."],
    v: "Run a two-hour call between devices with deliberate clock offset and confirm playout delay and lip-sync stay within bounds throughout, with the engine's drift correction counters visible in statistics.",
    dep: []
  },
  "cost-per-minute": {
    s: "The decision to treat each participant-minute as a unit with a measurable cost in egress, compute and storage, and to design features and defaults against that cost.",
    d: "Forwarding costs bandwidth out of servers, mixing and transcoding cost compute, recording and transcripts cost storage and inference, and cascading costs inter-region transit. Quality choices have a price: more layers, higher resolution and redundancy all raise it. Platform teams track cost per participant-minute by meeting type and region, and set limits, such as the number of visible tiles or free-tier resolution, accordingly. Pricing and product tiers follow from what is cheap and what is not.",
    k: ["Higher default quality vs cost control: higher quality improves experience, but at millions of minutes the egress bill dominates, so defaults cap tiles and resolution.", "Do heavy work on the server vs on the client: client work is free to the operator, but shifts battery and heat to users and varies by device."],
    p: ["A new default such as more visible tiles raises egress cost for every call before anyone notices.", "Heavy features enabled for every meeting rather than where needed drive costs without value."],
    v: "Compute cost per participant-minute from egress, compute and storage metrics for each meeting type, and confirm a controlled change in default tiles shows up in the number within one billing period of data.",
    dep: ["rtp-forwarder", "mcu-mixer", "recording-storage", "sfu-cascade", "layer-selector"]
  },
});
