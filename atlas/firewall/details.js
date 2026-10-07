// Details for the firewall plate, part 1: management and change control, logging and counters.
ATLAS.details("firewall", {
  "config-model": {
    s: "The structured representation of policy and device settings: a typed tree or object graph that every interface, command line, API and file import reads and writes.",
    d: "Rules, objects, zones, interfaces and system settings live in one schema with types, ranges and references between entries. The command line, the graphical interface and the programmatic API are all views of that one model, so a rule created in one appears in the others. The model validates references, such as a rule naming an object that does not exist. It is hard to evolve: old configurations must still load after the schema changes, and defaults must stay stable across versions.",
    k: ["One schema behind every interface vs separate models per interface: consistent behavior and one validator, but the schema becomes a compatibility contract that is expensive to change.", "Declarative desired state vs imperative commands: declarative files diff and replay cleanly, while imperative commands are easier to learn and harder to audit."],
    p: ["A default that changes between releases silently alters behavior of an unchanged configuration after upgrade.", "Interfaces that expose different subsets of the model let an administrator set something the other views cannot display."],
    v: "Create a rule through the API, then confirm the command line and the graphical view show identical fields. Export the configuration, import it on an empty device and confirm a byte-identical re-export.",
    dep: []
  },
  "candidate-commit": {
    s: "A two-stage change process: edits go to a candidate copy that is validated as a whole, then committed atomically so the running policy never holds a half-finished edit.",
    d: "Edits are staged in a candidate configuration that nobody's traffic uses. On commit, the device runs validation on the whole set, compiles the new ruleset, and only then makes it active in a single step. Multiple administrators may hold separate candidates or lock one. The hard part is that validation must be cheap to run but complete enough to catch references, overlaps and resource limits, and compilation of a large policy can take seconds to minutes.",
    k: ["Candidate then commit vs apply each command live: whole-change validation and atomic cutover, but edits are invisible until commit and concurrent editors conflict.", "Exclusive lock vs merge of concurrent candidates: a lock is simple and safe, while merging lets teams work in parallel and can combine two individually correct changes into a wrong one."],
    p: ["A candidate left uncommitted for days drifts from the running configuration and later commits unrelated old edits.", "A commit that compiles slowly stalls management access exactly when the operator expects an answer."],
    v: "Stage a change that references a missing object and confirm commit is refused with the reference named. Stage a valid change and confirm traffic matching the new rule changes behavior only after commit completes.",
    dep: ["config-model", "rule-parser", "atomic-ruleset-swap"]
  },
  "auto-revert": {
    s: "A safety net that restores the previous configuration automatically if the administrator does not confirm within a time limit, protecting against changes that cut off management access.",
    d: "A commit can be made provisional: the new policy goes live and a timer starts. If the operator reconnects and confirms, the change is kept; if not, the device reloads the last known good configuration. Some systems also revert when health checks fail, such as loss of the default route. The hard part is defining what counts as confirmation, since the operator may be locked out only from one path, and making revert itself reliable when the state it restores no longer matches current flows.",
    k: ["Timed confirm vs permanent commit: protects against self-inflicted lockout, but a legitimate change can be undone mid-maintenance if the operator is slow.", "Automatic health-triggered revert vs manual rollback: faster recovery without a person, but a flapping check can revert correct changes repeatedly."],
    p: ["Revert drops flows that the new policy had allowed and the old one did not, so users see resets they cannot explain.", "A confirm timer shorter than commit compilation time reverts before the change is even active."],
    v: "Commit a rule that blocks the management address with a 120 second confirm window, do not confirm, and verify access returns after the timer and the log records the automatic revert.",
    dep: ["candidate-commit", "config-versioning"]
  },
  "change-approval": {
    s: "A workflow that requires review and sign-off, from a second person or a ticket, before a policy change reaches production, with the approval recorded alongside the change.",
    d: "A change request names the rule edits, the business reason and the requester. A reviewer sees the diff, the analysis of shadowing and impact, and approves or rejects. Approved changes are scheduled or pushed by an automated job rather than typed again by hand, so what was reviewed is what runs. The system keeps the chain of who asked, who approved and who applied. The challenge is friction: a process that takes weeks teaches teams to request overly broad rules or to bypass the workflow.",
    k: ["Mandatory second-person review vs trusted individual changes: catches mistakes and abuse, but adds delay that pushes people toward wider, riskier rules.", "Pipeline applies the approved diff vs administrators re-enter it: prevents drift between review and reality, but requires the pipeline itself to be secured."],
    p: ["Emergency changes made on the device outside the workflow are never reconciled and become the real policy.", "Reviewers approve diffs they cannot evaluate because the diff shows object names, not the addresses behind them."],
    v: "Submit a change, confirm it cannot be applied without approval, approve it, and verify the applied configuration equals the reviewed diff and the record names requester, approver and time.",
    dep: ["config-versioning", "change-impact-analysis", "rule-metadata"]
  },
  "rule-metadata": {
    s: "The descriptive fields attached to each rule: owner, purpose, ticket reference, creation date and expiry, so a rule can be traced to a reason years later.",
    d: "Each rule carries a name, a free-text description, an owner team, a link to the request that created it, tags and optionally an expiry date. Metadata is stored with the rule so it survives export and review. Tools use it to route recertification questions, to flag expired rules and to attribute hit counters to a business service. The difficulty is keeping it honest: fields are optional, copied from neighboring rules and rarely updated, so after a few years they are plausible and wrong.",
    k: ["Required metadata fields vs optional: enforces traceability at creation, but people fill required fields with placeholders to get past the check.", "Expiry date by default vs open-ended rules: temporary access stops being forever, but legitimate long-running access needs renewal work that someone must own."],
    p: ["A rule whose owner left the company has nobody to ask, so it is never removed.", "Descriptions copied from a template hide that the rule was widened later."],
    v: "Create a rule without an owner and confirm commit refuses it. Set an expiry in the past and confirm the rule is flagged in the report and the owner receives a recertification request.",
    dep: ["config-model"]
  },
  "central-management": {
    s: "A server that holds policy for many firewalls, assigns it to devices or groups, pushes it and collects logs and status, so fleets stay consistent.",
    d: "The manager keeps shared policy layers, device-specific rules and object libraries, and compiles or pushes the result to each device over an authenticated channel. It tracks version and compliance per device and can detect drift where someone changed a device locally. Logs and health flow back. The hard parts are scale and partial failure: pushes to hundreds of devices will partly fail, devices may be offline, and the manager becomes a high-value target whose compromise changes every firewall.",
    k: ["Manager pushes policy vs devices pull: push gives immediate rollout and ordering control, while pull works through restrictive networks and avoids exposing device management ports.", "Local changes allowed vs manager-only: emergency fixes stay possible, but drift appears and the next push overwrites them."],
    p: ["A push that succeeds on 90 percent of devices leaves the fleet on two policies with no clear record of which.", "The manager credential or API is reachable from a flat network, making the management server a single point of takeover."],
    v: "Push a changed object to a group of devices with one unreachable, and confirm the report shows each device's version, the failed one is marked pending and it converges when reconnected.",
    dep: ["management-access", "config-versioning", "policy-layers"]
  },
  "management-access": {
    s: "How administrators reach the device: dedicated management interfaces, authenticated encrypted sessions, role-based permissions and audit of every login and command.",
    d: "Management is exposed through a command line over an encrypted channel, a web interface and an API, each bound to a management interface or a restricted set of source addresses. Administrators authenticate through a central directory with multi-factor checks and receive roles limiting what they can edit. Every login and command is logged to a remote store. The challenge is that the firewall guards a network yet also runs services reachable from it, so management must be separated from data traffic and from the policy it controls.",
    k: ["Out-of-band management network vs in-band access: out-of-band survives policy mistakes and keeps the surface off data networks, but costs dedicated cabling and addressing.", "Role-based least privilege vs shared admin accounts: accountability and containment, at the cost of role design and slower emergency access."],
    p: ["A management interface left open to the internet is found by scanners within hours and attacked with default credentials.", "A local break-glass account with a shared password is never rotated or audited."],
    v: "From an untrusted zone, attempt to connect to each management service and confirm refusal. From the management network, log in as a read-only role, attempt an edit, and confirm refusal and a logged attempt.",
    dep: ["hook-points", "local-traffic-path"]
  },
  "config-versioning": {
    s: "A history of every committed configuration with who changed it and when, supporting comparison between versions, retrieval of any past state and audit.",
    d: "Each commit produces an immutable snapshot or a delta stored on the device and often in an external repository. Tools compute a structured diff between any two versions, showing rules added, removed, moved or edited. Snapshots can be reloaded to restore a past policy. The hard part is making the diff meaningful: object expansion and reordering produce large textual differences for small intent changes, and secrets in the configuration must be protected in stored history.",
    k: ["Structured semantic diff vs plain text diff: shows moved and edited rules clearly, but needs a canonical form and maintenance for every schema change.", "Full snapshots vs deltas: snapshots are simple to restore and verify, while deltas save space but chain into long dependent histories."],
    p: ["Version history kept only on the device is lost together with the device in the failure it was meant to survive.", "Stored snapshots include pre-shared keys and credentials readable by anyone who can read history."],
    v: "Make three commits, then diff the first against the third and confirm the output lists exactly the edited, added and reordered rules. Restore the first version and confirm behavior matches it.",
    dep: ["config-model"]
  },
  "rule-hit-counters": {
    s: "Per-rule packet and byte counters, plus last-hit time, showing which rules are actually used and how much traffic each carries.",
    d: "Each compiled rule has counters updated when a packet or new flow matches it. To keep the hot path cheap, counters are usually per core and summed when read, and some systems count only new flows against the rule while later packets are counted in flow state. Last-hit timestamps feed recertification and unused-rule reports. The challenge is accuracy after compilation: merged or reordered rules must still attribute hits to the original rules the administrator wrote.",
    k: ["Per-core counters summed on read vs a shared atomic counter: no contention on the fast path, but reads are slightly stale and cost an aggregation.", "Count per packet vs per new flow: per packet shows true load, while per flow is cheap and matches how stateful rules actually decide."],
    p: ["Counters reset on policy recompile, so a rule looks unused after any unrelated commit.", "Counting new flows only makes a long-lived heavy session invisible against its rule."],
    v: "Send exactly 100 packets matching one rule over a new flow and confirm that rule's counter shows the expected packets and bytes, while neighboring rules stay unchanged and last-hit time updates.",
    dep: ["rule-ordering", "flow-table"]
  },
  "drop-reason-counters": {
    s: "Counters that classify every discarded packet by cause: policy deny, invalid state, spoofing check, resource limit, malformed header, so operators can tell attacks from faults.",
    d: "Every point in the path that discards a packet increments a named counter for that reason. Reasons span policy verdicts, failed sanity checks, state mismatch, table full, rate limit exceeded and unsupported protocol. Operators compare them over time to see what changed, and monitoring alerts on sudden jumps in a class. The difficulty is coverage and naming: a drop site with no counter is invisible, and a single generic reason hides whether the cause is a bad rule or a broken peer.",
    k: ["Fine-grained reason codes vs one generic drop counter: precise diagnosis, but more code on hot paths and a vocabulary that must stay stable.", "Per-interface and per-zone counts vs global totals: localize the source of a problem, but multiply the number of series to export."],
    p: ["A drop path added later forgets to count, so a new failure looks like traffic that never arrived.", "Alerting on an absolute drop count fires constantly on busy edges and is ignored."],
    v: "Send an out-of-window TCP segment, a spoofed source and a denied flow, and confirm three different counters increase by one each with names that match the cause.",
    dep: ["ingress-sanity", "default-action"]
  },
  "traffic-log": {
    s: "A record per flow or per denied packet with addresses, ports, zone, rule, action, bytes and application, used for forensics, billing and troubleshooting.",
    d: "On a flow event the data path builds a record and queues it to a logging process, which formats it and sends it to storage. A record names the matching rule, the ingress and egress zones, translated addresses, byte counts and duration. Fields come from state, so they are richer for stateful flows than for stateless filtering. The challenge is volume: a busy gateway produces millions of records per hour, and any logging that blocks the data path turns a logging outage into a traffic outage.",
    k: ["Log every flow vs only denies and selected rules: complete forensics, against storage and processing cost that grows with traffic.", "Asynchronous queue vs synchronous write: the data path never waits on storage, but records are lost when the queue overflows."],
    p: ["Logging a rule that matches all traffic during an incident fills the queue and drops the very records needed.", "Records omit the pre-translation address, so investigators cannot map a public address back to an internal host."],
    v: "Open one allowed and one denied connection, then find both records in the log with correct rule names, zones, translated and original addresses and byte counts that agree with a packet capture.",
    dep: ["rule-hit-counters", "flow-table", "log-timing"]
  },
  "log-timing": {
    s: "The choice of when a flow record is written: at session start, at session end, or both, with different cost, completeness and usefulness for incident response.",
    d: "Logging at start records intent immediately, which helps catch connections still open during an investigation, but byte counts and duration are unknown. Logging at end gives complete totals and reason for closing, but long-lived sessions do not appear until they finish, possibly days later. Many devices log both, or emit periodic updates for long flows. The difficulty is that start logs double the volume and end logs depend on the device staying up to see the close.",
    k: ["Start and end records vs end only: gives live visibility and full totals, but doubles event volume and requires correlating two records.", "Periodic interim records for long flows vs none: bound the delay for seeing long sessions, with extra records for every idle connection."],
    p: ["A device that fails over mid-flow never writes the end record, so the flow has a start and no end.", "An analyst looking for an ongoing intrusion finds nothing because the log has only end records."],
    v: "Hold a connection open for ten minutes with end-only logging and confirm no record exists until close; switch to start and end and confirm a record appears immediately and a second with totals at close.",
    dep: ["flow-table", "timeouts-and-aging"]
  },
  "log-rate-limiting": {
    s: "Limits on how many log events per second are generated or exported, so an attack or scan cannot overwhelm the logging path or the collector.",
    d: "Limits apply per rule, per source or globally, with token buckets and aggregation. Instead of one record per dropped packet, the device writes a first record and a periodic summary such as repeated 5000 times. Some devices raise a counter and sample records. The hard part is not losing the signal: aggregation must keep the distinct sources and destinations that matter, and rate limits that apply globally let one noisy rule starve the log for rules that matter more.",
    k: ["Aggregate repeated events vs drop excess silently: preserves a count and the first example, but loses per-packet detail forensics might want.", "Per-rule budgets vs one global budget: noisy rules cannot starve others, but budgets need tuning and can hide an attack on a quiet rule."],
    p: ["A global limit shared by all rules lets a scan consume the budget so an unrelated denial is never logged.", "Dropped log events are not counted anywhere, so operators assume the log is complete."],
    v: "Generate 100000 denied packets from one source in a minute and confirm the log holds a bounded number of records with a summary count near 100000 and a counter showing suppressed events.",
    dep: ["traffic-log", "rate-limiting"]
  },
  "log-export": {
    s: "Reliable delivery of logs to external collectors over standard transports, with formatting, buffering during outages and protection against tampering.",
    d: "A logging process formats events as structured text or binary records and sends them over reliable or best-effort transports to one or more collectors. It buffers while the collector is unreachable, to memory or disk, with a bounded size. Transport security protects confidentiality and authenticity. Timestamps need synchronized clocks and stated time zones. The difficulty is the trade between reliability and independence: a firewall that blocks on log delivery is easily disrupted, while one that drops freely loses evidence.",
    k: ["Reliable stream with disk buffer vs datagram fire-and-forget: survives short collector outages, but needs disk and a policy for what to drop when full.", "Structured fields vs free text: collectors parse structured records reliably, while text is simpler to produce and breaks when formats change."],
    p: ["Clock drift of a few minutes puts events in the wrong order and breaks correlation with other systems.", "Logs sent in clear text over the network they monitor can be read or altered by an intruder on it."],
    v: "Stop the collector for five minutes while traffic flows, restart it, and confirm every record from the outage arrives in order with correct timestamps, and that a counter shows how many were buffered.",
    dep: ["traffic-log", "health-metrics"]
  },
  "flow-export": {
    s: "Summarized per-flow records exported in a standard template format for capacity planning, anomaly detection and security analytics without full packet capture.",
    d: "The device samples or fully tracks flows and exports template-based records containing addresses, ports, protocol, byte and packet counts, interfaces and timestamps to analytics collectors. Records are emitted when flows end or on an active timeout for long flows. Because the firewall knows about translation, it can export both inside and outside addresses. The challenge is scale and accuracy: full export from a busy device costs CPU and bandwidth, and sampled export cannot be used for per-flow accounting.",
    k: ["Sampled export vs full flow export: cheap and bounded, but small flows disappear and counts are estimates scaled by the sampling rate.", "Export from the flow table vs from a separate sampler: flow table records are accurate and include verdicts, but ties export load to the state machine."],
    p: ["Active timeout set too long delays visibility of a large transfer until it finishes.", "Exporting only post-translation addresses prevents mapping a flow to the internal host that caused it."],
    v: "Transfer a file of known size through the device and confirm the collector receives a record whose byte count matches the transfer within protocol overhead, with both original and translated addresses.",
    dep: ["flow-table", "nat-bindings"]
  },
  "health-metrics": {
    s: "Resource and liveness metrics from the device itself: CPU per core, memory, table occupancy, interface errors, temperature and queue depth, with thresholds and alerts.",
    d: "The device exports gauges and counters for everything that can run out: connection table fill, NAT port pools, packet buffer pools, rule memory, log queue length and interface errors. A monitoring system polls or receives them and applies thresholds, trends and alerts. The hard part is knowing which values matter: average CPU hides a single saturated core receiving a heavy flow, and table-full conditions begin as slow growth long before the first drop.",
    k: ["Per-core and per-pool metrics vs aggregate averages: reveals hot spots and exhaustion, but multiplies series and needs alerts per pool.", "Pull polling vs event push: polling is simple and detects a dead device, while push gives faster alerts and works through restrictive networks."],
    p: ["Alerting on average CPU misses one core pinned at 100 percent that is dropping its flows.", "Table occupancy alerts set at 100 percent fire only after new connections have already been refused."],
    v: "Fill the connection table to 90 percent with test flows and confirm an alert fires with the table name and percentage, before any new-connection drop counter increases.",
    dep: ["flow-table", "packet-buffer-pools", "port-allocation"]
  },
});
