// Details for the zero-trust access proxy plate, part 5: logging and audit, cross-cutting concerns.
ATLAS.details("zero-trust-proxy", {
  "access-decision-logs": {
    s: "A record of every allow or deny: who asked, from which device, for which application, which rule decided and why.",
    d: "Each decision writes an entry with a timestamp, user, device, application, action, matching rule, reason code, policy version and a request identifier shared with the denial page and flow logs. These logs answer why a person could or could not reach something, support policy simulation and feed detection. Volume is high, since every request produces one, so web traffic is often sampled for allows while denies are always kept. The entries must carry enough input detail to replay a decision without storing request content.",
    k: ["Log every allow versus sample allows: full logging gives complete investigations and costs storage; sampling is cheap and loses the one access you need later.", "Record decision inputs versus only the verdict: inputs allow replay and simulation and hold more personal data; verdicts are compact and cannot explain."],
    p: ["Missing the policy version in entries makes it impossible to say which rules produced a past decision.", "Logging queries and paths puts secrets and personal data in the log store."],
    v: "Make one allowed and one denied request, then find both by request identifier in the log with user, device, rule, reason and policy version, and confirm the replayed decision matches.",
    dep: ["policy-evaluation-engine","reason-code-taxonomy"]
  },
  "flow-and-session-logs": {
    s: "Records of connections and sessions over time: when they started and ended, bytes transferred, endpoints involved and why they ended.",
    d: "For each tunnel stream or long connection the proxy logs a start event and an end event with duration, volume, source device, application and termination cause. For sessions it records login, step-up, refresh and revocation. These provide the timeline an investigator needs and the volume data detection uses. They are produced at the edge and shipped asynchronously, so their loss must not block traffic, and they should be correlated to decision logs through identifiers.",
    k: ["Log at connection end versus at start and end: end-only is compact and loses connections that never end cleanly; both capture everything and double volume.", "Per-flow detail versus per-session summary: flows give precision and large volume; summaries are small and hide what happened inside the session."],
    p: ["Flows that never close, because a node crashed, leave no end record and appear to run forever.", "Clock differences between nodes make event order in the timeline wrong."],
    v: "Open a session, run several flows, kill one edge node mid-flow and confirm every flow has a start and an end record, with the crashed one marked as abnormally ended within a bounded time.",
    dep: ["tunnel-multiplexing","access-decision-logs"]
  },
  "admin-audit-log": {
    s: "A tamper-evident record of every change to configuration, policy, keys and administrator access, with who, what, when and from where.",
    d: "Each control plane action writes an entry with the actor, role, before and after values, source address and an approval reference when relevant. The audit log is separate from access logs because its readers and retention differ: auditors, security teams and incident responders. Reading sensitive data in the console should also be logged. It must be written before the change takes effect, and protected from the administrators it records, otherwise the people being watched can edit the record.",
    k: ["Write before commit versus after: writing first guarantees every change is recorded and can record changes that then fail; writing after is simple and can lose a record on a crash.", "Store with the control plane versus an independent store: independent storage resists tampering by control-plane administrators and adds an integration."],
    p: ["Administrators with database access can edit the audit trail they are being audited by.", "Entries recording only the new value make it impossible to tell what was changed."],
    v: "Change a policy rule and confirm the log has actor, previous and new values and source address. Attempt to edit or delete that entry as an administrator and confirm it is refused or detected.",
    dep: ["log-integrity-and-retention","admin-console-and-api"]
  },
  "siem-export": {
    s: "Streaming logs and events to the organization's security monitoring system in a documented format with delivery guarantees.",
    d: "Security teams correlate proxy logs with endpoint, identity and network data in their own tools. The proxy exports through a streaming interface, a storage bucket or a collector protocol, in a stable schema with versioning. Delivery must handle backpressure and outages without dropping events silently, and filtering lets teams remove noise and reduce cost. Field names and meanings should not change without notice, since detection rules depend on them.",
    k: ["Push to the destination versus let it pull: push is prompt and needs retry logic and credentials; pull is controlled by the consumer and adds delay.", "Raw events versus pre-filtered export: raw is complete and costly to store; filtered is cheaper and drops what a later investigation needs."],
    p: ["A broken export fails silently and the monitoring system sees no events, which looks like a quiet network.", "A schema change renames a field and every detection rule stops matching."],
    v: "Generate a known event, and confirm it reaches the monitoring system within the target delay with the expected fields. Stop the destination, restore it, and confirm the backlog arrives with no gap.",
    dep: ["access-decision-logs","flow-and-session-logs","admin-audit-log"]
  },
  "log-integrity-and-retention": {
    s: "Protecting logs from alteration and keeping them for as long as law and investigations require, then deleting them.",
    d: "Logs are written to append-only storage, with hashes or signatures chained so removal or edits are detectable, and with access split between those who write and those who read. Retention differs by log type and jurisdiction: audit logs may be kept for years, access logs for months. Deletion at the end of retention is as much a requirement as keeping, especially for personal data. Legal holds suspend deletion for specific cases and must be tracked.",
    k: ["Hash-chained append-only storage versus ordinary storage with permissions: chaining makes tampering detectable and adds complexity; permissions are simple and rely on trusting administrators.", "Long retention versus short: long supports investigations of slow attacks and holds more personal data and cost; short is lean and loses history."],
    p: ["Retention set once and never reviewed keeps personal data for years beyond the stated policy.", "Logs stored in the same account as the control plane are deleted by whoever compromises it."],
    v: "Modify a stored log entry in a test copy and confirm verification flags the break. Confirm entries older than the retention period are deleted on schedule and held entries are not.",
    dep: ["log-redaction"]
  },
  "log-redaction": {
    s: "Removing or masking sensitive values, such as tokens, query strings, personal data and payload content, before they are stored or exported.",
    d: "Logs capture URLs, headers and user details that often contain secrets: session identifiers in query strings, API keys in headers, names in paths. Redaction rules run at the point of logging, replacing values with a marker or a keyed hash that still allows correlation. Rules differ by field and by application. Redaction must happen before the data leaves the edge, because a downstream filter cannot remove what has already been copied. Overbroad rules make logs useless; underbroad ones create a store of credentials.",
    k: ["Redact at the edge versus downstream: edge redaction keeps secrets from ever being transmitted; downstream redaction is flexible and leaves a window where raw data exists.", "Mask completely versus hash for correlation: masking is safest and prevents following one value across events; hashing keeps correlation and permits guessing low-entropy values."],
    p: ["Tokens in query strings are logged in full and give anyone with log access a working session.", "A new header carrying credentials is not covered by any rule and is logged unredacted."],
    v: "Send requests carrying a fake token in a query string, a header and a body field, then search the stored logs and exports for the value. It must not appear, while the event is still correlatable.",
    dep: ["edge-listener-and-tls"]
  },
  "metrics-and-dashboards": {
    s: "Operational measurements, such as request rate, latency, denial counts and tunnel health, with dashboards and alerts for the people running the system.",
    d: "Counters and histograms record request volume, decision latency, denial counts by reason, session counts, tunnel and connector status, policy version per node and certificate expiry. Alerts watch for rising denials, falling traffic, version skew and exhausted capacity. Dashboards answer operational questions and show the user experience. Labels must have bounded cardinality: tagging by user or full path overwhelms the metrics system. A sudden jump in denials is the main signal of a bad policy push.",
    k: ["Rich labels versus bounded labels: rich labels allow detailed breakdowns and can break the metrics system; bounded labels are safe and answer fewer questions.", "Alert on symptoms versus on causes: symptom alerts catch what users feel; cause alerts give direction and miss new failures."],
    p: ["Per-user labels explode cardinality and take down the metrics store during an incident.", "No alert on the denial rate means a bad policy blocks everyone for an hour before anybody calls."],
    v: "Inject a policy that denies a test group and confirm the denial rate alert fires within its target time, the dashboard shows the reason code breakdown, and the alert clears after the rollback.",
    dep: ["access-decision-logs","flow-and-session-logs"]
  },
  "session-recording": {
    s: "Capturing the content of privileged sessions, such as shell commands or remote desktop video, for later review or investigation.",
    d: "For sensitive protocols the proxy records what happened inside the session: command text and output for shells, screen frames for desktop sessions, sometimes keystrokes. Recordings are stored encrypted, indexed by session and user, and accessed only through an approval process. They serve investigations and compliance, and they contain whatever was typed or displayed, including secrets and personal data. Recording is applied selectively, by application and role, and the users should know they are recorded.",
    k: ["Record all privileged sessions versus on demand: recording everything gives complete evidence and heavy storage and privacy burden; on-demand misses the incident nobody expected.", "Structured command logs versus raw video: structured logs are searchable and small and miss graphical activity; video is complete and hard to search."],
    p: ["Recordings capture passwords typed into the session and become a store of credentials.", "Nobody reviews recordings, so they accumulate cost with no detection value."],
    v: "Run a recorded shell session including a deliberate command, then find it in the recording index by user and time and replay it. Confirm the recording is encrypted and access to it appears in the audit log.",
    dep: ["ssh-and-rdp-proxying","log-integrity-and-retention","log-redaction"]
  },
  "latency-budget": {
    s: "The decision about how much delay the access layer may add to a request, and how each component is held to its share.",
    d: "The proxy sits on the path of every request, so users feel its cost directly. A typical budget gives the edge a few milliseconds for verification and decision, and more for the first connection, where TLS and session checks happen. Spending it means choosing local verification over remote calls, caching directory and posture data, and keeping heavy checks off the request path. Each added feature, like inspection or posture queries, draws on the budget, and the cost shows up as slower applications and a user revolt.",
    k: ["Local decisions with cached data versus fresh remote data: local keeps latency low and accepts staleness; fresh data is current and slows each request.", "Inline checks versus asynchronous checks: inline blocks before harm and adds delay; asynchronous is invisible to users and acts after the fact."],
    p: ["Each team adds one more synchronous lookup and the total grows until pages feel slow.", "The budget is measured at the edge only, missing the extra hop through the connector to the application."],
    v: "Measure the added latency of the proxy path against a direct path for a representative request set, at the 50th and 99th percentile, per layer, and compare each to its budget.",
    dep: ["edge-policy-cache","policy-evaluation-engine","directory-lookup-cache"]
  },
  "default-deny-trust-model": {
    s: "The principle that no request is trusted because of where it came from, and everything is refused until a rule allows it.",
    d: "The model removes implicit trust from network position: being inside the office or on the VPN grants nothing. Every request is authenticated, authorized for a specific application and evaluated with current context. Default deny applies to unknown applications, unknown devices and missing data. This changes how systems are built, because applications that assumed an internal network must now authenticate each caller. The principle is simple and hard to complete in practice, since every legacy shortcut, such as an allow-all rule for a network range, reintroduces implicit trust.",
    k: ["Strict per-application policy versus broad network allowances: per-application policy limits lateral movement and takes ongoing effort; broad allowances are quick and recreate a flat network.", "Trust decisions at the edge only versus also at the application: edge-only is simple and concentrates risk; defense in depth costs more and survives a proxy bypass."],
    p: ["An allow-all rule for the corporate range, added to make a migration easier, becomes permanent.", "Applications still listening on the internal network can be reached directly, bypassing the proxy."],
    v: "From inside the network, attempt to reach a protected application directly, bypassing the proxy, and confirm it is refused. Request an undefined application through the proxy and confirm it is denied by default.",
    dep: ["rule-ordering-and-default-deny","application-definitions"]
  },
  "failure-posture": {
    s: "How the system behaves when parts of it fail: what continues, what stops and who is told.",
    d: "Each dependency has a stated mode: the control plane can fail while the edge keeps working on cached policy, the identity provider can fail while existing sessions continue and new logins stop, the posture service can fail and use the last known state. Decisions about fail-open and fail-closed are made per dependency and per application in advance, and exercised in drills. Failure behavior is also a security property, since an attacker can try to cause the failure that opens a gap.",
    k: ["Degrade gradually versus fail all at once: gradual degradation keeps most work possible and needs more modes to test; all-or-nothing is simple and maximizes disruption.", "Plan and drill versus decide in the incident: planned modes are quick and may be wrong for the actual event; improvised decisions are flexible and slow."],
    p: ["The documented failure mode and the actual behavior differ because nobody tested them.", "An outage triggers break-glass access to everything for everyone, as the easiest path to recovery."],
    v: "Run a game day in which the control plane, identity provider and posture service each go down in turn. Confirm behavior matches the table, alerts fire, and recovery restores normal operation without manual cleanup.",
    dep: ["outage-failure-mode","edge-policy-cache"]
  },
  "least-privilege-scoping": {
    s: "The discipline of granting each person, device and service only the applications, ports and actions needed, for only as long as needed.",
    d: "Scoping shows up everywhere: application definitions that name specific ports, groups narrow enough to mean something, connectors that reach one network and not all, administrator roles per function and temporary grants that expire. The pressure runs the other way, because broad access is easier to configure and generates fewer complaints. Without regular review, access only grows. Reporting who can reach what, and removing grants that are never used, is the maintenance that keeps the model true.",
    k: ["Narrow grants with request workflows versus broad grants: narrow grants limit damage and create requests and approvals; broad grants are quiet and make every compromise large.", "Time-limited access versus standing access: time limits shrink exposure and add renewals; standing access is convenient and accumulates."],
    p: ["Groups grow by addition and are never pruned, until a group meant for ten people has two thousand.", "A connector deployed with access to a whole network makes every application there reachable if it is compromised."],
    v: "Produce a report of which users can reach each application and which of those used it in the last ninety days. Remove unused grants for one application in a trial and confirm no one reports a loss.",
    dep: ["user-and-group-conditions","access-request-workflow","connector-groups-and-routing"]
  },
  "privacy-and-data-residency": {
    s: "The decisions about what personal data the proxy sees and stores, where it is processed and who may read it.",
    d: "The proxy sees which users reach which applications and when, can decrypt content, and logs a detailed trail. That is sensitive for employees and customers. Design choices include which regions process traffic and logs, whether decryption is done at all for some categories, what is redacted, retention periods and who in the operator organization can read logs. Legal requirements vary by jurisdiction and affect where points of presence and storage may be, and which traffic is excluded from inspection.",
    k: ["Regional processing versus global processing: regional meets residency rules and fragments the service; global is simple and moves data across borders.", "Decrypt and inspect versus pass through: inspecting provides security visibility and exposes content; passthrough preserves privacy and loses control."],
    p: ["Logs from a regulated region are shipped to a global store, violating residency rules.", "Inspection of banking or health traffic from personal devices exposes data the organization has no right to read."],
    v: "Trace one user's traffic and logs from a regulated region and confirm every processing and storage location is within the allowed region. Confirm excluded categories are not decrypted.",
    dep: ["log-redaction","log-integrity-and-retention","points-of-presence"]
  },
  "migration-from-network-trust": {
    s: "The plan for moving from a network that trusts anything inside it to per-application access, without breaking what people rely on.",
    d: "Few organizations can switch over at once. A migration starts with the applications that are exposed or highest risk, runs the old and new paths in parallel, and moves users in groups. Policy is first written in report-only mode to see who uses what, then enforced. Applications that cannot be fronted, such as those using unusual protocols or embedded addresses, are handled case by case. The last step is closing the old path, which is the step teams skip, leaving the network trust in place beside the new system.",
    k: ["Report-only first versus enforce immediately: report-only reveals real usage and delays protection; immediate enforcement is secure and breaks forgotten dependencies.", "Application by application versus user group by group: by application gives clear progress and finishes slowly; by group delivers one experience and mixes many applications at once."],
    p: ["The old broad network path is left open, so the new controls can be bypassed indefinitely.", "Report-only mode never gets switched to enforcement because every week brings a new exception."],
    v: "For each migrated application, confirm the direct internal path is closed and only the proxy path works, and that report-only data showed no legitimate users who would be blocked on enforcement.",
    dep: ["policy-simulation","default-deny-trust-model","private-app-discovery"]
  },
});
