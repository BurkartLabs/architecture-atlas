// Details for the firewall plate, part 7: packet path and capture, cross-cutting concerns.
ATLAS.details("firewall", {
  "interfaces-and-vlans": {
    s: "The physical ports, virtual interfaces, VLAN subinterfaces, aggregates and tunnels through which traffic enters and leaves, each assigned to a zone and carrying addresses.",
    d: "Frames arrive on physical ports, possibly bundled into aggregates, and are demultiplexed by tag into logical subinterfaces. Each logical interface has addresses, a zone, a maximum frame size and a role such as routed or bridged. Link state changes are reported to routing and monitoring. Virtual and tunnel interfaces behave the same way for policy. The challenge is correctness of the mapping: a wrong tag or zone assignment places a network in the wrong trust level, and mismatched frame sizes cause hard-to-find drops.",
    k: ["Subinterfaces per VLAN on one trunk vs one physical port per network: trunks save ports and cabling, but concentrate failure and bandwidth on one link.", "Zone assigned per logical interface vs per physical port: logical assignment gives fine control, but increases the chance of misassignment."],
    p: ["A VLAN tag typo places a sensitive network in a low-trust zone and its policy silently applies.", "Different maximum frame sizes on two sides drop large packets while small ones pass."],
    v: "Send tagged traffic on each VLAN and confirm it arrives on the intended logical interface and zone, appears in per-interface counters, and untagged or unknown tags are dropped and counted.",
    dep: []
  },
  "ingress-sanity": {
    s: "Early checks on every arriving packet: header length and checksum validity, impossible flag and address combinations, spoofed sources and martian addresses, discarded before policy.",
    d: "Before classification the device checks that lengths are consistent, versions and header fields are valid, checksums verify where needed, and addresses are legal for the arrival interface. Anti-spoofing compares the source with what the route table says should arrive on that interface. Bogon and loopback sources, and broadcast abuse, are dropped. Failures increment named counters. Cheap checks first protect the later stages, but the challenge is false drops under asymmetric routing and unusual but valid traffic.",
    k: ["Strict reverse-path check vs loose: strict stops most spoofing, but drops legitimate traffic on asymmetric or multihomed paths.", "Drop malformed packets silently vs log them: silent drop saves cycles during attacks, while logging aids detection and is a flood vector."],
    p: ["Strict reverse-path filtering on a multihomed edge drops legitimate return traffic that arrives on a second link.", "Checks skipped on the fast path let malformed packets reach parsers that assume sanity."],
    v: "Send packets with a bad checksum, an inconsistent length, a loopback source and a spoofed internal source on an external interface, and confirm each is dropped with its own counter and none reaches policy.",
    dep: ["interfaces-and-vlans", "routing-integration"]
  },
  "hook-points": {
    s: "The defined places in the forwarding path where the firewall inspects packets, such as before routing, after routing, on input to the host, forwarding and output, each with its own rule chains.",
    d: "A packet travels a fixed path: arrival, pre-routing hooks where destination translation happens, a routing decision that splits it toward the device itself or onward, forward or local-input hooks where policy is applied, and post-routing hooks where source translation happens before transmit. Each hook runs its chains in priority order. Knowing which hook a rule sits at tells which fields are valid. The challenge is the number of places, and that rules placed in the wrong hook do nothing.",
    k: ["Many specific hooks vs one policy point: many hooks give flexibility and give each feature the right view, but make behavior depend on a map nobody remembers.", "Chains with priorities vs one linear table: priorities let subsystems add rules independently, while one table is simpler to reason about."],
    p: ["A deny placed in the output hook does not apply to forwarded traffic, and the administrator assumes it does.", "Two components add rules at the same priority, and the order between them changes between boots."],
    v: "Insert a counting rule at each hook and send a forwarded, an inbound and an outbound packet; confirm exactly the expected hooks count each, in the documented order.",
    dep: ["routing-integration", "ingress-sanity"]
  },
  "routing-integration": {
    s: "How forwarding decisions interact with policy: the route lookup that picks the egress interface, policy-based routing, and what happens to packets with no route.",
    d: "The route lookup gives the next hop and egress interface, which determine the egress zone used by policy. Policy-based routing can choose a table by source, mark or application. Dynamic routing protocols run on the device and are themselves governed by policy. Asymmetric routes can send replies elsewhere, which breaks state tracking. The difficulty is ordering: the egress zone is not known until the route lookup, and route changes during a flow can move it to another zone mid-session.",
    k: ["Route lookup before policy vs after: before gives rules the egress zone, while after matches the original destination and avoids dependence on routes.", "Policy-based routing on marks vs static routes only: marks allow application- or user-based paths, but make routing depend on classification results."],
    p: ["A route change moves an existing flow to a different egress zone and the established entry no longer matches policy.", "A default route pointing at the wrong interface sends internal traffic out unfiltered or into a black hole."],
    v: "Send traffic to destinations in each zone, confirm the packet trace shows the route, egress interface and zone, then change a route and confirm new flows use the new egress and the old flows follow the stated behavior.",
    dep: ["interfaces-and-vlans"]
  },
  "bridge-mode": {
    s: "Operating as a transparent layer-two device with no addresses on the path, filtering the traffic that passes between two segments without changing the network design.",
    d: "The firewall sits between two switch ports or inside one segment, learns hardware addresses like a bridge and forwards frames after policy. Neighbors do not see it as a router, so no renumbering or routing changes are needed. Rules operate on interface pairs and can see non-IP frames. It is easy to insert and remove. The challenge is loops and visibility: multiple bridges form loops without spanning tree support, and the device has no address to be managed or to answer error messages.",
    k: ["Transparent bridge vs routed firewall: bridge inserts without readdressing and is invisible to hosts, while routed gives routing, translation and clear boundaries.", "Pass spanning tree and discovery frames vs consume them: passing keeps the network's loop prevention intact, but lets neighbors see through the device."],
    p: ["A second path around the bridge forms a loop that floods the network and takes everything down.", "The device cannot translate addresses or terminate services, and operators expect features that exist only in routed mode."],
    v: "Insert the device between two hosts without changing their addresses, confirm traffic flows and a denied service is blocked, then connect a second path and confirm the loop is prevented by the configured mechanism.",
    dep: ["interfaces-and-vlans", "hook-points"]
  },
  "local-traffic-path": {
    s: "The path for packets addressed to or originated by the firewall itself, such as management, routing protocols and logging, filtered by separate rules from transit traffic.",
    d: "At the routing decision, packets for a local address go to the input hook and on to local services, and the device's own packets pass the output hook. Rules here restrict which sources may reach management, routing, discovery and time services, per interface. Some devices apply a separate control-plane policy or rate limits to protect the processor. The challenge is that this is the attack surface of the device itself, and mistakes either lock out operators or expose services to untrusted networks.",
    k: ["Explicit allow list for each local service vs open on trusted zones: explicit lists are safe and need maintenance, while zone-wide openings are easy and exposed to anything in the zone.", "Control-plane rate limits vs none: limits keep the processor responsive under flood, but may starve legitimate management or routing."],
    p: ["A new management service starts listening on all interfaces and is reachable from the internet before anyone writes a rule.", "Rate limits on local traffic drop routing protocol packets under attack and the neighbors reset."],
    v: "From each zone, probe every local service port and confirm only the allowed zone reaches management, and a flood toward the device does not delay a routing protocol keepalive.",
    dep: ["hook-points", "security-zones"]
  },
  "rate-limiting": {
    s: "Capping the packet or byte rate of selected traffic with token buckets or policers, to contain floods, protect services and shape bandwidth between classes.",
    d: "A policer admits traffic at a configured rate with a burst allowance and drops or marks the excess; a shaper queues it and releases it at the rate. Limits apply per rule, per source, per zone or to control-plane traffic. Counters show conformance. They are used against floods and for fairness between users. The challenge is placement and distribution: per-core buckets split a limit unevenly, a limit applied after expensive processing does not save the CPU, and policers drop bursts that shapers would absorb.",
    k: ["Policing vs shaping: policing is cheap and drops excess immediately, while shaping smooths bursts at the cost of queues and delay.", "Limit early vs late in the path: early limits save processing for dropped packets, while late limits can use richer classification."],
    p: ["A per-core limit divides the total rate by core count and allows a single flow only a fraction of it.", "A limit on ICMP also drops path discovery messages, and large transfers stall."],
    v: "Send traffic at twice a configured rate and confirm the measured forwarded rate settles near the limit with the burst honored, the excess counter matches the dropped volume and other traffic is unaffected.",
    dep: ["hook-points", "flow-core-affinity"]
  },
  "egress-processing": {
    s: "The final stage before transmission: source translation, outbound policy, queueing, quality-of-service marking and checksum or segmentation handling by the interface.",
    d: "After policy, the packet takes post-routing treatment: source translation, rewriting of quality-of-service code points, queue selection and optional shaping. The interface may finish checksums or segment large packets. Packets exceeding the outgoing maximum size are fragmented if allowed or answered with an error. Transmit completion returns the buffer to its pool. It is hard because actions here can still change the packet after policy decided, and errors at this stage have no later check.",
    k: ["Mark and shape on egress vs ingress: egress sees the final path and congestion state, while ingress acts before spending resources on traffic that will be dropped.", "Fragment oversize packets vs return an error: fragmenting keeps traffic flowing but invites inspection problems, while an error makes the endpoint adjust its size."],
    p: ["Packets larger than the egress maximum are dropped and the error message is filtered, causing black holes.", "Translation applied at egress changes a packet that logging recorded with the pre-translation address only."],
    v: "Send packets near and above the egress maximum size and confirm the configured outcome of fragmentation or error return, and verify the translated source and marking in a capture on the outgoing link.",
    dep: ["source-nat", "rate-limiting", "packet-buffer-pools"]
  },
  "packet-capture": {
    s: "Recording the packets the firewall sees, at chosen points and with filters, plus drop captures and per-packet traces that show each stage's decision for troubleshooting.",
    d: "Captures can be taken on interfaces, at hook points or only for dropped packets, filtered by address and port to limit volume and exposure. Some devices offer per-packet traces recording each stage and rule hit. Captures before and after translation show what changed. Output goes to files or a remote analyzer. The challenge is cost and privacy: capture on the hot path can slow forwarding, hardware-offloaded flows never reach software, and captured payloads contain sensitive data.",
    k: ["Capture at several points vs only at the interface: several points show where a packet changes or disappears, while one point is simple and cheaper.", "Filtered, time-limited capture vs always on: limited capture bounds cost and exposure, while always-on gives evidence of past events and stores sensitive data."],
    p: ["Offloaded flows are missing from the capture, and the operator concludes the packets never arrived.", "Capture files containing credentials and personal data are left on the device or copied to shared storage."],
    v: "Capture at ingress, after translation and at egress for one flow and confirm each shows the expected addresses; capture drops only and confirm a denied packet appears with its reason.",
    dep: ["hook-points", "drop-reason-counters", "hardware-offload"]
  },
  "default-deny-posture": {
    s: "The decision to permit only what is explicitly allowed, which shapes how policy is written, how much knowledge of the network is needed and how failures appear.",
    d: "A default-deny posture makes every needed flow an explicit statement, which documents the network and limits the effect of the unknown. It affects rule counts, onboarding of new services, logging of denied traffic and the pressure to add broad allows to resolve outages. Exceptions weaken it: implicit rules for intra-zone, management and return traffic must be visible. It applies at every layer, from zone pairs to application policy. The cost is operational: each denial is an incident until someone finds the missing rule.",
    k: ["Strict default deny everywhere vs deny at borders and allow within: strict limits lateral spread and costs rule maintenance, while allow-within is easy and lets one compromise reach many hosts.", "Log all default denies vs sample: complete logs show what the policy missed, but flood storage during scans."],
    p: ["Outages are resolved by adding any-to-any allows that are never removed, defeating the posture.", "Implicit allows not shown in the rule list make the effective policy wider than reviewers believe."],
    v: "List the effective policy including implicit rules, then probe a sample of unspecified flows across every zone pair and confirm all are denied and logged against the default.",
    dep: ["default-action", "interzone-policy", "rule-recertification"]
  },
  "fail-open-or-closed": {
    s: "What the device does when it cannot decide or has failed: pass traffic, risking exposure, or block it, risking an outage. The choice applies to hardware faults, overload and inspection failures.",
    d: "Fail-closed blocks traffic when the policy engine, inspection or the unit itself fails, which protects the network and makes the firewall a single point of failure. Fail-open passes traffic, as in bypass ports with physical relays, which preserves availability and disables protection. The choice is made per failure type: a decoder error, a full table, a crashed process, a power loss and a compile failure each have a stated behavior. It is hard because the options are both bad and the sensible answer differs by segment.",
    k: ["Fail closed vs fail open: closed keeps the security promise at the cost of outage, while open keeps business running with no protection and an attack that crashes the device wins.", "Per-condition behavior vs one global setting: per-condition tunes risk precisely, but multiplies cases that must be tested."],
    p: ["Fail-open on an inspection engine crash makes crashing the engine an attack technique.", "A hardware bypass is activated by a power glitch, and nobody knows traffic is uninspected."],
    v: "Induce each failure type in a lab, including process crash, table full and power loss, and confirm the observed behavior of traffic matches the documented setting and an alert is raised.",
    dep: ["failover-roles", "protocol-decoders", "table-exhaustion-defense"]
  },
  "stateful-versus-stateless": {
    s: "How much per-flow memory the firewall keeps, from none at all to full protocol tracking and inspection, trading protection and convenience against capacity and failure modes.",
    d: "Stateless filters judge each packet alone and need both directions written as rules, so scale is excellent and protection is limited. Stateful tracking allows replies automatically and rejects invalid sequences, at the cost of a table that can be exhausted and must be synchronized. Deep inspection adds per-flow parsers. The decision is made per segment: stateless on high-rate edges or in hardware, stateful on most internal boundaries. It is hard because attackers target state, and more state means more to protect and replicate.",
    k: ["Stateless for high-rate links vs stateful everywhere: stateless gives line rate and survives failover without sync, while stateful gives safe return traffic and detection.", "Deeper inspection vs less state: inspection catches more and costs memory and parsing, while less state keeps the device simple and robust under load."],
    p: ["A stateless rule allowing replies by port range permits any inbound packet to those ports.", "Full inspection on every flow is enabled and throughput falls well under the purchased rate."],
    v: "Compare stateless and stateful configurations under a flood of unsolicited replies and of new connections, and confirm each reports the expected behavior in blocked traffic, table use and throughput.",
    dep: ["flow-table", "tcp-state-machine", "state-sync"]
  },
  "rule-sprawl-and-ownership": {
    s: "The tendency of rule sets to grow without anyone able to say why each rule exists, and the practices of ownership, expiry and review that counter it.",
    d: "Rules are added quickly and removed rarely, so sets grow to thousands of entries with duplicates, shadowed rules and unknown purposes, which slows compilation and hides risk. Contributing causes are fear of breaking something, missing owners, temporary exceptions and merged organizations. Counter-measures include required owners and expiry, hit-based review, shadow analysis and automation that generates rules from service definitions. It is a human system problem, and every control costs someone's time.",
    k: ["Strict expiry and recertification vs open-ended rules: expiry keeps the set lean and creates renewal work, while open-ended rules are low effort and accumulate.", "Rules generated from a service catalog vs hand-written rules: generated rules are consistent and traceable, but need an authoritative catalog and tooling."],
    p: ["Nobody deletes a rule because nobody can prove it is unused, so the set only grows.", "Duplicate rules maintained in several places drift apart, and removing one changes behavior unexpectedly."],
    v: "Report the share of rules with an owner, a recent hit and a valid expiry, and the number of shadowed and duplicate rules, and confirm the numbers fall over successive review cycles.",
    dep: ["rule-metadata", "redundancy-analysis", "rule-recertification", "change-approval"]
  },
  "latency-and-throughput-budget": {
    s: "The allowance of time and memory traffic may spend in the device: a per-packet cycle budget at target rate, a bound on state and a bound on how long a new flow may wait.",
    d: "At a target rate the device has a fixed number of nanoseconds per packet, which is divided among parsing, lookup, state, translation and inspection. Each feature is priced against it and its cost on fast and slow paths is measured. Budgets also cover new-connection rate, table size, rule compile time and failover time. Features that blow the budget are offloaded, moved to the slow path or sampled. The difficulty is that costs combine: enabling logging, inspection and decryption together may cost much more than their sum.",
    k: ["Size for worst-case packet mix vs average: worst-case guarantees line rate for small packets and attacks, while average sizing is cheaper and fails under flood.", "Enable features globally vs per rule: global is simple, while per-rule applies expensive inspection where it is needed and keeps the budget."],
    p: ["A datasheet number measured with large packets and no features is used to size a deployment with inspection on.", "Enabling one more inspection profile halves throughput, and the change is never tested."],
    v: "Measure throughput, latency and new connections per second with the production feature set at small, mixed and large packet sizes, and confirm each stays within the budgets for the target load.",
    dep: ["fast-slow-path", "hardware-offload", "cache-aware-layout"]
  },
  "evasion-and-ambiguity": {
    s: "The class of attacks that exploit differences between what the firewall parses and what the endpoint does, through fragmentation, overlap, encoding, ordering and protocol quirks.",
    d: "A firewall judges traffic that a different implementation will later interpret. Where the two disagree, an attacker sends bytes that look benign to one and malicious to the other. Examples include overlapping fragments and segments, header chains, timing and out-of-order delivery, encodings and unusual flag combinations. Defenses are normalization before inspection, strict rejection of ambiguous input, and mirroring the target's behavior. It cannot be fully solved, because endpoint behavior varies and the firewall's view is only inferred.",
    k: ["Normalize traffic to one canonical form vs inspect as received: normalization removes ambiguity before matching, but modifies packets and can break unusual valid peers.", "Reject ambiguous input vs model each endpoint: rejection is simple and strong, while modeling keeps compatibility with high effort."],
    p: ["The firewall resolves overlapping segments with the first copy while the server uses the last, hiding content from inspection.", "A fix in one decoder leaves the same ambiguity in others."],
    v: "Replay a corpus of known ambiguity cases, overlap, reorder and encoding variants, against the device and a reference endpoint, and confirm every case is either blocked or interpreted identically by both.",
    dep: ["fragment-handling", "sequence-validation", "protocol-decoders", "conformance-and-fuzzing"]
  },
});
