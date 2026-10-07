// Details for the progressive-delivery plate, part 1: governance, audit, orchestration, waves.
ATLAS.details("progressive-delivery", {
  "approval-gates": {
    s: "A pause in a pipeline that waits for a named person or group to approve before a release proceeds to the next stage, usually production.",
    d: "A gate is a stage whose job is to wait. It records who may approve, notifies them, and blocks the pipeline until a decision, a rejection or a timeout arrives. Approvals attach to a specific artifact and target, so approving one release does not cover the next. Gates read approver lists from the identity system and write the decision to the ledger. The hard part is making the approval informative: a person clicking through a gate with no diff, test result or risk summary adds delay without adding safety.",
    k: ["Manual gates before production vs fully automated promotion: manual gates add a human check and a bottleneck; automation is faster but depends entirely on the quality of automated checks.", "Approval per release vs per pipeline: per release is precise but slow; per pipeline is cheap but approves changes nobody has seen.", "Any-of vs all-of approvers: any-of keeps flow moving; all-of gives stronger assurance and stalls whenever one person is away."],
    p: ["Approvers click through without reading, so the gate becomes ceremony that slows every release equally.", "A gate left waiting over a weekend lets the artifact go stale while the main branch moves on."],
    v: "Start a release to production with no approval and confirm the pipeline stays paused. Approve as an unauthorized user and confirm rejection, then as a listed approver and confirm the stage runs and the ledger shows who approved.",
    dep: ["pipeline-definitions", "deployment-ledger", "identity-and-trust"]
  },
  "change-windows": {
    s: "Recurring time ranges during which production changes are allowed, so that releases land when staff are present and customer impact is lowest.",
    d: "A window is a calendar rule per environment or service: for example weekday business hours in the owning team's time zone. The scheduler checks it when a stage is about to start. A deployment that arrives outside the window either waits in the queue until the next open slot or requires an override. Windows can be per region, which makes global fleets complicated. They exist because the people who can fix a problem are not always awake, and because some businesses have predictable peak times.",
    k: ["Narrow windows vs continuous deployment: narrow windows reduce unattended risk but batch changes, making each release larger and harder to diagnose.", "Wait in queue vs reject outside window: queueing preserves work but may start a deploy at an unexpected hour when the window opens.", "Per-service vs central calendar: per-service fits local knowledge; a central one prevents conflicting changes across dependent systems."],
    p: ["Time zone and daylight-saving mistakes open or close a window an hour off from what the team intended.", "A queued release starts the moment the window opens, with nobody watching because they logged off earlier."],
    v: "Schedule a deployment 5 minutes before a window closes and another 5 minutes after, and confirm the first runs and the second is held with a reason showing the next open time.",
    dep: ["deployment-queue", "environment-definitions"]
  },
  "deployment-freezes": {
    s: "A temporary block on production changes, whole or partial, declared ahead of risky periods such as holidays, audits or major events.",
    d: "A freeze is a flag with scope, start, end and an owner, evaluated by the orchestrator before any stage touches the covered environments. Scope may be global, per service, per region or per class of change, such as allowing security fixes but not features. Exceptions pass through an override path that records who authorized them and why. Unlike a window, a freeze is usually declared once for an event rather than repeating. It is hard because fleets contain things that must still move, and an overly broad freeze encourages people to stage changes elsewhere.",
    k: ["Hard freeze vs freeze with exceptions: hard is simple to explain but blocks urgent fixes; exceptions need a trusted override path that can be abused.", "Freezing deploys vs freezing merges: freezing deploys leaves work to pile up; freezing merges keeps the next release small but stalls developers.", "Automatic freeze on incident vs manual: automatic stops compounding changes immediately; manual avoids freezes caused by noisy signals."],
    p: ["Changes queued during a freeze all go out the moment it lifts, producing a risky big-bang release.", "The freeze covers the pipeline but not direct console access, so changes still happen outside the audit trail."],
    v: "Declare a freeze on one environment, trigger a deployment to it and confirm it is refused with the freeze owner and end time shown. Trigger one to another environment and confirm it proceeds.",
    dep: ["pipeline-definitions", "environment-definitions", "emergency-override"]
  },
  "policy-checks": {
    s: "Automated rules evaluated against a proposed release or target that must pass before deployment, such as required scans, signed artifacts or allowed registries.",
    d: "A policy engine receives a structured description of the change: artifact digest, attestations, target environment, requester and manifest contents. It evaluates declarative rules and returns allow or deny with reasons. Checks run at pipeline time and often again at the admission point of the target platform, so a bypass of the pipeline is still caught. Rules come from a central repository so security and platform teams can change them without editing every pipeline. The difficulty is keeping rules understandable and testable, and avoiding false denials during an incident.",
    k: ["Central policy vs per-team rules: central policy gives uniform guarantees; per-team lets owners adapt but can drift into gaps.", "Pipeline-time vs admission-time enforcement: pipeline-time gives fast feedback; admission-time cannot be skipped. Most systems need both.", "Fail closed vs fail open when the policy service is down: closed protects but blocks all deploys; open keeps shipping with no checks."],
    p: ["A policy change is rolled out without testing and denies every deployment at once.", "Denials give no reason, so teams work around the check instead of fixing the cause."],
    v: "Submit a release whose artifact lacks a required signature and confirm it is denied with a message naming the rule. Add the signature and confirm the same release is allowed.",
    dep: ["provenance-attestations", "image-signing", "release-manifest"]
  },
  "separation-of-duties": {
    s: "A rule that the person who authored a change cannot be the only one to approve or release it, so that no single account can push code to production alone.",
    d: "The system compares the identity that authored the commits, the one that requested the release and the one that approved it, and rejects approvals where they coincide. In some regimes it also separates who may edit the pipeline from who may run it. Enforcement needs a reliable mapping from commits to people, which is hard with shared accounts, bots and co-authored work. It is usually mandated by audit frameworks, and its value depends on the second person actually looking.",
    k: ["Enforced by tooling vs by process: tooling cannot be forgotten; process adapts to small teams but leaves no proof.", "Author identity from commits vs from the request: commit identity catches the real author but can be spoofed in some setups; request identity is reliable but weaker.", "Strict rule vs exemption for small teams: strict is compliant but impossible with a team of one; exemptions need compensating controls."],
    p: ["A bot account opens and approves changes, so the rule is satisfied on paper while nobody reviews anything.", "Shared deploy accounts make author and approver indistinguishable in the ledger."],
    v: "As the author of a change, try to approve its production release and confirm refusal. Approve as a different eligible person and confirm success with both identities recorded.",
    dep: ["approval-gates", "audit-trail", "identity-and-trust"]
  },
  "emergency-override": {
    s: "A controlled path to bypass normal gates, windows or freezes for an urgent fix, with extra logging and review afterward.",
    d: "An override is a privileged action that skips selected checks for one release while still running the ones that cannot be skipped, such as artifact signature verification. It requires a stated reason, often a linked incident, and fires alerts to a wider audience than a normal deploy. Use is recorded for a post-incident review. It exists because every rule will eventually block something that must go out now. The difficulty is making it fast enough to be used honestly and costly enough not to become the normal route.",
    k: ["One break-glass role vs per-gate overrides: one role is simple to audit; per-gate overrides limit what an emergency can bypass.", "Immediate effect vs second-person confirmation: immediate is faster in a crisis; confirmation prevents misuse but may not be available at 3 a.m.", "Overriding the pipeline vs deploying out of band: overriding keeps the record; out-of-band access is faster but invisible."],
    p: ["Overrides become routine because the normal path is slower, and the audit trail fills with exceptions nobody reviews.", "Override skips artifact verification too, so an unvetted build reaches production during a crisis."],
    v: "Use the override during a freeze with a stated reason, confirm the deploy proceeds, that signature checks still ran, and that an alert and a review task were created.",
    dep: ["deployment-freezes", "approval-gates", "audit-trail"]
  },
  "risk-scoring": {
    s: "A computed estimate of how risky a change is, from size, touched components, author history and target, used to choose how much review and caution it gets.",
    d: "Inputs include lines and files changed, whether a migration or config change is included, the service's recent incident record, time since the last release and the proposed rollout scope. A rule set or model turns them into a score or tier. The tier selects a path: low risk may promote automatically, high risk adds approvals, a slower canary and longer bake time. It is hard because history is sparse and the score can become a target that people game by splitting changes.",
    k: ["Simple rules vs learned model: rules are explainable and easy to challenge; models may predict better but are hard to defend when they are wrong.", "Score selects the path vs informs the reviewer: automatic selection saves effort; advisory scores leave judgment with people but are often ignored.", "Per-change vs per-service risk: per-change is precise; per-service captures fragile systems that any change may break."],
    p: ["Teams split large changes into many small ones to stay under the threshold, creating the same risk with less scrutiny.", "A score trained on past incidents penalizes the services that report incidents most honestly."],
    v: "Submit one change touching a migration and core service, and one docs-only change. Confirm the first receives a higher tier with a listed reason, and a stricter rollout plan than the second.",
    dep: ["release-manifest", "deployment-ledger", "approval-gates"]
  },
  "change-tickets": {
    s: "A record in a change-management system that describes, justifies and authorizes a production change, linked to the release that carries it.",
    d: "Some organizations require every production change to reference a ticket stating what, why, risk and rollback plan. The pipeline either creates the ticket from release data or checks that a valid, approved one exists for the target and time. Ticket state then follows the deployment: opened, implemented, verified, closed. Integration is the hard part, because the ticket system and pipeline have different models of what a change is, and manual copying produces tickets that do not match what shipped.",
    k: ["Ticket created automatically vs by hand: automatic ones match reality and cost nothing; hand-made ones carry human judgment but drift from what was deployed.", "Ticket required to start vs recorded afterward: requiring first is safer and slower; recording afterward is fast but cannot prevent anything.", "One ticket per release vs per component: per release is manageable; per component is precise and multiplies the paperwork."],
    p: ["A single reusable standing ticket is cited for every release, which satisfies the check and records nothing.", "Ticket status is never updated after deploy, so the system shows implemented changes as pending."],
    v: "Start a production deploy referencing a closed ticket and confirm it is blocked. Reference an approved ticket and confirm it proceeds, then check the ticket shows implementation time and the deployed version.",
    dep: ["approval-gates", "deployment-ledger", "release-manifest"]
  },
  "approval-expiry": {
    s: "A time limit on an approval so that a release approved days ago must be reconsidered if conditions have changed.",
    d: "An approval is stored with the artifact digest, target and timestamp. Before the approved stage starts, the orchestrator checks it has not expired and that nothing it covered has changed: a new digest, a different target or an updated manifest invalidates it. Expiry may be a fixed duration or tied to events such as a new commit on the release branch. It prevents a stale approval from being used long after the context in which it was given has changed.",
    k: ["Short expiry vs long: short keeps approvals relevant but forces re-approval after any delay; long is convenient and weakens the meaning of consent.", "Invalidate on any change vs only material change: any change is safe but noisy; material-only needs a definition of material that attackers or mistakes may slip past.", "Revalidate at start vs at completion: at start is simple; checking at each step catches long rollouts whose approval lapses mid-way."],
    p: ["Approval is bound to a branch name rather than a digest, so new code is covered by an old yes.", "Expiry silently cancels a half-finished multi-region rollout, leaving the fleet on mixed versions."],
    v: "Approve a release, wait past the configured expiry and confirm the stage refuses to start. Push a new artifact digest under the same release name and confirm the earlier approval no longer applies.",
    dep: ["approval-gates", "immutable-artifact-ids"]
  },
  "deployment-ledger": {
    s: "The authoritative append-only record of every deployment: what version went where, when, who triggered it, and what the outcome was.",
    d: "Each deployment writes entries at start, at each stage transition and at the end: artifact digest, target, strategy, requester, approvals, result and links to logs. The ledger is queried to answer what is running in each environment, what was running at a given time, and what the previous good version was, which rollback depends on. It is written by the orchestrator, not reconstructed from logs. Difficulty comes from out-of-band changes and from keeping it consistent with the real cluster state.",
    k: ["Ledger as source of truth vs observed state: the ledger is authoritative for intent; only probing the target tells you reality, so both must be compared.", "Append-only vs mutable records: append-only is trustworthy for audit; mutable records are simpler to correct and easier to falsify.", "Central ledger vs per-region stores: central gives one view; per-region survives a regional outage and risks divergence."],
    p: ["Direct changes to the platform bypass the orchestrator, so the ledger shows a version that is not running.", "A failed write at the end of a deploy leaves a ledger entry stuck in progress forever."],
    v: "Deploy a version, then query the ledger for what runs in that environment and confirm it matches the live platform. Query for the state an hour earlier and confirm the previous version appears.",
    dep: ["immutable-artifact-ids", "environment-definitions"]
  },
  "audit-trail": {
    s: "A tamper-evident log of the actions taken on the delivery system itself: approvals, overrides, definition edits, permission changes and manual interventions.",
    d: "Where the ledger records deployments, the audit trail records the control actions around them: who edited a pipeline, changed an approver list, lifted a freeze or used the override. Entries are signed or chained so that alteration is detectable and are shipped to storage the delivery system cannot rewrite. Access to it is separate from access to the pipeline. It is hard to make complete: every path that can change behavior, including APIs, consoles and tokens, must write to it.",
    k: ["Stored inside the system vs shipped out: inside is convenient and can be altered by whoever owns the system; shipped out resists tampering at the cost of an extra dependency.", "Log every read vs only changes: logging reads helps investigation and creates volume; changes-only is smaller and misses reconnaissance.", "Structured events vs free text: structured can be queried and checked by machine; free text is flexible and unreliable."],
    p: ["API tokens used by scripts are logged as a shared service name, so the person is lost.", "The audit store shares credentials with the pipeline, so a compromised pipeline can erase its own tracks."],
    v: "Change an approver list, then locate that event in the external audit store with actor, time and before/after values. Attempt to delete it using pipeline credentials and confirm it fails.",
    dep: ["identity-and-trust", "deployment-ledger"]
  },
  "deploy-markers": {
    s: "Annotations placed on metrics, traces and error tools at the instant of a deployment, so a change in behavior can be lined up with the release that may have caused it.",
    d: "On deploy start and end, the orchestrator sends an event with service, version, environment and link to the monitoring and error-tracking systems. Dashboards draw it as a vertical line; incident tools list recent deployments beside an alert. Version labels on the metrics themselves go further, allowing per-version comparison. The hard part is accuracy: in a rolling or canary deploy there is no single instant, so markers must show start, each step and finish.",
    k: ["Single marker vs per-step markers: a single marker is simple and misleading for long rollouts; per-step markers show exposure but clutter dashboards.", "Push events vs pull from the ledger: pushing is immediate and can fail silently; pulling is reliable and lags.", "Version as a metric label vs separate markers: labels allow direct comparison and raise metric cardinality."],
    p: ["Markers use local time on one system and UTC on another, so changes appear to precede their cause.", "Marker is posted when the pipeline stage starts, not when the new version receives traffic."],
    v: "Deploy a change, open the service latency graph and confirm marker lines appear at the start of exposure and at completion, each linking to the deployment record with the correct version.",
    dep: ["deployment-events-api", "deployment-ledger"]
  },
  "release-dashboard": {
    s: "A live view of releases in flight and recent: stage status, versions per environment, pending approvals, health and who is doing what.",
    d: "It reads from the ledger and the orchestrator and shows each pipeline as a row of stages with current state, plus a matrix of services against environments showing the running version. People use it to see whether an environment is ahead of another, what is blocked and why. It offers actions: approve, pause, roll back. It is hard because the view must reflect reality rather than intent, and must remain usable during an incident when the delivery system is itself degraded.",
    k: ["Show intended state vs observed state: intended is fast and can lie; observed requires polling targets but shows the truth.", "Read-only vs with controls: controls let people act in one place and require the same access checks as the API.", "Per-team view vs global: per-team is focused; global exposes dependency problems between teams and overwhelms."],
    p: ["The page caches stale data, so a rolled-back release still appears healthy.", "Everyone watches the dashboard instead of the metrics that actually show user impact."],
    v: "Start a deployment and confirm the dashboard shows each stage as it progresses. Compare the version matrix against the actual running versions queried from each environment and confirm they match.",
    dep: ["deployment-ledger", "deployment-events-api"]
  },
  "notifications": {
    s: "Messages sent to people and channels when a deployment needs attention or changes state: awaiting approval, failed, rolled back, completed.",
    d: "Subscribers register by service, environment or event type. The orchestrator publishes events and a notifier formats and routes them to chat, email, paging or ticket systems. Approval requests go to named approvers directly; failures go to the owning team; rollbacks may page. Good routing gives each message a clear owner and an action link. The difficulty is volume: if every success sends a message, people mute the channel and miss the one failure that mattered.",
    k: ["Notify on every state vs only on exceptions: every state keeps people informed and trains them to ignore it; exceptions keep signal high and hide quiet progress.", "Chat vs paging for failures: chat is cheap and easily missed; paging is reliable and costs sleep.", "Notify the requester vs the owning team: requester knows the change; the owner will have to live with it."],
    p: ["An approval request goes to a channel rather than a person, and everyone assumes someone else will act.", "A failed notification is not retried, so an urgent rollback goes unseen."],
    v: "Trigger a deployment that fails its analysis and confirm the owning team receives one message with the version, reason and a link, and that no success messages arrived for unrelated services.",
    dep: ["deployment-events-api", "identity-and-trust"]
  },
  "deployment-events-api": {
    s: "A stable stream and query interface through which other systems learn about deployments: webhooks, event bus messages and a read API.",
    d: "The orchestrator emits structured events with a schema: deployment id, service, version, environment, phase and result. Consumers include monitoring, incident tools, feature-flag systems, ticketing and custom automation. Delivery is at least once with ids for deduplication, and consumers can replay from a point in time. Versioning the schema matters because many unknown consumers depend on it. The hard part is ordering and loss: events can arrive late, twice or out of order.",
    k: ["Push webhooks vs pull stream: webhooks are simple and lose events when a receiver is down; streams allow replay and need consumer state.", "Rich event payloads vs ids only: rich saves lookups and couples consumers to the schema; ids force queries and stay stable.", "At-least-once vs exactly-once: at-least-once is achievable and requires idempotent consumers; exactly-once is rarely real."],
    p: ["A schema change breaks an unknown consumer that was silently parsing a field.", "Consumers treat events as ordered and apply a late start event after the completion event."],
    v: "Subscribe a test consumer, run a deployment and confirm it receives start, step and finish events with unique ids. Kill the consumer mid-run, restart it from its offset and confirm no event is missed.",
    dep: ["deployment-ledger"]
  },
  "compliance-reports": {
    s: "Generated evidence showing that releases followed required controls over a period: approvals, tests, scans and separation of duties for each production change.",
    d: "A report job queries the ledger and audit trail, groups changes by service and period, and checks each against the control set: approval present, approver distinct, scans passed, ticket linked. Exceptions are listed with their override reason. Output goes to auditors as a document or data export. It saves weeks of manual evidence gathering when the data is trustworthy. The difficulty is that it reveals every gap, so its value depends on controls being enforced in the pipeline rather than reconstructed after the fact.",
    k: ["Evidence generated continuously vs at audit time: continuous finds gaps while they can be fixed; at audit time is cheaper and finds them too late.", "Report from system data vs attestations by people: system data is objective; attestations cover what systems cannot see.", "Per-change detail vs summary: detail allows sampling; summaries are readable and hide individual exceptions."],
    p: ["The report counts deployments that bypassed the pipeline as compliant because they never appear.", "Retention is shorter than the audit period, so evidence is gone when asked for."],
    v: "Generate the report for last quarter, pick five production changes at random and confirm each cited approval, scan result and approver identity can be traced to the source records.",
    dep: ["deployment-ledger", "audit-trail", "separation-of-duties"]
  },
  "delivery-metrics": {
    s: "Measures of how well delivery works, such as deployment frequency, lead time from commit to production, failure rate and time to restore.",
    d: "Metrics are derived from ledger and event data: count deployments, join each to its commits for lead time, mark those followed by rollback, hotfix or incident as failures, and measure recovery duration. Reports break them down by team and service. They guide investment in the pipeline and show trends. The hard part is definition: what counts as a deployment, a failure, or the start of the lead-time clock changes the numbers drastically, and they are easily distorted when used as targets.",
    k: ["Measure teams vs measure the system: team comparison invites gaming; system-level trends are safer and less actionable.", "Failure defined by rollback vs by incident: rollbacks are easy to detect and miss silent damage; incidents capture impact and need honest linking.", "Per-deploy vs per-change counts: per-deploy is easy to compute; per-change handles batching but needs commit tracking."],
    p: ["Frequency is raised by splitting trivial deployments, and the number improves while delivery does not.", "Metrics are computed from a ledger that misses out-of-band changes, understating failure rate."],
    v: "Pick a service, compute lead time and failure rate by hand from five deployments' commit and rollback records, and confirm the reported figures match within rounding.",
    dep: ["deployment-ledger", "deployment-events-api"]
  },
  "pipeline-definitions": {
    s: "The declared description of how a service is released: stages, order, targets, strategies, gates and parameters.",
    d: "A definition names stages such as test environment, canary, production waves, and for each one the action, target, strategy, checks and conditions to continue. It is data, parsed and validated by the orchestrator, and stored under version control. Parameters let one definition serve many services. A good definition is declarative and uses shared templates so organization-wide changes, such as adding a policy check, can be made once. It is hard because definitions grow into programs with conditionals and become difficult to test.",
    k: ["Declarative stages vs scripted logic: declarative is analyzable and limited; scripts express anything and cannot be validated before they run.", "Shared templates vs per-service definitions: templates give consistency and central change; per-service gives freedom and divergence.", "Strict schema validation vs permissive: strict catches errors before runtime; permissive tolerates evolution and hides typos."],
    p: ["A typo in an environment name makes a stage silently target nothing and report success.", "Template change breaks every consuming pipeline at once because it was not rolled out progressively."],
    v: "Validate a definition with a misspelled target and confirm rejection before any run. Run a valid definition in a dry-run mode and confirm it prints the stages and targets it would execute without changing anything.",
    dep: ["stage-graph", "pipeline-as-code"]
  },
  "stage-graph": {
    s: "The dependency graph between stages, expressing which can run in parallel, which must wait, and which conditions allow continuing.",
    d: "Stages are nodes and requirements are edges. The orchestrator computes ready stages, runs them, records results and evaluates conditions such as succeeded, failed or approved. Fan-out lets independent regions deploy in parallel; fan-in waits for all of them. Failure policies decide whether a failed branch cancels siblings, lets them finish or triggers compensating stages such as rollback. The graph's state must be persisted so a restarted orchestrator resumes mid-release rather than starting over.",
    k: ["Linear stages vs graph: linear is easy to read; graphs allow parallelism and are harder to reason about when something fails mid-way.", "Cancel siblings on failure vs let them finish: canceling limits damage and leaves a mixed state; finishing completes work and spreads a possibly bad change.", "Persisted state per stage vs rebuilt from logs: persisted is dependable; rebuilt is stateless and wrong after any gap."],
    p: ["A failed stage leaves its parallel siblings half-deployed with no stage responsible for cleanup.", "Conditions evaluate a skipped stage as success, so a gate that was bypassed lets later stages run."],
    v: "Fail one of three parallel regional stages and confirm the graph shows the others according to the policy, the downstream stage does not start, and a restarted orchestrator shows the same state.",
    dep: ["pipeline-definitions", "retry-and-timeouts"]
  },
  "promotion-triggers": {
    s: "The events that start a release or advance it to the next stage: a new artifact, a merge, a schedule, a passing check or a person's click.",
    d: "A trigger watches for an event and creates or advances a pipeline run with parameters taken from it. Typical sources are new artifact versions in the repository, a completed build, a time schedule and manual requests. Conditions filter them: only artifacts from the main branch, only after the previous stage has baked for an hour. Promotion between environments is itself a trigger on the previous environment's success. The challenge is avoiding duplicate or racing runs when events arrive twice or in bursts.",
    k: ["Automatic on every build vs explicit release: automatic gives continuous deployment and exposes users to every commit; explicit adds a decision and a delay.", "Event-driven vs scheduled: event-driven is prompt and noisy; scheduled batches changes and gives a predictable rhythm.", "Promote the same artifact vs rebuild per stage: promoting the same bytes is verifiable; rebuilding can ship something untested."],
    p: ["A retried webhook starts the same release twice and two runs collide on the same target.", "Promotion triggers on stage success but ignores that analysis is still running."],
    v: "Publish a new artifact on the main branch and confirm exactly one run starts with its digest. Publish from another branch and confirm none starts. Replay the same event and confirm no second run.",
    dep: ["pipeline-definitions", "immutable-artifact-ids", "deployment-queue"]
  },
  "deployment-queue": {
    s: "The ordered list of pending deployments waiting for a target, a window or a worker, with rules for priority, merging and cancellation.",
    d: "Requests are queued per target. The queue enforces one active deployment per target, orders by arrival or priority and may skip superseded entries so that when versions 5, 6 and 7 are queued only the latest runs. Entries held by windows, freezes or approvals wait with a visible reason. Urgent fixes can jump the queue. The queue's state is durable and its behavior must be easy to see: an operator needs to know why a deploy is waiting and what is ahead of it.",
    k: ["First-in-first-out vs latest-wins: FIFO deploys every version in order and may waste time on obsolete ones; latest-wins is quick and skips intermediate versions that might have mattered.", "Per-target queue vs global: per-target gives parallelism; global is simpler and a bottleneck.", "Allow priority jumps vs strict order: jumps support hotfixes and can starve ordinary releases."],
    p: ["A stuck deployment at the head blocks every later release to that target with no alert.", "Superseding drops a version that contained the only copy of a migration the later version assumes was applied."],
    v: "Queue three versions for one target while another deploy is running and confirm the display lists them with reasons. Confirm that after the active one ends the policy runs only what it should, and that the skipped ones are marked superseded.",
    dep: ["concurrency-control", "deployment-ledger"]
  },
  "concurrency-control": {
    s: "Locks and limits that stop two deployments from changing the same target at once, and cap how many run in parallel across the fleet.",
    d: "Before a stage touches a target it acquires a lock keyed by service and environment, held with a lease that expires if the holder dies. Beyond mutual exclusion there are limits: at most N regions at once, at most M deployments per cluster, at most one migration against a database. Locks are shown to users with owner and age. The hard problems are lease expiry on slow-but-alive deployers, which allows two writers, and deadlock where stages hold locks on different targets in opposite order.",
    k: ["Lease expiry vs manual release: expiry heals crashed holders and can free a lock under a slow live one; manual release is safe and needs a person.", "Fine-grained locks vs one per environment: fine-grained gives throughput and risks conflicting changes across related services; coarse is safe and serial.", "Fencing tokens vs trust in the lock: fencing rejects stale writers at the target; trusting the lock is simpler and can be wrong after a pause."],
    p: ["A deploy worker pauses past its lease and resumes, then overwrites a newer release made by the next holder.", "Two pipelines lock the same pair of services in opposite order and wait for each other forever."],
    v: "Start a deployment and attempt a second to the same target; confirm the second waits and shows the holder. Kill the first worker and confirm the lock is released after the lease and the second then runs.",
    dep: ["environment-locks", "deployment-queue"]
  },
  "deployment-workers": {
    s: "The processes that actually execute deployment steps against targets, taking work from the orchestrator and reporting results back.",
    d: "Workers run in or near the target environment with the credentials needed to change it. They pull tasks, call the platform API or run commands, stream logs and report completion. Placing them next to the target limits network reach and credential exposure and lets them work during partial connectivity. They must be stateless or checkpoint progress so that a crash resumes safely. They are hard to get right because each step needs to be idempotent, and because they hold powerful credentials that make them a prime target.",
    k: ["Workers inside each environment vs one central runner: local workers limit credential spread and need deployment and upgrade; central is simple and holds keys to everything.", "Pull model vs push: pull needs no inbound access to targets; push gives immediate dispatch and opens network paths.", "Long-lived vs ephemeral workers: ephemeral limits credential lifetime and adds startup cost; long-lived is fast and accumulates state."],
    p: ["A worker retries a step after a timeout when the first attempt had actually succeeded, applying a change twice.", "One shared worker identity can alter every environment, so a leak is a full compromise."],
    v: "Kill a worker mid-deployment and confirm another resumes from the last completed step, the target ends up in the intended state, and the log shows no duplicated change.",
    dep: ["deployment-credentials", "idempotent-deploys", "retry-and-timeouts"]
  },
  "retry-and-timeouts": {
    s: "Rules for how long each step may take, how often a failed step is repeated, and when the orchestrator gives up and marks the stage failed.",
    d: "Every step has a timeout and a retry policy with backoff and a maximum count. Transient errors such as a throttled API are retried; deterministic failures such as an invalid manifest are not. Timeouts also cover waiting: for a pod to become ready, for an approval, for analysis. Exhausted retries move the stage to failure and trigger the failure policy. Choosing values is hard: too short causes false failures during a slow but healthy rollout; too long delays detection of a real one.",
    k: ["Retry automatically vs fail fast: retries absorb transient errors and can repeat a harmful action; failing fast is clear and noisy.", "Fixed vs adaptive timeouts: fixed is predictable; adaptive follows normal duration and can accept slow degradation as normal.", "Retry the step vs the whole stage: step-level is cheap; stage-level restarts from a clean point and repeats work."],
    p: ["A timeout shorter than the image pull time fails every deployment to a fresh node.", "Retried steps are not idempotent, producing duplicate resources or doubled migrations."],
    v: "Inject a transient API error in one step and confirm it is retried and succeeds. Inject a permanent error and confirm no retry occurs and the stage fails within the configured timeout.",
    dep: ["idempotent-deploys"]
  },
  "pipeline-as-code": {
    s: "Keeping pipeline definitions in version control beside the service, so changes to how it is released are reviewed, tested and traceable like code.",
    d: "The definition file lives in the service repository or in a central one, and the orchestrator loads it at run time for the commit being released. Edits go through review and carry history. A pipeline that changes the way it deploys must itself be handled with care: running a new definition against production the same instant it is merged gives no chance to test it. Many setups lint definitions in review and run changes in a non-production environment first.",
    k: ["Definition in the service repo vs central: in-repo lets teams move quickly and bypass standards; central enforces uniformity and slows teams.", "Run the definition from the release commit vs from the main branch: release commit reproduces old releases; main branch applies fixes to pipelines everywhere.", "Allow arbitrary scripts vs restrict to templates: scripts enable anything and make audits difficult; templates are safe and rigid."],
    p: ["A developer edits the definition in their branch to remove the approval gate and deploys with it.", "Rolling back an old release reruns its old pipeline, which targets a retired environment."],
    v: "Open a change that removes a required gate from a definition and confirm review or policy blocks it. Run an old release's rollback and confirm the definition used is the one intended.",
    dep: ["policy-checks", "pipeline-definitions"]
  },
  "wave-definitions": {
    s: "A declared grouping of regions, clusters or cells into ordered sets, each deployed only after the previous set has finished and stayed healthy.",
    d: "A wave definition lists groups and for each: members, parallelism within the group, bake time, health requirements and who may approve continuing. A typical order starts with an internal or low-traffic group, then a small percentage of production, then the rest in growing batches. The orchestrator turns it into stages. The hard part is choosing groups that are representative enough for early waves to reveal problems yet small enough that failure there hurts few.",
    k: ["Few large waves vs many small: few are fast and expose more at once; many limit exposure and stretch a rollout across days.", "Static membership vs computed by traffic: static is predictable; computed adapts to load but changes between releases.", "Same plan for every change vs risk-based plan: same is simple; risk-based saves time for small changes and needs trustworthy risk scoring."],
    p: ["Wave one is a region nobody uses, so it proves nothing about real traffic.", "Membership is edited by hand and a new region is forgotten, so it never receives the release."],
    v: "Run a release through the waves in a test fleet and confirm each group starts only after the prior group's bake and health conditions hold, and that every region in inventory appears in exactly one wave.",
    dep: ["region-ordering", "cluster-registry", "bake-time"]
  },
  "region-ordering": {
    s: "The choice of which regions or data centers receive a release first, based on traffic, importance, risk and operator availability.",
    d: "Criteria include traffic volume, customer mix, how different the region's configuration is, and local business hours. Common orderings start with a small, low-stakes region, move to representative mid-size ones and finish with the most critical or largest. Some systems also avoid deploying to regions in their night or peak hour. Ordering interacts with data replication and dependencies between regions. It is hard because the best canary region differs per change: a networking change may be best tested where the networking is most unusual.",
    k: ["Smallest first vs most representative first: smallest limits damage and may miss problems that appear only at scale; representative finds them with more exposure.", "Fixed order vs rotated: fixed gives predictability; rotation spreads the burden of being first.", "Follow the sun vs all in parallel: follow-the-sun keeps staff awake and slow; parallel is quick and risky."],
    p: ["The first region always gets changes first, so its customers experience most of the bad releases.", "The ordering ignores a shared dependency that lives in a later region, so early waves fail on startup."],
    v: "Review the ordering for a release and confirm the first region is the intended low-risk one, then check the orchestrator's actual sequence in the ledger matches it for the last three production releases.",
    dep: ["wave-definitions", "cluster-registry"]
  },
  "bake-time": {
    s: "A deliberate waiting period after a stage completes, during which the new version runs under real load before the rollout continues.",
    d: "Many failures are not instant: memory leaks, cache expiry, daily batch jobs and slow dependency effects appear after minutes or hours. Bake time keeps the next wave from starting until the previous one has run long enough to show them. Duration is set per stage and sometimes by risk, and analysis continues to run throughout. The cost is slower releases and longer windows where two versions coexist. Choosing durations is hard because they are guesses about how long problems take to appear.",
    k: ["Fixed duration vs until enough traffic: fixed is predictable; traffic-based ensures the sample is meaningful on quiet services.", "Long bake vs short: long catches slow failures and delays fixes and features; short is fast and misses leaks and daily cycles.", "Bake with analysis vs bake as simple delay: analysis can stop it early on a problem; simple delay relies on humans noticing."],
    p: ["Bake runs overnight at low traffic, so the daytime problem appears only after all waves complete.", "Bake timer keeps counting while the deployment is paused, and the wave advances immediately on resume."],
    v: "Release a version with an intentional slow memory leak and confirm that, with the configured bake, the alert or analysis fires before the next wave begins. Repeat with zero bake and observe it reach all waves.",
    dep: ["wave-definitions", "metric-queries"]
  },
  "blast-radius-limits": {
    s: "Hard caps on how much of the fleet, how many customers or how much traffic a single change may affect before a check or approval is required.",
    d: "The orchestrator enforces limits such as no more than one region at once, no more than five percent of instances per step, no more than one cell per day. Limits apply regardless of how urgent or confident the author is. They may be dynamic: shrinking when recent incident counts are high. They bound the damage from a mistake in the release or in the pipeline itself. The difficulty is that caps slow rollouts, and teams push for exceptions on exactly the changes that most need them.",
    k: ["Hard limit vs advisory: hard limits cannot be eroded under pressure and can prevent urgent fixes; advisory limits are flexible and forgotten.", "Limit by percent vs by absolute count: percent scales with fleet size; absolute count is predictable and tiny fleets are limited too little.", "Limit by instances vs by customers: instances are easy to count; customers measure real impact and need data about placement."],
    p: ["A limit enforced by the pipeline is not applied to manual actions, which can touch the whole fleet.", "The cap counts instances while customers are concentrated on a few, so the impacted share is far larger."],
    v: "Attempt to configure a step that deploys to more than the allowed share of the fleet and confirm the orchestrator rejects it, naming the limit and the share requested.",
    dep: ["wave-definitions", "cell-based-rollout"]
  },
  "cell-based-rollout": {
    s: "Deploying to independent, self-contained copies of a service, called cells, one at a time so that a bad release can only ever affect the customers in that cell.",
    d: "A cell holds a complete stack and a fixed slice of customers. Cells share no runtime state, so a failure is contained by construction. Releases proceed cell by cell, starting with a small or internal one, with health checks between. The router maps customers to cells, and moving a customer is a deliberate act. This turns blast radius into a design property rather than a pipeline rule. The costs are duplicated capacity, the router as a critical shared component, and difficulty with workloads that need cross-customer features.",
    k: ["Cells vs one large shared fleet: cells bound impact and cost extra capacity and routing complexity; a shared fleet is efficient and fails together.", "Small cells vs large: small cells limit impact and multiply operations; large cells are efficient and a failure hurts more.", "Fixed customer-to-cell mapping vs dynamic balancing: fixed is predictable and can become uneven; dynamic balances and complicates reasoning about who is exposed."],
    p: ["A shared dependency, such as a global database, is outside the cell and fails them all together.", "The router itself is deployed to every cell's customers at once and becomes the single point of failure."],
    v: "Deploy a deliberately broken version to the first cell and confirm only its customers see errors, other cells' error rates stay flat, and the rollout stops before the second cell.",
    dep: ["wave-definitions", "weighted-routing", "blast-radius-limits"]
  },
  "cross-region-dependencies": {
    s: "The knowledge that some services in one region call versions of other services in other regions, so rollout order must respect compatibility between them.",
    d: "Regions are rarely independent: replication, global control planes, shared identity and cross-region calls tie them together. If a new version in region A calls an API that exists only in new B, B must go first; if the old version in B cannot read A's new format, A must wait. Dependency metadata records which versions interoperate and which order is required, and the orchestrator enforces it. Mistakes show up as errors only while versions are mixed across regions, making them transient and hard to reproduce.",
    k: ["Explicit compatibility declarations vs trial and error: declarations make ordering safe and need maintenance; trial uncovers real problems in production.", "Order by dependency graph vs by risk: dependency order is necessary for correctness; risk order is preferred and must sometimes yield.", "Backward-compatible changes only vs coordinated releases: compatible changes need no coordination and require discipline; coordinated ones can break anything and are fragile."],
    p: ["A new version writes a replicated record format older regions cannot read, corrupting replication until rollback.", "Dependency metadata is out of date, so the orchestrator deploys in an order that was valid last year."],
    v: "In a test fleet, deploy the dependent service first on purpose and confirm the orchestrator blocks it with a message naming the required order, then follow the right order and confirm no cross-version errors.",
    dep: ["region-ordering", "version-coexistence", "wave-definitions"]
  },
  "wave-pause-resume": {
    s: "The ability to halt a multi-wave rollout at any point, hold it indefinitely, and later continue or abandon it with a clear view of what has already changed.",
    d: "Pausing stops new stages from starting while letting running steps finish or stop at a safe point. The orchestrator records exactly which regions are on which version and keeps that state visible. Resuming re-evaluates gates, approvals, freezes and health, since conditions may have changed. Pauses can be manual, triggered by alerts or imposed by a freeze. The difficulty is that a paused rollout is a half-deployed fleet with mixed versions, which is risky to leave for long and requires its own monitoring.",
    k: ["Pause between stages only vs mid-stage: between stages is clean; mid-stage is faster for emergencies and leaves partial state.", "Resume continues the plan vs re-plans: continuing is simple; re-planning accounts for changed conditions and may surprise people.", "Auto-expire a pause vs hold forever: expiry prevents forgotten mixed fleets and may resume at a bad time."],
    p: ["A rollout paused for a weekend resumes on Monday with an approval that expired in the meantime.", "Nobody notices the pause, and the fleet runs two versions for weeks."],
    v: "Pause a rollout after wave two, confirm the view lists exactly which regions run the new version, confirm no further stages start, then resume and verify gates were re-checked before wave three.",
    dep: ["wave-definitions", "fleet-progress-view", "approval-expiry"]
  },
  "fleet-progress-view": {
    s: "A consolidated display of how far a release has spread across regions, cells and instances, with versions, health and remaining steps.",
    d: "It aggregates the ledger and live state into a map or table: for each region or cell, the running version, deployment state and health summary. Operators read it to know where a release stands, how much is exposed and what remains. During incidents it answers which customers or regions run the suspect version. It must be built from observed state, not just the plan. The challenge is freshness at large scale and avoiding a view so detailed that the single important signal is lost.",
    k: ["Observed vs planned state: observed is true and costs probing; planned is cheap and wrong after any manual change.", "Per-instance detail vs rolled-up: detail finds stragglers; rollups are readable and hide the few instances left on an old version.", "Pull on demand vs continuously computed: on demand is accurate and slow at scale; continuous is fast and may lag."],
    p: ["Instances that failed to update are not counted, so the view shows one hundred percent complete.", "The view loads from the primary region and is unavailable during the regional outage that prompted the rollback."],
    v: "During a rollout compare the view with a direct query of each region's running version and confirm they match. Hold one instance back on purpose and confirm the view flags it.",
    dep: ["deployment-ledger", "target-inventory", "health-assessment"]
  },
});
