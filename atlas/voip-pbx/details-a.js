// Details for the VoIP & PBX plate, part 1: provisioning, quality monitoring, recording.
ATLAS.details("voip-pbx", {
  "extension-directory": {
    s: "The record of users, extensions, groups and the numbers and devices attached to each, which every routing and feature decision consults.",
    d: "Each user has one or more extensions, a display name, credentials, permissions, voicemail settings and assigned devices. Call control reads it on every call to find a destination and its feature settings, so it is cached close to the signaling servers and invalidated on change. It may be synchronized from a corporate directory over LDAP or an identity provider. The difficulty is keeping the cached copy, the registrar's view and the directory source consistent when people move, share lines or leave.",
    k: ["Own directory vs synchronizing from the corporate directory: own is simple and fast, but synchronization avoids double entry and stale leavers at the cost of mapping rules and a sync delay.", "Extensions bound to users vs bound to devices: user binding follows people between phones, while device binding suits shared lobby and meeting-room phones."],
    p: ["A departed employee's extension and credentials stay active because the directory sync only adds records.", "Cached directory entries outlive an edit, so a changed forwarding rule applies to calls minutes later."],
    v: "Change a user's forwarding destination in the portal, then place a call to the extension from a test phone and confirm in the signaling trace that it reaches the new destination within the documented propagation time.",
    dep: ["config-database"]
  },
  "device-provisioning": {
    s: "Delivers each phone its accounts, keys, firmware and settings automatically when it boots, so nobody configures handsets by hand.",
    d: "A phone is identified by its hardware address, a certificate or a one-time code, then fetches a configuration file over HTTPS from a provisioning server, often located through DHCP options or a redirect service. The server renders a vendor-specific template with the user's account, line keys and server addresses. Phones poll or are told to reboot and refetch by a notify message. Difficulty lies in the many device models with different template formats, and in securing the credentials inside the file.",
    k: ["Pull by polling vs server-initiated notify: polling is simple and works through firewalls, while notify applies changes at once but needs the phone to be registered and trusting the sender.", "Per-model templates vs a generic template: per-model supports every feature, but multiplies the templates to maintain with each new handset."],
    p: ["Configuration files served over plain HTTP expose SIP passwords to anyone on the network.", "A firmware upgrade pushed to hundreds of phones at once overloads the server and breaks calls during working hours."],
    v: "Factory-reset a phone, connect it to the network and measure time until it shows the right name and line keys and completes a test call, with no manual entry.",
    dep: ["extension-directory","device-profiles"]
  },
  "admin-portal-api": {
    s: "The web interface and programmatic API through which administrators and customers manage users, numbers, routing, features and reports.",
    d: "A portal front end calls a documented API that validates changes, writes the configuration database and signals call control to reload. Role-based access limits what each administrator can alter, from resetting a voicemail PIN to editing outbound routes. Bulk import and automation use the same API. The difficulty is that a single change can touch the directory, dial plan, provisioning and billing, and a half-applied change leaves the system inconsistent.",
    k: ["Transactional apply vs incremental apply: all-or-nothing keeps the system consistent but is slow on large changes, while incremental is fast but can leave partial states.", "Fine-grained roles vs a few broad roles: fine-grained limits damage from stolen accounts, but is hard to administer and explain."],
    p: ["An administrator with route-editing rights changes an outbound rule and unintentionally opens expensive destinations.", "A bulk import with a bad row halfway leaves some users updated and others not, with no record of which."],
    v: "Make a change through the API, confirm it appears in the audit log with the actor, and confirm a test call follows the new behavior; then roll it back and confirm the original behavior returns.",
    dep: ["config-database","extension-directory"]
  },
  "multi-tenancy": {
    s: "Hosting many separate organizations on one platform, each with its own numbers, dial plan, users, limits and data, invisible to the others.",
    d: "A tenant identifier is attached to every record, route and call, and every lookup is scoped by it. Dial plans, extension numbers and prompts can overlap between tenants, so internal addressing is resolved within a tenant before anything global. Limits on concurrent calls, spend and features are per tenant. The challenge is isolation: a missing tenant filter exposes another customer's data, and one tenant's traffic spike or attack must not starve the others of media or signaling capacity.",
    k: ["Shared infrastructure with tenant scoping vs dedicated instances per tenant: shared is cheap and quick to add tenants, while dedicated gives hard isolation at much higher cost.", "Per-tenant resource quotas vs best-effort sharing: quotas protect neighbors but waste capacity when idle."],
    p: ["A query missing the tenant condition lists another tenant's recordings or numbers.", "One tenant under a fraud flood exhausts the shared carrier channel limit and all tenants lose outbound calls."],
    v: "Create two tenants with the same extension number 100, call 100 from each and confirm each reaches only its own phone, and that neither can read the other's call records through the API.",
    dep: ["config-database","extension-directory","dial-plan-engine"]
  },
  "cdr-billing": {
    s: "A durable record of every call attempt, with times, parties, route, result and quality, used for billing, reporting, troubleshooting and fraud detection.",
    d: "Call control writes a record at call end, and often at start and at changes, with caller, callee, trunk, start, answer and end time, disposition and release cause. Records flow through a queue to a database or log store, then to rating engines that apply per-destination prices. Real-time consumers read the same stream for fraud and capacity limits. Difficulty comes from losing records when a node dies mid-call, from long calls that span billing periods, and from agreeing with the carrier's own records.",
    k: ["Write at call end vs write events throughout: end-only is simple but loses calls on a crash, while event streams survive failures and cost more to reconstruct.", "Rate in real time vs rate in batch: real time enables spend limits, whereas batch is simpler and easier to correct."],
    p: ["A node crash during a three-hour call produces no record, so the call is never billed and never seen in fraud checks.", "Clock differences between servers yield negative or overlapping call durations."],
    v: "Place calls of known durations and dispositions, kill a node during one, and reconcile the record count and total minutes against the carrier's invoice detail to within the agreed tolerance.",
    dep: ["event-bus","config-database"]
  },
  "number-inventory": {
    s: "Tracks every telephone number the operator owns or hosts: its carrier, status, assigned user and the porting requests that move numbers between providers.",
    d: "Numbers are acquired from carriers in blocks or singly, held in inventory, assigned to users or queues, and released when unused. Porting moves a number between providers through a request, a customer authorization, a carrier-to-carrier exchange and a coordinated cutover time. At cutover the old carrier stops routing and the new one starts, and the system must be ready on the same minute. Delays, rejections for mismatched account details and partial ports are common.",
    k: ["Automated porting through carrier APIs vs manual forms: automation speeds up and reduces errors, but each carrier's interface differs and requires ongoing maintenance.", "Reserving numbers ahead vs allocating on demand: reservation avoids delays at signup but ties up numbers that cost money."],
    p: ["A number is released back to the carrier while still printed on customer letterhead.", "The cutover time passes before the destination routing is configured, and inbound calls fail for hours."],
    v: "Port a test number, and at the scheduled cutover place calls from an outside phone every minute; confirm they reach the new platform within the planned window with no gap beyond the agreed few minutes.",
    dep: ["carrier-interconnect","extension-directory"]
  },
  "rtcp-statistics": {
    s: "Periodic receiver and sender reports exchanged during a call, carrying packet loss, jitter and round-trip timing per direction.",
    d: "Each endpoint sends an RTCP report every few seconds describing what it has received: packets expected and lost, interarrival jitter and a timestamp pair from which round-trip time is computed. Media servers and border controllers read and forward these, and the monitoring system collects them per call. They describe what the receiver saw, not what the speaker heard. The difficulty is that reports are sparse, may be blocked by firewalls, and cover only the legs the reporting device can see.",
    k: ["Collect reports at the endpoints vs at the border device: endpoint data shows true experience, but border data is easier to gather and covers all devices.", "Short report intervals vs long: short finds brief problems but adds traffic and processing, while long hides them."],
    p: ["A firewall that drops RTCP leaves calls unmonitored without any visible error.", "Reports from a mixer describe the mixer's leg, not the remote participant's experience."],
    v: "Inject five percent packet loss on one call leg in a lab and confirm the report for that call shows the loss near five percent within two report intervals.",
    dep: ["rtcp-feedback"]
  },
  "mos-scoring": {
    s: "Converts loss, jitter, delay and codec into a single estimated listening quality score that people can compare and set alerts on.",
    d: "A model such as the E-model computes an R-factor by subtracting impairments for delay, loss and codec from a perfect baseline, then maps it to a mean opinion score from 1 to 5. It is estimated from network statistics, not measured by listeners. Wideband codecs and bursty loss need adjusted parameters. The score is useful as a trend and to rank calls, and wrong as an absolute: two calls with the same score can sound different.",
    k: ["Network-based estimation vs signal-based comparison of audio: estimation is cheap and continuous, but comparing actual audio is more accurate and requires access to the audio stream.", "Per-call average vs per-interval score: averages are simple, but a call with ten seconds of garble can average to acceptable."],
    p: ["Using narrowband parameters on a wideband call gives scores that look worse or better than reality.", "Alert thresholds copied from another network trigger constant noise or never fire."],
    v: "Play a reference recording through paths with known impairments in a lab, then compare the computed scores with panel ratings or with an intrusive signal-comparison tool, and confirm the ranking matches.",
    dep: ["rtcp-statistics","voice-codecs"]
  },
  "jitter-loss-monitoring": {
    s: "Continuously measures delay variation and packet loss on call paths and locates which network segment adds them.",
    d: "Probes at phones, border devices and media servers report jitter, loss, delay and buffer behavior, including packets the jitter buffer discarded as late. Comparing the same call at several points shows where the damage entered: the access network, the WAN, the carrier. Data is aggregated by site, time and device. The difficulty is distinguishing network jitter from the endpoint's own processing delay and from a misconfigured buffer.",
    k: ["Passive measurement of live calls vs active probing: passive reflects real experience but only when people call, whereas active probing runs constantly and tests unused paths.", "Per-call data kept vs only aggregates: per-call data lets support investigate one complaint, at much greater storage cost."],
    p: ["Averages over an hour hide a daily thirty-second burst of loss that coincides with a backup job.", "Late-discard loss is counted as network loss and sends the team to the wrong link."],
    v: "Start a large file transfer across a branch link during a test call and confirm the dashboard shows jitter rising at that site within a minute and attributes it to the branch segment.",
    dep: ["rtcp-statistics","jitter-buffer"]
  },
  "synthetic-test-calls": {
    s: "Automated calls placed on a schedule through real trunks and routes to check that numbers answer, audio flows and quality is acceptable.",
    d: "A test agent places calls to known endpoints, plays reference audio, measures delay and loss, records the result of DTMF menus and compares response times against a baseline. It checks inbound from outside carriers as well as outbound, and each trunk and site. Failures raise alerts before users complain. Care is needed so tests do not reach real people, appear as fraud, or add to billed traffic unnoticed.",
    k: ["Frequent small tests vs occasional thorough ones: frequent tests catch outages quickly, while thorough ones exercise more features but find problems late.", "Tests from inside the network vs from outside: inside is easy and reliable, but only outside tests reveal firewall, carrier and routing faults users see."],
    p: ["The test destination is itself broken, so every failure alert is ignored as noise.", "A synthetic caller number is blocked by a carrier as suspicious and tests silently stop covering that route."],
    v: "Disable one trunk in a lab and confirm the next scheduled test call fails, the alert names the trunk, and the alert clears after the trunk is restored and the next test succeeds.",
    dep: ["dial-plan-engine","sip-trunking"]
  },
  "sip-trace-capture": {
    s: "Captures every signaling message of a call, in order, with timestamps and sources, so engineers can see exactly what each side sent.",
    d: "Taps on servers, mirrored switch ports or a built-in export copy SIP messages to a collector, which groups them by call identifier and draws the message sequence as a ladder diagram with timings. It is the main tool for diagnosing one-way audio, failed transfers and interoperability faults. Encrypted signaling must be captured before encryption or the keys must be available. Volume is large, and traces contain numbers and credentials that need access control.",
    k: ["Capture on the server vs on the network: server capture sees decrypted messages, while network capture is independent of the software and shows what really went on the wire.", "Keep all traces briefly vs sample long: full short retention serves recent complaints, whereas sampling covers history but may miss the failing call."],
    p: ["Authentication headers and voicemail PINs in stored traces are readable by every support engineer.", "Capture runs at the wrong point and shows the message before address rewriting, hiding the bug."],
    v: "Make a call that fails with a known error, find it by calling number in the collector and confirm the ladder shows the exact response code, the sending hop and the timestamps within a few milliseconds.",
    dep: ["sip-parser","dialog-layer"]
  },
  "network-readiness": {
    s: "Preparing the IP network for voice: traffic marking, queuing, bandwidth planning and testing, so calls get priority over bulk data.",
    d: "Voice packets are marked with a DSCP value and switches and routers queue them ahead of bulk traffic, often with a strict-priority queue limited to a fraction of the link. Bandwidth is planned from codec rate plus header overhead per concurrent call. Voice often sits on its own VLAN, discovered by phones through link-layer protocols. Readiness tests send simulated calls over the real path. Problems arise where markings are stripped at carrier or internet boundaries.",
    k: ["Priority queuing for voice vs plain over-provisioning: priority guarantees low delay under load, while over-provisioning is simpler but fails the day a link saturates.", "Trusting phone markings vs re-marking at the switch: trusting is easy, but re-marking stops other devices from claiming priority."],
    p: ["A WAN provider resets DSCP to zero, so voice queues behind downloads on the branch link.", "Bandwidth planning ignores header and Ethernet overhead and undersizes links by a third."],
    v: "Saturate the WAN link with bulk traffic during a test call and confirm in a packet capture that voice packets keep their marking end to end and jitter stays below the agreed threshold.",
    dep: ["rtp-packetization"]
  },
  "recording-policy": {
    s: "The rules that decide which calls are recorded, when recording starts and stops, who may listen and how long recordings are kept.",
    d: "Rules match on users, queues, numbers, direction or call type and can record all calls, a random sample, or on demand by an agent or supervisor. Pause and resume let agents skip card numbers. The policy engine tells call control to start media forking, and tags each recording with call metadata. Rules may differ by jurisdiction. The hard parts are guaranteeing nothing that must be recorded is missed and nothing that must not be recorded is kept.",
    k: ["Record everything vs selective rules: everything meets audit needs and is simple, but multiplies storage and privacy exposure, while selective rules risk missing a required call.", "Server-side vs endpoint-side recording: server-side is uniform and tamper-resistant, but endpoint recording captures calls that never pass through the server."],
    p: ["A call transferred to an unrecorded extension drops out of recording with no indication.", "A rule change applies only to new calls, so ongoing calls remain unrecorded after a regulator expects coverage."],
    v: "Place a call that matches the policy, transfer it twice, and confirm one complete recording exists with correct metadata; place a call outside the policy and confirm none exists.",
    dep: ["media-forking","extension-directory"]
  },
  "media-forking": {
    s: "Sending a duplicate of a call's audio streams to a recorder while the call continues, normally using the SIPREC standard between the call path and the recording server.",
    d: "A media anchor or border controller copies both directions of the call's RTP and opens a separate recording session to the recorder, describing the participants in metadata. Streams may be sent separately per side so analytics can tell who spoke. The recorder must see the exact audio, including after codec conversion. The difficulty is that the copy consumes bandwidth and CPU, and the recording session can fail independently of the call.",
    k: ["Anchored in the media path vs network packet capture: anchoring gives clean, labeled streams, while capture avoids touching the call but misses encrypted or relayed media.", "Separate streams per participant vs mixed: separate enables per-speaker analytics, mixed uses less storage."],
    p: ["Recorder failure causes calls to proceed unrecorded without alerting, or worse, drops calls when policy demands a recording.", "Metadata arrives after the media, and recordings are stored with missing participants."],
    v: "Start recording on a call, play a known tone sequence from each side, and confirm the stored recording contains each tone on the correct channel with the correct start time.",
    dep: ["media-relay","rtp-packetization","recording-policy"]
  },
  "recording-storage": {
    s: "Stores recordings in compressed, encrypted form with an index, applies retention periods and deletes them when the period ends.",
    d: "Audio is encoded for storage, encrypted, written to object or file storage and indexed by call metadata. Retention rules set deletion dates by call type, and legal hold suspends deletion for specific calls. Access is logged. Playback goes through an authenticated service. Storage grows quickly: a call hour is tens of megabytes, so tiering to cheaper storage and deletion on schedule matter. Proving that deletion truly occurred, backups included, is the hard part.",
    k: ["Encrypt with per-recording keys vs one key for all: per-recording keys allow deleting by destroying keys, at the cost of key management scale.", "Hot storage for everything vs tiered: hot storage gives fast playback, while tiered storage saves money but delays old recordings."],
    p: ["Backups retain recordings past the retention period, defeating a legal deletion requirement.", "Playback links are shareable and never expire, so a leaked URL exposes a call."],
    v: "Record a call with a one-day retention in a test policy and confirm the recording plays on day one and is unreachable and absent from storage and its backup index after the deadline.",
    dep: ["recording-policy","state-store"]
  },
  "consent-announcements": {
    s: "Plays or signals notice to callers that a call may be recorded, as laws in many places require, and tracks whether consent was given.",
    d: "On calls that match a recording policy, the media server plays a short announcement to the caller, or to both parties, before connecting or when recording starts. Some regions require consent from all parties, others from one. The system may let the caller opt out by routing to an unrecorded path. Announcements must be in the caller's language and are logged. Complexity comes from calls that cross jurisdictions, and from transfers that add parties after the announcement.",
    k: ["Announce on every call vs only where required: always is simple and safe, but irritates callers where no law demands it.", "Announcement then recording starts vs recording from the first second: delaying avoids recording the notice, whereas starting immediately proves what the caller heard."],
    p: ["A call forwarded from another country is recorded under one-party rules while the caller is in a two-party jurisdiction.", "A party added by conference joins after the announcement and is recorded without notice."],
    v: "Call from numbers in different regions and confirm each hears the correct language and wording, and that the recording metadata contains the announcement time and the caller's choice.",
    dep: ["recording-policy","tones-announcements"]
  },
  "transcription-analytics": {
    s: "Converts recorded calls to text and extracts topics, sentiment, talk time and keywords so calls can be searched and scored.",
    d: "Audio from separate channels is sent to speech recognition, producing time-aligned text per speaker. Analytics then flag words, silence, interruptions, or compliance phrases, and index the text for search. It may run in real time to prompt an agent, or afterwards in batch. Accuracy falls with phone-quality audio, accents and domain vocabulary. Transcripts are personal data and may contain account numbers that need redaction before storage.",
    k: ["Real-time vs batch processing: real time can guide a live call but costs compute during peaks, while batch is cheaper and can use better models.", "Redact before storing vs store raw and restrict access: redaction limits exposure but cannot be undone if wrong, raw keeps evidence and relies on access controls."],
    p: ["Sensitive numbers in transcripts are searchable by every analyst because only the audio was protected.", "Mixed single-channel audio breaks speaker attribution, so agent and customer words are confused."],
    v: "Record scripted calls with known phrases and numbers, then confirm the transcript word error rate is below the agreed threshold and that card numbers appear redacted in stored text.",
    dep: ["recording-storage","speech-recognition-tts"]
  },
});
