// Details for the configuration management plate, part 1: operator interfaces and reporting.
ATLAS.details("config-management", {
  "cli-and-api": {
    s: "The command line and programmatic interface for triggering runs, querying nodes, validating code and reading results. Everything the console does is also available here, so automation can use it.",
    d: "A command line tool and a network API expose the same operations: compile a plan for a node, start a run on a set of nodes, query facts and status, and validate code. The API is authenticated and authorized per operator or per automation account, and returns structured results rather than text so pipelines can act on them. It is hard because long operations need job identifiers, progress polling and cancellation, and because the command line and API drift apart if they are written separately.",
    k: ["One API with the CLI as a thin client vs separate code paths: one API keeps behavior identical and testable; the CLI cannot work offline without extra effort.", "Synchronous calls vs job identifiers: synchronous is simple for small runs but times out on large ones; jobs need polling and retention."],
    p: ["A script treating a started job as a finished run reports success while nodes are still changing.", "Credentials for automation accounts get broad rights because narrowing them is tedious, and then leak."],
    v: "Start a run on three nodes through the API, poll the returned job until it finishes, and confirm the per-node results match what the node reports when queried directly.",
    dep: ["operator-access-control", "node-status-store"]
  },
  "web-console": {
    s: "A browser interface for browsing nodes, groups, reports and pending changes, and for triggering runs, intended for people who do not live on the command line.",
    d: "The console reads node status, facts, group membership and reports through the API and presents them as searchable lists, per-node pages and run timelines. Some consoles also edit group assignments and data, and start runs. It has to render the state of thousands of nodes quickly, which means pre-aggregated counts rather than live queries, and it must show staleness honestly: a node that has not reported in a day is not a green node. It inherits the access control of the API underneath.",
    k: ["Read-only console vs one that edits data: read-only is safer and simpler to audit; editing in a browser bypasses code review unless it writes back to version control.", "Live queries vs pre-aggregated summaries: live is exact but slow at scale; summaries are fast but can lag behind reality."],
    p: ["A console that shows the last reported state as current hides nodes that stopped checking in.", "Edits made in the console diverge from code in version control, so the next deploy silently reverts them."],
    v: "Stop the agent on one test node, wait past the expected check-in interval, and confirm the console marks the node as not reporting rather than showing its last success.",
    dep: ["cli-and-api", "node-status-store"]
  },
  "ad-hoc-commands": {
    s: "Runs a one-off command or small task across selected nodes immediately, outside the declared configuration, for investigation and emergency changes.",
    d: "An operator picks a set of nodes and a command, and the system runs it through the same transport and authentication as normal runs, then collects output and exit status per node. Because it bypasses the desired-state model, it is the escape hatch for incidents: restarting something, reading a log, checking a version. Good implementations limit it by role, record every invocation, and cap concurrency. The risk is that a change made this way is invisible to the declared state and will be reverted or forgotten.",
    k: ["Allowing ad hoc commands vs forbidding them: allowing them makes incidents faster; forbidding them keeps every change in code but pushes people to log in by hand.", "Running in parallel vs in small batches: parallel finishes sooner; batches limit the damage of a mistaken command."],
    p: ["A hand-applied fix is never written into the configuration, and the next convergence run undoes it mid-incident.", "A mistyped selector runs a destructive command against the whole fleet instead of one group."],
    v: "Run a harmless command against a selector matching exactly three nodes, and confirm output arrives from those three only and the invocation appears in the audit trail with the operator's identity.",
    dep: ["agentless-transport", "operator-access-control", "audit-trail"]
  },
  "change-review-workflow": {
    s: "The process that puts configuration changes through review, automated checks and approval before they reach any node, usually through proposed changes to the code.",
    d: "Changes are proposed as edits to the configuration repository, checked automatically by linting, compiling against sample nodes and running module tests, then reviewed by a person and merged. A release step promotes the merged code to the server environment that nodes read. Stronger setups show a preview of what each affected node group would change. The difficulty is making the preview trustworthy: a compile against sample data may miss the node that behaves differently, and review fatigue lets large diffs pass.",
    k: ["Review by repository merge vs approval in the console: merge review keeps one history; console approval is faster but splits the record.", "Per-environment promotion vs deploying from the main branch: promotion limits exposure to a bad change; deploying directly removes a step people must remember."],
    p: ["Review approves code that compiles cleanly but changes thousands of nodes in a way nobody previewed.", "Emergency changes skip the workflow, and the repository no longer describes what is deployed."],
    v: "Open a change that alters one value, and confirm the pipeline reports which node groups would change before merge, and that after release one named node actually converges to the new value.",
    dep: ["version-control-integration", "linting-and-style", "module-testing", "dry-run-mode"]
  },
  "operator-access-control": {
    s: "Decides which people and automation accounts may view nodes, change data, start runs or approve releases, scoped by node group and environment.",
    d: "Operators authenticate through a directory or token service and receive roles that map to permissions on API operations and node sets: view, edit data, run, approve, administer. Scoping by group matters more than the verb, because a run permission on production is a very different grant from one on a test group. Checks occur at the API so that every interface shares them. The hard part is that the system can change every machine, so its own permission model is part of the fleet's security boundary.",
    k: ["Coarse roles vs per-group scopes: coarse roles are easy to review; per-group scopes follow real responsibility but multiply entries to maintain.", "Standing access vs time-limited grants: standing access is convenient; time-limited grants shrink exposure but need an approval path during incidents."],
    p: ["Everyone who can edit data on any group can effectively run code as root on the fleet.", "A shared automation token has no owner, so access is never reviewed or removed."],
    v: "Using an account scoped to a test group, attempt to start a run on a production node and confirm the API refuses it and records the denied attempt.",
    dep: ["node-identity"]
  },
  "version-control-integration": {
    s: "Connects the system to the repository that holds configuration code and data, so merged changes are deployed automatically and every deployed state maps to a commit.",
    d: "Code and data live in version control, and a deploy mechanism copies chosen branches or tags into server-side environments, or nodes fetch them directly. Webhooks or pollers trigger the copy after a merge. Each node's report records the commit it ran, which makes questions like which nodes have the fix answerable. It is hard because deployment is a second copy of the repository, and a half-completed copy, or a server in the pool lagging behind, serves different code to different nodes.",
    k: ["Deploy on merge vs deploy on schedule: on merge is fast; scheduled deploys let people batch changes and keep quiet periods.", "Branches as environments vs tags per release: branches are simple; tags give an immutable name for exactly what ran."],
    p: ["Servers in a pool deploy at different moments, so two nodes in the same group compile different code.", "Large binary files in the repository slow every deploy and every node that fetches directly."],
    v: "Merge a one-line change, then compare the commit identifier reported by nodes in each server pool member with the repository head, confirming all reach it within the expected delay.",
    dep: ["plan-compiler"]
  },
  "event-hooks": {
    s: "Notifies other systems when runs finish, nodes change, or failures occur, so tickets, chat messages and pipelines can react without polling the configuration system.",
    d: "The system emits events after each run, on resource failure, on first check-in and on node removal, and delivers them through outbound web calls or a message queue. Consumers open tickets, post to chat, update an inventory database, or trigger the next stage of a deployment. Delivery needs retries and a record of failures, and the payload must not carry secrets. The risk is volume: a fleet-wide failure produces thousands of events at once, and a hook that creates a ticket per event buries the real signal.",
    k: ["Push events vs consumers polling reports: push is timely; polling is simpler to secure and cannot lose events.", "Per-resource events vs per-run summaries: per-resource events carry detail but multiply volume; summaries keep volume bounded."],
    p: ["A broken subscriber slows or blocks run completion because delivery was done in the request path.", "Event payloads include rendered file contents, and secrets end up in a chat channel."],
    v: "Fail one resource on a test node and confirm exactly one event reaches the subscriber with the node, resource and error, and that the payload contains no secret value.",
    dep: ["run-reports", "secret-redaction"]
  },
  "node-lifecycle-commands": {
    s: "Operations that add, rename, retire and clean up nodes: registering a new machine, removing its stored data, and revoking its credentials when it is decommissioned.",
    d: "A node enters the system through enrollment and leaves through a retirement command that deletes its stored facts and reports, removes it from groups and revokes its certificate or key. Without deliberate retirement, stale records accumulate and decommissioned machines retain valid credentials. Renames and rebuilds are the awkward cases: a rebuilt machine with the same name must prove it is the same node or be treated as a new one, and old secrets targeted at it must stop working.",
    k: ["Automatic expiry of silent nodes vs explicit retirement: expiry cleans up without effort but removes machines that are only temporarily offline.", "Reusing a name on rebuild vs issuing a new identity: reuse keeps history; a new identity is safer if the old credentials may be compromised."],
    p: ["A decommissioned machine keeps its credentials and can still fetch plans and secrets.", "Deleting a node's record while it is only offline makes it re-enroll as a stranger and lose its group membership."],
    v: "Retire a test node, then attempt a check-in from it with its old credentials and confirm the server refuses it, and that the node no longer appears in inventory queries.",
    dep: ["node-identity", "enrollment-and-signing", "node-status-store"]
  },
  "run-reports": {
    s: "A structured record of one convergence run on one node: which resources were checked, which changed, which failed, how long each took and which code version ran.",
    d: "At the end of each run the engine assembles a report listing every resource with its outcome (unchanged, changed, failed, skipped), the old and new values for changes, timings and the code version. The agent sends it to the server, which stores it and passes it to processors. Reports are the system's memory: they are how an operator proves a change landed and how drift is noticed. They are hard because they are large on big nodes, may contain sensitive values, and arrive late or not at all when a node is unreachable.",
    k: ["Report every resource vs only changes: full reports prove coverage but are large; change-only reports are small but cannot show what was checked.", "Send after the run vs stream during it: after-run is simple; streaming shows progress but needs a stable connection."],
    p: ["A report records the contents of a rewritten secret file as a change diff.", "Reports from failed runs are dropped because the failure also broke the reporting path, so the worst runs are invisible."],
    v: "Change one file on a test node by hand, run convergence, and confirm the report lists that file as changed with the old and new values, and every other resource as unchanged.",
    dep: ["apply-loop", "secret-redaction"]
  },
  "change-event-log": {
    s: "A queryable history of individual resource changes across the fleet: what changed, on which node, in which run, and under which code version.",
    d: "Distinct from whole-run reports, the event log stores one row per actual change, indexed by node, resource type, time and commit. It answers questions such as which nodes had this file modified last week, or what changed on this machine before the outage. It is written from run reports by a processor and kept for a retention period. The challenge is volume and cardinality: a fleet-wide template change produces one event per node, and a fact that changes every run, such as a timestamp in a file, floods the log with noise.",
    k: ["Store every change vs sample: every change allows exact forensics; sampling saves space but loses the single event that mattered.", "Index by resource title vs by a stable resource identity: titles are readable but collide; stable identities survive renames."],
    p: ["A resource that changes on every run, because its content includes a timestamp, buries real changes in noise.", "Retention shorter than the incident review period leaves no history when it is needed."],
    v: "Make one deliberate change through the code, and confirm a query for that resource over the last hour returns one event per affected node and none for unaffected nodes.",
    dep: ["run-reports", "state-database"]
  },
  "node-status-store": {
    s: "The server-side record of each node's last check-in, last run outcome, code version and key facts, used by consoles, queries and rollout decisions.",
    d: "Each report updates a compact status row for the node: when it last reported, whether the last run was clean, changed or failed, and which commit it ran. Rollout logic and consoles read these rows to decide what is healthy. The store is kept small and fast by design, separate from the bulky report history. The difficulty is deciding what stale means and handling nodes that report irregularly, such as laptops or intermittently connected devices, without constant false alarms.",
    k: ["A separate status table vs deriving status from reports: a separate table is fast to read; deriving it avoids a second source of truth.", "Fixed staleness threshold vs per-node expected interval: fixed is simple; per-node avoids false alarms for devices that check in rarely."],
    p: ["A node reports success but with a code version several releases old, and a status that only shows green hides it.", "Status rows for retired nodes remain and distort fleet-wide counts."],
    v: "Query status for every node in a group and confirm the count of nodes on the latest commit, nodes failed and nodes silent adds up to the group's membership.",
    dep: ["state-database"]
  },
  "drift-reports": {
    s: "Summaries of where actual state has moved away from the declared state between runs, showing which resources were corrected and how often.",
    d: "Drift is visible when a run changes a resource nobody changed in code. Aggregating these corrections by resource and node shows which settings are being altered by hand, by other software, or by a competing automation. A drift report ranks them, so repeated corrections point to a conflict worth resolving rather than a value to keep overwriting. Detecting drift without changing anything requires a dry run mode. The harder question is attribution: the report shows that a value changed, rarely who changed it.",
    k: ["Correct drift automatically vs report only: automatic correction restores the standard; report-only is safer where a manual change may be deliberate.", "Report per node vs per resource across the fleet: per node helps one machine's owner; per resource reveals systematic conflicts."],
    p: ["A resource flip-flops between two competing managers, and each run reports a change that looks routine.", "Reports show drift on a field the code does not fully manage, and operators blame the wrong tool."],
    v: "Edit a managed setting by hand on a test node, run in report-only mode, and confirm the drift report names that node, resource and field without changing the setting.",
    dep: ["drift-detection", "run-reports"]
  },
  "compliance-scanning": {
    s: "Checks nodes against a defined baseline, such as a security standard, and reports which controls pass or fail, either by running the desired state in audit mode or by scanning separately.",
    d: "Controls from an external benchmark are encoded as resources or as read-only checks and run against each node, producing a pass or fail per control with evidence. Reusing the same resource engine means the baseline can also be enforced, not just measured. Results feed compliance reports with exceptions and waivers recorded. It is hard because benchmarks assume specific platform versions, because some controls cannot be read without privileged access, and because an exception must be tracked with an expiry so waivers do not become permanent.",
    k: ["Audit with the same engine vs a separate scanner: the same engine ties checking to enforcement; a separate scanner gives independent evidence.", "Enforce controls vs only report: enforcing closes gaps quickly but can break applications; reporting leaves risk open."],
    p: ["A control passes because the check reads the declared value, not the actual one on the node.", "Waivers have no expiry and the exceptions list grows until it no longer means anything."],
    v: "Weaken one controlled setting on a test node, run the scan, and confirm that exactly that control fails with the observed value as evidence, then restore it and confirm the control passes.",
    dep: ["dry-run-mode", "state-comparison", "run-reports"]
  },
  "alerts-and-notifications": {
    s: "Turns failed runs, silent nodes and unexpected changes into messages for the right people, with thresholds that separate real problems from routine noise.",
    d: "Rules watch run outcomes and node status: a node failing three runs in a row, a node silent past its interval, a failure rate across a group above a threshold, or a change to a protected resource. Alerts go to chat, paging or email via event hooks. Good rules alert on rates and patterns, not single events, and group related failures into one message. The difficulty is calibration: a fleet always has a few failing nodes, so naive alerts either never stop or are ignored.",
    k: ["Alert per node vs per group pattern: per node catches individual faults; per group avoids hundreds of identical pages during a fleet-wide failure.", "Alert on any failure vs on persistence: any failure is noisy because transient errors are common; persistence lowers noise but delays detection."],
    p: ["A single bad change fails every node and produces thousands of pages that bury the cause.", "Alerts route to a former owner of the group, and nobody acts on them."],
    v: "Break one test node's package source so its runs fail, and confirm an alert fires after the configured number of consecutive failures, once, and clears after a clean run.",
    dep: ["node-status-store", "event-hooks"]
  },
  "audit-trail": {
    s: "A tamper-resistant record of who changed configuration, data, groups and access, and who started runs, kept separate from run reports.",
    d: "Every action by a person or automation account, such as merging a change, editing a group, starting a run, approving a release or reading a secret, is recorded with identity, time, target and result. The trail answers who was able to change production on a given date. It is shipped to storage the operators cannot edit. It is hard because actions arrive from several interfaces, the repository history is only part of the story, and recording too much makes the trail unreadable.",
    k: ["Record in the application vs in an external log service: internal is easy; external resists tampering by the same administrators it audits.", "Log reads of sensitive data vs writes only: logging reads detects snooping but is large; writes-only misses disclosure."],
    p: ["Administrators can delete their own audit entries because the log lives on the server they control.", "Shared accounts make entries say that the automation user did something, without saying who triggered it."],
    v: "Perform one data edit and one run start through different interfaces, and confirm both appear in the external log with the individual operator's identity and the exact target.",
    dep: ["operator-access-control"]
  },
  "report-export": {
    s: "Sends reports, facts and status to external systems such as search indexes, asset inventories and analytics stores, so other teams can use the data without querying the configuration server.",
    d: "Processors take finished reports and facts and forward them in batches to external stores, usually as structured documents. The asset database learns what is installed where, the search index serves incident responders, and a warehouse supports trend analysis. Export runs asynchronously so a slow downstream never delays runs. It is hard because schemas change, because facts may include sensitive information, and because the external copy can silently fall behind or lose records.",
    k: ["Streaming export vs periodic batch: streaming is current but needs retry and ordering; batch is simple but delays answers.", "Export raw documents vs a normalized subset: raw keeps everything for later questions; a subset is smaller and easier to secure."],
    p: ["Export fails quietly for a week and an external inventory is wrong without anyone knowing.", "Facts containing user names or network addresses are exported to a store with a wider audience than intended."],
    v: "Run convergence on a test node and confirm the external store contains a document for that run, with the same commit and resource counts as the server's own report, within the expected delay.",
    dep: ["run-reports", "work-queue"]
  }
});
