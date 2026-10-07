// Details for the video conferencing plate, part 1: meeting experience, scheduling and access, webinars.
ATLAS.details("video-conferencing", {
  "video-layouts": {
    s: "Chooses which participants appear, at what size and quality, in gallery, speaker and pinned views, and tells the media layer which streams the screen needs.",
    d: "The layout engine takes the roster, active speaker signal, pinned and shared content, and the window size, then produces a list of tiles with pixel sizes. Those sizes drive subscription requests: a thumbnail needs a small layer, a spotlight needs the largest. It paginates when there are more participants than fit, and re-lays out on window resize, speaker change or join. The hard part is stability: tiles that jump around on every speaker change are unusable, so layouts apply hysteresis and keep stable slots.",
    k: ["Tile size drives requested video quality vs fixed quality for everyone: saves downlink and decode cost, but resizing a window triggers renegotiation delays and brief blur.", "Stable slot order vs always promoting the speaker: stable grids are easier to scan, but the current speaker may be off-screen unless a separate speaker strip exists."],
    p: ["Requesting full-size video for every visible tile on a phone exhausts decode capacity and battery.", "Layout changes that flicker on each speaker switch cause tiles to unsubscribe and resubscribe, producing frozen frames."],
    v: "Join a twelve-person meeting, shrink the window, and read the receive statistics: each tile's inbound resolution should drop to match its on-screen size within a few seconds, and total decoded pixels should fall.",
    dep: ["subscription-manager", "active-speaker-detection", "roster-and-presence", "render-and-av-sync"]
  },
  "screen-share-experience": {
    s: "Lets one participant present a window, screen or tab to everyone, with viewing controls, optional annotation and remote control, and clear rules for who may present.",
    d: "Starting a share creates an extra published track that is encoded for sharpness rather than motion, announced through room state, and shown to viewers as a primary tile. Viewers can zoom, pop it out or follow the presenter's pointer. Options include sharing computer audio, annotating, and handing over remote control. Room policy decides whether only the host or anyone may share, and what happens when a second person starts sharing. It is hard because text must stay readable under a bandwidth cap while the content changes unpredictably.",
    k: ["Single presenter at a time vs multiple concurrent shares: one share keeps the layout simple and bandwidth bounded, but handoffs need an explicit takeover flow.", "Share as a separate stream vs replacing the camera: a separate stream lets viewers keep the presenter's face, at the cost of a second encode and second downlink."],
    p: ["Viewers on slow links see a sharp but one-frame-per-several-seconds slide because the encoder protected resolution, which reads as a frozen share.", "Sharing the entire screen exposes notifications and other windows that the presenter did not intend to show."],
    v: "Present a document with small text from a throttled link and confirm a remote viewer can read ten-point text at 1080 pixels wide within two seconds of each slide change, while the camera tile continues.",
    dep: ["screen-content-encoder", "control-channel", "meeting-policies", "video-layouts"]
  },
  "in-meeting-chat": {
    s: "Text, links and files exchanged during a meeting, scoped to everyone or one person, kept in sync for people joining late and optionally retained after the meeting.",
    d: "Messages travel over the signaling or a dedicated message channel rather than the media path, so they survive video failure. The service assigns an order, fans messages out to current participants, stores them for late joiners and applies moderation settings such as disabling private messages. After the meeting, the chat may persist in a thread tied to the meeting, which brings retention, search and compliance export into play. The difficulty is consistency: a message must not appear twice, vanish on reconnect or reach someone who has been removed.",
    k: ["Ephemeral per-meeting chat vs persistent thread: ephemeral is simple and private, but participants lose links and decisions the moment the meeting ends.", "Server-ordered messages vs client-side ordering: a server sequence gives everyone the same transcript, at the price of a round trip before a message is final."],
    p: ["Messages sent during a brief disconnect are lost without a client-side outbox and acknowledgement, so people believe they were read.", "Files shared in chat bypass the scanning and retention rules applied elsewhere in the product."],
    v: "Send ten numbered messages from three clients while one drops its connection for five seconds; after rejoin all three must show the same ten messages in the same order with no duplicates.",
    dep: ["control-channel", "state-event-bus", "roster-and-presence", "meeting-policies"]
  },
  "reactions-and-hands": {
    s: "Lightweight signals such as emoji, applause and a raised hand that show feedback without anyone unmuting, and give hosts a queue of people who want to speak.",
    d: "A reaction is a tiny event broadcast to the room and shown briefly on the sender's tile; a raised hand is a persistent flag in room state, ordered by when it was raised. Hosts see the raised-hand queue and can unmute or lower hands. In large meetings reactions are sampled or aggregated server-side so ten thousand clapping events become a single animation. The challenge is volume: unthrottled reactions in a big room flood signaling and drain low-power clients.",
    k: ["Events vs persistent state: reactions are fire-and-forget and cheap, while hands must be state so late joiners and hosts see them; mixing the two causes ghost hands.", "Per-event fan-out vs server aggregation: aggregation caps load in large rooms but loses the identity of who reacted."],
    p: ["A hand left raised after the question is answered clutters the host's queue unless it clears on unmute.", "Reaction bursts in a thousand-person meeting saturate the signaling channel and delay unrelated control messages."],
    v: "Have two hundred simulated clients send reactions at once and confirm signaling latency for a separate mute command stays within its normal range while the host's queue lists raised hands in order.",
    dep: ["control-channel", "room-state-service", "state-event-bus"]
  },
  "host-controls": {
    s: "Authority tools for hosts and co-hosts: mute and remove participants, lock the room, limit sharing and chat, and assign roles, enforced by the service rather than the client.",
    d: "Every action is an authorized command that the server validates against the caller's role, applies to room state, and propagates to affected clients and media nodes. Removing someone must also revoke their media permissions at the forwarding layer, not just hide their tile. Mute requests differ from forced mute: unmuting yourself after a host mutes usually needs consent. It is hard because roles change during the meeting, and every enforcement point, client UI, signaling and media server, must agree on the current role.",
    k: ["Server-enforced vs client-enforced controls: server enforcement is the only version that survives a modified client, but each control needs a path to every media node.", "Forced mute vs ask-to-unmute: forced mute stops disruption immediately, though silently overriding someone's microphone state raises privacy and trust questions."],
    p: ["A removed participant keeps receiving media because the forwarding node never revoked their subscription.", "Role changes arrive at clients out of order, briefly showing controls that the server then rejects."],
    v: "Remove a participant and confirm on the media node that their transport closes and no packets are sent to them within a second, and that rejoining with the old token is refused.",
    dep: ["join-tokens", "room-state-service", "subscription-manager", "meeting-policies"]
  },
  "lobby-and-admission": {
    s: "Holds arriving participants in a waiting area until a host admits them, or admits automatically based on identity, domain or invitation, to keep unwanted people out.",
    d: "On join, the service authenticates the participant, evaluates admission rules against the meeting's settings, and either issues a media token or parks the participant in a lobby state with no media access. Hosts see the waiting list and admit or deny; rules can auto-admit invited users or colleagues and send guests to the lobby. The lobby session is kept alive so admission is instant. It is hard because the lobby is a security boundary: no media or roster details may leak before admission.",
    k: ["Lobby for everyone vs for outsiders only: universal lobbying is safest but burdens hosts, while identity-based bypass relies on trusting the authentication source.", "Admit by individual vs admit all: individual review blocks intruders but stalls large meetings, so bulk admit needs a way to be turned off."],
    p: ["Meeting links leaked publicly bring a flood of unknown joiners and an overwhelmed host without rate limits.", "A lobby that shows participant names or chat history to people waiting leaks meeting content."],
    v: "Join as an unauthenticated guest to a lobby-enabled meeting and confirm no media token is issued, no roster is returned, and admission by the host yields media within two seconds.",
    dep: ["guest-and-sso-auth", "join-tokens", "meeting-policies", "roster-and-presence"]
  },
  "breakout-rooms": {
    s: "Splits a meeting into smaller concurrent rooms, assigns people manually or automatically, and brings everyone back, with the host able to visit or broadcast to all.",
    d: "Breakouts are sub-rooms with their own media, chat and state, linked to a parent. Moving a participant means switching their media session to another room, ideally on the same media server to avoid renegotiation. Hosts can set timers, broadcast messages and move between rooms; at the end the service returns everyone to the main room. The challenge is the transition: hundreds of participants changing rooms at once creates a join storm, and each needs the right permissions, roles and recording behavior.",
    k: ["Sub-rooms on the same server as the parent vs placed independently: co-locating makes moves fast, but a large breakout set can overload one node.", "Pre-assigned vs self-select: pre-assignment is predictable for instructors, while self-select reduces host work but needs per-room capacity limits."],
    p: ["Closing rooms returns everyone at the same instant, producing a join storm that overloads the room's server and signaling.", "Recording continues only in the main room and the host assumes breakout discussions were captured."],
    v: "Assign two hundred test participants to forty rooms and confirm all complete the move within five seconds with audio flowing, then close the rooms and confirm everyone returns without failed joins.",
    dep: ["room-allocator", "room-state-service", "recording-orchestrator", "join-tokens"]
  },
  "effects-and-backgrounds": {
    s: "Client-side processing of the camera image, such as background blur, replacement and lighting correction, run before encoding without sending the original video anywhere.",
    d: "A segmentation model separates the person from the background on each frame, then the client composites a blur or image behind them and passes the result to the encoder. Processing runs on the CPU or GPU within the frame budget, usually thirty frames per second, and must not delay audio. Quality tiers adapt to device capability. It is hard because the effect competes with encoding for the same hardware, so a laptop already struggling with a large meeting can be pushed into dropped frames by the effect itself.",
    k: ["On-device effects vs server-side processing: on-device protects privacy and costs no server compute, but weak devices cannot sustain it and quality varies.", "Higher-quality segmentation vs frame rate: cleaner edges look better still but consume the budget that keeps video smooth."],
    p: ["Edge artifacts such as flickering hair or a missing hand look unprofessional and change with lighting.", "Running effects on an overloaded device raises encode time until the sender's video freezes for everyone."],
    v: "Enable replacement on a low-end device and verify capture-to-encode latency stays under the frame interval and sent frame rate stays at its target, with CPU headroom reported by the client statistics.",
    dep: ["capture-pipeline", "video-encoder"]
  },
  "live-captions": {
    s: "Real-time transcription of speech shown as text, with optional translation into other languages, so people can follow in noisy settings, a second language or without hearing.",
    d: "Audio from each speaker is sent, or tapped at the server, to a speech recognition service that streams partial and final text. The text is aligned to speaker identity and time, then fanned out to each participant, optionally through a translation step per target language. Partial results revise as context arrives. It is hard because accuracy depends on audio quality and accents, latency must stay near a couple of seconds, and with end-to-end encryption the server cannot hear the audio at all.",
    k: ["Per-speaker streams vs a mixed stream: per-speaker audio gives reliable speaker labels and cleaner recognition, at the cost of many concurrent recognition sessions.", "Show partial text vs wait for finals: partials feel responsive but visibly change; finals are stable but lag the speaker."],
    p: ["Captions silently stop when the recognition session drops, and viewers assume nobody is speaking.", "Translation of partial text produces flipping output that is harder to read than the source."],
    v: "Play a recorded script with known words into a meeting and measure word error rate and the delay between speech and displayed final text; both should stay within the stated targets for the language.",
    dep: ["audio-encoder", "subscription-manager", "transcript-pipeline", "control-channel"]
  },
  "device-and-precall": {
    s: "The pre-join screen where participants pick camera, microphone and speaker, see themselves, test audio and learn about network trouble before others see or hear them.",
    d: "The client enumerates devices, requests permission, previews video, shows a live microphone level and can play a test tone. It may run a short network test and warn about blocked ports or poor bandwidth. It remembers choices, handles devices appearing and disappearing, and joins muted by default under policy. The difficulty is the diversity of hardware and permissions: virtual devices, exclusive-access cameras, denied permissions and Bluetooth headsets switching profiles all produce failures that look to the user like a broken meeting.",
    k: ["Join muted and camera off by default vs remember last state: defaults protect privacy and avoid embarrassment, while remembered state saves clicks for repeat users.", "Network test before join vs on-demand: a pre-join test catches problems early but delays joining and can itself be wrong about later conditions."],
    p: ["A headset that switches to a low-quality telephony profile when the microphone opens degrades playback for the whole call.", "Permission denied at the operating system level shows a blank preview with no explanation."],
    v: "Unplug the selected microphone on the pre-join screen and confirm the client switches to another device, shows the change, and the level meter responds to speech within a second.",
    dep: ["capture-pipeline", "network-probes", "stun-and-turn"]
  },
  "scheduling-service": {
    s: "Creates, updates and cancels meetings, stores their settings and recurrence, and holds the record that join links, policies and recordings later refer to.",
    d: "The service owns the meeting object: title, time, recurrence, host, invitees, settings such as lobby and recording defaults, and a stable meeting identifier. It exposes an API to apps and calendar integrations and emits events when meetings change. Instant meetings skip the calendar but use the same object. Recurring series need exceptions for single occurrences. It is hard because meetings are referenced from many places, so a changed setting must propagate to links, live rooms and notifications without surprising anyone already inside.",
    k: ["One meeting identifier per series vs per occurrence: a stable series link is convenient for attendees but mixes recordings and chat across occurrences.", "Settings snapshot at creation vs live reference: snapshots are predictable, while live references let hosts fix mistakes but can change rules mid-meeting."],
    p: ["Editing a recurring meeting rewrites past occurrences and breaks recordings linked to them.", "Time zone and daylight-saving handling errors put the meeting an hour off for some invitees."],
    v: "Create a weekly series across a daylight-saving change and confirm each occurrence's start time in three time zones matches the host's local time, and that editing one occurrence leaves the rest unchanged.",
    dep: ["meeting-policies", "calendar-integration", "join-links-and-ids"]
  },
  "calendar-integration": {
    s: "Two-way sync with calendar systems so meetings are created from invites, links are inserted automatically, and changes and responses flow back.",
    d: "Connectors authenticate to calendar providers on behalf of users, watch for changes through notifications or polling, and map between calendar events and meeting objects. They add join details to invitations, handle updates and cancellations, and read availability for scheduling. Rooms and resources are calendar entities too. The challenge is the variety and fragility of external systems: tokens expire, notifications arrive late or twice, and recurrence rules differ subtly between providers.",
    k: ["Push notifications vs periodic polling: push is timely and cheap but needs endpoints and renewals; polling is robust but delays updates and burns quota.", "Service account access vs per-user delegation: service accounts simplify administration, while per-user delegation limits the data the service can see."],
    p: ["An expired authorization silently stops syncing, so new invitations lack join links until someone notices.", "Duplicate change notifications create two meetings for one calendar event."],
    v: "Schedule a meeting from a calendar client, confirm the invitation carries a working join link within a minute, then reschedule the event and verify the meeting time updates and old reminders are replaced.",
    dep: ["scheduling-service", "guest-and-sso-auth", "directory-and-presence"]
  },
  "join-links-and-ids": {
    s: "The URLs and short numeric IDs that identify a meeting, resolve to the right room and region, and carry enough information to join without exposing secrets.",
    d: "A link encodes a meeting identifier and sometimes a passcode or signed token. Resolving it looks up the meeting, checks its state, picks the entry path (browser, installed app, phone) and hands off to the join flow. Short numeric IDs exist for phone and room-system entry and are easier to guess, so they need passcodes and rate limits. It is hard to balance convenience and security: links are pasted in public chats, forwarded and indexed, and anyone holding one is a potential joiner.",
    k: ["Long random links vs short memorable IDs: random links resist guessing, but short IDs are the only option for dialing from a phone or room device.", "Passcode embedded in the link vs separate: embedding is one click, while separating means a leaked link alone is not enough."],
    p: ["Sequential or low-entropy IDs let attackers scan for open meetings.", "A link that remains valid forever for an ended meeting can be reused to start an unauthorized room."],
    v: "Attempt ten thousand random short IDs from one address and confirm rate limiting engages and none resolves to a live room, while a valid link joins in one step.",
    dep: ["scheduling-service", "join-tokens", "meeting-policies"]
  },
  "guest-and-sso-auth": {
    s: "Authenticates members through the organization's identity provider and admits guests with limited or no sign-in, tagging each participant with how they were verified.",
    d: "Members sign in through single sign-on and receive a session that proves organization membership. Guests join with a name and possibly an email or one-time code. The result is an identity claim attached to the participant for the rest of the meeting, driving policy such as lobby bypass, recording consent and external labeling. Authentication must be quick because it sits on the join path. The difficulty is that different doors give different assurance, and UI must show clearly who is verified and who merely typed a name.",
    k: ["Anonymous guests vs required sign-in: anonymous join removes friction for outsiders, but gives hosts no way to identify or ban repeat disruptors.", "Federated identity vs service-held accounts: federation reuses existing controls and offboarding, but depends on external provider availability at join time."],
    p: ["A guest who types a colleague's name appears as that colleague unless unverified participants are labeled.", "Provider outage during a company-wide meeting blocks every sign-in at once."],
    v: "Join as a signed-in member and as a guest named identically; confirm the roster shows the guest labeled external and unverified, and the server-side claim differs between the two sessions.",
    dep: ["join-tokens", "directory-and-presence"]
  },
  "meeting-policies": {
    s: "Rules set by administrators and hosts, covering who may join, share, record, chat or use features, evaluated by the service and enforced at every point.",
    d: "Policies are layered: organization defaults, group overrides, per-meeting settings and live changes by hosts. The engine resolves them into an effective set for each participant and meeting, caches it, and pushes changes to the room. Entitlements, such as maximum participants or recording storage, come from the plan. It is hard because the same rule must be enforced in clients for usability, in signaling for correctness and in media nodes for security, and layers conflict.",
    k: ["Most restrictive wins vs most specific wins: restrictive precedence keeps administrators in control, while specific precedence lets hosts adapt but can bypass a security rule.", "Resolve at join vs continuously: resolving once is simple and fast, but live changes then need an explicit push path."],
    p: ["A policy updated by an administrator never reaches rooms already in progress, so a disabled feature stays available for hours.", "Client-only enforcement lets modified clients ignore the rule."],
    v: "Disable screen sharing for a group during a live meeting and verify a member of that group's share request is refused by the server and an existing share stops within seconds.",
    dep: ["room-state-service", "directory-and-presence"]
  },
  "directory-and-presence": {
    s: "Knows who people are, which groups they belong to and whether they are available, supplying names, avatars and organization boundaries to the rest of the system.",
    d: "A directory service syncs users and groups from the identity provider, resolves display names and photos, and answers membership queries for policy. Presence aggregates signals such as calendar status and device activity into available, busy or in a meeting, and updates whenever a meeting starts or ends. It is a read-heavy service on the join path and in every roster. The hard parts are freshness and scale: offboarded users must lose access promptly, and presence updates for large organizations produce heavy fan-out.",
    k: ["Cached directory data vs live lookup: caching keeps joins fast and independent of the provider, but removed users may keep access until the cache expires.", "Push presence to everyone vs pull on demand: push is instant but expensive across large organizations, so subscriptions are scoped to what is on screen."],
    p: ["A slow sync leaves a departed employee able to join internal meetings.", "Presence storms at the start of the workday overload the update path."],
    v: "Deactivate a test user in the identity provider and measure the time until the service refuses their next join; it should match the documented propagation limit.",
    dep: []
  },
  "telephony-gateway": {
    s: "Bridges the telephone network into meetings so people can dial in by number and ID, translating phone audio and signaling into the meeting's media format.",
    d: "A gateway terminates calls from the telephone network, prompts for a meeting ID, authenticates the caller, then joins them to the room as an audio-only participant. Phone audio is narrowband, sent in a legacy codec, so the gateway transcodes to and from the meeting's codec and mixes the room's audio into one stream for the caller. Calls out to participants work the same way. It is hard because of numbers and carriers, echo from handsets, tone-based input, and capacity that is reserved per call.",
    k: ["Own gateway vs carrier interconnect partner: a partner covers many countries quickly, while an own gateway offers control over routing and cost at high volume.", "Per-caller mix vs shared mix: a shared mix saves transcoding but cannot exclude each caller's own voice, so most gateways build per-caller feeds."],
    p: ["Poor-quality phone audio brings background noise and echo into the room and degrades everyone's experience.", "Toll fraud: attackers dial out to premium numbers through a meeting's call-me feature."],
    v: "Dial in from a phone, enter the meeting ID, and confirm audio both ways within two seconds of admission, that the caller appears in the roster as a phone participant, and that DTMF mute toggles work.",
    dep: ["transcoding-bridge", "mcu-mixer", "join-links-and-ids", "audio-encoder"]
  },
  "room-system-interop": {
    s: "Lets conference-room hardware and other vendors' systems join using standard signaling and media, through a gateway that converts to the service's native session format.",
    d: "Room devices speak standard session protocols and legacy video codecs. An interop gateway accepts those calls, converts signaling, and either transcodes media or negotiates a compatible stream with the forwarding layer. It often composites a layout for devices that cannot handle many streams. Calendar-based one-touch join lets a room dial the meeting. It is hard because endpoints implement standards unevenly, have fixed codec support and rarely adapt quickly to bandwidth changes.",
    k: ["Gateway composes one layout vs forwards many streams: composing works with any device but costs server decode and encode, while forwarding needs a capable endpoint.", "Dial-in by address vs cloud-to-room call-out: call-out removes typing, but needs reachable devices and registration with the service."],
    p: ["A single device with a non-standard feature breaks negotiation and cannot join, producing a support case rather than an error.", "Transcoding every room device multiplies server cost during large all-hands meetings."],
    v: "Join a room system and a native browser client to the same meeting; each should show the other with matching audio lip-sync under half a second apart, and the room should show the shared screen at readable resolution.",
    dep: ["transcoding-bridge", "mcu-mixer", "sdp-negotiation", "join-links-and-ids"]
  },
  "panelists-and-attendees": {
    s: "Separates the few people who speak and share from the many who watch, giving each role different media permissions, visibility and controls.",
    d: "Panelists join as full participants with publish rights. Attendees join as receive-only and are excluded from the interactive roster, so their number does not multiply signaling or subscription cost. Hosts can promote an attendee to panelist, which requires adding publish rights and switching their transport mode. Role is carried in the join token and enforced at the media node. The challenge is promotion and demotion in real time without a visible gap, and keeping attendee counts accurate when most are passive.",
    k: ["Attendees on a separate lightweight path vs same path as panelists: a separate path scales and isolates them, but promotion means a handover between systems.", "Attendee roster hidden vs visible: hiding it reduces load and protects privacy, but removes social presence that makes events feel live."],
    p: ["Promoted attendees wait several seconds without audio because their connection had no send transport.", "Role enforced only in the client lets an attendee publish media."],
    v: "Promote an attendee during a live event and measure the time until their audio is heard by others; also confirm a raw publish attempt from an unpromoted attendee is rejected by the media node.",
    dep: ["join-tokens", "audience-fanout", "host-controls", "subscription-manager"]
  },
  "registration-and-approval": {
    s: "Collects attendee details before an event, approves or denies them, and issues unique join links that tie each viewer to a registration.",
    d: "A registration form creates records, optionally reviewed by a host or approved by rule. Approved registrants receive a personal link bound to their identity, which lets the system count attendance, limit sharing of links and follow up afterward. Reminders and calendar entries go out automatically. The service must handle spikes when registration opens and keep personal data under retention and consent rules. It is hard to prevent link sharing without making entry painful.",
    k: ["Unique per-person links vs one public link: unique links give attribution and revocation, while a public link is easier for open events but cannot limit abuse.", "Auto-approve vs manual review: automatic approval scales to thousands, while review keeps out unwanted attendees at host effort."],
    p: ["Personal links forwarded to friends let several people watch under one registration and distort attendance counts.", "Registration data retained beyond its purpose becomes a compliance exposure."],
    v: "Register a test attendee, use the unique link from two devices, and confirm the second join is flagged or blocked per policy and the attendance report lists exactly one verified viewer.",
    dep: ["guest-and-sso-auth", "join-links-and-ids", "scheduling-service"]
  },
  "audience-fanout": {
    s: "Delivers the presenters' media to thousands or hundreds of thousands of viewers by building a distribution tree of relays so no single server sends to everyone.",
    d: "Presenter media enters an origin forwarding node, which feeds relay tiers; each relay serves a bounded number of viewers or the next tier. Viewers are assigned to relays near them. The tree is built and rebalanced as the audience grows, and each hop adds latency. Viewers receive one pre-mixed or selected stream, not individual tiles. It is hard because audience size is unpredictable, a join wave at the start loads the origin, and a relay failure drops thousands of viewers unless they can reattach quickly.",
    k: ["Deep tree of forwarding relays vs a content delivery network with segmented streams: relays keep latency low but cost more, while segmentation scales cheaply but adds seconds.", "Pre-provisioned capacity vs elastic: reserved capacity absorbs the start-time spike, but elastic scaling is cheaper if viewers arrive gradually."],
    p: ["Everyone joins in the first minute, overloading the entry tier before autoscaling reacts.", "A relay failure without fast reattachment leaves a large block of viewers frozen."],
    v: "Ramp ten thousand synthetic viewers over sixty seconds and confirm all receive media within the target start time, with origin egress staying flat while relay egress grows.",
    dep: ["sfu-cascade", "rtp-forwarder", "capacity-scheduler", "panelists-and-attendees", "edge-selection"]
  },
  "live-stream-egress": {
    s: "Re-encodes the meeting's composed view into a standard streaming format and pushes it to external platforms or a delivery network for audiences outside the service.",
    d: "An egress worker joins as a hidden participant, receives the selected streams, composites layout and audio, encodes to a stream suitable for ingest by third-party platforms, and publishes it over a streaming protocol. It handles reconnects to the destination and can stream to several destinations. It is hard because the output is compute-heavy, must run continuously for hours, and a failure of the worker or the destination ends the live event unless a standby takes over.",
    k: ["Server-side compositing vs forwarding individual tracks to the platform: compositing yields a ready broadcast but costs one encoder per output, while individual tracks give flexibility only specialized targets accept.", "Single encode for all destinations vs per-destination encodes: one encode is cheap, but destinations with different limits then get a compromise."],
    p: ["The egress worker crashes mid-event and the stream goes dark with no automatic failover.", "Audio and video drift apart over multi-hour streams because the clocks are not aligned."],
    v: "Start a stream to a test ingest, run for two hours, and verify continuous output, a stable A/V offset under 100 ms, and recovery within ten seconds after killing the primary worker.",
    dep: ["composite-renderer", "recording-orchestrator", "audio-encoder", "video-encoder"]
  },
  "qa-and-polls": {
    s: "Structured audience interaction for large events: questions submitted and upvoted, answered live or in text, and polls with aggregated results.",
    d: "Questions and votes go over the signaling or a lightweight API, not the media path. The service stores them, applies moderation and visibility rules, and shows ranked questions to hosts. Polls collect responses and publish aggregates on a schedule rather than per vote. Both are designed for thousands of simultaneous clients and one decision-making moderator. The challenge is write volume and fairness: votes must be deduplicated per person, and results must not arrive so fast or so slowly that they distort the outcome.",
    k: ["Moderated queue vs open display: moderation filters abuse but delays questions and needs a human; open display is instant but exposes hosts to harassment.", "Live per-vote results vs periodic aggregate: live results feel responsive but cost an update per vote and can sway later voters."],
    p: ["Duplicate votes from reconnecting clients inflate counts without idempotent submission.", "A write storm at the end of a poll overloads the response store."],
    v: "Submit one thousand votes from five hundred simulated clients with repeated submissions and confirm the final tally counts each unique participant once and stays consistent across all viewers.",
    dep: ["control-channel", "state-event-bus", "meeting-policies", "panelists-and-attendees"]
  },
  "interpretation-channels": {
    s: "Carries simultaneous human interpretation as separate audio channels that participants choose, while the original speech is lowered underneath.",
    d: "Interpreters join as special participants with a language assignment and publish their translation as an additional audio track tagged with its language. Listeners choose a channel and the client mixes it over a reduced-volume floor audio. Interpreters need to hear the speaker clearly and sometimes relay between each other. Sound routing decisions are made in the client or server. It is hard because the language channel is another set of streams per meeting, and listener selection must be fast and survive reconnects.",
    k: ["Language channels as extra tracks vs a separate bridge per language: tracks keep everything in one room, while separate bridges isolate load but complicate joining.", "Client-side ducking of the floor vs server mixing: client mixing is flexible and cheap, but depends on every client implementing it consistently."],
    p: ["Listeners hear original and interpreted speech at equal volume because the floor reduction was not applied after a reconnect.", "Interpreters lose their handoff to a relief interpreter without a clear takeover flow."],
    v: "Select the Spanish channel as a listener and verify the interpreter's audio is audible, floor audio drops by the configured amount, and the selection persists after reconnecting.",
    dep: ["audio-encoder", "subscription-manager", "panelists-and-attendees", "render-and-av-sync"]
  },
  "latency-tiers": {
    s: "Offers viewers a choice between sub-second interactive delivery and cheaper, higher-delay broadcast delivery, and moves them between tiers as their role changes.",
    d: "Interactive viewers use the same real-time path as participants and can speak quickly, but cost forwarding resources per viewer. Broadcast viewers receive segmented or relayed streams with several seconds of delay and much lower cost per head. Systems route viewers into one tier by event type, audience size or role, and may switch them when a question is taken. The challenge is mixed audiences: a viewer on the delayed tier hears an answer seconds after others have seen it, so interaction must account for lag.",
    k: ["Everyone interactive vs tiered delivery: all-interactive is simplest and uniform, but cost and capacity grow with every viewer.", "Delay as a deliberate buffer vs minimum delay: buffering absorbs network variation and smooths playback, but makes live questions lag behind the room."],
    p: ["Viewers on the broadcast tier answer a poll after it closes because their video is delayed.", "Switching a viewer between tiers causes a gap or a duplicate segment."],
    v: "Measure glass-to-glass delay for a viewer in each tier using an on-screen timestamp, and confirm interactive stays within the real-time budget and broadcast within its stated bound.",
    dep: ["audience-fanout", "live-stream-egress", "latency-budget"]
  },
});
