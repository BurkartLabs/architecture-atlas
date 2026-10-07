// Details for the VoIP & PBX plate, part 3: registration, SIP signaling, emergency calling.
ATLAS.details("voip-pbx", {
  "registrar": {
    s: "The server that accepts REGISTER requests from endpoints, checks their identity and records where each user can currently be reached.",
    d: "An endpoint sends REGISTER with its address of record, its contact address and a requested lifetime. The registrar challenges it for credentials, validates, stores a binding in the location service and returns the granted expiry. One user may register several devices, each its own binding. The registrar enforces limits on bindings per user and rejects unknown users. At scale it handles a burst of registrations after an outage, which can overload it exactly when the system is trying to recover.",
    k: ["Challenge every REGISTER vs trust a recent source: challenging every time is secure and costs processing, while trusting cuts load and widens the window for spoofing.", "Several bindings per user vs one: several supports multiple devices and forking, but one is simpler and avoids stale entries."],
    p: ["After a power cut, thousands of phones register within seconds and the registrar rejects or times out many of them, which then retry in a tight loop.", "Dead devices leave bindings that ring phones nobody owns until expiry."],
    v: "Restart the registrar with five thousand simulated phones, and confirm all re-register within the target time with load rising smoothly, no sustained retry storm, and calls to registered users succeed.",
    dep: ["location-service","endpoint-authentication","sip-parser"]
  },
  "location-service": {
    s: "The lookup table from a user's address to the current contact addresses of their devices, consulted whenever a call needs to find someone.",
    d: "Each binding records the contact URI, source address, transport, expiry, supported features and the server through which it registered. For an incoming call to a user, the proxy retrieves all live bindings and forks to them or picks one. In a cluster the table is shared or replicated so any node can find any user, and a binding records which edge node holds the phone's connection. The difficulty is freshness and speed: lookups happen on every call and must be fast, but stale entries ring dead devices.",
    k: ["Shared in-memory store vs local copy with replication: a shared store is consistent and a single dependency, replication is fast locally but can disagree briefly.", "Expire exactly on schedule vs allow grace: strict expiry is accurate but drops phones that are slightly late to refresh, while grace tolerates delay and rings dead devices."],
    p: ["Replication lag after a node failure sends calls to a node that no longer holds the phone's connection.", "Stale bindings of a laptop that left the network cause a call to ring, time out and then fail over."],
    v: "Register a phone on one node, then place calls from another node and measure lookup time; kill the first node and confirm calls find the phone through its new binding after it re-registers.",
    dep: ["state-store","registrar"]
  },
  "endpoint-authentication": {
    s: "Proving that a device or user is who they claim, normally by a username and password challenge, or by a certificate or source address.",
    d: "SIP digest authentication has the server issue a nonce, the client hash it with the password, and the server verify. The server tracks nonces to prevent replay and may require the same on INVITE as well as REGISTER. Alternatives are TLS client certificates, tokens from an identity provider for web clients, and IP-based trust for trunks. Digest is weak against offline guessing if traffic is captured. Strength depends largely on password quality, since many phones use the extension number as the password.",
    k: ["Digest passwords vs client certificates: passwords are easy to provision, while certificates resist guessing and are more work to issue and rotate.", "Authenticate INVITEs as well as REGISTER: authenticating calls stops forged calls from known addresses, at the cost of an extra round trip."],
    p: ["Password equals extension number, so any scanner that finds the extension owns the line.", "Without nonce expiry and counting, a captured authentication header can be replayed."],
    v: "Attempt registration with a wrong password a hundred times from one address and confirm each is rejected, the address is blocked after the threshold and the real user can still register from elsewhere.",
    dep: ["sip-parser","config-database","scanner-defense"]
  },
  "registration-refresh": {
    s: "The periodic re-registration and keepalive traffic that keeps bindings alive and detects phones that have vanished.",
    d: "A binding lasts for its granted lifetime, typically minutes to an hour, and the phone refreshes before it expires. Shorter lifetimes detect dead phones sooner but multiply traffic. Behind NAT, keepalives every thirty seconds or so keep the translation open, and some use a lightweight ping or CRLF on the connection. The server may flag a phone as lost when keepalives stop. The balance is between load on a large population and how quickly an outage is noticed.",
    k: ["Short expiry vs long expiry: short is responsive to failures and NAT changes, but multiplies registration load across thousands of phones.", "Keepalive on the connection vs re-register often: keepalives are cheap and bytes small, re-registering is universal but heavy."],
    p: ["Expiry set to a few minutes across ten thousand phones consumes a large share of signaling capacity.", "Phones that refresh at identical times after a restart create synchronized bursts."],
    v: "Block a phone's network for longer than its keepalive interval and confirm the server marks it unreachable within the expected time, and routes calls to its fallback rather than ringing it.",
    dep: ["registrar","location-service"]
  },
  "mobile-push-wakeup": {
    s: "Using the mobile operating system's push service to wake a sleeping softphone app when a call arrives, since the app cannot hold a connection open in the background.",
    d: "The app registers with the phone system and stores a push token. On an incoming call the server sends a push message to the platform's notification service, then waits, often holding the call, until the app wakes and re-registers or answers. Operating systems require calls to be reported to the system calling interface quickly. The delay between ring and wake can be several seconds. Failures include tokens that expire and pushes delayed or dropped by the platform.",
    k: ["Push then wait for registration vs keep a persistent connection: push saves battery and works with the operating system rules, a connection is faster but is killed in the background.", "Hold the call for the push wake-up vs reject quickly: holding gives the user time to answer, rejecting early frees the caller to try elsewhere."],
    p: ["The caller hears ringing while no phone is ringing because the push was delayed beyond the call timeout.", "A stale token is used after the app is reinstalled, and every push to it is silently dropped."],
    v: "With the app killed and the phone idle in a pocket for an hour, place ten calls and confirm each rings the phone within the target seconds, counting any missed, and that the call connects with audio.",
    dep: ["registrar","location-service","dialog-layer"]
  },
  "analog-adapters": {
    s: "Boxes that connect ordinary analog phones, fax machines and door entry devices to the IP system, presenting a phone line on one side and SIP on the other.",
    d: "An adapter generates dial tone and ringing voltage, detects off-hook and digits, then registers lines with the server as ordinary endpoints. It converts audio to IP packets with echo cancellation and codec choice, and passes fax and modem tones in a special mode. Features such as caller ID display and message-waiting lamps are emulated through line signaling. The hard parts are the electrical behaviors of old devices and country-specific tone and ring standards.",
    k: ["Adapter per device vs a multi-port gateway: single adapters are simple and local, gateways centralize management of many lines.", "Fax passthrough vs relay: passthrough is simple on clean networks, relay survives loss but needs support at every hop."],
    p: ["Ring voltage too low for old phones means they never ring, or too high for newer devices.", "Wrong country settings produce wrong tones and unusual disconnect detection, so calls never hang up."],
    v: "Connect an analog phone and a fax machine, make inbound and outbound calls, send and receive a multi-page fax, and confirm ring, caller ID, digit recognition and hang-up detection all work.",
    dep: ["registrar","voice-codecs","fax-over-ip"]
  },
  "device-profiles": {
    s: "A description of what each phone model supports and how it behaves, so the system sends it only features, codecs and messages it can handle.",
    d: "Profiles record supported codecs, transfer methods, line counts, security options, encrypted media, forms of hold, and known quirks. The system picks the profile from the device's identification header or its provisioning identity and applies it to signaling and media decisions, for example removing a codec it cannot decode. Profiles hold workarounds for non-standard behavior. A large fleet of models makes the profile library the record of every interoperability lesson learned.",
    k: ["Detect capabilities from the signaling vs maintain a profile table: detection adapts to new devices but cannot reveal bugs, while tables encode known quirks and need updating.", "Strict standards compliance vs accommodating quirks: strictness keeps logic clean, accommodation keeps the poorly behaved device working."],
    p: ["A new firmware version changes behavior and the profile for that model silently stops matching.", "A workaround for one device model is applied to all and breaks a compliant device."],
    v: "For each supported model run the standard suite of calls: hold, transfer, conference, DTMF, codec change, and confirm results match the profile, and flag any model whose results differ from its record.",
    dep: ["codec-negotiation","config-database"]
  },
  "sip-parser": {
    s: "Turns the bytes of a SIP message into a structured request or response, and back, tolerating the variations real devices produce.",
    d: "SIP is a text format like HTTP with start line, headers and body. The parser handles compact header names, folded lines, repeated headers, quoting, URI parameters, and the body's session description. It must be fast, since every message passes through, and defensive, since attackers send malformed messages to crash or confuse servers. It leaves unknown headers intact for forwarding. The challenge is leniency: devices send nearly valid messages and rejecting them loses calls, while accepting them risks ambiguity.",
    k: ["Strict parsing vs lenient parsing: strict rejects bad input and is safer, while lenient keeps working with devices whose output is almost right.", "Parse everything up front vs lazily: eager parsing is simple, lazy parsing handles proxy workloads faster by touching only the headers needed."],
    p: ["Messages with oversized headers or deeply nested values exhaust memory in an unprepared parser.", "Two components parse an ambiguous header differently, enabling smuggling past a security check."],
    v: "Feed the parser a corpus of valid messages from many devices plus fuzzed malformed ones; confirm valid ones round-trip identically and malformed ones are rejected without crashes or memory growth.",
    dep: ["sip-transports"]
  },
  "sip-transports": {
    s: "The network carriage of SIP messages over UDP, TCP, TLS or WebSocket, including connection handling and the rules for choosing among them.",
    d: "UDP is the traditional default: simple, with message retransmission handled by SIP itself, and limited by packet size. TCP and TLS give ordered delivery and connections that can carry responses back, needed for large messages and for phones behind NAT. WebSocket carries SIP for browser clients. The server picks transport from DNS records and the next hop's capabilities. The difficulty is connection management: thousands of persistent connections, reuse for responses and recovery when a connection breaks mid-call.",
    k: ["UDP vs TCP or TLS: UDP has low overhead and no connection state, while TCP and TLS handle large messages and encryption at the cost of connection memory.", "Reusing the inbound connection for requests to a phone vs opening a new one: reuse works through NAT and firewalls, and a new connection is blocked by them."],
    p: ["Messages larger than the path MTU are fragmented over UDP and silently dropped by a firewall.", "A server restart drops every connection and phones reconnect at the same moment."],
    v: "Send a large message with many headers over UDP and TLS through a firewall-equipped lab path, and confirm it is delivered by switching to a connection-based transport as needed, with call setup succeeding.",
    dep: ["dns-srv-routing","sip-over-tls"]
  },
  "transaction-layer": {
    s: "Matches each SIP request to its responses, retransmits when the network loses messages, and times out when no answer comes.",
    d: "Each request starts a transaction with a state machine and timers. Over UDP the client retransmits at doubling intervals until a response arrives or thirty-two seconds pass, and the server absorbs duplicate requests. INVITE transactions have an extra provisional state and a separate acknowledgment. Responses are matched using a branch parameter. A proxy keeps a client and a server transaction per hop. The hard part is the volume of timers and correct behavior at the boundaries, for example a 200 response arriving as the transaction times out.",
    k: ["Stateful transactions vs stateless forwarding: stateful handles retransmission and forking correctly, while stateless scales higher and cannot retry or fork reliably.", "Standard timers vs shortened timers: shortened timers fail over faster, but cause duplicate calls on slow links."],
    p: ["A retransmitted INVITE not matched to its transaction starts a second call and a phone rings twice.", "Timer-heavy workloads on a busy server cause timer queue backlogs and late retransmissions."],
    v: "Drop random messages in a lab at ten percent loss and confirm calls still complete, retransmissions follow the specified schedule, and no duplicate calls or leaked transactions remain after the run.",
    dep: ["sip-parser","sip-transports"]
  },
  "dialog-layer": {
    s: "Tracks each established call as a dialog, identified by its call identifier and tags, and routes later requests such as re-INVITE and BYE to it.",
    d: "A dialog starts with the first provisional or final response and holds the remote target, route set, sequence numbers and state. Mid-call requests such as hold, transfer and hangup reference it. Early dialogs from forked calls may exist several at once. A dialog consumes memory for the entire call, and in a cluster its state must be reachable by whichever node receives the next message. Difficulty arises from forking, losing a node holding the state, and requests that arrive out of order.",
    k: ["Dialog state in the server vs carried in the messages: server state is rich and needs failover, while carried state is stateless and limited in what features it supports.", "Dialog-aware proxy vs transaction-only proxy: dialog awareness enables call counting and forced hangup, at the cost of memory and recovery logic."],
    p: ["A node failure loses dialog state and the BYE for an active call cannot be routed, leaving hung calls and billing.", "Out-of-order CSeq numbers on re-INVITEs cause a valid hold to be rejected as stale."],
    v: "Establish ten thousand calls, kill one node, and confirm the surviving nodes can still hang up affected calls or that clean-up completes them, with accurate records and no stuck channels.",
    dep: ["transaction-layer","state-store"]
  },
  "proxy-and-b2bua": {
    s: "The two designs for call control: a proxy forwards messages between parties, while a back-to-back user agent terminates each leg and bridges them itself.",
    d: "A proxy adds routing headers and passes messages along, leaving endpoints in control. A back-to-back agent answers the caller on one dialog and places a separate call on another, copying or modifying what passes between them. The second design allows features such as topology hiding, codec bridging, recording and call transfer control, because it sees and changes everything. It is also heavier, with state for two dialogs per call, and must translate every mid-call event faithfully.",
    k: ["Proxy vs back-to-back agent: a proxy is light and scales widely, while the back-to-back design gives full control and costs memory and processing for each call.", "Anchor media at the call control server vs let it flow directly between endpoints: anchoring enables recording and NAT fixing, direct media saves resources and latency."],
    p: ["A back-to-back agent drops a header or event it does not understand, silently breaking a feature the endpoints negotiated.", "Treating each leg's timers independently leaves one leg active after the other has failed."],
    v: "Make calls through the agent with hold, transfer and codec differences between legs and confirm every feature works end to end, in a capture matching legs carry consistent state, and teardown on either side ends both.",
    dep: ["dialog-layer","transaction-layer","sdp-offer-answer"]
  },
  "sdp-offer-answer": {
    s: "The exchange in which one side proposes media streams, codecs and addresses in a session description and the other selects among them.",
    d: "The caller's offer lists, per media stream, the address and port to send to, and codecs in preference order. The callee's answer picks a subset and gives its own address. Either can send a new offer mid-call to change codecs, hold or add streams. The text description is carried in the message body. The hard parts are rules about ordering and matching lines, offers in unusual places such as the acknowledgment, and devices that answer incorrectly.",
    k: ["Offer in the initial request vs delayed offer in the response: early offers speed setup, delayed offers let the callee choose codecs first and complicate interworking.", "Rewriting descriptions at the server vs passing them untouched: rewriting enables anchoring and NAT fixes, but must keep the parsing exact."],
    p: ["Answers listing a codec not offered cause one-way or no audio with no signaling error.", "A server re-sends a stale description on a re-INVITE and reverts a hold or a codec change."],
    v: "Capture a call with codec change and hold and confirm each offer and answer pair matches in stream order, the chosen codec appears in the actual RTP payload type, and the media addresses match packet source.",
    dep: ["sip-parser","codec-negotiation"]
  },
  "early-media-100rel": {
    s: "Reliable provisional responses and early media: delivering ringback, announcements and carrier messages before the call is answered.",
    d: "Provisional responses such as 180 Ringing are normally unreliable. The reliable extension numbers and acknowledges them so that media descriptions can ride in them. With a description in a 183 response, the caller hears audio from the network before answer: ringback tones, busy messages, or a menu. Gateways to the phone network depend on this. The difficulty is deciding who generates ringback, billing of calls not yet answered, and clipping the first words when answer and media are not coordinated.",
    k: ["Local ringback vs network ringback: local tone is predictable, while network ringback carries messages such as number changed that only the far side knows.", "Require reliable provisionals vs make optional: requiring ensures early media is accepted, but breaks with devices that do not support it."],
    p: ["Media starts flowing only after answer so the caller's first words are clipped.", "Early media with no ringback sends the caller silence and they hang up thinking the call failed."],
    v: "Call a destination that plays a network announcement before answer and confirm the caller hears it from the first second, then answers and the first word of the answerer is not clipped.",
    dep: ["sdp-offer-answer","transaction-layer","rtp-packetization"]
  },
  "event-subscriptions": {
    s: "The subscribe and notify mechanism through which one party asks to be told about changes in another's state: presence, dialog status, message waiting and registration.",
    d: "A watcher sends SUBSCRIBE for an event package with an expiry. The server answers, sends an initial NOTIFY with the current state, and then sends further notices on each change, until the subscription expires or is refreshed. Bodies carry the state in a defined format. Subscriptions create dialogs that live as long as the subscription. Hard parts are the scale of long-lived subscriptions and restoring them after a restart.",
    k: ["Full-state notices vs partial updates: full state is simple and robust to loss, partial updates save bandwidth and need sequence tracking.", "Per-resource subscriptions vs list subscriptions: lists reduce dialogs but require support in both the phone and the server."],
    p: ["After a restart no subscriptions exist and watchers do not know their state is stale.", "A watcher that never refreshes leaves a subscription consuming memory long after the phone is gone."],
    v: "Subscribe ten thousand watchers to changing resources, restart the server, and confirm watchers resubscribe within the target time and show correct state after the first notice.",
    dep: ["dialog-layer","state-store"]
  },
  "refer-and-replaces": {
    s: "The REFER request that asks another party to place a call, and the Replaces header that lets the new call take over an existing one, the basis of transfer and pickup.",
    d: "A transferor sends REFER to the transferee naming a target, optionally with a Replaces reference to an existing dialog. The transferee places the call, and notices of its progress come back as NOTIFY messages. With Replaces, the target ends its earlier call and joins the new one in place. Authorization is needed so an arbitrary party cannot cause a phone to dial anywhere. The difficulty is the many outcomes: target busy, refused, rejected by a carrier and each device handling subscriptions differently.",
    k: ["Accept REFER from any caller vs only from the dialog's party: any is easy and exposes dialing on behalf of others, restricted is safer.", "Follow REFER at the server vs pass it to the next hop: following keeps control and anchors media, passing is lighter and depends on far-end support."],
    p: ["A REFER to a premium-rate number from an untrusted source creates fraudulent calls billed to the victim.", "Missing progress notices leave the transferor unsure if the transfer worked and the call is dropped wrongly."],
    v: "Perform attended transfers with a Replaces target on both internal and trunk calls, and confirm the transferee reaches the target, old dialogs end cleanly, and records show the chain.",
    dep: ["dialog-layer","event-subscriptions","endpoint-authentication"]
  },
  "webrtc-gateway": {
    s: "Connects browser and app clients, which use WebSocket signaling and encrypted media with ICE, to the ordinary SIP and RTP side of the phone system.",
    d: "The gateway terminates the WebSocket carrying SIP or a similar protocol and translates it. On media it bridges between encrypted, multiplexed streams with ICE connectivity checks and the plain or SRTP streams the rest of the system uses, converting the wideband codec used by browsers as needed. Browsers require secure origins, user permission for the microphone and encrypted media. The difficulty is the mismatch between the two worlds: different codecs, feedback messages, key exchange and address discovery.",
    k: ["Gateway translating to ordinary SIP vs native WebRTC across the system: translating reuses the existing system, while native avoids the conversion cost and requires changing everything else.", "Anchor media in the gateway vs direct to a media server: anchoring simplifies firewall rules and adds a hop of delay."],
    p: ["Browser-only codec support forces a transcode for each call, raising CPU.", "ICE through a corporate firewall that blocks UDP falls to TCP relays, adding delay and jitter."],
    v: "Place calls from a browser to a desk phone through typical home and corporate network conditions and confirm audio works both ways, with measured delay and the connection type recorded.",
    dep: ["ice-negotiation","media-encryption","transcoder","sip-transports"]
  },
  "emergency-number-detection": {
    s: "Recognizing a dialed emergency number in any form, including with a prefix, and giving it priority and special handling before any normal routing rules apply.",
    d: "The dial plan checks for the local emergency numbers before every other rule, accounting for the prefix people dial to reach an outside line, so that both forms work. The match depends on the caller's country or site, not the system's home. Once detected, the call skips class-of-service limits, spend limits and call-screening rules. Detection must also work from every kind of endpoint, including remote and mobile users. The pattern match is easy; correctness across sites and roaming users is not.",
    k: ["Match emergency numbers first in the dial plan vs inside each site's rules: first is consistent and simple, per site lets rules reflect local numbers and risks omission.", "Match on the dialed digits only vs also on text from clients: digits catch every phone, client markers help applications that send the intent directly."],
    p: ["A site configured with a different country prefix does not match the local emergency number and the call fails.", "A catch-all rule above emergency detection sends the call to an auto attendant."],
    v: "On every site, dial each local emergency number with and without the outside-line prefix to the test destination that mimics responders, and confirm the call is routed with the right priority in every case.",
    dep: ["dial-plan-engine","number-normalization"]
  },
  "dispatchable-location": {
    s: "A record associating each phone, network port or access point with an address specific enough for responders to find the caller, such as building, floor and room.",
    d: "Each endpoint's location is stored: manually assigned for fixed desk phones, and derived from the switch port, subnet or wireless access point for others. The record is validated against an official address database and kept in sync when people move. Some jurisdictions require sending it with the call, and notifying a security desk. The challenge is data upkeep: moves, desk changes and remote workers make the table out of date faster than anyone updates it.",
    k: ["Automatic location from network topology vs manual assignment: automatic follows devices as they move, while manual is simple for fixed phones and goes stale.", "Civic address vs coordinates: addresses are what dispatchers use, while coordinates are precise outdoors and say little inside a building."],
    p: ["A phone moved to another floor still reports the old floor, and responders go to the wrong place.", "A remote worker's phone reports the office address, hundreds of kilometers away."],
    v: "Move a test phone to another switch port, wait the documented update time, place a test emergency call and confirm the transmitted location shows the new floor and room.",
    dep: ["extension-directory","location-discovery","config-database"]
  },
  "location-discovery": {
    s: "Working out where a mobile, remote or softphone user is when they call, from the network they connect through or from the device itself.",
    d: "Sources include the access point or switch the device is attached to, its IP address mapped to a registered site, a location reported by the client, and a prompt asking the user to confirm. Devices obtain location through network protocols that serve it with the address configuration. Accuracy varies widely, and confidence levels matter. For a remote worker, a self-declared address that is verified by calling the number may be required. It is hard because the best source differs by device and network.",
    k: ["Network-derived location vs user-entered: network-derived is automatic but coarse for VPN or home internet, user-entered is accurate and often outdated.", "Block calls when location is unknown vs allow with a warning: blocking meets strict rules but may prevent an emergency call, so most systems allow."],
    p: ["A VPN hides the user's real network and the system reports the corporate headquarters address.", "Mobile users are prompted for an address at login and never again, though they travel."],
    v: "Connect a softphone from the office, a registered home address and an unknown network, place test emergency calls from each and confirm the transmitted location source and confidence are correct for each.",
    dep: ["dispatchable-location","registrar"]
  },
  "emergency-routing": {
    s: "Choosing the right public safety answering point for the caller's location and delivering the call to it by a path that does not depend on the normal trunks.",
    d: "Based on the caller's location, the system selects the responder destination for that area, which may be through a dedicated emergency trunk, a location-routing service or the local carrier's emergency gateway. The call carries a callback number and location. Emergency calls bypass spend limits, fail over to any available trunk and are routed even when other trunks are saturated. A backup route to another provider is kept. The hard part is geography: one system serving many areas must route each call to the responders of the caller's area.",
    k: ["Dedicated emergency trunk vs the normal trunk with priority: a dedicated trunk is isolated and costs extra, a priority route shares capacity and can fail with the others.", "Location-based selection by the system vs delegated to the carrier: own selection allows control but needs a data service, delegating is easy and depends on the carrier's accuracy."],
    p: ["Every outbound channel is in use and the emergency call is rejected because it has no reserved capacity.", "A remote user's call is delivered to the headquarters' local responders, far from the caller."],
    v: "From each site, place a test call to the responder test number while all other channels are busy and confirm it connects, shows correct location and callback to the test center, and the center reports the right area.",
    dep: ["dispatchable-location","route-selection","sip-trunking"]
  },
  "callback-and-notification": {
    s: "Making sure responders can call back the caller, and that on-site security staff are told immediately that an emergency call was placed and from where.",
    d: "The caller ID on emergency calls is set to a number that reaches the caller or their desk, since the main company number would ring a receptionist. A callback route for each number is kept for a period so that a dropped call can be returned to the right person. The system also sends an alert by email, message or desk screen with the caller and location so staff can meet the responders. Calls to multi-line systems and forwarded numbers make callback ambiguous.",
    k: ["Direct number as callback vs main number: direct reaches the person and needs a number for every user, main is simple and reaches nobody useful.", "Alert on every call including tests vs only live: alerting always is simple, but test calls cause false alarms that people learn to ignore."],
    p: ["Callback to a shared main number connects the responder to an auto attendant.", "Notifications go to a mailbox nobody checks outside office hours."],
    v: "Place a test emergency call, hang up, call the presented callback number from outside and confirm it rings the user's phone, and confirm the security notification arrived within a minute with correct location.",
    dep: ["number-translation","dispatchable-location","event-bus"]
  },
  "emergency-testing": {
    s: "Regular, coordinated test calls that prove emergency calling works from every site and device type, including after changes.",
    d: "Because live emergency numbers cannot be used casually, systems use test numbers operated by the responder authority or a carrier service, and scheduled windows. Tests cover each site, device class, remote user and failover path, and verify the delivered location and callback. They are repeated after any change to the dial plan, trunks or location data. Results are retained as evidence for regulators. The difficulty is coverage and discipline: tests must be run, and run at the points where changes were made.",
    k: ["Scheduled tests of everything vs tests triggered by change: scheduled catches drift, triggered catches regressions sooner, and most operators need both.", "Test with a service number vs live numbers with notice: service numbers are free of risk, and live tests reveal true behavior and burden responders."],
    p: ["A dial plan edit breaks emergency calls from one site and nobody tests for six months.", "Test calls always come from one phone, so devices of other types are never exercised."],
    v: "After each dial plan or trunk change, run the automated test for every site and device class and confirm each reaches the test responder with correct location and callback, storing the results with timestamps.",
    dep: ["emergency-routing","synthetic-test-calls"]
  },
});
