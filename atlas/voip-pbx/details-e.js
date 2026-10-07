// Details for the VoIP & PBX plate, part 5: security, platform and scaling, cross-cutting concerns.
ATLAS.details("voip-pbx", {
  "sip-over-tls": {
    s: "Carrying SIP signaling inside TLS connections so messages are encrypted and the server, and optionally the client, are authenticated by certificate.",
    d: "Endpoints open a TLS connection to the server, which presents a certificate matching its name. Mutual authentication adds a client certificate. Signaling over the connection is protected from eavesdropping and tampering, hiding credentials and numbers. It also keeps the connection open for return traffic through NAT. The cost is memory per connection, handshake CPU after outages, and certificate management for every device. Many phones have old TLS libraries or small trust stores, which is where most deployments struggle.",
    k: ["Server certificate only vs mutual TLS: server-only is easy to deploy and relies on passwords for clients, mutual is strong and requires issuing and rotating a certificate to every device.", "Public certificate authority vs private: public is trusted by default and costs per name, private gives control and requires installing the root on every phone."],
    p: ["An expired server certificate stops every phone from registering at once.", "Phones that skip certificate verification accept any server, which defeats the encryption against active attackers."],
    v: "Connect with a client that checks certificates and confirm the handshake succeeds with the right name, fails with a wrong name or expired certificate, and a capture shows no readable SIP text.",
    dep: ["sip-transports"]
  },
  "media-encryption": {
    s: "Encrypting and authenticating voice packets with SRTP, with keys agreed through the signaling or a handshake in the media path.",
    d: "SRTP encrypts the RTP payload and adds an authentication tag, leaving headers readable for routing. Keys are exchanged in the session description, which must itself be protected by TLS, or through a handshake on the media path, which browser clients use. Key exchange adds setup time. Devices in the middle that process media, such as mixers and recorders, must hold keys, which makes them part of the trusted base. Compatibility is the pitfall: devices supporting different key methods cannot connect without a gateway.",
    k: ["Keys in signaling vs key exchange on the media path: signaling keys are quick and need protected signaling, media-path exchange is independent and adds a handshake.", "Encrypt everything vs only across untrusted networks: everything is simple and consistent and spends CPU on trusted links, selective needs careful boundaries."],
    p: ["Keys sent in signaling over unencrypted transport let an eavesdropper decrypt everything.", "A gateway silently falls back to plain RTP when encryption negotiation fails and nobody notices."],
    v: "Capture a call, confirm payloads are not decodable as audio, verify the same call decodes with the session key in a test tool, and force a negotiation failure to confirm the call is refused rather than sent in clear.",
    dep: ["sip-over-tls","rtp-packetization","sdp-offer-answer"]
  },
  "scanner-defense": {
    s: "Detecting and blocking the automated scans and password guessing that hit every public SIP address within hours of exposure.",
    d: "Internet scanners send OPTIONS, REGISTER and INVITE messages to every address, guessing extensions and passwords. Defense tracks failed authentications and unknown-user responses by source and bans offenders for a period, removes tell-tale differences between 'no such user' and 'wrong password', and avoids listening on standard ports where possible. Bans are enforced in the firewall. The hard part is false positives, because many phones behind one translator share an address and one broken phone can lock out an office.",
    k: ["Ban by source address vs by account: address bans stop scanners and punish shared addresses, account locks protect users and let attackers lock out real ones.", "Same response for unknown user and wrong password vs distinct: identical hides which extensions exist and makes support harder."],
    p: ["A misconfigured phone with the wrong password triggers the ban of the whole branch's address.", "Distributed scanners use many addresses and stay below any per-address threshold."],
    v: "Run a scripted guessing attack from one address and confirm it is blocked within the threshold while a legitimate phone from another address registers; check failed attempts across many addresses trigger an account-level alert.",
    dep: ["endpoint-authentication","rate-limiting-acls"]
  },
  "toll-fraud-detection": {
    s: "Spotting abnormal calling, such as sudden volumes to expensive destinations or at odd hours, that indicates a compromised account or system.",
    d: "A detector consumes call records in near real time and compares per-account behavior to a baseline: destination mix, call rate, duration, and time of day. Rules flag patterns known from fraud, such as many short calls to premium numbers or international destinations the account never used. Action ranges from alert to blocking outbound calls on the account. Fraud usually happens at night and weekends, so automatic response matters. Tuning is hard: legitimate seasonal bursts look like fraud.",
    k: ["Automatic blocking vs alert for humans: automatic stops losses at once and blocks real traffic on false alarms, alerting is safer and can be too slow at 3 a.m.", "Per-account baselines vs fixed global rules: baselines adapt to each customer and need history, global rules are immediate and crude."],
    p: ["Fraud runs all weekend because alerts went to an email address nobody reads on Saturday.", "A conference that all employees join by international dial-in triggers blocking on legitimate traffic."],
    v: "Replay a recorded fraud pattern of premium-destination calls against a test account and confirm the detector raises an alert and applies the block within the configured minutes, then confirm the account recovers after review.",
    dep: ["cdr-billing","event-bus","spend-limits"]
  },
  "spend-limits": {
    s: "Hard caps on how much an account can spend or how many concurrent outbound calls it can have, per day and per destination class.",
    d: "Real-time counters accumulate cost per account, tenant and destination category, and call setup checks them before routing. When a cap is reached the system rejects further expensive calls or switches the account to a restricted class. Concurrent channel limits stop floods. Counters must work across a cluster, so they are kept in a shared store with atomic increments. The challenge is that cost is known only after the call, so long calls overrun the limit unless checked during the call.",
    k: ["Check at setup only vs also during the call: setup only is simple and lets long calls exceed the cap, in-call checking ends them at the limit and complicates state.", "Hard stop vs warning: hard stop bounds the loss, a warning avoids cutting a business off in an important call."],
    p: ["Counters kept per node let an attacker spread calls over nodes and multiply the intended cap.", "Limits are reset at midnight in the server's time zone, a day boundary that fraud schedules around."],
    v: "Set a small daily cap on a test account, place calls up to the cap and confirm the next costly call is rejected with the right cause, an allowed cheap call still works, and counters agree across nodes.",
    dep: ["state-store","class-of-service","cdr-billing"]
  },
  "rate-limiting-acls": {
    s: "Allowing only known source addresses to reach sensitive services and capping how fast any source may send requests, protecting against floods and abuse.",
    d: "Access lists in firewalls and the border controller admit carrier and customer addresses to trunk ports and keep management interfaces off the internet. Rate limits cap messages and new calls per second per source, per account and per trunk. Excess is dropped or answered with an error. Limits are applied in layers from the network edge to the application. Setting thresholds requires knowing real traffic; too low rejects bursts, such as a morning when phones register together.",
    k: ["Limit at the network edge vs inside the application: the edge is cheap and blind to accounts, the application sees identity and costs processing for every message.", "Static address lists vs dynamic lists from authentication: static is simple and brittle with changing carriers, dynamic follows authenticated peers and needs integration."],
    p: ["A limit tuned to normal traffic blocks the morning registration burst of a large office.", "Management ports left reachable from the internet are found and attacked."],
    v: "Send traffic above the configured rate from a test source, confirm excess is rejected and counted, normal clients are unaffected, and confirm an external port scan finds none of the management ports.",
    dep: ["session-border-controller","sip-parser"]
  },
  "robocall-screening": {
    s: "Detecting and blocking unwanted automated or spoofed inbound calls using attestation results, reputation data, behavior and user lists.",
    d: "Inbound calls are scored from several signals: verification result of the caller ID signature, reputation of the number and carrier, calling pattern such as bursts of short calls from one range, and the customer's own block lists. Actions are block, divert to voicemail, challenge the caller with a menu, or label. Behavior analysis runs on call records. It is an arms race, so data must be refreshed. The cost of false positives is high: a blocked call from a customer or a hospital is a real harm.",
    k: ["Block at the network vs label for users: blocking protects everyone and risks lost real calls, labeling informs and relies on users to act.", "Challenge unknown callers vs allow: challenge stops most automation and adds friction for real callers."],
    p: ["A legitimate appointment-reminder service gets blocked because its calls look like a robocall burst.", "Spoofed numbers that match a customer's own range pass because screening trusts internal-looking numbers."],
    v: "Replay a labeled sample of known robocalls and legitimate calls and measure the block and false-positive rates against targets, then confirm a blocked call is logged with the reason and can be reviewed.",
    dep: ["caller-id-attestation","cdr-billing","session-border-controller"]
  },
  "state-store": {
    s: "A shared fast store for registrations, call state, counters and queue positions, so any node in the cluster can serve any call.",
    d: "Typically an in-memory data store reachable by all signaling and media control nodes, with replication to a standby. Keys include registrations with expiry, dialogs, parked calls, queue entries and spend counters. Operations must be fast, often within a millisecond, and atomic for counters. It becomes critical to every call, so its availability, memory sizing and consistency under network partitions decide how the whole system behaves during failure. The tradeoffs are spelled out by whether calls survive a node loss.",
    k: ["Shared store vs state kept in each node with replication: shared is simple to reason about and is a dependency, local state is fast and complicated to keep consistent.", "Persist to disk vs memory only: persistence survives a full restart and costs write latency, memory only is fast and relies on re-registration."],
    p: ["A partition splits the store and two nodes both believe they own a parked call, so it is delivered twice.", "Memory fills with long-expired entries because expiry was never set on some keys."],
    v: "Kill the primary store node during active load and confirm failover completes within the target, no more than the documented calls are lost, registrations remain findable, and counters stay within tolerance.",
    dep: ["high-availability"]
  },
  "config-database": {
    s: "The durable relational store of everything an administrator configures: users, numbers, routes, devices, features and tenants.",
    d: "A transactional database holds configuration with constraints that prevent contradictory settings, such as the same extension twice in a tenant. Call control does not query it per call; it loads a cached snapshot or reads through a cache and is told to reload on change through the event bus. Replication provides standby copies. Schema changes must be rolled out alongside software versions. The challenge is separating the durable truth from the fast copies the call path uses, and making them agree.",
    k: ["Query per call vs cache with reload: querying is always fresh and puts the database in the call path, caching is fast and must be invalidated correctly.", "One database for all tenants vs one per tenant: one is simple to run and risks cross-tenant mistakes, many isolate and multiply operations."],
    p: ["A slow database blocks call setup because routing queries it directly during an incident.", "A schema migration runs while old servers still run, and they crash on a column they do not know."],
    v: "Make a configuration change, confirm all call servers reflect it within the stated time, then stop the database and confirm calls continue with the cached configuration and no new changes are accepted until it returns.",
    dep: ["high-availability"]
  },
  "event-bus": {
    s: "A message channel carrying call events, configuration changes and state notifications between components, so they stay loosely coupled.",
    d: "Components publish events such as call started, answered, ended, agent state changed or configuration reloaded, and others subscribe. Consumers include records, fraud detection, wallboards, integrations and monitoring. A durable queue keeps events for slow or restarted consumers; a lightweight pub-sub is used for real-time notices that may be lost. Ordering within a call matters. The challenge is volume at peak and reliability: records need guaranteed delivery, while a lamp update does not.",
    k: ["Durable queue vs fire-and-forget pub-sub: durable guarantees delivery and adds latency and storage, fire-and-forget is fast and loses events for absent consumers.", "One bus for all events vs separate for billing and real-time: one is simple, separate prevents a flood of status events delaying billing records."],
    p: ["A slow consumer backs the queue up until it runs out of disk and stops publishers.", "Events arrive out of order, and a call-ended record is processed before its call-started record."],
    v: "Generate a peak event rate for ten minutes, stop one consumer midway, restart it and confirm it receives every event in order for each call, and that publishers' latency stays within target.",
    dep: ["high-availability"]
  },
  "high-availability": {
    s: "Keeping service running through the loss of a server, link or site, by redundancy and automatic takeover of addresses, state and duties.",
    d: "Pairs or clusters use a floating address, health checks and a failover trigger. Signaling nodes are interchangeable, with state in a shared store. Media servers and relays are pooled, and calls on a failed media node usually drop unless streams are re-established. Standby sites take over with DNS or routing changes. The planning question is which calls survive: new calls recover quickly and in-progress calls may not. Testing failover regularly is the difference between a design and a hope.",
    k: ["Active-active vs active-standby: active-active uses all capacity and recovers faster and is complex to keep consistent, standby is simple and idles half the hardware.", "Preserve in-progress calls vs only recover new ones: preserving needs media and state replication at high cost, recovering new calls is cheap and drops existing ones."],
    p: ["A split brain leaves both nodes holding the floating address and traffic flips between them.", "Standby has never carried load and fails when it is first needed because of a configuration drift."],
    v: "Power off the active node during load and measure time until new calls succeed and the number of calls dropped, repeat for every component class, and compare with the stated targets.",
    dep: ["state-store","sip-load-balancing","dns-srv-routing"]
  },
  "sip-load-balancing": {
    s: "Spreading incoming signaling across several servers, in a way that keeps each call's messages on the node that holds its state or can reach it.",
    d: "A balancer at the front hashes on the call identifier or user so all messages of a call and its registration go to the same node, or forwards statelessly to any node that finds state in the shared store. It health-checks nodes and removes failed ones. Plain network balancers do not understand SIP, so dedicated ones are used. Phones using persistent connections need connection-level balancing. Hard parts are hot spots, such as a large tenant on one node, and rebalancing after nodes join.",
    k: ["Hash by call identifier vs by user: call hash balances evenly, user hash keeps a user's registrations and calls together at the risk of hot spots.", "Stateless any-node routing vs sticky: stateless recovers simply and needs a fast shared store, sticky is fast and loses state with the node."],
    p: ["After a node is added the hash changes and mid-call messages go to a node that has no state for them.", "The balancer is itself a single point of failure with no standby."],
    v: "Run a stream of calls through the balancer, add and remove a node during the run, and confirm mid-call requests such as hold and hangup reach the right node for every call, with zero stuck calls afterward.",
    dep: ["state-store","dns-srv-routing","sip-transports"]
  },
  "geo-distribution": {
    s: "Placing signaling and media components in several regions so calls use nearby resources, and so a regional failure does not remove service for everyone.",
    d: "Users register at their nearest edge, media relays and servers are in regions, and data stores are replicated across them. A call between regions crosses the backbone, and media may be relayed in the region of each party. Routing picks the local carrier trunks to avoid carrying calls halfway across the world before sending them out. Numbers and users are homed in a region. Hard parts are replicating state across distances and deciding which region owns a user when links break.",
    k: ["Home each user in one region vs allow any region to serve: homing is simple and limits consistency problems, any-region survives failures and requires global state.", "Local breakout to carriers vs central trunks: local reduces delay and cost per call and multiplies carrier contracts and emergency routing rules."],
    p: ["Cross-region replication lag makes a user appear unregistered for seconds after a move.", "Media relays are chosen by the signaling server's location, not the user's, and add long delays."],
    v: "Call between users in different regions and confirm media is relayed in or near each region, one-way delay is within the design limit, and shut a region to confirm its users register elsewhere within the target.",
    dep: ["state-store","media-relay","dns-srv-routing"]
  },
  "dns-srv-routing": {
    s: "Using DNS records to find which servers handle a domain's SIP service, their ports, transports, priority and weight, and to fail over between them.",
    d: "A client resolves a service name to NAPTR records that name the available transports, then SRV records that list servers with priority and weight, then address records. It tries servers in priority order, picking among equals by weight, and moves to the next on failure. Carriers use the same mechanism to find your edge. TTLs control how fast a change spreads. The hard parts are devices that ignore SRV, caching that outlives a failover, and the many round trips of resolution at call setup.",
    k: ["Rely on SRV failover at clients vs on a floating address: SRV works across sites and depends on client behavior, a floating address is invisible to clients and limited to one network.", "Short TTLs vs long: short TTLs allow quick changes and add query load and failure risk if the resolver fails, long TTLs are stable and slow to change."],
    p: ["Phones that resolve only address records ignore the failover servers you listed in SRV.", "A long TTL on a record means decommissioned servers keep receiving traffic for hours."],
    v: "Disable the primary server and measure how long until each phone model and carrier reaches the secondary through SRV, repeating after changing records to confirm the observed times match the TTLs.",
    dep: []
  },
  "realtime-scheduling": {
    s: "Operating system and hardware settings that make packet-forwarding and audio processing meet their timing, such as priorities, dedicated cores and tuned timers.",
    d: "Media processing needs a packet out every 20 ms per stream with little variance, so media servers run with elevated priority, pinned cores, fine-grained timers and isolation from noisy neighbors. Virtualized hosts add scheduling delay unless resources are reserved. Network cards use interrupt tuning or kernel-bypass to reach high packet rates. Power saving states and garbage collection cause pauses. Capacity is limited by packets per second and not just bandwidth, since voice packets are small.",
    k: ["Dedicated cores and reserved resources vs shared hosts: dedicated is predictable and wastes capacity, shared is cost-efficient and shows jitter under contention.", "Kernel networking vs kernel bypass: kernel is simple and supports modest rates, bypass reaches very high packet rates and removes the usual tools."],
    p: ["A noisy neighbor on a shared virtual host introduces delay spikes that look like network jitter.", "Power-saving CPU states raise wake-up latency and cause irregular packet timing at low load."],
    v: "Run the media server at its rated load, record inter-packet departure times for sampled streams and confirm the 99th percentile deviation from 20 ms stays within the target, repeat while another process uses all CPUs.",
    dep: []
  },
  "rolling-upgrades": {
    s: "Updating software on nodes one at a time, draining calls from each first, so the system never goes down and no user notices.",
    d: "A node is marked draining, so the balancer stops sending it new calls and registrations. Existing calls finish naturally, or are moved if the system supports that, and the node is upgraded and returned to service. Then the next node. Mixed versions run side by side during the upgrade, so protocols between components and schema changes must be backward compatible. Long calls and conferences block draining, so a time limit applies. Rollback needs the same care as upgrade.",
    k: ["Wait for calls to end vs force-migrate or drop: waiting is safe and slow, forcing is fast and interrupts people.", "Backward-compatible changes in two phases vs a coordinated cutover: two-phase allows rolling and takes longer, cutover is simple and needs downtime."],
    p: ["A node with a six-hour conference never drains and holds up the whole upgrade.", "A new version writes state in a format old nodes cannot read, and the first upgraded node breaks calls on its neighbors."],
    v: "Upgrade a cluster under steady call load and confirm zero failed new calls and no dropped calls beyond those marked for forced migration, and that every node reports the new version afterward.",
    dep: ["sip-load-balancing","high-availability","state-store"]
  },
  "latency-budget": {
    s: "The total one-way delay a conversation can tolerate, about 150 ms to feel natural, divided among codec, packetization, network, buffers and every device in between.",
    d: "Every stage spends part of a small budget: codec frame and lookahead, packetization, access network, the wide-area path, the jitter buffer, relays, transcoders and mixers. A few extra tens of milliseconds at each of several hops add up to noticeable delay, talk-over and echo. Decisions such as anchoring media, transcoding, relaying through a distant region or deep jitter buffering each cost from the same budget. The budget is allocated at design time and measured per call afterward.",
    k: ["Spend delay on robustness vs on responsiveness: bigger buffers and relays make calls more tolerant of damage and push conversation toward walkie-talkie turns.", "Central media handling vs regional: central is simple and detours audio, regional keeps delay low and multiplies deployments."],
    p: ["Each component is individually acceptable and the sum on international calls exceeds the comfort limit.", "Delay is measured only by network ping, ignoring codec and buffers, which together are larger."],
    v: "Measure mouth-to-ear delay with a loopback test on representative internal, trunk and international calls, and compare against the budget table for each stage.",
    dep: ["jitter-buffer","voice-codecs","media-relay","transcoder","geo-distribution"]
  },
  "interoperability": {
    s: "Voice systems must work with phones, carriers and applications from many makers whose reading of the standards differs, so compatibility is a continuous cost.",
    d: "The standards allow many options and leave details to interpretation, so each pair of devices tests different corners. Interoperability is handled by profiles, normalization rules, negotiated extensions and fallbacks, plus a lab with real equipment. New firmware and carrier changes keep shifting it. It shapes where the system is strict, what it logs and how it adapts. Decisions here appear throughout: header handling, codec policy, transfer methods, and fax and DTMF modes.",
    k: ["Strictly follow the standard vs be liberal in what you accept: strict gives predictable behavior and rejects devices that nearly work, liberal keeps calls working and accumulates workarounds.", "Support wide ranges of devices vs certify a short list: wide serves customers and raises support costs, a certified list is dependable and limits choice."],
    p: ["A firmware update changes a device's behavior and an unrelated feature breaks days later.", "A workaround for one carrier becomes permanent and nobody knows why it exists."],
    v: "Maintain a matrix of devices and carriers against a fixed suite of call scenarios, run it on every release and firmware update, and require no regression before rollout.",
    dep: ["device-profiles","signaling-normalization","codec-negotiation","sip-parser"]
  },
  "state-and-failover": {
    s: "Where call and registration state lives decides which failures calls survive, how the cluster scales and how recovery behaves.",
    d: "State may live in the endpoint, in the signaling node, in a shared store or in the media server. Each choice sets what is lost when a node dies: with node-local state calls tied to it drop, with a shared store signaling continues and media streams usually still break. State also determines load balancing, upgrade procedure and what a restart storm looks like. The decision is made once and shows up in queue, parking, conference, subscription and registration design.",
    k: ["Stateless nodes with shared state vs stateful nodes: stateless recovers by moving traffic and depends on the store, stateful is fast and loses state with the node.", "Protect in-progress calls vs only new calls: protecting needs replication of media and signaling state, which is costly and justified only for critical services."],
    p: ["Teams assume calls survive a failover because signaling does and discover the media streams dropped.", "State grows without expiry until memory exhaustion causes the outage the redundancy was built to prevent."],
    v: "Fail each class of component under load in a test environment and record what happens to registrations, active calls, queued callers and conferences, then compare with the documented promises.",
    dep: ["state-store","high-availability","dialog-layer","call-queue","registrar"]
  },
  "trust-boundaries": {
    s: "Where the system trusts a message, address or identity, and where it does not, determines authentication, encryption, filtering and which components may see media or credentials.",
    d: "Boundaries run between phones and the server, between the server and carriers, between tenants, and between the system and administrators. At each, the system decides what to verify: credentials, source address, certificates, signatures on identity. Components such as recorders, mixers and border controllers are trusted with plaintext media. A boundary is weakest where convenience was chosen, such as open ports for easy provisioning, shared passwords or trusted internal networks that include compromised devices.",
    k: ["Trust the internal network vs authenticate everything: trusting is simple and fails when one device is compromised, authenticating everywhere costs configuration and limits damage.", "Terminate encryption at the border vs end to end: border termination allows inspection and recording, end to end protects against the operator and prevents server features."],
    p: ["A single trusted internal address range is also used by guest wireless, and any visitor can place calls.", "Provisioning credentials stored in clear in configuration files are readable by anyone on the voice network."],
    v: "Attempt calls and registrations from each untrusted position, such as the guest network, an unknown internet address and another tenant, and confirm each is rejected at the intended boundary and logged.",
    dep: ["endpoint-authentication","session-border-controller","sip-over-tls","media-encryption","multi-tenancy"]
  },
  "regulatory-obligations": {
    s: "Telephony is regulated: emergency calling, recording consent, caller identity, lawful interception, data retention and number handling carry legal duties that vary by country and sometimes by city.",
    d: "Rules decide what must work (reaching emergency services with location), what must be announced (recording), what must be kept (call records, recordings) and what must be deleted. They also cover caller ID authenticity, accessibility services and lawful interception support. Obligations differ per jurisdiction, and a system spanning several must apply the right ones per call. They shape the design: location data in the model, consent in the call flow, retention in storage, and audit logs of access.",
    k: ["Build compliance into the core vs add per-market modules: core is consistent and slows entry to new markets, modules adapt to local rules and risk gaps.", "Keep records longest permitted vs shortest required: long supports disputes and investigations and expands liability, short limits exposure."],
    p: ["The system is sold in a new country and emergency calling is not configured for it.", "Retention deadlines differ between recordings and call records and one is kept far too long."],
    v: "For each market, walk the compliance checklist with test calls: emergency, recording consent, caller identity, retention and deletion, and keep the dated results as evidence for auditors.",
    dep: ["emergency-routing","consent-announcements","recording-storage","caller-id-attestation","cdr-billing"]
  },
  "capacity-model": {
    s: "Planning how many concurrent calls, registrations and call setups per second each component can carry, since voice capacity limits are sharp and failures appear as rejected or garbled calls.",
    d: "Capacity is counted in different units: registrations, calls per second at setup, concurrent calls, media streams and packets per second, transcoding channels, trunk channels and queue positions. The binding limit is usually the least obvious one, such as packets per second on the media node or the carrier's calls-per-second limit. Peak patterns come from business events and from outages that trigger every phone to re-register. Load tests and per-call resource figures turn forecasts into node counts and headroom.",
    k: ["Plan for average load vs for peak plus failure of a node: average is cheap and fails at peak, planning for peak with a node lost needs more hardware and keeps service during failure.", "Hard limits that reject calls cleanly vs letting quality degrade: rejecting protects existing calls and users see failure, degrading serves more calls badly."],
    p: ["Capacity is sized on call count, and a pool of transcoded or recorded calls saturates the media nodes far earlier.", "Registration storms after an outage exceed the registrar capacity that was sized for steady state."],
    v: "Load-test each component to its limit with realistic call mix, record the point where quality degrades or calls are rejected, and check the production headroom against forecast peak with one node lost.",
    dep: ["media-server","registrar","sip-trunking","transcoder","realtime-scheduling"]
  },
});
