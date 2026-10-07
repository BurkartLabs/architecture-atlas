// Details for the SIEM plate, part 6: response and automation; compliance and reporting; cross-cutting concerns.
ATLAS.details("siem", {
  "playbook-engine": {
    s: "Executes defined workflows of steps triggered by alerts or cases, with branching, parallel actions, waits for people and error handling, so repeatable response work runs without manual effort.",
    d: "A playbook is a graph of actions, conditions and approvals, written in a visual editor or as code. A trigger starts it with alert data as input; steps call connectors, wait for responses or human decisions, and store outputs. The engine persists state so long waits survive restarts, retries failed steps and logs every action. It is hard because automation acts on live systems: playbooks must be idempotent, handle partial failure, and avoid loops where their own actions create alerts.",
    k: ["Visual workflow editor vs playbooks as code: visual is accessible to analysts and hard to review and test; code is versioned and testable and needs engineers.", "Fully automatic vs human in the loop: automatic is fast and can amplify mistakes, human steps add delay and a safeguard."],
    p: ["A playbook whose action creates an alert that triggers the same playbook loops until rate limits stop it.", "A step that times out is retried, and the action, such as disabling an account, is performed twice."],
    v: "Trigger a playbook with a test alert that fails at its third step. Confirm earlier steps are not repeated on retry, the failure is recorded with its inputs, and a human is notified for manual completion.",
    dep: ["response-connectors", "approval-gates", "automation-audit-trail"]
  },
  "response-connectors": {
    s: "Adapters that let playbooks call other systems, such as directories, firewalls, endpoint tools, email and cloud services, through their interfaces with stored credentials and consistent actions.",
    d: "Each connector exposes actions like disable account, block address or isolate host, with typed inputs and outputs, authentication handled centrally and rate-limit awareness. Libraries provide hundreds, and custom ones wrap internal tools. Credentials are held in a vault and scoped per action. Challenges are fragility, since the target's interface changes, the sheer power of the stored credentials, and idempotence: calling block twice or on a missing object must not fail the run.",
    k: ["Vendor-supplied connectors vs custom wrappers: supplied connectors save effort and cover typical actions; custom wrappers fit internal systems and need maintenance.", "One powerful integration account vs one per action: one is simple and a total compromise; per action is safer and tedious to set up."],
    p: ["A connector's credential expires, and every playbook step using it fails at the moment of an incident.", "An overly broad service account lets any playbook author disable any user in the company."],
    v: "Run each action of a connector against a test target, including a call on a nonexistent object and a repeated call, and confirm results, errors and credentials usage are correct and recorded.",
    dep: ["access-control"]
  },
  "approval-gates": {
    s: "Points in a playbook where a named person or role must approve before a risky action proceeds, with timeouts, evidence shown to the approver and a recorded decision.",
    d: "A gate pauses the run, sends the approver the context and proposed action over chat, email or the console, and waits for yes or no. Gates are placed before disruptive actions, such as disabling an executive's account or isolating a production server, and relaxed for low-risk ones. They have a timeout with a defined default. The hard part is calibrating: too many gates remove the benefit of automation, too few let a false positive take down production.",
    k: ["Approval before action vs notify after: approval prevents harm and adds delay; notify-after is fast and leaves reversal as the safeguard.", "Timeout defaults to proceed vs to abort: proceed favors containment and risks harm, abort favors safety and lets attackers continue."],
    p: ["An approver on leave leaves containment waiting while the attacker moves on.", "Approval requests lacking evidence get approved reflexively and offer no protection."],
    v: "Run a playbook with a gate, approve one run, reject another and let a third time out. Confirm each follows its defined path and records who decided, what they saw and when.",
    dep: ["playbook-engine", "access-control", "notification-routing"]
  },
  "enrichment-actions": {
    s: "Playbook steps that gather context for an alert, such as looking up an indicator, listing recent logins, retrieving asset owner or checking a file, so the analyst starts with answers.",
    d: "On trigger, actions query intelligence services, the directory, the asset inventory, endpoint tools and the SIEM's own history, then attach results to the alert or case. They are read-only and safe to automate widely. Their value is time saved in the first minutes. Concerns are cost and exposure: external lookups can reveal investigation details, rate limits restrict volume, and results from unreliable sources must be labeled so analysts do not treat them as fact.",
    k: ["Enrich every alert automatically vs on analyst request: automatic saves time and spends lookups on alerts nobody reads; on-demand is cheap and slower.", "Attach raw results vs a summary: raw is complete and cluttered, summaries are readable and can hide the key detail."],
    p: ["Enrichment queries that run for every low-severity alert exhaust the lookup service's quota before an important one arrives.", "A failed lookup is shown as clean, reading as no bad reputation instead of unknown."],
    v: "Trigger enrichment for an alert with a known malicious address and a known clean one, and confirm each result is attached with source and time, and that a lookup failure is shown as unknown.",
    dep: ["playbook-engine", "indicator-matching", "asset-context"]
  },
  "notification-routing": {
    s: "Delivering alerts and case updates to the right people through the right channel, based on severity, ownership, schedule and acknowledgment, with escalation if nobody responds.",
    d: "Rules map alert properties to recipients and channels: chat, email, mobile paging, phone calls and ticket systems. On-call schedules decide who is reachable now. Acknowledgment stops repeats; silence escalates. It must be reliable during an incident, which is when other systems are failing. Hard parts are alert fatigue, keeping on-call data current, and delivery paths that depend on infrastructure the attacker may control.",
    k: ["Page on every high alert vs batch into digests: paging gives speed and burns people out, digests protect attention and delay response.", "Notify through the corporate chat vs an independent paging service: corporate chat is convenient, an independent path works when the network or identity system is the target."],
    p: ["Notifications sent to a retired distribution list are never seen.", "During a mass-compromise, chat and email are down or monitored by the attacker."],
    v: "Fire a critical alert outside business hours and confirm the on-call person is paged, acknowledgment stops repeats, and with no acknowledgment the next contact is paged on schedule through an independent channel.",
    dep: ["sla-and-escalation"]
  },
  "ticketing-integration": {
    s: "Two-way synchronization between cases and the organization's ticketing system, so security work appears in the same queues as IT changes and every status stays consistent.",
    d: "Opening a case creates or links a ticket in the IT or service system; status, owner and comments sync in both directions through the ticketing system's interface or webhooks. It lets security hand work to infrastructure teams, such as patching or rebuilding a host, and track completion. Difficulties are mapping states and fields between two models, conflicting edits, permission differences and keeping sensitive investigation details out of tickets many people can read.",
    k: ["Two-way sync vs one-way push: two-way keeps both current and risks conflicts and loops; one-way is simple and drifts.", "Detailed tickets vs minimal references: detail helps the receiving team and spreads sensitive data, references protect it and force a hop to the case."],
    p: ["A comment synced back triggers a case update that syncs again, creating an endless loop.", "Tickets containing investigation details are visible to the whole company."],
    v: "Open a case, confirm a linked ticket appears with correct fields, change status in each system, and confirm both reflect the change once. Verify the ticket contains no restricted evidence fields.",
    dep: ["case-management", "response-connectors"]
  },
  "containment-actions": {
    s: "Actions that limit an attacker's reach, such as isolating a host, disabling or resetting an account, revoking sessions or blocking an address, with defined scope, rollback and verification.",
    d: "Containment calls the endpoint, identity, network or cloud systems to cut access while preserving evidence. Each action has a defined effect, a reversal and a check that it took hold, for example that the host no longer responds on the network. It is the most consequential automation: it stops an attack and, wrongly applied, stops the business. The hard parts are targeting the right entity, handling partially applied actions and clearing the containment later.",
    k: ["Contain immediately on high confidence vs wait for review: immediate stops spread quickly and risks disrupting production on a false positive; review is safe and slower.", "Network isolation vs account disable: isolation stops a host's lateral movement and keeps its session; disable stops the identity everywhere and affects the user at once."],
    p: ["An action applied to a shared account or critical server causes an outage larger than the incident.", "A containment never reversed leaves a host isolated for weeks after the incident closed."],
    v: "In a lab, run isolation and account disable against a test host and user, verify that traffic and logins are blocked as stated, then roll back and confirm normal access returns, with each step logged.",
    dep: ["response-connectors", "approval-gates", "automation-audit-trail"]
  },
  "automation-audit-trail": {
    s: "A complete, immutable record of every automated action: trigger, inputs, decision path, called systems, results and approvals, so that anything the automation did can be explained and reversed.",
    d: "Each playbook run logs its start, each step with parameters and outputs, who approved what and the final result, in a store that playbook authors cannot edit. It lets reviewers answer why an account was disabled at 3 a.m., supports post-incident reviews and detects misuse of automation. Hard parts are including enough detail without storing secrets, correlating steps to the triggering alert, and retaining records as long as the cases they belong to.",
    k: ["Log inputs and outputs in full vs summaries: full is reconstructible and may hold sensitive data; summaries are safer and cannot reproduce a decision.", "Keep in the SIEM vs in a separate store: in the SIEM is searchable with everything else, separate is independent of those who administer rules."],
    p: ["Step outputs containing tokens or passwords are written to the audit log in clear text.", "A run's log lacks the triggering alert identifier, so nobody can tell why it ran."],
    v: "Run a playbook that disables a test account and, from the audit record alone, answer what triggered it, which systems were called with what values, who approved it and what the outcome was.",
    dep: ["platform-audit", "log-integrity-and-trust"]
  },
  "control-mapping": {
    s: "Linking logging, monitoring and detection capabilities to the specific controls of regulations and standards, so each requirement points to the data, rule and report that satisfies it.",
    d: "A mapping table lists controls, such as monitoring privileged access or reviewing logs regularly, and for each names the log sources, searches, alerts and review activities that provide evidence. It lets compliance teams ask the system for status and lets engineers see which requirements a changed source or rule affects. The difficulty is that controls are written in prose, interpretation varies between auditors, and mappings go stale when sources or rules change without anyone updating them.",
    k: ["Maintain mappings with the content vs in a separate compliance tool: with content they update together, separately they suit auditors and drift.", "Map to one framework vs many: one is clear and cheap, many serve multiple audits and multiply upkeep, though overlaps can share evidence."],
    p: ["A mapped source is decommissioned and the control reports as satisfied for months.", "A control marked covered by an alert that never fires has no real evidence behind it."],
    v: "Choose five mapped controls and, for each, produce the actual log sample, rule firing or review record that serves as evidence in the last 30 days, and flag any mapping that cannot.",
    dep: ["rule-library", "retention-policies"]
  },
  "compliance-reports": {
    s: "Generated reports showing, per control, what was monitored, what was found and how it was handled, formatted for auditors and tied to underlying searchable evidence.",
    d: "A report runs the searches and counts behind each control over a period, such as privileged logins, failed access attempts, changes to audit configuration and unresolved alerts, and renders summary tables with links to evidence. Auditors may sample events to verify. It is hard because the data must be complete, so gaps in collection undermine every number, and because numbers must be reproducible: the same report rerun later must give the same answer.",
    k: ["Report generated from live data vs from frozen snapshots: live is simple and cannot be reproduced exactly later; snapshots reproduce and cost storage.", "Pre-built templates vs custom reports per audit: templates are consistent and quick, custom fits an auditor's unusual request."],
    p: ["A report claims complete coverage while one source stopped sending three weeks before the period ended.", "Numbers differ between the report and an auditor's own search because definitions of a failed login differ."],
    v: "Generate a report for last quarter, then have an independent reviewer recompute three figures from raw searches. Confirm they match and that each figure links to the events behind it.",
    dep: ["control-mapping", "search-execution", "audit-log-integrity"]
  },
  "scheduled-reports": {
    s: "Reports, dashboards and summaries generated on a schedule and delivered to defined recipients, such as a weekly executive summary, a daily source health digest and a monthly review report.",
    d: "A schedule runs saved searches or dashboards at set times, renders them to documents or tables, and sends them to people and systems, with permission checks. They keep stakeholders informed without access to the platform. Challenges: large reports compete with detection for resources, recipients receive data beyond their entitlements through email, schedules continue after their authors have left, and nobody reads reports that always look the same.",
    k: ["Push reports by email vs link to a live view: push reaches people and spreads data to inboxes; links keep access control and are rarely opened.", "Run at business start vs overnight: business start gives fresh numbers and loads the cluster; overnight is cheap and a day old."],
    p: ["A report scheduled by a departed employee keeps sending sensitive data to a list that has since changed.", "Many reports scheduled at 8 a.m. slow down every analyst starting their day."],
    v: "Schedule a report for two recipients with different permissions and confirm each receives only data they may see, delivery is on time, and a failed run notifies the owner.",
    dep: ["saved-searches-and-dashboards", "access-control"]
  },
  "audit-log-integrity": {
    s: "Proof that stored logs have not been altered or deleted since collection, using hashes, signatures and write-once storage, with a verifiable chain from source to report.",
    d: "Events are hashed in batches, each batch hash chains to the previous, and the chain head is signed or stored externally, so any later change breaks verification. Storage may be immutable for a retention period. A verification job periodically checks the chain, and reports gaps. Integrity at the SIEM does not prove integrity at the source, where an attacker with local access may have edited the log before collection. Key protection and clock trust are essential.",
    k: ["Hash chain with external anchoring vs relying on access controls: chains detect tampering by administrators and need key and anchor management; access controls are simple and trust the administrators.", "Immutable storage vs deletable with audit: immutable cannot be altered even by mistake and complicates privacy deletion."],
    p: ["The signing key lives on the same server as the logs, so an attacker who gets in can re-sign altered data.", "Integrity checks that never run give assurance that no one has ever tested."],
    v: "Alter one event in a stored batch in a test copy and run verification. Confirm it identifies the exact batch, and confirm verification of the untouched data passes and is itself logged.",
    dep: ["log-integrity-and-trust", "hot-tier"]
  },
  "retention-evidence": {
    s: "Demonstrating that data was actually kept for the required period, with reports of the oldest event per source, lifecycle job logs and proof that deletions followed policy.",
    d: "Policies are only claims until shown. Evidence reports list for each source the earliest and latest retained event, the volume per period, the lifecycle jobs that ran and what they deleted. Gaps in the series show collection failures. Auditors ask for a sample from the start of the period. Difficulty is that deletion is automatic and silent, backups can retain data past policy, and tier moves may leave data present but unsearchable.",
    k: ["Continuous evidence reports vs gathering at audit time: continuous finds problems early at small cost, audit-time is cheaper until a gap is discovered.", "Verify by sampling vs by complete manifest: sampling is cheap and probabilistic, a manifest proves everything at storage cost."],
    p: ["A source onboarded with the default short retention is audited a year later with only 30 days.", "Backups keep deleted personal data long after the policy says it is gone."],
    v: "For each regulated source, query the oldest retained event, confirm it is at least as old as the required period, and compare daily counts across the period to detect gaps.",
    dep: ["retention-policies", "archive-and-rehydration"]
  },
  "detection-metrics": {
    s: "Measurements of how well the security operation performs: time to detect and respond, alert volume and precision, source coverage, rule health and analyst workload.",
    d: "Metrics come from alert and case records: how long from event to alert, alert to first touch, and detection to containment; what share of alerts were true; which sources and techniques have working rules. Trends guide staffing, tuning and investment. They are easily misread. Time to detect depends on knowing when the attack began, true-positive rate depends on honest dispositions, and a metric made a target is gamed, by closing alerts faster instead of better.",
    k: ["Few outcome metrics vs many operational ones: outcome metrics tie to risk and are slow and noisy; operational ones are frequent and can be optimized without improving security.", "Measure from alert time vs from event time: alert time is easy, event time shows true delay including pipeline lag."],
    p: ["Reporting mean time to close rewards closing alerts unread.", "Averages hide the long tail of incidents that took weeks."],
    v: "Compute time to detect for ten past incidents from the actual first malicious event, compare it to the figure the dashboard shows, and investigate any difference.",
    dep: ["case-management", "triage-queue", "technique-mapping"]
  },
  "coverage-and-blind-spots": {
    s: "What you collect determines what you can detect. Coverage of sources, hosts, accounts and cloud environments decides the ceiling of every rule above it, and silent gaps are the usual failure.",
    d: "Detection can only use data that arrived. A missing source, a host without an agent, a disabled audit setting or a new cloud account is a blind spot, and attackers look for them. Coverage must be measured: an inventory of what should report compared with what does, and a map from attacker techniques to the data they would leave. It affects collection, normalization, rules and reporting alike, and it decays as the estate changes without anyone telling the security team.",
    k: ["Collect broadly first vs collect per detection need: broad collection preserves investigative options at high cost; need-driven collection is cheaper and leaves unanticipated gaps.", "Inventory-driven coverage checks vs trusting onboarding: inventory comparison finds silent gaps, onboarding records only what was announced."],
    p: ["Coverage reported by the number of sources, not the share of assets reporting, hides most of the estate being dark.", "Audit logging disabled on a system by default means a perfect-looking SIEM sees nothing there."],
    v: "Compare the asset inventory with the set of sources that sent events in the last 24 hours, and list assets with none. Confirm each such gap has an owner and a decision.",
    dep: ["collector-management", "technique-mapping", "self-monitoring"]
  },
  "time-and-ordering": {
    s: "Every correlation, window and timeline assumes events can be placed in true order. Clock skew, time zones, delayed delivery and batch sources mean order must be derived and its uncertainty accepted.",
    d: "Each event has an occurrence time, set by a source clock that may be wrong, and a receipt time, set by the pipeline. Windows, sequences, baselines and timelines choose between them. Delays across collection paths reach minutes or hours for batch and cloud sources, so rules must tolerate lateness or miss attacks. Synchronized clocks help and are not guaranteed. The decision shows in parsers, streaming state, scheduled lookbacks, search and every report.",
    k: ["Event-time semantics vs arrival-time: event time models reality and requires waiting and watermarks; arrival time is simple and misorders delayed data.", "Fix skew centrally vs trust source clocks: central correction repairs drift, and can falsify the time of legitimately delayed data."],
    p: ["Alerts depending on order across two sources fail when one has a consistent minute of skew.", "A batch source delivering hourly makes every correlation involving it an hour late."],
    v: "Measure, per source, the difference between event time and receipt time over a week. Confirm each source's lateness is within the allowance used by the rules that depend on it.",
    dep: ["timestamp-handling", "stateful-windows"]
  },
  "cost-versus-visibility": {
    s: "Every event stored has a price in ingest, storage and search, and every event dropped is a possible blind spot. The balance between them is set once and revisited constantly.",
    d: "Volume grows faster than budgets. Choices include which sources to collect, which fields to keep, what to aggregate, how long each class stays in each tier, and how detections use cheap versus expensive stores. Cost drives filtering at the agent, tiered routing, retention and rule design. The trade is not symmetric: savings are visible in the next bill, the cost of a missing event appears only in the next investigation, which makes it easy to cut too far.",
    k: ["Cut volume upfront vs pay for retention: upfront filtering saves most and cannot be undone; long cheap retention preserves options and costs storage and slower search.", "Price-driven source choice vs detection-driven: price-driven is budget-safe and drops sources by size, detection-driven keeps what rules and investigations need."],
    p: ["Removing the largest source to meet budget removes the one most used in investigations.", "Cost optimization performed with no record of what was removed is impossible to review."],
    v: "For each of the top ten sources by volume, show its monthly cost, the rules that read it and the investigations that queried it last quarter, and review any source with high cost and no use.",
    dep: ["ingest-metering", "tiered-routing", "retention-policies"]
  },
  "signal-to-noise": {
    s: "A detection no one acts on has no value. False positives, duplicate alerts and low-value findings consume the analysts' limited attention, and the tuning loop determines whether real attacks are noticed.",
    d: "Alert volume is a budget set by analyst capacity, not by what the rules could find. Noise comes from loose rules, poor enrichment, missing context, duplicates and benign activity that looks malicious. Scoring, grouping, suppression, tuning and risk accumulation exist to spend attention on the most likely true threats. The effects accumulate: trust in alerts erodes, analysts begin closing by habit, and actual incidents are missed in the pile.",
    k: ["Tune for precision vs for recall: high precision keeps the queue manageable and misses subtle attacks; high recall catches more and floods people.", "Many specific rules vs fewer broad rules plus context: specific rules are precise and numerous to maintain, broad ones are manageable and noisy without enrichment."],
    p: ["Reducing alert counts by suppression hides real attacks together with noise.", "Counting alerts closed, not alerts correct, makes noise look like productivity."],
    v: "Sample 100 closed alerts across rules and have a senior analyst redo the dispositions. Compare with the original judgment and report agreement and the rate of true attacks closed as false.",
    dep: ["feedback-and-tuning", "alert-prioritization", "risk-accumulation"]
  },
  "log-integrity-and-trust": {
    s: "The SIEM is evidence. Logs can be forged, deleted or altered at the source and in transit, so each stage must be authenticated, tamper-evident and independent of the people whose actions it records.",
    d: "An attacker with host access can stop or edit local logs, and one with network access can inject events. Defenses are signed and authenticated transport, immediate forwarding off the host, hash chains, write-once storage and separate custody of audit data. The SIEM itself is a target because it holds the evidence and the credentials of many systems. The decision shapes collection, storage, access control, audit and automation: whom the system trusts, and what it can prove.",
    k: ["Trust source-reported events vs verify independently: trusting is simple and fails against compromised sources, verification through cross-source corroboration costs coverage.", "Administrators who can edit everything vs separation of duties: one-team control is fast, separation limits an insider or phished admin at the cost of coordination."],
    p: ["An attacker with administrator rights on the SIEM deletes the evidence of their own actions.", "Unauthenticated ingestion endpoints let anyone create events to frame a user or hide a real one."],
    v: "Attempt as a privileged test account to delete or alter stored events and the audit trail. Confirm the attempt fails or is detected by an independent copy, and an alert is raised.",
    dep: ["transport-reliability", "platform-audit"]
  },
  "data-sensitivity": {
    s: "Security logs contain personal data, credentials, business secrets and the details of vulnerabilities. Collecting everything for security conflicts with privacy duties, so the SIEM needs rules on what is kept, masked and who sees it.",
    d: "Authentication logs identify people, web logs hold addresses and search terms, application logs sometimes contain tokens or health and payment data. Law and policy limit collection, purpose, access and retention, and may restrict transfer across borders. Controls include field masking, tokenization, regional storage, role-based views and deletion on request. The decision touches collection filters, parsing, storage location, search permissions, case evidence and exports, and has to be settled with legal and privacy owners.",
    k: ["Mask at collection vs at display: collection masking prevents exposure and loses investigative detail forever; display masking keeps data and relies on access controls holding.", "Central global SIEM vs regional deployments: central gives one view and may break residency rules; regional complies and fragments correlation."],
    p: ["Application logs printing request bodies capture passwords and tokens, which are then searchable by every analyst.", "A personal-data deletion request cannot be fulfilled because data is spread over archives and cases."],
    v: "Search all tiers for a seeded fake credential and test personal record. Confirm masked or absent where policy requires, and that a deletion request removes the record from storage, archives and case evidence.",
    dep: ["data-level-security", "retention-policies", "legal-hold"]
  },
});
