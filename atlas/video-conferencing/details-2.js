// Details for the video conferencing plate, part 2: recording and signaling.
ATLAS.details("video-conferencing", {
  "recording-orchestrator": {
    s: "Starts, stops and supervises recordings, checks consent and policy, announces recording to participants and tracks each output from capture through to availability.",
    d: "A record request is validated against policy and the host's role, then the orchestrator allocates a recorder, tells the room to show a recording indicator and notifies participants. It tracks the recorder's health, handles pauses and restarts, and when the meeting ends triggers processing, storage and notification. State is durable so a recorder crash does not lose the job. It is hard because recording is a second consumer under tight real-time demands, and legal requirements such as consent by jurisdiction must be enforced, not just displayed.",
    k: ["Recorder as hidden participant vs tap on the media server: a participant is simple and uses normal paths, while a tap avoids an extra subscriber but couples recording to server internals.", "Automatic start by policy vs manual start: automatic ensures compliance records exist, but hosts lose control and storage fills with unneeded meetings."],
    p: ["A recorder that dies silently leaves a meeting without a recording while the indicator still shows red.", "Starting a recording mid-meeting without notifying late joiners breaks consent rules."],
    v: "Start a recording, kill the recorder process, and confirm another takes over within seconds, the participant indicator stays accurate, and the final file has at most a short gap with correct metadata.",
    dep: ["meeting-policies", "track-recorder", "room-state-service", "roster-and-presence"]
  },
  "track-recorder": {
    s: "Captures each participant's audio and video as separate timestamped tracks, preserving the original streams so layouts and edits can be produced later.",
    d: "The recorder receives forwarded RTP streams, depacketizes them into frames, and writes each track to storage with timestamps and gap markers, without decoding unless needed. Separate tracks let later processing choose layouts, remove one speaker or re-transcribe. Streams that change quality layers mid-call are stitched. It is hard because tracks start at different times, packets are lost and reordered, and clocks differ, so alignment relies on RTP timestamps mapped to wall time through sender reports.",
    k: ["Raw per-track capture vs composite only: separate tracks keep options open, but storage and later processing cost grow with participants.", "Record received layer vs request top layer: recording the best layer gives quality, but adds downlink load to the recorder."],
    p: ["Tracks that start late are misaligned because the mapping from RTP timestamps to wall time was wrong.", "Resolution changes from layer switches break a naive file writer."],
    v: "Record a three-person call where one person joins late and drops packets; replay the tracks together and check lip-sync within 100 ms and silence rather than drift where packets were lost.",
    dep: ["rtp-forwarder", "rtp-rtcp", "subscription-manager", "recording-storage"]
  },
  "composite-renderer": {
    s: "Decodes selected tracks, lays them out like a meeting view, and encodes a single audio-video file or stream for playback, sharing and broadcast.",
    d: "The renderer pulls tracks from storage or live feeds, applies a layout template following who spoke or shared, mixes audio, and encodes the result. It can render faster than real time offline, or in real time for live output. Layout decisions replay from recorded speaker and share events. It is the most compute-intensive step in recording: decode of many streams plus encode of one, repeated per output format, and it needs the same layout logic as the live client.",
    k: ["Render live during the meeting vs render afterward from tracks: live output is ready at the end but cannot be corrected, while offline rendering can re-layout but delays availability.", "Fixed layout vs speaker-driven: fixed is cheap and predictable, speaker-driven is easier to watch but needs event data and more complexity."],
    p: ["Layout events and media timelines use different clocks, so the active speaker highlight is shown for the wrong person.", "Rendering queues build after many meetings end at the top of the hour and delay recordings for hours."],
    v: "Render a recording of a ten-person call and verify the output length equals the meeting length within a second, audio is mixed from all speakers, and the shared screen appears when the share began.",
    dep: ["track-recorder", "video-layouts", "active-speaker-detection", "audio-encoder"]
  },
  "transcript-pipeline": {
    s: "Turns meeting audio into a speaker-labeled, time-aligned transcript, in real time for captions and in batch for higher accuracy after the meeting.",
    d: "Real-time and offline paths share a structure: audio from each speaker is segmented by voice activity, passed to speech recognition, then punctuated and attributed using roster and track information. Offline passes can use more context and a larger model, then replace live text. Output feeds captions, search, summaries and compliance exports. It is hard because language, accents and vocabulary vary, cross-talk confuses attribution, and transcripts are sensitive data subject to retention and access rules.",
    k: ["Streaming recognition vs batch after the meeting: streaming enables captions but is less accurate, while batch gives better text at a delay.", "Per-track recognition vs mixed audio: per-track labels speakers reliably but multiplies recognition cost with participants."],
    p: ["A transcript attributes words to the wrong person when two people share a room and a single microphone.", "Transcripts stored outside the recording's retention policy outlive the recording they came from."],
    v: "Run a scripted meeting with three speakers and known text; compare the transcript to the script for word error rate, speaker attribution accuracy and timestamps within half a second.",
    dep: ["track-recorder", "audio-encoder", "roster-and-presence", "recording-storage"]
  },
  "recording-storage": {
    s: "Durably stores recordings, tracks and transcripts with access control, encryption and retention schedules, deleting them when policy or a legal rule requires.",
    d: "Artifacts are written to object storage under keys tied to the meeting, encrypted at rest, and listed in a metadata store with owner, participants, retention and legal-hold status. A lifecycle job moves old items to cheaper tiers and deletes them at expiry, unless a hold applies. Access is granted by link or role and audited. It is hard because recordings are large, deletions must be complete across copies, derived data and caches, and different customers need different retention and regions.",
    k: ["Customer-chosen retention vs a fixed default: custom retention meets legal requirements, but raises the work of proving deletion and complicates storage tiering.", "Link sharing vs account-only access: links are convenient to share, but a leaked link exposes the meeting."],
    p: ["A deleted recording still exists in a derived transcript or thumbnail store and is found later.", "Legal hold fails to stop an automatic deletion because the job ignores the hold flag."],
    v: "Set a one-day retention, advance the clock, and confirm the recording, tracks, transcript and thumbnails are all gone and unreachable by any prior link, while a held meeting remains.",
    dep: ["meeting-policies", "directory-and-presence"]
  },
  "playback-delivery": {
    s: "Prepares recordings for viewing through transcoding into adaptive formats and serves them with access checks, seeking, speed control and synchronized transcripts.",
    d: "After rendering, the media is transcoded into several bitrates and segmented so players adapt to the viewer's connection. A delivery layer authorizes each request, serves segments through a cache and supports seeking and variable speed. A player overlays chapters, speaker timeline and clickable transcript. It is hard because the audience is unpredictable, most recordings are viewed rarely, and storage and transcoding costs accumulate for content nobody watches.",
    k: ["Transcode everything immediately vs on first view: immediate transcoding makes the first view fast, but on-demand saves compute for recordings nobody opens.", "Short-lived signed segment URLs vs session cookies: signed URLs scale through caches, but can be shared within their lifetime."],
    p: ["A viewer on a slow link receives only the top bitrate because the ladder lacks a low rung.", "Authorization checks on every segment add latency that causes stalls."],
    v: "Open a recording on a throttled connection and confirm the player starts within three seconds, drops to a lower rung without stalling, and seeking to a transcript line lands within a second of the words.",
    dep: ["recording-storage", "composite-renderer", "transcript-pipeline", "edge-selection"]
  },
  "highlights-and-search": {
    s: "Builds searchable indexes and short summaries from transcripts and meeting events so people can find decisions, action items and moments across many recordings.",
    d: "The pipeline takes transcripts, chat, shared documents and speaker timelines, splits them into segments, and indexes them for keyword and semantic search. A summarization step may produce topics, action items and chapter markers. Results link back to timestamps. Access control is applied at query time so people only find meetings they were in or may view. It is hard because summaries can be wrong or omit crucial context, and indexes must follow retention: deleted meetings must disappear from search.",
    k: ["Summaries generated automatically vs on request: automatic generation is convenient but spends compute on meetings nobody reads, and risks surfacing sensitive content.", "Search filtered at query time vs separate indexes per audience: query-time filtering is flexible, but a bug in it can leak across meetings."],
    p: ["A summary states a decision nobody made, and people act on it without checking the recording.", "Search results show snippets from meetings the user is no longer allowed to view."],
    v: "Search for a phrase spoken in a test meeting as a participant and as a non-participant; only the participant sees the result, and clicking it opens the recording at the right time.",
    dep: ["transcript-pipeline", "recording-storage", "meeting-policies"]
  },
  "signaling-gateway": {
    s: "Terminates client connections for signaling, authenticates them, routes messages to the right room, and keeps lightweight session state for fast reconnection.",
    d: "Clients hold a persistent bidirectional connection over standard web transports. The gateway validates the token, binds the connection to a participant session, forwards requests to the room's owner and pushes events back. It handles keepalives, backpressure and protocol versions. Gateways are stateless apart from the connection, so a client can reconnect through another gateway. It is hard because a single room's participants may be spread across many gateways, so delivery relies on the event bus, and connection storms after a failure can overwhelm the fleet.",
    k: ["Gateway tier separated from room logic vs combined: separation lets each scale independently, but adds a hop to every message.", "Long-lived connections vs request-response polling: persistent connections give immediate events and low overhead, but need connection draining for deploys."],
    p: ["A deployment that restarts gateways together disconnects every client at once and triggers a reconnect storm.", "Slow clients accumulate unbounded queues and exhaust gateway memory."],
    v: "Drain one gateway under load and confirm clients reconnect to others within a few seconds, resume their sessions without rejoining media, and the reconnect rate stays under the fleet's admission limit.",
    dep: ["join-tokens", "state-event-bus", "room-state-service", "reconnect-and-resume"]
  },
  "join-tokens": {
    s: "Short-lived signed credentials that authorize one participant to enter one room with specific permissions, checked at signaling and again at media nodes.",
    d: "After authentication and policy checks, the service signs a token carrying meeting, participant identity, role, permissions, region and expiry. Signaling accepts it to open a session; media nodes validate it to accept transport. Tokens are short-lived and refreshed during a meeting. Revocation, for removed participants, needs a deny path or a very short lifetime. It is hard because tokens are bearer credentials: one leaked in a log or URL grants entry, and permissions inside must change when roles change.",
    k: ["Self-contained signed tokens vs lookup of server-side sessions: signed tokens let media nodes validate without a call, but cannot be revoked until they expire.", "Short lifetime with refresh vs long lifetime: short tokens limit leaks but add refresh traffic and a failure mode if refresh fails mid-meeting."],
    p: ["Tokens placed in URLs end up in logs and referrer headers and can be reused.", "A role change does not reach the token, so a demoted host retains powers until it expires."],
    v: "Use an expired token against signaling and a media node, and a valid token for the wrong room; all attempts are refused, and a removed participant's token fails within the revocation window.",
    dep: ["guest-and-sso-auth", "meeting-policies"]
  },
  "room-state-service": {
    s: "Holds the authoritative shared state of a meeting, including participants, roles, published tracks, sharing, recording and settings, and applies every change in a single order.",
    d: "State is owned by one logical owner per room, often a single process or shard, so changes are serialized: join, leave, mute, share, role change. Each change produces a versioned event that goes to clients and media nodes through the event bus. New joiners get a snapshot plus events after it. State may be checkpointed so a new owner can resume after failure. It is hard because ownership must move cleanly: two owners for one room produce a split-brain meeting where people see different rosters.",
    k: ["Single owner per room vs replicated consensus: a single owner is simple and fast with one failure point to recover, while consensus tolerates failure at higher latency and complexity.", "Snapshot plus event stream vs full-state broadcast: events are compact for large rooms, but any lost event leaves a client wrong until resynced."],
    p: ["Two owners for one room after a network partition produce divergent rosters and conflicting mute commands.", "Rooms with thousands of participants send every join to everyone, overloading clients."],
    v: "Kill the owning process of a live room and confirm a new owner takes over within seconds, all participants see the same roster afterward, and the version counter continues without going backward.",
    dep: ["room-allocator", "state-event-bus"]
  },
  "room-allocator": {
    s: "Assigns each meeting to a media server or cluster and a state owner when it starts, using location, load and affinity so participants land close and capacity is used well.",
    d: "On first join, the allocator reads the room's policy and the first participants' locations, picks a region and then a server with spare capacity, and records the assignment. Later joiners are directed to the same server or a cascaded one nearby. It consults capacity data that is seconds old. It is hard because the first joiner's location is a poor predictor of where everyone will be, and a decision that looks balanced can fill a server as a large meeting grows past its estimate.",
    k: ["Place by first joiner vs wait for more joiners: immediate placement lets the first person start talking, but may put the room far from most participants.", "Pack servers tightly vs spread load: packing lowers cost, while spreading leaves headroom for a meeting that grows."],
    p: ["A scheduled thousand-person event starts on a node sized for ten because nothing told the allocator.", "Stale capacity data sends many new rooms to one node that has just filled."],
    v: "Start fifty rooms from three regions and confirm each is placed within its participants' nearest region, no node exceeds its target load, and a room that grows past capacity is moved or cascaded.",
    dep: ["capacity-scheduler", "edge-selection", "meeting-placement", "meeting-policies"]
  },
  "sdp-negotiation": {
    s: "The exchange of offers and answers describing the media each side can send and receive, including codecs, streams and extensions, so both agree before media flows.",
    d: "One side sends a description of its capabilities and intended streams; the other replies with the subset it accepts. In a forwarding architecture the server plays the other side for every client and rewrites descriptions as publishers and subscribers change. Every added or removed stream needs a new round of negotiation, so large rooms generate constant renegotiation. It is hard because it is a text format with subtle rules, clients differ in what they support, and a glare, with both sides offering at once, needs a defined winner.",
    k: ["Renegotiate on every stream change vs a pre-agreed pool of transceivers: renegotiating is flexible but slow in big rooms, while a pool is quick but wastes resources.", "Standard description format vs a compact custom message: the standard interoperates widely, while a custom format is smaller and faster for the one client the service controls."],
    p: ["Simultaneous offers from both sides leave the session in an inconsistent state without a rollback rule.", "A subscriber change in a large meeting triggers a renegotiation that stalls media for several seconds."],
    v: "Add and remove ten streams in a call and measure time from the signaling command to first decoded frame; confirm no glare errors and that existing streams continue without interruption.",
    dep: ["signaling-gateway", "ice-candidate-exchange", "header-extensions", "bundling-and-muxing"]
  },
  "ice-candidate-exchange": {
    s: "Passes the network addresses each side might be reachable at to the other through signaling, incrementally, so connectivity checks can start before gathering ends.",
    d: "As a client discovers local, reflexive and relayed addresses, it sends each candidate over signaling immediately rather than waiting for all of them, and the peer begins checking pairs. The server relays candidates for a forwarding node in the same way, or advertises fixed addresses. Candidates arriving before the description they belong to must be buffered. It is hard because exposing local addresses reveals network details, and slow candidate delivery over a congested signaling path delays call setup.",
    k: ["Incremental delivery vs wait for complete gathering: incremental starts media sooner, but needs buffering and ordering rules for early candidates.", "Server advertises fixed public addresses vs full candidate exchange: fixed addresses shorten setup and cut candidates, but constrain how servers are deployed behind load balancers."],
    p: ["A candidate arrives before the remote description and is dropped, so a path that would have worked is never tried.", "Local network addresses sent to the server leak internal topology to other participants."],
    v: "Join from a network that blocks direct UDP and confirm candidates are exchanged and a relay path is selected, with time from join to first media under the target even when gathering is slow.",
    dep: ["signaling-gateway", "ice-agent", "stun-and-turn"]
  },
  "roster-and-presence": {
    s: "The live list of who is in the meeting with their state, such as muted, sharing, hand raised and connection quality, kept consistent for every participant.",
    d: "The roster derives from room state: each participant has identity, role, device types and flags. Clients subscribe to updates and render lists, tiles and counts. In large meetings only a window is sent, and counts replace names. Connection state is the hard part: a participant who lost network must be shown as reconnecting for a grace period, not removed and re-added, or others see churn and re-lay out their screens.",
    k: ["Full roster to everyone vs windowed roster with counts: full is simple and accurate, while windowing keeps big meetings viable but needs search and paging.", "Immediate leave on disconnect vs grace period: immediate removal is accurate to the connection, but a grace period hides brief blips from everyone."],
    p: ["Ghost participants remain after a client crash because the leave never arrived and no timeout removed them.", "A reconnecting user appears twice, once old and once new, doubling their tile."],
    v: "Disconnect a client abruptly and confirm others show it as reconnecting for the grace period, then either restored under the same identity or removed, never duplicated.",
    dep: ["room-state-service", "state-event-bus", "directory-and-presence"]
  },
  "reconnect-and-resume": {
    s: "Restores a participant's session after a network change or brief loss, reattaching signaling and media with the same identity and without a visible rejoin where possible.",
    d: "When signaling drops, the client reconnects with its session token and the last event version it saw; the server replays missed events or sends a fresh snapshot. For media, the client first tries restarting connectivity checks on new network paths, such as moving from wireless to cellular, and falls back to a full renegotiation. It must keep local preview and audio flowing as long as possible. It is hard because the failure modes are many, and the client cannot always tell whether the problem is signaling, media or the whole network.",
    k: ["Resume with replay vs always take a fresh snapshot: replay is cheaper in large rooms but needs retained history, while snapshots are simple but heavier and may lose transitions.", "Restart connectivity in place vs rejoin: in-place restart is invisible to others, but a rejoin is more reliable when state is badly out of sync."],
    p: ["Reconnect attempts from thousands of clients at once after a regional blip overload signaling, extending the outage.", "Resume succeeds for signaling but media transport stays dead, and the user hears silence while shown as connected."],
    v: "Switch a client between networks mid-call and confirm audio resumes within a few seconds, the roster shows the same participant, and no duplicate or ghost session remains.",
    dep: ["signaling-gateway", "room-state-service", "ice-agent", "join-tokens"]
  },
  "control-channel": {
    s: "A low-latency channel carried with the call for small messages that must arrive quickly and in order, such as mute commands, layout hints and custom application data.",
    d: "Two flavors exist: messages through the signaling path, which are reliable and server-mediated, and messages over a data transport alongside media, which can be lower latency and optionally unreliable. Typical uses are speaker indicators, reactions, remote cursor positions and subscription requests. Messages are small, rate-limited and sometimes targeted to one participant. It is hard because ordering and reliability needs differ by message, and the media path can fail while signaling works, or the reverse.",
    k: ["Reliable ordered vs unreliable unordered: reliable suits commands and chat, while unreliable avoids head-of-line blocking for cursors and indicators.", "Via the server vs peer-direct: server-mediated messages can be authorized and logged, while direct messages are faster but bypass moderation."],
    p: ["A flood of cursor updates uses the channel's bandwidth and delays a mute command behind it.", "Messages assumed reliable are sent over an unreliable setting and silently lost."],
    v: "Send one thousand cursor updates per second alongside a mute command and confirm the mute reaches all participants within its latency target while cursor updates may drop under load.",
    dep: ["data-transport", "signaling-gateway", "state-event-bus"]
  },
  "state-event-bus": {
    s: "The internal publish-subscribe layer that carries room events from the state owner to every signaling gateway and media node that needs them, with ordering per room.",
    d: "Each room has a topic or partition. The owner publishes versioned events; gateways subscribe for the rooms their clients are in, and media nodes subscribe for permission and subscription changes. The bus preserves order within a room and may keep a short history for catch-up. It is the layer that makes stateless gateways possible. It is hard because delivery delays show up directly as delays in the meeting, and a lagging subscriber must resync rather than silently show stale state.",
    k: ["Per-room ordered topic vs global stream with filtering: per-room ordering is cheap and sufficient, while a global stream is simpler to operate but costly to filter at scale.", "At-least-once delivery with idempotent events vs exactly-once: at-least-once is practical, but every consumer must tolerate duplicates."],
    p: ["A slow gateway falls behind and shows an old roster without noticing, until a version gap check forces resync.", "Hot rooms concentrate load on one partition and delay unrelated rooms sharing it."],
    v: "Publish one hundred sequential changes in a room and confirm every subscriber applies them in order exactly once, and a subscriber paused for ten seconds catches up or resyncs correctly.",
    dep: []
  },
});
