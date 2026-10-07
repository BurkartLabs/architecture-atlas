// Details for the feature store plate, part 2: governance and monitoring.
ATLAS.details("feature-store", {
  "access-control": {
    s: "Decides which people, services and models may define, read, write or share each feature, enforced at the registry, the offline store and the serving path.",
    d: "Permissions attach to projects, views and sometimes single features, and are checked for definition changes, training-set requests and online lookups. Roles distinguish authors, consumers and administrators. Enforcement must hold in every path: a restriction in the catalog means little if the offline tables are directly readable in the warehouse. Online serving checks must be cheap, so tokens carry or cache grants. The hard part is keeping the policies in the store and in the underlying systems consistent.",
    k: ["Enforcing in the feature store only versus also in the underlying stores: store-level checks are uniform, but users with direct warehouse access bypass them.", "Per-feature grants versus per-view grants: per-feature is precise but unmanageable at thousands of features, per-view is coarse and over-shares."],
    p: ["The catalog hides a restricted feature but the offline table behind it is readable by every analyst.", "A service account with broad read access is shared by many models, so access reviews cannot say who needs what."],
    v: "Using an identity without access, attempt a catalog read, a training-set request on the feature and an online lookup, and a direct table read; all four must be denied and logged.",
    dep: ["identity-and-secrets", "metadata-registry", "project-tenancy"]
  },
  "sensitive-data-tagging": {
    s: "Labels features that contain or derive from personal or regulated data, so that policies on access, retention, masking and model use can be applied automatically.",
    d: "Tags such as personal, financial or health are set on source columns and propagate through lineage to every feature derived from them. Policies key off tags: restricted access, shorter retention, no export to certain environments, and required approval before use in a model. Propagation is the hard part, because aggregations and embeddings derived from sensitive inputs may or may not remain sensitive, and rules for that are judgment, not computation.",
    k: ["Automatic propagation versus manual tagging: automatic tags are consistent and conservative, but over-tag aggregates and create approval work; manual tags are accurate but get forgotten.", "Tagging at source versus at feature: source tagging catches every derivative, feature tagging captures what the derivation means."],
    p: ["A feature built from a tagged column is created through custom code that lineage does not see, so it carries no tag.", "Everything gets tagged sensitive and the tag stops meaning anything."],
    v: "Tag a source column, create a derived feature, and confirm the feature inherits the tag and that a user without clearance is denied. Remove the tag and confirm access policy updates.",
    dep: ["lineage-graph", "metadata-registry"]
  },
  "audit-log": {
    s: "An append-only record of who changed definitions, who read which features and when, and what each materialization or backfill touched, kept for compliance and incident investigation.",
    d: "Writes to the registry, applies, access grants, large training-set pulls and administrative actions are logged with identity, time, target and outcome. Read logging for online lookups is usually sampled or aggregated because of volume, while sensitive features may require complete records. Logs go to storage the feature store's own administrators cannot edit. Value comes only if the log can answer concrete questions such as who exported this feature last month.",
    k: ["Logging every read versus logging grants and exports: every read is complete but costly at serving rates, grants and exports are cheaper but miss bulk reading through allowed channels.", "Logs inside the store versus a separate system: separate systems are harder to tamper with, at the price of another pipeline."],
    p: ["Audit records identify a shared service account, not the person or model that triggered the read.", "Log retention is shorter than the period an investigator needs to look back."],
    v: "Perform a definition change and a training-set export with a test identity, then query the log and confirm both appear with identity, time and target, and that the log writer's role cannot delete them.",
    dep: ["identity-and-secrets", "object-storage"]
  },
  "approval-gates": {
    s: "Requires a human or automated sign-off before risky changes take effect: applying to production, using a sensitive feature in a model, deleting data or running a very large backfill.",
    d: "Gates sit in the change pipeline and in access requests. A change touching a production view may need the owner's approval, and a request to use a restricted feature routes to its data steward. Automated gates check things such as estimated cost, whether consumers are affected and whether tests passed. Gates slow people down, so the design question is which changes truly warrant them. Approval requests should show the impact, not a raw diff.",
    k: ["Blanket approval versus risk-based approval: blanket rules are simple but train people to click through, risk-based rules need a classification that can be wrong.", "Approval in the pipeline versus in the tool: pipeline gates cover every path, tool-level gates are easier to build but can be bypassed."],
    p: ["An approver sees a diff of definitions without the list of affected models, and approves a breaking change.", "Approvals are granted once and reused for later, different changes."],
    v: "Submit a change that affects a production service and confirm it cannot apply until the named approver signs off, and that the approval record shows the impact summary the approver saw.",
    dep: ["plan-and-apply", "access-control", "lineage-graph"]
  },
  "project-tenancy": {
    s: "Partitions the store into projects or namespaces, each with its own definitions, quotas, permissions and data locations, so teams can share one platform without stepping on each other.",
    d: "A project scopes names, access, cost and often storage locations. Features in one project are not visible to others unless explicitly shared, and a sharing mechanism lets a feature be consumed across projects with the owner's consent. Quotas bound materialization and storage so one team cannot starve the rest. Multi-tenancy at the storage layer, with separate tables or key prefixes, reduces risk but multiplies objects to manage.",
    k: ["Strong isolation versus shared infrastructure: separate stores prevent interference and leaks, but cost more and make cross-project features harder.", "Central platform team versus self-service projects: self-service scales, but quality and naming vary without guard rails."],
    p: ["A quota is missing and a single backfill by one team saturates the shared compute cluster.", "Two projects use the same entity name with different keys, and a cross-project join silently mismatches."],
    v: "From project A, attempt to read a feature in project B without a share and confirm denial; add a share and confirm the read succeeds and is attributed to project A.",
    dep: ["metadata-registry", "access-control"]
  },
  "cost-attribution": {
    s: "Measures what each view, feature and model costs in compute, storage and lookups, and charges it to an owner, so spending can be weighed against use.",
    d: "Costs come from materialization jobs, offline storage, online store capacity and serving traffic. Attribution maps them to views and projects using job tags and storage sizes, and shares joint costs by reads or by an agreed rule. Combined with usage data, it shows features that are expensive and rarely read. Online storage is usually the largest surprise because it keeps data in fast, expensive media. Allocation rules are partly political and need to be agreed in advance.",
    k: ["Tagging jobs at the source versus allocating after the fact: tags are accurate but require discipline, post-hoc allocation covers everything with less precision.", "Showback versus chargeback: showback informs without conflict, chargeback changes behavior but invites disputes over allocation rules."],
    p: ["Shared jobs that compute many views are charged entirely to one owner.", "Online store costs scale with stored entities times features, which no one budgeted for when adding a view."],
    v: "Create a view with a known number of entities and features, wait one billing period and confirm its reported online and offline storage is within a small tolerance of the actual size on disk.",
    dep: ["usage-tracking", "metrics-and-tracing", "compute-cluster"]
  },
  "deletion-and-retention-requests": {
    s: "Handles requests to erase or restrict a person's data, and enforces retention limits, across the offline store, online store, snapshots and training sets already produced.",
    d: "An erasure request identifies an entity key, which must be found in every table, in online rows, in saved dataset snapshots and in logged features. Offline stores are append-heavy and immutable by design, so deletion means rewriting files or keeping a deletion list applied at read time. Trained models may also embody the data, which the feature store can only note. The hard part is completeness: every copy has to be known to the registry.",
    k: ["Physical rewrite versus tombstones applied at read: rewriting truly removes data but is costly on large tables, tombstones are cheap but leave the data until compaction.", "Short retention by default versus long retention: short retention lowers exposure and cost, long retention preserves reproducibility of old training sets."],
    p: ["Dataset snapshots exported to a team's own storage hold the data after the main tables are cleaned.", "The key to erase is a surrogate that cannot be mapped back from the request, so rows remain."],
    v: "Insert a test entity, materialize it, snapshot a training set containing it, then process an erasure request and confirm the key is absent from offline tables, online store and the snapshot after the documented deadline.",
    dep: ["entity-key-mapping", "compaction", "table-snapshots", "dataset-snapshots", "audit-log"]
  },
  "freshness-monitoring": {
    s: "Measures how old the data behind served features is, from source event to online availability, and flags views that fall behind their targets.",
    d: "For each view the monitor compares the latest source event time, the latest processed time and the latest write to the stores. The lag between them shows where data is stuck: waiting for a source, in a failed job or not yet synced to the online store. Event time and processing time differ and must not be mixed: a job that runs on schedule but reads an old partition looks healthy yet serves stale data. It must also cope with sources that legitimately pause.",
    k: ["Measuring at the job level versus at the value level: job-level checks are simple but miss jobs that succeed on stale input, value-level checks catch it at the cost of reading timestamps.", "Static thresholds versus learned baselines: static is predictable, learned baselines adapt to weekly patterns but can normalize slow decay."],
    p: ["A job finishes successfully on schedule but processes an empty partition, and freshness looks fine because it measures job completion.", "A quiet source, such as a weekend with no events, triggers alerts every Sunday."],
    v: "Pause an upstream source and confirm the monitor reports growing lag for the affected view within one check interval, with the stage where data stopped. Resume and confirm it recovers.",
    dep: ["freshness-tracking", "event-time-and-watermarks", "metrics-and-tracing"]
  },
  "drift-detection": {
    s: "Compares the distribution of each feature now with a reference, such as the training data, to find shifts that can degrade a model without producing any errors.",
    d: "The monitor samples served or recently computed values and computes statistics: mean, quantiles, null rate, category frequencies, and distances such as a population stability index or a divergence measure. It compares them to a baseline from training or a trailing window. Drift is not always a problem; seasonality is normal, and some shifts reflect real changes in the world. The signal is useful when combined with model performance, which often arrives late, as labels do.",
    k: ["Training baseline versus trailing-window baseline: a training baseline shows deviation from what the model learned, a trailing window shows sudden change but hides slow drift.", "Univariate versus multivariate tests: univariate tests are readable and cheap, multivariate catch correlation breaks but are hard to explain and alert on."],
    p: ["Thousands of features each tested daily produce a steady stream of false alarms until owners mute them.", "Drift is computed on a sample that is not representative of serving traffic, such as only the cached keys."],
    v: "Replay a day of data with one feature deliberately shifted by a known amount and confirm the monitor flags that feature and not the unchanged ones, with a magnitude close to what was injected.",
    dep: ["feature-logging", "offline-query-engine", "alert-routing"]
  },
  "skew-detection": {
    s: "Compares the values a model saw at serving time with the values the offline path produces for the same entities and times, to catch differences that make production unlike training.",
    d: "Features logged at serving are joined to values recomputed through the training path for the same entity and timestamp, and the differences are summarized per feature. Mismatches point to different transformation code, different data sources, timezone or rounding differences, or stale online values. This is the most direct check of training-serving consistency. It requires exact logging of what was served, and tolerance rules so that harmless floating point differences do not alarm.",
    k: ["Exact-match comparison versus tolerance-based: exact matches find all bugs but flag harmless noise, tolerances reduce noise and can hide real small errors.", "Continuous checks versus sampled audits: continuous gives early warning, sampling is cheaper for high-volume models."],
    p: ["The join between logged and recomputed values uses processing time, so records that arrived late are compared against the wrong snapshot.", "Only the feature values are compared, not the order or the defaults used, so a swapped column goes unseen."],
    v: "Inject a unit difference into the online path for one feature, such as seconds instead of milliseconds, and confirm the skew report names that feature with a mismatch rate close to one.",
    dep: ["feature-logging", "point-in-time-join", "offline-query-engine", "alert-routing"]
  },
  "value-validation": {
    s: "Rules that check computed values as they are produced: allowed ranges, null rates, uniqueness, cardinality and relationships, with a policy for what happens on failure.",
    d: "Expectations are declared with the feature and run in the transformation or materialization job: a ratio must lie between zero and one, an identifier must be unique, null rates must stay below a limit. On failure the policy may block the write, quarantine the batch, write with a flag or only alert. Blocking protects models from bad data but turns a data problem into a freshness problem. Choosing thresholds from observed data keeps rules relevant, but can encode existing problems as normal.",
    k: ["Block on failure versus write and alert: blocking protects consumers but makes stale values, writing keeps data fresh but passes bad values into models.", "Hand-written rules versus profiled rules: handwritten rules encode intent, profiled rules cover many features quickly but only capture the past."],
    p: ["A validation job reads a different partition than the materialization job, so it passes data that is never written.", "Blocking rules fail the whole batch for one malformed row, leaving every entity stale."],
    v: "Feed a batch with a known out-of-range value and confirm the configured policy occurs: the batch is quarantined or flagged, the failure is counted and an alert reaches the owner.",
    dep: ["batch-transform-engine", "stream-transform-engine", "alert-routing"]
  },
  "feature-logging": {
    s: "Records the exact feature values returned at serving time with entity, timestamp and model identifiers, so they can be used for skew checks, debugging and later training.",
    d: "Serving writes a log record per request, or per sampled request, with the values it actually returned, including defaults and fallbacks, and the service version. The log lands in a stream or object storage and is joined with outcomes later. Training on logged features removes the whole class of reconstruction skew, since the model learns from what it was served. The cost is volume, privacy exposure and a pipeline that must never slow serving, so logging is asynchronous.",
    k: ["Logging at serving versus recomputing history: logged values are the truth of what the model saw, but are costly and exist only from the day logging started.", "Synchronous versus asynchronous logging: synchronous never loses a record but adds latency, asynchronous protects latency and may drop records under load."],
    p: ["Logs omit defaulted values, so the data cannot tell a real zero from a fallback zero.", "Logs are sampled by request, so rare entities and failure cases are underrepresented in later training."],
    v: "Make a request with a known entity and confirm a log record appears within the documented delay with identical values, the service version and a timestamp, and that disabling the log sink does not raise request latency.",
    dep: ["online-lookup-api", "stream-broker", "object-storage"]
  },
  "alert-routing": {
    s: "Turns monitoring findings into notifications to the right owner, with severity, deduplication and a link to the evidence, so problems are acted on instead of ignored.",
    d: "Findings from freshness, drift, skew and validation checks are classified by severity and routed using the ownership data in the registry: the view owner is paged for freshness loss, the model owner is told about drift. Deduplication and grouping stop one outage from sending hundreds of messages. Alerts need runbooks and a link to the dashboard. The common failure is alert fatigue: too many low-value notifications teach owners to ignore all of them.",
    k: ["Page on every violation versus page on user-visible impact: paging on everything catches problems early but causes fatigue, impact-based paging needs a link to model health.", "Per-feature alerts versus per-view alerts: per-view groups cut volume but hide which feature failed until opened."],
    p: ["Routing uses an owner list that is out of date, so alerts go to a mailbox nobody reads.", "A single upstream failure triggers separate alerts for every dependent view."],
    v: "Trigger a synthetic freshness violation on a test view and confirm exactly one notification reaches the registered owner with severity, a runbook link and the failing view, and that a repeat within the dedup window sends none.",
    dep: ["ownership-and-docs", "metrics-and-tracing"]
  },
  "quality-dashboards": {
    s: "Shows the health of each view and feature over time: freshness, null rates, drift, skew and job status, so owners and consumers can judge whether a feature is safe to use.",
    d: "Dashboards read monitoring output and registry metadata to give per-view and per-feature pages, plus an overview of the platform. Consumers use them before adopting a feature, owners use them during incidents. They are most useful when they show the same numbers that alerts use, with history long enough to see trends and releases. Statistics have to be computed in scheduled jobs, since on-demand scans of large offline tables are too slow to power a page.",
    k: ["Precomputed statistics versus on-demand queries: precomputed is fast and cheap per view, on-demand is always current but slow and costly on large tables.", "Platform-wide overview versus owner-specific pages: overviews help the platform team spot systemic issues, owner pages are actionable for each team."],
    p: ["Dashboards show job success rather than data quality, so a green board hides empty outputs.", "Statistics are computed on a sample that misses a rare segment where the feature is broken."],
    v: "Pick a view with a known recent incident and confirm its page shows the freshness gap and recovery at the right times, and that numbers match the values the alert reported.",
    dep: ["freshness-monitoring", "drift-detection", "skew-detection", "metrics-and-tracing"]
  },
  "freshness-slos": {
    s: "States per view how fresh served values must be, such as ninety-nine percent of lookups returning data less than ten minutes old, and measures compliance against that target.",
    d: "An objective turns a vague promise into a number that can be measured and budgeted. It defines freshness precisely, from source event to availability for serving, a percentile and a window. It drives design: a ten-minute target forces streaming, a daily one allows batch. The objective should be set by what the model needs, since each step down in staleness raises cost sharply. Missed objectives consume an error budget that changes priorities.",
    k: ["Tight objectives for all views versus tiered objectives: uniform targets are easy to explain, but tiering ties cost to the value of freshness.", "Measuring freshness at store write versus at lookup: store-write is simple, lookup-time measures what the model actually received."],
    p: ["The objective is stated in job schedule terms, such as hourly, and says nothing about how old the source data was when the job ran.", "Targets are set tighter than the source system can deliver, so the objective is violated from the first day."],
    v: "Compute the compliance for one view over a week from lookup-time ages and confirm it matches the dashboard, and that a deliberately delayed batch is counted against the budget.",
    dep: ["freshness-monitoring", "freshness-tracking"]
  },
});
