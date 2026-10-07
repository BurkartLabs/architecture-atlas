// Details for the feature store plate, part 6: platform services and cross-cutting concerns.
ATLAS.details("feature-store", {
  "workflow-orchestrator": {
    s: "Runs the dependency graph of materialization, backfill, validation and sync jobs, with schedules, retries, backfilled runs and visibility into what ran and what failed.",
    d: "The orchestrator holds the graph of tasks, triggers them by time or data arrival, runs them on the compute cluster and records outcomes. Feature stores generate many similar tasks, one per view and interval, so the orchestrator must handle thousands of small runs and wide fan-out. It is also the place where operators rerun a failed interval or pause a view. When it is unavailable, no new data flows although serving continues with stale values.",
    k: ["Using a general orchestrator versus a built-in scheduler: general ones integrate with other pipelines and add concepts, built-in schedulers fit the feature model and duplicate infrastructure.", "Tasks per interval versus long-running tasks: per interval retries precisely and creates many tasks, long-running tasks are simple and restart from scratch."],
    p: ["Orchestrator metadata grows with history and slows scheduling until runs start late.", "Manual reruns by operators bypass the recorded state, and the registry no longer matches what ran."],
    v: "Trigger a view's run, kill its worker, and confirm the orchestrator retries, the interval completes once and the run history shows each attempt with its outcome.",
    dep: ["compute-cluster", "identity-and-secrets"]
  },
  "compute-cluster": {
    s: "The pool of machines on which batch jobs, stream jobs, backfills and queries run, with resource queues that keep production work isolated from experiments.",
    d: "Compute may be a shared cluster, an elastic cloud service or a container platform. Feature workloads vary: steady streaming jobs need guaranteed capacity, batch jobs burst, and backfills are huge and deferrable. Queues and quotas separate production views from ad hoc training builds. Autoscaling cuts cost and adds startup delay. Because everything freshness-related runs here, capacity shortfalls surface as stale features, which is a hard symptom to connect to its cause.",
    k: ["Shared cluster versus dedicated per workload: shared uses capacity well and allows interference, dedicated isolates and idles capacity.", "Elastic autoscaling versus reserved capacity: elastic saves money and delays jobs while machines start, reserved is predictable and paid for always."],
    p: ["A large backfill takes the queue and delays hourly production runs behind it.", "Autoscaling limits are hit during a traffic spike, and streaming jobs fall behind."],
    v: "Submit a large backfill alongside production jobs and confirm production runs still start within their queue wait objective and freshness targets are met.",
    dep: ["identity-and-secrets", "metrics-and-tracing"]
  },
  "object-storage": {
    s: "Durable, cheap, large-scale storage for files, holding offline tables, checkpoints, snapshots, logs and exports, accessed over a network API.",
    d: "Nearly everything large lives here: table files, stream state checkpoints, dataset exports, logged features and backups. It offers high durability and throughput and weaker semantics than a file system: objects are immutable, renames are copies, and listing can be slow or eventually consistent in some services. Table formats and commit protocols are designed around those limits. Costs come from storage, requests and transfer, and small objects make request costs dominate.",
    k: ["One bucket layout for everything versus per-purpose separation: one is simple, separation allows different lifecycle, access and cost rules.", "Same-region storage versus cross-region copies: same-region is cheap and fast and lost with the region, cross-region is resilient and costs transfer."],
    p: ["Listing millions of small objects makes job startup take minutes.", "Lifecycle rules delete checkpoints or snapshots that are still referenced."],
    v: "Write and read back objects of the typical sizes at job concurrency and confirm throughput and request cost match the plan, and a restore from a deliberately deleted object version succeeds.",
    dep: ["identity-and-secrets"]
  },
  "stream-broker": {
    s: "The durable log service that carries events, change feeds and feature updates between producers and consumers, with partitions, retention and consumer offsets.",
    d: "Producers append to partitioned topics, and consumers read by offset, which makes replay and independent consumers cheap. Partition counts bound parallelism and ordering: order is guaranteed only within a partition, which is why keys matter. Retention decides how far back a consumer can recover. The broker is shared infrastructure, and its capacity, availability and upgrades affect every streaming feature, so lag per consumer is a core signal.",
    k: ["Many partitions versus few: many allow parallelism and rebalancing and add overhead, few are simple and cap throughput.", "Long retention versus landing to storage: long retention allows replay from the broker and costs capacity, landing makes the broker a short buffer."],
    p: ["Partitions are keyed unevenly, and one hot partition makes a consumer lag forever.", "A topic is deleted or its retention shortened during a cleanup, and recovery is impossible."],
    v: "Produce a burst larger than the normal rate, confirm consumer lag grows and then drains within the stated time, and that a replay from an old offset returns the same events.",
    dep: ["identity-and-secrets", "object-storage"]
  },
  "identity-and-secrets": {
    s: "Authenticates people and services, issues short-lived credentials and stores connection secrets, so components reach each other and the data stores without long-lived shared keys.",
    d: "Every component talks to others: jobs read sources and write stores, serving reads the online database, users call the registry. Workload identities replace passwords, and tokens are scoped and expire. Secrets such as database credentials are fetched at start from a vault and rotated. A feature store touches many systems, so one over-broad credential becomes a path to all of them. Authorization decisions use identity from here, and are enforced by the access layer.",
    k: ["Per-workload identities versus shared service accounts: per-workload gives precise audit and least privilege and takes more setup, shared accounts are easy and obscure who did what.", "Short-lived tokens versus long-lived keys: short-lived limits damage from leaks and requires refresh logic and a reliable issuer."],
    p: ["A secret is baked into a job image and survives rotation.", "The identity service becomes a hard dependency of serving, and an outage there blocks all lookups."],
    v: "Rotate a database credential and confirm all dependent jobs and the serving path continue without manual change, and that the old credential no longer works.",
    dep: []
  },
  "configuration-and-deploy": {
    s: "How the platform's own services and per-environment settings are built, versioned, rolled out and rolled back, separately from the feature definitions that run on it.",
    d: "Serving, registry, schedulers and writers are software with releases. They are deployed through pipelines with staged rollouts, health checks and quick rollback. Configuration, such as store endpoints, quotas and defaults, is kept in version control and applied per environment. A release that changes encodings or the registry schema must be compatible with old and new data at once, so rollouts follow a defined order: readers first, writers after.",
    k: ["Canary rollouts versus all-at-once: canaries limit blast radius and take longer, all-at-once is fast and risky for the serving path.", "Configuration in code versus in a dynamic service: in code is reviewable and needs a deploy to change, dynamic changes are instant and harder to audit."],
    p: ["A writer is upgraded to a new row format before the readers, and serving decodes garbage.", "Environment-specific settings are edited by hand and drift from version control."],
    v: "Roll out a serving release to one percent of traffic, compare error rate and latency with the old version, then roll back and confirm responses return to the previous behavior without data changes.",
    dep: ["identity-and-secrets"]
  },
  "metrics-and-tracing": {
    s: "The collection of metrics, logs and traces from every component, used to find where latency goes, why a job failed and whether objectives are being met.",
    d: "Serving emits request rate, error rate and latency percentiles per feature service and per store; jobs emit durations, rows processed and lag; stores emit capacity and compaction state. Traces follow a request through the resolver, store reads and on-demand code, showing which stage consumed the budget. Metrics need labels such as view and project to be useful, and too many distinct label values overwhelm the system. Monitoring of data quality builds on the same pipeline.",
    k: ["High-cardinality labels versus aggregated metrics: per-feature labels allow precise diagnosis and strain the metrics system, aggregates are cheap and hide the culprit.", "Tracing every request versus sampling: all traces explain any incident and cost a lot, sampling is cheap and misses rare slow requests."],
    p: ["Dashboards show the average latency, which hides the tail that models actually experience.", "Metrics from jobs and from serving use different names for the same view, so they cannot be correlated."],
    v: "Inject a delay into one store read and confirm the trace identifies that stage, the latency percentile metric for the service rises, and the alert fires within its detection time.",
    dep: ["identity-and-secrets"]
  },
  "training-serving-consistency": {
    s: "The guarantee that a model sees the same feature definitions, values, defaults and time semantics when it is trained as when it serves, kept by shared code, logging and parity checks.",
    d: "Skew arises from separate implementations, different data sources, different null handling, unit differences and values computed at different times. Defenses stack: one definition executed in every path, point-in-time joins, identical defaults, logged serving features for later training and skew monitors that compare paths. No single mechanism is enough, and it must be a design goal from the start, since retrofitting it onto two diverged codebases is expensive. It touches nearly every component in the plate.",
    k: ["Single implementation versus parity testing of two: a single implementation prevents divergence and constrains engines, two with tests allows specialization and requires constant checking.", "Training on reconstructed features versus on logged features: reconstructed covers history and may diverge from what was served, logged is exact and starts only from logging day."],
    p: ["Consistency is verified once at launch, then a code change in one path breaks it without any signal.", "Defaults and missing-value handling are tested less than values, and are where skew most often appears."],
    v: "For a sample of production requests, compare the logged served features with values recomputed through the training path at the same timestamps; the mismatch rate must stay below the stated tolerance per feature.",
    dep: ["shared-transform-logic", "point-in-time-join", "feature-logging", "skew-detection", "default-and-fallback-values"]
  },
  "time-and-causality": {
    s: "The discipline of tracking, for every value, when the event happened, when it was computed and when it became available, so no model learns from information it would not have had.",
    d: "Three timestamps matter: event time, availability time and request time. Point-in-time joins, TTLs, windows, watermarks and late data handling all depend on using the right one, and mixing them leaks the future or drops valid data. Clocks across systems, time zones, daylight changes and delayed sources all interfere. Correctness here is invisible when wrong: models train fine and look excellent offline, then disappoint in production.",
    k: ["Recording availability time explicitly versus assuming a fixed delay: explicit tracking is accurate and costs a column and discipline, a fixed delay is simple and breaks when pipelines slow.", "Normalizing all times to one zone at ingestion versus keeping local times: normalizing removes a class of errors and loses local context unless stored separately."],
    p: ["A daily aggregate stamped with the start of the day appears available before the day has ended.", "Daylight changes create a repeated or missing hour, and windows double count or skip."],
    v: "Build a dataset around a daylight change and a late-arriving correction, and confirm for every row that all feature availability times are at or before the row timestamp.",
    dep: ["point-in-time-join", "event-time-and-watermarks", "late-data-handling", "leakage-guard"]
  },
  "freshness-versus-cost": {
    s: "The decision, made per feature, of how current values need to be, given that each step from daily to hourly to seconds multiplies compute, storage and operational burden.",
    d: "Freshness is bought with streaming jobs, frequent syncs and fast stores. Many features gain nothing from being minutes old, such as a lifetime total, while others, such as the last few actions, lose most of their value when stale. The platform should make this a visible choice with an estimated price, record the target in the view and measure it. Defaulting to the freshest option for every feature is the most common source of overspending.",
    k: ["Streaming by default versus batch by default: streaming default gives fresh data everywhere and expensive operations, batch default is cheap and requires teams to ask for fresher.", "Per-feature freshness versus per-view: per-feature is exact and fragments views, per-view is simple and gives some features more freshness than they need."],
    p: ["Teams choose real-time because it is possible, and never measure whether the model improves.", "A freshness target is set but never measured, and the pipeline runs hours behind it."],
    v: "For one feature, compare model quality offline when its values are delayed by increasing amounts, and confirm the chosen freshness target sits at the point where more freshness stops helping.",
    dep: ["freshness-slos", "cost-attribution", "stream-transform-engine", "materialization-scheduler"]
  },
  "key-and-schema-evolution": {
    s: "The plan for how entities, identifiers, feature types and table schemas change over years while older models, datasets and stored data keep working.",
    d: "Entities merge, identifiers are reissued, columns widen and meanings change. Each such change touches registry, offline tables, online rows, serving contracts and trained models. Safe practice is additive change, new names for new meanings, versioned encodings and overlap periods where old and new coexist. The cross-cutting danger is a change that is valid for each component separately and wrong in combination, such as a type widening that an old reader decodes differently.",
    k: ["Evolving in place versus parallel old and new: in place is cheap and can break readers, parallel is safe and doubles cost until old consumers are migrated.", "Strict compatibility checks versus trusting authors: strict checks block mistakes and slow necessary changes, trust is fast and fails quietly."],
    p: ["A key format changes upstream and new rows silently stop joining to history.", "Row encoding is upgraded without a compatibility window, and a rollback cannot read the new data."],
    v: "Roll a feature through add, rename and type-widening changes while a pinned old model keeps serving; the old model's inputs must stay identical throughout and the new model must see the new schema.",
    dep: ["schema-evolution", "definition-versioning", "feature-row-layout", "entity-key-mapping"]
  },
  "isolation-and-sharing": {
    s: "The balance between letting many teams reuse each other's features and keeping their changes, data access, costs and failures from affecting one another.",
    d: "Sharing is why a feature store exists and is also its main risk: one team's change breaks another's model, one team's backfill starves another's jobs, restricted data leaks through a shared feature. Mechanisms include projects, ownership and consumer registration, quotas, access policies and versioned contracts. Too much isolation recreates duplicated pipelines per team, and too little produces coupling and incidents.",
    k: ["Central shared catalog versus per-team catalogs: central maximizes reuse and creates coordination cost, per-team is autonomous and duplicates work.", "Shared infrastructure versus per-team stores: shared is efficient and couples failures, separate stores isolate and multiply operations."],
    p: ["A consumer registers nowhere, so its owner is not told when a shared feature is changed.", "A shared feature's owner optimizes for their own model and changes semantics used by others."],
    v: "Have team A change a shared feature, and confirm team B's registered services are flagged before apply, team B's quotas are unaffected by team A's backfill, and an unauthorized team cannot read the feature.",
    dep: ["project-tenancy", "access-control", "usage-tracking", "feature-services"]
  },
  "reproducibility": {
    s: "The ability to rebuild a past training set and explain a past prediction exactly, using recorded definitions, code, source snapshots and logged serving values.",
    d: "Reproducing a model needs the dataset it was trained on. That depends on pinned definitions and code, immutable table snapshots, deterministic transformations and splits, and recorded settings. For explaining a past prediction, it needs the feature values that were actually served, which come from logging. Every component that retains or overwrites history, such as compaction, retention and backfills, interacts with it, which makes it a policy decision that must be set against cost and privacy.",
    k: ["Recording recipes versus storing data: recipes are cheap and break when sources change, stored copies are exact and costly and hold sensitive data.", "Reproducibility versus right to erasure: keeping everything allows exact rebuilds, honoring deletion makes some datasets irreproducible by design."],
    p: ["A model's metadata records the feature service name but not its version or the snapshot, so it cannot be rebuilt.", "Nondeterministic transformations or unseeded sampling make a rebuild close but not identical."],
    v: "Pick a model trained three months ago, rebuild its dataset from the recorded metadata, and confirm the row count and checksum equal the original, or that any difference is explained by a recorded erasure.",
    dep: ["dataset-snapshots", "table-snapshots", "definition-versioning", "feature-logging", "deletion-and-retention-requests"]
  },
});
