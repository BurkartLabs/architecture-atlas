// Details for the feature flag service plate, part 2: access and audit, integrations, experiments.
ATLAS.details("feature-flags", {
  "roles-and-permissions": {
    s: "Defines what each person can do in the service: view, create, edit, toggle or delete flags, manage segments and members, and read audit data.",
    d: "Permissions are expressed as actions on resources, grouped into roles such as reader, writer, approver and administrator, and checked on every control plane request. Custom roles use policies that match flag keys by tag or prefix. The check sits in the API layer, so the console, scripts and integrations are governed identically. It is hard because flag access has a wide blast radius: a toggle is an instant production change, so coarse roles either over-grant or force constant administrator involvement.",
    k: ["Fixed roles versus policy-based custom roles: fixed roles are easy to audit, while policies fit real team structures but need testing and review.", "Per-flag permissions versus per-project: precise control, at the cost of a large permission surface that nobody maintains."],
    p: ["Everyone is granted writer to unblock a launch, and the role is never narrowed again.", "A role that allows editing targeting also allows turning the flag on in production, which was not intended."],
    v: "Sign in as a reader and attempt to toggle a flag through both the console and the API. Confirm both are denied with a permission error and that the denial is recorded.",
    dep: ["service-tokens-and-keys", "sso-and-provisioning", "project-and-namespace-model"]
  },
  "environment-scoped-permissions": {
    s: "Grants different rights in different environments, so developers can change flags freely in development while production changes need elevated rights or approval.",
    d: "Each environment carries its own permission binding. A common pattern gives broad write access in development and test, narrower in staging, and production changes only to named approvers or on-call roles. The same person can hold different roles per environment. Protected environments additionally force approval requests. It is hard because environments multiply, and keeping the bindings aligned with how the organization actually works requires maintenance that gets postponed.",
    k: ["Environment as a permission boundary versus a flag attribute: simple mental model, but promoting a flag to production needs someone with the right to do so.", "Locking production behind approval versus trusting roles: stops accidents, but slows urgent, legitimate changes."],
    p: ["A newly created environment inherits permissive defaults and becomes an unguarded copy of production.", "Developers learn to ask the one person with production access for every change, who approves without reading."],
    v: "As a developer role, change a flag in development and confirm it succeeds. Attempt the same change in production and confirm it is blocked or converted into an approval request.",
    dep: ["roles-and-permissions", "environment-model"]
  },
  "approval-workflows": {
    s: "Requires a second person to review and approve a proposed flag change before it takes effect, in selected environments or for selected flags.",
    d: "A change to a protected flag is saved as a pending request containing the proposed configuration and diff. Designated reviewers approve or decline, and approval applies the change through the normal publish path, subject to version checks. Requests expire or are rebased if the flag changes in the meantime. Notifications go to the reviewer's chat or email. It is hard because review quality depends on the diff the reviewer sees, and because approval adds delay exactly where speed matters most.",
    k: ["Approval on every production change versus only on risky ones: uniform and simple to explain, but reviewers tire and approve reflexively.", "Applying on approval versus requiring a separate apply step: fewer steps, but the change may land at an unplanned moment."],
    p: ["An approved request is applied against a flag that has since changed and overwrites the newer work.", "Self-approval is allowed by a loophole in role overlap, which removes the second pair of eyes."],
    v: "Submit a production change as a non-approver, confirm it stays pending and has no effect on SDK results, then approve as another user and confirm clients receive the new version.",
    dep: ["change-preview-and-diff", "environment-scoped-permissions", "config-versioning", "audit-log"]
  },
  "audit-log": {
    s: "An append-only record of every change to flags, segments, members and settings: who did it, when, from where, what changed and why.",
    d: "Each write to the control plane emits an audit entry containing the actor (person, token or schedule), time, resource, before and after state, and an optional comment. Entries are written in the same transaction as the change, or through an outbox so none are lost. Logs are searchable, can be exported and are retained per policy. It is hard because the volume is high, the entries must be tamper-evident, and attribution must still be true when changes come through shared tokens.",
    k: ["Writing the audit entry in the same transaction versus asynchronously: a change cannot exist without its record, at the cost of coupling and write latency.", "Storing full before and after state versus a summary: easy diffing and rollback, but larger storage and possible retention of sensitive values."],
    p: ["Changes made with a shared service token are attributed to the token, so nobody can say which person made them.", "Audit entries are dropped during a database failover, leaving a gap exactly during an incident."],
    v: "Change a flag through the console and through the API, then search the log and confirm both entries show distinct actors, timestamps, before and after values and the originating address.",
    dep: ["flag-store", "service-tokens-and-keys", "data-retention-and-privacy"]
  },
  "change-history-and-rollback": {
    s: "Keeps every version of a flag's configuration so people can see how it evolved and restore an earlier version quickly after a bad change.",
    d: "Because configuration is versioned, history is the ordered list of versions per flag and environment, each linked to its audit entry. Rollback creates a new version whose content equals an older one, rather than rewriting history. The console shows diffs between any two versions. Some systems offer one-click revert to the last known good state. It is hard because rolling back a flag alone may not undo data written under the new behavior, and because dependent flags and segments may also have changed.",
    k: ["Rollback as a new version versus rewinding the pointer: history stays honest and auditable, but version numbers keep growing.", "Per-flag rollback versus point-in-time rollback of the whole environment: precise and small, but cannot repair a multi-flag change that went wrong together."],
    p: ["Reverting one flag restores its rules but leaves a segment it depends on in its changed state.", "Rollback is attempted during an incident with no clear 'last good' version because versions have no labels."],
    v: "Make three edits to a flag, roll back to version one, and confirm a fourth version exists with content identical to the first and that clients now evaluate with the original rules.",
    dep: ["config-versioning", "audit-log", "flag-store"]
  },
  "service-tokens-and-keys": {
    s: "Credentials for software: API tokens for the control plane and per-environment keys that SDKs use to fetch configuration, scoped, rotatable and revocable.",
    d: "SDK keys come in kinds with different exposure. A server key grants read access to full rules and must stay secret. A client-side identifier is embedded in browsers and mobile apps and can only fetch evaluated results for a context, or a rules subset with no sensitive targeting. Management tokens are scoped to roles and expire. Rotation allows two valid keys during transition. It is hard because the key is the only gate for config delivery, and client-side keys are public by design.",
    k: ["Separate secret and public key kinds versus one key: public keys can be leaked safely, but the service must support two delivery shapes.", "Long-lived keys versus short-lived tokens with refresh: simpler for SDK deployment, but a leaked key stays dangerous until someone notices."],
    p: ["A server key is placed in a browser bundle and exposes private targeting rules and customer identifiers.", "A key rotated without an overlap period breaks every deployed instance that has not been restarted."],
    v: "Use a client-side key to request a ruleset and confirm it returns no private rule data. Revoke a server key and confirm the next fetch with it fails with an authorization error.",
    dep: ["roles-and-permissions", "environment-model"]
  },
  "sso-and-provisioning": {
    s: "Signs people in through the organization's identity provider and creates, updates and removes accounts and group memberships automatically as employees join, move or leave.",
    d: "Single sign-on uses a standard federation protocol so credentials and multi-factor policy stay in the identity provider. Provisioning, via a standard directory synchronization protocol, maps directory groups to service roles and teams, and deactivates accounts when someone leaves. Just-in-time creation on first login is a simpler alternative. It is hard because role mapping must stay correct as groups change, and deprovisioning must also revoke personal API tokens that the removed user created.",
    k: ["Automated provisioning versus just-in-time account creation: leavers are removed promptly, but setup is more work and sync failures leave stale access.", "Directory group to role mapping versus roles assigned in the service: one source of truth, but a group rename silently changes permissions."],
    p: ["A departed employee's personal token keeps working because account removal does not revoke tokens.", "A group rename in the directory drops everyone's role to the default read-only one."],
    v: "Remove a test user from the directory group and confirm that within the sync interval they lose console access and that tokens they created are marked revoked.",
    dep: ["roles-and-permissions", "service-tokens-and-keys"]
  },
  "webhooks-and-event-hooks": {
    s: "Sends an HTTP notification to a configured URL whenever flags, segments or settings change, so other systems can react, record or alert.",
    d: "A subscription names a URL, optional filter on resource or action, and a signing secret. On each audit-worthy change the service enqueues a delivery containing the event body; a worker posts it with a timeout, signs it so receivers can verify origin, and retries with backoff on failure. Delivery is at least once, so receivers must handle duplicates. It is hard because slow or dead receivers must not delay the control plane, and event order is not guaranteed across retries.",
    k: ["At-least-once delivery versus at-most-once: no lost notifications, but receivers must deduplicate using an event id.", "A queue between change and delivery versus calling hooks inline: a slow endpoint cannot block saving, but delivery is no longer instantaneous."],
    p: ["A receiver that processes events out of order after retries ends with an older state than the service holds.", "Unsigned deliveries let anyone who learns the URL forge flag change events."],
    v: "Subscribe a test endpoint, change a flag, and confirm one signed delivery arrives with the new state and a valid signature. Make the endpoint fail once and confirm a retry arrives with the same event id.",
    dep: ["audit-log", "config-publisher"]
  },
  "issue-tracker-links": {
    s: "Associates flags with work items and change requests, so the reason a flag exists and the work that will remove it are one click away.",
    d: "A flag carries one or more references to external work items, validated against a configured tracker. Links can be created in the console or by integrations that attach them from pull request descriptions. Updates can flow both ways: a work item moving to done may mark the flag ready for review, and a flag change posts a comment on the item. It is hard because the link is only useful if kept current, and bidirectional automation must not loop or leak internal flag data to broad audiences.",
    k: ["Required work item link at creation versus optional: every flag has a traceable reason, but people enter placeholders to proceed.", "Two-way status sync versus links only: less manual updating, but status mapping and permissions between two systems must be maintained."],
    p: ["Links point to closed or deleted work items, so the recorded reason is unreachable.", "Automation posts production targeting details into a widely visible ticket."],
    v: "Link a flag to a work item, close the item, and confirm the flag appears in the 'ready for review' list with a link back to the item.",
    dep: ["flag-ownership-metadata", "webhooks-and-event-hooks"]
  },
  "observability-annotations": {
    s: "Posts flag changes onto metrics and tracing dashboards as annotations, so an engineer investigating a spike can see that a flag changed at that moment.",
    d: "When a flag changes, an integration writes an event to the monitoring system with the flag key, environment, change author and time, shown as vertical markers on charts. Some setups also attach the evaluated variant to traces and logs, so slow requests can be filtered by variant. It is hard because most incidents begin with a change, and flag changes are changes with no deploy marker; the annotation is only useful if complete, so any path that skips it quietly undermines the practice.",
    k: ["Annotating every change versus only production: complete context for investigation, with noisy charts from development changes.", "Recording variants as trace attributes versus only changes: lets engineers compare latency or errors per variant, but adds attribute cardinality to telemetry."],
    p: ["Changes made through a bulk API skip the annotation hook, so a spike has no visible cause.", "Variant attributes with many distinct values explode telemetry cost."],
    v: "Toggle a flag in a test environment and confirm the monitoring dashboard displays a marker at that time with the flag key and author. Confirm traces from after the toggle carry the new variant attribute.",
    dep: ["webhooks-and-event-hooks", "evaluation-api-and-hooks"]
  },
  "infrastructure-as-code-sync": {
    s: "Manages flag definitions as declarative files in version control, applied to the service by automation, so changes get review, history and repeatability like other infrastructure.",
    d: "Definitions of flags, segments and environments are written in a declarative format and reconciled with the service by a plan and apply tool using the control plane API. Pull request review replaces console approval. Drift detection reports differences between the files and the live state. It is hard because humans and automation both want to edit: console edits get overwritten at the next apply, and per-environment values such as rollout percentages are changed far more often than infrastructure.",
    k: ["Code as the only source of truth versus allowing console edits: strict reproducibility, but emergencies cannot be handled quickly in the console.", "Managing structure only (flags, variants) versus also targeting rules: stable and safe, but leaves frequent changes out of version control."],
    p: ["An apply from an outdated branch reverts a rollout percentage that someone raised in the console.", "Console edits during an incident are silently overwritten by the next scheduled apply."],
    v: "Change a variant description in the repository, run plan and apply, and confirm the console shows it. Edit it in the console, run plan again, and confirm the tool reports the drift.",
    dep: ["flag-config-api", "service-tokens-and-keys", "config-versioning"]
  },
  "progressive-delivery-hooks": {
    s: "Lets release automation raise a rollout in stages and check health between them, calling flag APIs and reading metrics instead of waiting for a person.",
    d: "A release controller moves a flag through steps such as one, five, twenty-five and one hundred percent. Between steps it queries error rate and latency, sometimes segmented by variant, and either proceeds, pauses or reverts. The flag service supplies authenticated API operations that change only the rollout weight, plus the audit trail of what automation did. It is hard because the health signal must be attributable to the variant, and small cohorts at early stages give statistically weak data.",
    k: ["Automation driving rollout percentages versus human steps: faster and consistent, but a bug in the controller changes production at machine speed.", "Health judged by comparing variants versus absolute thresholds: separates the change from background trends, but needs enough traffic in each group."],
    p: ["A controller advances on a metric that has a delay of several minutes and rolls out past a regression.", "Automation and a human both edit the same rollout, each overwriting the other's value."],
    v: "Run an automated rollout against a deliberately failing variant and confirm the controller halts at an early step, sets the flag back to zero percent and an audit entry names the automation as actor.",
    dep: ["flag-config-api", "percentage-rollout", "automated-rollback", "audit-log"]
  },
  "experiment-definition": {
    s: "Declares an experiment: the hypothesis, the flag and variants under test, the audience, the traffic share, the primary and guardrail metrics, and the intended duration.",
    d: "An experiment record is attached to a flag and fixes the design before any data arrives: which population is eligible, what share is enrolled, how variants are weighted, which metric decides success and what minimum detectable effect justifies the sample size. Starting the experiment locks assignment-affecting fields. It is hard because changing allocation or audience mid-run corrupts the comparison, so the service has to treat some edits as a new experiment rather than a revision.",
    k: ["Locking design fields after start versus allowing edits: results stay valid, but mistakes force a restart.", "Fixing sample size in advance versus continuous monitoring: avoids peeking bias, but delays decisions when results are clear early."],
    p: ["Changing the traffic split halfway through mixes cohorts with different exposure and makes the result meaningless.", "An experiment launched with no primary metric ends in arguments about which number to read."],
    v: "Start an experiment, attempt to change the allocation, and confirm the service blocks the edit or forks a new experiment. Confirm the original keeps accumulating data with its original design.",
    dep: ["flag-and-variant-model", "multivariate-allocation", "metric-definitions"]
  },
  "assignment-logging": {
    s: "Records which variant each user was assigned and when, so analysis can group outcome data by assignment without relying on anyone's memory.",
    d: "Assignment is deterministic from the context and flag, so the system could recompute it later; but changes in rules or salts make recomputation unreliable. Logging captures the actual result at decision time: context key, flag, variant, rule, timestamp, and experiment version. Events are written by the SDK to the event pipeline, deduplicated per user. It is hard because logging every evaluation is expensive, while logging too little loses users from the analysis.",
    k: ["Logging at evaluation versus recomputing at analysis time: reflects what really happened, but costs an event for every assignment.", "Logging once per user and flag versus on each evaluation: far less volume, but needs deduplication state in the SDK or pipeline."],
    p: ["Assignments logged on the server but exposure happening in the client produce users assigned yet never seen.", "Clock skew on clients places assignment events after outcome events they should precede."],
    v: "Evaluate an experiment flag for one hundred distinct contexts and confirm the pipeline holds one hundred assignment records, each with the variant that the SDK returned.",
    dep: ["evaluation-event-ingestion", "event-batching-and-sampling", "experiment-definition", "evaluation-reasons"]
  },
  "exposure-events": {
    s: "Marks the moment a user actually encountered a variant, distinct from being assigned it, so analysis counts only people who could have been affected.",
    d: "Assignment happens when code asks for a flag; exposure happens when the user sees the changed behavior, such as when a page renders. Many users are assigned but never reach the changed screen. Analysis restricted to exposed users has more power and less dilution. The application emits an explicit exposure event at the right place. It is hard because it requires cooperation from the application code, and wrongly placed events, such as firing for every request, count users who never saw anything.",
    k: ["Counting only exposed users versus all assigned: cleaner effect measurement, but the exposure condition itself must not differ between variants.", "Automatic exposure on evaluation versus manual exposure calls: no code needed, but dilutes with users who never reached the feature."],
    p: ["One variant's page loads slower, so fewer users ever fire exposure there, biasing the exposed groups.", "Exposure is emitted before consent is known, recording users who should not be tracked."],
    v: "Assign one hundred users, render the changed screen for only forty, and confirm analysis shows one hundred assigned, forty exposed, and that outcomes are attributed only for the forty.",
    dep: ["assignment-logging", "evaluation-api-and-hooks", "evaluation-event-ingestion"]
  },
  "metric-definitions": {
    s: "Defines the outcomes an experiment is judged on, such as conversion or latency, with the event, aggregation, unit of analysis and attribution window stated precisely.",
    d: "A metric specifies the source event, filter, how events aggregate per user (count, sum, unique, ratio), the time window after exposure, and the direction counted as good. Metrics are defined once and reused, joined to exposures by user key. Some are computed in the warehouse, others in the service. It is hard because definitions are contested: the same word means different things to different teams, and ratio metrics need care so the variance estimate is correct.",
    k: ["Central reusable metrics versus per-experiment definitions: consistent numbers across experiments, but a change to one definition shifts past results.", "Computing in the service versus the customer's warehouse: quick set-up, but data must be copied and may differ from official reporting."],
    p: ["The metric window ends before delayed outcomes arrive and shows a loss for a variant that improves late conversions.", "Two teams define 'active user' differently and compare experiment results that cannot be compared."],
    v: "Define a conversion metric, replay a fixed set of events through it, and confirm the computed per-variant counts match a hand count from the raw events within the stated window.",
    dep: ["evaluation-event-ingestion", "analytics-export"]
  },
  "sample-ratio-check": {
    s: "Tests whether the observed share of users in each variant matches the planned split, flagging experiments whose assignment pipeline has probably been corrupted.",
    d: "If an experiment was planned at fifty-fifty and the data show fifty-three to forty-seven across a large sample, a goodness-of-fit test reports that this is very unlikely by chance. The usual causes are bugs: variants that crash and drop events, bots filtered unevenly, redirects, or logging that depends on the variant. A failed check marks results as untrustworthy and halts decisions. It is hard because small mismatches in large samples are significant, and the cause lies outside the statistics.",
    k: ["Strict automatic alert on mismatch versus informational display: bad experiments get stopped, but benign causes cause false alarms.", "Checking per segment as well as overall: finds problems in one platform or region, but multiplies the number of tests."],
    p: ["Teams read effect sizes from an experiment with a failed ratio check because the result was positive.", "The check runs only after the experiment ends, when the damage to the decision is done."],
    v: "Inject an assignment bug that drops ten percent of one variant's events in a test experiment and confirm the check fails with a very small p-value while an unmodified experiment passes.",
    dep: ["assignment-logging", "statistical-engine"]
  },
  "statistical-engine": {
    s: "Computes effect sizes, confidence or credible intervals and significance for each metric and variant, with corrections for repeated looks and many comparisons.",
    d: "For each variant versus control it estimates the difference in a metric with uncertainty, using a method chosen at design: fixed-horizon tests, sequential tests that allow continuous monitoring, or Bayesian models. Variance reduction using pre-experiment data can shorten runs. Outputs include intervals and the probability of being best. It is hard because naive repeated checking inflates false positives, and testing many metrics and variants at once finds spurious winners without correction.",
    k: ["Sequential methods versus fixed-horizon tests: valid at any time and so safe to monitor, but wider intervals for the same data.", "Frequentist versus Bayesian reporting: a probability statement non-statisticians read naturally, but results depend on priors that need explaining."],
    p: ["Stopping the first time a dashboard shows significance produces many false winners.", "Intervals are computed on per-event rather than per-user data, ignoring correlation and showing false certainty."],
    v: "Run an A/A experiment with identical variants many times and confirm significant results appear at about the nominal rate, such as five percent, and no more.",
    dep: ["metric-definitions", "exposure-events", "sample-ratio-check"]
  },
  "guardrail-metrics": {
    s: "Metrics that must not get worse, such as error rate, latency or revenue, watched during an experiment or rollout so a harmful variant is stopped even if the main metric improves.",
    d: "A guardrail has a threshold or non-inferiority margin. The service evaluates it throughout the run and alerts or automatically pauses the experiment if a variant is clearly harming it. Guardrails are shared across experiments so a team cannot forget to check them. They need a different sensitivity setting from success metrics, as stopping a harmless variant costs little while missing a harmful one costs a lot. It is hard to set margins people agree on beforehand.",
    k: ["Automatic pause on guardrail breach versus alert only: limits harm quickly, but noise can stop good experiments.", "Shared global guardrails versus per-experiment: nothing important is forgotten, but irrelevant guardrails dilute attention."],
    p: ["A latency guardrail uses an average that hides a worse tail for one variant.", "The guardrail is evaluated on a delayed data feed and trips hours after serious damage."],
    v: "Make a test variant add errors, run the experiment, and confirm the guardrail triggers a pause and notification within the documented delay while the control variant remains unaffected.",
    dep: ["metric-definitions", "statistical-engine", "automated-rollback"]
  },
  "mutual-exclusion-layers": {
    s: "Divides user traffic into layers so concurrent experiments that could interact do not overlap, while unrelated experiments reuse the same users.",
    d: "Each layer hashes users into buckets, and experiments in the same layer take disjoint bucket ranges, so no user is in two of them. Experiments in different layers hash with different salts, making them independent. Teams place experiments that touch the same screen or behavior in one layer. It is hard because layers reduce the traffic available to each experiment, ranges must be reserved and released as experiments start and end, and interactions between layers are only handled by statistical independence.",
    k: ["Exclusive layers versus fully independent experiments: no interference within a layer, but each experiment gets only part of the traffic.", "Releasing buckets after an experiment ends versus reserving them for a while: faster reuse, but carry-over effects contaminate the next experiment."],
    p: ["Two experiments editing the same button are placed in different layers and their effects combine unpredictably.", "A freed bucket range is immediately reused and users keep behavior learned in the previous variant."],
    v: "Start two experiments in one layer and confirm no user key appears in both assignment logs. Start a third in another layer and confirm its overlap with each is close to the product of their shares.",
    dep: ["consistent-hash-bucketing", "bucketing-salt-and-seed", "experiment-definition"]
  },
});
