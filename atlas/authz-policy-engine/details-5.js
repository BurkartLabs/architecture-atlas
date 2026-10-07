// Details part 5: auditing, storage and operations, cross-cutting concerns.
ATLAS.details("authz-policy-engine", {
  "decision-log": {
    s: "A durable record of each decision: who asked, what, the outcome, the policy revision, the data position and the reason, written so it can be searched and replayed.",
    d: "Every decision emits a structured entry with a unique identifier, timestamp, subject, action, resource, result, policy revision, data position, matched rules, latency and caller. Entries go to a local buffer and then a pipeline. The log answers incident questions, feeds replay and access reviews, and proves compliance. The difficulty is volume and content: allows on hot paths number in billions, and capturing enough inputs to replay without capturing sensitive data is a balance.",
    k: ["Log every decision versus only denies and sensitive allows: full logs support complete audits and cost storage, while selective logs are cheap and leave gaps.", "Log full inputs versus identifiers only: full inputs make replay possible, and identifiers keep logs small and less sensitive."],
    p: ["A log without the policy revision cannot explain a past decision after the rules changed.", "Logging synchronously on the request path adds latency and fails requests when the log is slow."],
    v: "Make a request and confirm one entry appears within seconds with the revision, position and rule identifiers; replay it from the entry alone and confirm the same result.",
    dep: ["log-pipeline-and-sampling", "policy-version-control"]
  },
  "log-pipeline-and-sampling": {
    s: "Moves decision records from engines to durable storage without slowing decisions, with buffering, batching, backpressure and rules for what is sampled or dropped.",
    d: "Engines write to a local queue; an agent batches and ships entries to a stream and then to searchable and archival storage. Sampling rules keep every deny, every access to sensitive types and a fraction of routine allows. When downstream is slow, the local queue absorbs bursts, then drops by priority. The difficulty is loss: audits assume completeness, so any drop must be counted and reported, and compliance data needs a lossless path.",
    k: ["Lossless for sensitive and sampled for routine versus uniform treatment: tiering controls cost and protects what auditors ask about, but needs a classification of decisions.", "Block the decision when the log is full versus drop entries: blocking guarantees a record and turns a log outage into an access outage."],
    p: ["Dropped entries that are not counted make an incomplete log look complete.", "A log agent that crashes silently stops shipping, and the gap is found at the next audit."],
    v: "Pause downstream for five minutes under load and confirm local queues absorb it, sensitive entries all arrive afterward, and the count of dropped routine entries is reported exactly.",
    dep: ["decision-log", "engine-observability"]
  },
  "tamper-evidence": {
    s: "Makes it detectable if anyone alters or deletes decision records or policy history after the fact, using chained hashes, signatures and write-once storage.",
    d: "Entries are batched into blocks whose hashes include the previous block's hash, and block hashes are periodically signed and published to a separate system. Storage is append-only with retention locks. An auditor recomputes the chain and finds any change or gap. Administrative actions on policy are logged the same way. The difficulty is who guards the guard: if administrators can alter both the log and the anchor, tamper evidence proves nothing, so the anchor must be held by an independent party.",
    k: ["Hash chain with external anchor versus plain access control on logs: chains prove integrity to outsiders, while access control is simple and relies on trusting administrators.", "Immutable storage with retention locks versus deletable logs: locks defeat deletion and prevent legitimate erasure when privacy law requires it."],
    p: ["A chain with no external anchor can be rebuilt end to end by someone with storage access.", "Signing keys kept next to the logs allow forged but valid-looking history."],
    v: "Modify one archived record and confirm chain verification fails at that block, naming it; delete a block and confirm the gap is reported against the published anchors.",
    dep: ["decision-log", "policy-version-control"]
  },
  "log-redaction": {
    s: "Removes or masks personal and secret data from decision records, and controls who may read what remains, so the log does not become a second sensitive database.",
    d: "Decision records name people and resources, and may contain attribute values such as health or salary classifications. Redaction replaces fields with stable tokens or hashes, drops attributes not needed for audit, and limits the log's own access through the same policy engine. Retention periods and erasure requests are applied here. The difficulty is keeping usefulness: hashing an identifier hides it from analysts too, and redacted logs may no longer support replay.",
    k: ["Tokenize identifiers reversibly versus hash irreversibly: reversible tokens let authorized investigators recover identity, while irreversible hashes remove the risk and the capability.", "Redact at write versus at read: at write protects the stored data, and at read keeps the raw record for those who may see it and protects less."],
    p: ["Resource names with customer names in them leak through logs that are widely readable.", "An erasure request cannot be satisfied because identifiers are scattered through archived blocks."],
    v: "Make a request involving a sensitive attribute and confirm the stored entry shows a token not the value; confirm an unprivileged log reader cannot recover it and an authorized investigator can.",
    dep: ["decision-log", "tenant-isolation"]
  },
  "access-review": {
    s: "Periodic examination of who holds which access, using list queries and logs, so owners confirm that access is still needed and remove what is not.",
    d: "A review job enumerates grants by resource or by subject, enriches them with last use from the log, and sends each owner a worklist to approve or revoke. Revocations flow back through the write API and are verified. Stale and unused grants, and people with unusual combinations, are highlighted. The difficulty is review fatigue: thousands of items approved in bulk are not reviews, so tools rank by risk and use evidence of non-use.",
    k: ["Review by resource owner versus by manager: owners know what the data is, while managers know whether the person needs it.", "Automatic removal of unused grants versus review-only: automatic removal shrinks access consistently, and surprises people whose use is rare but real."],
    p: ["Reviewers click approve-all, and the audit passes while excess access stays.", "Reviews that list roles but not what they permit give owners nothing to judge."],
    v: "Run a review for one project, revoke a flagged grant, and confirm the change is applied, a check by that person now denies, and the review record shows who decided and when.",
    dep: ["list-subjects-query", "decision-log", "relationship-write-api"]
  },
  "decision-anomaly-detection": {
    s: "Watches decision logs for unusual patterns, such as sudden bulk access, spikes in denials or a service reading data it never touched before, and raises alerts.",
    d: "Baselines are built per subject and per service: usual resources, volumes and hours. The detector flags deviations, for example a user listing thousands of objects, a burst of denials that suggests probing, or a new caller asking about many subjects. Alerts go to security operations with the decision identifiers. The difficulty is noise and evasion: legitimate batch jobs look like attacks, and a patient attacker stays under the thresholds.",
    k: ["Rule-based thresholds versus learned baselines: thresholds are explainable and easy to tune, while baselines adapt to behavior and are harder to interpret.", "Alert on denials versus on unusual allows: denials show probing, but the damaging events are allows that no one expected."],
    p: ["A new service's first week of traffic is flagged as an incident because no baseline exists.", "Alerts without the decision identifiers force analysts to reconstruct what happened."],
    v: "Simulate a script that enumerates many resources as one user, and confirm an alert is raised within minutes with the user, count and a link to the decisions, while a nightly batch job does not alert.",
    dep: ["decision-log", "log-pipeline-and-sampling"]
  },
  "policy-store": {
    s: "The durable home of schema, policies, role definitions and bundle metadata, with revision history, ownership data and strong consistency for control-plane changes.",
    d: "A relational or document store holds policy documents by namespace and revision, plus metadata: owners, approval records, activation history and the active revision per environment. Control-plane writes are low volume and need transactions and a full history. Engines never read it on the request path; they read bundles built from it. The difficulty is separation: the control plane can be slow and must be correct, and it must not become a dependency of decisions.",
    k: ["Control plane in a transactional database versus in files in a repository: a database provides transactions and queries, while a repository provides review and history, so many use both.", "Engines read the store directly versus read bundles: direct reads are always current, and put the store in every request path."],
    p: ["Engines reading the policy store on each request turn a control-plane slowdown into a decision outage.", "No record of which revision was active when means incidents cannot be dated."],
    v: "Stop the policy store and confirm engines keep deciding from their loaded bundles; restore it and confirm history shows every activation with author and time.",
    dep: []
  },
  "sharding-and-partitioning": {
    s: "Splits relationship and attribute data across nodes so no single machine holds or serves all of it, choosing keys that keep related edges together.",
    d: "Data is partitioned by a key, commonly the object identifier or the tenant, so that a check touches few partitions. A router maps keys to shards, rebalancing moves ranges as load changes, and a directory tracks placement. A traversal that crosses shards costs network hops. The difficulty is that graph queries do not respect any single key: resources and the users and groups that reach them live in different places, so locality is partial and hot partitions appear.",
    k: ["Partition by object versus by subject: by object makes checks on one resource local, while by subject makes list queries local and splits objects' edges.", "Partition by tenant versus by key range: tenant partitions isolate customers and cap the size of one, while range partitions balance load within a huge tenant."],
    p: ["A tenant that outgrows its partition needs a live split that is among the riskiest operations in the system.", "Hash partitioning scatters a group's members and turns every membership read into a fan-out."],
    v: "Load a skewed workload, confirm shard load stays within a fixed ratio after rebalancing, and that a split moves data with checks continuing to return correct answers throughout.",
    dep: ["relationship-store-engine", "tuple-indexes"]
  },
  "high-availability": {
    s: "Keeps decisions available through machine, zone and region failures by replicating data and engines, with defined behavior for the failures that remain.",
    d: "Engines are stateless or hold replicated state, run in several zones behind health-checked routing, and fail over without manual steps. The store replicates synchronously within a region and asynchronously or by consensus across regions. Because authorization is on the critical path of other services, its availability target must exceed theirs. The difficulty is that availability and consistency trade off: during a partition the engine must choose to deny, to serve stale data or to refuse.",
    k: ["Serve stale during a partition versus refuse: serving stale keeps products up and may honor revoked access, while refusing is safe and takes dependent services down.", "Active-active regions versus active-passive: active-active uses all capacity and speeds failover, while active-passive is simpler to reason about and wastes capacity."],
    p: ["A failover that has never been exercised fails in a way no one has seen, and during a real outage.", "Shared dependencies, such as one certificate service, defeat the independence of the replicas."],
    v: "Terminate one zone's engines and storage nodes under load, confirm error rate stays within its objective and checks continue; repeat for a region on a schedule and record time to recovery.",
    dep: ["relationship-store-engine", "cross-region-replication"]
  },
  "tenant-isolation": {
    s: "Ensures one tenant's data, policy and load cannot be seen or affected by another, through separate namespaces, quotas, encryption keys and scheduling.",
    d: "Isolation works at several levels: namespace-scoped credentials, per-tenant storage partitions and encryption keys, and request-level limits so one tenant's expensive queries cannot exhaust shared engines. Caches key every entry by tenant. Some customers require dedicated clusters. The difficulty is leakage through shared pieces: caches, logs, error messages and metrics all contain tenant data, and a noisy neighbor causes harm without any data breach.",
    k: ["Shared infrastructure with logical isolation versus dedicated clusters: shared is efficient and depends on every code path being correct, while dedicated is stronger and costs much more.", "Per-tenant encryption keys versus one key: per-tenant keys allow crypto-erasure and limit blast radius, and add key management load."],
    p: ["A cache key without the tenant lets one tenant receive another's decision.", "No per-tenant concurrency cap lets one customer's list query starve all others."],
    v: "Using one tenant's credential, request another tenant's objects and confirm refusal; run a heavy workload in one tenant and confirm another's latency is unchanged.",
    dep: ["cache-key-design", "policy-store"]
  },
  "engine-observability": {
    s: "Metrics, traces and alerts that show the engine's health and behavior: latency, error and limit rates, cache hit ratios, replication lag, bundle age and denial rates.",
    d: "The engine exports histograms for decision latency by route and type, counters for decisions by result, limit hits, fallbacks and cache outcomes, gauges for replica position lag and bundle age, and traces that follow one decision through context assembly and traversal. Alerts are tied to objectives. Denial rates by route are an early signal of bad policy. The difficulty is cardinality and meaning: per-subject metrics explode in size, and an average hides the tail that users feel.",
    k: ["Aggregate metrics versus per-tenant metrics: aggregate is cheap, while per-tenant shows who is affected and costs cardinality.", "Always-on tracing versus sampled: always-on makes every incident explainable and costs overhead, while sampling misses the rare slow request."],
    p: ["Alerting on mean latency hides a ninety-ninth percentile that is breaking pages.", "A bundle-age metric that no one alerts on lets a fleet run old policy for weeks."],
    v: "Inject latency into the store and confirm tail-latency and limit-hit metrics move, the trace shows the slow stage, and an alert fires within its configured window.",
    dep: ["decision-log"]
  },
  "backup-and-recovery": {
    s: "Protects policy, schema and relationship data against corruption, mistaken bulk changes and loss, with tested restores to a chosen point in time.",
    d: "The store takes continuous log archiving and periodic snapshots, and policy history is already versioned. Recovery means restoring to a position, then reconciling with applications that kept running. Because permissions define who can access data, a restore to an earlier point can also restore access that was since revoked, so recovery plans include re-applying revocations. The difficulty is rehearsal: restores are rarely tested until needed, and applications' own state may no longer match the restored permissions.",
    k: ["Point-in-time restore versus snapshot-only: point-in-time loses less and is complex, while snapshots are simple and can lose hours of changes.", "Replay revocations after restore versus accept the older state: replaying is safe and requires keeping a separate revocation record, while accepting is simple and re-grants old access."],
    p: ["A restore that resurrects deleted memberships re-grants access to people who were removed.", "Backups encrypted with a key that no one can retrieve are not backups."],
    v: "Restore a copy of the store to a point yesterday into a test environment, confirm its checks match the logged decisions of that time, and confirm the recorded revocations since then are re-applied.",
    dep: ["policy-store", "relationship-store-engine"]
  },
  "fail-open-or-closed": {
    s: "The standing decision on what happens when the engine cannot answer: refuse everything, allow everything or choose per resource, because every outage then becomes either unavailability or exposure.",
    d: "Every layer from enforcement point to store has a failure path, and each needs a defined result. A global choice is rarely right: public content can stay open while payroll stays closed. The decision interacts with caches, sidecars with last-known bundles, and timeouts, and must be tested by actually removing the engine. It shapes the availability target, since fail-closed makes the engine as critical as the product, and the incident plan that follows.",
    k: ["Closed everywhere versus tiered by sensitivity: closed is safest and couples availability, while tiers match business risk and need a classification.", "Decide per enforcement point versus centrally: per point fits each service, and leads to inconsistent behavior that is hard to audit."],
    p: ["An emergency fail-open flag set during an incident and forgotten stays on for months.", "Teams assume fail-closed but their client library defaults to allow on timeout."],
    v: "Cut engine connectivity for a test namespace and confirm each protected route behaves as its documented class demands, and that dashboards show the number of decisions made in fallback mode.",
    dep: []
  },
  "decision-freshness": {
    s: "How current a decision must be: the maximum delay between a permission change and its effect, which sets the cost of consistency, caching and distribution.",
    d: "Different changes need different bounds: firing an employee or reporting a stolen device should take effect in seconds, while a role change for a project can take minutes. The bound is the sum of delays in tokens, caches, replicas and derived indexes, and each layer must be designed to fit under it. Tighter bounds cost latency and money. The difficulty is that the bound is a business promise nobody wrote down, and the system quietly delivers whatever its slowest layer gives.",
    k: ["One uniform bound versus tiers by change type: uniform is simple to state and test, while tiers spend effort on revocations and relax everything else.", "Pay for strong consistency on all reads versus only where tokens are present: always-fresh is easy to reason about and slow, while token-driven freshness is fast and relies on callers."],
    p: ["The advertised bound is measured on the store but not at the browser, so real exposure is longer than stated.", "A new cache layer added for speed breaks a promise made two years earlier."],
    v: "Revoke access for a test user and record the time each enforcement path, cache and token stops allowing, then compare the slowest with the published bound.",
    dep: []
  },
  "latency-budget": {
    s: "The time a decision may take, usually a few milliseconds at the 99th percentile, divided among network, context assembly, evaluation and data reads so that authorization is not the slow part of a request.",
    d: "Because a single user action may trigger dozens of checks, the engine's tail latency multiplies. The budget is allocated per stage: local call microseconds, attribute fetch bounded, traversal bounded by limits. It dictates architecture: sidecars, caches, precomputed indexes and batching all exist to meet it. It is enforced by evaluation limits and measured at the caller. The difficulty is the tail: occasional deep traversals and cold caches hurt more than the average suggests.",
    k: ["Optimize the median versus the tail: the median is easy to improve and users feel the tail, which needs limits and hedging.", "Spend latency on accuracy versus on speed: fresher data and deeper traversals are more correct, and the budget pushes toward caching and cutting paths short."],
    p: ["Measuring latency at the engine misses queueing and network time that callers actually experience.", "Adding one attribute lookup to a hot rule doubles tail latency of every request."],
    v: "Under production-like load, measure latency at the caller for batches and single checks, and confirm the 99th percentile stays within the budget including a cold-cache run.",
    dep: ["evaluation-limits"]
  },
  "policy-ownership": {
    s: "Who is accountable for each rule: the security team, the product team or the data owner, and how conflicts between their needs are resolved.",
    d: "Policy spans domains, and no single person understands all of it. Ownership is recorded per namespace and module and enforced by the review workflow. Central teams own global guardrails, such as deny rules and baseline roles; product teams own roles for their features; data owners own classifications. The difficulty is boundaries and decay: rules outlive their authors, ownership data goes stale after reorganizations, and ownerless rules are neither reviewed nor removed.",
    k: ["Central ownership versus federated: central gives consistency and becomes a bottleneck, while federated scales and drifts in quality.", "Ownership by metadata in policy versus by repository paths: metadata travels with the rule, and paths reuse existing tooling and can diverge from reality."],
    p: ["After a reorganization the listed owner no longer exists, and approvals route to nobody.", "Two teams each believe the other owns a shared role and neither updates it."],
    v: "List all rules with no valid current owner, and confirm the count is zero, or each has a ticket; make a change to a rule and confirm the review request reaches its named owner.",
    dep: []
  },
  "least-privilege-defaults": {
    s: "The principle that new subjects, resources and rules start with no access, and that broader access must be asked for, granted narrowly and expire when unneeded.",
    d: "Default deny when no rule matches, minimal roles at onboarding, time-limited elevated grants, and resources that start private are the practical forms. It shapes combining algorithms, schemas, onboarding flows and review cycles. It pushes work to the people who need access, and makes the cost of requesting it visible. The difficulty is friction: if getting access is slow, people share credentials or ask for broad roles, and the principle erodes into a ritual.",
    k: ["Default deny versus default allow within a trusted group: default deny is safest and generates access requests, while internal defaults are convenient and quietly broad.", "Time-limited grants versus permanent: expiry removes forgotten access and creates renewal work."],
    p: ["Broad roles granted to avoid access-request delays become the permanent norm.", "A default-allow rule added for a new product to ship on time is never narrowed."],
    v: "Create a new resource and a new user and confirm the user has no access until granted; count grants with no expiry at elevated levels and confirm each has a recorded justification.",
    dep: []
  },
  "explainability": {
    s: "The ability to say, for any past or present decision, which rules and facts produced it, in terms an administrator or an auditor can follow without reading engine code.",
    d: "It requires traces from the evaluator, a log that records revision and data position, and the ability to reconstruct state at a past time. It is used by support to answer \"why can't I open this\", by developers to debug policy, and by auditors. It conflicts with performance, since tracing costs time, and with confidentiality, since explanations reveal structure. Designing for it early is cheap, and adding it after policy is deployed is nearly impossible.",
    k: ["Explanations for administrators only versus for end users: administrators need full detail, while end users need a minimal safe hint such as whom to ask.", "Trace always versus reconstruct on demand: always is simple to serve and costs every request, while reconstruct is cheap and needs history retained."],
    p: ["Support tickets about denied access cannot be answered without an engineer re-running the request by hand.", "An explanation tool that evaluates against current data contradicts the logged decision."],
    v: "Pick ten logged denials from last week and, using only the logged identifiers, produce the explanation for each; confirm that every one names a rule or missing relationship and matches the original result.",
    dep: []
  },
});
