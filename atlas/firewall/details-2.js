// Details for the firewall plate, part 2: testing and policy analysis, rule model and matching.
ATLAS.details("firewall", {
  "shadow-analysis": {
    s: "Static analysis that finds rules which can never match because an earlier rule already covers all of their traffic, so the later rule is dead or contradicts intent.",
    d: "The analyzer treats each rule as a region in header space and checks whether an earlier rule's region fully contains it. A rule fully covered with a different action is shadowed and signals a mistake; one with the same action is merely redundant. Partial overlaps with conflicting actions are reported as order-dependent. The hard part is scale and fidelity: regions span many dimensions, objects expand into large sets, and the analysis must model negation, zones, time and identity or it will report false results.",
    k: ["Exact geometric analysis vs sampling: exact finds every shadowed rule, but cost grows quickly with rule count and dimensions; sampling is fast and misses corner cases.", "Report all overlaps vs only full shadows: complete picture, but thousands of intentional exceptions bury the real errors."],
    p: ["Analysis ignores zones or identity, so it flags rules that apply to different traffic as shadowed.", "Administrators delete a shadowed deny assuming it is dead, while another path made it live."],
    v: "Insert an accept for a whole subnet above a deny for one host in it, run the analysis, and confirm the deny is reported as shadowed with the covering rule named; swap the order and confirm the report clears.",
    dep: ["rule-ordering", "address-objects", "object-expansion"]
  },
  "redundancy-analysis": {
    s: "Detection of rules that can be removed without changing behavior or that have not matched in a long period, shrinking the policy and the attack surface.",
    d: "Two checks combine. Logical redundancy finds rules whose removal changes no verdict, such as duplicates or rules covered by later broader ones with the same action. Usage analysis uses hit counters and last-hit time to find rules unused for months. Combining them yields candidates for review, never automatic deletion, since a rule for yearly processing may show no hits for eleven months. The challenge is retention of counter history across recompiles and device replacements.",
    k: ["Logical analysis only vs adding usage data: logical results are provably safe, while usage finds far more candidates but guesses at future need.", "Auto-disable unused rules vs report only: shrinks policy quickly and reversibly, but surprises owners of seasonal processes."],
    p: ["Hit counters reset on reboot or replacement, so rules look unused or used depending on when the data started.", "Removing a rule that only matched through a fallback path breaks a backup route nobody tested."],
    v: "Add a duplicate rule and a rule that has never been hit, generate traffic for others, and confirm the report lists the duplicate as logically redundant and the idle rule as unused with its age.",
    dep: ["rule-hit-counters", "shadow-analysis"]
  },
  "packet-trace-simulator": {
    s: "A tool that takes a described packet and reports which rules, zone checks, translations and verdict it would receive, without sending real traffic.",
    d: "The operator provides ingress interface, addresses, ports, protocol and optional state, and the simulator runs the same classification code or an equivalent model, printing each step: sanity checks, flow lookup, destination translation, route, zone pair, matching rule, source translation and verdict. It can also run against a candidate configuration. The difficulty is fidelity: if the simulator is a separate implementation it drifts from the data path, and features depending on live state or payload inspection are hard to model.",
    k: ["Run the real classifier in a test mode vs a separate model: guarantees agreement, but ties the tool to the data path and its release cycle.", "Simulate against the candidate vs only the running policy: catches mistakes before commit, but needs the compiled candidate available."],
    p: ["A simulator that ignores existing flows says traffic will be blocked while an established flow still passes.", "Results trusted for application-based rules when the simulator cannot see payload."],
    v: "Trace a packet that should be allowed and one that should be denied against a known policy, compare each reported rule and verdict with real traffic captured on the wire, and confirm they agree.",
    dep: ["rule-ordering", "hook-points", "source-nat", "security-zones"]
  },
  "change-impact-analysis": {
    s: "A comparison that shows which traffic a proposed policy change newly allows, newly blocks or leaves alone, using policy structure or recent traffic logs.",
    d: "The analyzer computes the set difference between the old and new compiled policy over header space, and optionally replays recent logged flows through both to list those whose verdict would change. Results are grouped by source, destination and service for review. It catches unintended widening, such as a changed object that is used by forty rules. The hard parts are the size of header space, the mismatch between logged flows and all possible traffic, and showing the result in a form a reviewer can act on.",
    k: ["Structural set difference vs log replay: structural covers all possible traffic, while replay is concrete and fast but only covers what was observed.", "Run on every commit vs on request: catches problems early, at the cost of commit latency and review fatigue."],
    p: ["Impact analysis ignores objects defined in other layers, so a shared object edit appears local.", "A replay window that missed monthly jobs shows no impact on rules those jobs use."],
    v: "Change a widely used address object, run the analysis, and confirm it lists every rule that references it, the newly allowed source and destination ranges, and replayed flows whose verdict changes.",
    dep: ["shadow-analysis", "object-expansion", "traffic-log"]
  },
  "synthetic-traffic-tests": {
    s: "Automated tests that send crafted packets through a firewall and check that each is allowed, blocked or translated as the policy intends.",
    d: "A test harness holds a matrix of expected outcomes: from this zone, to this address and service, expect accept or drop, with expected translation. A generator on each side sends real packets or full sessions and records what arrives. Tests run after each commit, on a staging device, and continuously against production to catch drift and failover regressions. The hard part is the matrix: it needs maintenance with the policy, and negative tests prove only the cases someone thought to write.",
    k: ["Tests derived from policy intent vs generated from the rule set: intent-based tests catch wrong rules, while generated ones only confirm the device implements what is written.", "Staging device vs production probes: staging is safe, while production probes show real paths and state at the cost of touching live systems."],
    p: ["Tests that only check allowed paths pass while an overly broad rule permits everything.", "A test host in the same zone as its target bypasses the very filtering the test is meant to exercise."],
    v: "Run the matrix before and after a deliberate wrong change, and confirm that exactly the affected expectations fail with the packet, expected result and observed result printed.",
    dep: ["packet-trace-simulator", "interzone-policy"]
  },
  "rule-recertification": {
    s: "A periodic review in which owners confirm each rule is still needed, backed by hit data, so access that has lost its purpose is removed.",
    d: "On a schedule, the system lists each rule's owner, description, ticket, last hit and traffic volume, and sends it to the owner for renew, change or remove. Unanswered reviews escalate and may disable the rule. Results update metadata and expiry dates. The practice is often required by audit regimes. The difficulty is that reviewers see opaque rules, hit data is noisy, and mass review requests become rubber-stamping unless prioritized by risk, such as broad sources or sensitive destinations.",
    k: ["Risk-ranked review vs reviewing everything equally: focuses attention on broad and sensitive rules, but needs a trustworthy risk score.", "Auto-disable on no response vs reminder only: closes forgotten access, but can cause outages when the owner is simply away."],
    p: ["Reviewers approve in bulk without reading, so the review records a decision nobody made.", "Rules without an owner field never enter the review at all."],
    v: "Run a review cycle on a policy with an expired rule and an unowned rule; confirm the owner of the first is asked and the second is escalated, and a renewal updates its expiry and records who approved.",
    dep: ["rule-metadata", "redundancy-analysis", "rule-hit-counters"]
  },
  "conformance-and-fuzzing": {
    s: "Adversarial testing of the data path with malformed, overlapping and unusual packets to find parsing differences, crashes and bypasses.",
    d: "Test tools generate invalid headers, odd fragment overlaps, impossible TCP flag combinations, truncated extension chains and protocol violations, and compare the device's behavior with a reference model or with how end hosts parse the same bytes. Mutation-based fuzzing of parsers runs continuously. Findings are crashes, hangs, bypasses where the firewall accepts what the host would interpret differently, and state corruption. The hard part is that parsers run on untrusted input at line rate in privileged code, so a single flaw is both a bypass and a remote crash.",
    k: ["Differential testing against real host stacks vs spec-only checks: finds the ambiguities attackers exploit, but needs a corpus of host behaviors.", "Continuous fuzzing in the pipeline vs a pre-release campaign: finds regressions at once, with infrastructure to run and triage constantly."],
    p: ["Fuzzing only well-formed protocols never reaches the length and offset handling where the real flaws are.", "Crashes found in a decoder are fixed there while the same pattern remains in sibling decoders."],
    v: "Send a corpus of overlapping fragments and illegal flag combinations through the device to a host with a packet capture; confirm the device neither crashes nor passes anything the policy would drop.",
    dep: ["protocol-decoders", "fragment-handling", "ingress-sanity"]
  },
  "five-tuple-match": {
    s: "The basic match on source address, destination address, protocol, source port and destination port that identifies a flow and is the minimum for a packet filter rule.",
    d: "A rule specifies a value, prefix, range or set for each of the five fields, and a packet matches when all fields do. Ports exist only for protocols that have them, so other protocols such as ICMP use type and code instead. Rules also usually name an interface or zone and a direction. Everything else builds on it. The challenge is representation: ranges and prefixes in several dimensions make classification a hard geometric problem and fragments carry no ports after the first.",
    k: ["Match on all five fields vs fewer: finer rules express intent exactly, but each additional field adds lookup cost and chances for a typo.", "Source port matching allowed vs destination only: supports legacy services with fixed source ports, but invites rules that are brittle and easy to spoof."],
    p: ["A rule written for TCP is assumed to cover UDP on the same port, leaving the other protocol open or closed by accident.", "Port rules do not apply to non-first fragments, so those fragments are judged by something else."],
    v: "Write an accept for one source, destination and TCP port, then send packets that differ from it in exactly one field each, and confirm only the exact match is accepted.",
    dep: ["ingress-sanity", "fragment-handling"]
  },
  "rule-ordering": {
    s: "The evaluation order of rules: the first rule that matches decides, so position expresses precedence and every insertion can change the meaning of those below.",
    d: "Rules are held in a list per chain or policy and tested in order, or compiled into an equivalent structure that gives the same result. Specific exceptions go above general rules. Some systems instead use priorities, best-match or deny-overrides evaluation, which removes ordering errors but changes the mental model. The difficulty is human: a long list is edited by many people, and inserting at the wrong position silently reverses intent without any syntax error.",
    k: ["First match wins vs most specific wins: first match is simple and predictable, while most specific removes ordering mistakes but needs a definition of specificity.", "Single global list vs per-zone-pair lists: global ordering is flexible, but per-pair lists keep each rule's neighbors relevant and reduce interference."],
    p: ["A broad temporary allow added near the top silently overrides the denies below and is never removed.", "Moving a rule during cleanup changes the outcome for traffic nobody realized it covered."],
    v: "Put a deny for one host below an accept for its subnet and confirm the host is allowed; move the deny above and confirm it is blocked, with the hit counters moving to match.",
    dep: ["five-tuple-match", "verdicts"]
  },
  "default-action": {
    s: "The verdict applied when no rule matches: deny in a secure posture, accept in a permissive one, and the single most consequential setting in the policy.",
    d: "Each chain, zone pair or whole device has a final action. Default-deny drops everything not explicitly allowed; default-allow drops only what is listed. Some devices also have implicit rules, such as allowing return traffic or traffic within a zone, that are separate from the configured default. The hard part is visibility: implicit rules and per-interface defaults may not appear in the rule list, so the effective policy is longer than the visible one.",
    k: ["Default deny vs default allow: deny forces every need to be stated and limits unknown exposure, but breaks things until rules are added.", "Visible explicit final rule vs hidden implicit default: an explicit rule can log and count, while an implicit one is simpler but invisible."],
    p: ["Intra-zone traffic permitted by default lets a compromised host reach every peer in its zone.", "A default that is not logged hides the traffic that policy never anticipated."],
    v: "Send traffic that matches no rule in each direction and zone pair, and confirm each is dropped and counted against the default rule, which also appears in the log.",
    dep: ["rule-ordering", "verdicts"]
  },
  "verdicts": {
    s: "The possible outcomes of a rule: accept, drop silently, reject with an error message, or hand the packet to another chain, inspection engine or log target.",
    d: "Accept lets the packet continue, drop discards it without a reply, and reject discards it and sends a TCP reset or ICMP unreachable. Non-terminating actions log, mark or count and continue evaluating. Jump actions send the packet into a named chain and return. The choice has effects beyond the single packet: reject lets clients fail quickly, drop hides the host from scanners but causes timeouts, and reject messages can themselves be abused as a reflection or reveal signal.",
    k: ["Silent drop vs reject: drop slows scanners and avoids generating traffic, while reject gives legitimate clients immediate errors and simpler troubleshooting.", "Terminating verdicts only vs also non-terminating actions: terminating-only is easy to reason about, while actions like mark and log let one rule feed several later stages."],
    p: ["Dropping ICMP errors that clients need breaks path discovery and produces mysterious stalls.", "Reject replies sent to spoofed sources make the firewall part of a reflection attack."],
    v: "Send a connection attempt to a rejected port and a dropped port, and confirm the first returns a reset or unreachable immediately and the second times out, each counted against its own rule.",
    dep: ["packet-marks", "rate-limiting"]
  },
  "match-extensions": {
    s: "Additional conditions beyond the five-tuple: TCP flags, interface, packet length, TTL, DSCP, state, owner and many others used to express finer rules.",
    d: "Extensions plug into the match engine as small modules, each testing one property of the packet or its context. Examples include TCP flag combinations, connection state, packet length, hop limit, quality-of-service code point, interface or zone, and in host firewalls the user or process that owns the socket. Each costs additional work per rule evaluation. The hard part is performance and portability: extension matches defeat compilation into pure address structures and not all are supported by hardware offload.",
    k: ["Pluggable match modules vs a fixed field set: new conditions are easy to add, while a fixed set compiles and offloads better.", "Per-packet extension checks vs checking once at flow creation: per-packet is exact for every packet, but state-level decisions are cheaper and usually sufficient."],
    p: ["A rule using a rarely supported extension is silently skipped in hardware offload, so traffic is judged by a different path.", "A flag-based rule written for one stack's behavior misclassifies traffic from another."],
    v: "Write a rule matching TCP SYN with a given packet length, send packets that differ in flags and length, and confirm only the matching one hits the rule and the counter increments by one.",
    dep: ["five-tuple-match"]
  },
  "packet-marks": {
    s: "Small values attached to a packet or flow by one rule and read by later rules or other subsystems, so decisions can be chained without repeating matches.",
    d: "A rule sets a mark on the packet, or saves it into the flow so every later packet inherits it. Later rules, routing, shaping or inspection read the mark. This separates classification from action: one rule decides that traffic is from guests, many later rules react. Marks can also carry the result of application identification across stages. The difficulty is that marks are invisible shared state: collisions between independent users of the same bits, and marks lost when a packet crosses a stage that resets them, produce confusing behavior.",
    k: ["Marks stored in packet metadata vs in flow state: per-packet marks are flexible, while flow marks apply consistently to the whole connection.", "Partitioned mark bits per feature vs one free-form value: partitions prevent collision, but cap how many classes each can use."],
    p: ["Two subsystems write overlapping bits of a mark and each overrides the other without error.", "A mark set after the routing decision has no effect on the route the administrator wanted."],
    v: "Set a mark in an early rule and read it in a later rule and a routing policy; confirm the traffic follows the marked path and a packet capture shows the mark is not present on the wire.",
    dep: ["hook-points", "flow-table"]
  },
  "time-based-rules": {
    s: "Rules that are active only in defined time windows or until an expiry, for scheduled access, maintenance windows and temporary exceptions.",
    d: "A rule references a schedule of recurring ranges, such as weekdays 08:00 to 18:00, or an absolute start and end. The device evaluates the schedule against its clock, usually by enabling or disabling the compiled rule at the boundary rather than testing time per packet. Existing flows may continue, be cut at the boundary, or follow an explicit setting. The challenge is clocks and time zones: unsynchronized time makes a rule start early or late, and daylight changes shift windows.",
    k: ["Recompile at schedule boundaries vs per-packet time test: boundaries keep the fast path clean, but a recompile at each change adds work and delay.", "Cut existing flows at expiry vs let them finish: cutting honors the schedule exactly, but disrupts long transfers that began in time."],
    p: ["A device with a drifted clock opens a window hours early.", "A temporary access rule that expires is extended by copying it with a new date, and eventually becomes permanent."],
    v: "Create a rule active from now for two minutes, confirm traffic passes, wait past the end, and confirm new connections are blocked and the log records the rule deactivation time.",
    dep: ["rule-ordering", "rule-metadata", "atomic-ruleset-swap"]
  },
  "identity-match": {
    s: "Matching by authenticated user or group instead of address, by learning which user is at which address from a directory or login events.",
    d: "The firewall receives login events, agent reports or captive-portal results mapping a user to an address and time, and keeps a table with expiry. Rules name users or groups, which the device resolves to current addresses at match time or through dynamic groups. This lets policy follow people across devices and locations. The difficulty is accuracy: shared machines, remote desktop servers, address reuse and stale mappings attribute traffic to the wrong person, and the mapping source becomes security-critical.",
    k: ["Identity from login events vs from per-flow authentication: events are transparent to users but can be spoofed or stale, while per-flow login is accurate and intrusive.", "Resolve groups to addresses at commit vs at match time: commit is cheap and static, match time follows changes quickly but needs a lookup."],
    p: ["Multiple users on one terminal server all inherit the first user's permissions.", "A spoofed login event from a compromised host grants another user's access."],
    v: "Log a test user in from two addresses in turn and confirm a user-based rule allows traffic only from the current address, and stops after logout or mapping expiry with the log naming the user.",
    dep: ["dynamic-address-groups", "five-tuple-match"]
  },
  "negation-and-ranges": {
    s: "Rule syntax for everything except a set, ranges of values and wildcards, which make rules compact but are a common source of unintended matches.",
    d: "Negation, as in any destination except these, and ranges let one rule express what would take many. The compiler must turn them into sets of prefixes or intervals, which can increase rule size sharply: a negated address set splits into many blocks, and a port range is not a prefix. Wildcards in object names or masks need defined semantics. The danger is semantic: a negated source in a deny rule matches almost the whole internet, which is rarely what the author meant.",
    k: ["Allow negation in rules vs positive lists only: negation is concise and matches intent for exceptions, but makes review and compilation harder.", "Port ranges matched natively vs expanded to prefixes: native ranges stay small in the rule list, while expansion suits trie and hardware tables at higher size."],
    p: ["A deny with a negated source blocks everything but the listed hosts, including the management network.", "A port range expanded for hardware multiplies into dozens of entries and silently exhausts rule memory."],
    v: "Write a rule for every destination except one subnet, test one address in and one outside, and confirm the compiled form lists the expected prefixes and the counters match the intended sides.",
    dep: ["five-tuple-match", "object-expansion"]
  },
});
