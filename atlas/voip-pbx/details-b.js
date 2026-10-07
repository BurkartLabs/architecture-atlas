// Details for the VoIP & PBX plate, part 2: call features, IVR and queues, dial plan and routing.
ATLAS.details("voip-pbx", {
  "hold-and-moh": {
    s: "Pausing a call so media stops flowing from one side, with optional music or a message played to the waiting party.",
    d: "The holding party sends a new session description marking its stream send-only or inactive. The far side stops sending voice and, if the system provides music, the media server starts streaming it to the held party. Resume sends another description restoring both directions. Music comes from a looping file or stream, often shared among many callers by one source. The hard parts are devices that interpret hold differently, held calls through trunks that drop silent streams, and music licensing.",
    k: ["Local hold vs network hold: local hold has the phone play its own sound and needs no server, while network hold uses media server music and works uniformly across devices.", "One shared music stream vs per-call playback: sharing saves resources but all callers hear the same point, and per-call starts each from the beginning."],
    p: ["Hold sent to a trunk that treats silence as dead causes the carrier to disconnect after a minute.", "Both parties press hold at once and their session descriptions cross, leaving the call permanently silent."],
    v: "Hold a call from each side of a trunk call for ten minutes, confirm the held party hears music, the call survives, and audio returns in both directions on resume.",
    dep: ["sdp-offer-answer","media-server","dialog-layer"]
  },
  "call-transfer": {
    s: "Moving an existing call to a third party, either immediately without consulting (blind) or after talking to the new party first (attended).",
    d: "The transferring phone asks the remote party to call the target using a REFER request, optionally with a Replaces reference to the consultation call. The remote party sends progress notifications back, and the transferor drops out when the new call connects. Alternatively a back-to-back agent re-bridges the legs itself. It is hard because it combines two dialogs, and any party may fail midway, leaving the original caller needing to be recovered rather than dropped.",
    k: ["Endpoint-driven REFER vs server-controlled re-bridging: REFER keeps the server light, but depends on every endpoint and trunk honoring it, while server control works for any device but anchors media.", "Transfer back to the transferor on failure vs end the call: returning is friendlier, but needs the transferor to remain on the line."],
    p: ["A carrier rejects REFER, so transfers to outside numbers silently fail or tie up two trunk channels.", "The caller ID shown to the transfer target is the transferor's, confusing screening rules and recipients."],
    v: "Perform blind and attended transfers across internal, outside and cross-trunk targets, and confirm each result: the caller reaches the target with audio both ways, the transferor's leg is released and the records show one call chain.",
    dep: ["refer-and-replaces","dialog-layer","proxy-and-b2bua"]
  },
  "forwarding-and-dnd": {
    s: "Redirecting calls to another destination always, when busy, when unanswered or when unreachable, and refusing calls entirely while a user is set to do not disturb.",
    d: "On each incoming call the routing logic checks the callee's rules against current state: is the phone busy, did it ring for a set time, is it registered, is a schedule active. It then redirects with a new target or rejects the call. Redirects count hops to catch loops. The rules may be edited from the phone through feature codes or from a portal. Complexity is in precedence between users' rules and administrator policy, and in what caller ID the forwarded call shows.",
    k: ["Server-side forwarding vs sending a redirect response to the caller's side: server-side hides the final destination and keeps control, while redirect responses reduce server load but may expose numbers and need caller cooperation.", "Honoring forwarding to external numbers vs blocking it: allowing is useful, but lets one compromised extension forward calls to costly destinations."],
    p: ["Two users forward to each other and the call loops until the hop limit, using channels and ringing nothing.", "Forwarding an internal call to a mobile uses the original caller's number as the outbound identity, which the carrier rejects."],
    v: "Set no-answer forwarding to a second phone with a twelve second timeout, call the first, leave it unanswered and confirm the second rings after twelve seconds and the record shows the forward reason.",
    dep: ["dial-plan-engine","class-of-service","location-service"]
  },
  "ring-groups": {
    s: "Delivering one incoming call to several phones, either all at once or in sequence, until one answers.",
    d: "The group definition lists members and a strategy. Simultaneous ringing forks the call to every member and cancels the others when one answers. Sequential ringing tries members in order with timeouts, and the group may end in voicemail. Members that are busy, on do-not-disturb or unregistered are skipped. The difficulty is race conditions: two members answering within milliseconds, a cancel crossing an answer on the wire, and a member's own forwarding adding another fork.",
    k: ["Simultaneous vs sequential ringing: simultaneous gets answered fastest but disturbs everyone, while sequential is polite and slower.", "Forwarding rules of members honored vs ignored: honoring respects users but allows fan-out explosions, ignoring keeps the group predictable."],
    p: ["Two phones answer almost together and the second caller leg is left connected to silence until it times out.", "A member forwarding to the group causes the group to ring itself recursively."],
    v: "Call a group of five phones and answer two within one second of each other; confirm exactly one call is connected, the other phone stops ringing and the record shows one answering member.",
    dep: ["proxy-and-b2bua","transaction-layer","location-service"]
  },
  "call-park-pickup": {
    s: "Parking a call in a numbered slot so anyone can retrieve it from another phone, and picking up a ringing call at another extension.",
    d: "Park moves the call to a media server or holding dialog and announces a slot number, which any phone retrieves by dialing the slot. A timeout rings back the parker. Pickup lets a user dial a code to take over a ringing call from a colleague's extension or from a pickup group, which requires finding the pending call in shared state and replacing its destination. Both rely on call state visible across servers, which in a cluster must be shared.",
    k: ["Slots at a central node vs distributed: central is simple, but becomes a single point of failure, while distributed needs shared call state.", "Open pickup vs permission by group: open is easier, but exposes other people's calls to anyone."],
    p: ["Parked calls on a node that fails disappear, and callers hear silence then a disconnect.", "A pickup code dialed by mistake steals a customer call from the wrong team."],
    v: "Park a call from one phone, retrieve it from a phone at another site, then park another and let it time out; confirm retrieval connects audio and the timeout rings the original parker.",
    dep: ["state-store","dialog-layer","presence-and-blf"]
  },
  "presence-and-blf": {
    s: "Showing whether colleagues are idle, ringing or on a call, usually as lamps on phone keys, and letting users act on those states.",
    d: "Phones subscribe to the state of other extensions through event subscriptions. Call control publishes dialog state changes: early, confirmed, terminated. The server aggregates these into notifications sent to every watcher. A lamp key can then dial, pick up or transfer to the watched extension. Application-level presence such as away or in a meeting is layered on. The difficulty is fan-out: one busy extension watched by hundreds of phones generates hundreds of notifications per change.",
    k: ["Push notifications on every change vs polling: push is timely but costs load on busy extensions, polling is bounded but shows stale lamps.", "Per-phone subscriptions vs a subscription to a list: lists reduce the number of dialogs but need list-capable phones and server support."],
    p: ["After a server restart no subscriptions exist, and lamps show idle while people are on calls until phones resubscribe.", "A reception phone watching three hundred lines overloads its own CPU on busy mornings."],
    v: "Subscribe fifty phones to one extension, place and end a call on it, and confirm every lamp changes to busy and back within two seconds, with the server's notification rate within its budget.",
    dep: ["event-subscriptions","dialog-layer","state-store"]
  },
  "conferencing": {
    s: "Joining three or more parties into one call, with a mixer that combines their audio, controls for moderators and often a dial-in number and access code.",
    d: "Participants call a conference number, enter an access code and are placed in a room on a media server. The mixer sums everyone's audio except the listener's own, detects speakers and applies level control. Moderators can mute, eject and lock the room. Rooms can be started by an ad hoc add of a third party to a call. The hard parts are mixing wideband and narrowband participants, large rooms where mixing all streams costs CPU, and keeping room state when the media server fails.",
    k: ["Mixing everyone vs mixing only the loudest few: full mixing is simple and complete, while loudest-few scales to large rooms at the risk of missing a quiet speaker.", "Server mixing vs forwarding streams to endpoints: server mixing works with any phone, forwarding saves server CPU but needs capable endpoints."],
    p: ["A participant with a noisy line cannot be muted because only the moderator's client offers controls.", "Echo when one participant uses a speakerphone beside another is amplified by the mixer to every caller."],
    v: "Join twenty callers using three different codecs, have each speak in turn and confirm everyone hears each speaker clearly, no one hears their own voice, and mixing CPU stays within its target.",
    dep: ["conference-mixer","media-server","transcoder"]
  },
  "voicemail": {
    s: "Takes a message when a call is not answered, stores it, and lets the user hear it by phone, email, or app, with a light-on-the-phone indicator.",
    d: "On no-answer or busy, call control routes to a voicemail application that plays the user's greeting, records the message, and stores audio with metadata. A message-waiting notification tells the phone to light its lamp. Users retrieve messages by dialing in with a PIN, or receive audio attached to email, or through visual voicemail with transcription. Hard parts include storage and retention, PIN security, message-waiting state after a phone reboots, and consistency across many servers.",
    k: ["Store on the voicemail server vs in email only: server storage keeps the phone lamp and PIN retrieval consistent, while email-only is simple but loses the lamp and mixed access.", "Short PINs for convenience vs long ones: short PINs are easy to type, but are the usual way fraudsters break in."],
    p: ["Voicemail default PINs let attackers listen to messages or place outbound calls through call-back features.", "Message-waiting lamps get out of sync after a phone reboots, showing a message that was deleted or hiding a new one."],
    v: "Leave a message for an unanswered extension, then confirm the lamp lights within seconds, the message plays by phone and arrives by email, and deleting it clears the lamp.",
    dep: ["media-server","event-subscriptions","recording-storage"]
  },
  "fax-over-ip": {
    s: "Carrying fax transmissions across a voice network, either by relaying them as data using the T.38 protocol or by passing the tones through unchanged.",
    d: "Fax modems send tones that survive neither compression nor jitter. In passthrough mode the call uses an uncompressed codec and no echo cancellation, which works on clean networks. In T.38 mode the gateway demodulates the fax and sends the data over UDP with redundancy, then re-modulates at the far end. The switch from voice to T.38 happens mid-call through a new session description, which many devices handle badly. Fax is hard because the machines have strict timing.",
    k: ["T.38 relay vs passthrough: T.38 tolerates loss and jitter, but needs support at each hop, while passthrough works anywhere with a clean network and fails on a lossy one.", "Fax to email service vs a physical machine on an adapter: services remove the fragile analog path, but need to be accepted by those who require a machine."],
    p: ["Echo cancellation or voice activity detection left on during passthrough corrupts the fax tones and breaks the page.", "One hop that does not support T.38 re-invite rejects the switch and the fax hangs mid-document."],
    v: "Send a ten-page fax in both directions through the trunk and confirm every page is received without errors at the highest agreed speed, repeating with two percent packet loss in the lab.",
    dep: ["sdp-offer-answer","analog-adapters","voice-codecs"]
  },
  "auto-attendant": {
    s: "A menu that answers a call, plays options such as press 1 for sales, and routes the caller to the right destination without a receptionist.",
    d: "The attendant is a configured flow: greeting, options bound to digits or spoken words, schedule variations for hours and holidays, dial-by-name directory and timeouts that fall back to an operator. It answers the call, so billing and recording start, and it uses the media server to play prompts and collect digits. After a choice the call is transferred or bridged. The challenge is design more than code: deep menus frustrate callers, and each business-hour change needs the right prompt.",
    k: ["Few options at one level vs deep menus: shallow menus are easier to use, deep ones fit complex organizations but lose callers.", "Dial by name through the directory vs only numbered options: names are friendly but need accurate pronunciation and are error-prone with common surnames."],
    p: ["A holiday schedule is not updated, so callers hear the closed message on a working day.", "A menu option routes to an extension that forwards back to the attendant, looping the caller."],
    v: "Call the main number inside and outside business hours and with each option, and confirm each plays the right prompt and reaches the correct destination, and that silence for the timeout reaches the operator.",
    dep: ["ivr-flow-engine","media-server","dial-plan-engine"]
  },
  "ivr-flow-engine": {
    s: "The runtime that executes configured call flows: play, collect input, query data, branch, transfer and hang up, for each caller independently.",
    d: "A flow is a graph or script of steps, often built in a visual designer or a markup language driven by HTTP calls to application servers. The engine holds a session per call, drives the media server to play prompts and capture digits or speech, evaluates conditions and calls external services for account data. Sessions must end on hangup from either side. Difficulty includes slow back-end lookups that leave callers in silence, and flow versions changing under active calls.",
    k: ["Flows defined in the platform vs controlled by an external application over an API: platform flows are simple to edit, while an external application gives full logic at the cost of building and running it.", "Synchronous lookups during the call vs prefetching: synchronous is accurate but adds delay, prefetching is fast but may be stale."],
    p: ["A back-end timeout of thirty seconds leaves the caller in dead air with no fallback prompt.", "A flow edit applied mid-call sends active sessions to steps that no longer exist."],
    v: "Run a flow that looks up an account by entered number, simulate a back-end that responds slowly, and confirm the caller hears a fallback within the stated delay and is routed to an agent.",
    dep: ["media-control-interface","dtmf-events","speech-recognition-tts"]
  },
  "speech-recognition-tts": {
    s: "Turning caller speech into text so menus accept spoken input, and turning text into spoken audio for prompts built from live data.",
    d: "Recognition receives the call's audio stream, matches it against a grammar or free-form model, and returns text with confidence scores and alternatives. Synthesis renders text such as an account balance to audio, usually cached. Both connect to the media server over a streaming interface and add latency. Telephone audio is narrowband and noisy, which lowers accuracy. The design work is on confirmation: what to do when confidence is low, and how to let callers barge in over a prompt.",
    k: ["Constrained grammars vs open dictation: grammars give high accuracy on a known list, while open recognition handles any phrase but errs more on telephone audio.", "Pre-recorded prompts vs synthesized speech: recordings sound natural for fixed phrases, whereas synthesis handles dynamic content at a lower quality."],
    p: ["Barge-in picks up the prompt's own echo and cuts it off immediately.", "Low-confidence results are accepted silently, routing callers to the wrong department."],
    v: "Run a test set of recorded phone utterances including accents and background noise through the recognizer and check accuracy meets the target; play a dynamic prompt and verify the spoken number matches the data.",
    dep: ["media-control-interface","voice-codecs"]
  },
  "call-queue": {
    s: "Holds callers in order, with music and announcements, until an agent is available, then connects them under the queue's rules.",
    d: "The queue stores waiting calls with arrival time, priority and required skills, and plays position or wait time announcements. It subscribes to agent availability and, when one becomes free, selects a caller and offers it to the agent. Limits on queue length and wait time send overflow to voicemail or other queues. Calls waiting hold a media path, so queue capacity is bound by media resources. The difficulty is correctness under races: two agents offered the same caller, or a caller who abandons just as they are offered.",
    k: ["Queue state in one node vs shared across the cluster: one node is fast and simple, shared state survives failure but needs careful locking.", "Estimated wait announcements vs none: estimates reduce abandonment, but wrong estimates anger callers more than silence."],
    p: ["A node failure drops every waiting caller at once, the busiest moment.", "Abandoned calls are not removed in time and agents are offered callers who already hung up."],
    v: "Load a queue with fifty test callers and three agents, abandon some at random, and confirm no agent is offered an abandoned caller, order respects priority, and records show correct wait times.",
    dep: ["media-server","state-store","agent-state-and-skills"]
  },
  "agent-state-and-skills": {
    s: "Tracks each agent's status, such as available, on call, wrap-up or away, and which skills and queues they serve.",
    d: "Agents log in to queues from a desk phone or softphone and set states from a client or feature codes. The system derives state automatically from calls too: ringing, talking and a configurable wrap-up time. Skills carry proficiency levels used when matching callers. Every state change is time-stamped for reporting. Hard parts include state drifting from reality when a phone loses registration, agents shown available while on a call from a second line, and consistent state across servers.",
    k: ["Automatic state from call events vs manual only: automatic is accurate and saves effort, manual gives agents control but is forgotten and skews reports.", "Fixed skill lists vs weighted proficiency: fixed lists are simple, weighting routes difficult calls to the best agent at the cost of more tuning."],
    p: ["An agent whose phone dropped its registration still shows available and calls are offered into nothing.", "Agents forget to leave wrap-up status, and the queue sees capacity that does not exist."],
    v: "Unplug an available agent's phone and confirm the system marks them unavailable within the registration timeout, and that no call is offered to them after that point.",
    dep: ["registrar","presence-and-blf","state-store"]
  },
  "distribution-strategies": {
    s: "The rule that chooses which waiting caller goes to which free agent: longest idle, round robin, skills match, priority or ring-all.",
    d: "When a caller and an agent are both available, the distributor scores the pairs. Common rules offer the longest-waiting caller to the longest-idle agent, honor VIP priority, match required skills and fall back to broader groups after a wait threshold. Some systems try to predict which agent will free up. Sophisticated rules can starve some callers or agents. The distribution must also react to offers that go unanswered, rerouting after a short ring timeout.",
    k: ["Longest idle agent vs best skill match: idle-first spreads work evenly, while best match improves resolution and can overload the experts.", "Waiting for the best agent vs relaxing after a delay: waiting improves match quality, relaxing protects service level."],
    p: ["Strict skills with no fallback strand callers waiting for an agent who does not exist on that shift.", "An agent with a broken headset ignores offers and is offered the next call every few seconds."],
    v: "Simulate a day of arrivals with known skills in a test queue and confirm the achieved service level and the distribution of calls per agent match the model's prediction within tolerance.",
    dep: ["call-queue","agent-state-and-skills"]
  },
  "queue-callbacks": {
    s: "Letting a waiting caller hang up and be called back when an agent is free, keeping their place in line.",
    d: "The caller is offered a callback, enters or confirms a number, and the system keeps a virtual position. When it is their turn, the system first reserves an agent, then places an outbound call to the caller and connects it to the agent. Rules handle no answer, voicemail on the caller's line, and retry limits. The hard parts are verifying the number is valid, avoiding agents waiting while the caller is dialed, and outbound regulations.",
    k: ["Dial the customer first vs the agent first: customer-first leaves agents idle while it rings, agent-first wastes the agent's time if the customer does not answer.", "Keep the original place in line vs requeue at the end: keeping is fair to the caller and complicates the schedule."],
    p: ["The callback goes to a voicemail greeting and the agent is connected to a recording.", "A customer asks for callback from a blocked number and the outbound route rejects it, losing the request silently."],
    v: "Request a callback at position ten, hang up, and confirm the system calls back close to the predicted time, connects to an agent after the customer answers, and records the original wait time.",
    dep: ["call-queue","route-selection"]
  },
  "supervisor-tools": {
    s: "Features that let a supervisor listen to a live call silently, speak privately to the agent (whisper) or join the conversation (barge).",
    d: "The supervisor's call is joined to the agent's call on a mixer. In listen mode, the supervisor's audio is not sent to anyone. In whisper mode, only the agent hears it. In barge, all parties do. Access is limited by permissions and may play a tone or be logged. The feature depends on media being anchored at a server that can mix, so calls that bypass the media server cannot be monitored. Legal restrictions on silent monitoring vary.",
    k: ["Monitoring through a mixer on the server vs the phone's own conference: server mixing works uniformly, phone conferences are limited by endpoint capability.", "Silent monitoring with no indication vs audible tone: silence is useful for coaching, but is unlawful in some places without notice."],
    p: ["A call that took a direct media path cannot be monitored when the supervisor tries.", "Whisper audio leaks to the caller because of a mixer routing mistake."],
    v: "Monitor a call in each mode and confirm with recordings of each party that listen sends no audio, whisper reaches only the agent and barge reaches everyone, and that the access is in the audit log.",
    dep: ["conference-mixer","agent-state-and-skills","media-relay"]
  },
  "cti-screen-pop": {
    s: "Linking the phone system to business applications so the agent's screen shows the caller's record at the moment the call arrives, and applications can place and control calls.",
    d: "A telephony integration layer exposes call events and control commands through an API, usually over web sockets or HTTP. When a call is offered, the integration looks up the caller number, or the number entered in the menu, in a customer system and sends the record to the agent's desktop. Click-to-dial and call logging go the other way. Hard parts: matching numbers in different formats, delay between ringing and the screen, and keeping control of the phone consistent with the application's state.",
    k: ["Third-party call control through the server vs control of the phone from the desktop: server control works with any phone, desktop control is simpler but depends on each phone model.", "Pop on ring vs on answer: popping on ring saves seconds but shows data for calls never answered."],
    p: ["Numbers stored without country codes fail to match and agents see an empty record.", "Click-to-dial triggers a call on the wrong line because the application and phone disagree on the active call."],
    v: "Call in from a number with a known record and confirm the agent's screen shows it within one second of ringing; use click-to-dial and confirm the correct phone rings and the call is logged.",
    dep: ["agent-state-and-skills","event-bus","number-normalization"]
  },
  "number-normalization": {
    s: "Converting every dialed or received number into one canonical international form, so that routing, billing and lookups compare like with like.",
    d: "Users dial local, national, international and internal formats, with or without prefixes. Normalization applies the site's country, area code and trunk prefix rules to produce an E.164 number, and the reverse for display. Incoming numbers from carriers arrive in various formats too. Rules are tables of patterns with replacement. It is hard because numbering plans differ and change: area-code overlays, varying lengths and optional prefixes make ambiguous strings.",
    k: ["Normalize at the edge once vs normalize at each step: once is consistent, repeated normalization risks double application.", "Rules per site vs a global rule set: per site respects local habits, global is easier to maintain and fails on exceptions."],
    p: ["A new area-code overlay makes seven-digit dialing ambiguous and calls go to the wrong city.", "Extensions that are four digits collide with short external numbers."],
    v: "Feed a table of one hundred dialed strings from several sites, with expected canonical forms, and confirm each normalizes to the expected number and that the same number received from a carrier matches.",
    dep: ["config-database"]
  },
  "dial-plan-engine": {
    s: "The ordered rule set that interprets a dialed number and a caller's context and decides what the call does: ring an extension, run a menu, send out a trunk or reject.",
    d: "Rules match patterns of digits and conditions such as caller, time, trunk and tenant, and run actions in order: set variables, transform numbers, answer, bridge, play, branch. It is evaluated for each call at setup, sometimes also in mid-call for features. Rules may live in files, a database or an external service. Hard parts are precedence and ambiguity, because longest-match, first-match and priorities interact, and a single wrong pattern can open or close routes for everyone.",
    k: ["Static rule files vs data-driven rules from a database: files are easy to review and version, while data-driven rules change instantly through the portal but are harder to audit.", "First match wins vs longest match: first match is simple to reason about in order, longest match avoids ordering mistakes but surprises the author."],
    p: ["A catch-all pattern placed above a specific one swallows emergency or special numbers.", "A rule edit applied during business hours with a typo sends all calls to a nonexistent destination."],
    v: "Run a regression suite of dialed strings per context against a staging copy, and confirm each reaches the expected destination; include emergency numbers, internal, outbound and invalid strings.",
    dep: ["number-normalization","class-of-service","location-service"]
  },
  "route-selection": {
    s: "Choosing which outbound trunk or carrier carries a call, by destination, cost, quality, capacity and the caller's rights.",
    d: "A route table maps destination prefixes to ordered trunk groups, each with a price and priority. The selector picks the cheapest available route that meets quality rules, skips trunks at their channel limit or marked failed, and tries the next on failure. Least-cost tables are updated when carriers change rates. Some systems adjust by observed answer rates and delay. Hard parts include keeping tables current and avoiding a bad route that wins by being cheapest.",
    k: ["Least cost vs best quality: least cost saves money, but cheap routes often have worse delay and completion, so many systems rank by a weighted score.", "Static preference order vs dynamic selection from measured results: static is predictable, dynamic adapts to carrier problems but may oscillate."],
    p: ["A carrier rate change is not loaded and calls to one country route to a route priced above the customer's rate.", "A failing trunk returns slow errors and each call waits for its timeout before trying the next."],
    v: "Place calls to ten prefixes with one carrier disabled and confirm each selects the expected route in order, falls over within the failure timeout, and shows the trunk used in the records.",
    dep: ["sip-trunking","number-normalization","capacity-model"]
  },
  "class-of-service": {
    s: "Permission rules deciding what each user or phone may call: local only, national, international, premium-rate, with different rules by time or location.",
    d: "Each extension has a class that lists allowed and denied destination categories. The dial plan classifies the normalized destination and checks it against the caller's class before routing. Overrides use authorization codes or manager approval. Classes may vary by time of day. The class is the main line of defense against toll fraud from a compromised phone. The difficulty is categorizing destinations accurately, since premium and satellite numbers hide inside normal-looking ranges.",
    k: ["Deny by default with allow lists vs allow by default with deny lists: deny by default is safer, at the cost of support requests for each new destination.", "Class per user vs per device: per user follows the person, but per device protects lobby phones that should never dial out."],
    p: ["International dialing is allowed to all because the default class was left permissive during setup.", "A new premium-rate range is missing from the deny list and fraud uses it for days."],
    v: "From an extension with national-only permission, dial an international number, a premium number and a national number, and confirm the first two are rejected with the right cause and the third connects.",
    dep: ["extension-directory","number-normalization"]
  },
  "number-translation": {
    s: "Rewriting numbers and caller identity as a call crosses a boundary: stripping prefixes, adding country codes, and choosing which caller ID an outbound call presents.",
    d: "Inbound calls arrive as the carrier's digits and are mapped to internal extensions. Outbound calls are rewritten to the carrier's expected format, and the caller ID is set to the user's own number, a department number or a configured pool. Header fields beyond the From, such as asserted identity, also carry it. Carriers check that the presented number belongs to the customer. Hard parts are privacy requests, emergency location needs and carriers that reject unfamiliar identities.",
    k: ["Present each user's direct number vs one main number: direct supports callbacks, one main number protects privacy and simplifies carrier validation.", "Rewrite at the edge device vs in call control: edge keeps carrier quirks in one place, call control keeps the logic with the routing."],
    p: ["An outbound call shows a number the customer does not own, and the carrier blocks or flags the call.", "Translation applied twice yields numbers with a duplicated country code."],
    v: "Place outbound calls from users with different identity settings, capture the signaling at the trunk and confirm the presented number, format and privacy flags match each rule, and an outside phone shows the expected ID.",
    dep: ["number-normalization","signaling-normalization","caller-id-attestation"]
  },
  "external-routing": {
    s: "Asking an outside service, over HTTP or DNS, where a call should go, so routing can use live data such as customer records, number lookups or rates.",
    d: "At call setup the routing engine sends the call's attributes to a web service or database and receives the destination, trunks or an instruction to reject. Number mapping lookups through DNS translate numbers to addresses. Responses are cached with a timeout. This allows centrally managed, multi-site routing without editing each server. The challenge is latency and dependence: the call waits for the answer, and when the service is down the system must still route.",
    k: ["Query for each call vs cache results: querying is accurate but adds delay and load, caching is fast and may route to a stale destination.", "Fail open to a default route vs fail closed: failing open keeps calls flowing, failing closed protects policy and breaks service."],
    p: ["The routing service takes two seconds to respond under load, and call setup delay doubles.", "A cached reject for a number continues after the customer has paid their account."],
    v: "Stop the routing service during a test, place calls and confirm they route by the documented fallback within the timeout, and confirm normal operation resumes without restarts when the service returns.",
    dep: ["dial-plan-engine","dns-srv-routing"]
  },
  "failover-routing": {
    s: "Rules that send a call somewhere else when the first choice is busy, unreachable, out of hours or overloaded, including to another site.",
    d: "Failover is defined per destination: after a timeout, on a busy or error response, when a trunk is down, or when capacity is exceeded. Targets can be another trunk, an alternate site's extension, a mobile number or voicemail. The router distinguishes causes: a busy user should not trigger trunk failover. Detection of a failed carrier uses OPTIONS pings and response codes. Difficulty is avoiding loops and avoiding retry storms on already overloaded paths.",
    k: ["Retry on any failure vs only on specific causes: retrying everything maximizes completion, but repeating a rejected call can be wrong and costs money.", "Fast failure detection vs stable detection: fast switches quickly and flaps on blips, slow avoids flapping but loses calls during a real outage."],
    p: ["All sites list each other as backups, and a regional outage causes calls to loop between them.", "Failover sends emergency or sensitive calls through a lower-quality route that was never tested."],
    v: "Shut a primary trunk during active calling and confirm new calls move to the backup within the detection time, existing calls are unaffected, and traffic returns when the primary recovers.",
    dep: ["route-selection","sip-trunking","high-availability"]
  },
});
