// Details part 5: cross-cutting concerns.
ATLAS.details("industrial-control", {
  "determinism-and-scan-timing": {
    s: "The requirement that control actions occur within known time bounds, which shapes the controller runtime, network design and what may share hardware.",
    d: "Loops assume a fixed sample interval and bounded delay from measurement to output. That budget is spent across the instrument, the I/O module, the scan, the network and the actuator. Anything that adds jitter, such as a heavy program, a broadcast storm or a garbage-collected runtime, uses it. Timing is designed top-down with explicit budgets and measured in operation. The difficulty is that violations are intermittent and can look like a process problem.",
    k: ["Hard real-time on dedicated hardware versus shared general-purpose platforms: dedicated hardware gives bounds that can be proved, but costs flexibility and limits integration.", "Tight loop times versus loose ones: tighter times improve control quality, but cost processing and bandwidth and leave less margin for overruns."],
    p: ["A new feature adds scan time, and a loop tuned for a 10 ms sample now runs at 14 ms and oscillates.", "Network load from a new application increases I/O jitter, noticed only as unexplained process variation."],
    v: "Record the end-to-end delay from an input change to the output response and its worst case under peak load. Compare with the control loop's budget and confirm the margin.",
    dep: ["scan-cycle","task-scheduler","industrial-ethernet","motion-control"]
  },
  "safety-vs-security": {
    s: "The tension between keeping a system simple, closed and unchangeable for safety, and keeping it patched, monitored and connected for security.",
    d: "Safety wants deterministic behavior, rare change and independence; security wants updates, logging, authentication and connectivity. Remote access helps support and creates attack paths. Authentication helps accountability and can block an emergency action. Common ground exists: segmentation, independence of the safety system, tight change control. The decision is where each wins, made explicitly per function. The difficulty is that a security fix can invalidate a safety verification and a safety shortcut can open a path for an attacker.",
    k: ["Isolating safety systems entirely versus connecting them for diagnostics: isolation removes attack paths, but loses remote health data, so a one-way link is the usual compromise.", "Locked operator screens versus open emergency access: locking supports security, but any delay in an emergency is itself a hazard."],
    p: ["A safety system is placed on the plant network for convenience, and a compromised workstation can alter its logic.", "A security patch is applied to a safety workstation without re-validation."],
    v: "Try to reach the safety controller's programming interface from the plant network and from an engineering station without the key in program mode. Both should fail, with attempts logged.",
    dep: ["sis-logic-solver","zones-and-conduits","unidirectional-gateways"]
  },
  "availability-vs-change": {
    s: "The conflict between plants that must run continuously and the need to change logic, firmware and equipment, which makes each change a scheduled risk.",
    d: "Uptime targets are measured in years between shutdowns, while change requests arrive continuously. Mechanisms include redundancy for online repair, online edits, staged rollouts, simulated testing and planned outages with long preparation. The decision is how much change to allow outside outages. The difficulty is that deferred change accumulates, so outages become large, risky bundles, and a plant that never changes also never fixes.",
    k: ["Frequent small changes versus batching into outages: small changes limit the effect of each, but happen on a live process, while batching gets a safe window and a larger risk per change.", "Redundant systems for online maintenance versus single systems with outages: redundancy permits repair without stopping, but costs hardware and adds failure modes of its own."],
    p: ["Several postponed updates are applied in one outage and when something fails nobody can tell which change caused it.", "Redundant pairs are never switched over in practice, so the first real failover is untested."],
    v: "Rehearse an update on the staging system and then a live redundant pair: switch over, update the standby, switch back. Confirm output disturbance stays within the process tolerance and the record is complete.",
    dep: ["controller-redundancy","change-management-workflow","online-changes-and-downloads","virtual-commissioning"]
  },
  "brownfield-and-longevity": {
    s: "The reality that control systems stay in service for twenty to forty years, so every layer must live alongside old equipment, obsolete software and mixed generations.",
    d: "Plants are upgraded unit by unit, so new and old controllers, protocols and operating systems coexist. Spare parts, skills and vendor support shrink with age. Strategies include gateways, emulation, stockpiling spares, staged migration of logic and keeping documentation current. The decision is when to migrate and what to preserve. The difficulty is that the old logic embodies undocumented process knowledge, and a faithful translation can reproduce its bugs and miss its quirks.",
    k: ["Like-for-like replacement versus redesign during migration: like-for-like preserves tested behavior and lowers risk, but carries forward old workarounds, while redesign fixes them and invites new faults.", "Stockpiling spares versus migrating early: spares are cheap in the short term, but run out and keep skills tied to obsolete systems."],
    p: ["The only engineer who understood the old logic retires before the migration starts.", "A migration tool translates logic correctly in form but changes scan-order behavior and a sequence fails."],
    v: "Pick the oldest controller in service: confirm there is a tested spare, a current backup that restores, an engineer able to read its project and a dated plan for its replacement.",
    dep: ["protocol-gateways","control-project-repository","virtual-commissioning"]
  },
  "data-trust-and-time": {
    s: "Whether recorded and displayed values can be believed: quality flags, timestamps from synchronized clocks, calibration, and clear marking of stale or substituted data.",
    d: "Each value carries a quality such as good, uncertain or bad and a timestamp taken as close to the source as possible. Clocks across controllers, servers and recorders are synchronized by a time protocol, with accuracy matched to the need, from seconds to microseconds. Values from failed sources must show as such all the way to the screen and the historian. The decision is which layer owns time and how quality propagates. The difficulty is that most failures here are silent: wrong data looks like right data.",
    k: ["Time stamped at the source versus at the collector: source stamps are accurate for event order, but require good clocks everywhere, while collector stamps are easy and wrong by the delay.", "Propagating quality through every calculation versus showing last value: propagation is honest and requires every block to handle it, while last value looks clean and hides failures."],
    p: ["Clocks drift apart over months and cross-system sequences cannot be reconstructed after an incident.", "A report averages values that were substituted during an outage, and nobody can tell which were measured."],
    v: "Compare clocks across controllers, servers and recorders against a reference and confirm they agree within the stated limit. Fail a source and follow its quality through calculation, display and historian.",
    dep: ["real-time-tag-database","process-historian","sequence-of-events","sensors-transmitters"]
  },
  "human-factors-and-authority": {
    s: "Who may do what, how people actually behave under pressure, and how the system supports correct decisions rather than blaming mistakes.",
    d: "Operators are the last line of control. Authority is divided: operators command within limits, supervisors change limits, engineers change logic, and safety systems override all of them. Displays, alarms, procedures and shift handover are designed for fatigue, interruption and rare events. The decision is which actions the system allows, which need confirmation and which are impossible. The difficulty is that designs tested with experts fail with tired people at 3 a.m., and workarounds emerge wherever rules slow the work.",
    k: ["Strict authority limits versus operator discretion: limits prevent harmful actions, but block an experienced operator from improvising during a rare event.", "Automating a task versus keeping the operator in the loop: automation reduces routine error, but erodes the skill and attention needed when it fails."],
    p: ["An operator trained only on normal operation is overwhelmed in the first real emergency.", "Rules too tight for real work are bypassed by sharing logins or taping over interlock switches."],
    v: "Run an upset drill with real operators on a simulator: record time to detect, diagnose and act, and which alarms and displays they used. Review the gaps with them.",
    dep: ["graphic-displays","alarm-rationalization","user-roles-and-access","operator-input-validation"]
  },
});
